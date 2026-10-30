/**
 * DOCX 열기 → 공통 문서 모델(Doc)
 *
 * 저장기(export/docx.ts)의 정확한 역방향이며, Word 가 만든 일반 DOCX 도 읽는다.
 * 스타일 상속(문서 기본값 → 문단 스타일 → 글자 스타일 → 직접 서식), 번호 목록, 병합 표를 처리한다.
 * 그림·도형·머리말/꼬리말·각주 등은 건너뛰고 warnings 에 남긴다.
 */
import JSZip from 'jszip';
import type { Align, Block, Doc, Inline, PageSetup, Paragraph, ParaRole, TableCell, TextRun } from '../model/types';
import { DEFAULT_PAGE, contentWidthMm, defaultParaStyle } from '../model/defaults';
import { cleanParagraph } from '../model/normalize';
import { resolveRun } from '../model/resolve';
import { normalizeWidths } from '../model/table';
import { DOCX_AUTO_LINE_FACTOR, LINE_CALIBRATION } from '../model/units';
import { attr, kid, kids, num, parseXml, path, type El } from './xml';
import type { ImportResult } from './hwpx';

const twipToMm = (v: number) => (v * 25.4) / 1440;

interface RProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sizePt?: number;
  color?: string;
  font?: string;
}
interface PProps {
  align?: Align;
  indLeft?: number;
  firstLine?: number;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: string;
  keepNext?: boolean;
  numId?: string;
  ilvl?: number;
  contextual?: boolean;
}
interface StyleDef {
  basedOn?: string;
  r: RProps;
  p: PProps;
  role?: ParaRole;
}

/** w:b, w:i 같은 켜기/끄기 속성 */
const onOff = (el: El | undefined): boolean | undefined => {
  if (!el) return undefined;
  const v = attr(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
};

const JC: Record<string, Align> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };

function readRPr(rPr: El | undefined): RProps {
  const r: RProps = {};
  if (!rPr) return r;
  const b = onOff(kid(rPr, 'b'));
  if (b !== undefined) r.bold = b;
  const i = onOff(kid(rPr, 'i'));
  if (i !== undefined) r.italic = i;
  const u = kid(rPr, 'u');
  if (u) r.underline = (attr(u, 'val') ?? 'single') !== 'none';
  const s = onOff(kid(rPr, 'strike')) ?? onOff(kid(rPr, 'dstrike'));
  if (s !== undefined) r.strike = s;
  const sz = num(attr(kid(rPr, 'sz'), 'val'));
  if (sz) r.sizePt = sz / 2;
  const color = attr(kid(rPr, 'color'), 'val');
  if (color && /^[0-9a-f]{6}$/i.test(color)) r.color = `#${color.toUpperCase()}`;
  else if (color === 'auto') r.color = '#000000';
  const fonts = kid(rPr, 'rFonts');
  const font = attr(fonts, 'eastAsia') || attr(fonts, 'ascii') || attr(fonts, 'hAnsi');
  if (font) r.font = font;
  return r;
}

function readPPr(pPr: El | undefined): PProps {
  const p: PProps = {};
  if (!pPr) return p;
  const jc = attr(kid(pPr, 'jc'), 'val');
  if (jc && JC[jc]) p.align = JC[jc];
  const ind = kid(pPr, 'ind');
  if (ind) {
    const left = num(attr(ind, 'left') ?? attr(ind, 'start'));
    if (left !== undefined) p.indLeft = left;
    const first = num(attr(ind, 'firstLine'));
    const hanging = num(attr(ind, 'hanging'));
    if (hanging !== undefined) p.firstLine = -hanging;
    else if (first !== undefined) p.firstLine = first;
  }
  const sp = kid(pPr, 'spacing');
  if (sp) {
    const before = num(attr(sp, 'before'));
    const after = num(attr(sp, 'after'));
    const line = num(attr(sp, 'line'));
    if (before !== undefined) p.before = before;
    if (after !== undefined) p.after = after;
    if (line !== undefined) {
      p.line = line;
      p.lineRule = attr(sp, 'lineRule') ?? 'auto';
    }
  }
  const cs = onOff(kid(pPr, 'contextualSpacing'));
  if (cs !== undefined) p.contextual = cs;
  const kn = onOff(kid(pPr, 'keepNext'));
  if (kn !== undefined) p.keepNext = kn;
  const numPr = kid(pPr, 'numPr');
  if (numPr) {
    const id = attr(kid(numPr, 'numId'), 'val');
    if (id && id !== '0') {
      p.numId = id;
      p.ilvl = num(attr(kid(numPr, 'ilvl'), 'val')) ?? 0;
    } else if (id === '0') p.numId = '0';
  }
  return p;
}

