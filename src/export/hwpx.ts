/**
 * Doc → HWPX (OWPML, KS X 6101)
 *
 * 원칙: XML 을 처음부터 만들지 않는다.
 *   한컴오피스 한글이 직접 저장한 빈 문서(templates/blank.hwpx)를 열고,
 *   - header.xml 에는 필요한 글꼴/글자모양(charPr)/문단모양(paraPr)/테두리(borderFill)를 "추가"만 하고
 *   - section0.xml 에는 한글이 만든 구역 설정(secPr)을 그대로 둔 채 본문 문단만 채운다.
 *
 * 한글 고유 규칙 (실제 한글 파일에서 확인):
 *   - mimetype 은 ZIP 의 첫 항목이며 압축하지 않는다(STORE).
 *   - paraPr 의 여백은 <hp:case>(HwpUnitChar) 와 <hp:default> 두 곳에 쓰며, default 쪽은 값이 2배다.
 *   - 줄바꿈은 <hp:t> 안의 <hp:lineBreak/>.
 *   - linesegarray(줄 배치 캐시)는 생략 → 한글이 열 때 다시 계산한다.
 */
import JSZip from 'jszip';
import type { Align, BorderLine, CellBorders, Doc, Paragraph, ParaRole, ParaStyle, Table, TableCell } from '../model/types';
import { DEFAULT_BORDER, cleanBorders, resolveEdges } from '../model/borders';
import { TABLE_DEFAULTS, defaultParaStyle } from '../model/defaults';
import { maxSizePt, plainText, resolveRun, runKey, xmlEscape, type ResolvedRun } from '../model/resolve';
import { placeCells } from '../model/table';
import { hwpBorderWidth, mmToHwp, ptToHwp } from '../model/units';
import { BLANK_HWPX_BASE64 } from './templates.generated';

