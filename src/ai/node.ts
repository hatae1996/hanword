/**
 * Node(명령줄)용 연결부 — 브라우저 없이 같은 변환을 돌린다.
 *  - HTML 읽기: @tiptap/html/server (편집기와 같은 스키마)
 *  - XML 읽기: @xmldom/xmldom (HWPX/DOCX 열기용)
 */
import { generateJSON } from '@tiptap/html/server';
import { DOMParser } from '@xmldom/xmldom';
import { schemaExtensions } from '../editor/extensions';
import type { PMNode } from '../model/fromTiptap';

(globalThis as any).DOMParser ??= DOMParser;

const extensions = schemaExtensions();
export const nodeGenerateJSON = (html: string) => generateJSON(html, extensions) as PMNode;
