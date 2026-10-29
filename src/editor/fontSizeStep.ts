/**
 * 글자 크기 1pt 씩 키우기/줄이기 — Ctrl+] / Ctrl+[ (한글·Word 와 같은 단축키)
 *
 * 선택 영역에 크기가 섞여 있으면 Word 처럼 각 글자 조각을 자기 크기에서 1pt 씩 바꾼다.
 * 선택 없이 커서만 있으면 이어서 입력할 글자의 크기를 바꾼다.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Mark, MarkType, Node as PMNode } from '@tiptap/pm/model';
import { ROLE_RUN } from '../model/defaults';
import { parseFontSizePt } from '../model/fromTiptap';

export const MIN_SIZE_PT = 1;
export const MAX_SIZE_PT = 96;

const clamp = (v: number) => Math.min(MAX_SIZE_PT, Math.max(MIN_SIZE_PT, v));

/** 글자 조각의 실제 크기: 직접 지정한 크기, 없으면 문단 역할(본문/제목)의 기본 크기 */
function sizeOf(marks: readonly Mark[], parent: PMNode | null, type: MarkType): number {
  const fs = parseFontSizePt(marks.find((m) => m.type === type)?.attrs.fontSize);
  if (fs) return fs;
  if (parent?.type.name === 'heading') return ROLE_RUN[`h${Math.min(3, parent.attrs.level ?? 1)}` as 'h1'].sizePt;
  return ROLE_RUN.body.sizePt;
}

function withSize(marks: readonly Mark[], type: MarkType, sizePt: number): Mark {
  const old = marks.find((m) => m.type === type);
  return type.create({ ...(old?.attrs ?? {}), fontSize: `${sizePt}pt` });
}

/** @returns 바뀐 뒤의 크기(커서만 있을 때) 또는 null */
export function stepFontSize(editor: Editor, delta: number): number | null {
  const { state, view } = editor;
  const type = state.schema.marks.textStyle;
  if (!type) return null;
  const sel = state.selection;

  if (sel.empty) {
    const $from = sel.$from;
    const marks = state.storedMarks ?? $from.marks();
    const next = clamp(sizeOf(marks, $from.parent, type) + delta);
    view.dispatch(state.tr.setStoredMarks([...marks.filter((m) => m.type !== type), withSize(marks, type, next)]));
    return next;
  }

  const tr = state.tr;
  // 표에서 여러 칸을 선택한 경우도 처리하도록 selection.ranges 를 모두 돈다
  for (const range of sel.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isText) return;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      if (start >= end) return;
      const next = clamp(sizeOf(node.marks, parent, type) + delta);
      tr.addMark(start, end, withSize(node.marks, type, next));
    });
  }
  if (tr.docChanged) view.dispatch(tr.scrollIntoView());
  return null;
}

/** Ctrl+] / Ctrl+[ — 한글 입력 중에도 동작하도록 물리 키(code)로 판별 */
export const FontSizeStep = Extension.create({
  name: 'fontSizeStep',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, e) {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
            const up = e.code === 'BracketRight' || e.key === ']';
            const down = e.code === 'BracketLeft' || e.key === '[';
            if (!up && !down) return false;
            e.preventDefault();
            stepFontSize(editor, up ? 1 : -1);
            return true;
          },
        },
      }),
    ];
  },
});
