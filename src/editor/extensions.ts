/**
 * 편집기 문서 구조(스키마) — 앱 편집기와 AI 변환기(마크다운 → 문서)가 똑같이 쓴다.
 * 양쪽 포맷에 1:1 대응이 없는 기능(코드 블록, 인용, 가로줄, 링크)은 끈다.
 */
import StarterKit from '@tiptap/starter-kit';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import type { AnyExtension } from '@tiptap/core';
import { ParagraphFormat } from './paragraphFormat';
import { LetterSpacing } from './letterSpacing';
import { ImageNode } from './image';

export function schemaExtensions(opts: { resizableTables?: boolean; image?: Parameters<typeof ImageNode.configure>[0] } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: false,
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    TableKit.configure({ table: { resizable: !!opts.resizableTables, cellMinWidth: 30 } }),
    ParagraphFormat,
    LetterSpacing,
    ImageNode.configure(opts.image ?? {}),
  ];
}
