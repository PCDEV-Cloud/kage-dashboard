import { LitElement, css, html, nothing, svg, type TemplateResult } from "lit";
import { format, type Strings } from "../i18n";
import type { FloorModel } from "../engine/model";
import {
  DEFAULT_ROOF,
  ROOF_PITCH_MAX,
  ROOF_PITCH_MIN,
  SIDES,
  groupSides,
  bbox,
  centroid,
  clampPt,
  freeSpot,
  insertVertex,
  lShape,
  moveBy,
  rect,
  removeVertex,
  roomIsStairs,
  stairLines,
  dashedAfterInsert,
  dashedAfterRemove,
  toggleDashed,
  resolvePlan,
  roofLines,
  writeFloor,
  type PlanConfig,
  type Pt,
  type ResolvedRoom,
  type Ridge,
  type Roof,
  type RoofType,
  type ResolvedPlan,
  type Side,
} from "../engine/plan";
import { baseStyles, neonTokens } from "./styles";

// Edytor rzutu dla administratora (układ szeroki). Pracuje na kopiach pięter i zwraca
// gotową konfigurację `plan:` w zdarzeniu `plan-save`; zapis robi karta.

type Work = Omit<ResolvedPlan, "auto" | "unplaced">;
type Sel = { kind: "room"; id: string } | { kind: "void"; index: number } | null;
type Drag = { mode: "move"; start: Pt; orig: Pt[] } | { mode: "vertex"; index: number } | null;

export class KagePlanEditor extends LitElement {
  static properties = {
    floors: { attribute: false },
    plan: { attribute: false },
    strings: { attribute: false },
    floorId: { attribute: false },
    saving: { attribute: false },
    error: { attribute: false },
    _work: { state: true },
    _sel: { state: true },
    _vertex: { state: true },
    _edge: { state: true },
  };

  floors: FloorModel[] = [];
  plan: PlanConfig | undefined;
  strings!: Strings;
  floorId = "";
  saving = false;
  error = "";
  // Kopie robocze pięter zmienionych w tej sesji edytora (null = przywróć układ automatyczny).
  private _work: Record<string, Work | null> = {};
  private _sel: Sel = null;
  private _vertex: number | null = null;
  private _edge: number | null = null; // wybrana krawędź pokoju (do linii przerywanej)
  private _drag: Drag = null;

  private get _floor(): FloorModel {
    return this.floors.find((f) => f.id === this.floorId) ?? this.floors[0]!;
  }

  private _current(): Work {
    const f = this._floor;
    const w = this._work[f.id];
    if (w) return w;
    const r = resolvePlan(this.plan, f);
    return {
      cols: r.cols,
      rows: r.rows,
      outdoor: r.outdoor,
      side: r.side,
      roof: r.roof,
      rooms: r.rooms,
      voids: r.voids,
      voidStairs: r.voidStairs,
    };
  }

  private _set(next: Work): void {
    this._work = { ...this._work, [this._floor.id]: next };
  }

  private _unplaced(w: Work): string[] {
    const placed = new Set(w.rooms.map((r) => r.id));
    return this._floor.areas.map((a) => a.id).filter((id) => !placed.has(id));
  }

  private _selPoints(w: Work): Pt[] | null {
    if (!this._sel) return null;
    if (this._sel.kind === "room") {
      const id = this._sel.id;
      return w.rooms.find((r) => r.id === id)?.points ?? null;
    }
    return w.voids[this._sel.index] ?? null;
  }

  private _setSelPoints(w: Work, pts: Pt[]): void {
    const sel = this._sel;
    if (!sel) return;
    if (sel.kind === "room") {
      this._set({ ...w, rooms: w.rooms.map((r) => (r.id === sel.id ? { ...r, points: pts } : r)) });
    } else {
      this._set({ ...w, voids: w.voids.map((v, i) => (i === sel.index ? pts : v)) });
    }
  }

  private _selRoom(w: Work): ResolvedRoom | null {
    const sel = this._sel;
    return sel?.kind === "room" ? (w.rooms.find((r) => r.id === sel.id) ?? null) : null;
  }

