import { LitElement, css, html, nothing, svg, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { format, languageOf, plural, stringsFor, type Strings } from "../i18n";
import {
  activeMedia,
  brightnessPct,
  canSetPosition,
  canStop,
  climateIsOff,
  climatePower,
  controlCount,
  hasControls,
  coverPosition,
  isDimmable,
  isOn,
  mediaCaps,
  roomClimate,
  roomControls,
  roomGlow,
  type CoverControl,
  type CoverKind,
  type GroupControl,
  type RoomControls,
} from "../engine/devices";
import { callService } from "../engine/calls";
import {
  findIssues,
  secureSteps,
  visibleAlarm,
  worstSeverity,
  type Issue,
  type IssueAction,
  type SecureStep,
} from "../engine/issues";
import {
  centroid,
  resolvePlan,
  type PlanConfig,
  type ResolvedPlan,
  type Roof,
  type Side,
} from "../engine/plan";
import { contextFor, contextOverride, peopleHome, type Context } from "../engine/presence";
import { buildHomeModel, type AreaModel, type FloorModel, type HomeModel } from "../engine/model";
import { findTodos } from "../engine/todos";
import type { FloorEntry, HomeAssistant } from "../types";
import { dashboardPath, savePlan } from "../engine/persist";
import { baseStyles, ensureFonts, neonTokens } from "./styles";
import "./plan-editor";

// Ekran „W domu” (telefon, motyw Neon): rzut warstwowy, panel pokoju, sceny.

const PLANE_W = 190;
// Przesunięcie płaszczyzny strefy z tego samego poziomu względem budynku (piksele ekranu).
const SIDE_OFFSET: Record<Side, [number, number]> = {
  right: [212, 0],
  left: [-212, 0],
  front: [-150, 64],
  back: [150, -64],
};
const PLANE_H = 152;
const LAYER_H = 113;
const SECTION_H = 232;
const MAX_TAGS = 5; // więcej pokoi: etykieta tylko wybranego, wybór z paska pod rzutem

type Expanded = "lights" | "climates" | "media" | `cover:${CoverKind}` | null;

// Przytrzymanie dla akcji fizycznych (brama, furtka, zawór wody).
const HOLD_MS = 1100;

// Układ szeroki (tablet, laptop): od tej szerokości karty dwie kolumny.
const WIDE_MIN = 900;
const PHONE_W = 390;
const MAX_ZOOM = 1.6;
const HEAD_H = 64; // nagłówek KAGE w układzie szerokim
const STRIP_H = 60; // pasek pokoi pod rzutem
const MIN_WIDE_BODY = 520;

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
  stop: html`<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" fill="currentColor"></rect>
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
  reset: html`<svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 12a8 8 0 1 0 2.5-5.8"></path>
    <path d="M4 4v4h4"></path>
  </svg>`,
  pencil: html`<svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 20h4L19 9l-4-4L4 16z"></path>
  </svg>`,
  alert: html`<svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l9.5 17h-19z"></path>
    <path d="M12 10v4.5M12 17.5v.01"></path>
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
  power: html`<svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M12 3v8"></path>
    <path d="M6.3 7.2a8 8 0 1 0 11.4 0"></path>
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

// Połacie dachu nad płaszczyzną piętra (w pikselach płaszczyzny). Każda połać jest
// zawieszona na swojej krawędzi i podniesiona o kąt spadku; w czterospadowym połacie są
// trapezami i trójkątami, które spotykają się w narożach i na kalenicy.
interface RoofFace {
  style: Record<string, string>;
  w: number;
  h: number;
  points: string; // wielokąt połaci we własnych współrzędnych (px)
}

function roofFaces(w: number, h: number, roof: Roof): RoofFace[] {
  const p = roof.pitch;
  const k = 1 / Math.cos((p * Math.PI) / 180);
  const alongX = roof.ridge === "x";
  const along = alongX ? w : h;
  const half = (alongX ? h : w) / 2;
  const inset = roof.type === "hip" ? Math.min(half, along / 2) : 0;
  const s = half * k; // długość połaci od okapu do kalenicy
  const t = inset * k; // długość połaci szczytowej (czterospadowy)
  const pts = (list: number[][]) =>
    list.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  const face = (
    pos: Record<string, string>,
    fw: number,
    fh: number,
    origin: string,
    transform: string,
    points: number[][],
  ): RoofFace => ({
    style: { ...pos, width: `${fw}px`, height: `${fh}px`, transformOrigin: origin, transform },
    w: fw,
    h: fh,
    points: pts(points),
  });
  const faces: RoofFace[] = [];
  if (alongX) {
    faces.push(
      face({ left: "0", top: "0" }, w, s, "top", `rotateX(${p}deg)`, [
        [0, 0],
        [w, 0],
        [w - inset, s],
        [inset, s],
      ]),
      face({ left: "0", bottom: "0" }, w, s, "bottom", `rotateX(${-p}deg)`, [
        [inset, 0],
        [w - inset, 0],
        [w, s],
        [0, s],
      ]),
    );
    if (inset > 0)
      faces.push(
        face({ left: "0", top: "0" }, t, h, "left", `rotateY(${-p}deg)`, [
          [0, 0],
          [t, h / 2],
          [0, h],
        ]),
        face({ right: "0", top: "0" }, t, h, "right", `rotateY(${p}deg)`, [
          [t, 0],
          [0, h / 2],
          [t, h],
        ]),
      );
  } else {
    faces.push(
      face({ left: "0", top: "0" }, s, h, "left", `rotateY(${-p}deg)`, [
        [0, 0],
        [s, inset],
        [s, h - inset],
        [0, h],
      ]),
      face({ right: "0", top: "0" }, s, h, "right", `rotateY(${p}deg)`, [
        [s, 0],
        [s, h],
        [0, h - inset],
        [0, inset],
      ]),
    );
    if (inset > 0)
      faces.push(
        face({ left: "0", top: "0" }, w, t, "top", `rotateX(${p}deg)`, [
          [0, 0],
          [w, 0],
          [w / 2, t],
        ]),
        face({ left: "0", bottom: "0" }, w, t, "bottom", `rotateX(${-p}deg)`, [
          [w / 2, 0],
          [w, t],
          [0, t],
        ]),
      );
  }
  return faces;
}

const RAIL_AUTO_HIDE_MS = 4000;
const TILT_DEFAULT = 62;
const TILT_MIN = 0;
const TILT_MAX = 150;
const clampTilt = (t: number) => Math.min(TILT_MAX, Math.max(TILT_MIN, t));
// Odstęp pięter na ekranie rośnie z sinusem pochylenia (piętra leżą jedno nad drugim w 3D);
// od spodu (powyżej 90°) odstęp znów maleje.
const tiltFactor = (t: number) =>
  Math.sin((t * Math.PI) / 180) / Math.sin((TILT_DEFAULT * Math.PI) / 180);

const clampZoom = (z: number) => Math.min(2.5, Math.max(0.6, z));
const normRot = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180;

export class KageHomeCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _floorId: { state: true },
    _roomId: { state: true },
    _expanded: { state: true },
    _dismissed: { state: true },
    _sceneFlash: { state: true },
    _fetchedFloors: { state: true },
    _showRooms: { state: true },
    _securing: { state: true },
    _secureOff: { state: true },
    _secureDone: { state: true },
    _holding: { state: true },
    _width: { state: true },
    _height: { state: true },
    _editing: { state: true },
    _zoom: { state: true },
    _rot: { state: true },
    _tx: { state: true },
    _tilt: { state: true },
    _railOpen: { state: true },
    _stripHidden: { state: true },
    _ty: { state: true },
    _saving: { state: true },
    _saveError: { state: true },
  };

  hass?: HomeAssistant;
  private _floorId: string | null = null;
  private _roomId: string | null = null;
  private _expanded: Expanded = null;
  private _dismissed: string[] = [];
  private _sceneFlash: string | null = null;
  private _fetchedFloors: FloorEntry[] | null = null;
  private _restored = false;
  // „Poza domem”: podgląd pomieszczeń zamiast przeglądu, okno „Zabezpiecz dom”.
  private _showRooms = false;
  private _securing = false;
  private _secureOff: string[] = [];
  private _secureDone = false;
  private _holding: string | null = null;
  private _holdTimer?: ReturnType<typeof setTimeout>;
  // Szerokość karty: od WIDE_MIN układ dwukolumnowy (tablet, laptop).
  private _width = 0;
  // Wysokość dostępna dla karty (od jej górnej krawędzi do dołu okna).
  private _height = 0;
  // Edytor rzutu (administrator, układ szeroki).
  private _editing = false;
  // Widok rzutu: przybliżenie i obrót (gesty); tylko na czas sesji.
  private _zoom = 1;
  private _rot = 0;
  private _tx = 0;
  private _ty = 0;
  // Pochylenie widoku: 0° = rzut z góry, 62° = domyślny, 90° = z boku, powyżej 90° = od spodu.
  private _tilt = TILT_DEFAULT;
  // Schowane karty pięter (z lewej) i pasek pomieszczeń; zapamiętywane dla użytkownika.
  private _railOpen = false;
  private _railTimer?: ReturnType<typeof setTimeout>;
  private _stripHidden = false;
  private _saving = false;
  private _saveError = "";
  private _resize?: ResizeObserver;
  private _cache?: { key: unknown[]; model: HomeModel };

  // Rzut zapisany w konfiguracji strategii (`plan:`), przekazany przez strategię widoku.
  private _plan: PlanConfig | undefined;

  setConfig(config: { plan?: PlanConfig }): void {
    this._plan = config?.plan;
  }

  private _resolved(floor: FloorModel): ResolvedPlan {
    return resolvePlan(this._plan, floor);
  }

  getCardSize(): number {
    return 14;
  }

  connectedCallback(): void {
    super.connectedCallback();
    ensureFonts();
    if (typeof ResizeObserver !== "undefined") {
      this._resize = new ResizeObserver((entries) => {
        const w = Math.round(entries[0]?.contentRect.width ?? 0);
        if (Math.abs(w - this._width) > 8) this._width = w;
        this._measureHeight();
      });
      window.addEventListener("resize", this._onWindowResize);
      this._resize.observe(this);
    }
  }

  // Wyjście z domu zawsze zaczyna od przeglądu, nie od ostatnio oglądanego pokoju.
  private _lastCtx: Context | null = null;
  protected willUpdate(): void {
    if (!this.hass) return;
    const ctx = this._context();
    if (ctx !== this._lastCtx) {
      if (ctx === "away") {
        this._showRooms = false;
        this._securing = false;
      }
      this._lastCtx = ctx;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    window.removeEventListener("resize", this._onWindowResize);
  }

  private _onWindowResize = () => this._measureHeight();

  private _measureHeight(): void {
    const top = Math.max(0, this.getBoundingClientRect().top + window.scrollY);
    const h = Math.round(window.innerHeight - top);
    if (Math.abs(h - this._height) > 8) this._height = h;
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

  private _uiKey(): string {
    return `kage:${this.hass?.user?.id ?? "anon"}:ui`;
  }

  private _setUi(strip: boolean): void {
    this._stripHidden = strip;
    try {
      localStorage.setItem(this._uiKey(), JSON.stringify({ strip }));
    } catch {
      /* bez pamięci */
    }
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
      const ui = localStorage.getItem(this._uiKey());
      if (ui) {
        const u = JSON.parse(ui) as { strip?: boolean };
        this._stripHidden = !!u.strip;
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

  private _openRail(): void {
    this._railOpen = true;
    clearTimeout(this._railTimer);
    this._railTimer = setTimeout(() => this._closeRail(), RAIL_AUTO_HIDE_MS);
  }

  private _closeRail(): void {
    clearTimeout(this._railTimer);
    if (this._railOpen) this._railOpen = false;
  }

  private _goFloor(floor: FloorModel): void {
    this._closeRail();
    this._floorId = floor.id;
    const keep = floor.areas.some((a) => a.id === this._roomId);
    if (!keep) this._roomId = this._bestRoom(floor)?.id ?? null;
    this._expanded = null;
    this._persist();
  }

  private _pickRoom(floor: FloorModel, area: AreaModel): void {
    this._closeRail();
    if (this._width >= WIDE_MIN) this._showRooms = true;
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

    const ctx = this._context();
    const wide = this._width >= WIDE_MIN;
    if (ctx === "away" && !this._showRooms && !wide) return this._renderAway();

    let floor = floors.find((f) => f.id === this._floorId) ?? null;
    if (!floor) {
      const byRoom = floors.find((f) => f.areas.some((a) => a.id === this._roomId));
      floor = byRoom ?? this._defaultFloor(floors)!;
    }
    let room = floor.areas.find((a) => a.id === this._roomId) ?? null;
    if (!room) room = this._bestRoom(floor);

    const back = html`<button class="back mono rise" @click=${() => (this._showRooms = false)}>
      ${ICON.left} ${t.backToOverview}
    </button>`;
    const strip =
      floor.areas.length > MAX_TAGS || wide ? this._renderRoomStrip(floor, room) : nothing;

    if (wide && this._editing && this.hass.user?.is_admin) {
      return html`<div class="screen wide editing">
        ${this._renderHeader(floor, ctx)}
        <div class="cols edit" style=${styleMap({ height: `${this._wideBodyHeight()}px` })}>
          <kage-plan-editor
            .floors=${floors}
            .plan=${this._plan}
            .strings=${t}
            .floorId=${floor.id}
            .saving=${this._saving}
            .error=${this._saveError}
            @plan-floor=${(e: CustomEvent<string>) => {
              const f = floors.find((x) => x.id === e.detail);
              if (f) this._goFloor(f);
            }}
            @plan-cancel=${() => {
              this._editing = false;
              this._saveError = "";
            }}
            @plan-save=${(e: CustomEvent<PlanConfig>) => void this._savePlan(e.detail)}
          ></kage-plan-editor>
        </div>
      </div>`;
    }

    if (wide) {
      // Tablet i laptop: rzut po lewej, po prawej pokój albo przegląd „Poza domem”.
      const side =
        ctx === "away" && !this._showRooms
          ? this._renderAwayBody()
          : html`${ctx === "away" ? back : this._renderTodos()}
            ${room ? this._renderRoom(room) : nothing} ${this._renderScenes()}`;
      return html`<div class="screen wide ${ctx}">
        <div class="scan" aria-hidden="true"></div>
        ${this._renderHeader(floor, ctx)}
        <div class="cols" style=${styleMap({ height: `${this._wideBodyHeight()}px` })}>
          <div class="col-plan">${this._zoomedPlan(model, floor, room)} ${strip}</div>
          <aside class="col-side">${side}</aside>
        </div>
      </div>`;
    }

    return html`
      <div class="screen">
        <div class="scan" aria-hidden="true"></div>
        ${this._renderHeader(floor, ctx)} ${ctx === "away" ? back : this._renderTodos()}
        ${this._renderPlan(model, floor, room, this._phonePlanH())} ${strip}
        ${room ? this._renderRoom(room) : nothing} ${this._renderScenes()}
      </div>
    `;
  }

  private async _savePlan(plan: PlanConfig): Promise<void> {
    this._saving = true;
    this._saveError = "";
    try {
      await savePlan(this.hass!, dashboardPath(window.location.pathname), plan);
      this._plan = plan;
      this._editing = false;
    } catch (err) {
      this._saveError = err instanceof Error ? err.message : String(err);
    } finally {
      this._saving = false;
    }
  }

  // --- gesty na rzucie ---
  // Jeden palec (albo mysz) w poziomie obraca rzut; ruch w pionie przewija stronę.
  // Dwa palce przybliżają i przesuwają rzut, z punktem między palcami w miejscu.
  // Laptop: Ctrl + kółko (szczypanie na touchpadzie) przybliża, Shift + kółko obraca.

  private _drag: { id: number; x: number; y: number; r: number; t: number; moved: boolean } | null =
    null;
  private _pinch: {
    d: number;
    a: number;
    z: number;
    r: number;
    c: [number, number]; // punkt rzutu pod palcami (współrzędne przed przybliżeniem)
  } | null = null;
  private _live = { z: 1, r: 0, tx: 0, ty: 0, t: TILT_DEFAULT };
  private _suppressClick = false;

  private _planEl(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(".plan");
  }

  // Punkt ekranu → współrzędne sekcji rzutu (uwzględnia powiększenie układu szerokiego).
  private _local(el: HTMLElement, x: number, y: number): [number, number] {
    const r = el.getBoundingClientRect();
    const k = r.width / (el.offsetWidth || r.width || 1);
    return [(x - r.left) / k, (y - r.top) / k];
  }

  private _applyView(el: HTMLElement | null = this._planEl()): void {
    if (!el) return;
    const v = this._live;
    el.style.setProperty("--zoom", String(v.z));
    el.style.setProperty("--rot", `${v.r}deg`);
    el.style.setProperty("--tx", `${v.tx}px`);
    el.style.setProperty("--ty", `${v.ty}px`);
    el.style.setProperty("--tilt", `${v.t}deg`);
    el.style.setProperty("--tf", String(tiltFactor(v.t)));
    el.style.setProperty("--up", v.t > 90 ? "-1" : "1");
  }

  private _commitView(): void {
    this._zoom = this._live.z;
    this._rot = this._live.r;
    this._tx = this._live.tx;
    this._ty = this._live.ty;
    this._tilt = this._live.t;
    this._planEl()?.classList.remove("gesturing");
  }

  private _syncLive(): void {
    this._live = { z: this._zoom, r: this._rot, tx: this._tx, ty: this._ty, t: this._tilt };
  }

  private _gestureDown(e: PointerEvent): void {
    if (this._pinch || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as Element).closest?.("button")) return; // karty pięter, przycisk boczny
    this._closeRail();
    this._syncLive();
    this._drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      r: this._rot,
      t: this._tilt,
      moved: false,
    };
  }

  private _gestureMove(e: PointerEvent): void {
    const d = this._drag;
    if (!d || d.id !== e.pointerId || this._pinch) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) (e.currentTarget as HTMLElement).classList.add("gesturing");
    d.moved = true;
    // W prawo: dom obraca się w prawo. W dół: widok bardziej z góry; w górę: z boku i od spodu.
    this._live.r = normRot(d.r - dx * 0.5);
    this._live.t = clampTilt(d.t - dy * 0.4);
    this._applyView(e.currentTarget as HTMLElement);
  }

  private _gestureUp(e: PointerEvent): void {
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    this._drag = null;
    if (d.moved) {
      this._suppressClick = true; // obrót to nie stuknięcie w pokój
      setTimeout(() => (this._suppressClick = false), 0);
      this._commitView();
    }
  }

  private _onTouchStart = (e: TouchEvent): void => {
    const el = this._planEl();
    if (!el || e.touches.length !== 2 || !e.composedPath().includes(el)) return;
    e.preventDefault();
    this._closeRail();
    if (this._drag) {
      this._live.r = this._drag.r; // anuluj obrót jednym palcem
      this._drag = null;
    }
    this._syncLive();
    el.classList.add("gesturing");
    const [t0, t1] = [e.touches[0]!, e.touches[1]!];
    const mid = this._local(el, (t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
    this._pinch = {
      d: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1,
      a: (Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * 180) / Math.PI,
      z: this._zoom,
      r: this._rot,
      c: [(mid[0] - this._tx) / this._zoom, (mid[1] - this._ty) / this._zoom],
    };
  };

  private _onTouchMove = (e: TouchEvent): void => {
    const p = this._pinch;
    const el = this._planEl();
    if (!p || !el || e.touches.length < 2) return;
    e.preventDefault();
    const [t0, t1] = [e.touches[0]!, e.touches[1]!];
    const mid = this._local(el, (t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
    const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
    const a = (Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * 180) / Math.PI;
    const z = clampZoom((p.z * d) / p.d);
    this._live = {
      z,
      r: normRot(p.r - (a - p.a)),
      tx: mid[0] - p.c[0] * z,
      ty: mid[1] - p.c[1] * z,
      t: this._live.t,
    };
    this._applyView(el);
  };

  private _onTouchEnd = (e: TouchEvent): void => {
    if (this._pinch && e.touches.length < 2) {
      this._pinch = null;
      this._commitView();
    }
  };

  private _onClickCapture = (e: Event): void => {
    if (this._suppressClick) {
      e.stopPropagation();
      e.preventDefault();
      this._suppressClick = false;
    }
  };

  protected firstUpdated(): void {
    const root = this.renderRoot;
    root.addEventListener("touchstart", this._onTouchStart as EventListener, { passive: false });
    root.addEventListener("touchmove", this._onTouchMove as EventListener, { passive: false });
    root.addEventListener("touchend", this._onTouchEnd as EventListener);
    root.addEventListener("touchcancel", this._onTouchEnd as EventListener);
    root.addEventListener("click", this._onClickCapture, { capture: true });
  }

  private _wheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.shiftKey) return;
    e.preventDefault();
    this._closeRail();
    this._syncLive();
    if (e.ctrlKey) {
      const el = e.currentTarget as HTMLElement;
      const m = this._local(el, e.clientX, e.clientY);
      const c = [(m[0] - this._tx) / this._zoom, (m[1] - this._ty) / this._zoom];
      const z = clampZoom(this._zoom * Math.exp(-e.deltaY * 0.01));
      this._live = { ...this._live, z, tx: m[0] - c[0]! * z, ty: m[1] - c[1]! * z };
    } else {
      this._live.r = normRot(this._rot - (e.deltaY || e.deltaX) * 0.25);
    }
    this._commitView();
  }

  // Położenie płaszczyzny piętra `f` w grupie jednego poziomu, względem oglądanej (viewCol).
  private _sideOffset(group: FloorModel[], f: FloorModel, viewCol: number): [number, number] {
    const pos = (x: FloorModel): [number, number] =>
      group.indexOf(x) === 0 ? [0, 0] : SIDE_OFFSET[this._resolved(x).side];
    const [fx, fy] = pos(f);
    const [vx, vy] = pos(group[viewCol] ?? group[0]!);
    return [fx - vx, fy - vy];
  }

  // Rzut w układzie szerokim: plany pięter powiększone do szerokości kolumny,
  // a warstwy rozsunięte tak, żeby rzut zajął całą wysokość ekranu (jak w makiecie tabletu).
  private _zoomedPlan(model: HomeModel, floor: FloorModel, room: AreaModel | null): TemplateResult {
    const col = Math.max(PHONE_W, (this._width - 40) * 0.58);
    const k = Math.min(MAX_ZOOM, col / PHONE_W);
    const avail = this._wideBodyHeight() - STRIP_H;
    const sectionH = Math.max(SECTION_H, avail / k);
    return html`<div class="plan-zoom" style=${styleMap({ height: `${sectionH * k}px` })}>
      <div
        class="plan-inner"
        style=${styleMap({ width: `${col / k}px`, transform: `scale(${k})` })}
      >
        ${this._renderPlan(model, floor, room, sectionH)}
      </div>
    </div>`;
  }

  // Rzut na telefonie: wyższy na wysokich ekranach (łatwiej o gesty dwoma palcami).
  private _phonePlanH(): number {
    if (!this._height) return SECTION_H;
    return Math.round(Math.min(340, Math.max(SECTION_H, this._height * 0.36)));
  }

  // Wysokość obszaru pod nagłówkiem w układzie szerokim (minimum jak na niskim laptopie).
  private _wideBodyHeight(): number {
    const h = this._height || (typeof window !== "undefined" ? window.innerHeight : 800);
    return Math.max(MIN_WIDE_BODY, h - HEAD_H - 24);
  }

  private _context(): Context {
    let override: Context | null = null;
    try {
      override = contextOverride(window.location.search);
    } catch {
      /* poza przeglądarką */
    }
    return contextFor(this.hass!, override);
  }

  private _renderHeader(floor: FloorModel | null, ctx: Context = "home"): TemplateResult {
    const t = this._t;
    const alarmId = visibleAlarm(this.hass!);
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
          <span class="here-dot ${ctx}" aria-hidden="true"></span>
          <span>${ctx === "away" ? t.ctxAway : t.ctxHome}</span>
          ${floor
            ? html`<span class="sep">//</span>
                <span class="muted">${floor.name.toLocaleUpperCase(this._lang)}</span>`
            : nothing}
        </div>
        <span class="head-right">
          ${this._width >= WIDE_MIN && this.hass!.user?.is_admin && !this._editing
            ? html`<button class="edit-plan cut-s ctl mono" @click=${() => (this._editing = true)}>
                ${ICON.pencil} ${t.editPlan}
              </button>`
            : nothing}
          ${alarm}
        </span>
      </header>
    `;
  }

  // --- Poza domem ---

  private _issueTitle(i: Issue): string {
    const t = this._t;
    switch (i.kind) {
      case "battery":
        return i.value !== null
          ? format(t.todoBattery, { n: Math.round(i.value) })
          : t.todoBatteryLow;
      case "problem":
        return t.todoProblem;
      case "power":
        return format(t.issue.power, { v: `${i.value ?? 0} W` });
      default:
        return format(t.issue[i.kind], { n: i.entityIds.length });
    }
  }

  private _actionLabel(a: IssueAction): string {
    const t = this._t;
    if (a.domain === "valve") return t.actCloseValve;
    if (a.domain === "alarm_control_panel") return t.actArm;
    if (a.domain === "cover") return t.actClose;
    return t.actTurnOff;
  }

  private _run(a: IssueAction): void {
    this._call(a.domain, a.service, { entity_id: a.entityIds });
  }

  // Przycisk z przytrzymaniem 1,1 s dla akcji fizycznych (brama, zawór). Puszczenie wcześniej
  // nic nie robi. Klawiatura: przytrzymanie Spacji albo Entera.
  private _holdButton(key: string, label: string, onDone: () => void, cls = ""): TemplateResult {
    const t = this._t;
    const start = () => {
      if (this._holding) return;
      this._holding = key;
      this._holdTimer = setTimeout(() => {
        this._holding = null;
        onDone();
      }, HOLD_MS);
    };
    const stop = () => {
      if (this._holding !== key) return;
      clearTimeout(this._holdTimer);
      this._holding = null;
    };
    return html`<button
      class="hold cut-s ctl ${cls} ${this._holding === key ? "holding" : ""}"
      aria-label=${`${label} (${t.hold})`}
      @pointerdown=${start}
      @pointerup=${stop}
      @pointerleave=${stop}
      @pointercancel=${stop}
      @keydown=${(e: KeyboardEvent) => (e.key === " " || e.key === "Enter") && !e.repeat && start()}
      @keyup=${stop}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <span class="fill" aria-hidden="true"></span>
      <span class="lbl">${label}</span>
      <span class="sub mono">${t.hold}</span>
    </button>`;
  }

  private _actionButton(i: Issue): TemplateResult | typeof nothing {
    const a = i.action;
    if (!a) return nothing;
    const label = this._actionLabel(a);
    return a.hold
      ? this._holdButton(`issue:${i.id}`, label, () => this._run(a), "small")
      : html`<button class="act cut-s ctl" @click=${() => this._run(a)}>${label}</button>`;
  }

  private _renderAway(): TemplateResult {
    return html`<div class="screen away">
      <div class="scan" aria-hidden="true"></div>
      ${this._renderHeader(null, "away")} ${this._renderAwayBody()}
    </div>`;
  }

  private _renderAwayBody(): TemplateResult {
    const t = this._t;
    const h = this.hass!;
    const issues = findIssues(h);
    // Werdykt liczy tylko sprawy pilne i ważne; drobne (baterie) nie zmieniają „w porządku”.
    const urgent = issues.filter((i) => i.severity !== "info");
    const worst = worstSeverity(urgent);
    const steps = secureSteps(issues, h);
    const people = peopleHome(h);
    const verdict = worst
      ? format(plural(this._lang, urgent.length, t.verdictIssues), { n: urgent.length })
      : t.verdictOk;
    return html`
      <section class="verdict cut-m rise ${worst ?? "ok"}" aria-live="polite">
        <span class="v-ico" aria-hidden="true">${worst ? ICON.alert : ICON.check}</span>
        <span class="v-text">${verdict}</span>
      </section>

      ${issues.length
        ? html`<section class="issues glass cut-m rise" aria-label=${verdict}>
            ${issues.map((i) => {
              // Jedno urządzenie: nazwa i pokój; kilka: same pokoje.
              const where = (
                i.entityIds.length === 1 ? [...i.names.slice(0, 1), ...i.areas] : i.areas
              ).join(" · ");
              return html`<div class="issue ${i.severity}">
                <span class="dot" aria-hidden="true"></span>
                <span class="i-text">
                  <span class="i-title">${this._issueTitle(i)}</span>
                  ${where
                    ? html`<span class="i-where mono">${where.toLocaleUpperCase(this._lang)}</span>`
                    : nothing}
                </span>
                ${this._actionButton(i)}
              </div>`;
            })}
          </section>`
        : nothing}
      ${this._securing
        ? this._renderSecure(steps)
        : html`<button
            class="secure cut-m rise ${steps.length ? "" : "idle"}"
            ?disabled=${!steps.length}
            @click=${() => {
              // Główny zawór wody domyślnie odznaczony: bywa potrzebny pod nieobecność
              // (podlewanie, uzupełnianie instalacji). Przy wycieku zakręca go przycisk sprawy.
              this._secureOff = ["valve"];
              this._secureDone = false;
              this._securing = true;
            }}
          >
            ${ICON.shield}
            <span class="s-text">
              <span class="s-title">${this._secureDone ? t.secureDone : t.secureHome}</span>
              <span class="s-sub mono">${steps.length ? t.secureHint : t.secureNothing}</span>
            </span>
            ${steps.length ? ICON.right : nothing}
          </button>`}

      <section class="people rise">
        <span class="p-label mono">${people.length ? t.peopleAtHome : t.nobodyHome}</span>
        ${people.map((p) => html`<span class="person cut-s">${p}</span>`)}
      </section>

      ${this._width >= WIDE_MIN
        ? nothing
        : html`<button class="rooms-link mono rise" @click=${() => (this._showRooms = true)}>
            ${t.showRooms} ${ICON.right}
          </button>`}
    `;
  }

  private _stepLabel(s: SecureStep): string {
    const t = this._t;
    return s.kind === "lights"
      ? format(t.step.lights, { n: s.action.entityIds.length })
      : t.step[s.kind];
  }

  private _renderSecure(steps: SecureStep[]): TemplateResult {
    const t = this._t;
    const chosen = steps.filter((s) => !this._secureOff.includes(s.kind));
    const physical = chosen.some((s) => s.action.hold);
    const run = () => {
      for (const s of chosen) this._run(s.action);
      this._securing = false;
      this._secureDone = true;
    };
    return html`<section class="secure-box glass cut-m rise" aria-label=${t.secureHome}>
      <div class="sb-title">${t.secureHome}</div>
      ${steps.map((s) => {
        const on = !this._secureOff.includes(s.kind);
        return html`<label class="step">
          <input
            type="checkbox"
            .checked=${on}
            @change=${() =>
              (this._secureOff = on
                ? [...this._secureOff, s.kind]
                : this._secureOff.filter((k) => k !== s.kind))}
          />
          <span class="box cut-s" aria-hidden="true">${on ? ICON.check : nothing}</span>
          <span>${this._stepLabel(s)}</span>
          ${s.action.hold ? html`<span class="tag-hold mono">${t.hold}</span>` : nothing}
        </label>`;
      })}
      <div class="sb-actions">
        <button class="act ghost cut-s ctl" @click=${() => (this._securing = false)}>
          ${t.cancel}
        </button>
        ${!chosen.length
          ? nothing
          : physical
            ? this._holdButton("secure", t.secureRun, run, "primary")
            : html`<button class="act primary cut-s ctl" @click=${run}>${t.secureRun}</button>`}
      </div>
    </section>`;
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

  private _renderPlan(
    model: HomeModel,
    floor: FloorModel,
    room: AreaModel | null,
    sectionH = SECTION_H,
  ): TemplateResult {
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
    // Wyższy rzut (tablet): warstwy rozsuwamy proporcjonalnie, maks. 2,6 raza.
    const last = tops[tops.length - 1];
    if (sectionH > SECTION_H && last > 0) {
      const f = Math.min(2.6, (sectionH - LAYER_H - 40) / last);
      if (f > 1) for (let k = 0; k < tops.length; k += 1) tops[k] = Math.round(tops[k] * f);
    }
    const offset = Math.round((sectionH - (tops[tops.length - 1] + LAYER_H)) / 2);
    const railStep = Math.min(74, (sectionH - 12) / levels.length);

    const activeK = Math.max(
      0,
      levels.findIndex((l) => l.level === activeLevel),
    );
    const layers = levels.map((lv, k) => {
      const group = lv.floors;
      const activeLv = lv.level === activeLevel;
      const planes = group.map((f, j) => {
        const d = j - viewCol;
        const isCur = d === 0;
        const plan = this._resolved(f);
        const planeH = Math.round(Math.min(190, Math.max(100, (PLANE_W * plan.rows) / plan.cols)));
        const glowOn = activeLv && isCur;
        const planeStyle = styleMap({
          "--grid": f.outdoor ? "rgba(61,255,162,.15)" : "rgba(0,229,255,.15)",
          "--wall": f.outdoor ? "3px" : "12px",
          height: `${planeH}px`,
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
        const pickable = activeLv && isCur;
        const byId = new Map(f.areas.map((a) => [a.id, a]));
        const shapes = plan.rooms.map((r) => {
          const a = byId.get(r.id)!;
          const glow = roomGlow(this.hass!, a);
          const sel = pickable && room?.id === a.id;
          const alpha = (0.3 + (0.6 * glow) / 100).toFixed(2);
          const edge = sel
            ? "#00e5ff"
            : glow
              ? "rgba(255,190,60,.85)"
              : f.outdoor
                ? "rgba(61,255,162,.4)"
                : "rgba(0,229,255,.35)";
          const fill = glow
            ? `rgba(255,190,60,${alpha})`
            : f.outdoor
              ? "rgba(20,60,40,.55)"
              : "rgba(10,14,24,.78)";
          return { r, a, glow, sel, edge, fill, pts: r.points.map((p) => p.join(",")).join(" ") };
        });
        const vb = `0 0 ${plan.cols} ${plan.rows}`;
        // Poświata zapalonych pokoi: rozmyta kopia wielokąta pod podłogą (jak wcześniej
        // radialny gradient z cieniem przy prostokątach).
        const lit = shapes.filter((x) => x.glow > 0);
        const glowLayer = lit.length
          ? svg`<svg class="glow-svg" viewBox=${vb} preserveAspectRatio="none" aria-hidden="true">
              ${lit.map(
                (x) => svg`<polygon
                  points=${x.pts}
                  style=${`fill:rgba(255,${150 + Math.round(x.glow * 0.5)},40,${(0.35 + x.glow / 200).toFixed(2)})`}
                ></polygon>`,
              )}
            </svg>`
          : nothing;
        const gid = `lit-${f.id}`;
        const base = svg`<svg class="rooms-svg" viewBox=${vb} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id=${gid} cx="50%" cy="50%" r="65%">
              <stop offset="0%" stop-color="rgb(255,215,90)"></stop>
              <stop offset="100%" stop-color="rgb(255,140,0)" stop-opacity="0.35"></stop>
            </radialGradient>
          </defs>
          ${plan.voids.map(
            (v) =>
              svg`<polygon class="void" points=${v.map((p) => p.join(",")).join(" ")}></polygon>`,
          )}
          ${shapes.map(
            (x) => svg`<polygon
              class="rshape ${pickable ? "pick" : ""} ${x.glow ? "lit" : ""}"
              points=${x.pts}
              style=${
                x.glow
                  ? `fill:url(#${gid});fill-opacity:${(0.45 + x.glow / 200).toFixed(2)};stroke:${x.edge}`
                  : `fill:${x.fill};stroke:${x.edge}`
              }
              @click=${pickable ? () => this._pickRoom(f, x.a) : nothing}
            ></polygon>`,
          )}
        </svg>`;
        const walls = svg`<svg class="walls-svg" viewBox=${vb} preserveAspectRatio="none" aria-hidden="true">
          ${shapes.map((x) => svg`<polygon points=${x.pts} style=${`stroke:${x.edge}`}></polygon>`)}
        </svg>`;
        const tags = shapes
          .filter((x) => pickable && (f.areas.length <= MAX_TAGS || x.sel))
          .map((x) => {
            const [cx, cy] = centroid(x.r.points);
            return html`<button
              class="tag cut-s ${x.sel ? "sel" : ""}"
              style=${styleMap({
                left: `${(cx / plan.cols) * 100}%`,
                top: `${(cy / plan.rows) * 100}%`,
              })}
              aria-pressed=${x.sel ? "true" : "false"}
              @click=${() => this._pickRoom(f, x.a)}
            >
              ${x.a.name}
            </button>`;
          });
        const roof = plan.roof
          ? html`<span class="roof" aria-hidden="true"
              >${roofFaces(PLANE_W, planeH, plan.roof).map(
                (r) =>
                  html`<span class="slope" style=${styleMap(r.style)}
                    >${svg`<svg width=${r.w} height=${r.h} viewBox=${`0 0 ${r.w} ${r.h}`}><polygon points=${r.points}></polygon></svg>`}</span
                  >`,
              )}</span
            >`
          : nothing;
        const [ox, oy] = this._sideOffset(group, f, viewCol);
        return html`<span
          class="slide"
          style=${styleMap({
            transform: `translate(${ox}px, ${oy}px) scale(${isCur ? 1 : 0.8})`,
            opacity: isCur ? "1" : "0.5",
            filter: isCur ? "none" : "blur(2px)",
          })}
        >
          <span
            class="plane ${pickable ? "" : "go"}"
            style=${planeStyle}
            @click=${pickable ? nothing : () => this._goFloor(f)}
            >${glowLayer} ${base} ${walls} ${tags} ${roof}</span
          >
        </span>`;
      });

      // Poziom 0: słaba siatka gruntu wokół rzutu, żeby było widać, że to parter.
      const ground =
        lv.level === 0 ? html`<span class="ground" aria-hidden="true"></span>` : nothing;

      const pivot = tops[activeK]!;
      return html`<div
        class="layer"
        style=${styleMap({
          top: `calc(${offset + pivot}px + ${tops[k] - pivot}px * var(--tf, 1))`,
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
          >${ground}${planes}</span
        >
      </div>`;
    });

    // Karty pięter: domyślnie wąskie zakładki z numerem piętra (aktywna podświetlona,
    // kropka = zapalone światło). Stuknięcie wysuwa wszystkie karty; chowają się same po
    // chwili albo gdy zaczyna się inna czynność (obrót rzutu, wybór pokoju, zmiana piętra).
    const open = this._railOpen;
    const rail = levels.map((lv, k) => {
      const group = lv.floors;
      const activeLv = lv.level === activeLevel;
      const cur = activeLv ? floor : (group[viewCol] ?? group[0]);
      const lit = cur.areas.filter((a) => roomGlow(this.hass!, a) > 0).length;
      const top = sectionH - 6 - (levels.length - k) * railStep + 12;
      const short =
        lv.level !== null && lv.level !== undefined
          ? String(lv.level)
          : String(levels.length - 1 - k);
      return html`<button
        class="floor-card cut-s ctl ${activeLv ? "active" : ""} ${cur.outdoor
          ? "outdoor"
          : ""} ${open ? "" : "tucked"}"
        style=${styleMap({ top: `${top}px` })}
        aria-pressed=${activeLv ? "true" : "false"}
        aria-expanded=${open ? "true" : "false"}
        aria-label=${cur.name}
        @click=${() => (open ? this._goFloor(cur) : this._openRail())}
      >
        <span class="fname mono">${cur.name.toLocaleUpperCase(this._lang)}</span>
        <span class="fmeta">
          <span class="badge cut-s mono ${lit ? "lit" : ""}">${lit}</span>
          <span class="flabel mono">${t.floorLit}</span>
        </span>
        <span class="fshort mono" aria-hidden="true"
          >${short}${lit ? html`<i class="fdot"></i>` : nothing}</span
        >
      </button>`;
    });

    let side: TemplateResult | typeof nothing = nothing;
    if (activeGroup.length > 1) {
      const next = activeGroup[(viewCol + 1) % activeGroup.length];
      const dx = this._sideOffset(activeGroup, next, viewCol)[0];
      side = html`<button
        class="side cut-s ctl mono"
        aria-label=${format(t.moveTo, { x: next.name })}
        @click=${() => this._goFloor(next)}
      >
        ${dx < 0 ? ICON.left : nothing} ${next.name.toLocaleUpperCase(this._lang)}
        ${dx >= 0 ? html`<span class="nudge">${ICON.right}</span>` : nothing}
      </button>`;
    }

    const changed =
      this._zoom !== 1 ||
      this._rot !== 0 ||
      this._tx !== 0 ||
      this._ty !== 0 ||
      this._tilt !== TILT_DEFAULT;
    return html`<section
      class="plan"
      style=${styleMap({
        height: `${sectionH}px`,
        "--zoom": String(this._zoom),
        "--rot": `${this._rot}deg`,
        "--tx": `${this._tx}px`,
        "--ty": `${this._ty}px`,
        "--tilt": `${this._tilt}deg`,
        "--tf": String(tiltFactor(this._tilt)),
        // od spodu etykiety pokoi wiszą pod podłogą, żeby jej nie zasłaniała
        "--up": this._tilt > 90 ? "-1" : "1",
      })}
      @pointerdown=${(e: PointerEvent) => this._gestureDown(e)}
      @pointermove=${(e: PointerEvent) => this._gestureMove(e)}
      @pointerup=${(e: PointerEvent) => this._gestureUp(e)}
      @pointercancel=${(e: PointerEvent) => this._gestureUp(e)}
      @wheel=${(e: WheelEvent) => this._wheel(e)}
    >
      <div class="view3d">${layers}</div>
      ${rail} ${side}
      ${changed
        ? html`<button
            class="view-reset cut-s ctl mono"
            aria-label=${t.resetView}
            @click=${() => {
              this._zoom = 1;
              this._rot = 0;
              this._tx = 0;
              this._ty = 0;
              this._tilt = TILT_DEFAULT;
            }}
          >
            ${ICON.reset}
          </button>`
        : nothing}
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
    const t = this._t;
    const hidden = this._stripHidden;
    const grip = html`<button
      class="strip-grip ${hidden ? "closed" : ""}"
      aria-label=${`${hidden ? t.show : t.hidePanel}: ${t.showRooms}`}
      aria-expanded=${hidden ? "false" : "true"}
      @click=${() => this._setUi(!hidden)}
    >
      <span class="bar" aria-hidden="true"></span>
    </button>`;
    if (hidden) return grip;
    return html`${grip}
      <nav class="room-strip" aria-label=${floor.name}>
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

  // Stan osłony: w ruchu („otwiera się”), albo pozycja.
  private _coverState(ids: string[], pos: number): string {
    const t = this._t;
    const states = ids.map((id) => this.hass!.states[id]?.state);
    if (states.includes("opening")) return t.opening;
    if (states.includes("closing")) return t.closing;
    return pos === 0 ? t.closed : pos === 100 ? t.open : format(t.openPct, { n: pos });
  }

  // ▲ ■ ▼ – stop tylko dla osłon, które go obsługują (CoverEntityFeature.STOP).
  private _coverButtons(target: string | string[], featureIds: string[]): TemplateResult {
    const t = this._t;
    const btn = (label: string, service: string, icon: TemplateResult, cls = "") =>
      html`<button
        class="sq cut-s ctl ${cls}"
        aria-label=${label}
        @click=${() => this._call("cover", service, { entity_id: target })}
      >
        ${icon}
      </button>`;
    return html`<span class="row cover-btns">
      ${btn(t.openAll, "open_cover", ICON.up)}
      ${featureIds.every((id) => canStop(this.hass!, id))
        ? btn(t.stop, "stop_cover", ICON.stop, "stop")
        : nothing}
      ${btn(t.closeAll, "close_cover", ICON.down)}
    </span>`;
  }

  private _coverTile(area: AreaModel, g: CoverControl): TemplateResult {
    const label = this._coverLabel(area, g);
    const variant = g.kind === "screen" ? "projector" : "";
    const h = this.hass!;
    const ids = g.members;
    const target = g.all ?? ids;
    const featureIds = g.all ? [g.all] : ids;
    const pos = g.all
      ? coverPosition(h, g.all)
      : Math.round(ids.reduce((s, id) => s + coverPosition(h, id), 0) / ids.length);
    return html`<div class="tile cut-s blind ${variant}">
      <div class="tile-head">
        <span class="tt">
          <span class="name">${label}</span>
          <span class="st mono">${this._coverState(featureIds, pos)}</span>
        </span>
        ${ids.length > 1 ? this._listButton(`cover:${g.kind}`, ids.length) : nothing}
      </div>
      <div class="row bar-row">
        ${featureIds.every((id) => canSetPosition(h, id))
          ? this._positionSlider(target, pos, label)
          : html`<div class="bar"><i style=${styleMap({ width: `${pos}%` })}></i></div>`}
      </div>
      ${this._coverButtons(target, featureIds)}
    </div>`;
  }

  // Suwak pozycji osłony (0 = zamknięta, 100 = otwarta); rozkaz po puszczeniu suwaka.
  private _positionSlider(target: string | string[], pos: number, label: string): TemplateResult {
    return html`<input
      class="slider cover"
      type="range"
      min="0"
      max="100"
      step="5"
      .value=${String(pos)}
      aria-label=${`${label}: ${this._t.position}`}
      style=${styleMap({
        background: `linear-gradient(90deg, var(--kage-accent) ${pos}%, rgba(255,255,255,.1) ${pos}%)`,
      })}
      @input=${(e: Event) => {
        const el = e.target as HTMLInputElement;
        el.style.background = `linear-gradient(90deg, var(--kage-accent) ${el.value}%, rgba(255,255,255,.1) ${el.value}%)`;
      }}
      @change=${(e: Event) =>
        this._call("cover", "set_cover_position", {
          entity_id: target,
          position: Number((e.target as HTMLInputElement).value),
        })}
    />`;
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
    const off = climateIsOff(h, id);
    const set = (v: number) =>
      this._call("climate", "set_temperature", { entity_id: id, temperature: v });
    const power = climatePower(h, id, off);
    const toggle = power ? () => this._call("climate", power.service, power.data) : null;
    return { target, current, step, heating, off, set, toggle };
  }

  private _climateTitle(id: string): string {
    const name = this.hass!.states[id]?.attributes.friendly_name;
    const area = this._roomName;
    return typeof name === "string" && area && name.toLowerCase() !== area.toLowerCase()
      ? name
      : this._t.heating;
  }

  private _powerButton(on: boolean, toggle: (() => void) | null, cls = ""): TemplateResult {
    if (!toggle) return html``;
    const t = this._t;
    return html`<button
      class="pw cut-s ctl ${cls} ${on ? "on" : ""}"
      aria-pressed=${on ? "true" : "false"}
      aria-label=${on ? t.actTurnOff : t.turnOn}
      @click=${toggle}
    >
      ${ICON.power}
    </button>`;
  }

  private _climateState(c: ReturnType<KageHomeCard["_climateControl"]>): string {
    const t = this._t;
    const now = c.current !== null ? this._fmtTemp(c.current) : "—";
    if (c.off) return `${t.stateOff} · ${now}`;
    return format(c.heating ? t.heatingNow : t.holdingNow, { t: now });
  }

  private _climateTile(ids: string[]): TemplateResult {
    const t = this._t;
    const c = this._climateControl(ids[0]);
    return html`<div class="tile cut-s clim ${c.off ? "off" : ""}">
      <div class="tile-head">
        <span class="tt">
          <span class="name ellipsis">${this._climateTitle(ids[0])}</span>
          <span class="st mono ellipsis ${c.heating ? "warm" : ""}">${this._climateState(c)}</span>
        </span>
        <span class="row head-btns">
          ${this._powerButton(!c.off, c.toggle)}
          ${ids.length > 1 ? this._listButton("climates", ids.length) : nothing}
        </span>
      </div>
      ${c.target !== null && !c.off
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

  // Sterowanie odtwarzaczem: zasilanie, głośność, play/pauza (tylko gdy jest co wznowić).
  private _mediaControls(id: string, compact = false): TemplateResult {
    const t = this._t;
    const caps = mediaCaps(this.hass!, id);
    const playing = this.hass!.states[id]?.state === "playing";
    const call = (service: string) => this._call("media_player", service, { entity_id: id });
    return html`<span class="row media-btns">
      ${caps.canPower
        ? this._powerButton(!caps.off, () => call(caps.off ? "turn_on" : "turn_off"), "media")
        : nothing}
      ${caps.canVolume
        ? html`<button
              class="sq cut-s ctl m"
              aria-label=${t.volumeDown}
              @click=${() => call("volume_down")}
            >
              −
            </button>
            <button
              class="sq cut-s ctl m"
              aria-label=${t.volumeUp}
              @click=${() => call("volume_up")}
            >
              +
            </button>`
        : nothing}
      ${caps.canPlayPause
        ? html`<button
            class="play cut-s ctl ${compact ? "small" : ""}"
            aria-label=${playing ? t.pause : t.play}
            @click=${() => call("media_play_pause")}
          >
            ${playing ? ICON.pause : ICON.play}
          </button>`
        : nothing}
    </span>`;
  }

  private _mediaTile(ids: string[]): TemplateResult {
    const t = this._t;
    const h = this.hass!;
    const id = activeMedia(h, ids)!;
    const s = h.states[id];
    const caps = mediaCaps(h, id);
    const playing = s?.state === "playing";
    const name = String(s?.attributes.friendly_name ?? "");
    const mediaTitle =
      typeof s?.attributes.media_title === "string" ? s.attributes.media_title : "";
    const title = caps.off ? name : mediaTitle || (playing ? name : t.nothingPlaying);
    const sub = caps.off
      ? t.stateOff
      : [s?.attributes.media_artist, mediaTitle || !playing ? name : null]
          .filter((x) => typeof x === "string" && x)
          .join(" · ");
    return html`<div
      class="tile cut-s media wide ${playing ? "playing" : ""} ${caps.off ? "off" : ""}"
    >
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
        ${this._mediaControls(id)}
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
        const slider = canSetPosition(h, id)
          ? this._positionSlider(id, p, this._name(id, area))
          : nothing;
        return html`<div class="lrow cover-row">
          <span class="lname">${this._name(id, area)}</span>
          <span class="mono small">${this._coverState([id], p)}</span>
          ${this._coverButtons(id, [id])} ${slider}
        </div>`;
      });
    } else if (kind === "climates") {
      rows = c.climates.map((id) => {
        const cc = this._climateControl(id);
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          ${this._powerButton(!cc.off, cc.toggle)}
          ${cc.target !== null && !cc.off
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
            : html`<span class="mono small"
                >${cc.off ? t.stateOff : (h.states[id]?.state ?? "")}</span
              >`}
        </div>`;
      });
    } else if (kind === "media") {
      rows = c.media.map((id) => {
        return html`<div class="lrow">
          <span class="lname">${this._name(id, area)}</span>
          ${this._mediaControls(id, true)}
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
        transform: rotateX(var(--tilt, 62deg)) rotateZ(calc(-42deg + var(--rot, 0deg)));
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
        transform: translate(-50%, -50%) translateZ(calc(24px * var(--up, 1)))
          rotateZ(calc(42deg - var(--rot, 0deg))) rotateX(calc(0deg - var(--tilt, 62deg)));
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
      .tile.blind.projector {
        border-color: rgba(255, 43, 214, 0.35);
        background: rgba(255, 43, 214, 0.04);
      }
      .tile.blind.projector .bar i {
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
      .slider.cover::-webkit-slider-thumb {
        border-color: var(--kage-accent);
        box-shadow: 0 0 10px rgba(0, 229, 255, 0.7);
      }
      .slider.cover::-moz-range-thumb {
        border-color: var(--kage-accent);
      }
      .tile.projector .slider.cover::-webkit-slider-thumb {
        border-color: var(--kage-scene, #ff2bd6);
        box-shadow: 0 0 10px rgba(255, 43, 214, 0.7);
      }
      .tile.blind .cover-btns {
        gap: 6px;
        margin-top: 12px;
      }
      .tile.blind .cover-btns .sq {
        flex: 1;
        width: auto;
      }
      .tile.projector .sq {
        border-color: rgba(255, 43, 214, 0.45);
        background: rgba(255, 43, 214, 0.08);
        color: var(--kage-scene, #ff2bd6);
      }
      .sq.stop {
        color: #c9d3df;
      }
      .tile.blind .bar-row {
        margin-top: 12px;
        min-height: 18px;
        align-items: center;
      }
      .bar-row .slider {
        flex: 1;
      }
      .cover-row {
        flex-wrap: wrap;
      }
      .cover-row .slider {
        flex-basis: 100%;
        margin: 2px 0 16px;
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
      .tile.wide {
        grid-column: 1 / -1;
      }
      .head-btns,
      .media-btns {
        gap: 6px;
        flex: none;
      }
      .pw {
        width: 34px;
        height: 30px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(159, 176, 198, 0.35);
        background: transparent;
        color: var(--kage-ink-dim);
        flex: none;
      }
      .pw.on {
        border-color: rgba(61, 255, 162, 0.55);
        background: rgba(61, 255, 162, 0.12);
        color: var(--kage-climate);
        box-shadow: 0 0 10px rgba(61, 255, 162, 0.25);
      }
      .pw.media.on {
        border-color: rgba(255, 43, 214, 0.55);
        background: rgba(255, 43, 214, 0.12);
        color: var(--kage-scene);
        box-shadow: 0 0 10px rgba(255, 43, 214, 0.25);
      }
      .sq.m {
        border-color: rgba(255, 43, 214, 0.45);
        background: rgba(255, 43, 214, 0.08);
        color: var(--kage-scene);
      }
      .tile.off .name {
        color: var(--kage-ink-muted);
      }
      .play.small {
        width: 34px;
        height: 30px;
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

      /* --- Poza domem --- */
      .here-dot.away {
        background: var(--kage-scene);
        animation: none;
        box-shadow: 0 0 8px rgba(255, 43, 214, 0.8);
      }
      .away .back {
        margin: 10px 16px 0;
      }
      .screen > .back {
        margin: 10px 16px 0;
      }
      .verdict {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 16px 16px 0;
        padding: 18px 16px;
        border: 1px solid rgba(61, 255, 162, 0.4);
        background: rgba(61, 255, 162, 0.07);
        color: var(--kage-ok);
      }
      .verdict.warn,
      .verdict.info {
        border-color: rgba(255, 179, 0, 0.45);
        background: rgba(255, 179, 0, 0.08);
        color: var(--kage-warn);
      }
      .verdict.info {
        border-color: rgba(0, 229, 255, 0.35);
        background: rgba(0, 229, 255, 0.06);
        color: var(--kage-accent);
      }
      .verdict.crit {
        border-color: rgba(255, 59, 92, 0.6);
        background: rgba(255, 59, 92, 0.12);
        color: var(--kage-crit);
        box-shadow: 0 0 28px rgba(255, 59, 92, 0.25);
      }
      .v-text {
        font-size: 21px;
        font-weight: 600;
        color: var(--kage-ink);
        line-height: 1.2;
      }
      .issues {
        position: relative;
        margin: 10px 16px 0;
        padding: 4px 14px;
      }
      .issue {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 58px;
        padding: 8px 0;
        border-top: 1px solid rgba(0, 229, 255, 0.12);
      }
      .issue:first-child {
        border-top: 0;
      }
      .issue .dot {
        width: 8px;
        height: 8px;
        flex: none;
        background: var(--kage-accent);
        transform: rotate(45deg);
      }
      .issue.warn .dot {
        background: var(--kage-warn);
        box-shadow: 0 0 8px rgba(255, 179, 0, 0.7);
      }
      .issue.crit .dot {
        background: var(--kage-crit);
        box-shadow: 0 0 10px rgba(255, 59, 92, 0.9);
      }
      .i-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .i-title {
        font-size: 16px;
        font-weight: 600;
      }
      .issue.crit .i-title {
        color: var(--kage-crit);
      }
      .i-where {
        font-size: 10.5px;
        letter-spacing: 0.08em;
        color: var(--kage-ink-dim);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .act {
        flex: none;
        height: 36px;
        padding: 0 14px;
        border: 1px solid rgba(0, 229, 255, 0.45);
        background: rgba(0, 229, 255, 0.1);
        color: var(--kage-accent);
        font: 600 13px var(--kage-font-ui);
        letter-spacing: 0.04em;
        cursor: pointer;
      }
      .act.primary {
        background: var(--kage-accent);
        color: var(--kage-on-accent);
        border-color: var(--kage-accent);
      }
      .act.ghost {
        border-color: rgba(159, 176, 198, 0.35);
        background: transparent;
        color: var(--kage-ink-muted);
      }
      .hold {
        position: relative;
        flex: none;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        height: 44px;
        min-width: 112px;
        padding: 0 14px;
        border: 1px solid rgba(255, 179, 0, 0.55);
        background: rgba(255, 179, 0, 0.08);
        color: var(--kage-warn);
        font: 600 13px var(--kage-font-ui);
        cursor: pointer;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      .hold.small {
        height: 40px;
        min-width: 104px;
      }
      .hold .fill {
        position: absolute;
        inset: 0;
        background: rgba(255, 179, 0, 0.35);
        transform: scaleX(0);
        transform-origin: left;
      }
      .hold.holding .fill {
        transform: scaleX(1);
        transition: transform ${HOLD_MS}ms linear;
      }
      .hold .lbl,
      .hold .sub {
        position: relative;
      }
      .hold .sub {
        font-size: 9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.75;
      }
      .secure {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
        width: calc(100% - 32px);
        margin: 12px 16px 0;
        padding: 16px;
        border: 1px solid var(--kage-accent);
        background: rgba(0, 229, 255, 0.12);
        color: var(--kage-accent);
        text-align: left;
        cursor: pointer;
        box-shadow: 0 0 24px rgba(0, 229, 255, 0.18);
      }
      .secure.idle {
        border-color: rgba(159, 176, 198, 0.3);
        background: transparent;
        color: var(--kage-ink-dim);
        box-shadow: none;
        cursor: default;
      }
      .s-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .s-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--kage-ink);
      }
      .s-sub {
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .secure-box {
        position: relative;
        margin: 12px 16px 0;
        padding: 14px;
        border: 1px solid var(--kage-accent);
      }
      .sb-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .step {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 46px;
        font-size: 15px;
        cursor: pointer;
      }
      .step input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .step .box {
        width: 22px;
        height: 22px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--kage-accent);
        background: rgba(0, 229, 255, 0.1);
        color: var(--kage-accent);
      }
      .step input:focus-visible + .box {
        outline: 2px solid var(--kage-accent);
        outline-offset: 2px;
      }
      .tag-hold {
        margin-left: auto;
        font-size: 9.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--kage-warn);
      }
      .sb-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }
      .people {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 18px 16px 0;
      }
      .p-label {
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--kage-ink-dim);
        margin-right: 4px;
      }
      .person {
        padding: 6px 12px;
        border: 1px solid rgba(61, 255, 162, 0.4);
        background: rgba(61, 255, 162, 0.07);
        font-size: 14px;
      }
      .rooms-link {
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 18px 16px 0;
        padding: 0;
        height: 36px;
        border: 0;
        background: transparent;
        color: var(--kage-accent);
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
      }

      /* --- Tablet i laptop --- */
      .screen.wide {
        max-width: 1440px;
        padding: 0 16px 28px;
      }
      .cols {
        display: grid;
        grid-template-columns: minmax(0, 58fr) minmax(340px, 42fr);
        gap: 8px;
        align-items: stretch;
        margin-top: 8px;
      }
      .col-plan {
        min-width: 0;
      }
      .plan-zoom {
        position: relative;
        overflow: hidden;
      }
      .plan-inner {
        transform-origin: top left;
      }
      .col-side {
        min-width: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding-top: 4px;
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .col-side > .panel {
        flex: 1 0 auto;
        display: flex;
        flex-direction: column;
      }
      .col-side > .scenes {
        flex: none;
        margin-bottom: 4px;
      }
      .col-side > .issues {
        flex: 0 1 auto;
      }
      .cols {
        overflow: hidden;
      }
      .wide .col-side .tiles {
        gap: 10px;
      }

      /* --- Rzut z wielokątów --- */
      .rooms-svg,
      .walls-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .rooms-svg polygon,
      .walls-svg polygon {
        vector-effect: non-scaling-stroke;
        stroke-width: 1.2px;
        stroke-linejoin: miter;
      }
      .rshape {
        transition:
          fill 0.5s ease,
          stroke 0.35s ease;
      }
      .rshape.pick {
        pointer-events: auto;
        cursor: pointer;
      }
      .glow-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        filter: blur(9px);
        pointer-events: none;
      }
      .void {
        fill: rgba(0, 229, 255, 0.05);
        stroke: rgba(0, 229, 255, 0.28);
        stroke-dasharray: 3 3;
      }
      .walls-svg {
        transform: translateZ(var(--wall));
        pointer-events: none;
      }
      .walls-svg polygon {
        fill: none;
      }
      .plane > .tag {
        position: absolute;
      }
      .roof {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        pointer-events: none;
      }
      .slope {
        position: absolute;
        display: block;
      }
      .slope svg {
        display: block;
        overflow: visible;
      }
      .slope polygon {
        fill: rgba(0, 229, 255, 0.05);
        stroke: rgba(0, 229, 255, 0.4);
        stroke-width: 1;
        stroke-dasharray: 3 3;
      }
      .ground {
        position: absolute;
        left: calc(50% - ${PLANE_W * 1.3 - 40}px);
        top: ${-20 - PLANE_H * 0.8}px;
        width: ${PLANE_W * 2.6}px;
        height: ${PLANE_H * 2.6}px;
        transform: rotateX(var(--tilt, 62deg)) rotateZ(calc(-42deg + var(--rot, 0deg)));
        background-image:
          repeating-linear-gradient(
            0deg,
            rgba(0, 229, 255, 0.07) 0px,
            rgba(0, 229, 255, 0.07) 1px,
            transparent 1px,
            transparent 12px
          ),
          repeating-linear-gradient(
            90deg,
            rgba(0, 229, 255, 0.07) 0px,
            rgba(0, 229, 255, 0.07) 1px,
            transparent 1px,
            transparent 12px
          );
        -webkit-mask-image: radial-gradient(closest-side, #000 35%, transparent 100%);
        mask-image: radial-gradient(closest-side, #000 35%, transparent 100%);
        pointer-events: none;
      }

      .head-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .edit-plan {
        display: flex;
        align-items: center;
        gap: 7px;
        height: 32px;
        padding: 0 12px;
        border: 1px solid rgba(0, 229, 255, 0.35);
        background: rgba(0, 229, 255, 0.06);
        color: var(--kage-accent);
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .cols.edit {
        display: block;
        padding: 0 4px;
      }

      /* --- gesty na rzucie --- */
      .plan {
        touch-action: none;
        overflow: hidden;
      }
      .plan.gesturing .layer,
      .plan.gesturing .slide,
      .plan.gesturing .layer-body {
        transition: none;
      }
      .view3d {
        position: absolute;
        inset: 0;
        transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(var(--zoom, 1));
        transform-origin: 0 0;
      }
      .view-reset {
        position: absolute;
        top: 4px;
        right: 12px;
        z-index: 25;
        width: 36px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(0, 229, 255, 0.35);
        background: rgba(6, 8, 14, 0.8);
        color: var(--kage-accent);
        cursor: pointer;
      }

      /* --- chowane karty pięter i pasek pomieszczeń --- */
      .floor-card {
        transition:
          transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1),
          opacity 0.3s ease;
      }
      .floor-card.tucked {
        transform: translateX(-80px);
        cursor: pointer;
      }
      .floor-card .fname,
      .floor-card .fmeta {
        transition: opacity 0.2s ease;
      }
      .floor-card.tucked .fname,
      .floor-card.tucked .fmeta {
        opacity: 0;
      }
      .fshort {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        font-size: 15px;
        font-weight: 700;
        color: var(--kage-ink-muted);
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .floor-card.tucked .fshort {
        opacity: 1;
      }
      .floor-card.active .fshort {
        color: var(--kage-accent);
      }
      .floor-card.active.outdoor .fshort {
        color: var(--kage-climate);
      }
      .fdot {
        width: 6px;
        height: 6px;
        background: var(--kage-light, #ffb300);
        box-shadow: 0 0 6px rgba(255, 179, 0, 0.9);
        transform: rotate(45deg);
      }
      .plane.go {
        pointer-events: auto;
        cursor: pointer;
      }
      .strip-grip {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 18px;
        margin-top: 4px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      }
      .strip-grip .bar {
        width: 44px;
        height: 4px;
        border-radius: 2px;
        background: rgba(0, 229, 255, 0.35);
        transition: background 0.2s ease;
      }
      .strip-grip.closed .bar {
        background: rgba(0, 229, 255, 0.7);
        box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
      }
      .strip-grip + .room-strip {
        padding-top: 4px;
      }
    `,
  ];
}

if (!customElements.get("kage-home-card")) {
  customElements.define("kage-home-card", KageHomeCard);
}
