/**
 * 찾기·바꾸기 — Ctrl+F 찾기, Ctrl+H 바꾸기.
 * 찾은 곳은 화면에서만 표시(노란색, 현재 위치는 주황)하고 파일에는 영향 없음.
 * 서식이 바뀌는 경계(예: 일부만 굵은 글자)를 넘어서도 찾는다. 문단을 넘어서는 찾지 않는다.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface Match {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: Match[];
  current: number; // -1 = 없음
}

const key = new PluginKey<FindState>('hanwordFind');

export function findMatches(doc: PMNode, query: string): Match[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const out: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // 글자마다 문서 위치를 기록 (줄바꿈 등 글자가 아닌 노드는 건너뜀)
    let text = '';
    const at: number[] = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) at.push(pos + 1 + off + i);
        text += child.text;
      } else {
        at.push(-1);
        text += '\n';
      }
    });
    const lower = text.toLowerCase();
    let i = lower.indexOf(q);
    while (i >= 0) {
      const from = at[i];
      const to = at[i + q.length - 1] + 1;
      if (from >= 0 && !text.slice(i, i + q.length).includes('\n')) out.push({ from, to });
      i = lower.indexOf(q, i + Math.max(1, q.length));
    }
    return false;
  });
  return out;
}

export const FindReplace = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key,
        state: {
          init: () => ({ query: '', matches: [], current: -1 }),
          apply(tr, old) {
            const meta = tr.getMeta(key) as Partial<FindState> | undefined;
            let next = meta ? { ...old, ...meta } : old;
            if (tr.docChanged || (meta && 'query' in meta)) {
              const matches = findMatches(tr.doc, next.query);
              const current = matches.length ? Math.min(Math.max(next.current, 0), matches.length - 1) : -1;
              next = { ...next, matches, current };
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = key.getState(state)!;
            if (!s.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'hw-find hw-find-current' : 'hw-find' })),
            );
          },
        },
      }),
    ];
  },
});

export const findState = (editor: Editor) => key.getState(editor.state)!;

export function setQuery(editor: Editor, query: string) {
  // 커서 다음에 있는 첫 결과를 현재 위치로
  const matches = findMatches(editor.state.doc, query);
  const from = editor.state.selection.from;
  let current = matches.findIndex((m) => m.from >= from);
  if (current < 0) current = matches.length ? 0 : -1;
  editor.view.dispatch(editor.state.tr.setMeta(key, { query, current }));
  reveal(editor);
}

function reveal(editor: Editor) {
  const s = findState(editor);
  const m = s.matches[s.current];
  if (!m) return;
  // 선택은 하되 편집기 포커스는 찾기 칸에 둔다 (계속 입력할 수 있게)
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, m.from, m.to)).scrollIntoView();
  editor.view.dispatch(tr);
  const dom = editor.view.domAtPos(m.from);
  (dom.node instanceof Element ? dom.node : dom.node.parentElement)?.scrollIntoView({ block: 'center', behavior: 'auto' });
}

export function step(editor: Editor, dir: 1 | -1) {
  const s = findState(editor);
  if (!s.matches.length) return;
  const current = (s.current + dir + s.matches.length) % s.matches.length;
  editor.view.dispatch(editor.state.tr.setMeta(key, { current }));
  reveal(editor);
}

export function replaceCurrent(editor: Editor, replacement: string): boolean {
  const s = findState(editor);
  const m = s.matches[s.current];
  if (!m) return false;
  const tr = editor.state.tr;
  if (replacement) tr.insertText(replacement, m.from, m.to); // 첫 글자의 서식을 이어받는다
  else tr.delete(m.from, m.to);
  editor.view.dispatch(tr);
  reveal(editor);
  return true;
}

export function replaceAll(editor: Editor, replacement: string): number {
  const s = findState(editor);
  if (!s.matches.length) return 0;
  const tr = editor.state.tr;
  for (const m of [...s.matches].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  editor.view.dispatch(tr);
  return s.matches.length;
}

export function clearFind(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(key, { query: '', current: -1 }));
}
