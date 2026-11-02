// Automatyczny układ pokoi na płaszczyźnie piętra, do czasu edytora rzutu (etap 6).
// Siatka zbliżona do proporcji płaszczyzny; ostatni rząd rozciąga się na całą szerokość.

export interface Rect {
  x: number; // 0..1
  y: number;
  w: number;
  h: number;
}

export function autoLayout(count: number, aspect = 1.25): Rect[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt(count * aspect))));
  const rows = Math.ceil(count / cols);
  const rects: Rect[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? count - row * cols : cols;
    const col = i - row * cols;
    rects.push({ x: col / inRow, y: row / rows, w: 1 / inRow, h: 1 / rows });
  }
  return rects;
}
