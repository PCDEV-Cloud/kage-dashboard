import { autoLayout } from "./layout";
import type { FloorModel } from "./model";

// Rzut piętra w jednostkach siatki. Zapisywany w konfiguracji strategii (`plan:`),
// edytowany w KAGE przez administratora. Brak wpisu dla piętra = układ automatyczny.

export type Pt = [number, number];
// Położenie strefy na swoim poziomie, na siatce 3 × 3 widzianej jak rzut w edytorze
// („back” = góra rzutu, „front” = dół). Poprzednie wartości (right, left, front, back) zostają.
export type Side =
  | "center"
  | "left"
  | "right"
  | "back"
  | "front"
  | "back-left"
  | "back-right"
  | "front-left"
  | "front-right";

export interface FloorPlanConfig {
  cols?: number;
  rows?: number;
  side?: Side; // gdzie leży to piętro względem budynku (dla stref z tego samego poziomu)
  roof?: boolean | RoofConfig; // poddasze: dach nad rzutem (true = dwuspadowy, 30°)
  rooms?: Record<string, Pt[] | RoomShape>; // obszar → wielokąt (albo z krawędziami przerywanymi)
  outdoor?: boolean; // teren zewnętrzny (zielony); brak = zgadywany z nazwy i ikony
  voids?: Pt[][]; // puste obszary (np. zarys domu na piętrze z ogrodem)
  voidStairs?: number[]; // numery pustych obszarów oznaczonych jako schody
}

// Dach poddasza. Kalenica „x” biegnie poziomo na rzucie w edytorze (spadki do góry i do dołu
// rzutu), „y” pionowo (spadki w lewo i w prawo). Czterospadowy ma spadki ze wszystkich stron.
export type RoofType = "gable" | "hip";
export type Ridge = "x" | "y";

export interface RoofConfig {
  type?: RoofType;
  ridge?: Ridge;
  pitch?: number; // kąt spadku w stopniach
}

export interface Roof {
  type: RoofType;
  ridge: Ridge;
  pitch: number;
}

export const ROOF_PITCH_MIN = 10;
export const ROOF_PITCH_MAX = 60;
export const DEFAULT_ROOF: Roof = { type: "gable", ridge: "x", pitch: 30 };

export function resolveRoof(v: boolean | RoofConfig | undefined, guess: boolean): Roof | null {
  if (v === false || (v === undefined && !guess)) return null;
  if (v === true || v === undefined) return { ...DEFAULT_ROOF };
  const pitch = Number.isFinite(v.pitch)
    ? Math.min(ROOF_PITCH_MAX, Math.max(ROOF_PITCH_MIN, Math.round(v.pitch!)))
    : DEFAULT_ROOF.pitch;
  return {
    type: v.type === "hip" ? "hip" : "gable",
    ridge: v.ridge === "y" ? "y" : "x",
    pitch,
  };
}

// Linie dachu na rzucie (widok z góry), w jednostkach siatki: kalenica i narożniki.
export function roofLines(cols: number, rows: number, roof: Roof): [Pt, Pt][] {
  const along = roof.ridge === "x" ? cols : rows;
  const across = roof.ridge === "x" ? rows : cols;
  const half = across / 2;
  const inset = roof.type === "hip" ? Math.min(half, along / 2) : 0;
  const map = (a: number, b: number): Pt => (roof.ridge === "x" ? [a, b] : [b, a]);
  const lines: [Pt, Pt][] = [[map(inset, half), map(along - inset, half)]];
  if (roof.type === "hip") {
    lines.push(
      [map(0, 0), map(inset, half)],
      [map(0, across), map(inset, half)],
      [map(along, 0), map(along - inset, half)],
      [map(along, across), map(along - inset, half)],
    );
  }
  return lines;
}

export interface PlanConfig {
  floors?: Record<string, FloorPlanConfig>;
}

