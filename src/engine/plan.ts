import { autoLayout } from "./layout";
import type { FloorModel } from "./model";

// Rzut piętra w jednostkach siatki. Zapisywany w konfiguracji strategii (`plan:`),
// edytowany w KAGE przez administratora. Brak wpisu dla piętra = układ automatyczny.

export type Pt = [number, number];
export type Side = "right" | "left" | "front" | "back";

export interface FloorPlanConfig {
  cols?: number;
  rows?: number;
  side?: Side; // gdzie leży to piętro względem budynku (dla stref z tego samego poziomu)
  roof?: boolean; // poddasze: linie dachu nad rzutem
  rooms?: Record<string, Pt[]>; // obszar → wielokąt
  voids?: Pt[][]; // puste obszary (np. zarys domu na piętrze z ogrodem)
}

export interface PlanConfig {
  floors?: Record<string, FloorPlanConfig>;
}

export interface ResolvedRoom {
  id: string;
  points: Pt[];
}

export interface ResolvedPlan {
  cols: number;
  rows: number;
  side: Side;
  roof: boolean;
  auto: boolean;
  rooms: ResolvedRoom[];
  voids: Pt[][];
  unplaced: string[]; // obszary piętra bez wielokąta (do umieszczenia w edytorze)
}

export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 16;
export const SIDES: Side[] = ["right", "left", "front", "back"];

const ATTIC = /attic|loft|poddasz|strych|阁楼/i;

export function rect(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

// Litera L: prostokąt bez prawego dolnego narożnika (wycięcie połowy szerokości i wysokości).
export function lShape(x: number, y: number, w: number, h: number): Pt[] {
  const cw = Math.max(1, Math.round(w / 2));
  const ch = Math.max(1, Math.round(h / 2));
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h - ch],
    [x + w - cw, y + h - ch],
    [x + w - cw, y + h],
    [x, y + h],
  ];
}

export function bbox(points: Pt[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Środek ciężkości wielokąta (do etykiety); dla zdegenerowanych – środek prostokąta otaczającego.
export function centroid(points: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bbox(points);
    return [b.x + b.w / 2, b.y + b.h / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export const clampPt = (p: Pt, cols: number, rows: number): Pt => [
  Math.min(cols, Math.max(0, Math.round(p[0]))),
  Math.min(rows, Math.max(0, Math.round(p[1]))),
];

// Przesunięcie całego wielokąta z utrzymaniem go w granicach piętra.
export function moveBy(points: Pt[], dx: number, dy: number, cols: number, rows: number): Pt[] {
  const b = bbox(points);
  const mx = Math.min(cols - (b.x + b.w), Math.max(-b.x, Math.round(dx)));
  const my = Math.min(rows - (b.y + b.h), Math.max(-b.y, Math.round(dy)));
  return points.map(([x, y]) => [x + mx, y + my]);
}

// Nowy wierzchołek w połowie krawędzi za wierzchołkiem `i`.
export function insertVertex(points: Pt[], i: number): Pt[] {
  const a = points[i]!;
  const b = points[(i + 1) % points.length]!;
  const mid: Pt = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  return [...points.slice(0, i + 1), mid, ...points.slice(i + 1)];
}

export function removeVertex(points: Pt[], i: number): Pt[] {
  return points.length <= 3 ? points : points.filter((_, k) => k !== i);
}

export function isAtticFloor(floor: { name: string; icon?: string | null }): boolean {
  return ATTIC.test(floor.name) || /home-roof|roof/.test(floor.icon ?? "");
}

const validPts = (v: unknown): v is Pt[] =>
  Array.isArray(v) &&
  v.length >= 3 &&
  v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)));

// Układ automatyczny w jednostkach siatki (gdy dla piętra nie zapisano rzutu).
export function autoPlan(
  floor: FloorModel,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
): ResolvedRoom[] {
  const rects = autoLayout(floor.areas.length, cols / rows);
  return floor.areas.map((a, i) => {
    const r = rects[i]!;
    const x = Math.round(r.x * cols);
    const y = Math.round(r.y * rows);
    const x2 = Math.round((r.x + r.w) * cols);
    const y2 = Math.round((r.y + r.h) * rows);
    return { id: a.id, points: rect(x, y, x2 - x, y2 - y) };
  });
}

export function resolvePlan(
  plan: PlanConfig | undefined,
  floor: FloorModel & { icon?: string | null },
): ResolvedPlan {
  const cfg = plan?.floors?.[floor.id];
  const cols = cfg?.cols && cfg.cols >= 4 ? Math.round(cfg.cols) : DEFAULT_COLS;
  const rows = cfg?.rows && cfg.rows >= 4 ? Math.round(cfg.rows) : DEFAULT_ROWS;
  const side = cfg?.side && SIDES.includes(cfg.side) ? cfg.side : "right";
  const roof = cfg?.roof ?? isAtticFloor(floor);
  const voids = (cfg?.voids ?? []).filter(validPts);
  if (!cfg?.rooms) {
    return {
      cols,
      rows,
      side,
      roof,
      auto: true,
      rooms: autoPlan(floor, cols, rows),
      voids,
      unplaced: [],
    };
  }
  const rooms: ResolvedRoom[] = [];
  const unplaced: string[] = [];
  for (const a of floor.areas) {
    const pts = cfg.rooms[a.id];
    if (validPts(pts)) rooms.push({ id: a.id, points: pts });
    else unplaced.push(a.id);
  }
  return { cols, rows, side, roof, auto: false, rooms, voids, unplaced };
}

// Zapis rzutu piętra z powrotem do konfiguracji (bez pól równych wartościom domyślnym).
export function writeFloor(
  plan: PlanConfig | undefined,
  floorId: string,
  floor: Omit<ResolvedPlan, "auto" | "unplaced"> | null,
): PlanConfig {
  const floors = { ...(plan?.floors ?? {}) };
  if (!floor) {
    delete floors[floorId];
  } else {
    const cfg: FloorPlanConfig = {
      rooms: Object.fromEntries(floor.rooms.map((r) => [r.id, r.points])),
    };
    if (floor.cols !== DEFAULT_COLS) cfg.cols = floor.cols;
    if (floor.rows !== DEFAULT_ROWS) cfg.rows = floor.rows;
    if (floor.side !== "right") cfg.side = floor.side;
    cfg.roof = floor.roof;
    if (floor.voids.length) cfg.voids = floor.voids;
    floors[floorId] = cfg;
  }
  return { ...(plan ?? {}), floors };
}

// Wolne miejsce na nowy pokój: pierwszy prostokąt w×h niezachodzący na prostokąty otaczające.
export function freeSpot(taken: Pt[][], cols: number, rows: number, w = 4, h = 4): Pt[] {
  const boxes = taken.map(bbox);
  for (let y = 0; y + h <= rows; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      const hit = boxes.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
      if (!hit) return rect(x, y, w, h);
    }
  }
  return rect(0, 0, w, h);
}