const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const;
const LANG_ATTR = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'] as const;
const HWP_ALIGN: Record<Align, string> = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFY' };
const HWP_LINE = { none: 'NONE', solid: 'SOLID', double: 'DOUBLE_SLIM' } as const;
const NS_UNITCHAR = 'http://www.hancom.co.kr/hwpml/2016/HwpUnitChar';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function itemCnt(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<hh:${tag} itemCnt="(\\d+)"`));
  if (!m) throw new Error(`템플릿 header.xml 에 ${tag} 가 없습니다`);
  return Number(m[1]);
}

const langAttrs = (v: number | string) => LANG_ATTR.map((a) => `${a}="${v}"`).join(' ');

interface ParaKey {
  style: ParaStyle;
  keepNext: boolean;
}

/** header.xml 에 추가할 항목들을 모아 두었다가 한 번에 삽입한다 */
class HeaderBuilder {
  private fontNames: string[] = [];
  private charPrs: ResolvedRun[] = [];
  private charIds = new Map<string, number>();
  private paraPrs: ParaKey[] = [];
  private paraIds = new Map<string, number>();
  private headingStyles = new Map<ParaRole, { id: number; para: number; char: number }>();
  private readonly charBase: number;
  private readonly paraBase: number;
  private readonly styleBase: number;
  readonly tableBorderFillId: number;
  /** 칸 모양(배경색 + 테두리)별 borderFill — 기본 모양 = tableBorderFillId */
  private cellFills: { bg?: string; borders?: CellBorders }[] = [];
  private cellFillKeys: string[] = [];

  constructor(private readonly template: string) {
    this.charBase = itemCnt(template, 'charProperties');
    this.paraBase = itemCnt(template, 'paraProperties');
    this.styleBase = itemCnt(template, 'styles');
    // borderFill id 는 1 부터 시작 → 다음 id = itemCnt + 1
    this.tableBorderFillId = itemCnt(template, 'borderFills') + 1;
  }

  charPr(r: ResolvedRun): number {
    const key = runKey(r);
    let id = this.charIds.get(key);
    if (id === undefined) {
      id = this.charBase + this.charPrs.length;
      this.charPrs.push(r);
      this.charIds.set(key, id);
      if (!this.fontNames.includes(r.font)) this.fontNames.push(r.font);
    }
    return id;
  }

  paraPr(style: ParaStyle, keepNext = false): number {
    const key = JSON.stringify([style, keepNext]);
    let id = this.paraIds.get(key);
    if (id === undefined) {
      id = this.paraBase + this.paraPrs.length;
      this.paraPrs.push({ style, keepNext });
      this.paraIds.set(key, id);
    }
    return id;
  }

  cellBorderFill(cell: Pick<TableCell, 'bg' | 'borders'>): number {
    const bg = cell.bg?.toUpperCase();
    const borders = cleanBorders(cell.borders);
    if (!bg && !borders) return this.tableBorderFillId;
    const key = JSON.stringify([bg ?? null, borders ?? null]);
    let i = this.cellFillKeys.indexOf(key);
    if (i < 0) {
      i = this.cellFillKeys.push(key) - 1;
      this.cellFills.push({ bg, borders });
    }
    return this.tableBorderFillId + 1 + i;
  }

  /** 제목 1~3 스타일 (한글 스타일 목록에 "제목 1" 등으로 보이고, 다시 열 때 제목으로 인식) */
  headingStyle(role: ParaRole): number {
    if (role === 'body') return 0;
    let st = this.headingStyles.get(role);
    if (!st) {
      const empty: Paragraph = { type: 'paragraph', role, style: defaultParaStyle(role), inlines: [] };
      st = { id: this.styleBase + this.headingStyles.size, para: this.paraPr(empty.style, true), char: this.charPr(resolveRun(empty)) };
      this.headingStyles.set(role, st);
    }
    return st.id;
  }

  build(): string {
    let xml = this.template;
    const typeInfo = this.template.match(/<hh:typeInfo [^>]*\/>/)?.[0] ?? '';

    // 1) 글꼴: 언어별(fontface) 목록에 없는 글꼴만 추가하고, 언어별 id 를 기록
    const fontIds: Record<string, Map<string, number>> = {};
    xml = xml.replace(/<hh:fontface lang="([A-Z]+)" fontCnt="(\d+)">([\s\S]*?)<\/hh:fontface>/g, (_m, lang: string, cnt: string, body: string) => {
      const ids = new Map<string, number>();
      for (const f of body.matchAll(/<hh:font id="(\d+)" face="([^"]*)"/g)) ids.set(f[2], Number(f[1]));
      let n = Number(cnt);
      let added = '';
      for (const name of this.fontNames) {
        if (ids.has(name)) continue;
        ids.set(name, n);
        added += `<hh:font id="${n}" face="${xmlEscape(name)}" type="TTF" isEmbedded="0">${typeInfo}</hh:font>`;
        n++;
      }
      fontIds[lang] = ids;
      return `<hh:fontface lang="${lang}" fontCnt="${n}">${body}${added}</hh:fontface>`;
    });

    // 2) 표 테두리 (칸마다 네 변의 선 + 배경색)
    const line = (side: string, b: BorderLine) =>
      `<hh:${side} type="${HWP_LINE[b.style]}" width="${hwpBorderWidth(b.style === 'none' ? 0.1 : b.widthMm)}" color="${b.color}"/>`;
    const fill = (id: number, bg?: string, cb?: CellBorders) =>
      `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
      `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
      line('leftBorder', cb?.left ?? DEFAULT_BORDER) + line('rightBorder', cb?.right ?? DEFAULT_BORDER) +
      line('topBorder', cb?.top ?? DEFAULT_BORDER) + line('bottomBorder', cb?.bottom ?? DEFAULT_BORDER) +
      `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
      // 칸 배경색: 단색 채우기 (한글 "셀 테두리/배경 → 배경 → 면 색")
      (bg ? `<hc:fillBrush><hc:winBrush faceColor="${bg}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '') +
      `</hh:borderFill>`;
    const fills = [fill(this.tableBorderFillId), ...this.cellFills.map((f, i) => fill(this.tableBorderFillId + 1 + i, f.bg, f.borders))];
    xml = appendItems(xml, 'borderFills', fills.join(''), fills.length);

    // 3) 글자 모양
    const charXml = this.charPrs
      .map((r, i) => {
        const fontRef = LANG_ATTR.map((a, li) => `${a}="${fontIds[LANGS[li]]?.get(r.font) ?? 0}"`).join(' ');
        return (
          `<hh:charPr id="${this.charBase + i}" height="${ptToHwp(r.sizePt)}" textColor="${r.color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
          `<hh:fontRef ${fontRef}/><hh:ratio ${langAttrs(100)}/><hh:spacing ${langAttrs(r.spacing)}/><hh:relSz ${langAttrs(100)}/><hh:offset ${langAttrs(0)}/>` +
          (r.italic ? '<hh:italic/>' : '') +
          (r.bold ? '<hh:bold/>' : '') +
          `<hh:underline type="${r.underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${r.color}"/>` +
          `<hh:strikeout shape="${r.strike ? 'SOLID' : 'NONE'}" color="${r.color}"/>` +
          `<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`
        );
      })
      .join('');
    xml = appendItems(xml, 'charProperties', charXml, this.charPrs.length);

    // 4) 문단 모양
    const paraXml = this.paraPrs.map((p, i) => paraPrXml(this.paraBase + i, p)).join('');
    xml = appendItems(xml, 'paraProperties', paraXml, this.paraPrs.length);

    // 5) 제목 스타일
    const styleXml = [...this.headingStyles.entries()]
      .map(([role, st]) => {
        const n = role.slice(1);
        return `<hh:style id="${st.id}" type="PARA" name="제목 ${n}" engName="Heading ${n}" paraPrIDRef="${st.para}" charPrIDRef="${st.char}" nextStyleIDRef="0" langID="1042" lockForm="0"/>`;
      })
      .join('');
    xml = appendItems(xml, 'styles', styleXml, this.headingStyles.size);
    return xml;
  }
}