// Pokój z krawędziami bez ściany (linia przerywana, np. przejście do salonu w otwartej
// przestrzeni). `dashed` to numery krawędzi: krawędź i łączy wierzchołek i z i+1.
export interface RoomShape {
  points: Pt[];
  dashed?: number[];
  stairs?: boolean; // schody; brak = zgadywane z nazwy pomieszczenia
}

export interface ResolvedRoom {
  id: string;
  points: Pt[];
  dashed?: number[];
  stairs?: boolean;
}

const STAIRS_NAME = /stair|schod|楼梯/i;

export const isStairsName = (name: string): boolean => STAIRS_NAME.test(name);

// Schody w pokoju: ustawione w edytorze albo zgadnięte z nazwy.
export const roomIsStairs = (r: ResolvedRoom, name: string): boolean =>
  r.stairs ?? isStairsName(name);

// Linie stopni: prostopadłe do dłuższego boku prostokąta otaczającego, co `step` kratki.
// Rysowane z przycięciem do wielokąta (clipPath), więc pasują też do kształtu L.
export function stairLines(points: Pt[], step = 0.7): [Pt, Pt][] {
  const b = bbox(points);
  const alongX = b.w >= b.h;
  const len = alongX ? b.w : b.h;
  const n = Math.max(1, Math.round(len / step) - 1); // liczba linii wewnątrz
  const gap = len / (n + 1);
  const lines: [Pt, Pt][] = [];
  for (let k = 1; k <= n; k += 1) {
    const t = (alongX ? b.x : b.y) + k * gap;
    lines.push(
      alongX
        ? [
            [t, b.y],
            [t, b.y + b.h],
          ]
        : [
            [b.x, t],
            [b.x + b.w, t],
          ],
    );
  }
  return lines;
}

// Numery krawędzi po wstawieniu wierzchołka za `i`: krawędź i dzieli się na dwie.
export function dashedAfterInsert(dashed: number[] | undefined, i: number): number[] {
  const out: number[] = [];
  for (const e of dashed ?? []) {
    if (e < i) out.push(e);
    else if (e === i) out.push(i, i + 1);
    else out.push(e + 1);
  }
  return out;
}

