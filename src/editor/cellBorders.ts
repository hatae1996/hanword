/**
 * 칸 테두리 바꾸기 — 리본의 "테두리" 목록.
 *
 * 선택한 칸들(또는 커서가 있는 칸)을 하나의 사각형으로 보고 바깥 변/안쪽 변에 규칙을 적용한다.
 * 맞닿은 이웃 칸(선택 밖)의 변도 같이 바꾼다 — 한글·Word 는 칸마다 자기 변을 그리므로
 * 한쪽만 "선 없음"이면 다른 쪽 선이 그대로 보이기 때문.
 */
import type { Editor } from '@tiptap/core';
import { TableMap, selectedRect } from '@tiptap/pm/tables';
import type { BorderLine, CellBorders } from '../model/types';
import { NO_BORDER, SIDES, cleanBorders, type Side } from '../model/borders';

const THIN = undefined; // 기본 선 (0.12mm)
const THICK: BorderLine = { style: 'solid', widthMm: 0.4, color: '#000000' };
const DOUBLE: BorderLine = { style: 'double', widthMm: 0.5, color: '#000000' };
const NONE: BorderLine = NO_BORDER;
/** null = 그 변은 그대로 둔다 */
type Rule = (side: Side, outer: boolean, ctx: { top: number; bottom: number; rectTop: number }) => BorderLine | undefined | null;

export const BORDER_PRESETS: Record<string, { label: string; whole?: boolean; rule: Rule }> = {
  default: { label: '기본 선', rule: () => THIN },
  none: { label: '선 없음', rule: () => NONE },
  outer: { label: '바깥 굵게', rule: (_s, outer) => (outer ? THICK : null) },
  topbottom: { label: '위·아래 선만 (제목 상자)', rule: (s, outer) => (outer && (s === 'top' || s === 'bottom') ? THICK : NONE) },
  'bottom-thick': { label: '아래 굵게', rule: (s, outer) => (outer && s === 'bottom' ? THICK : null) },
  'bottom-double': { label: '아래 겹선', rule: (s, outer) => (outer && s === 'bottom' ? DOUBLE : null) },
  'top-thick': { label: '위 굵게', rule: (s, outer) => (outer && s === 'top' ? THICK : null) },
  official: {
    label: '공문 표 (표 전체)',
    whole: true,
    // 위·아래 바깥선 굵게, 좌우 바깥선 없음, 머리행 아래 겹선, 안쪽은 가는 선
    rule: (s, outer, { top, bottom, rectTop }) => {
      if (outer) return s === 'top' || s === 'bottom' ? THICK : NONE;
      if (s === 'bottom' && top === rectTop && bottom === rectTop + 1) return DOUBLE;
      if (s === 'top' && top === rectTop + 1) return DOUBLE;
      return THIN;
    },
  },
};

export function applyBorderPreset(editor: Editor, key: string): boolean {
  const preset = BORDER_PRESETS[key];
  if (!preset || !editor.isActive('table')) return false;
  const { state, view } = editor;
  let rect;
  try {
    rect = selectedRect(state);
  } catch {
    return false;
  }
  const { map, table, tableStart } = rect;
  const area = preset.whole ? { left: 0, top: 0, right: map.width, bottom: map.height } : rect;
  const updates = new Map<number, CellBorders>(); // 칸 위치(표 안) → 새 테두리
  const get = (pos: number): CellBorders => {
    if (!updates.has(pos)) updates.set(pos, { ...(table.nodeAt(pos)?.attrs.borders ?? {}) });
    return updates.get(pos)!;
  };
  const set = (pos: number, side: Side, line: BorderLine | undefined) => {
    const b = get(pos);
    if (line) b[side] = line;
    else delete b[side];
  };
  const OPP: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  for (const pos of map.cellsInRect(area)) {
    const c = map.findCell(pos);
    for (const side of SIDES) {
      const outer =
        side === 'top' ? c.top === area.top : side === 'bottom' ? c.bottom === area.bottom : side === 'left' ? c.left === area.left : c.right === area.right;
      const line = preset.rule(side, outer, { top: c.top, bottom: c.bottom, rectTop: area.top });
      if (line === null) continue;
      set(pos, side, line);
      if (!outer) continue;
      // 선택 밖 이웃 칸의 맞닿은 변
      for (const n of neighbors(map, c, side)) set(n, OPP[side], line);
    }
  }
  const tr = state.tr;
  for (const [pos, borders] of updates) {
    const node = table.nodeAt(pos);
    if (node) tr.setNodeMarkup(tableStart + pos, null, { ...node.attrs, borders: cleanBorders(borders) ?? null });
  }
  if (!tr.docChanged) return false;
  view.dispatch(tr);
  return true;
}

function neighbors(map: TableMap, c: { left: number; right: number; top: number; bottom: number }, side: Side): number[] {
  const out = new Set<number>();
  const at = (row: number, col: number) => {
    if (row >= 0 && row < map.height && col >= 0 && col < map.width) out.add(map.map[row * map.width + col]);
  };
  if (side === 'top') for (let x = c.left; x < c.right; x++) at(c.top - 1, x);
  if (side === 'bottom') for (let x = c.left; x < c.right; x++) at(c.bottom, x);
  if (side === 'left') for (let y = c.top; y < c.bottom; y++) at(y, c.left - 1);
  if (side === 'right') for (let y = c.top; y < c.bottom; y++) at(y, c.right);
  return [...out];
}
