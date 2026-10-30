/**
 * 다듬기 결과를 편집기에 넣기.
 *  - 문단마다 바뀐 글자만 고친다 (diffEdits) → 굵게·색·글꼴 등 모양이 그대로 남는다
 *  - 개조식으로 나누기는 문단을 여러 항목 문단으로 바꾼다 (기호 + 개조식 들여쓰기)
 */
import type { Editor } from '@tiptap/core';
import type { Node as PMNode, Mark } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { CellSelection } from '@tiptap/pm/tables';
import { diffEdits } from '../ai/polish';
import { GAEJO_SYMBOLS, LEVEL_OF, indentAttrs } from './gaejo';

/** 글자가 아닌 것(그림·줄바꿈 등) 자리 표시 — 한 글자 = 문서 위치 1칸 */
export const OBJ = '￼';

export interface Block {
  pos: number;
  node: PMNode;
  text: string;
}

export function blockText(node: PMNode): string {
  let s = '';
  node.forEach((child) => {
    s += child.isText ? child.text! : OBJ.repeat(child.nodeSize);
  });
  return s;
}

/** 선택 범위가 걸친 글 문단들 (선택이 없으면 커서 문단). 표 칸 선택이면 칸 안 문단들 */
export function selectedBlocks(editor: Editor): Block[] {
  const { state } = editor;
  const sel = state.selection;
  const out: Block[] = [];
  const add = (node: PMNode, pos: number) => {
    if (node.isTextblock && node.type.name !== 'codeBlock') out.push({ pos, node, text: blockText(node) });
  };
  if (sel instanceof CellSelection) {
    sel.forEachCell((cell, cellPos) => cell.descendants((n, p) => {
      if (n.isTextblock) add(n, cellPos + 1 + p);
      return !n.isTextblock;
    }));
    return out.sort((a, b) => a.pos - b.pos);
  }
  const { from, to } = sel;
  if (sel.empty) {
    const $f = sel.$from;
    for (let d = $f.depth; d >= 0; d--) if ($f.node(d).isTextblock) { add($f.node(d), $f.before(d)); break; }
    return out;
  }
  state.doc.nodesBetween(from, to, (n, p) => {
    if (n.isTextblock) {
      add(n, p);
      return false;
    }
    return true;
  });
  return out;
}

/** 다듬기 한 번 = 되돌리기 한 번 (바로 앞 타자와 한 묶음이 되지 않게) */
const own = (tr: Transaction) => closeHistory(tr);

/** 문단마다 새 글로 (바뀐 곳만). texts[i] 가 null 이면 그 문단은 그대로 */
export function applyTexts(editor: Editor, blocks: Block[], texts: (string | null)[]): number {
  const tr = own(editor.state.tr);
  let changed = 0;
  // 뒤 문단부터 고쳐야 앞 문단 위치가 안 바뀐다
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    const next = texts[i];
    if (next == null || next === b.text) continue;
    changed++;
    const start = b.pos + 1;
    for (const e of diffEdits(b.text, next).reverse()) {
      const ins = e.insert.split(OBJ).join(''); // 그림 자리를 새로 만들 수는 없다
      if (ins) tr.insertText(ins, start + e.from, start + e.to);
      else tr.delete(start + e.from, start + e.to);
    }
  }
  if (changed) editor.view.dispatch(tr.scrollIntoView());
  return changed;
}

export interface Item {
  symbol: string;
  text: string;
}

function firstMarks(node: PMNode): readonly Mark[] {
  let marks: readonly Mark[] = [];
  let found = false;
  node.forEach((c) => {
    if (!found && c.isText) {
      marks = c.marks;
      found = true;
    }
  });
  return marks;
}

/** 문단 하나를 개조식 항목 문단 여러 개로. items[i] 가 null 이면 그 문단은 그대로 */
export function replaceWithItems(editor: Editor, blocks: Block[], items: (Item[] | null)[]): number {
  const { state } = editor;
  const tr = own(state.tr);
  let changed = 0;
  let lastEnd = -1;
  let lastStep = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const list = items[i];
    if (!list?.length) continue;
    const b = blocks[i];
    const marks = firstMarks(b.node);
    const para = state.schema.nodes.paragraph;
    const nodes = list.map((it) =>
      para.create({ ...b.node.attrs, ...indentAttrs(LEVEL_OF[it.symbol] ?? 0) }, it.text ? state.schema.text(`${it.symbol} ${it.text}`, marks) : null),
    );
    tr.replaceWith(b.pos, b.pos + b.node.nodeSize, nodes);
    if (lastEnd < 0) {
      lastEnd = b.pos + nodes.reduce((s, n) => s + n.nodeSize, 0);
      lastStep = tr.steps.length;
    }
    changed++;
  }
  if (!changed) return 0;
  // 커서: 마지막으로 바꾼 문단 끝
  const end = tr.mapping.slice(lastStep).map(lastEnd, -1) - 1;
  if (end > 0 && end <= tr.doc.content.size) tr.setSelection(TextSelection.near(tr.doc.resolve(end), -1));
  editor.view.dispatch(tr.scrollIntoView());
  return changed;
}

export const SYMBOLS = GAEJO_SYMBOLS;

/** 고른 문단들(연속)을 새 문단들로 통째로 바꾼다 — 요약 등. 첫 문단의 모양을 따른다 */
export function replaceRange(editor: Editor, blocks: Block[], paragraphs: string[]): boolean {
  if (!blocks.length || !paragraphs.length) return false;
  const { state } = editor;
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  // 같은 부모 안의 문단들만 (표 칸을 넘나들면 안 됨)
  const $a = state.doc.resolve(first.pos);
  const $b = state.doc.resolve(last.pos);
  if ($a.parent !== $b.parent) return false;
  const marks = firstMarks(first.node);
  const nodes = paragraphs.map((t) => state.schema.nodes.paragraph.create({ ...first.node.attrs }, t ? state.schema.text(t, marks) : null));
  const tr = own(state.tr).replaceWith(first.pos, last.pos + last.node.nodeSize, nodes);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