// Numery krawędzi po usunięciu wierzchołka `i` z wielokąta o `n` wierzchołkach: krawędzie
// i−1 oraz i łączą się w jedną (przerywaną, jeśli któraś była).
export function dashedAfterRemove(dashed: number[] | undefined, i: number, n: number): number[] {
  const prev = (i - 1 + n) % n;
  const set = new Set<number>();
  for (const e of dashed ?? []) {
    let m: number;
    if (e === i || e === prev) m = prev;
    else m = e;
    if (m > i) m -= 1;
    else if (m === prev && prev > i) m -= 1;
    set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}

export function toggleDashed(dashed: number[] | undefined, e: number): number[] {
  const set = new Set(dashed ?? []);
  if (set.has(e)) set.delete(e);
  else set.add(e);
  return [...set].sort((a, b) => a - b);
}

export interface ResolvedPlan {
  cols: number;
  rows: number;
  outdoor: boolean | null; // null = zgadywany
  side: Side | null; // null = domyślnie (pierwsza strefa w środku, kolejne dookoła)
  roof: Roof | null;
  auto: boolean;
  rooms: ResolvedRoom[];
  voids: Pt[][];
  voidStairs: number[];
  unplaced: string[]; // obszary piętra bez wielokąta (do umieszczenia w edytorze)
}

export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 16;
// Kolejność jak na siatce 3 × 3 (wierszami od góry rzutu).
export const SIDES: Side[] = [
  "back-left",
  "back",
  "back-right",
  "left",
  "center",
  "right",
  "front-left",
  "front",
  "front-right",
];

// Wektor kratki dla położenia: x w prawo, y w dół rzutu.
export const SIDE_VECTOR: Record<Side, [number, number]> = {
  center: [0, 0],
  left: [-1, 0],
  right: [1, 0],
  back: [0, -1],
  front: [0, 1],
  "back-left": [-1, -1],
  "back-right": [1, -1],
  "front-left": [-1, 1],
  "front-right": [1, 1],
};

const DEFAULT_ORDER: Side[] = [
  "center",
  "right",
  "left",
  "back",
  "front",
  "back-right",
  "back-left",
  "front-right",
  "front-left",
];

// Położenia stref jednego poziomu: zapisane albo domyślne (pierwsza w środku, kolejne
// w wolnych kratkach dookoła).
export function groupSides(sides: (Side | null)[]): Side[] {
  const taken = new Set(sides.filter((x): x is Side => !!x));
  const free = DEFAULT_ORDER.filter((x) => !taken.has(x));
  return sides.map((x) => x ?? free.shift() ?? "right");
}

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

// Pole wielokąta (wzór Gaussa), w jednostkach siatki.
export function polygonArea(points: Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
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
  const side = cfg?.side && SIDES.includes(cfg.side) ? cfg.side : null;
  const roof = resolveRoof(cfg?.roof, isAtticFloor(floor));
  const voids = (cfg?.voids ?? []).filter(validPts);
  const outdoor = typeof cfg?.outdoor === "boolean" ? cfg.outdoor : null;
  const voidStairs = (cfg?.voidStairs ?? []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < voids.length,
  );
  if (!cfg?.rooms) {
    return {
      cols,
      rows,
      outdoor,
      side,
      roof,
      auto: true,
      rooms: autoPlan(floor, cols, rows),
      voids,
      voidStairs,
      unplaced: [],
    };
  }
  const rooms: ResolvedRoom[] = [];
  const unplaced: string[] = [];
  for (const a of floor.areas) {
    const v = cfg.rooms[a.id];
    const pts = Array.isArray(v) ? v : v?.points;
    if (validPts(pts)) {
      const n = pts.length;
      const dashed = Array.isArray(v)
        ? undefined
        : v?.dashed?.filter((e) => Number.isInteger(e) && e >= 0 && e < n);
      const stairs = Array.isArray(v) ? undefined : v?.stairs;
      rooms.push({
        id: a.id,
        points: pts,
        ...(dashed?.length ? { dashed } : {}),
        ...(typeof stairs === "boolean" ? { stairs } : {}),
      });
    } else unplaced.push(a.id);
  }
  return { cols, rows, outdoor, side, roof, auto: false, rooms, voids, voidStairs, unplaced };
}

// Zapis rzutu piętra z powrotem do konfiguracji (bez pól równych wartościom domyślnym).
export function writeFloor(
  plan: PlanConfig | undefined,
  floorId: string,
  floor:
    | (Omit<ResolvedPlan, "auto" | "unplaced" | "voidStairs"> & { voidStairs?: number[] })
    | null,
): PlanConfig {
  const floors = { ...(plan?.floors ?? {}) };
  if (!floor) {
    delete floors[floorId];
  } else {
    const cfg: FloorPlanConfig = {
      rooms: Object.fromEntries(
        floor.rooms.map((r) => [
          r.id,
          r.dashed?.length || typeof r.stairs === "boolean"
            ? {
                points: r.points,
                ...(r.dashed?.length ? { dashed: r.dashed } : {}),
                ...(typeof r.stairs === "boolean" ? { stairs: r.stairs } : {}),
              }
            : r.points,
        ]),
      ),
    };
    if (floor.outdoor !== null) cfg.outdoor = floor.outdoor;
    if (floor.cols !== DEFAULT_COLS) cfg.cols = floor.cols;
    if (floor.rows !== DEFAULT_ROWS) cfg.rows = floor.rows;
    if (floor.side) cfg.side = floor.side;
    cfg.roof = floor.roof ?? false;
    if (floor.voids.length) cfg.voids = floor.voids;
    if (floor.voidStairs?.length) cfg.voidStairs = floor.voidStairs;
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
