/**
 * 칸 테두리 — 기본값, 정리, 이웃 칸과 맞추기, CSS ↔ 모델.
 *
 * 한글과 Word 는 칸마다 자기 네 변의 선을 따로 저장한다. 맞닿은 두 칸 중 한쪽만 "선 없음"이면
 * 다른 쪽 선이 그대로 그려지므로, 저장 전에 resolveEdges 로 이웃 칸의 맞닿은 변을 같게 맞춘다.
 */
import type { BorderLine, CellBorders, LineStyle, Table, TableCell } from './types';
import { TABLE_DEFAULTS } from './defaults';
import { placeCells } from './table';
import { snapBorderMm } from './units';

export const SIDES = ['top', 'bottom', 'left', 'right'] as const;
export type Side = (typeof SIDES)[number];

export const DEFAULT_BORDER: BorderLine = { style: 'solid', widthMm: TABLE_DEFAULTS.borderMm, color: '#000000' };
export const NO_BORDER: BorderLine = { style: 'none', widthMm: 0.1, color: '#000000' };

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** 선 하나를 정리 — 굵기는 한글 허용값으로, 선 없음은 하나의 모양으로 */
export function cleanLine(b: BorderLine): BorderLine {
  if (b.style === 'none') return { ...NO_BORDER };
  const color = /^#[0-9A-F]{6}$/i.test(b.color) ? b.color.toUpperCase() : '#000000';
  return { style: b.style, widthMm: snapBorderMm(b.widthMm), color };
}

export const sameLine = (a: BorderLine, b: BorderLine) =>
  a.style === b.style && (a.style === 'none' || (Math.abs(a.widthMm - b.widthMm) < 0.001 && a.color.toUpperCase() === b.color.toUpperCase()));