const merge = <T extends object>(...xs: (T | undefined)[]): T => Object.assign({}, ...xs.filter(Boolean)) as T;

// ── 번호 목록 ─────────────────────────────────────────────
interface Level {
  fmt: string;
  text: string;
  start: number;
  pPr: PProps;
}
const BULLETS = ['•', '◦', '▪'];
const GANADA = '가나다라마바사아자차카타파하';
function formatNum(n: number, fmt: string): string {
  switch (fmt) {
    case 'ganada': return GANADA[(n - 1) % 14];
    case 'chosung': return 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'[(n - 1) % 14];
    case 'lowerLetter': return String.fromCharCode(96 + (((n - 1) % 26) + 1));
    case 'upperLetter': return String.fromCharCode(64 + (((n - 1) % 26) + 1));
    case 'lowerRoman': return roman(n).toLowerCase();
    case 'upperRoman': return roman(n);
    case 'decimalEnclosedCircle': return n <= 20 ? String.fromCharCode(0x245f + n) : String(n);
    default: return String(n);
  }
}
function roman(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

class Numbering {
  levels = new Map<string, Map<number, Level>>(); // numId → ilvl → Level
  counters = new Map<string, number[]>();

  constructor(doc?: Document) {
    if (!doc) return;
    const abstract = new Map<string, Map<number, Level>>();
    for (const a of kids(doc.documentElement, 'abstractNum')) {
      const lv = new Map<number, Level>();
      for (const l of kids(a, 'lvl')) {
        lv.set(num(attr(l, 'ilvl')) ?? 0, {
          fmt: attr(kid(l, 'numFmt'), 'val') ?? 'decimal',
          text: attr(kid(l, 'lvlText'), 'val') ?? '%1.',
          start: num(attr(kid(l, 'start'), 'val')) ?? 1,
          pPr: readPPr(kid(l, 'pPr')),
        });
      }
      abstract.set(attr(a, 'abstractNumId') ?? '', lv);
    }
    for (const n of kids(doc.documentElement, 'num')) {
      const lv = abstract.get(attr(kid(n, 'abstractNumId'), 'val') ?? '');
      if (lv) this.levels.set(attr(n, 'numId') ?? '', lv);
    }
  }

  level(numId: string, ilvl: number) {
    return this.levels.get(numId)?.get(ilvl);
  }

  /** 다음 번호의 표시 글자 */
  marker(numId: string, ilvl: number): string {
    const lv = this.levels.get(numId);
    const def = lv?.get(ilvl);
    if (!def) return BULLETS[ilvl % 3];
    if (def.fmt === 'bullet' || def.fmt === 'none') return def.fmt === 'none' ? '' : BULLETS[ilvl % 3];
    const c = this.counters.get(numId) ?? [];
    c[ilvl] = (c[ilvl] ?? (def.start - 1)) + 1;
    c.length = ilvl + 1; // 하위 단계는 다시 시작
    this.counters.set(numId, c);
    return def.text.replace(/%(\d)/g, (_m, d: string) => {
      const k = Number(d) - 1;
      const l = lv!.get(k);
      return formatNum(c[k] ?? l?.start ?? 1, l?.fmt ?? 'decimal');
    });
  }
}

// ── 본문 ─────────────────────────────────────────────────
class Reader {
  styles = new Map<string, StyleDef>();
  defaultParaStyle?: string;
  docR: RProps = {};
  docP: PProps = {};
  numbering = new Numbering();
  warnings = new Set<string>();
  /** "같은 스타일 문단 사이 간격 무시"(contextualSpacing) 처리를 위한 직전 문단 */
  private prev?: { para: Paragraph; styleId?: string; contextual: boolean };

  readStyles(doc?: Document) {
    if (!doc) return;
    const root = doc.documentElement;
    this.docR = readRPr(path(root, 'docDefaults', 'rPrDefault', 'rPr'));
    this.docP = readPPr(path(root, 'docDefaults', 'pPrDefault', 'pPr'));
    for (const s of kids(root, 'style')) {
      const id = attr(s, 'styleId') ?? '';
      const name = (attr(kid(s, 'name'), 'val') ?? '').toLowerCase();
      const h = id.match(/^heading([1-3])$/i) ?? name.match(/^heading ([1-3])$/);
      const role: ParaRole | undefined = h ? (`h${h[1]}` as ParaRole) : name === 'title' ? 'h1' : undefined;
      this.styles.set(id, { basedOn: attr(kid(s, 'basedOn'), 'val') ?? undefined, r: readRPr(kid(s, 'rPr')), p: readPPr(kid(s, 'pPr')), role });
      if (attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1') this.defaultParaStyle = id;
    }
  }

  /** 스타일 상속을 따라 합친 값 */
  chain(id: string | undefined, seen = new Set<string>()): StyleDef {
    if (!id || seen.has(id)) return { r: {}, p: {} };
    seen.add(id);
    const s = this.styles.get(id);
    if (!s) return { r: {}, p: {} };
    const base = this.chain(s.basedOn, seen);
    return { r: merge(base.r, s.r), p: merge(base.p, s.p), role: s.role ?? base.role };
  }

  readBody(body: El, out: Block[], inCell: boolean, widthMm: number) {
    for (const c of kids(body)) {
      if (c.localName === 'p') this.readParagraph(c, out);
      else if (c.localName === 'tbl') {
        this.prev = undefined;
        const t = this.readTable(c, widthMm);
        if (inCell) {
          this.warnings.add('표 안의 표(글자만 가져옴)');
          for (const row of t.rows) for (const cell of row) out.push(...cell.blocks);
        } else out.push(t);
      } else if (c.localName === 'sdt') {
        const content = kid(c, 'sdtContent');
        if (content) this.readBody(content, out, inCell, widthMm);
      }
    }
  }

  readParagraph(p: El, out: Block[]) {
    const pPr = kid(p, 'pPr');
    const styleId = attr(kid(pPr, 'pStyle'), 'val') ?? this.defaultParaStyle;
    const st = this.chain(styleId);
    const direct = readPPr(pPr);
    let pp = merge<PProps>(this.docP, st.p, direct);

    // 번호 목록: 번호 정의의 들여쓰기를 기본으로
    let marker = '';
    const numId = pp.numId;
    if (numId && numId !== '0') {
      const ilvl = pp.ilvl ?? 0;
      const lvl = this.numbering.level(numId, ilvl);
      pp = merge<PProps>(this.docP, st.p, lvl?.pPr, direct);
      marker = this.numbering.marker(numId, ilvl);
    }

    const role: ParaRole = 'body';
    const baseR = merge<RProps>(this.docR, st.r);
    const inlines: Inline[] = [];
    this.readRuns(p, baseR, inlines);
    if (marker) {
      const first = inlines.find((i): i is TextRun => i.kind === 'text');
      inlines.unshift({ kind: 'text', text: `${marker} `, sizePt: first?.sizePt ?? baseR.sizePt, font: first?.font ?? baseR.font, color: first?.color ?? baseR.color });
    }

    const style = defaultParaStyle(role);
    style.align = pp.align ?? 'left'; // Word 기본은 왼쪽 정렬
    style.indentLeftMm = twipToMm(pp.indLeft ?? 0);
    style.firstLineMm = twipToMm(pp.firstLine ?? 0);
    style.spaceBeforePt = (pp.before ?? 0) / 20;
    style.spaceAfterPt = (pp.after ?? 0) / 20;
    const para: Paragraph = { type: 'paragraph', role, style, inlines };
    if (pp.line !== undefined) {
      if (pp.lineRule === 'auto' || !pp.lineRule) style.lineSpacingPct = (pp.line / 240) * DOCX_AUTO_LINE_FACTOR * 100;
      else {
        // 최소/고정 → 문단 최대 글자 크기 대비 % (저장기의 정확한 역산)
        let max = 0;
        for (const i of inlines) if (i.kind === 'text') max = Math.max(max, resolveRun(para, i).sizePt);
        max ||= resolveRun(para, { sizePt: baseR.sizePt }).sizePt;
        style.lineSpacingPct = (pp.line / 20 / max / LINE_CALIBRATION) * 100;
      }
    } else style.lineSpacingPct = DOCX_AUTO_LINE_FACTOR * 100;

    // 문단 안의 쪽 나누기
    if (descendantsHas(p, 'br', (b) => attr(b, 'type') === 'page') || kid(pPr, 'pageBreakBefore')) this.warnings.add('쪽 나누기');
    const cleaned = cleanParagraph(para, !!pp.keepNext, st.role);
    // Word: 같은 스타일 문단이 이어지면 contextualSpacing 쪽의 위/아래 간격을 없앤다
    const prev = this.prev;
    if (prev && prev.styleId === styleId) {
      if (prev.contextual) prev.para.style.spaceAfterPt = 0;
      if (pp.contextual) cleaned.style.spaceBeforePt = 0;
    }
    this.prev = { para: cleaned, styleId, contextual: !!pp.contextual };
    out.push(cleaned);
  }

  readRuns(parent: El, baseR: RProps, out: Inline[]) {
    for (const c of kids(parent)) {
      switch (c.localName) {
        case 'r': this.readRun(c, baseR, out); break;
        case 'hyperlink': case 'ins': case 'smartTag': case 'fldSimple': case 'customXml': case 'sdtContent':
          this.readRuns(c, baseR, out); break;
        case 'sdt': this.readRuns(kid(c, 'sdtContent') ?? c, baseR, out); break;
        case 'del': case 'moveFrom': break; // 변경 추적에서 삭제된 글자는 버림
      }
    }
  }

  readRun(r: El, baseR: RProps, out: Inline[]) {
    const rPr = kid(r, 'rPr');
    const rStyle = this.chain(attr(kid(rPr, 'rStyle'), 'val') ?? undefined);
    const rp = merge<RProps>(baseR, rStyle.r, readRPr(rPr));
    const style = { bold: rp.bold, italic: rp.italic, underline: rp.underline, strike: rp.strike, sizePt: rp.sizePt, color: rp.color, font: rp.font };
    for (const c of kids(r)) {
      switch (c.localName) {
        case 't': out.push({ kind: 'text', text: c.textContent ?? '', ...style }); break;
        case 'tab': out.push({ kind: 'text', text: ' ', ...style }); break;
        case 'br': if (attr(c, 'type') !== 'page' && attr(c, 'type') !== 'column') out.push({ kind: 'break' }); break;
        case 'cr': out.push({ kind: 'break' }); break;
        case 'noBreakHyphen': out.push({ kind: 'text', text: '-', ...style }); break;
        case 'drawing': case 'pict': case 'object': this.warnings.add('그림·도형'); break;
        case 'footnoteReference': this.warnings.add('각주'); break;
        case 'endnoteReference': this.warnings.add('미주'); break;
      }
    }
  }

  readTable(tbl: El, widthMm: number) {
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => twipToMm(num(attr(g, 'w')) ?? 0));
    const rows: TableCell[][] = [];
    // 세로 병합 추적: 열 위치 → 시작 셀
    const vOrigin = new Map<number, TableCell>();
    for (const tr of kids(tbl, 'tr')) {
      const row: TableCell[] = [];
      let col = num(attr(path(tr, 'trPr', 'gridBefore'), 'val')) ?? 0;
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr');
        const span = num(attr(kid(tcPr, 'gridSpan'), 'val')) ?? 1;
        const vm = kid(tcPr, 'vMerge');
        const vmVal = vm ? attr(vm, 'val') ?? 'continue' : undefined;
        if (vmVal === 'continue' && vOrigin.has(col)) {
          vOrigin.get(col)!.rowspan++;
          col += span;
          continue;
        }
        const blocks: Block[] = [];
        this.readBody(tc, blocks, true, widthMm);
        const paras = blocks.filter((b): b is Paragraph => b.type === 'paragraph');
        if (!paras.length) paras.push(cleanParagraph({ type: 'paragraph', role: 'body', style: defaultParaStyle(), inlines: [] }));
        const cell: TableCell = { colspan: span, rowspan: 1, blocks: paras };
        const fill = attr(kid(tcPr, 'shd'), 'fill');
        if (fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toUpperCase() !== 'FFFFFF') cell.bg = `#${fill.toUpperCase()}`;
        if (vmVal === 'restart') vOrigin.set(col, cell);
        else vOrigin.delete(col);
        row.push(cell);
        col += span;
      }
      rows.push(row);
    }
    return { type: 'table' as const, rows, colWidthsMm: normalizeWidths(grid, grid.length || Math.max(...rows.map((r) => r.reduce((a, c) => a + c.colspan, 0))), widthMm) };
  }

  readPage(body: El): PageSetup {
    const sect = kids(body, 'sectPr').pop();
    const sz = kid(sect, 'pgSz');
    const m = kid(sect, 'pgMar');
    if (!sz || !m) return { ...DEFAULT_PAGE };
    const v = (n: string) => twipToMm(num(attr(m, n)) ?? 0);
    const top = v('top'), bottom = v('bottom'), header = v('header'), footer = v('footer');
    // units.ts pageToWord 의 역산: 한글 위 여백 = Word 머리말 위치, 한글 머리말 = 나머지
    const split = (body: number, edge: number) => (edge > 0 && edge < body ? [edge, body - edge] : [body, 0]);
    const [mt, hd] = split(top, header);
    const [mb, ft] = split(bottom, footer);
    let w = twipToMm(num(attr(sz, 'w')) ?? 11906);
    let h = twipToMm(num(attr(sz, 'h')) ?? 16838);
    if (attr(sz, 'orient') === 'landscape' && w < h) [w, h] = [h, w];
    return { widthMm: w, heightMm: h, marginTopMm: mt, marginBottomMm: mb, marginLeftMm: v('left'), marginRightMm: v('right'), headerMm: hd, footerMm: ft };
  }
}

