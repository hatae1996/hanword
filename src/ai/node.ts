/**
 * Node(명령줄)용 연결부 — 브라우저 없이 같은 변환을 돌린다.
 *  - HTML 읽기: @tiptap/html/server (편집기와 같은 스키마)
 *  - XML 읽기: @xmldom/xmldom (HWPX/DOCX 열기용)
 */
import { generateJSON } from '@tiptap/html/server';
import { DOMParser } from '@xmldom/xmldom';
import { schemaExtensions } from '../editor/extensions';
import type { PMNode } from '../model/fromTiptap';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bytesToBase64, sniffMime } from '../model/image';

(globalThis as any).DOMParser ??= DOMParser;

const extensions = schemaExtensions();
export const nodeGenerateJSON = (html: string) => generateJSON(html, extensions) as PMNode;

/** 마크다운 속 그림 파일 경로(![설명](사진.jpg), <img src="사진.jpg">)를 data: 주소로 바꾼다 (마크다운 파일 기준 상대 경로) */
export function inlineImages(md: string, baseDir: string): string {
  const toData = (src: string): string | null => {
    if (/^data:|^https?:/i.test(src)) return null;
    const p = resolve(baseDir, decodeURI(src));
    if (!existsSync(p)) {
      console.error(`⚠ 그림 파일이 없습니다: ${src}`);
      return null;
    }
    const bytes = new Uint8Array(readFileSync(p));
    const mime = sniffMime(bytes);
    if (!mime) {
      console.error(`⚠ 그림 형식을 읽을 수 없습니다 (PNG·JPEG·GIF·BMP 만): ${src}`);
      return null;
    }
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  };
  return md
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt: string, src: string) => {
      const d = toData(src);
      return d ? `<img src="${d}" alt="${alt.replace(/"/g, '')}">` : m;
    })
    .replace(/(<img\b[^>]*\bsrc\s*=\s*")([^"]+)(")/gi, (m, a: string, src: string, b: string) => {
      const d = toData(src);
      return d ? `${a}${d}${b}` : m;
    });
}

