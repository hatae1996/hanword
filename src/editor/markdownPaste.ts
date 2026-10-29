/**
 * AI 답변 붙여넣기 — ChatGPT·Claude 의 "복사" 버튼은 마크다운 글(# 제목, **굵게**, | 표 |)을 그대로 복사한다.
 * 붙여넣는 글이 마크다운으로 보이면 서식으로 바꿔 넣는다. (Ctrl+Shift+V 는 글자 그대로 붙여넣기)
 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { gaejoLevel, markdownToHtml } from '../ai/markdown';

/** 마크다운 문법이 두 가지 이상 보이거나, 표·제목처럼 확실한 문법이 있으면 마크다운으로 본다 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let score = 0;
  if (lines.some((l) => /^#{1,6}\s+\S/.test(l))) score += 2;
  if (lines.some((l) => /^\s*\|.*\|\s*$/.test(l)) && lines.some((l) => /^\s*\|?\s*:?-{3,}/.test(l))) score += 2;
  if (/\*\*[^*\n]+\*\*/.test(text)) score += 1;
  if (lines.filter((l) => /^\s*([-*+]|\d+[.)])\s+\S/.test(l)).length >= 2) score += 1;
  if (lines.filter((l) => gaejoLevel(l) !== null).length >= 2) score += 1;
  if (/^---\s*\n[\s\S]*?\n---/m.test(text)) score += 1;
  return score >= 2;
}

export const MarkdownPaste = Extension.create<{ onConverted?: (warnings: string[]) => void }>({
  name: 'markdownPaste',
  addOptions() {
    return { onConverted: undefined };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;
    let plain = false; // Ctrl+Shift+V 직후에는 변환하지 않음
    return [
      new Plugin({
        props: {
          handleKeyDown(_v, e) {
            plain = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV');
            return false;
          },
          handlePaste(_view, event) {
            const wasPlain = plain;
            plain = false;
            const data = event.clipboardData;
            if (!data || wasPlain) return false;
            // 서식이 있는 HTML 이 함께 오면(웹 페이지에서 복사 등) 기본 붙여넣기에 맡긴다
            if (data.types.includes('text/html') && data.getData('text/html').trim()) return false;
            const text = data.getData('text/plain');
            if (!text || !looksLikeMarkdown(text)) return false;
            const { html, warnings } = markdownToHtml(text);
            event.preventDefault();
            editor.commands.insertContent(html, { parseOptions: { preserveWhitespace: false } });
            options.onConverted?.(warnings);
            return true;
          },
        },
      }),
    ];
  },
});
