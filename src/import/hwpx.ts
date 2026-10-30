/**
 * HWPX 열기 → 공통 문서 모델(Doc)
 *
 * 저장기(export/hwpx.ts)의 정확한 역방향이며, 한글이 만든 일반 HWPX 도 읽는다.
 * 지원하지 않는 요소(그림, 도형, 수식, 머리말/꼬리말, 각주 …)는 건너뛰고 warnings 에 남긴다.
 */
import JSZip from 'jszip';
import type { Memo, Align, Block, Doc, Inline, PageSetup, Paragraph, ParaStyle, Table, TableCell, TextRun, CellBorders, LineStyle, PageNumber, ImageRun } from '../model/types';
import { bytesToBase64, sniffMime } from '../model/image';
import { cleanBorders } from '../model/borders';
import { DEFAULT_PAGE, contentWidthMm, defaultParaStyle } from '../model/defaults';
import { cleanParagraph } from '../model/normalize';
import { normalizeWidths, placeCells } from '../model/table';
import { attr, descendants, kid, kids, num, parseXml, type El } from './xml';

export interface ImportResult {
  doc: Doc;
  warnings: string[];
}

const hwpToMm = (v: number) => (v * 25.4) / 7200;

interface CharInfo {
  sizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  font?: string;
  spacingPct?: number;
}
interface ParaInfo {
  style: ParaStyle;
  keepNext: boolean;
}

const ALIGN: Record<string, Align> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFY: 'justify', DISTRIBUTE: 'justify', DISTRIBUTE_SPACE: 'justify' };

/** 지원하지 않아 건너뛴 요소 → 사용자에게 보여 줄 이름 */
const UNSUPPORTED: Record<string, string> = {
  pic: '그림', rect: '도형', line: '도형', ellipse: '도형', arc: '도형', polygon: '도형', curve: '도형', connectLine: '도형',
  container: '묶음 개체', ole: 'OLE 개체', equation: '수식', chart: '차트', textart: '글맵시', video: '동영상',
  header: '머리말', footer: '꼬리말', footNote: '각주', endNote: '미주', fieldBegin: '누름틀·필드', bookmark: '책갈피',
  compose: '글자 겹치기', dutmal: '덧말', btn: '양식 개체', checkBtn: '양식 개체', radioBtn: '양식 개체', comboBox: '양식 개체', edit: '양식 개체',
};

class Reader {
  fontsHangul = new Map<string, string>();
  chars = new Map<string, CharInfo>();
  paras = new Map<string, ParaInfo>();
  styleRoles = new Map<string, 'h1' | 'h2' | 'h3'>();
  /** borderFill id → 칸 배경색·테두리 */
  fills = new Map<string, { bg?: string; borders?: CellBorders }>();
  warnings = new Set<string>();
  /** 메모: 메모 id → 내용, 필드 id → 메모 id, 지금 열린 메모 */
  memos = new Map<string, Memo>();
  memoText = new Map<string, string>();
  memoField = new Map<string, string>();
  openMemo: string | null = null;

  /** 구역 끝 hp:memogroup 의 메모 글 */
  readMemoGroup(sec: El) {
    for (const g of kids(sec, 'memogroup'))
      for (const m of kids(g, 'memo')) {
        const paras = kids(kid(m, 'paraList'), 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join(''));
        this.memoText.set(attr(m, 'id') ?? '', paras.join('\n'));
      }
  }

  /** MEMO 필드 시작 → 메모 열기 */
  readMemoField(fb: El) {
    const params = new Map(kids(kid(fb, 'parameters')).map((x) => [attr(x, 'name') ?? '', x.textContent ?? '']));
    const memoId = params.get('ID') || attr(fb, 'id') || String(this.memos.size + 1);
    const id = `hm${memoId}`;
    if (!this.memos.has(id)) {
      const sub = kids(kid(fb, 'subList'), 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('')).join('\n');
      const memo: Memo = { id, text: this.memoText.get(memoId) ?? sub };
      const author = params.get('Author');
      if (author) memo.author = author;
      const date = params.get('CreateDateTime');
      if (date && !date.startsWith('1601')) memo.date = date;
      this.memos.set(id, memo);
    }
    this.memoField.set(attr(fb, 'id') ?? '', id);
    this.openMemo = id;
  }

