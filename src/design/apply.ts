/**
 * 테마 적용 — 문서의 각 부분이 "무엇인지"(제목·장 제목·□ 항목·표 머리행 …)를 알아본 뒤
 * 테마가 정한 모양을 입힌다. 글 내용·메모·그림·병합·열 너비는 건드리지 않는다.
 * 같은 문서에 테마를 여러 번 바꿔 입혀도 알아보는 결과가 같도록, 판별은 글자 모양이 아니라 구조·내용으로 한다.
 */
import type { Block, BorderLine, CellBorders, Doc, Inline, Paragraph, Table, TableCell } from '../model/types';
import { placeCells } from '../model/table';
import { NO_BORDER, type Side } from '../model/borders';
import { ACCENTS, THEMES, type Accent, type ParaLook, type TextLook, type Theme } from './themes';

export type Role = keyof Theme['roles'] | 'empty';
export type TableKind = 'titleBox' | 'box' | 'photo' | 'steps' | 'form' | 'data';

const CHAPTER = /^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\s*\.\s*\S/;
const SECTION = /^\s*(\d{1,2}|[가-하])\s*[.)]\s*\S/;
const DATE = /\d{4}\.\s*[\d○]{1,2}\.\s*[\d○]{1,2}\./;
const ITEM: [RegExp, Role][] = [
  [/^\s*[□■]\s/, 'item0'],
  [/^\s*※/, 'note'],
  [/^\s*[○●◦]\s/, 'item1'],
  [/^\s*[-▪]\s/, 'item2'],
  [/^\s*[·∙]\s/, 'item3'],
];
const TOTAL = /^\s*(합\s*계|총\s*계|소\s*계|계|합계)\s*$/;

export const textOf = (p: Paragraph) => p.inlines.map((i) => (i.kind === 'text' ? i.text : '')).join('');
const cellText = (c: TableCell) => c.blocks.map(textOf).join(' ').trim();
const hasImage = (c: TableCell) => c.blocks.some((p) => p.inlines.some((i) => i.kind === 'image'));
const maxSize = (p: Paragraph) => Math.max(0, ...p.inlines.map((i) => (i.kind === 'text' ? i.sizePt ?? 0 : 0)));

