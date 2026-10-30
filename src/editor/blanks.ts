/**
 * 빈칸(○○) 채우기 — 한글 "누름틀"처럼 틀의 빈 자리를 Tab 으로 돌며 채운다.
 *
 *  - 빈칸 = 연속된 ○ (예: ○○, ○○○, 2026. ○○. ○○., 총 ○차, ○○○○(주))
 *  - 개조식 기호(문단 맨 앞의 "○ ")는 빈칸이 아니다
 *  - 화면에서만 노란색으로 표시 (파일에는 저장되지 않음)
 *  - Tab: 다음 빈칸 선택 → 바로 타자를 치면 그 자리가 바뀐다. Shift+Tab: 이전 빈칸
 *    문서에 빈칸이 하나도 없으면 Tab 은 원래대로(표 다음 칸, 목록 들여쓰기) 동작한다
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface Blank {
  from: number;
  to: number;
}

const BLANK_RE = /○+/g;

/** 문서 안의 모든 빈칸 위치 (문서 순서) */
export function findBlanks(doc: PMNode): Blank[] {
  const out: Blank[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent;
    // 문단 글자 위치 → 문서 위치 (서식이 바뀌는 경계에서도 정확하도록 글자 조각마다 계산)
    const offsets: number[] = [];
    node.forEach((child, childOffset) => {
      if (child.isText) for (let i = 0; i < child.text!.length; i++) offsets.push(pos + 1 + childOffset + i);
      else offsets.push(-1); // 줄바꿈 등 (textContent 에는 안 들어가므로 실제로는 쓰이지 않음)
    });
    const textOffsets = offsets.filter((o) => o >= 0);
    for (const m of text.matchAll(BLANK_RE)) {
      const start = m.index!;
      const end = start + m[0].length;
      // 개조식 기호: 문단 맨 앞(앞 공백 제외)의 ○ 한 개 + 공백
      const before = text.slice(0, start);
      if (!before.trim() && m[0].length === 1 && /\s/.test(text[end] ?? ' ')) continue;
      const from = textOffsets[start];
      const to = textOffsets[end - 1] + 1;
      if (from !== undefined && to !== undefined) out.push({ from, to });
    }
    return false;
  });
  return out;
}

/** 커서 다음(또는 이전) 빈칸 — 끝까지 가면 처음부터 */
export function nextBlank(state: EditorState, dir: 1 | -1): Blank | null {
  const blanks = findBlanks(state.doc);
  if (!blanks.length) return null;
  const { from, to } = state.selection;
  if (dir > 0) return blanks.find((b) => b.from >= to && !(b.from === from && b.to === to)) ?? blanks[0];
  return [...blanks].reverse().find((b) => b.to <= from) ?? blanks[blanks.length - 1];
}

export function goToBlank(editor: Editor, dir: 1 | -1): boolean {
  const b = nextBlank(editor.state, dir);
  if (!b) return false;
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, b.from, b.to)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

const key = new PluginKey<DecorationSet>('hanwordBlanks');

export const Blanks = Extension.create<{ onCount?: (n: number) => void }>({
  name: 'blanks',
  priority: 1000, // 표의 Tab(다음 칸)보다 먼저
  addOptions() {
    return { onCount: undefined };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => goToBlank(this.editor, 1),
      'Shift-Tab': () => goToBlank(this.editor, -1),
    };
  },
  addProseMirrorPlugins() {
    const onCount = this.options.onCount;
    const build = (doc: PMNode) => {
      const blanks = findBlanks(doc);
      onCount?.(blanks.length);
      return DecorationSet.create(doc, blanks.map((b) => Decoration.inline(b.from, b.to, { class: 'hw-blank' })));
    };
    return [
      new Plugin({
        key,
        state: {
          init: (_c, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