  readHeader(head: Document) {
    const root = head.documentElement;
    const refList = kid(root, 'refList');
    for (const ff of kids(kid(refList, 'fontfaces'), 'fontface')) {
      if (attr(ff, 'lang') !== 'HANGUL') continue;
      for (const f of kids(ff, 'font')) this.fontsHangul.set(attr(f, 'id') ?? '', attr(f, 'face') ?? '');
    }
    for (const c of kids(kid(refList, 'charProperties'), 'charPr')) {
      const underline = kid(c, 'underline');
      const strike = kid(c, 'strikeout');
      const fontId = attr(kid(c, 'fontRef'), 'hangul') ?? '0';
      const color = (attr(c, 'textColor') ?? '#000000').toUpperCase();
      this.chars.set(attr(c, 'id') ?? '', {
        sizePt: (num(attr(c, 'height')) ?? 1000) / 100,
        color: /^#[0-9A-F]{6}$/.test(color) ? color : '#000000',
        bold: !!kid(c, 'bold'),
        italic: !!kid(c, 'italic'),
        underline: !!underline && (attr(underline, 'type') ?? 'NONE') !== 'NONE',
        strike: !!strike && !['NONE', ''].includes(attr(strike, 'shape') ?? 'NONE'),
        font: this.fontsHangul.get(fontId) || undefined,
        spacingPct: num(attr(kid(c, 'spacing'), 'hangul')) || undefined,
      });
    }
    for (const p of kids(kid(refList, 'paraProperties'), 'paraPr')) this.paras.set(attr(p, 'id') ?? '', this.readParaPr(p));
    for (const bf of kids(kid(refList, 'borderFills'), 'borderFill')) {
      const face = (attr(kid(kid(bf, 'fillBrush'), 'winBrush'), 'faceColor') ?? '').toUpperCase();
      const info: { bg?: string; borders?: CellBorders } = {};
      if (/^#[0-9A-F]{6}$/.test(face) && face !== '#FFFFFF') info.bg = face;
      const sides: CellBorders = {};
      for (const [tag, side] of [['topBorder', 'top'], ['bottomBorder', 'bottom'], ['leftBorder', 'left'], ['rightBorder', 'right']] as const) {
        const el = kid(bf, tag);
        if (!el) continue;
        const type = (attr(el, 'type') ?? 'SOLID').toUpperCase();
        const style: LineStyle = type === 'NONE' ? 'none' : /DOUBLE|SLIM_THICK|THICK_SLIM/.test(type) ? 'double' : 'solid';
        sides[side] = { style, widthMm: parseFloat(attr(el, 'width') ?? '0.12') || 0.12, color: (attr(el, 'color') ?? '#000000').toUpperCase() };
      }
      const borders = cleanBorders(sides);
      if (borders) info.borders = borders;
      this.fills.set(attr(bf, 'id') ?? '', info);
    }
    for (const st of kids(kid(refList, 'styles'), 'style')) {
      const m = (attr(st, 'name') ?? '').match(/^제목 ([1-3])$/) ?? (attr(st, 'engName') ?? '').match(/^Heading ([1-3])$/i);
      if (m) this.styleRoles.set(attr(st, 'id') ?? '', `h${m[1]}` as 'h1');
    }
  }

  readParaPr(p: El): ParaInfo {
    const style = defaultParaStyle();
    style.align = ALIGN[attr(kid(p, 'align'), 'horizontal') ?? 'JUSTIFY'] ?? 'justify';
    // 여백: <hp:switch><hp:case> 의 값이 실제 값, <hp:default> 는 2배. switch 가 없으면 직접 값.
    const sw = kid(p, 'switch');
    let margin = kid(kid(sw, 'case'), 'margin');
    let line = kid(kid(sw, 'case'), 'lineSpacing');
    let scale = 1;
    if (!margin && sw) {
      margin = kid(kid(sw, 'default'), 'margin');
      line = kid(kid(sw, 'default'), 'lineSpacing');
      scale = 0.5;
    }
    margin ??= kid(p, 'margin');
    line ??= kid(p, 'lineSpacing');
    const mv = (name: string) => (num(attr(kid(margin, name), 'value')) ?? 0) * scale;
    style.firstLineMm = hwpToMm(mv('intent'));
    style.indentLeftMm = hwpToMm(mv('left'));
    style.spaceBeforePt = mv('prev') / 100;
    style.spaceAfterPt = mv('next') / 100;
    const type = attr(line, 'type') ?? 'PERCENT';
    const value = num(attr(line, 'value')) ?? 160;
    if (type === 'PERCENT') style.lineSpacingPct = value;
    else {
      // 고정값/여백만/최소: 10pt 글자 기준 % 로 근사
      style.lineSpacingPct = type === 'BETWEEN_LINES' ? 100 + value / 10 : value / 10;
      this.warnings.add('고정 줄 간격(근사값으로 변환)');
    }
    return { style, keepNext: attr(kid(p, 'breakSetting'), 'keepWithNext') === '1' };
  }

  readPage(sec: Document): PageSetup {
    const secPr = findFirst(sec.documentElement, 'secPr');
    const pagePr = kid(secPr, 'pagePr');
    const m = kid(pagePr, 'margin');
    if (!pagePr || !m) return { ...DEFAULT_PAGE };
    let w = hwpToMm(num(attr(pagePr, 'width')) ?? 59528);
    let h = hwpToMm(num(attr(pagePr, 'height')) ?? 84186);
    // landscape="NARROWLY" 는 가로 방향 (width/height 는 세로 기준으로 저장됨)
    if (attr(pagePr, 'landscape') === 'NARROWLY' && w < h) [w, h] = [h, w];
    const mm = (n: string) => hwpToMm(num(attr(m, n)) ?? 0);
    return {
      widthMm: w, heightMm: h,
      marginTopMm: mm('top'), marginBottomMm: mm('bottom'), marginLeftMm: mm('left'), marginRightMm: mm('right'),
      headerMm: mm('header'), footerMm: mm('footer'),
    };
  }

  /** 문단 하나 → 블록들 (문단 안의 표는 별도 블록으로 분리) */
  header?: Paragraph[];
  footer?: Paragraph[];
  pageNumber?: PageNumber;
  /** 그림 원본: binaryItemIDRef → 바이트 */
  bins = new Map<string, { mime: ImageRun['mime']; data: string }>();

  readPicture(pic: El, out: Inline[]) {
    const ref = attr(descendants(pic, 'img')[0], 'binaryItemIDRef') ?? '';
    const bin = this.bins.get(ref);
    if (!bin) {
      this.warnings.add('그림(원본 파일 없음)');
      return;
    }
    const sz = kid(pic, 'sz') ?? kid(pic, 'curSz');
    const w = hwpToMm(num(attr(sz, 'width')) ?? 0);
    const h = hwpToMm(num(attr(sz, 'height')) ?? 0);
    if (attr(kid(pic, 'pos'), 'treatAsChar') === '0') this.warnings.add('글 뒤·앞 그림(글자처럼 취급으로 바꿈)');
    out.push({ kind: 'image', mime: bin.mime, data: bin.data, widthMm: Math.round(w * 10) / 10 || 50, heightMm: Math.round(h * 10) / 10 || 37.5 });
  }

  /** 머리말/꼬리말: 쪽 번호 자동 번호(autoNum PAGE)가 든 문단은 쪽 번호로 바꾸고 나머지는 문단으로 */
  readHeaderFooter(el: El, kind: 'header' | 'footer') {
    if (this[kind]) return; // 같은 머리말이 여러 곳에 적힌 파일(python-hwpx 등)
    const paras: Paragraph[] = [];
    for (const p of kids(kid(el, 'subList'), 'p')) {
      const hasPage = descendants(p, 'autoNum').some((a) => attr(a, 'numType') === 'PAGE');
      if (hasPage) {
        const info = this.paras.get(attr(p, 'paraPrIDRef') ?? '');
        const align = info?.style.align === 'right' ? 'right' : 'center';
        const text = descendants(p, 't').map((t) => t.textContent ?? '').join('');
        this.pageNumber ??= { pos: `${kind === 'header' ? 'top' : 'bottom'}-${align}`, dash: text.includes('-') };
        continue;
      }
      const blocks: Block[] = [];
      this.readParagraph(p, blocks, true, 170);
      paras.push(...blocks.filter((b): b is Paragraph => b.type === 'paragraph'));
    }
    if (paras.some((p) => p.inlines.some((i) => i.kind === 'text' && i.text.trim()))) this[kind] = paras;
  }

  readParagraph(p: El, out: Block[], inCell: boolean, widthMm: number) {
    const info = this.paras.get(attr(p, 'paraPrIDRef') ?? '') ?? { style: defaultParaStyle(), keepNext: false };
    let inlines: Inline[] = [];
    let hadTable = false;
    let pageBreak = attr(p, 'pageBreak') === '1';
    const flush = (force: boolean) => {
      if (!inlines.length && !force) return;
      const para: Paragraph = { type: 'paragraph', role: 'body', style: { ...info.style }, inlines };
      const clean = cleanParagraph(para, info.keepNext, this.styleRoles.get(attr(p, 'styleIDRef') ?? ''));
      if (pageBreak) {
        clean.pageBreak = true;
        pageBreak = false;
      }
      out.push(clean);
      inlines = [];
    };
    for (const run of kids(p, 'run')) {
      const ch = this.chars.get(attr(run, 'charPrIDRef') ?? '');
      const style = ch ? { bold: ch.bold, italic: ch.italic, underline: ch.underline, strike: ch.strike, sizePt: ch.sizePt, color: ch.color, font: ch.font, spacingPct: ch.spacingPct } : {};
      for (const c of kids(run)) {
        const name = c.localName;
        if (name === 't') this.readText(c, this.openMemo ? { ...style, memo: this.openMemo } : style, inlines);
        else if (name === 'pic') this.readPicture(c, inlines);
        else if (name === 'tbl') {
          flush(false);
          hadTable = true;
          const table = this.readTable(c, widthMm);
          if (inCell) {
            this.warnings.add('표 안의 표(글자만 가져옴)');
            for (const row of table.rows) for (const cell of row) out.push(...cell.blocks);
          } else out.push(table);
        } else if (name === 'ctrl') {
          for (const cc of kids(c)) {
            const n = cc.localName;
            if (n === 'fieldBegin' && attr(cc, 'type') === 'MEMO') this.readMemoField(cc);
            else if (n === 'fieldEnd' && this.memoField.has(attr(cc, 'beginIDRef') ?? '')) {
              if (this.memoField.get(attr(cc, 'beginIDRef') ?? '') === this.openMemo) this.openMemo = null;
            } else if (n === 'fieldEnd') {
              /* 다른 필드의 끝 */
            } else if (n === 'header' || n === 'footer') this.readHeaderFooter(cc, n);
            else if (n === 'pageNum') {
              const pos = (attr(cc, 'pos') ?? 'BOTTOM_CENTER').toUpperCase();
              if (pos !== 'NONE') {
                const top = pos.startsWith('TOP');
                const side = pos.endsWith('RIGHT') || pos.endsWith('OUTSIDE') ? 'right' : 'center';
                this.pageNumber = { pos: `${top ? 'top' : 'bottom'}-${side}`, dash: (attr(cc, 'sideChar') ?? '') === '-' };
              }
            } else if (n === 'autoNum' && inCell) {
              /* 머리말 안의 쪽 번호 — readHeaderFooter 가 처리 */
            } else if (UNSUPPORTED[n]) this.warnings.add(UNSUPPORTED[n]);
          }
        } else if (UNSUPPORTED[name]) this.warnings.add(UNSUPPORTED[name]);
      }
    }
    // 표만 담고 있던 문단(표를 붙잡는 문단)은 따로 남기지 않는다
    flush(!hadTable);
  }

  readText(t: El, style: Omit<TextRun, 'kind' | 'text'>, out: Inline[]) {
    const nodes = t.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i] as El;
      if (n.nodeType === 3 || n.nodeType === 4) out.push({ kind: 'text', text: n.nodeValue ?? '', ...style });
      else if (n.nodeType === 1) {
        const name = n.localName;
        if (name === 'lineBreak') out.push({ kind: 'break' });
        else if (name === 'tab') out.push({ kind: 'text', text: ' ', ...style });
        else if (name === 'nbSpace' || name === 'fwSpace') out.push({ kind: 'text', text: ' ', ...style });
        else if (name === 'hyphen') out.push({ kind: 'text', text: '-', ...style });
      }
    }
  }

  readTable(tbl: El, widthMm: number): Table {
    const colCount = num(attr(tbl, 'colCnt')) ?? 0;
    const widths: (number | undefined)[] = new Array(colCount).fill(undefined);
    const spanWidths: { col: number; span: number; w: number }[] = [];
    const rows: TableCell[][] = [];
    for (const tr of kids(tbl, 'tr')) {
      const row: { col: number; cell: TableCell }[] = [];
      for (const tc of kids(tr, 'tc')) {
        const span = kid(tc, 'cellSpan');
        const colspan = num(attr(span, 'colSpan')) ?? 1;
        const rowspan = num(attr(span, 'rowSpan')) ?? 1;
        const col = num(attr(kid(tc, 'cellAddr'), 'colAddr')) ?? row.length;
        const w = hwpToMm(num(attr(kid(tc, 'cellSz'), 'width')) ?? 0);
        if (colspan === 1 && w > 0) widths[col] ??= w;
        else if (w > 0) spanWidths.push({ col, span: colspan, w });
        const blocks: Block[] = [];
        for (const p of kids(kid(tc, 'subList'), 'p')) this.readParagraph(p, blocks, true, widthMm);
        const paras = blocks.filter((b): b is Paragraph => b.type === 'paragraph');
        if (!paras.length) paras.push(cleanParagraph({ type: 'paragraph', role: 'body', style: defaultParaStyle(), inlines: [] }));
        const cell: TableCell = { colspan, rowspan, blocks: paras };
        const fill = this.fills.get(attr(tc, 'borderFillIDRef') ?? '');
        if (fill?.bg) cell.bg = fill.bg;
        if (fill?.borders) cell.borders = fill.borders;
        row.push({ col, cell });
      }
      // cellAddr 순서대로 (한글은 보통 이미 정렬돼 있음)
      rows.push(row.sort((a, b) => a.col - b.col).map((r) => r.cell));
    }
    // 병합 셀 너비만 있는 열은 나눠서 채운다
    for (const s of spanWidths) {
      const unknown = Array.from({ length: s.span }, (_, i) => s.col + i).filter((c) => widths[c] === undefined);
      const known = Array.from({ length: s.span }, (_, i) => widths[s.col + i] ?? 0).reduce((a, b) => a + b, 0);
      for (const c of unknown) widths[c] = Math.max(1, (s.w - known) / unknown.length);
    }
    const { colCount: placedCols } = placeCells({ rows });
    return { type: 'table', rows, colWidthsMm: normalizeWidths(widths, Math.max(colCount, placedCols), widthMm) };
  }
}

