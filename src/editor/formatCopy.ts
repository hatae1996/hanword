/**
 * 모양 복사 — 한글 Alt+C (Word 서식 복사 Ctrl+Alt+C / Ctrl+Alt+V)
 *
 *  1) 모양을 가져올 글자에 커서를 두고 Alt+C → 글자 모양 / 문단 모양 / 칸 모양 중 고르기
 *  2) 바꿀 곳을 선택(블록)하고 Alt+C → 같은 모양이 입혀진다
 *     복사한 모양은 Esc 를 누를 때까지 남아 있어 여러 곳에 연속으로 입힐 수 있다 (Word 서식 복사 두 번 클릭)
 *  Ctrl+Alt+C = 대화상자 없이 전부 복사, Ctrl+Alt+V = 입히기
 */
import type { Editor } from '@tiptap/core';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import { CellSelection, cellAround } from '@tiptap/pm/tables';
import { formDialog } from '../ui/dialog';

const CHAR_MARKS = ['bold', 'italic', 'underline', 'strike', 'textStyle'];
const PARA_ATTRS = ['textAlign', 'indentLeft', 'firstLine', 'spaceBefore', 'spaceAfter', 'lineHeight'];
const CELL_ATTRS = ['backgroundColor', 'borders'];

interface Copied {
  marks?: readonly Mark[];
  para?: Record<string, unknown>;
  cell?: Record<string, unknown>;
}
let copied: Copied | null = null;
let parts = { char: true, para: true, cell: false };
let onChange: (active: boolean) => void = () => {};

export const formatCopyActive = () => !!copied;
export function onFormatCopyChange(fn: (active: boolean) => void) {
  onChange = fn;
}

function cellNodeAt(editor: Editor): PMNode | null {
  const sel = editor.state.selection;
  const $c = sel instanceof CellSelection ? sel.$anchorCell : cellAround(sel.$from);
  return $c ? editor.state.doc.nodeAt($c.pos) : null;
}

function capture(editor: Editor, which: typeof parts) {
  const { state } = editor;
  const $from = state.selection.$from;
  const out: Copied = {};
  if (which.char) {
    // 커서 바로 뒤 글자의 모양 (빈 문단이면 커서 자리 모양)
    const after = $from.nodeAfter;
    const marks = after?.isText ? after.marks : state.storedMarks ?? $from.marks();
    out.marks = marks.filter((m) => CHAR_MARKS.includes(m.type.name));
  }
  if (which.para) {
    const p = $from.parent;
    out.para = Object.fromEntries(PARA_ATTRS.map((k) => [k, p.attrs[k] ?? null]));
  }
  if (which.cell) {
    const c = cellNodeAt(editor);
    if (c) out.cell = Object.fromEntries(CELL_ATTRS.map((k) => [k, c.attrs[k] ?? null]));
  }
  copied = out;
  onChange(true);
}

function apply(editor: Editor): boolean {
  if (!copied) return false;
  const { state } = editor;
  const sel = state.selection;
  let tr = state.tr;
  const ranges = sel.ranges.map((r) => ({ from: r.$from.pos, to: r.$to.pos }));
  if (copied.marks) {
    for (const { from, to } of ranges) {
      if (from === to) continue;
      for (const name of CHAR_MARKS) {
        const t = state.schema.marks[name];
        if (t) tr = tr.removeMark(from, to, t);
      }
      for (const m of copied.marks) tr = tr.addMark(from, to, m);
    }
  }
  if (copied.para) {
    for (const { from, to } of ranges) {
      tr.doc.nodesBetween(from, Math.max(from + 1, to), (node, pos) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...copied!.para });
          return false;
        }
        return true;
      });
    }
  }
  if (copied.cell) {
    const cellPositions: number[] = [];
    if (sel instanceof CellSelection) sel.forEachCell((_n, pos) => cellPositions.push(pos));
    else {
      const $c = cellAround(sel.$from);
      if ($c) cellPositions.push($c.pos);
    }
    for (const pos of cellPositions) {
      const n = tr.doc.nodeAt(pos);
      if (n) tr = tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...copied.cell });
    }
  }
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

/** Alt+C */
export async function formatCopy(editor: Editor, notify: (msg: string, err?: boolean) => void) {
  const sel = editor.state.selection;
  const hasTarget = !sel.empty || sel instanceof CellSelection;
  if (copied && hasTarget) {
    if (apply(editor)) notify('모양을 입혔습니다 — 다른 곳도 선택하고 Alt+C, 끝내려면 Esc');
    else notify('입힐 곳을 먼저 선택하세요', true);
    return;
  }
  const inTable = editor.isActive('table');
  const r = await formDialog({
    title: '모양 복사',
    fields: [
      { key: 'char', label: '글자 모양 (글꼴·크기·색·굵게 …)', type: 'check', value: parts.char },
      { key: 'para', label: '문단 모양 (정렬·여백·간격·줄 간격)', type: 'check', value: parts.para },
      ...(inTable ? [{ key: 'cell', label: '칸 모양 (배경색·테두리)', type: 'check' as const, value: parts.cell }] : []),
    ],
    okText: '복사',
    note: '바꿀 곳을 선택하고 Alt+C 를 누르면 같은 모양이 입혀집니다. Esc 를 누를 때까지 여러 번 쓸 수 있습니다.',
  });
  if (!r) return;
  parts = { char: !!r.char, para: !!r.para, cell: !!r.cell };
  if (!parts.char && !parts.para && !parts.cell) return notify('복사할 모양을 하나 이상 고르세요', true);
  capture(editor, parts);
  notify('모양을 복사했습니다 — 바꿀 곳을 선택하고 Alt+C');
}

/** Ctrl+Alt+C: 대화상자 없이 전부 */
export function formatCopyAll(editor: Editor, notify: (msg: string, err?: boolean) => void) {
  capture(editor, { char: true, para: true, cell: editor.isActive('table') });
  notify('모양을 복사했습니다 — 바꿀 곳을 선택하고 Ctrl+Alt+V (또는 Alt+C)');
}
/** Ctrl+Alt+V */
export function formatPaste(editor: Editor, notify: (msg: string, err?: boolean) => void) {
  if (!copied) return notify('먼저 Alt+C 나 Ctrl+Alt+C 로 모양을 복사하세요', true);
  if (!apply(editor)) notify('입힐 곳을 먼저 선택하세요', true);
}

export function clearFormatCopy(): boolean {
  if (!copied) return false;
  copied = null;
  onChange(false);
  return true;
}