function descendantsHas(el: El, name: string, pred: (e: El) => boolean): boolean {
  for (const c of kids(el)) if ((c.localName === name && pred(c)) || descendantsHas(c, name, pred)) return true;
  return false;
}

export async function readDocx(bytes: Uint8Array | ArrayBuffer, title = '문서'): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('DOCX 파일이 아닙니다 (구형 .doc 는 Word 에서 .docx 로 저장한 뒤 여세요)');
  }
  const main = zip.file('word/document.xml');
  if (!main) throw new Error('DOCX 구조가 아닙니다 (word/document.xml 없음)');
  const optional = async (name: string) => {
    const f = zip.file(name);
    return f ? parseXml(await f.async('string')) : undefined;
  };
  const r = new Reader();
  r.readStyles(await optional('word/styles.xml'));
  r.numbering = new Numbering(await optional('word/numbering.xml'));
  if (zip.file(/^word\/header\d*\.xml$/).length || zip.file(/^word\/footer\d*\.xml$/).length) {
    const hasText = await Promise.all(
      [...zip.file(/^word\/header\d*\.xml$/), ...zip.file(/^word\/footer\d*\.xml$/)].map(async (f) => /<w:t[ >]/.test(await f.async('string'))),
    );
    if (hasText.some(Boolean)) r.warnings.add('머리말·꼬리말');
  }

  const doc = parseXml(await main.async('string'));
  const body = kid(doc.documentElement, 'body');
  if (!body) throw new Error('본문이 없습니다');
  const page = r.readPage(body);
  const blocks: Block[] = [];
  r.readBody(body, blocks, false, contentWidthMm(page));
  if (kids(body, 'sectPr').length === 0 && descendantsHas(body, 'sectPr', () => true)) r.warnings.add('여러 구역(첫 구역의 쪽 설정으로 통일)');
  if (!blocks.length || blocks[blocks.length - 1].type === 'table') {
    blocks.push(cleanParagraph({ type: 'paragraph', role: 'body', style: defaultParaStyle(), inlines: [] }));
  }
  const core = zip.file('docProps/core.xml');
  const savedTitle = core ? (await core.async('string')).match(/<dc:title>([^<]+)<\/dc:title>/)?.[1]?.trim() : undefined;
  const unescape = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return { doc: { title: savedTitle ? unescape(savedTitle) : title, page, blocks } as Doc, warnings: [...r.warnings] };
}