function appendItems(xml: string, tag: string, items: string, count: number): string {
  if (!count) return xml;
  const cnt = itemCnt(xml, tag);
  return xml
    .replace(`<hh:${tag} itemCnt="${cnt}"`, `<hh:${tag} itemCnt="${cnt + count}"`)
    .replace(`</hh:${tag}>`, `${items}</hh:${tag}>`);
}

function paraPrXml(id: number, { style: s, keepNext }: ParaKey): string {
  const v = {
    intent: mmToHwp(s.firstLineMm),
    left: mmToHwp(s.indentLeftMm),
    prev: ptToHwp(s.spaceBeforePt),
    next: ptToHwp(s.spaceAfterPt),
  };
  // <hp:default> 쪽 값은 2배 (한글 실제 파일과 동일)
  const margin = (k: number) =>
    `<hh:margin><hc:intent value="${v.intent * k}" unit="HWPUNIT"/><hc:left value="${v.left * k}" unit="HWPUNIT"/>` +
    `<hc:right value="0" unit="HWPUNIT"/><hc:prev value="${v.prev * k}" unit="HWPUNIT"/><hc:next value="${v.next * k}" unit="HWPUNIT"/></hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="${Math.round(s.lineSpacingPct)}" unit="HWPUNIT"/>`;
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">` +
    `<hh:align horizontal="${HWP_ALIGN[s.align]}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="${keepNext ? 1 : 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
    `<hp:switch><hp:case hp:required-namespace="${NS_UNITCHAR}">${margin(1)}</hp:case><hp:default>${margin(2)}</hp:default></hp:switch>` +
    `<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`
  );
}

/** 본문(section0.xml) 생성기 */
class SectionBuilder {
  private nextParaId = 0;
  private nextObjId = 1;

  constructor(private readonly hb: HeaderBuilder) {}

  paragraph(p: Paragraph, prefixRun = ''): string {
    const ppr = this.hb.paraPr(p.style, p.role !== 'body');
    const styleId = this.hb.headingStyle(p.role);
    let runs = '';
    let lastChar = this.hb.charPr(resolveRun(p));
    for (const i of p.inlines) {
      if (i.kind === 'break') {
        runs += `<hp:run charPrIDRef="${lastChar}"><hp:t><hp:lineBreak/></hp:t></hp:run>`;
        continue;
      }
      if (!i.text) continue;
      lastChar = this.hb.charPr(resolveRun(p, i));
      runs += `<hp:run charPrIDRef="${lastChar}"><hp:t>${xmlEscape(i.text)}</hp:t></hp:run>`;
    }
    // 빈 문단도 글자 크기만큼 높이를 갖도록 해당 글자모양의 빈 run 을 둔다
    if (!runs) runs = `<hp:run charPrIDRef="${lastChar}"><hp:t/></hp:run>`;
    return this.p(ppr, prefixRun + runs, styleId, !!p.pageBreak);
  }

  private p(paraPrId: number, inner: string, styleId = 0, pageBreak = false): string {
    return `<hp:p id="${this.nextParaId++}" paraPrIDRef="${paraPrId}" styleIDRef="${styleId}" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">${inner}</hp:p>`;
  }

  /** 머리말/꼬리말 컨트롤 (한글이 저장하는 모양: 첫 문단의 구역 설정 run 안) */
  headerFooter(kind: 'header' | 'footer', paras: Paragraph[], doc: Doc): string {
    const id = kind === 'header' ? 1000000101 : 1000000102;
    const w = mmToHwp(doc.page.widthMm - doc.page.marginLeftMm - doc.page.marginRightMm);
    const h = mmToHwp(kind === 'header' ? doc.page.headerMm : doc.page.footerMm);
    const body = paras.map((p) => this.paragraph(p)).join('');
    return (
      `<hp:ctrl><hp:${kind} id="${id}" applyPageType="BOTH">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${kind === 'header' ? 'TOP' : 'BOTTOM'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${w}" textHeight="${h}" hasTextRef="0" hasNumRef="0">${body}</hp:subList>` +
      `</hp:${kind}></hp:ctrl>`
    );
  }

  table(table: Table, prefixRun = ''): string {
    const t = resolveEdges(table);
    const { placed, rowCount, colCount } = placeCells(t);
    const bf = this.hb.tableBorderFillId;
    const colW = t.colWidthsMm.map(mmToHwp);
    const padLR = mmToHwp(TABLE_DEFAULTS.cellPadLeftRightMm);
    const padTB = mmToHwp(TABLE_DEFAULTS.cellPadTopBottomMm);
    const margin = (tag: string) => `<hp:${tag} left="${padLR}" right="${padLR}" top="${padTB}" bottom="${padTB}"/>`;

    // 행 높이 추정치 (한글이 열 때 내용에 맞춰 다시 늘린다)
    const estimate = (ps: Paragraph[]) =>
      ps.reduce((h, p) => h + ptToHwp(maxSizePt(p) * (p.style.lineSpacingPct / 100)) + ptToHwp(p.style.spaceBeforePt + p.style.spaceAfterPt), 0) + padTB * 2;
    const rowH = Array.from({ length: rowCount }, (_, r) =>
      Math.max(0, ...placed[r].filter((pc) => pc.rowspan === 1).map((pc) => estimate(pc.cell.blocks))) || estimate([]),
    );

    const rows = placed
      .map((row) => {
        const cells = row
          .map((pc) => {
            const width = colW.slice(pc.col, pc.col + pc.colspan).reduce((a, b) => a + b, 0);
            const height = rowH.slice(pc.row, pc.row + pc.rowspan).reduce((a, b) => a + b, 0);
            const paras = pc.cell.blocks.map((b) => this.paragraph(b)).join('');
            return (
              `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${this.hb.cellBorderFill(pc.cell)}">` +
              `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paras}</hp:subList>` +
              `<hp:cellAddr colAddr="${pc.col}" rowAddr="${pc.row}"/><hp:cellSpan colSpan="${pc.colspan}" rowSpan="${pc.rowspan}"/>` +
              `<hp:cellSz width="${width}" height="${height}"/>${margin('cellMargin')}</hp:tc>`
            );
          })
          .join('');
        return `<hp:tr>${cells}</hp:tr>`;
      })
      .join('');

    const totalW = colW.reduce((a, b) => a + b, 0);
    const totalH = rowH.reduce((a, b) => a + b, 0);
    const id = this.nextObjId++;
    const tbl =
      `<hp:tbl id="${1000000000 + id}" zOrder="${id - 1}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCount}" colCnt="${colCount}" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0">` +
      `<hp:sz width="${totalW}" widthRelTo="ABSOLUTE" height="${totalH}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/>${margin('inMargin')}${rows}</hp:tbl>`;

    // 표를 담는 문단: 줄 간격 100%, 여백 0 (Word 의 표 배치와 같은 높이가 되도록)
    const host = this.hb.paraPr({ align: 'left', indentLeftMm: 0, firstLineMm: 0, spaceBeforePt: 0, spaceAfterPt: 0, lineSpacingPct: 100 });
    const baseChar = this.hb.charPr(resolveRun({ type: 'paragraph', role: 'body', style: {} as ParaStyle, inlines: [] }));
    return this.p(host, `${prefixRun}<hp:run charPrIDRef="${baseChar}">${tbl}<hp:t/></hp:run>`);
  }
}