  // Zmiana wielokąta wybranego pokoju razem z numerami krawędzi przerywanych.
  private _setSelRoom(w: Work, pts: Pt[], dashed: number[] | undefined): void {
    const sel = this._sel;
    if (sel?.kind !== "room") return this._setSelPoints(w, pts);
    this._set({
      ...w,
      rooms: w.rooms.map((r) =>
        r.id === sel.id
          ? {
              id: r.id,
              points: pts,
              ...(dashed?.length ? { dashed } : {}),
              ...(typeof r.stairs === "boolean" ? { stairs: r.stairs } : {}),
            }
          : r,
      ),
    });
  }

  // Schody: pokój (jawnie zapisane, domyślnie z nazwy) albo pusty obszar.
  private _selStairs(w: Work, names: Map<string, string>): boolean {
    const sel = this._sel;
    if (sel?.kind === "void") return w.voidStairs.includes(sel.index);
    const r = this._selRoom(w);
    return r ? roomIsStairs(r, names.get(r.id) ?? "") : false;
  }

  private _setStairs(on: boolean): void {
    const w = this._current();
    const sel = this._sel;
    if (sel?.kind === "void") {
      const rest = w.voidStairs.filter((i) => i !== sel.index);
      this._set({ ...w, voidStairs: on ? [...rest, sel.index].sort((a, b) => a - b) : rest });
    } else if (sel?.kind === "room") {
      this._set({
        ...w,
        rooms: w.rooms.map((r) => (r.id === sel.id ? { ...r, stairs: on } : r)),
      });
    }
  }

  private _toggleDashed(): void {
    const w = this._current();
    const r = this._selRoom(w);
    if (!r || this._edge === null) return;
    this._setSelRoom(w, r.points, toggleDashed(r.dashed, this._edge));
  }

  // --- wskaźnik ---

