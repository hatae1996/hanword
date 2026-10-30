/**
 * TipTap(ProseMirror) JSON → 공통 문서 모델(Doc)
 */
import type { Align, Block, Doc, Inline, PageSetup, Paragraph, ParaRole, RunStyle, Table, TableCell } from './types';
import { DEFAULT_PAGE, LIST_INDENT_MM, contentWidthMm, defaultParaStyle } from './defaults';
import { normalizeWidths, placeCells } from './table';
import { cleanBorders, resolveEdges } from './borders';
import { base64ToBytes, fitSize, parseDataUrl, pixelSize } from './image';
import { pxToMm } from './units';

export type PMNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
};

/** 크기 없이 들어온 그림을 맞출 본문 폭 (tiptapToDoc 이 정한다) */
let contentWidth = 150;

export function tiptapToDoc(json: PMNode, title = '문서', pageSetup: PageSetup = DEFAULT_PAGE): Doc {
  const page = { ...pageSetup };
  contentWidth = contentWidthMm(page);
  const blocks: Block[] = [];
  for (const node of json.content ?? []) convertBlock(node, blocks, contentWidthMm(page));
  if (!blocks.length || blocks[blocks.length - 1].type === 'table') blocks.push(emptyParagraph());
  return { title, page, blocks };
}

function emptyParagraph(): Paragraph {
  return { type: 'paragraph', role: 'body', style: defaultParaStyle(), inlines: [] };
}

function convertBlock(node: PMNode, out: Block[], widthMm: number, listDepth = 0): void {
  switch (node.type) {
    case 'paragraph':
      out.push(toParagraph(node, 'body'));
      break;
    case 'heading': {
      const level = Math.min(3, Math.max(1, node.attrs?.level ?? 1));
      out.push(toParagraph(node, `h${level}` as ParaRole));
      break;
    }
    case 'bulletList':
    case 'orderedList':
      convertList(node, out, listDepth);
      break;
    case 'table':
      out.push(toTable(node, widthMm));
      break;
    default:
      // 지원하지 않는 블록은 안의 내용만 살린다 (데이터 손실 방지)
      for (const child of node.content ?? []) convertBlock(child, out, widthMm, listDepth);
  }
}

const BULLETS = ['•', '◦', '▪'];
function orderedMarker(n: number, depth: number): string {
  if (depth % 3 === 1) return `${'가나다라마바사아자차카타파하'[(n - 1) % 14]}.`;
  if (depth % 3 === 2) return `${n})`;
  return `${n}.`;
}

/**
 * 목록 — MVP 에서는 기호/번호를 "글자"로 넣고 내어쓰기로 정렬한다.
 * 한글의 문단 번호와 Word 의 numbering 은 동작이 달라, 자동 번호는 이후 단계에서 1:1 매핑한다.
 */
function convertList(node: PMNode, out: Block[], depth: number): void {
  const ordered = node.type === 'orderedList';
  let n = ordered ? (node.attrs?.start ?? 1) : 0;
  for (const item of node.content ?? []) {
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        convertList(child, out, depth + 1);
        continue;
      }
      const role: ParaRole = child.type === 'heading' ? (`h${Math.min(3, child.attrs?.level ?? 1)}` as ParaRole) : 'body';
      const p = toParagraph(child, role);
      p.style.indentLeftMm = LIST_INDENT_MM * (depth + 1);
      p.style.firstLineMm = -LIST_INDENT_MM;
      p.style.align = 'left';
      if (first) {
        const marker = ordered ? orderedMarker(n, depth) : BULLETS[depth % BULLETS.length];
        const firstText = p.inlines.find((i) => i.kind === 'text') as RunStyle | undefined;
        p.inlines.unshift({ kind: 'text', text: `${marker} `, sizePt: firstText?.sizePt, font: firstText?.font, color: firstText?.color });
      }
      first = false;
      out.push(p);
    }
    if (ordered) n++;
  }
}

function toAlign(a: unknown): Align {
  return a === 'center' || a === 'right' || a === 'justify' || a === 'left' ? a : 'justify';
}

