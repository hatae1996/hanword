/**
 * 한글 표 단축키
 *  F5            칸 선택(셀 블록) → 한 번 더 누르면 표 전체 칸
 *                (칸 선택 상태에서 Shift+방향키로 넓히기 — 편집기 기본 동작)
 *  칸 선택 + M   칸 합치기          칸 선택 + S   칸 나누기
 *  Alt+Insert    줄/칸 추가하기     Alt+Delete    줄/칸 지우기
 *  Ctrl+Enter    아래에 줄 추가     Ctrl+Backspace 줄 지우기
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables';
import { formDialog } from '../ui/dialog';

export function selectCell(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (sel instanceof CellSelection) {
    // 이미 칸 선택 → 표 전체
    const $cell = sel.$anchorCell;
    const table = $cell.node(-1);
    const start = $cell.start(-1);
    const map = TableMap.get(table);
    const first = start + map.map[0];
    const last = start + map.map[map.map.length - 1];
    editor.view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, first, last)));
    return true;
  }
  const $cell = cellAround(sel.$from);
  if (!$cell) return false;
  editor.view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, $cell.pos)));
  return true;
}

let lastAdd = { where: 'below', count: 1 };
export async function addRowsCols(editor: Editor) {
  if (!editor.isActive('table')) return;
  const r = await formDialog({
    title: '줄/칸 추가하기',
    fields: [
      { key: 'where', label: '넣을 곳', type: 'select', value: lastAdd.where, options: [
        { value: 'below', label: '아래쪽에 줄' }, { value: 'above', label: '위쪽에 줄' },
        { value: 'right', label: '오른쪽에 칸' }, { value: 'left', label: '왼쪽에 칸' },
      ] },
      { key: 'count', label: '개수', type: 'number', value: lastAdd.count, step: 1, min: 1, max: 50 },
    ],
    okText: '추가',
  });
  if (!r) return;
  lastAdd = { where: r.where, count: Math.max(1, Math.min(50, Math.round(r.count ?? 1))) };
  for (let i = 0; i < lastAdd.count; i++) {
    const c = editor.chain().focus();
    if (r.where === 'below') c.addRowAfter();
    else if (r.where === 'above') c.addRowBefore();
    else if (r.where === 'right') c.addColumnAfter();
    else c.addColumnBefore();
    c.run();
  }
}

export async function deleteRowsCols(editor: Editor) {
  if (!editor.isActive('table')) return;
  const r = await formDialog({
    title: '줄/칸 지우기',
    fields: [{ key: 'what', label: '지울 것', type: 'select', value: 'row', options: [
      { value: 'row', label: '줄 (선택한 줄)' }, { value: 'col', label: '칸 (선택한 칸의 열)' }, { value: 'table', label: '표 전체' },
    ] }],
    okText: '지우기',
  });
  if (!r) return;
  const c = editor.chain().focus();
  if (r.what === 'row') c.deleteRow();
  else if (r.what === 'col') c.deleteColumn();
  else c.deleteTable();
  c.run();
}

export interface TableKeysOptions {
  /** 표 계산 (합계·평균) — 결과 알림은 앱이 한다 */
  calc: (opts: { op: 'sum' | 'avg'; dir?: 'auto' | 'col' | 'row' }) => void;
}

export const TableKeys = Extension.create<TableKeysOptions>({
  name: 'tableKeys',
  addOptions() {
    return { calc: () => {} };
  },
  priority: 1050,
  addProseMirrorPlugins() {
    const editor = this.editor;
    const calc = this.options.calc;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, e) {
            if (!editor.isActive('table')) return false;
            const none = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
            const cells = editor.state.selection instanceof CellSelection;
            const stop = () => {
              e.preventDefault();
              return true;
            };
            if (e.key === 'F5' && none) return selectCell(editor) && stop();
            // 한글 표 계산: 블록 합계 Ctrl+Shift+S, 평균 Ctrl+Shift+A, 가로 합계 Ctrl+Shift+H, 세로 합계 Ctrl+Shift+V(칸 선택 상태)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
              if (e.code === 'KeyS') return (calc({ op: 'sum' }), stop());
              if (e.code === 'KeyA') return (calc({ op: 'avg' }), stop());
              if (e.code === 'KeyH') return (calc({ op: 'sum', dir: 'row' }), stop());
              if (e.code === 'KeyV' && cells) return (calc({ op: 'sum', dir: 'col' }), stop());
            }
            if (cells && none && e.code === 'KeyM') return (editor.commands.mergeCells(), stop());
            if (cells && none && e.code === 'KeyS') return (editor.commands.splitCell(), stop());
            if (e.altKey && !e.ctrlKey && e.key === 'Insert') return (void addRowsCols(editor), stop());
            if (e.altKey && !e.ctrlKey && e.key === 'Delete') return (void deleteRowsCols(editor), stop());
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') return (editor.chain().addRowAfter().run(), stop());
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Backspace') return (editor.chain().deleteRow().run(), stop());
            return false;
          },
        },
      }),
    ];
  },
});