  private _toGrid(e: PointerEvent): Pt {
    const svgEl = this.renderRoot.querySelector<SVGSVGElement>("svg.canvas")!;
    const m = svgEl.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  private _startMove(e: PointerEvent, sel: Sel): void {
    e.stopPropagation();
    this._sel = sel;
    this._vertex = null;
    this._edge = null;
    const pts = this._selPoints(this._current());
    if (!pts) return;
    this._drag = { mode: "move", start: this._toGrid(e), orig: pts };
    (e.currentTarget as Element).closest("svg")?.setPointerCapture(e.pointerId);
  }

  private _startVertex(e: PointerEvent, index: number): void {
    e.stopPropagation();
    this._vertex = index;
    this._edge = null;
    this._drag = { mode: "vertex", index };
    (e.currentTarget as Element).closest("svg")?.setPointerCapture(e.pointerId);
  }

  private _addVertex(e: PointerEvent, after: number): void {
    e.stopPropagation();
    const w = this._current();
    const pts = this._selPoints(w);
    if (!pts) return;
    const r = this._selRoom(w);
    this._setSelRoom(
      w,
      insertVertex(pts, after),
      r ? dashedAfterInsert(r.dashed, after) : undefined,
    );
    this._edge = null;
    this._startVertex(e, after + 1);
  }

  private _onMove(e: PointerEvent): void {
    const d = this._drag;
    if (!d) return;
    const w = this._current();
    const g = this._toGrid(e);
    if (d.mode === "move") {
      this._setSelPoints(w, moveBy(d.orig, g[0] - d.start[0], g[1] - d.start[1], w.cols, w.rows));
    } else {
      const pts = this._selPoints(w);
      if (!pts) return;
      const p = clampPt(g, w.cols, w.rows);
      this._setSelPoints(
        w,
        pts.map((q, i) => (i === d.index ? p : q)),
      );
    }
  }

  private _onUp(): void {
    this._drag = null;
  }

  private _onKey(e: KeyboardEvent): void {
    const step: Record<string, Pt> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const v = step[e.key];
    const w = this._current();
    const pts = this._selPoints(w);
    if (!v || !pts) return;
    e.preventDefault();
    this._setSelPoints(w, moveBy(pts, v[0], v[1], w.cols, w.rows));
  }

  // --- akcje ---

  private _place(id: string): void {
    const w = this._current();
    const taken = [...w.rooms.map((r) => r.points), ...w.voids];
    this._set({ ...w, rooms: [...w.rooms, { id, points: freeSpot(taken, w.cols, w.rows) }] });
    this._sel = { kind: "room", id };
    this._vertex = null;
  }

  private _shape(kind: "rect" | "l"): void {
    const w = this._current();
    const pts = this._selPoints(w);
    if (!pts) return;
    const b = bbox(pts);
    this._setSelRoom(
      w,
      kind === "rect" ? rect(b.x, b.y, b.w, b.h) : lShape(b.x, b.y, b.w, b.h),
      [],
    );
    this._vertex = null;
    this._edge = null;
  }

  private _removeCorner(): void {
    const w = this._current();
    const pts = this._selPoints(w);
    if (!pts || this._vertex === null || pts.length <= 3) return;
    const r = this._selRoom(w);
    this._setSelRoom(
      w,
      removeVertex(pts, this._vertex),
      r ? dashedAfterRemove(r.dashed, this._vertex, pts.length) : undefined,
    );
    this._vertex = null;
    this._edge = null;
  }

  private _removeSel(): void {
    const w = this._current();
    const sel = this._sel;
    if (!sel) return;
    if (sel.kind === "room") this._set({ ...w, rooms: w.rooms.filter((r) => r.id !== sel.id) });
    else
      this._set({
        ...w,
        voids: w.voids.filter((_, i) => i !== sel.index),
        voidStairs: w.voidStairs
          .filter((i) => i !== sel.index)
          .map((i) => (i > sel.index ? i - 1 : i)),
      });
    this._sel = null;
    this._vertex = null;
  }

  private _addVoid(): void {
    const w = this._current();
    const taken = [...w.rooms.map((r) => r.points), ...w.voids];
    const voids = [...w.voids, freeSpot(taken, w.cols, w.rows, 6, 4)];
    this._set({ ...w, voids });
    this._sel = { kind: "void", index: voids.length - 1 };
  }

  private _grid(cols: number, rows: number): void {
    const w = this._current();
    const c = Math.min(40, Math.max(4, Math.round(cols) || w.cols));
    const r = Math.min(40, Math.max(4, Math.round(rows) || w.rows));
    const fit = (pts: Pt[]) => pts.map((p) => clampPt(p, c, r));
    this._set({
      ...w,
      cols: c,
      rows: r,
      rooms: w.rooms.map((x) => ({ ...x, points: fit(x.points) })),
      voids: w.voids.map(fit),
    });
  }

  private _resetAuto(): void {
    this._work = { ...this._work, [this._floor.id]: null };
    const r = resolvePlan(writeFloor(this.plan, this._floor.id, null), this._floor);
    this._set({
      cols: r.cols,
      rows: r.rows,
      outdoor: r.outdoor,
      side: r.side,
      roof: r.roof,
      rooms: r.rooms,
      voids: [],
      voidStairs: [],
    });
    this._sel = null;
  }

  private _save(): void {
    let plan = this.plan;
    for (const [id, w] of Object.entries(this._work)) plan = writeFloor(plan, id, w);
    this.dispatchEvent(new CustomEvent("plan-save", { detail: plan ?? {} }));
  }

  private _cancel(): void {
    this.dispatchEvent(new CustomEvent("plan-cancel"));
  }

  private _pickFloor(id: string): void {
    this.floorId = id;
    this._sel = null;
    this._vertex = null;
    this.dispatchEvent(new CustomEvent("plan-floor", { detail: id }));
  }

  private _roofFields(w: Work, roof: Roof): TemplateResult {
    const t = this.strings;
    const set = (patch: Partial<Roof>) => this._set({ ...w, roof: { ...roof, ...patch } });
    return html`<label class="field">
        <span>${t.roofType}</span>
        <select
          @change=${(e: Event) => set({ type: (e.target as HTMLSelectElement).value as RoofType })}
        >
          <option value="gable" ?selected=${roof.type === "gable"}>${t.roofGable}</option>
          <option value="hip" ?selected=${roof.type === "hip"}>${t.roofHip}</option>
        </select>
      </label>
      <label class="field">
        <span>${t.ridge}</span>
        <select
          @change=${(e: Event) => set({ ridge: (e.target as HTMLSelectElement).value as Ridge })}
        >
          <option value="x" ?selected=${roof.ridge === "x"}>${t.ridgeX}</option>
          <option value="y" ?selected=${roof.ridge === "y"}>${t.ridgeY}</option>
        </select>
      </label>
      <label class="field">
        <span>${t.pitch}</span>
        <input
          type="number"
          min=${ROOF_PITCH_MIN}
          max=${ROOF_PITCH_MAX}
          step="5"
          .value=${String(roof.pitch)}
          @change=${(e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            set({ pitch: Math.min(ROOF_PITCH_MAX, Math.max(ROOF_PITCH_MIN, Math.round(v) || 30)) });
          }}
        />
        °
      </label>`;
  }

  // Siatka 3 × 3: gdzie leży ta strefa względem pozostałych na tym poziomie.
  // Kratki zajęte przez inne strefy pokazują ich nazwy.
  private _sidePicker(w: Work, sameLevel: FloorModel[]): TemplateResult {
    const t = this.strings;
    const f = this._floor;
    const sides = groupSides(
      sameLevel.map((x) =>
        x.id === f.id ? w.side : (this._work[x.id]?.side ?? resolvePlan(this.plan, x).side),
      ),
    );
    const mine = sides[sameLevel.indexOf(f)];
    const others = new Map<Side, string>();
    sameLevel.forEach((x, i) => {
      if (x.id !== f.id) others.set(sides[i]!, x.name);
    });
    return html`<div class="field col">
      <span>${t.sideLabel}</span>
      <div class="side-grid" role="radiogroup" aria-label=${t.sideLabel}>
        ${SIDES.map(
          (s) =>
            html`<button
              class="cell cut-s ${s === mine ? "on" : ""} ${others.has(s) ? "taken" : ""}"
              role="radio"
              aria-checked=${s === mine ? "true" : "false"}
              aria-label=${t.side[s]}
              title=${others.get(s) ?? t.side[s]}
              @click=${() => this._set({ ...w, side: s })}
            >
              ${s === mine ? f.name : (others.get(s) ?? "")}
            </button>`,
        )}
      </div>
    </div>`;
  }

  // --- widok ---

  protected render(): TemplateResult {
    const t = this.strings;
    const f = this._floor;
    const w = this._current();
    const names = new Map(f.areas.map((a) => [a.id, a.name]));
    const selPts = this._selPoints(w);
    const sameLevel = this.floors.filter((x) => x.level === f.level);
    // Rozmieszczenie stref poziomu: gdy na poziomie jest więcej niż jedna strefa.
    const hasSide = sameLevel.length > 1;
    const outdoor = w.outdoor ?? f.outdoor;
    const accent = outdoor ? "#3dffa2" : "#00e5ff";
    const selRoom = this._selRoom(w);

    const canvas = svg`<svg
      class="canvas"
      viewBox=${`-1 -1 ${w.cols + 2} ${w.rows + 2}`}
      tabindex="0"
      aria-label=${f.name}
      @pointermove=${(e: PointerEvent) => this._onMove(e)}
      @pointerup=${() => this._onUp()}
      @pointercancel=${() => this._onUp()}
      @pointerdown=${() => {
        this._sel = null;
        this._vertex = null;
      }}
      @keydown=${(e: KeyboardEvent) => this._onKey(e)}
    >
      <defs>
        <pattern id="g" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="rgba(0,229,255,.14)" stroke-width="0.04"></path>
        </pattern>
      </defs>
      <rect x="0" y="0" width=${w.cols} height=${w.rows} fill="url(#g)" stroke=${accent} stroke-width="0.06"></rect>
      ${
        w.roof
          ? roofLines(w.cols, w.rows, w.roof).map(
              ([a, b]) =>
                svg`<line class="roofline" x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]}></line>`,
            )
          : nothing
      }
      ${w.voids.map((v, i) => {
        const sel = this._sel?.kind === "void" && this._sel.index === i;
        const [cx, cy] = centroid(v);
        return svg`<polygon
            class="void ${sel ? "sel" : ""}"
            points=${v.map((p) => p.join(",")).join(" ")}
            @pointerdown=${(e: PointerEvent) => this._startMove(e, { kind: "void", index: i })}
          ></polygon>
          <text class="lbl dim" x=${cx} y=${cy}>${format(t.voidN, { n: i + 1 })}</text>`;
      })}
      ${w.rooms.map((r) => {
        const sel = this._sel?.kind === "room" && this._sel.id === r.id;
        return svg`<polygon
          class="room ${sel ? "sel" : ""}"
          points=${r.points.map((p) => p.join(",")).join(" ")}
          @pointerdown=${(e: PointerEvent) => this._startMove(e, { kind: "room", id: r.id })}
        ></polygon>`;
      })}
      ${
        // Krawędzie po wszystkich wypełnieniach: najpierw przerywane, potem ciągłe, żeby
        // ściana sąsiedniego pokoju zawsze była widoczna na wierzchu.
        [true, false].map((pass) =>
          w.rooms.map((r) => {
            const sel = this._sel?.kind === "room" && this._sel.id === r.id;
            const dashed = new Set(r.dashed ?? []);
            return r.points.map((p, i) => {
              if (dashed.has(i) !== pass) return nothing;
              const q = r.points[(i + 1) % r.points.length]!;
              return svg`<line
                class="edge ${sel ? "sel" : ""} ${pass ? "dashed" : ""} ${sel && this._edge === i ? "on" : ""}"
                x1=${p[0]} y1=${p[1]} x2=${q[0]} y2=${q[1]}
              ></line>`;
            });
          }),
        )
      }
      ${[
        ...w.rooms.filter((r) => roomIsStairs(r, names.get(r.id) ?? "")).map((r) => r.points),
        ...w.voidStairs.map((i) => w.voids[i]).filter((v): v is Pt[] => !!v),
      ].map((pts, k) => {
        const id = `st-${k}`;
        return svg`<clipPath id=${id}><polygon points=${pts.map((p) => p.join(",")).join(" ")}></polygon></clipPath>
          <g class="stairs" clip-path=${`url(#${id})`}>
            ${stairLines(pts).map(([a, b]) => svg`<line x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]}></line>`)}
          </g>`;
      })}
      ${w.rooms.map((r) => {
        const [cx, cy] = centroid(r.points);
        return svg`<text class="lbl" x=${cx} y=${cy}>${names.get(r.id) ?? r.id}</text>`;
      })}
      ${
        selRoom
          ? selRoom.points.map((p, i) => {
              const q = selRoom.points[(i + 1) % selRoom.points.length]!;
              return svg`<line
                class="edge-hit"
                x1=${p[0]} y1=${p[1]} x2=${q[0]} y2=${q[1]}
                @pointerdown=${(e: PointerEvent) => {
                  e.stopPropagation();
                  this._edge = i;
                  this._vertex = null;
                }}
              ></line>`;
            })
          : nothing
      }
      ${
        selPts
          ? svg`${selPts.map((p, i) => {
              const q = selPts[(i + 1) % selPts.length]!;
              return svg`<g
              class="mid"
              @pointerdown=${(e: PointerEvent) => this._addVertex(e, i)}
            >
              <circle cx=${(p[0] + q[0]) / 2} cy=${(p[1] + q[1]) / 2} r="0.32"></circle>
              <path d=${`M${(p[0] + q[0]) / 2 - 0.16} ${(p[1] + q[1]) / 2}h0.32M${(p[0] + q[0]) / 2} ${(p[1] + q[1]) / 2 - 0.16}v0.32`}></path>
            </g>`;
            })}
          ${selPts.map(
            (p, i) => svg`<circle
              class="corner ${this._vertex === i ? "on" : ""}"
              cx=${p[0]}
              cy=${p[1]}
              r="0.38"
              @pointerdown=${(e: PointerEvent) => this._startVertex(e, i)}
            ></circle>`,
          )}`
          : nothing
      }
    </svg>`;

