/**
 * 자간 — 한글과 같은 단축키: Alt+Shift+N 좁게(-1%), Alt+Shift+W 넓게(+1%)
 *
 * 편집기에는 textStyle 의 letterSpacing("-0.05em")으로 두고, 저장할 때 자간 %(−5)로 바꾼다.
 * 한글 보고서는 보통 본문 전체를 -5% 로 쓴다.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Mark, MarkType } from '@tiptap/pm/model';
import { parseLetterSpacingPct } from '../model/fromTiptap';

const clamp = (v: number) => Math.min(50, Math.max(-50, v));
const toCss = (pct: number) => (pct ? `${pct / 100}em` : null);

function withSpacing(marks: readonly Mark[], type: MarkType, pct: number): Mark {
  const old = marks.find((m) => m.type === type);
  return type.create({ ...(old?.attrs ?? {}), letterSpacing: toCss(pct) });
}

const spacingOf = (marks: readonly Mark[], type: MarkType) => parseLetterSpacingPct(marks.find((m) => m.type === type)?.attrs.letterSpacing) ?? 0;

/** 선택한 글자의 자간을 delta % 만큼 바꾼다 (섞여 있으면 각자 기준). 커서만 있으면 이어 쓸 글자에. @returns 커서일 때 새 값 */
export function stepLetterSpacing(editor: Editor, delta: number): number | null {
  const { state, view } = editor;
  const type = state.schema.marks.textStyle;
  if (!type) return null;
  const sel = state.selection;
  if (sel.empty) {
    const marks = state.storedMarks ?? sel.$from.marks();
    const next = clamp(spacingOf(marks, type) + delta);
    view.dispatch(state.tr.setStoredMarks([...marks.filter((m) => m.type !== type), withSpacing(marks, type, next)]));
    return next;
  }
  const tr = state.tr;
  for (const range of sel.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      if (start < end) tr.addMark(start, end, withSpacing(node.marks, type, clamp(spacingOf(node.marks, type) + delta)));
    });
  }
  if (tr.docChanged) view.dispatch(tr);
  return null;
}

export const LetterSpacing = Extension.create({
  name: 'letterSpacing',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => {
              const v = el.style?.letterSpacing || (el.getAttribute('style') ?? '').match(/letter-spacing\s*:\s*([^;]+)/i)?.[1];
              const pct = parseLetterSpacingPct(v);
              return pct ? toCss(pct) : null;
            },
            renderHTML: (attrs: Record<string, any>) => (attrs.letterSpacing ? { style: `letter-spacing: ${attrs.letterSpacing}` } : {}),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, e) {
            if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return false;
            const narrow = e.code === 'KeyN';
            const wide = e.code === 'KeyW';
            if (!narrow && !wide) return false;
            e.preventDefault();
            stepLetterSpacing(editor, narrow ? -1 : 1);
            return true;
          },
        },
      }),
    ];
  },
});
