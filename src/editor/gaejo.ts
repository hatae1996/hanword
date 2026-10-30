/**
 * 개조식 자동 입력 — 공문서 □ → ○ → - → · 를 한글 "문단 번호"처럼 다룬다.
 *
 *  - 기호로 시작하는 문단에서 Enter → 다음 문단도 같은 기호·같은 들여쓰기로 시작
 *    (기호만 있는 빈 문단에서 Enter → 기호를 지우고 개조식을 끝냄, Word 목록과 같음)
 *  - 단계 바꾸기 (한글 개요 단축키): Ctrl+숫자판 − = 한 단계 아래, Ctrl+숫자판 + = 한 단계 위
 *    숫자판이 없는 노트북: Alt+Shift+→ / Alt+Shift+← (Word 의 개요 수준 단축키)
 *  - 들여쓰기 = AI 변환기(markdown.ts)와 같은 값: 단계 × 5mm + 기호 폭 5mm 내어쓰기
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { GAEJO_HANG_MM, GAEJO_STEP_MM } from '../ai/markdown';

/** 단계별 기호 (공문서 관례) */
export const GAEJO_SYMBOLS = ['□', '○', '-', '·'] as const;
/** 읽을 때 인정하는 기호 → 단계 */
const LEVEL_OF: Record<string, number> = { '□': 0, '■': 0, '○': 1, '●': 1, '※': 1, '-': 2, '◦': 2, '▪': 2, '·': 3, '∙': 3 };

export interface MarkerInfo {
  symbol: string;
  level: number;
  /** 기호 + 뒤 공백 길이 */
  length: number;
  /** 기호 뒤에 글이 있는가 */
  hasText: boolean;
}

export function markerOf(para: PMNode): MarkerInfo | null {
  if (para.type.name !== 'paragraph') return null;
  const text = para.textContent;
  const m = text.match(/^([□■○●※\-◦▪·∙])(\s+)/) ?? text.match(/^([□■○●※◦▪·∙])$/);
  if (!m) return null;
  return { symbol: m[1], level: LEVEL_OF[m[1]], length: m[0].length, hasText: text.length > m[0].length };
}

const indentAttrs = (level: number) => ({ indentLeft: level * GAEJO_STEP_MM + GAEJO_HANG_MM, firstLine: -GAEJO_HANG_MM, textAlign: 'left' });

/** 커서 문단 Enter 처리. 처리했으면 true */
export function gaejoEnter(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (!sel.empty) return false;
  const $from = sel.$from;
  const para = $from.parent;
  const info = markerOf(para);
  if (!info) return false;
  // 목록(•, 1.) 안에서는 목록이 알아서 한다
  for (let d = $from.depth; d > 0; d--) if (['listItem', 'bulletList', 'orderedList'].includes($from.node(d).type.name)) return false;
  const start = $from.start();
  if (!info.hasText) {
    // 기호만 있는 문단 → 기호를 지우고 들여쓰기를 없앤다
    const tr = state.tr.delete(start, start + info.length);
    tr.setNodeMarkup($from.before(), undefined, { ...para.attrs, indentLeft: null, firstLine: null });
    editor.view.dispatch(tr);
    return true;
  }
  if ($from.parentOffset < info.length) return false; // 기호 앞에서 Enter → 보통 줄바꿈
  const symbol = info.symbol;
  // 글자 모양(글꼴·크기)을 이어받도록 커서 자리의 marks 로 기호를 쓴다
  const marks = state.storedMarks ?? $from.marks();
  const ok = editor.commands.splitBlock({ keepMarks: true });
  if (!ok) return false;
  const s2 = editor.state;
  const at = s2.selection.from;
  const tr = s2.tr.insert(at, s2.schema.text(`${symbol} `, marks));
  tr.setSelection(TextSelection.create(tr.doc, at + symbol.length + 1));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** 선택한 문단들의 단계를 delta 만큼 (+1 = 한 단계 아래). 기호가 없는 문단은 □ 를 붙인다 */
export function shiftGaejo(editor: Editor, delta: number): boolean {
  const { state } = editor;
  const { from, to } = state.selection;
  const targets: { pos: number; node: PMNode }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') {
      targets.push({ pos, node });
      return false;
    }
    return true;
  });
  if (!targets.length) return false;
  let tr = state.tr;
  // 뒤에서부터 바꿔야 앞쪽 위치가 밀리지 않는다
  for (const { pos, node } of targets.reverse()) {
    const info = markerOf(node);
    const level = info ? (info.symbol === '※' ? 1 : info.level) : -1;
    const next = Math.max(0, Math.min(GAEJO_SYMBOLS.length - 1, level + delta));
    if (info && next === level) continue;
    const symbol = info?.symbol === '※' ? '※' : GAEJO_SYMBOLS[next];
    const textStart = pos + 1;
    const marks = node.firstChild?.marks ?? [];
    if (info) tr = tr.replaceWith(textStart, textStart + 1, state.schema.text(symbol, marks));
    else tr = tr.insert(textStart, state.schema.text(`${symbol} `, marks));
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...indentAttrs(next) });
  }
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

export const Gaejo = Extension.create({
  name: 'gaejo',
  priority: 900, // 목록 Enter(StarterKit)보다 먼저, 빈칸 Tab(1000)보다는 뒤
  addKeyboardShortcuts() {
    return { Enter: () => gaejoEnter(this.editor) };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, e) {
            const numpad = (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'NumpadSubtract' || e.code === 'NumpadAdd');
            const arrows = e.altKey && e.shiftKey && !e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft');
            if (!numpad && !arrows) return false;
            e.preventDefault();
            const deeper = e.code === 'NumpadSubtract' || e.key === 'ArrowRight';
            shiftGaejo(editor, deeper ? 1 : -1);
            return true;
          },
        },
      }),
    ];
  },
});