/** 문단 하나의 역할 */
export function paraRole(p: Paragraph, ctx: { first: boolean; afterTitle: boolean }): Role {
  const t = textOf(p).trim();
  if (!t) return 'empty';
  if (CHAPTER.test(t) || (p.role === 'h1' && !ctx.first)) return 'chapter';
  for (const [re, role] of ITEM) if (re.test(t)) return role;
  if (/^\s*\(\s*단위\s*[:：]/.test(t)) return 'unit';
  if (/^\s*(사진|그림|<?표>?)\s*\d+\s*[.:]/.test(t) && t.length <= 60) return 'caption';
  if (ctx.first && (p.role === 'h1' || (p.style.align === 'center' && maxSize(p) >= 16) || (t.length <= 40 && maxSize(p) >= 18))) return 'title';
  if (ctx.afterTitle && t.length <= 60 && (p.style.align === 'right' || DATE.test(t))) return 'subtitle';
  if (p.role === 'h2' || p.role === 'h3' || (SECTION.test(t) && t.length <= 50 && !/[다함임음]\s*\.?$/.test(t))) return 'section';
  return 'body';
}

/** 표 하나의 종류 */
export function tableKind(t: Table, atTop: boolean): TableKind {
  const cells = t.rows.flat();
  if (t.rows.length === 1 && t.rows[0].length === 1) return atTop && cellText(cells[0]).length <= 60 ? 'titleBox' : 'box';
  if (cells.filter(hasImage).length >= Math.max(1, cells.length / 4)) return 'photo';
  if (t.rows.length === 1 && t.rows[0].length >= 3 && t.rows[0].every((c) => cellText(c).length <= 14)) return 'steps';
  // 양식 표: 첫 칸들이 짧은 이름표(회의명·일시…)이고 열이 적다
  const { colCount } = placeCells(t);
  const labels = t.rows.map((r) => cellText(r[0] ?? { blocks: [] } as unknown as TableCell));
  if (t.rows.length >= 3 && colCount <= 4 && labels.every((l) => l.replace(/\s/g, '').length <= 6) && t.rows.some((r) => r.some((c) => c.colspan > 1))) return 'form';
  return 'data';
}

// ── 모양 입히기 ────────────────────────────────────────────
function color(c: string | undefined, a: Accent): string | undefined {
  if (!c) return undefined;
  return c === '$accent' ? a.color : c === '$soft' ? a.soft : c;
}

/** 테마들이 쓰는 색 — 이 색이면 사용자가 고른 색이 아니라 테마 색으로 본다 (테마를 바꿀 때 따라 바뀜) */
const THEME_COLORS = new Set<string>(['#000000', '#FFFFFF']);
for (const t of THEMES) {
  THEME_COLORS.add(t.base.color.toUpperCase());
  for (const r of Object.values(t.roles)) if (r.text.color?.startsWith('#')) THEME_COLORS.add(r.text.color.toUpperCase());
  for (const c of [t.table.head.text.color, t.table.body.text.color, t.headerFooter.color]) if (c?.startsWith('#')) THEME_COLORS.add(c.toUpperCase());
}
for (const x of ACCENTS) THEME_COLORS.add(x.color.toUpperCase());

function lookRuns(p: Paragraph, base: Theme['base'], look: TextLook, a: Accent, keepColors: boolean, controlBold: boolean): Inline[] {
  return p.inlines.map((i) => {
    if (i.kind !== 'text') return i;
    const out = { ...i };
    out.font = look.font ?? base.font;
    out.sizePt = look.sizePt ?? base.sizePt;
    out.spacingPct = look.spacingPct ?? base.spacingPct;
    // 굵기: 제목·날짜 줄 등 테마가 모양을 정하는 곳은 테마대로, 본문·항목·표 안은 사용자가 준 굵게를 남긴다
    if (look.bold !== undefined) out.bold = look.bold;
    else if (controlBold) out.bold = false;
    const c = color(look.color, a);
    // 본문에 사용자가 넣은 색(빨강 강조 등)은 남긴다. 제목 등 테마가 색을 정한 곳은 테마 색
    const custom = !!i.color && !THEME_COLORS.has(i.color.toUpperCase()) && keepColors;
    out.color = c ?? (custom ? i.color : base.color);
    return out;
  });
}

function lookPara(p: Paragraph, base: Theme['base'], look: ParaLook, a: Accent, opts: { keepAlign?: boolean; keepColors?: boolean; controlBold?: boolean } = {}): Paragraph {
  return {
    ...p,
    style: {
      ...p.style,
      ...(look.align && !opts.keepAlign ? { align: look.align } : {}),
      spaceBeforePt: look.spaceBeforePt ?? 0,
      spaceAfterPt: look.spaceAfterPt ?? 0,
      lineSpacingPct: look.lineSpacingPct ?? base.lineSpacingPct,
    },
    inlines: lookRuns(p, base, look.text, a, opts.keepColors ?? !look.text.color, !!opts.controlBold),
  };
}

const line = (mm: number, c: string): BorderLine => (mm > 0 ? { style: 'solid', widthMm: mm, color: c } : { ...NO_BORDER });
const dbl = (c: string): BorderLine => ({ style: 'double', widthMm: 0.5, color: c });

/** 머리행 수: 첫 줄 (첫 줄 칸이 여러 줄을 합쳤으면 그 줄까지) */
function headRows(t: Table): number {
  const { placed } = placeCells(t);
  let end = 1;
  for (const pc of placed[0] ?? []) end = Math.max(end, pc.row + pc.rowspan);
  return Math.min(end, Math.max(1, t.rows.length - 1));
}

/** 양식 표의 이름표 칸: 첫 칸, 또는 짧은 한글 낱말이면서 앞 칸이 이름표가 아닌 칸 (일시 | 값 | 장소 | 값) */
function formLabel(row: { cell: TableCell; col: number }[], col: number): boolean {
  const isLabelText = (c: TableCell) => /^[가-힣]{1,5}$/.test(cellText(c).replace(/\s/g, ''));
  const k = row.findIndex((x) => x.col === col);
  if (k <= 0) return k === 0;
  return isLabelText(row[k].cell) && !formLabel(row, row[k - 1].col);
}

function styleTable(t: Table, kind: TableKind, th: Theme, a: Accent): Table {
  const { placed, rowCount, colCount } = placeCells(t);
  const T = th.table;
  const lc = color(T.lineColor, a)!;
  const outer = line(T.outerMm, lc);
  const thin = line(0.12, lc);
  const heads = kind === 'data' ? headRows(t) : 0;
  const cellOut = new Map<TableCell, TableCell>();
  const bodyText = (c: TableCell, look: TextLook, align?: 'center') =>
    c.blocks.map((p) => lookPara(p, th.base, { text: look, align, spaceBeforePt: 0, spaceAfterPt: 0, lineSpacingPct: 130 }, a, { keepAlign: !align }));

  for (const row of placed) {
    for (const pc of row) {
      const c = pc.cell;
      const top = pc.row === 0;
      const bottom = pc.row + pc.rowspan >= rowCount;
      const left = pc.col === 0;
      const right = pc.col + pc.colspan >= colCount;
      const isHead = pc.row < heads;
      const isTotal = kind === 'data' && !isHead && TOTAL.test(cellText(placed[pc.row][0]?.cell ?? c));
      const b: CellBorders = {};
      let bg: string | undefined;
      let blocks = c.blocks;

      if (kind === 'titleBox') {
        const tb = th.titleBox;
        b.top = line(tb.top, color(tb.lineColor, a)!);
        b.bottom = line(tb.bottom, color(tb.lineColor, a)!);
        b.left = b.right = { ...NO_BORDER };
        bg = color(tb.bg, a);
        blocks = c.blocks.map((p) => lookPara(p, th.base, th.roles.title, a, { controlBold: true }));
      } else if (kind === 'box') {
        const bl = line(0.12, color(th.box.lineColor, a)!);
        b.top = b.bottom = b.left = b.right = bl;
        bg = color(th.box.bg, a);
        blocks = c.blocks.map((p) => lookPara(p, th.base, { ...th.roles.body, spaceBeforePt: 2, spaceAfterPt: 2 }, a));
      } else if (kind === 'photo') {
        b.top = b.bottom = b.left = b.right = thin;
        blocks = c.blocks.map((p) => (p.inlines.some((i) => i.kind === 'image') ? p : lookPara(p, th.base, th.roles.caption, a, { controlBold: true })));
      } else if (kind === 'steps') {
        b.top = b.bottom = b.left = b.right = line(0.12, '#FFFFFF');
        bg = a.soft;
        blocks = bodyText(c, { ...T.body.text, bold: true, color: a.color }, 'center');
      } else {
        // data / form
        const label = kind === 'form' && formLabel(placed[pc.row], pc.col);
        if (isHead || label) {
          bg = color(T.head.bg, a);
          blocks = bodyText(c, T.head.text, 'center');
        } else {
          blocks = bodyText(c, isTotal ? { ...T.body.text, bold: T.total.bold } : T.body.text);
          if (isTotal) bg = color(T.total.bg, a);
          else if (T.zebra && kind === 'data' && (pc.row - heads) % 2 === 1) bg = T.zebra;
        }
        const lines = kind === 'form' ? 'grid' : T.lines;
        const set = (side: Side, v: BorderLine) => (b[side] = v);
        if (lines === 'grid') {
          for (const s of ['top', 'bottom', 'left', 'right'] as Side[]) set(s, thin);
          if (top) set('top', outer);
          if (bottom) set('bottom', outer);
          if (left) set('left', outer);
          if (right) set('right', outer);
        } else if (lines === 'official') {
          set('top', top ? outer : thin);
          set('bottom', bottom ? outer : thin);
          set('left', left ? { ...NO_BORDER } : thin);
          set('right', right ? { ...NO_BORDER } : thin);
          if (pc.row + pc.rowspan === heads) set('bottom', dbl(lc));
          if (pc.row === heads) set('top', dbl(lc));
        } else if (lines === 'horizontal') {
          set('left', { ...NO_BORDER });
          set('right', { ...NO_BORDER });
          set('top', top ? outer : pc.row === heads ? thin : { ...NO_BORDER });
          set('bottom', bottom ? outer : pc.row + pc.rowspan === heads ? thin : { ...NO_BORDER });
          if (isTotal) set('top', thin);
        } else {
          // minimal
          set('left', { ...NO_BORDER });
          set('right', { ...NO_BORDER });
          set('top', top ? { ...NO_BORDER } : thin);
          set('bottom', thin);
          if (pc.row + pc.rowspan === heads) set('bottom', line(0.4, a.color));
          if (pc.row === heads) set('top', line(0.4, a.color));
        }
      }
      const out: TableCell = { ...c, blocks, borders: b };
      if (bg) out.bg = bg;
      else delete out.bg;
      cellOut.set(c, out);
    }
  }
  return { ...t, rows: t.rows.map((r) => r.map((c) => cellOut.get(c) ?? c)) };
}

/** 문서 전체에 테마를 입힌다 (새 Doc 을 돌려줌) */
export function applyTheme(doc: Doc, th: Theme, accent: Accent = ACCENTS[0]): Doc {
  let seenContent = false;
  let afterTitle = false;
  const blocks: Block[] = doc.blocks.map((b, i) => {
    if (b.type === 'table') {
      const kind = tableKind(b, !seenContent);
      if (kind === 'titleBox') afterTitle = true;
      else afterTitle = false;
      seenContent = true;
      return styleTable(b, kind, th, accent);
    }
    const role = paraRole(b, { first: !seenContent, afterTitle });
    if (role === 'empty') {
      // 빈 줄은 본문 글자 크기로 (빈 줄 높이가 테마와 맞도록)
      return { ...b, style: { ...b.style, spaceBeforePt: 0, spaceAfterPt: 0, lineSpacingPct: th.base.lineSpacingPct } };
    }
    seenContent = true;
    afterTitle = role === 'title';
    void i;
    const look = th.roles[role];
    // 문단 정렬: 제목·날짜·단위·설명은 테마대로, 본문·항목은 원래 정렬(양쪽/왼쪽)을 지킨다
    const keepAlign = !['title', 'subtitle', 'unit', 'caption'].includes(role);
    const controlBold = ['title', 'subtitle', 'chapter', 'section', 'unit', 'caption', 'note'].includes(role);
    return lookPara(b, th.base, look, accent, { keepAlign, controlBold });
  });
  const hf = (ps?: Paragraph[]) => ps?.map((p) => lookPara(p, th.base, { text: th.headerFooter }, accent, { keepAlign: true }));
  return { ...doc, blocks, header: hf(doc.header), footer: hf(doc.footer) };
}

/** 미리보기·시험용: 문서의 역할 목록 */
export function describeRoles(doc: Doc): string[] {
  let seenContent = false;
  let afterTitle = false;
  return doc.blocks.map((b) => {
    if (b.type === 'table') {
      const k = tableKind(b, !seenContent);
      afterTitle = k === 'titleBox';
      seenContent = true;
      return `표:${k}`;
    }
    const r = paraRole(b, { first: !seenContent, afterTitle });
    if (r !== 'empty') {
      seenContent = true;
      afterTitle = r === 'title';
    }
    return r;
  });
}