function applyPage(secRun: string, doc: Doc): string {
  const p = doc.page;
  const landscape = p.widthMm > p.heightMm;
  return secRun
    .replace(/<hp:pagePr [^>]*>/, (tag) =>
      tag
        .replace(/landscape="[^"]*"/, `landscape="${landscape ? 'NARROWLY' : 'WIDELY'}"`)
        .replace(/width="\d+"/, `width="${mmToHwp(p.widthMm)}"`)
        .replace(/height="\d+"/, `height="${mmToHwp(p.heightMm)}"`),
    )
    .replace(
      /<hp:margin [^>]*\/>/,
      `<hp:margin header="${mmToHwp(p.headerMm)}" footer="${mmToHwp(p.footerMm)}" gutter="0" left="${mmToHwp(p.marginLeftMm)}" right="${mmToHwp(p.marginRightMm)}" top="${mmToHwp(p.marginTopMm)}" bottom="${mmToHwp(p.marginBottomMm)}"/>`,
    );
}

function koreanDate(d: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const h = d.getHours();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export async function docToHwpx(doc: Doc, now = new Date()): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(base64ToBytes(BLANK_HWPX_BASE64));
  const read = (name: string) => {
    const f = zip.file(name);
    if (!f) throw new Error(`템플릿에 ${name} 가 없습니다`);
    return f.async('string');
  };
  const [headerTpl, sectionTpl, hpfTpl] = await Promise.all([read('Contents/header.xml'), read('Contents/section0.xml'), read('Contents/content.hpf')]);

  // 템플릿 본문에서 루트 태그와 구역 설정 run 만 가져온다
  const rootOpen = sectionTpl.match(/^[\s\S]*?<hs:sec[^>]*>/)?.[0];
  const secRunTpl = sectionTpl.match(/<hp:run charPrIDRef="\d+"><hp:secPr[\s\S]*?<\/hp:ctrl><\/hp:run>/)?.[0];
  if (!rootOpen || !secRunTpl) throw new Error('템플릿 section0.xml 구조를 읽을 수 없습니다');
  const hb = new HeaderBuilder(headerTpl);
  const sb = new SectionBuilder(hb);
  // 쪽 번호(한글 "쪽 번호 매기기")·머리말·꼬리말은 첫 문단의 구역 설정 run 끝에 붙는다
  let extra = '';
  if (doc.header?.length) extra += sb.headerFooter('header', doc.header, doc);
  if (doc.footer?.length) extra += sb.headerFooter('footer', doc.footer, doc);
  if (doc.pageNumber) {
    const pos = { 'bottom-center': 'BOTTOM_CENTER', 'bottom-right': 'BOTTOM_RIGHT', 'top-center': 'TOP_CENTER', 'top-right': 'TOP_RIGHT' }[doc.pageNumber.pos];
    extra += `<hp:ctrl><hp:pageNum pos="${pos}" formatType="DIGIT" sideChar="${doc.pageNumber.dash ? '-' : ''}"/></hp:ctrl>`;
  }
  const secRun = applyPage(secRunTpl, doc).replace(/<\/hp:run>$/, `${extra}</hp:run>`);
  const body = doc.blocks
    .map((b, i) => {
      const prefix = i === 0 ? secRun : '';
      return b.type === 'paragraph' ? sb.paragraph(b, prefix) : sb.table(b, prefix);
    })
    .join('');

  const section = `${rootOpen}${body}</hs:sec>`;
  const header = hb.build();

  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const hpf = hpfTpl
    .replace(/<opf:title\/>|<opf:title>[\s\S]*?<\/opf:title>/, `<opf:title>${xmlEscape(doc.title)}</opf:title>`)
    .replace(/(<opf:meta name="(?:creator|lastsaveby)" content="text">)[^<]*/g, '$1HanWord')
    .replace(/(<opf:meta name="(?:CreatedDate|ModifiedDate)" content="text">)[^<]*/g, `$1${iso}`)
    .replace(/(<opf:meta name="date" content="text">)[^<]*/, `$1${koreanDate(now)}`);

  // 새 ZIP: mimetype 을 맨 앞에 무압축으로, 나머지는 템플릿 순서대로
  const out = new JSZip();
  out.file('mimetype', await zip.file('mimetype')!.async('uint8array'), { compression: 'STORE' });
  const replaced: Record<string, string> = {
    'Contents/header.xml': header,
    'Contents/section0.xml': section,
    'Contents/content.hpf': hpf,
    'Preview/PrvText.txt': plainText(doc.blocks).slice(0, 1024).replace(/\n/g, '\r\n'),
  };
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || name === 'mimetype') continue;
    out.file(name, replaced[name] ?? (await entry.async('uint8array')), { compression: 'DEFLATE' });
  }
  return out.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
