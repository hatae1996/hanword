/**
 * Doc → DOCX
 *
 * 검증된 `docx` 라이브러리로 OOXML 을 만든다 (Word 가 거부하는 구조를 만들 위험이 낮음).
 * 모든 값은 resolve.ts / units.ts 를 거쳐 HWPX 저장기와 동일한 기준으로 계산된다.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LineRuleType,
  Packer,
  Paragraph as DParagraph,
  ShadingType,
  Table as DTable,
  TableCell as DTableCell,
  TableLayoutType,
  TableRow as DTableRow,
  TextRun as DTextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
} from 'docx';
import type { Align, Doc, Paragraph, Table } from '../model/types';
import { DEFAULT_FONT, DEFAULT_SIZE_PT, ROLE_PARA, ROLE_RUN, TABLE_DEFAULTS } from '../model/defaults';
import { cleanText, maxSizePt, resolveRun } from '../model/resolve';
import { placeCells } from '../model/table';
import { lineSpacingToWordTwip, mmToEighthPt, mmToTwip, pageToWord, ptToHalfPt, ptToTwip } from '../model/units';

const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const fontSet = (name: string) => ({ ascii: name, hAnsi: name, eastAsia: name, cs: name });

const HEADING = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 } as const;

/** Word 기본 제목 스타일(파란색 등)을 우리 제목 서식으로 덮어쓴다 */
function headingStyle(role: 'h1' | 'h2' | 'h3', level: number) {
  return {
    run: { font: fontSet(DEFAULT_FONT), size: ptToHalfPt(ROLE_RUN[role].sizePt), bold: ROLE_RUN[role].bold, color: '000000' },
    paragraph: { keepNext: true, outlineLevel: level, spacing: { before: ptToTwip(ROLE_PARA[role].spaceBeforePt), after: ptToTwip(ROLE_PARA[role].spaceAfterPt) } },
  };
}

function paragraph(p: Paragraph): DParagraph {
  const children: DTextRun[] = [];
  for (const i of p.inlines) {
    if (i.kind === 'break') {
      children.push(new DTextRun({ break: 1 }));
      continue;
    }
    const r = resolveRun(p, i);
    children.push(
      new DTextRun({
        text: cleanText(i.text),
        font: fontSet(r.font),
        size: ptToHalfPt(r.sizePt),
        bold: r.bold,
        italics: r.italic,
        underline: r.underline ? { type: 'single' } : undefined,
        strike: r.strike,
        color: r.color.replace('#', ''),
      }),
    );
  }
  // 빈 문단도 해당 글자 크기의 높이를 갖도록 문단 기호 서식을 지정
  const empty = resolveRun(p);
  const s = p.style;
  const first = mmToTwip(s.firstLineMm);
  const opts: IParagraphOptions = {
    children,
    alignment: ALIGN[s.align],
    // 제목은 Word "제목 1~3" 스타일로 표시 (탐색 창·목차에 나오고, 다시 열 때 제목으로 인식됨)
    heading: p.role === 'body' ? undefined : HEADING[p.role],
    keepNext: p.role !== 'body', // 제목은 다음 문단과 같은 쪽에 (HWPX keepWithNext 와 동일)
    indent: {
      left: mmToTwip(s.indentLeftMm),
      ...(first >= 0 ? { firstLine: first } : { hanging: -first }),
    },
    spacing: {
      before: ptToTwip(s.spaceBeforePt),
      after: ptToTwip(s.spaceAfterPt),
      line: lineSpacingToWordTwip(maxSizePt(p), s.lineSpacingPct),
      lineRule: LineRuleType.AT_LEAST,
    },
    run: { font: fontSet(empty.font), size: ptToHalfPt(empty.sizePt), bold: empty.bold },
  };
  return new DParagraph(opts);
}

function table(t: Table): DTable {
  const border = { style: BorderStyle.SINGLE, size: mmToEighthPt(TABLE_DEFAULTS.borderMm), color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const colTwips = t.colWidthsMm.map(mmToTwip);
  const { placed } = placeCells(t);
  const rows = placed.map(
    (row) =>
      new DTableRow({
        children: row.map((pc) => {
          const width = colTwips.slice(pc.col, pc.col + pc.colspan).reduce((a, b) => a + b, 0);
          return new DTableCell({
            children: pc.cell.blocks.map(paragraph),
            columnSpan: pc.colspan > 1 ? pc.colspan : undefined,
            rowSpan: pc.rowspan > 1 ? pc.rowspan : undefined,
            width: { size: width, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER, // 한글 표 기본값과 동일
            shading: pc.cell.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: pc.cell.bg.replace('#', '') } : undefined,
          });
        }),
      }),
  );
  return new DTable({
    rows,
    columnWidths: colTwips,
    width: { size: colTwips.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED, // 내용에 따라 열 너비가 바뀌지 않게 (한글과 동일)
    borders,
    margins: {
      left: mmToTwip(TABLE_DEFAULTS.cellPadLeftRightMm),
      right: mmToTwip(TABLE_DEFAULTS.cellPadLeftRightMm),
      top: mmToTwip(TABLE_DEFAULTS.cellPadTopBottomMm),
      bottom: mmToTwip(TABLE_DEFAULTS.cellPadTopBottomMm),
    },
  });
}

export async function docToDocx(doc: Doc): Promise<Uint8Array> {
  const pg = pageToWord(doc.page);
  const document = new Document({
    creator: 'HanWord',
    title: doc.title,
    compatibility: {
      version: 15, // Word 2013+ 모드 (호환 모드 표시가 뜨지 않음)
      // 양쪽 정렬 문단에서 Shift+Enter 로 끊은 줄을 Word 는 양끝으로 늘리지만 한글은 늘리지 않는다 → 한글처럼
      doNotExpandShiftReturn: true,
    },
    styles: {
      default: {
        document: {
          run: { font: fontSet(DEFAULT_FONT), size: ptToHalfPt(DEFAULT_SIZE_PT), language: { value: 'ko-KR', eastAsia: 'ko-KR' } },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
        heading1: headingStyle('h1', 0),
        heading2: headingStyle('h2', 1),
        heading3: headingStyle('h3', 2),
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pg.width, height: pg.height },
            margin: { top: pg.top, bottom: pg.bottom, left: pg.left, right: pg.right, header: pg.header, footer: pg.footer, gutter: 0 },
          },
        },
        children: doc.blocks.map((b) => (b.type === 'paragraph' ? paragraph(b) : table(b))),
      },
    ],
  });
  const buf = await Packer.toArrayBuffer(document);
  return new Uint8Array(buf);
}
