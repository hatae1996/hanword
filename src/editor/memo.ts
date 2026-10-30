/**
 * 메모 — 한글 "메모 넣기"(Ctrl+N, M) / Word "새 메모".
 * 글자에 memo 마크를 달고(내용·작성자·시각은 마크 속성), 저장할 때 한글 메모·Word 메모로 바뀐다.
 * 같은 메모가 여러 문단에 걸치면 같은 id 의 마크가 여러 조각으로 붙는다.
 */
import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

export interface MemoAttrs {
  id: string;
  text: string;
  author: string;
  date: string;
}

export const Memo = Mark.create({
  name: 'memo',
  inclusive: false, // 메모 끝에서 이어 친 글자는 메모에 들어가지 않는다 (한글·Word 와 같음)
  addAttributes() {
    const data = (name: string) => ({
      default: '',
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-memo-${name}`) ?? '',
      renderHTML: (a: Record<string, string>) => ({ [`data-memo-${name}`]: a[name] ?? '' }),
    });
    return { id: data('id'), text: data('text'), author: data('author'), date: data('date') };
  },
  parseHTML() {
    return [{ tag: 'span[data-memo-id]' }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    const a = mark.attrs as MemoAttrs;
    return ['span', mergeAttributes(HTMLAttributes, { class: 'hw-memo', title: `메모${a.author ? ` (${a.author})` : ''}: ${a.text}\n(눌러서 고치기)` }), 0];
  },
});

export interface MemoRange {
  from: number;
  to: number;
  attrs: MemoAttrs;
}

/** 문서의 메모들 (나온 순서, 같은 id 는 하나로 — from/to 는 첫 조각~마지막 조각) */
export function listMemos(state: EditorState): MemoRange[] {
  const map = new Map<string, MemoRange>();
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type.name !== 'memo') continue;
      const id = m.attrs.id as string;
      const cur = map.get(id);
      if (cur) cur.to = pos + node.nodeSize;
      else map.set(id, { from: pos, to: pos + node.nodeSize, attrs: m.attrs as MemoAttrs });
    }
  });
  return [...map.values()];
}

/** 커서(또는 선택 시작)에 있는 메모 */
export function memoAt(state: EditorState): MemoRange | null {
  const { $from, from } = state.selection;
  const mark = [...$from.marks(), ...(state.doc.nodeAt(from)?.marks ?? [])].find((m) => m.type.name === 'memo');
  if (!mark) return null;
  return listMemos(state).find((r) => r.attrs.id === mark.attrs.id) ?? null;
}

/** 선택이 없으면 커서 자리의 낱말을 고른다 (메모를 달 범위) */
export function wordRange(state: EditorState): { from: number; to: number } | null {
  const { $from, empty, from, to } = state.selection;
  if (!empty) return { from, to };
  const text = $from.parent.textBetween(0, $from.parent.content.size, '\n', '￼');
  const at = $from.parentOffset;
  let a = at;
  let b = at;
  while (a > 0 && !/\s/.test(text[a - 1])) a--;
  while (b < text.length && !/\s/.test(text[b])) b++;
  if (a === b) return null;
  const start = $from.start();
  return { from: start + a, to: start + b };
}

const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 범위에 새 메모 */
export function addMemo(editor: Editor, range: { from: number; to: number }, text: string, author: string): string {
  const id = newId();
  const type = editor.state.schema.marks.memo;
  const tr = editor.state.tr.addMark(range.from, range.to, type.create({ id, text, author, date: new Date().toISOString() }));
  editor.view.dispatch(tr);
  return id;
}

/** 메모 고치기(attrs) / 지우기(null) — 같은 id 의 모든 조각 */
export function updateMemo(editor: Editor, id: string, attrs: Partial<MemoAttrs> | null) {
  const { state } = editor;
  const type = state.schema.marks.memo;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const m = node.marks.find((x) => x.type === type && x.attrs.id === id);
    if (!m) return;
    tr.removeMark(pos, pos + node.nodeSize, m);
    if (attrs) tr.addMark(pos, pos + node.nodeSize, type.create({ ...m.attrs, ...attrs }));
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** 다음 메모로 (끝이면 처음으로) — 메모 글자를 선택해 보여 준다 */
export function gotoNextMemo(editor: Editor, dir = 1): MemoRange | null {
  const list = listMemos(editor.state);
  if (!list.length) return null;
  const at = editor.state.selection.from;
  const next = dir > 0 ? list.find((r) => r.from > at) ?? list[0] : [...list].reverse().find((r) => r.from < at) ?? list[list.length - 1];
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, next.from, next.to)).scrollIntoView());
  editor.view.focus();
  return next;
}