function findFirst(el: Node, name: string): El | undefined {
  for (const c of kids(el)) {
    if (c.localName === name) return c;
    const f = findFirst(c, name);
    if (f) return f;
  }
  return undefined;
}

async function sectionPaths(zip: JSZip): Promise<string[]> {
  const hpf = zip.file('Contents/content.hpf');
  if (hpf) {
    const doc = parseXml(await hpf.async('string'));
    const manifest = new Map<string, string>();
    for (const item of findAll(doc.documentElement, 'item')) manifest.set(attr(item, 'id') ?? '', attr(item, 'href') ?? '');
    const spine = findAll(doc.documentElement, 'itemref')
      .map((r) => manifest.get(attr(r, 'idref') ?? '') ?? '')
      .filter((h) => /section\d+\.xml$/i.test(h));
    if (spine.length) return spine;
  }
  return Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
}

function findAll(el: Node, name: string): El[] {
  const out: El[] = [];
  for (const c of kids(el)) {
    if (c.localName === name) out.push(c);
    out.push(...findAll(c, name));
  }
  return out;
}

export async function readHwpx(bytes: Uint8Array | ArrayBuffer, title = '문서'): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('HWPX 파일이 아닙니다 (구형 .hwp 는 한글에서 .hwpx 로 저장한 뒤 여세요)');
  }
  const headerFile = zip.file('Contents/header.xml');
  if (!headerFile) throw new Error('HWPX 구조가 아닙니다 (Contents/header.xml 없음)');
  const r = new Reader();
  r.readHeader(parseXml(await headerFile.async('string')));
  // 그림 원본: content.hpf 목록의 id → BinData 파일
  const hpfFile = zip.file('Contents/content.hpf');
  if (hpfFile) {
    const hpfDoc = parseXml(await hpfFile.async('string'));
    for (const item of descendants(hpfDoc.documentElement, 'item')) {
      const href = attr(item, 'href') ?? '';
      if (!/^BinData\//i.test(href)) continue;
      const f = zip.file(href);
      if (!f) continue;
      const bytes = await f.async('uint8array');
      const mime = sniffMime(bytes);
      if (mime) r.bins.set(attr(item, 'id') ?? '', { mime, data: bytesToBase64(bytes) });
    }
  }

  const paths = await sectionPaths(zip);
  if (!paths.length) throw new Error('본문(section)이 없습니다');
  const blocks: Block[] = [];
  let page = { ...DEFAULT_PAGE };
  for (let i = 0; i < paths.length; i++) {
    const f = zip.file(paths[i]);
    if (!f) continue;
    const sec = parseXml(await f.async('string'));
    r.readMemoGroup(sec.documentElement);
    if (i === 0) page = r.readPage(sec);
    else r.warnings.add('여러 구역(첫 구역의 쪽 설정으로 통일)');
    const width = contentWidthMm(page);
    for (const p of kids(sec.documentElement, 'p')) r.readParagraph(p, blocks, false, width);
  }
  if (!blocks.length || blocks[blocks.length - 1].type === 'table') {
    blocks.push(cleanParagraph({ type: 'paragraph', role: 'body', style: defaultParaStyle(), inlines: [] }));
  }
  // 문서 안에 저장된 제목이 있으면 그것을 쓴다 (없으면 파일 이름)
  const hpf = zip.file('Contents/content.hpf');
  const savedTitle = hpf ? (await hpf.async('string')).match(/<opf:title>([^<]+)<\/opf:title>/)?.[1]?.trim() : undefined;
  const unescape = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const doc: Doc = { title: savedTitle ? unescape(savedTitle) : title, page, blocks };
  if (r.header) doc.header = r.header;
  if (r.footer) doc.footer = r.footer;
  if (r.pageNumber) doc.pageNumber = r.pageNumber;
  // 본문에 실제로 달린 메모만 (나온 순서)
  const used = new Set<string>();
  const walk = (ps: Paragraph[]) => ps.forEach((p) => p.inlines.forEach((i) => i.kind === 'text' && i.memo && used.add(i.memo)));
  for (const b of blocks) b.type === 'paragraph' ? walk([b]) : b.rows.forEach((row) => row.forEach((c) => walk(c.blocks)));
  if (used.size) doc.memos = [...used].map((id) => r.memos.get(id)!).filter(Boolean);
  return { doc, warnings: [...r.warnings] };
}
