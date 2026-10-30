/**
 * 표 합계 — 한글 "블록 합계"(Ctrl+Shift+S)처럼 동작한다.
 *
 *  ① 칸 여러 개를 드래그해 선택하고 합계:
 *     - 선택의 맨 아래 줄에 빈 칸(또는 ○○ 칸)이 있으면 → 그 칸에 위쪽 숫자들의 세로 합계
 *     - 아니고 맨 오른쪽 칸들이 비어 있으면 → 가로 합계
 *  ② 커서만 합계 칸(빈 칸이나 ○○)에 두고 합계 → 같은 열 위쪽 숫자를 모두 더함
 *
 * 숫자 해석: "12", "1,234", "12개", "3.5" (숫자 하나 + 짧은 단위). 숫자가 아닌 칸은 건너뛴다.
 * 결과는 그 칸의 원래 글자 서식(굵게 등)을 그대로 쓴다.
 */
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables';

/** 칸 글자 → 숫자 (숫자가 아니면 null) */
export function cellNumber(text: string): number | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^([-+]?\d{1,3}(?:,\d{3})+|[-+]?\d+)(\.\d+)?\s*[가-힣a-zA-Z%()]{0,4}$/);
  if (!m) return null;
  return parseFloat((m[1] + (m[2] ?? '')).replace(/,/g, ''));
}

/** 합계를 넣을 수 있는 칸: 비었거나 ○ 만 있음 */
export const isTarget = (text: string) => /^[\s○]*$/.test(text);

export function formatSum(v: number, sources: string[]): string {
  const decimals = Math.max(0, ...sources.map((s) => s.match(/\.(\d+)/)?.[1].length ?? 0));
  const useComma = Math.abs(v) >= 1000 || sources.some((s) => /\d,\d{3}/.test(s));
  return v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: useComma });
}

interface Grid {
  map: TableMap;
  table: PMNode;
  tableStart: number;
  /** 격자 [줄][칸] → 셀 위치(표 안 상대 위치) */
  at: (row: number, col: number) => number;
  cell: (pos: number) => PMNode;
}

function gridOf(table: PMNode, tableStart: number): Grid {
  const map = TableMap.get(table);
  return {
    map,
    table,
    tableStart,
    at: (r, c) => map.map[r * map.width + c],
    cell: (pos) => table.nodeAt(pos)!,
  };
}

/** 칸 안의 글자를 value 로 바꾼다 (첫 문단, 원래 서식 유지) */
function writeCell(editor: Editor, tr: import('@tiptap/pm/state').Transaction, cellPos: number, value: string) {
  const cell = tr.doc.nodeAt(cellPos)!;
  const para = cell.firstChild!;
  const paraStart = cellPos + 1;
  const marks = para.firstChild?.marks ?? [];
  const text = editor.schema.text(value, marks);
  tr.replaceWith(paraStart + 1, paraStart + para.nodeSize - 1, text);
  // 둘째 문단부터는 지운다 (합계 칸은 숫자 하나)
  if (cell.childCount > 1) {
    const after = tr.doc.nodeAt(cellPos)!;
    const firstEnd = cellPos + 1 + after.firstChild!.nodeSize;
    tr.delete(firstEnd, cellPos + after.nodeSize - 1);
  }
}

export interface SumResult {
  ok: boolean;
  message: string;
}

export function sumTable(editor: Editor): SumResult {
  const { state } = editor;
  const sel = state.selection;
  let tablePos: number;
  let rect: { left: number; right: number; top: number; bottom: number };
  let grid: Grid;

  if (sel instanceof CellSelection) {
    const $cell = sel.$anchorCell;
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    tablePos = tableStart - 1;
    grid = gridOf(table, tableStart);
    const a = grid.map.findCell(sel.$anchorCell.pos - tableStart);
    const b = grid.map.findCell(sel.$headCell.pos - tableStart);
    rect = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
  } else {
    const $cell = cellAround(sel.$from);
    if (!$cell) return { ok: false, message: '표 안에서 합계를 낼 칸을 선택하세요.' };
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    tablePos = tableStart - 1;
    grid = gridOf(table, tableStart);
    const r = grid.map.findCell($cell.pos - tableStart);
    // 커서 칸이 합계 칸: 같은 열의 맨 위부터 이 칸까지
    rect = { left: r.left, right: r.left + 1, top: 0, bottom: r.bottom };
    const own = grid.cell($cell.pos - tableStart);
    if (!isTarget(own.textContent)) return { ok: false, message: '합계를 넣을 칸(빈 칸 또는 ○○)에 커서를 두거나, 더할 칸들을 드래그해 선택하세요.' };
  }
  void tablePos;

  const { left, right, top, bottom } = rect;
  const textAt = (pos: number) => grid.cell(pos).textContent;

  /** 한 줄(세로 또는 가로) 합계 계산 → [대상 칸 위치, 합, 원본 글자들] */
  const line = (cells: number[]): { target: number; sum: number; sources: string[] } | null => {
    const unique = [...new Set(cells)];
    const target = unique[unique.length - 1];
    if (!isTarget(textAt(target))) return null;
    const sources: string[] = [];
    let sum = 0;
    for (const p of unique.slice(0, -1)) {
      const t = textAt(p);
      const n = cellNumber(t);
      if (n !== null) {
        sum += n;
        sources.push(t);
      }
    }
    return sources.length ? { target, sum, sources } : null;
  };

  const jobs: { target: number; sum: number; sources: string[] }[] = [];
  // 세로 합계: 열마다 맨 아래 칸이 대상
  for (let c = left; c < right; c++) {
    const cells: number[] = [];
    for (let r = top; r < bottom; r++) cells.push(grid.at(r, c));
    const j = line(cells);
    if (j && !jobs.some((x) => x.target === j.target)) jobs.push(j);
  }
  // 세로로 넣을 데가 없으면 가로 합계: 줄마다 맨 오른쪽 칸이 대상
  if (!jobs.length) {
    for (let r = top; r < bottom; r++) {
      const cells: number[] = [];
      for (let c = left; c < right; c++) cells.push(grid.at(r, c));
      const j = line(cells);
      if (j && !jobs.some((x) => x.target === j.target)) jobs.push(j);
    }
  }

  if (!jobs.length) {
    // 넣을 칸이 없으면 선택한 숫자의 합만 알려 준다
    const all = new Set<number>();
    for (let r = top; r < bottom; r++) for (let c = left; c < right; c++) all.add(grid.at(r, c));
    const nums = [...all].map((p) => textAt(p)).filter((t) => cellNumber(t) !== null);
    if (!nums.length) return { ok: false, message: '선택한 칸에 더할 숫자가 없습니다.' };
    const total = nums.reduce((s, t) => s + cellNumber(t)!, 0);
    return { ok: false, message: `선택한 숫자 ${nums.length}개의 합계: ${formatSum(total, nums)} — 합계를 넣으려면 빈 칸(또는 ○○)까지 함께 선택하세요.` };
  }

  const tr = state.tr;
  // 문서 뒤쪽 칸부터 바꿔야 앞쪽 위치가 어긋나지 않는다
  for (const j of [...jobs].sort((a, b) => b.target - a.target)) writeCell(editor, tr, grid.tableStart + j.target, formatSum(j.sum, j.sources));
  editor.view.dispatch(tr.scrollIntoView());
  const desc = jobs.map((j) => formatSum(j.sum, j.sources)).join(', ');
  return { ok: true, message: `합계를 넣었습니다: ${desc}` };
}