/** 기본 선과 같은 변은 지우고, 남은 것이 없으면 undefined */
export function cleanBorders(cb: CellBorders | undefined | null): CellBorders | undefined {
  if (!cb) return undefined;
  const out: CellBorders = {};
  for (const s of SIDES) {
    const b = cb[s];
    if (!b) continue;
    const c = cleanLine(b);
    if (!sameLine(c, DEFAULT_BORDER)) out[s] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

export const lineOf = (cell: TableCell, side: Side): BorderLine => cell.borders?.[side] ?? DEFAULT_BORDER;

/**
 * 맞닿은 변 맞추기: 한 칸만 기본 선이 아닌 값을 가지면 이웃 칸의 맞닿은 변에도 같은 값을 넣는다.
 * (마크다운에서 한 칸에만 border-bottom 을 써도 한글·Word 에서 똑같이 보이도록)
 * 둘 다 값을 가졌는데 서로 다르면 더 굵은 쪽, 같은 굵기면 "선 없음"이 아닌 쪽을 쓴다 (Word 의 충돌 규칙과 비슷).
 */
export function resolveEdges(t: Table): Table {
  const { placed, rowCount, colCount } = placeCells(t);
  const all = placed.flat();
  if (!all.some((pc) => pc.cell.borders)) return t;
  const grid: (number | undefined)[][] = Array.from({ length: rowCount }, () => new Array(colCount).fill(undefined));
  all.forEach((pc, i) => {
    for (let r = pc.row; r < pc.row + pc.rowspan; r++) for (let c = pc.col; c < pc.col + pc.colspan; c++) if (r < rowCount) grid[r][c] = i;
  });
  const borders = all.map((pc) => ({ ...(pc.cell.borders ?? {}) }) as CellBorders);
  const neighbors = (i: number, side: Side): number[] => {
    const pc = all[i];
    const out = new Set<number>();
    if (side === 'top' || side === 'bottom') {
      const r = side === 'top' ? pc.row - 1 : pc.row + pc.rowspan;
      if (r < 0 || r >= rowCount) return [];
      for (let c = pc.col; c < pc.col + pc.colspan; c++) if (grid[r][c] !== undefined) out.add(grid[r][c]!);
    } else {
      const c = side === 'left' ? pc.col - 1 : pc.col + pc.colspan;
      if (c < 0 || c >= colCount) return [];
      for (let r = pc.row; r < pc.row + pc.rowspan && r < rowCount; r++) if (grid[r][c] !== undefined) out.add(grid[r][c]!);
    }
    return [...out];
  };
  const stronger = (a: BorderLine, b: BorderLine) => {
    if (a.style === 'none') return b;
    if (b.style === 'none') return a;
    return b.widthMm > a.widthMm ? b : a;
  };
  const orig = all.map((pc) => pc.cell.borders ?? {});
  all.forEach((_pc, i) => {
    for (const side of SIDES) {
      const mine = orig[i][side];
      if (!mine) continue;
      for (const j of neighbors(i, side)) {
        const opp = OPPOSITE[side];
        const theirs = orig[j][opp];
        borders[j][opp] = theirs ? stronger(theirs, mine) : mine;
        borders[i][side] = theirs ? stronger(mine, theirs) : mine;
      }
    }
  });
  let k = 0;
  const rows = placed.map((row) =>
    row.map((pc) => {
      const b = cleanBorders(borders[k++]);
      const cell: TableCell = { ...pc.cell };
      if (b) cell.borders = b;
      else delete cell.borders;
      return cell;
    }),
  );
  return { ...t, rows };
}

// ───────── CSS (편집기 · 마크다운 HTML) ─────────

const PX_MM = 25.4 / 96;
const PT_MM = 25.4 / 72;

function parseLineValue(v: string): BorderLine | null {
  const tokens = v.trim().toLowerCase().split(/\s+/);
  let style: LineStyle | undefined;
  let widthMm: number | undefined;
  let color = '#000000';
  for (const t of tokens) {
    if (t === 'none' || t === 'hidden' || t === '0') style = 'none';
    else if (t === 'double') style = 'double';
    else if (['solid', 'dashed', 'dotted', 'groove', 'ridge', 'inset', 'outset'].includes(t)) style = 'solid';
    else if (t === 'thin') widthMm = 0.12;
    else if (t === 'medium') widthMm = 0.4;
    else if (t === 'thick') widthMm = 0.7;
    else if (/^[\d.]+(mm|pt|px|cm)?$/.test(t)) {
      const n = parseFloat(t);
      widthMm = t.endsWith('mm') ? n : t.endsWith('cm') ? n * 10 : t.endsWith('pt') ? n * PT_MM : n * PX_MM;
      if (n === 0) style = 'none';
    } else if (/^#[0-9a-f]{6}$/.test(t)) color = t.toUpperCase();
    else if (/^#[0-9a-f]{3}$/.test(t)) color = `#${t.slice(1).split('').map((c) => c + c).join('').toUpperCase()}`;
    else if (t === 'black') color = '#000000';
  }
  if (!style) style = widthMm !== undefined ? 'solid' : undefined;
  if (!style) return null;
  return cleanLine({ style, widthMm: widthMm ?? (style === 'double' ? 0.5 : TABLE_DEFAULTS.borderMm), color });
}

/** style="border-top:0.4mm solid #000; border-left:none" → CellBorders (기본 선과 같은 변은 빠짐) */
export function cssToBorders(style: string | null | undefined): CellBorders | undefined {
  if (!style) return undefined;
  const out: CellBorders = {};
  for (const m of style.matchAll(/(?:^|;)\s*border(?:-(top|bottom|left|right))?\s*:\s*([^;]+)/gi)) {
    const line = parseLineValue(m[2]);
    if (!line) continue;
    const sides = m[1] ? [m[1].toLowerCase() as Side] : SIDES;
    for (const s of sides) out[s] = line;
  }
  return cleanBorders(out);
}

const fmtMm = (n: number) => `${+n.toFixed(2)}mm`;
/**
 * @param screen 편집 화면용 — 모니터에서는 0.12mm 와 0.4mm 가 똑같이 1px 로 보이므로
 *               굵기를 px 로 올려 잡아 굵은 선·겹선이 구분되게 한다 (저장 값은 바뀌지 않음)
 */
export function lineToCss(b: BorderLine, screen = false): string {
  if (b.style === 'none') return 'none';
  if (!screen) return `${fmtMm(b.widthMm)} ${b.style} ${b.color}`;
  const px = b.style === 'double' ? Math.max(3, Math.round(b.widthMm / PX_MM)) : Math.max(1, Math.round(b.widthMm / PX_MM + 0.3));
  return `${px}px ${b.style} ${b.color}`;
}

export function bordersToCss(cb: CellBorders | undefined | null, screen = false): string {
  if (!cb) return '';
  return SIDES.filter((s) => cb[s]).map((s) => `border-${s}: ${lineToCss(cb[s]!, screen)}`).join('; ');
}
