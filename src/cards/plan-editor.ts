import { LitElement, css, html, nothing, svg, type TemplateResult } from "lit";
import { format, type Strings } from "../i18n";
import type { FloorModel } from "../engine/model";
import {
  SIDES,
  bbox,
  centroid,
  clampPt,
  freeSpot,
  insertVertex,
  lShape,
  moveBy,
  rect,
  removeVertex,
  resolvePlan,
  writeFloor,
  type PlanConfig,
  type Pt,
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
      side: r.side,
      roof: r.roof,
      rooms: r.rooms,
      voids: r.voids,
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
    const pts = this._selPoints(this._current());
    if (!pts) return;
    this._drag = { mode: "move", start: this._toGrid(e), orig: pts };
    (e.currentTarget as Element).closest("svg")?.setPointerCapture(e.pointerId);
  }

  private _startVertex(e: PointerEvent, index: number): void {
    e.stopPropagation();
    this._vertex = index;
    this._drag = { mode: "vertex", index };
    (e.currentTarget as Element).closest("svg")?.setPointerCapture(e.pointerId);
  }

  private _addVertex(e: PointerEvent, after: number): void {
    e.stopPropagation();
    const w = this._current();
    const pts = this._selPoints(w);
    if (!pts) return;
    this._setSelPoints(w, insertVertex(pts, after));
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
    this._setSelPoints(w, kind === "rect" ? rect(b.x, b.y, b.w, b.h) : lShape(b.x, b.y, b.w, b.h));
    this._vertex = null;
  }

  private _removeCorner(): void {
    const w = this._current();
    const pts = this._selPoints(w);
    if (!pts || this._vertex === null) return;
    this._setSelPoints(w, removeVertex(pts, this._vertex));
    this._vertex = null;
  }

  private _removeSel(): void {
    const w = this._current();
    const sel = this._sel;
    if (!sel) return;
    if (sel.kind === "room") this._set({ ...w, rooms: w.rooms.filter((r) => r.id !== sel.id) });
    else this._set({ ...w, voids: w.voids.filter((_, i) => i !== sel.index) });
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
      side: r.side,
      roof: r.roof,
      rooms: r.rooms,
      voids: [],
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

  // --- widok ---

  protected render(): TemplateResult {
    const t = this.strings;
    const f = this._floor;
    const w = this._current();
    const names = new Map(f.areas.map((a) => [a.id, a.name]));
    const selPts = this._selPoints(w);
    const sameLevel = this.floors.filter((x) => x.level === f.level);
    const hasSide = sameLevel.indexOf(f) > 0;
    const accent = f.outdoor ? "#3dffa2" : "#00e5ff";

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
        const [cx, cy] = centroid(r.points);
        return svg`<polygon
            class="room ${sel ? "sel" : ""}"
            points=${r.points.map((p) => p.join(",")).join(" ")}
            @pointerdown=${(e: PointerEvent) => this._startMove(e, { kind: "room", id: r.id })}
          ></polygon>
          <text class="lbl" x=${cx} y=${cy}>${names.get(r.id) ?? r.id}</text>`;
      })}
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
                <button class="act ghost cut-s ctl" @click=${() => this._removeSel()}>
                  ${this._sel.kind === "room" ? t.removeFromPlan : t.remove}
                </button>
              </div>
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
          ${hasSide
            ? html`<label class="field">
                <span>${t.sideLabel}</span>
                <select
                  @change=${(e: Event) =>
                    this._set({ ...w, side: (e.target as HTMLSelectElement).value as Side })}
                >
                  ${SIDES.map(
                    (s) => html`<option value=${s} ?selected=${w.side === s}>${t.side[s]}</option>`,
                  )}
                </select>
              </label>`
            : nothing}
          <label class="field check">
            <input
              type="checkbox"
              .checked=${w.roof}
              @change=${(e: Event) =>
                this._set({ ...w, roof: (e.target as HTMLInputElement).checked })}
            />
            <span>${t.roof}</span>
          </label>
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