    const unplaced = this._unplaced(w);
    return html`<div class="ed">
      <div class="stage glass cut-m">${canvas}</div>
      <aside class="side">
        <div class="floors" role="group" aria-label=${t.editPlan}>
          ${this.floors.map(
            (x) =>
              html`<button
                class="chip cut-s ctl ${x.id === f.id ? "on" : ""}"
                aria-pressed=${x.id === f.id ? "true" : "false"}
                @click=${() => this._pickFloor(x.id)}
              >
                ${x.name}
              </button>`,
          )}
        </div>
        <p class="hint">${t.editorHint}</p>

        <section class="box glass cut-m">
          <h3 class="mono">${t.showRooms}</h3>
          ${f.areas.map((a) => {
            const placed = !unplaced.includes(a.id);
            const sel = this._sel?.kind === "room" && this._sel.id === a.id;
            return html`<div class="row ${sel ? "sel" : ""}">
              <button
                class="name"
                ?disabled=${!placed}
                @click=${() => {
                  this._sel = { kind: "room", id: a.id };
                  this._vertex = null;
                }}
              >
                ${a.name} ${placed ? nothing : html`<span class="mono muted">${t.notPlaced}</span>`}
              </button>
              ${placed
                ? nothing
                : html`<button class="act cut-s ctl" @click=${() => this._place(a.id)}>
                    ${t.place}
                  </button>`}
            </div>`;
          })}
        </section>

        ${this._sel
          ? html`<section class="box glass cut-m">
              <h3 class="mono">
                ${this._sel.kind === "room"
                  ? (names.get(this._sel.id) ?? "")
                  : format(t.voidN, { n: this._sel.index + 1 })}
              </h3>
              <div class="btns">
                <button class="act cut-s ctl" @click=${() => this._shape("rect")}>
                  ${t.shapeRect}
                </button>
                <button class="act cut-s ctl" @click=${() => this._shape("l")}>${t.shapeL}</button>
                <button
                  class="act cut-s ctl"
                  ?disabled=${this._vertex === null || (selPts?.length ?? 0) <= 3}
                  @click=${() => this._removeCorner()}
                >
                  ${t.removeCorner}
                </button>
                ${this._sel.kind === "room"
                  ? html`<button
                      class="act cut-s ctl"
                      ?disabled=${this._edge === null}
                      aria-pressed=${selRoom?.dashed?.includes(this._edge ?? -1) ? "true" : "false"}
                      @click=${() => this._toggleDashed()}
                    >
                      ${t.dashedEdge}
                    </button>`
                  : nothing}
                <button class="act ghost cut-s ctl" @click=${() => this._removeSel()}>
                  ${this._sel.kind === "room" ? t.removeFromPlan : t.remove}
                </button>
              </div>
              <label class="field check stairs-opt">
                <input
                  type="checkbox"
                  .checked=${this._selStairs(w, names)}
                  @change=${(e: Event) => this._setStairs((e.target as HTMLInputElement).checked)}
                />
                <span>${t.stairs}</span>
              </label>
              ${this._sel.kind === "room" ? html`<p class="hint small">${t.edgeHint}</p>` : nothing}
            </section>`
          : nothing}

        <section class="box glass cut-m">
          <h3 class="mono">${t.voids}</h3>
          <button class="act cut-s ctl" @click=${() => this._addVoid()}>${t.addVoid}</button>
        </section>

        <section class="box glass cut-m">
          <h3 class="mono">${f.name}</h3>
          <label class="field">
            <span>${t.gridSize}</span>
            <input
              type="number"
              min="4"
              max="40"
              .value=${String(w.cols)}
              @change=${(e: Event) =>
                this._grid(Number((e.target as HTMLInputElement).value), w.rows)}
            />
            ×
            <input
              type="number"
              min="4"
              max="40"
              .value=${String(w.rows)}
              @change=${(e: Event) =>
                this._grid(w.cols, Number((e.target as HTMLInputElement).value))}
            />
          </label>
          ${hasSide ? this._sidePicker(w, sameLevel) : nothing}
          <label class="field check">
            <input
              type="checkbox"
              .checked=${outdoor}
              @change=${(e: Event) =>
                this._set({ ...w, outdoor: (e.target as HTMLInputElement).checked })}
            />
            <span>${t.outdoorFloor}</span>
          </label>
          <label class="field check">
            <input
              type="checkbox"
              .checked=${!!w.roof}
              @change=${(e: Event) =>
                this._set({
                  ...w,
                  roof: (e.target as HTMLInputElement).checked ? { ...DEFAULT_ROOF } : null,
                })}
            />
            <span>${t.roof}</span>
          </label>
          ${w.roof ? this._roofFields(w, w.roof) : nothing}
          <button class="act ghost cut-s ctl" @click=${() => this._resetAuto()}>
            ${t.resetAuto}
          </button>
        </section>

        ${this.error
          ? html`<p class="err">${format(t.saveFailed, { e: this.error })}</p>`
          : nothing}
        <div class="foot">
          <button class="act ghost cut-s ctl" @click=${() => this._cancel()}>${t.cancel}</button>
          <button
            class="act primary cut-s ctl"
            ?disabled=${this.saving}
            @click=${() => this._save()}
          >
            ${this.saving ? t.saving : t.save}
          </button>
        </div>
      </aside>
    </div>`;
  }

  static styles = [
    neonTokens,
    baseStyles,
    css`
      :host {
        display: block;
        height: 100%;
        color: var(--kage-ink);
        font-family: var(--kage-font-ui);
      }
      .ed {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 16px;
        height: 100%;
      }
      .stage {
        position: relative;
        min-height: 0;
        padding: 16px;
        border: 1px solid var(--kage-line);
        display: flex;
      }
      .canvas {
        flex: 1;
        width: 100%;
        height: 100%;
        touch-action: none;
        user-select: none;
        outline: none;
      }
      .room {
        fill: rgba(0, 229, 255, 0.08);
        stroke: rgba(0, 229, 255, 0.55);
        stroke-width: 0.08;
        cursor: move;
      }
      .room.sel {
        fill: rgba(0, 229, 255, 0.2);
        stroke: var(--kage-accent);
        stroke-width: 0.12;
      }
      .room,
      .room.sel {
        stroke: none;
      }
      .edge {
        stroke: rgba(0, 229, 255, 0.55);
        stroke-width: 0.08;
        pointer-events: none;
      }
      .edge.sel {
        stroke: var(--kage-accent);
        stroke-width: 0.12;
      }
      .edge.dashed {
        stroke-dasharray: 0.3 0.2;
        stroke: rgba(159, 176, 198, 0.6);
      }
      .edge.on {
        stroke: #ffb300;
        stroke-width: 0.2;
      }
      .edge-hit {
        stroke: transparent;
        stroke-width: 0.6;
        cursor: pointer;
      }
      .hint.small {
        margin-top: 8px;
        font-size: 12px;
      }
      .void {
        fill: rgba(159, 176, 198, 0.06);
        stroke: rgba(159, 176, 198, 0.45);
        stroke-width: 0.06;
        stroke-dasharray: 0.3 0.2;
        cursor: move;
      }
      .void.sel {
        stroke: var(--kage-ink);
      }
      .lbl {
        font: 600 0.55px var(--kage-font-ui);
        fill: var(--kage-ink);
        text-anchor: middle;
        dominant-baseline: middle;
        pointer-events: none;
      }
      .lbl.dim {
        fill: var(--kage-ink-dim);
      }
      .stairs-opt {
        margin: 10px 0 0;
      }
      .stairs line {
        stroke: rgba(0, 229, 255, 0.45);
        stroke-width: 0.05;
        pointer-events: none;
      }
      .roofline {
        stroke: rgba(255, 179, 0, 0.6);
        stroke-width: 0.07;
        stroke-dasharray: 0.3 0.2;
        pointer-events: none;
      }
      .corner {
        fill: #05060a;
        stroke: var(--kage-accent);
        stroke-width: 0.08;
        cursor: grab;
      }
      .corner.on {
        fill: var(--kage-accent);
      }
      .mid {
        cursor: copy;
      }
      .mid circle {
        fill: rgba(5, 6, 10, 0.85);
        stroke: rgba(0, 229, 255, 0.5);
        stroke-width: 0.05;
      }
      .mid path {
        stroke: var(--kage-accent);
        stroke-width: 0.06;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow-y: auto;
        min-height: 0;
        scrollbar-width: thin;
      }
      .floors {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        padding: 7px 12px;
        border: 1px solid rgba(0, 229, 255, 0.3);
        background: rgba(6, 8, 14, 0.7);
        color: var(--kage-ink);
        font: 600 13px var(--kage-font-ui);
        cursor: pointer;
      }
      .chip.on {
        background: var(--kage-accent);
        color: var(--kage-on-accent);
      }
      .hint {
        margin: 0;
        font-size: 13px;
        line-height: 1.4;
        color: var(--kage-ink-muted);
      }
      .box {
        padding: 12px;
        border: 1px solid var(--kage-line);
      }
      h3 {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--kage-ink-dim);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        border-top: 1px solid rgba(0, 229, 255, 0.1);
      }
      .row:first-of-type {
        border-top: 0;
      }
      .row.sel .name {
        color: var(--kage-accent);
      }
      .name {
        flex: 1;
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 6px 0;
        border: 0;
        background: transparent;
        color: var(--kage-ink);
        font: 500 15px var(--kage-font-ui);
        text-align: left;
        cursor: pointer;
      }
      .name:disabled {
        cursor: default;
        color: var(--kage-ink-muted);
      }
      .muted {
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--kage-ink-dim);
      }
      .btns {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .act {
        height: 34px;
        padding: 0 12px;
        border: 1px solid rgba(0, 229, 255, 0.45);
        background: rgba(0, 229, 255, 0.1);
        color: var(--kage-accent);
        font: 600 13px var(--kage-font-ui);
        cursor: pointer;
      }
      .act:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .act.primary {
        background: var(--kage-accent);
        color: var(--kage-on-accent);
      }
      .act.ghost {
        border-color: rgba(159, 176, 198, 0.35);
        background: transparent;
        color: var(--kage-ink-muted);
      }
      .field {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 14px;
      }
      .field > span {
        flex: 1;
        color: var(--kage-ink-muted);
      }
      .field.check > span {
        color: var(--kage-ink);
      }
      input[type="number"],
      select {
        width: 64px;
        height: 32px;
        padding: 0 6px;
        border: 1px solid rgba(0, 229, 255, 0.35);
        background: rgba(6, 8, 14, 0.8);
        color: var(--kage-ink);
        font: 500 14px var(--kage-font-mono);
      }
      select {
        width: auto;
        font-family: var(--kage-font-ui);
      }
      .field.col {
        flex-direction: column;
        align-items: stretch;
      }
      .side-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
      }
      .cell {
        height: 40px;
        padding: 0 4px;
        border: 1px dashed rgba(0, 229, 255, 0.3);
        background: rgba(6, 8, 14, 0.6);
        color: var(--kage-ink-dim);
        font: 500 11px var(--kage-font-ui);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
      }
      .cell.taken {
        border-style: solid;
        color: var(--kage-ink-muted);
      }
      .cell.on {
        border: 1px solid var(--kage-accent);
        background: rgba(0, 229, 255, 0.18);
        color: var(--kage-ink);
      }
      .err {
        margin: 0;
        color: var(--kage-crit);
        font-size: 13px;
      }
      .foot {
        position: sticky;
        bottom: 0;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: auto;
        padding: 10px 0 2px;
        background: linear-gradient(transparent, var(--kage-ground) 30%);
      }
    `,
  ];
}

if (!customElements.get("kage-plan-editor")) {
  customElements.define("kage-plan-editor", KagePlanEditor);
}