function toParagraph(node: PMNode, role: ParaRole): Paragraph {
  const style = defaultParaStyle(role);
  const a = node.attrs ?? {};
  if (a.textAlign) style.align = toAlign(a.textAlign);
  // 파일에서 읽어 온 문단 모양 (editor/paragraphFormat.ts)
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  style.indentLeftMm = n(a.indentLeft) ?? style.indentLeftMm;
  style.firstLineMm = n(a.firstLine) ?? style.firstLineMm;
  style.spaceBeforePt = n(a.spaceBefore) ?? style.spaceBeforePt;
  style.spaceAfterPt = n(a.spaceAfter) ?? style.spaceAfterPt;
  style.lineSpacingPct = n(a.lineHeight) ?? style.lineSpacingPct;
  const inlines: Inline[] = [];
  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') inlines.push({ kind: 'break' });
    else if (child.type === 'image') {
      const d = parseDataUrl(child.attrs?.src ?? '');
      if (d) {
        const px = pixelSize(base64ToBytes(d.data), d.mime);
        const fit = fitSize(px, contentWidth);
        const w = typeof child.attrs?.widthMm === 'number' ? child.attrs.widthMm : null;
        const h = typeof child.attrs?.heightMm === 'number' ? child.attrs.heightMm : null;
        // 크기가 하나만 있으면 원본 비율로 나머지를 정한다
        const ratio = px && px.w ? px.h / px.w : fit.heightMm / fit.widthMm;
        const widthMm = w ?? (h ? h / ratio : fit.widthMm);
        const heightMm = h ?? widthMm * ratio;
        inlines.push({ kind: 'image', mime: d.mime, data: d.data, widthMm: Math.round(widthMm * 10) / 10, heightMm: Math.round(heightMm * 10) / 10 });
      }
    }
    else if (child.type === 'text' && child.text) inlines.push({ kind: 'text', text: child.text, ...marksToStyle(child.marks) });
  }
  const para: Paragraph = { type: 'paragraph', role, style, inlines };
  if (a.pageBreak) para.pageBreak = true;
  return para;
}

export function parseFontSizePt(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).trim();
  const num = parseFloat(s);
  if (!isFinite(num) || num <= 0) return undefined;
  if (s.endsWith('px')) return Math.round(num * 0.75 * 2) / 2;
  return Math.round(num * 2) / 2;
}

export function normalizeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return `#${m[1].toUpperCase()}`;
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return `#${m[1].split('').map((c) => c + c).join('').toUpperCase()}`;
  m = s.match(/^rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return undefined;
}

/** letter-spacing CSS → 자간 % ("-0.05em" → -5, "-5%" → -5) */
export function parseLetterSpacingPct(v: unknown): number | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const m = v.trim().match(/^(-?[\d.]+)\s*(em|%)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const pct = m[2] === '%' ? n : n * 100;
  return Math.round(pct) || undefined;
}

function cleanFont(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.split(',')[0].replace(/["']/g, '').trim() || undefined;
}

function marksToStyle(marks: PMNode['marks']): RunStyle {
  const s: RunStyle = {};
  for (const m of marks ?? []) {
    if (m.type === 'bold') s.bold = true;
    else if (m.type === 'italic') s.italic = true;
    else if (m.type === 'underline') s.underline = true;
    else if (m.type === 'strike') s.strike = true;
    else if (m.type === 'textStyle') {
      const size = parseFontSizePt(m.attrs?.fontSize);
      if (size) s.sizePt = size;
      const color = normalizeColor(m.attrs?.color);
      if (color) s.color = color;
      const font = cleanFont(m.attrs?.fontFamily);
      if (font) s.font = font;
      const sp = parseLetterSpacingPct(m.attrs?.letterSpacing);
      if (sp) s.spacingPct = sp;
    }
  }
  return s;
}

function toTable(node: PMNode, widthMm: number): Table {
  const rows: TableCell[][] = [];
  const rawWidths = new Map<TableCell, (number | null)[]>();
  for (const rowNode of node.content ?? []) {
    const row: TableCell[] = [];
    for (const cellNode of rowNode.content ?? []) {
      const blocks: Paragraph[] = [];
      const tmp: Block[] = [];
      for (const child of cellNode.content ?? []) convertBlock(child, tmp, widthMm);
      for (const b of tmp) {
        if (b.type === 'paragraph') blocks.push(b);
        // 표 안의 표는 MVP 범위 밖 — 글자만 살린다
        else for (const row2 of b.rows) for (const c of row2) blocks.push(...c.blocks);
      }
      if (!blocks.length) blocks.push(emptyParagraph());
      const cell: TableCell = { colspan: cellNode.attrs?.colspan ?? 1, rowspan: cellNode.attrs?.rowspan ?? 1, blocks };
      const bg = normalizeColor(cellNode.attrs?.backgroundColor);
      if (bg && bg !== '#FFFFFF') cell.bg = bg;
      const borders = cleanBorders(cellNode.attrs?.borders);
      if (borders) cell.borders = borders;
      if (Array.isArray(cellNode.attrs?.colwidth)) rawWidths.set(cell, cellNode.attrs!.colwidth);
      row.push(cell);
    }
    rows.push(row);
  }
  // 열 너비: 어느 행이든 너비 정보가 있는 셀에서 격자 열별로 채운다
  const { placed, colCount } = placeCells({ rows });
  const widths: (number | undefined)[] = new Array(colCount).fill(undefined);
  for (const r of placed)
    for (const pc of r) {
      const cw = rawWidths.get(pc.cell);
      cw?.forEach((px, i) => {
        if (px && widths[pc.col + i] === undefined) widths[pc.col + i] = pxToMm(px);
      });
    }
  // 맞닿은 칸의 테두리를 맞춘다 (한 칸에만 '선 없음'을 줘도 한글·Word 에서 선이 사라지도록)
  return resolveEdges({ type: 'table', rows, colWidthsMm: normalizeWidths(widths, colCount, widthMm) });
}
