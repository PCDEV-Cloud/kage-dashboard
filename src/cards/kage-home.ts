import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { format, languageOf, stringsFor, type Strings } from "../i18n";
import {
  activeMedia,
  brightnessPct,
  controlCount,
  hasControls,
  coverPosition,
  isDimmable,
  isOn,
  roomClimate,
  roomControls,
  roomGlow,
  type CoverControl,
  type CoverKind,
  type GroupControl,
  type RoomControls,
} from "../engine/devices";
import { callService } from "../engine/calls";
import { autoLayout } from "../engine/layout";
import { buildHomeModel, type AreaModel, type FloorModel, type HomeModel } from "../engine/model";
import { findTodos } from "../engine/todos";
import type { FloorEntry, HomeAssistant } from "../types";
import { baseStyles, ensureFonts, neonTokens } from "./styles";

// Ekran „W domu” (telefon, motyw Neon): rzut warstwowy, panel pokoju, sceny.

const PLANE_W = 190;
const PLANE_H = 152;
const LAYER_H = 113;
const SECTION_H = 232;
const MAX_TAGS = 5; // więcej pokoi: etykieta tylko wybranego, wybór z paska pod rzutem

type Expanded = "lights" | "climates" | "media" | `cover:${CoverKind}` | null;

const ICON = {
  bulb: html`<svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 18h6"></path>
    <path d="M10 21h4"></path>
    <path
      d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"
    ></path>
  </svg>`,
  up: html`<svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 15l6-6 6 6"></path>
  </svg>`,
  down: html`<svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6"></path>
  </svg>`,
  left: html`<svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M15 5l-7 7 7 7"></path>
  </svg>`,
  right: html`<svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 5l7 7-7 7"></path>
  </svg>`,
  shield: html`<svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"></path>
  </svg>`,
  x: html`<svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12"></path>
    <path d="M18 6L6 18"></path>
  </svg>`,
  play: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5l11 7-11 7z"></path>
  </svg>`,
  pause: html`<svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <rect x="6" y="5" width="4" height="14"></rect>
    <rect x="14" y="5" width="4" height="14"></rect>
  </svg>`,
  check: html`<svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
  </svg>`,
};

export class KageHomeCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _floorId: { state: true },
    _roomId: { state: true },
    _expanded: { state: true },
    _dismissed: { state: true },
    _sceneFlash: { state: true },
    _fetchedFloors: { state: true },
  };

  hass?: HomeAssistant;
  private _floorId: string | null = null;
  private _roomId: string | null = null;
  private _expanded: Expanded = null;
  private _dismissed: string[] = [];
  private _sceneFlash: string | null = null;
  private _fetchedFloors: FloorEntry[] | null = null;
  private _restored = false;
  private _cache?: { key: unknown[]; model: HomeModel };

  setConfig(): void {}

  getCardSize(): number {
    return 14;
  }

  connectedCallback(): void {
    super.connectedCallback();
    ensureFonts();
  }

  // --- dane ---

  private get _t(): Strings {
    return stringsFor(this.hass!);
  }

  private get _lang(): string {
    return languageOf(this.hass!);
  }

  private _floorEntries(): FloorEntry[] {
    const h = this.hass!;
    if (h.floors) return Object.values(h.floors);
    if (!this._fetchedFloors) {
      this._fetchedFloors = [];
      h.callWS<FloorEntry[]>({ type: "config/floor_registry/list" })
        .then((f) => (this._fetchedFloors = f))
        .catch(() => undefined);
    }
    return this._fetchedFloors;
  }

  private _model(): HomeModel {
    const h = this.hass!;
    const key = [h.entities, h.areas, h.devices, h.floors ?? this._fetchedFloors];
    if (this._cache && key.every((k, i) => k === this._cache!.key[i])) return this._cache.model;
    const model = buildHomeModel(h, this._floorEntries());
    this._cache = { key, model };
    return model;
  }

  private _storageKey(): string {
    return `kage:${this.hass?.user?.id ?? "anon"}:place`;
  }

  private _restore(): void {
    if (this._restored) return;
    this._restored = true;
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (raw) {
        const saved = JSON.parse(raw) as { floor?: string; room?: string };
        this._floorId = saved.floor ?? null;
        this._roomId = saved.room ?? null;
      }
      const d = sessionStorage.getItem("kage:dismissed");
      if (d) this._dismissed = JSON.parse(d) as string[];
    } catch {
      /* prywatne okno lub zablokowany storage: działamy bez pamięci */
    }
  }

  private _persist(): void {
    try {
      localStorage.setItem(
        this._storageKey(),
        JSON.stringify({ floor: this._floorId, room: this._roomId }),
      );
    } catch {
      /* jw. */
    }
  }

  private _bestRoom(floor: FloorModel): AreaModel | null {
    let best: AreaModel | null = null;
    let score = -1;
    for (const area of floor.areas) {
      const c = roomControls(this.hass!, area);
      const s =
        (c.lights ? 3 : 0) +
        (c.covers.length ? 3 : 0) +
        (c.media.length ? 2 : 0) +
        (c.climates.length ? 1 : 0) +
        controlCount(c) / 100;
      if (s > score) {
        score = s;
        best = area;
      }
    }
    return best;
  }

  private _defaultFloor(floors: FloorModel[]): FloorModel | null {
    const withAreas = floors.filter((f) => f.areas.length);
    const pool = withAreas.length ? withAreas : floors;
    return (
      pool.find((f) => f.level === 0 && !f.outdoor) ??
      [...pool].sort((a, b) => Math.abs(a.level) - Math.abs(b.level))[0] ??
      null
    );
  }

  private _call(domain: string, service: string, data: Record<string, unknown>): void {
    if (this.hass) void callService(this.hass, domain, service, data);
  }

  private _goFloor(floor: FloorModel): void {
    this._floorId = floor.id;
    const keep = floor.areas.some((a) => a.id === this._roomId);
    if (!keep) this._roomId = this._bestRoom(floor)?.id ?? null;
    this._expanded = null;
    this._persist();
  }

  private _pickRoom(floor: FloorModel, area: AreaModel): void {
    this._floorId = floor.id;
    this._roomId = area.id;
    this._expanded = null;
    this._persist();
  }

  // --- render ---

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    this._restore();
    const t = this._t;
    const model = this._model();
    const floors = model.levels.flatMap((l) => l.floors);
    if (!floors.length) {
      return html`<div class="screen"><p class="empty">${t.emptyHome}</p></div>`;
    }

    let floor = floors.find((f) => f.id === this._floorId) ?? null;
    if (!floor) {
      const byRoom = floors.find((f) => f.areas.some((a) => a.id === this._roomId));
      floor = byRoom ?? this._defaultFloor(floors)!;
    }
    let room = floor.areas.find((a) => a.id === this._roomId) ?? null;
    if (!room) room = this._bestRoom(floor);

    return html`
      <div class="screen">
        <div class="scan" aria-hidden="true"></div>
        ${this._renderHeader(floor)} ${this._renderTodos()} ${this._renderPlan(model, floor, room)}
        ${floor.areas.length > MAX_TAGS ? this._renderRoomStrip(floor, room) : nothing}
        ${room ? this._renderRoom(room) : nothing} ${this._renderScenes()}
      </div>
    `;
  }

  private _renderHeader(floor: FloorModel): TemplateResult {
    const t = this._t;
    const alarmId = Object.keys(this.hass!.states).find((id) =>
      id.startsWith("alarm_control_panel."),
    );
    let alarm: TemplateResult | typeof nothing = nothing;
    if (alarmId) {
      const st = this.hass!.states[alarmId].state;
      const kind = st.startsWith("armed")
        ? "armed"
        : st === "triggered"
          ? "triggered"
          : st === "arming" || st === "pending"
            ? "arming"
            : "off";
      const label = {
        armed: t.alarmArmed,
        triggered: t.alarmTriggered,
        arming: t.alarmArming,
        off: t.alarmOff,
      }[kind];
      alarm = html`<div class="alarm cut-s mono ${kind}">${ICON.shield}${label}</div>`;
    }
    return html`
      <header class="head rise">
        <div class="ctx mono">
          <span class="here-dot" aria-hidden="true"></span>
          <span>${t.ctxHome}</span>
          <span class="sep">//</span>
          <span class="muted">${floor.name.toLocaleUpperCase(this._lang)}</span>
        </div>
        ${alarm}
      </header>
    `;
  }

  private _renderTodos(): TemplateResult {
    const t = this._t;
    const todos = findTodos(this.hass!).filter((x) => !this._dismissed.includes(x.id));
    const dismiss = (id: string) => {
      this._dismissed = [...this._dismissed, id];
      try {
        sessionStorage.setItem("kage:dismissed", JSON.stringify(this._dismissed));
      } catch {
        /* jw. */
      }
    };
    return html`
      <section class="todos rise" aria-label=${t.nothingToDo}>
        ${todos.length === 0
          ? html`<span class="chip ok cut-s">${ICON.check}${t.nothingToDo}</span>`
          : todos.map((x) => {
              const text =
                x.kind === "problem"
                  ? t.todoProblem
                  : x.value !== null
                    ? format(t.todoBattery, { n: Math.round(x.value) })
                    : t.todoBatteryLow;
              const where = [x.name, x.area].filter(Boolean).join(" · ");
              return html`<span class="chip todo ${x.kind} cut-s">
                <span class="dot" aria-hidden="true"></span>
                <strong>${text}</strong>
                <span class="where mono">${where.toLocaleUpperCase(this._lang)}</span>
                <button
                  class="x"
                  aria-label=${format(t.hide, { x: text })}
                  @click=${() => dismiss(x.id)}
                >
                  ${ICON.x}
                </button>
              </span>`;
            })}
      </section>
    `;
  }

  private _renderPlan(model: HomeModel, floor: FloorModel, room: AreaModel | null): TemplateResult {
    const t = this._t;
    const levels = model.levels;
    const activeLevel = floor.level;
    const activeGroup = levels.find((l) => l.level === activeLevel)!.floors;
    const viewCol = Math.max(0, activeGroup.indexOf(floor));

    const tops = [0];
    for (let k = 1; k < levels.length; k += 1) {
      const touches = levels[k - 1].level === activeLevel || levels[k].level === activeLevel;
      tops.push(tops[k - 1] + (touches ? 78 : 34));
    }
    const offset = Math.round((SECTION_H - (tops[tops.length - 1] + LAYER_H)) / 2);
    const railStep = Math.min(74, (SECTION_H - 12) / levels.length);

    const layers = levels.map((lv, k) => {
      const group = lv.floors;
      const activeLv = lv.level === activeLevel;
      const planes = group.map((f, j) => {
        const d = j - viewCol;
        const isCur = d === 0;
        const rects = autoLayout(f.areas.length, PLANE_W / PLANE_H);
        const glowOn = activeLv && isCur;
        const planeStyle = styleMap({
          "--grid": f.outdoor ? "rgba(61,255,162,.15)" : "rgba(0,229,255,.15)",
          background: f.outdoor ? "rgba(61,255,162,.04)" : "rgba(0,229,255,.035)",
          borderColor: glowOn
            ? f.outdoor
              ? "rgba(61,255,162,.8)"
              : "rgba(0,229,255,.75)"
            : f.outdoor
              ? "rgba(61,255,162,.3)"
              : "rgba(0,229,255,.3)",
          boxShadow: glowOn
            ? f.outdoor
              ? "0 0 30px rgba(61,255,162,.25)"
              : "0 0 30px rgba(0,229,255,.28)"
            : "none",
        });
        const rooms = f.areas.map((a, i) => {
          const r = rects[i];
          const glow = roomGlow(this.hass!, a);
          const sel = activeLv && isCur && room?.id === a.id;
          const alpha = (0.3 + (0.6 * glow) / 100).toFixed(2);
          const edge = sel
            ? "var(--kage-accent)"
            : glow
              ? "rgba(255,190,60,.85)"
              : f.outdoor
                ? "rgba(61,255,162,.4)"
                : "rgba(0,229,255,.35)";
          const style = styleMap({
            left: `${r.x * PLANE_W + 2}px`,
            top: `${r.y * PLANE_H + 2}px`,
            width: `${r.w * PLANE_W - 4}px`,
            height: `${r.h * PLANE_H - 4}px`,
            background: glow
              ? `radial-gradient(circle, rgba(255,205,70,${alpha}), rgba(255,140,0,.25))`
              : f.outdoor
                ? "rgba(20,60,40,.55)"
                : "rgba(10,14,24,.78)",
            boxShadow: glow ? `0 0 ${Math.round(10 + glow / 4)}px rgba(255,170,0,.6)` : "none",
            borderColor: edge,
            "--wall": f.outdoor ? "3px" : "12px",
          });
          const pickable = activeLv && isCur;
          const showTag = pickable && (f.areas.length <= MAX_TAGS || sel);
          return html`<span
            class="room ${pickable ? "pick" : ""}"
            style=${style}
            @click=${pickable ? () => this._pickRoom(f, a) : nothing}
          >
            <span class="wall" style=${styleMap({ borderColor: edge })}></span>
            ${showTag
              ? html`<button
                  class="tag cut-s ${sel ? "sel" : ""}"
                  aria-pressed=${sel ? "true" : "false"}
                  @click=${() => this._pickRoom(f, a)}
                >
                  ${a.name}
                </button>`
              : nothing}
          </span>`;
        });
        return html`<span
          class="slide"
          style=${styleMap({
            transform: `translateX(${d * 212}px) scale(${isCur ? 1 : 0.8})`,
            opacity: isCur ? "1" : "0.5",
            filter: isCur ? "none" : "blur(2px)",
          })}
        >
          <span class="plane" style=${planeStyle}>${rooms}</span>
        </span>`;
      });

      return html`<div
        class="layer"
        style=${styleMap({
          top: `${offset + tops[k]}px`,
          zIndex: String(activeLv ? 10 : levels.length - k),
        })}
      >
        <span
          class="layer-body"
          style=${styleMap({
            filter: activeLv ? "none" : "blur(2px) saturate(.8)",
            opacity: activeLv ? "1" : "0.7",
            transform: `scale(${activeLv ? 1 : 0.93})`,
          })}
          >${planes}</span
        >
      </div>`;
    });

    const rail = levels.map((lv, k) => {
      const group = lv.floors;
      const activeLv = lv.level === activeLevel;
      const cur = activeLv ? floor : (group[viewCol] ?? group[0]);
      const lit = cur.areas.filter((a) => roomGlow(this.hass!, a) > 0).length;
      const top = SECTION_H - 6 - (levels.length - k) * railStep + 12;
      return html`<button
        class="floor-card cut-s ctl ${activeLv ? "active" : ""} ${cur.outdoor ? "outdoor" : ""}"
        style=${styleMap({ top: `${top}px` })}
        aria-pressed=${activeLv ? "true" : "false"}
        @click=${() => this._goFloor(cur)}
      >
        <span class="fname mono">${cur.name.toLocaleUpperCase(this._lang)}</span>
        <span class="fmeta">
          <span class="badge cut-s mono ${lit ? "lit" : ""}">${lit}</span>
          <span class="flabel mono">${t.floorLit}</span>
        </span>
      </button>`;
    });

    let side: TemplateResult | typeof nothing = nothing;
    if (activeGroup.length > 1) {
      const next = activeGroup[(viewCol + 1) % activeGroup.length];
      const nextIdx = activeGroup.indexOf(next);
      side = html`<button
        class="side cut-s ctl mono"
        aria-label=${format(t.moveTo, { x: next.name })}
        @click=${() => this._goFloor(next)}
      >
        ${nextIdx < viewCol ? ICON.left : nothing} ${next.name.toLocaleUpperCase(this._lang)}
        ${nextIdx > viewCol ? html`<span class="nudge">${ICON.right}</span>` : nothing}
      </button>`;
    }

    return html`<section class="plan" style=${styleMap({ height: `${SECTION_H}px` })}>
      ${layers} ${rail} ${side}
    </section>`;
  }

  protected updated(): void {
    // Wybrany pokój w pasku zawsze widoczny (pasek przewija się w poziomie).
    const strip = this.renderRoot.querySelector<HTMLElement>(".room-strip");
    const sel = strip?.querySelector<HTMLElement>(".room-chip.sel");
    if (!strip || !sel) return;
    const left = sel.offsetLeft - strip.offsetLeft;
    const right = left + sel.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
    }
  }

  private _renderRoomStrip(floor: FloorModel, room: AreaModel | null): TemplateResult {
    return html`<nav class="room-strip" aria-label=${floor.name}>
      ${floor.areas.map((a) => {
        const sel = a.id === room?.id;
        const lit = roomGlow(this.hass!, a) > 0;
        return html`<button
          class="room-chip cut-s ctl ${sel ? "sel" : ""} ${lit ? "lit" : ""}"
          aria-pressed=${sel ? "true" : "false"}
          @click=${() => this._pickRoom(floor, a)}
        >
          ${lit ? html`<span class="lit-dot" aria-hidden="true"></span>` : nothing}${a.name}
        </button>`;
      })}
    </nav>`;
  }

  private _fmtTemp(v: number): string {
    return (
      new Intl.NumberFormat(this._lang, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(v) + "°"
    );
  }

  private _name(id: string, area: AreaModel): string {
    const raw = this.hass!.states[id]?.attributes.friendly_name;
    let name = typeof raw === "string" ? raw : id;
    if (name.toLowerCase().startsWith(area.name.toLowerCase() + " ")) {
      name = name.slice(area.name.length + 1);
    }
    return name;
  }

  private _roomName: string | null = null;

  private _renderRoom(area: AreaModel): TemplateResult {
    this._roomName = area.name;
    const t = this._t;
    const h = this.hass!;
    const c = roomControls(h, area);
    const { temperature, humidity } = roomClimate(h, area);
    const meta = [
      humidity !== null ? format(t.humidity, { n: Math.round(humidity) }) : null,
      roomGlow(h, area) > 0 ? t.lightOn : null,
    ]
      .filter(Boolean)
      .join(" // ");

    let body: TemplateResult;
    if (this._expanded) {
      body = this._renderList(area, c, this._expanded);
    } else if (!hasControls(c)) {
      body = html`<div class="empty-room">
        <span>${t.nothingToControl}</span>
        <span class="mono small">${t.sensorsInBackground}</span>
      </div>`;
    } else {
      body = html`<div class="tiles">
        ${c.lights ? this._lightTile(area, c.lights) : nothing}
        ${c.covers.filter((g) => g.kind !== "screen").map((g) => this._coverTile(area, g))}
        ${c.climates.length ? this._climateTile(c.climates) : nothing}
        ${c.media.length ? this._mediaTile(c.media) : nothing}
        ${c.covers.filter((g) => g.kind === "screen").map((g) => this._coverTile(area, g))}
      </div>`;
    }

    return html`<section class="panel glass cut-m rise" aria-label=${area.name}>
      <div class="panel-head">
        <div>
          <div class="room-name">${area.name}</div>
          ${meta ? html`<div class="meta mono">${meta}</div>` : nothing}
        </div>
        ${temperature !== null
          ? html`<div class="reading mono">${this._fmtTemp(temperature)}</div>`
          : nothing}
      </div>
      ${body}
    </section>`;
  }

  private _listButton(kind: Exclude<Expanded, null>, count: number): TemplateResult {
    return html`<button
      class="more mono"
      aria-label=${this._t.showList}
      @click=${(e: Event) => {
        e.stopPropagation();
        this._expanded = kind;
      }}
    >
      ${count} ${ICON.right}
    </button>`;
  }

  private _lightTile(area: AreaModel, g: GroupControl): TemplateResult {
    const t = this._t;
    const h = this.hass!;
    const ids = g.members;
    const onCount = ids.filter((id) => isOn(h, id)).length;
    const anyOn = onCount > 0 || (!!g.all && isOn(h, g.all));
    const sliderTarget = g.all ?? (ids.length === 1 ? ids[0] : null);
    const dimmable = !!sliderTarget && isDimmable(h, sliderTarget);
    const bri = sliderTarget ? brightnessPct(h, sliderTarget) : 0;
    const multi = ids.length > 1;
    const state = multi
      ? format(t.lightsSome, { on: onCount, total: ids.length })
      : anyOn
        ? `${t.stateOn}${dimmable ? ` · ${bri}%` : ""}`
        : t.stateOff;
    const toggle = () =>
      this._call("light", anyOn ? "turn_off" : "turn_on", { entity_id: g.all ?? ids });
    return html`<div class="tile cut-s ${anyOn ? "light-on" : ""}">
      <div class="tile-head">
        <button
          class="toggle"
          aria-pressed=${anyOn ? "true" : "false"}
          aria-label=${`${t.light}: ${anyOn ? t.stateOn : t.stateOff}`}
          @click=${toggle}
        >
          <span class="ico">${ICON.bulb}</span>
          <span class="tt">
            <span class="name">${multi ? t.allLights : this._name(ids[0], area) || t.light}</span>
            <span class="st mono">${state}</span>
          </span>
        </button>
        ${multi ? this._listButton("lights", ids.length) : nothing}
      </div>
      ${dimmable
        ? html`<input
            class="slider"
            type="range"
            min="1"
            max="100"
            .value=${String(bri || 50)}
            aria-label=${t.brightness}
            style=${styleMap({
              background: `linear-gradient(90deg, ${anyOn ? "var(--kage-light)" : "#5a6475"} ${bri}%, rgba(255,255,255,.1) ${bri}%)`,
            })}
            @change=${(e: Event) =>
              this._call("light", "turn_on", {
                entity_id: sliderTarget,
                brightness_pct: Number((e.target as HTMLInputElement).value),
              })}
          />`
        : html`<span class="spacer"></span>`}
    </div>`;
  }

  // Podpis kafla: rodzaj osłon; pojedyncza osłona (np. ekran) nazwą z HA.
  private _coverLabel(area: AreaModel, g: CoverControl): string {
    if (g.members.length === 1 && !g.all)
      return this._name(g.members[0]!, area) || this._t.covers[g.kind];
    return this._t.covers[g.kind];
  }

  private _coverTile(area: AreaModel, g: CoverControl): TemplateResult {
    const label = this._coverLabel(area, g);
    const variant = g.kind === "screen" ? "screen" : "";
    const t = this._t;
    const h = this.hass!;
    const ids = g.members;
    const target = g.all ?? ids;
    const pos = g.all
      ? coverPosition(h, g.all)
      : Math.round(ids.reduce((s, id) => s + coverPosition(h, id), 0) / ids.length);
    const state = pos === 0 ? t.closed : pos === 100 ? t.open : format(t.openPct, { n: pos });
    return html`<div class="tile cut-s blind ${variant}">
      <div class="tile-head">
        <span class="tt">
          <span class="name">${label}</span>
          <span class="st mono">${state}</span>
        </span>
        <span class="row">
          <button
            class="sq cut-s ctl"
            aria-label=${t.openAll}
            @click=${() => this._call("cover", "open_cover", { entity_id: target })}
          >
            ${ICON.up}
          </button>
          <button
            class="sq cut-s ctl"
            aria-label=${t.closeAll}
            @click=${() => this._call("cover", "close_cover", { entity_id: target })}
          >
            ${ICON.down}
          </button>
        </span>
      </div>
      <div class="row bar-row">
        <div class="bar"><i style=${styleMap({ width: `${pos}%` })}></i></div>
        ${ids.length > 1 ? this._listButton(`cover:${g.kind}`, ids.length) : nothing}
      </div>
    </div>`;
  }

  private _climateControl(id: string) {
    const h = this.hass!;
    const s = h.states[id];
    const target = typeof s?.attributes.temperature === "number" ? s.attributes.temperature : null;
    const current =
      typeof s?.attributes.current_temperature === "number"
        ? s.attributes.current_temperature
        : null;
    const step =
      typeof s?.attributes.target_temp_step === "number" ? s.attributes.target_temp_step : 0.5;
    const heating = s?.attributes.hvac_action === "heating";
    const set = (v: number) =>
      this._call("climate", "set_temperature", { entity_id: id, temperature: v });
    return { target, current, step, heating, set };
  }

  private _climateTitle(id: string): string {
    const name = this.hass!.states[id]?.attributes.friendly_name;
    const area = this._roomName;
    return typeof name === "string" && area && name.toLowerCase() !== area.toLowerCase()
      ? name
      : this._t.heating;
  }

  private _climateTile(ids: string[]): TemplateResult {
    const t = this._t;
    const c = this._climateControl(ids[0]);
    const now = c.current !== null ? this._fmtTemp(c.current) : "—";
    return html`<div class="tile cut-s clim">
      <div class="tile-head">
        <span class="tt">
          <span class="name ellipsis">${this._climateTitle(ids[0])}</span>
          <span class="st mono ${c.heating ? "warm" : ""}"
            >${format(c.heating ? t.heatingNow : t.holdingNow, { t: now })}</span
          >
        </span>
        ${ids.length > 1 ? this._listButton("climates", ids.length) : nothing}
      </div>
      ${c.target !== null
        ? html`<div class="row between">
            <button
              class="sq cut-s ctl"
              aria-label=${t.lowerTemp}
              @click=${() => c.set(c.target! - c.step)}
            >
              −
            </button>
            <span class="target mono">${this._fmtTemp(c.target)}</span>
            <button
              class="sq cut-s ctl"
              aria-label=${t.raiseTemp}
              @click=${() => c.set(c.target! + c.step)}
            >
              +
            </button>
          </div>`
        : html`<span class="spacer"></span>`}
    </div>`;
  }

  private _mediaTile(ids: string[]): TemplateResult {
    const t = this._t;
    const h = this.hass!;
    const id = activeMedia(h, ids)!;
    const s = h.states[id];
    const playing = s?.state === "playing";
    const title =
      (typeof s?.attributes.media_title === "string" && s.attributes.media_title) ||
      (playing ? String(s?.attributes.friendly_name ?? "") : t.nothingPlaying);
    const sub = [s?.attributes.media_artist, s?.attributes.friendly_name]
      .filter((x) => typeof x === "string" && x)
      .join(" · ");
    return html`<div class="tile cut-s media ${playing ? "playing" : ""}">
      <div class="tile-head">
        <span class="tt">
          <span class="name ellipsis">${title}</span>
          <span class="st mono ellipsis">${sub.toLocaleUpperCase(this._lang)}</span>
        </span>
        ${ids.length > 1 ? this._listButton("media", ids.length) : nothing}
      </div>
      <div class="row between">
        <span class="eq ${playing ? "" : "paused"}" aria-hidden="true"
          ><i></i><i></i><i></i><i></i
        ></span>
        <button
          class="play cut-s ctl"
          aria-label=${playing ? t.pause : t.play}
          @click=${() => this._call("media_player", "media_play_pause", { entity_id: id })}
        >
          ${playing ? ICON.pause : ICON.play}
        </button>
      </div>
    </div>`;
  }

  private _renderList(
    area: AreaModel,
    c: RoomControls,
    kind: Exclude<Expanded, null>,
  ): TemplateResult {
    const t = this._t;
    const h = this.hass!;
    const coverGroup = kind.startsWith("cover:")
      ? c.covers.find((g) => `cover:${g.kind}` === kind)
      : undefined;
    const title = coverGroup
      ? this._coverLabel(area, coverGroup)
      : { lights: t.light, climates: t.heating, media: t.music }[
          kind as "lights" | "climates" | "media"
        ];
    let rows: TemplateResult[] = [];
    if (kind === "lights" && c.lights) {
      rows = c.lights.members.map((id) => {
        const on = isOn(h, id);
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          <button
            class="pill cut-s ctl ${on ? "on" : ""}"
            aria-pressed=${on ? "true" : "false"}
            @click=${() => this._call("light", "toggle", { entity_id: id })}
          >
            ${on ? t.stateOn : t.stateOff}
          </button>
        </div>`;
      });
    } else if (coverGroup) {
      rows = coverGroup.members.map((id) => {
        const p = coverPosition(h, id);
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          <span class="mono small"
            >${p === 0 ? t.closed : p === 100 ? t.open : format(t.openPct, { n: p })}</span
          >
          <span class="row">
            <button
              class="sq cut-s ctl"
              aria-label=${t.openAll}
              @click=${() => this._call("cover", "open_cover", { entity_id: id })}
            >
              ${ICON.up}
            </button>
            <button
              class="sq cut-s ctl"
              aria-label=${t.closeAll}
              @click=${() => this._call("cover", "close_cover", { entity_id: id })}
            >
              ${ICON.down}
            </button>
          </span>
        </div>`;
      });
    } else if (kind === "climates") {
      rows = c.climates.map((id) => {
        const cc = this._climateControl(id);
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          ${cc.target !== null
            ? html`<span class="row clim">
                <button
                  class="sq cut-s ctl"
                  aria-label=${t.lowerTemp}
                  @click=${() => cc.set(cc.target! - cc.step)}
                >
                  −
                </button>
                <span class="target mono">${this._fmtTemp(cc.target)}</span>
                <button
                  class="sq cut-s ctl"
                  aria-label=${t.raiseTemp}
                  @click=${() => cc.set(cc.target! + cc.step)}
                >
                  +
                </button>
              </span>`
            : html`<span class="mono small">${h.states[id]?.state ?? ""}</span>`}
        </div>`;
      });
    } else if (kind === "media") {
      rows = c.media.map((id) => {
        const playing = h.states[id]?.state === "playing";
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          <button
            class="play cut-s ctl"
            aria-label=${playing ? t.pause : t.play}
            @click=${() => this._call("media_player", "media_play_pause", { entity_id: id })}
          >
            ${playing ? ICON.pause : ICON.play}
          </button>
        </div>`;
      });
    }
    return html`<div class="list">
      <button class="back mono" @click=${() => (this._expanded = null)}>
        ${ICON.left} ${t.back} <span class="sep">//</span> ${title.toLocaleUpperCase(this._lang)}
      </button>
      ${rows}
    </div>`;
  }

  private _renderScenes(): TemplateResult | typeof nothing {
    const h = this.hass!;
    const scenes = Object.values(h.states)
      .filter((s) => s.entity_id.startsWith("scene.") && s.state !== "unavailable")
      .filter((s) => !h.entities[s.entity_id]?.hidden)
      .sort((a, b) =>
        String(a.attributes.friendly_name ?? a.entity_id).localeCompare(
          String(b.attributes.friendly_name ?? b.entity_id),
        ),
      );
    if (!scenes.length) return nothing;
    return html`<section class="scenes rise" aria-label=${this._t.scenes}>
      ${scenes.map((s) => {
        const active = this._sceneFlash === s.entity_id;
        return html`<button
          class="scene cut-s ctl ${active ? "active" : ""}"
          @click=${() => {
            this._call("scene", "turn_on", { entity_id: s.entity_id });
            this._sceneFlash = s.entity_id;
            setTimeout(() => {
              if (this._sceneFlash === s.entity_id) this._sceneFlash = null;
            }, 1500);
          }}
        >
          ${String(s.attributes.friendly_name ?? s.entity_id)}
        </button>`;
      })}
    </section>`;
  }

  static styles = [
    neonTokens,
    baseStyles,
    css`
      :host {
        display: block;
        min-height: calc(100vh - var(--header-height, 56px));
        background-color: var(--kage-ground);
        background-image:
          repeating-linear-gradient(
            0deg,
            rgba(255, 255, 255, 0.028) 0px,
            rgba(255, 255, 255, 0.028) 1px,
            transparent 1px,
            transparent 3px
          ),
          radial-gradient(420px 320px at 0% 0%, rgba(255, 179, 0, 0.14), transparent 70%),
          radial-gradient(460px 380px at 100% 40%, rgba(0, 229, 255, 0.13), transparent 70%),
          radial-gradient(380px 300px at 20% 100%, rgba(120, 60, 255, 0.18), transparent 70%);
        color: var(--kage-ink);
        font-family: var(--kage-font-ui);
      }
      .screen {
        position: relative;
        max-width: 480px;
        margin: 0 auto;
        padding-bottom: 24px;
        overflow: hidden;
        min-height: inherit;
      }
      .scan {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 120px;
        pointer-events: none;
        background: linear-gradient(180deg, transparent, rgba(0, 229, 255, 0.05), transparent);
        animation: kage-scan 7s linear infinite;
      }
      .empty {
        padding: 24px;
        color: var(--kage-ink-muted);
      }
      .muted {
        color: var(--kage-ink-muted);
      }
      .sep {
        color: #6e7a8f;
      }
      .small {
        font-size: 10.5px;
        color: var(--kage-ink-dim);
      }

      .head {
        position: relative;
        padding: 20px 20px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ctx {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11.5px;
        letter-spacing: 0.12em;
        min-width: 0;
      }
      .here-dot {
        width: 8px;
        height: 8px;
        flex: none;
        border-radius: 50%;
        background: var(--kage-accent);
        animation: kage-here 1.6s ease-out infinite;
      }
      .alarm {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px;
        font-size: 11px;
        letter-spacing: 0.1em;
        border: 1px solid rgba(159, 176, 198, 0.35);
        color: var(--kage-ink-muted);
        white-space: nowrap;
      }
      .alarm.armed {
        border-color: rgba(61, 255, 162, 0.6);
        color: var(--kage-ok);
      }
      .alarm.arming {
        border-color: rgba(255, 179, 0, 0.6);
        color: var(--kage-warn);
      }
      .alarm.triggered {
        border-color: var(--kage-crit);
        color: var(--kage-crit);
      }

      .todos {
        position: relative;
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 12px 16px 0;
        scrollbar-width: none;
      }
      .chip {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        height: 34px;
        padding: 0 12px;
        font-size: 13px;
        white-space: nowrap;
      }
      .chip.ok {
        border: 1px solid rgba(61, 255, 162, 0.35);
        background: rgba(61, 255, 162, 0.07);
        color: #d9ffec;
      }
      .chip.ok svg {
        color: var(--kage-ok);
      }
      .chip.todo {
        padding-right: 4px;
        border: 1px solid rgba(255, 179, 0, 0.45);
        background: rgba(40, 28, 6, 0.5);
      }
      .chip.todo.problem {
        border-color: rgba(255, 59, 92, 0.5);
        background: rgba(60, 8, 20, 0.5);
      }
      .chip .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--kage-warn);
        box-shadow: 0 0 8px var(--kage-warn);
      }
      .chip.problem .dot {
        background: var(--kage-crit);
        box-shadow: 0 0 8px var(--kage-crit);
      }
      .chip .where {
        font-size: 10.5px;
        color: var(--kage-ink-dim);
      }
      .chip .x {
        width: 28px;
        height: 28px;
        border: 0;
        background: transparent;
        color: var(--kage-ink-dim);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .plan {
        position: relative;
        margin-top: 6px;
      }
      .layer {
        position: absolute;
        left: 0;
        right: 0;
        height: ${LAYER_H}px;
        pointer-events: none;
        transition: top 0.6s cubic-bezier(0.34, 1.3, 0.64, 1);
      }
      .layer-body {
        position: absolute;
        left: 16px;
        right: 16px;
        top: 0;
        bottom: 0;
        display: block;
        transition:
          filter 0.5s ease,
          opacity 0.5s ease,
          transform 0.6s cubic-bezier(0.34, 1.3, 0.64, 1);
      }
      .slide {
        position: absolute;
        inset: 0;
        display: block;
        perspective: 900px;
        transition:
          transform 0.65s cubic-bezier(0.34, 1.2, 0.64, 1),
          opacity 0.5s ease,
          filter 0.5s ease;
      }
      .plane {
        position: absolute;
        left: calc(50% - ${PLANE_W / 2 - 40}px);
        top: -20px;
        width: ${PLANE_W}px;
        height: ${PLANE_H}px;
        display: block;
        transform-style: preserve-3d;
        transform: rotateX(62deg) rotateZ(-42deg);
        border: 1px solid;
        background-image:
          repeating-linear-gradient(
            0deg,
            var(--grid) 0px,
            var(--grid) 1px,
            transparent 1px,
            transparent 12px
          ),
          repeating-linear-gradient(
            90deg,
            var(--grid) 0px,
            var(--grid) 1px,
            transparent 1px,
            transparent 12px
          );
      }
      .room {
        position: absolute;
        display: block;
        transform-style: preserve-3d;
        border: 1.2px solid;
        transition:
          background 0.5s ease,
          box-shadow 0.5s ease,
          border-color 0.35s ease;
      }
      .room.pick {
        pointer-events: auto;
        cursor: pointer;
      }
      .room-strip {
        position: relative;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 10px 16px 0;
        scrollbar-width: none;
      }
      .room-chip {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 11px;
        border: 1px solid rgba(0, 229, 255, 0.25);
        background: rgba(6, 8, 14, 0.7);
        color: var(--kage-ink);
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
      }
      .room-chip.sel {
        background: var(--kage-accent);
        border-color: var(--kage-accent);
        color: var(--kage-on-accent);
      }
      .lit-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--kage-light);
        box-shadow: 0 0 8px var(--kage-light);
      }
      .wall {
        position: absolute;
        display: block;
        inset: -1.2px;
        border: 1.2px solid;
        transform: translateZ(var(--wall));
      }
      .tag {
        pointer-events: auto;
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) translateZ(24px) rotateZ(42deg) rotateX(-62deg);
        padding: 4px 8px;
        white-space: nowrap;
        background: rgba(6, 8, 14, 0.86);
        border: 1px solid rgba(0, 229, 255, 0.3);
        font-size: 11px;
        font-weight: 600;
        color: var(--kage-ink);
      }
      .tag.sel {
        background: var(--kage-accent);
        border-color: var(--kage-accent);
        color: var(--kage-on-accent);
      }
      .floor-card {
        position: absolute;
        left: 12px;
        width: 108px;
        height: 62px;
        z-index: 20;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 6px;
        text-align: left;
        border: 1px solid rgba(0, 229, 255, 0.18);
        background: rgba(6, 8, 14, 0.6);
        color: var(--kage-ink);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .floor-card.active {
        border-color: rgba(0, 229, 255, 0.8);
        background: rgba(0, 229, 255, 0.12);
      }
      .floor-card.active.outdoor {
        border-color: rgba(61, 255, 162, 0.8);
        background: rgba(61, 255, 162, 0.12);
      }
      .fname {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        color: var(--kage-ink-muted);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .floor-card.active .fname {
        color: var(--kage-accent);
        text-shadow: 0 0 10px rgba(0, 229, 255, 0.6);
      }
      .floor-card.active.outdoor .fname {
        color: var(--kage-outdoor);
      }
      .fmeta {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .badge {
        min-width: 22px;
        height: 20px;
        padding: 0 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11.5px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.07);
        color: var(--kage-ink-dim);
      }
      .badge.lit {
        background: var(--kage-light);
        color: var(--kage-on-light);
      }
      .flabel {
        font-size: 10px;
        color: var(--kage-ink-dim);
      }
      .side {
        position: absolute;
        right: 12px;
        bottom: 0;
        z-index: 20;
        height: 32px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid rgba(0, 229, 255, 0.4);
        background: rgba(6, 8, 14, 0.85);
        color: var(--kage-ink);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .nudge {
        display: flex;
        animation: kage-nudge 1.8s ease-in-out infinite;
      }

      .panel {
        position: relative;
        margin: 8px 16px 0;
        padding: 14px;
      }
      .panel-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .room-name {
        font-size: 21px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .meta {
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--kage-ink-dim);
        margin-top: 3px;
      }
      .reading {
        font-size: 26px;
        font-weight: 500;
        color: var(--kage-accent);
        text-shadow: 0 0 12px rgba(0, 229, 255, 0.55);
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }
      .tile {
        min-height: 86px;
        padding: 9px 10px 10px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
        border: 1px solid rgba(0, 229, 255, 0.18);
        background: rgba(255, 255, 255, 0.03);
        transition: all 0.35s ease;
      }
      .tile.light-on {
        border-color: rgba(255, 179, 0, 0.7);
        background: rgba(255, 179, 0, 0.1);
        box-shadow: 0 0 22px rgba(255, 179, 0, 0.25);
      }
      .tile.blind {
        border-color: rgba(0, 229, 255, 0.3);
        background: rgba(0, 229, 255, 0.05);
      }
      .tile.blind.screen {
        border-color: rgba(255, 43, 214, 0.35);
        background: rgba(255, 43, 214, 0.04);
      }
      .tile.blind.screen .bar i {
        background: var(--kage-scene, #ff2bd6);
      }
      .tile.clim {
        border-color: rgba(61, 255, 162, 0.35);
        background: rgba(61, 255, 162, 0.05);
      }
      .tile.media {
        border-color: rgba(255, 43, 214, 0.45);
        background: rgba(255, 43, 214, 0.07);
      }
      .tile.media.playing {
        box-shadow: 0 0 22px rgba(255, 43, 214, 0.2);
      }
      .tile-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 6px;
        min-width: 0;
      }
      .toggle {
        border: 0;
        background: transparent;
        padding: 0;
        color: var(--kage-ink);
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        min-width: 0;
        flex: 1;
      }
      .ico {
        width: 30px;
        height: 30px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.06);
        color: #c9d6e6;
        transition: all 0.3s ease;
      }
      .light-on .ico {
        background: var(--kage-light);
        color: var(--kage-on-light);
      }
      .tt {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .name {
        font-size: 13.5px;
        font-weight: 600;
      }
      .ellipsis {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .st {
        font-size: 10.5px;
        color: var(--kage-ink-dim);
      }
      .light-on .st,
      .st.warm {
        color: #ffc24a;
      }
      .more {
        flex: none;
        display: flex;
        align-items: center;
        gap: 2px;
        height: 24px;
        padding: 0 6px;
        border: 1px solid rgba(159, 176, 198, 0.35);
        background: transparent;
        color: var(--kage-ink-muted);
        font-size: 11px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .row.between {
        justify-content: space-between;
      }
      .sq {
        width: 34px;
        height: 30px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(0, 229, 255, 0.4);
        background: rgba(0, 229, 255, 0.08);
        color: var(--kage-accent);
        font-size: 18px;
        font-weight: 600;
      }
      .clim .sq {
        border-color: rgba(61, 255, 162, 0.45);
        background: rgba(61, 255, 162, 0.08);
        color: var(--kage-climate);
      }
      .target {
        font-size: 19px;
        font-weight: 500;
        color: var(--kage-climate);
        text-shadow: 0 0 10px rgba(61, 255, 162, 0.5);
      }
      .bar-row {
        gap: 8px;
      }
      .bar-row .bar {
        flex: 1;
      }
      .bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 6px;
        background: var(--kage-accent);
        box-shadow: 0 0 10px rgba(0, 229, 255, 0.7);
        transition: width 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        margin: 0;
        border-radius: 0;
        outline: none;
        cursor: pointer;
      }
      .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        background: #f3f6fa;
        border: 2px solid var(--kage-light);
        box-shadow: 0 0 10px rgba(255, 179, 0, 0.7);
        transform: rotate(45deg);
      }
      .slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #f3f6fa;
        border: 2px solid var(--kage-light);
        border-radius: 0;
        transform: rotate(45deg);
      }
      .spacer {
        height: 6px;
      }
      .eq {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 18px;
      }
      .eq i {
        width: 3px;
        height: 18px;
        background: var(--kage-scene);
        transform-origin: 50% 100%;
        animation: kage-eq 1s ease-in-out infinite;
      }
      .eq i:nth-child(2) {
        animation-delay: 0.2s;
      }
      .eq i:nth-child(3) {
        animation-delay: 0.4s;
      }
      .eq i:nth-child(4) {
        animation-delay: 0.1s;
      }
      .eq.paused i {
        animation-play-state: paused;
      }
      .play {
        width: 38px;
        height: 32px;
        padding: 0;
        border: 0;
        background: var(--kage-scene);
        color: var(--kage-on-scene);
        box-shadow: 0 0 16px rgba(255, 43, 214, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
      }
      .empty-room {
        height: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--kage-ink-dim);
        font-size: 14px;
        text-align: center;
      }

      .list {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
      }
      .back {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 4px;
        border: 0;
        background: transparent;
        color: var(--kage-accent);
        font-size: 11px;
        letter-spacing: 0.1em;
      }
      .lrow {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        border-top: 1px solid rgba(0, 229, 255, 0.12);
      }
      .lname {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pill {
        min-width: 54px;
        height: 30px;
        padding: 0 10px;
        border: 1px solid rgba(159, 176, 198, 0.35);
        background: transparent;
        color: var(--kage-ink-muted);
        font-family: var(--kage-font-mono);
        font-size: 11px;
        font-weight: 700;
      }
      .pill.on {
        background: var(--kage-light);
        border-color: var(--kage-light);
        color: var(--kage-on-light);
        box-shadow: 0 0 14px rgba(255, 179, 0, 0.4);
      }

      .scenes {
        position: relative;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: calc((100% - 24px) / 4);
        gap: 8px;
        margin: 10px 16px 0;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .scene {
        height: 44px;
        padding: 0 6px;
        border: 1px solid rgba(255, 43, 214, 0.35);
        background: var(--kage-surface);
        color: var(--kage-ink);
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .scene.active {
        background: var(--kage-scene);
        border-color: var(--kage-scene);
        color: var(--kage-on-scene);
        box-shadow: 0 0 22px rgba(255, 43, 214, 0.5);
      }
    `,
  ];
}

if (!customElements.get("kage-home-card")) {
  customElements.define("kage-home-card", KageHomeCard);
}
