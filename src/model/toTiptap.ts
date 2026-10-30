/**
 * 공통 문서 모델(Doc) → TipTap JSON  (파일을 열어 편집기에 띄울 때)
 * fromTiptap.ts 의 역방향. 기본값과 같은 값은 넣지 않아 편집기 문서를 깔끔하게 유지한다.
 */
import type { Doc, Paragraph, Table } from './types';
import { defaultParaStyle } from './defaults';
import { placeCells } from './table';
import type { PMNode } from './fromTiptap';

const mmToPx = (mm: number) => Math.round(((mm * 96) / 25.4) * 100) / 100;

function paragraph(p: Paragraph): PMNode {
  const d = defaultParaStyle(p.role);
  const s = p.style;
  const differs = (a: number, b: number, eps: number) => Math.abs(a - b) > eps;
  const attrs: Record<string, any> = { textAlign: s.align };
  if (differs(s.indentLeftMm, d.indentLeftMm, 0.05)) attrs.indentLeft = Math.round(s.indentLeftMm * 100) / 100;
  if (differs(s.firstLineMm, d.firstLineMm, 0.05)) attrs.firstLine = Math.round(s.firstLineMm * 100) / 100;
  if (differs(s.spaceBeforePt, d.spaceBeforePt, 0.05)) attrs.spaceBefore = Math.round(s.spaceBeforePt * 10) / 10;
  if (differs(s.spaceAfterPt, d.spaceAfterPt, 0.05)) attrs.spaceAfter = Math.round(s.spaceAfterPt * 10) / 10;
  if (differs(s.lineSpacingPct, d.lineSpacingPct, 0.5)) attrs.lineHeight = Math.round(s.lineSpacingPct);
  if (p.pageBreak) attrs.pageBreak = true;

  const content: PMNode[] = [];
  for (const i of p.inlines) {
    if (i.kind === 'break') {
      content.push({ type: 'hardBreak' });
      continue;
    }
    if (!i.text) continue;
    const marks: NonNullable<PMNode['marks']> = [];
    if (i.bold) marks.push({ type: 'bold' });
    if (i.italic) marks.push({ type: 'italic' });
    if (i.underline) marks.push({ type: 'underline' });
    if (i.strike) marks.push({ type: 'strike' });
    const ts: Record<string, string> = {};
    if (i.font) ts.fontFamily = i.font;
    if (i.sizePt) ts.fontSize = `${i.sizePt}pt`;
    if (i.color) ts.color = i.color;
    if (i.spacingPct) ts.letterSpacing = `${i.spacingPct / 100}em`;
    if (Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts });
    content.push({ type: 'text', text: i.text, ...(marks.length ? { marks } : {}) });
  }
  if (p.role === 'body') return { type: 'paragraph', attrs, content };
  return { type: 'heading', attrs: { ...attrs, level: Number(p.role.slice(1)) }, content };
}

function table(t: Table): PMNode {
  const { placed } = placeCells(t);
  return {
    type: 'table',
    content: placed.map((row) => ({
      type: 'tableRow',
      content: row.map((pc) => ({
        type: 'tableCell',
        attrs: {
          colspan: pc.colspan,
          rowspan: pc.rowspan,
          colwidth: t.colWidthsMm.slice(pc.col, pc.col + pc.colspan).map(mmToPx),
          backgroundColor: pc.cell.bg ?? null,
          borders: pc.cell.borders ?? null,
        },
        content: pc.cell.blocks.map(paragraph),
      })),
    })),
  };
}

export function docToTiptap(doc: Doc): PMNode {
  const content = doc.blocks.map((b) => (b.type === 'paragraph' ? paragraph(b) : table(b)));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
