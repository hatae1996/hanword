/**
 * AI 가 쓴 글(마크다운) ↔ HanWord 문서
 *
 * AI(Claude, ChatGPT …)는 마크다운으로 글을 잘 쓴다. 그 글을 앱 편집기와 "똑같은 규칙"으로 문서로 바꿔
 * HWPX(한글)·DOCX(Word)로 저장할 수 있게 한다. 반대로 HWPX/DOCX 를 마크다운으로 바꿔 AI 가 읽고 고칠 수 있게 한다.
 *
 * 지원하는 문법 (자세한 설명: docs/AI-작성-가이드.md)
 *  - # / ## / ### 제목 1~3, **굵게**, *기울임*, ~~취소선~~, <u>밑줄</u>, 목록, 표(GFM)
 *  - 개조식: 줄 맨 앞의 □ ○ ◦ · ※ 를 보고 단계별 내어쓰기를 자동 적용
 *  - HTML 보조: <span style="color:#C00000; font-size:14pt; font-family:바탕">, <p align="center">,
 *               병합 표 <td colspan="2" rowspan="2">, 열 너비 <td width="30%">
 *  - 맨 위 설정: ---\n제목: …\n용지: A4 가로\n여백: 20 30 15 30\n글꼴: 바탕\n글자크기: 11\n---
 */
import { Marked, type Tokens } from 'marked';
import type { Block, Doc, Inline, PageSetup, Paragraph, Table, TextRun } from '../model/types';
import { DEFAULT_FONT, DEFAULT_PAGE, ROLE_RUN, contentWidthMm, defaultParaStyle } from '../model/defaults';
import { cleanRun } from '../model/normalize';
import { tiptapToDoc, type PMNode } from '../model/fromTiptap';
import { placeCells } from '../model/table';

export interface MdMeta {
  title?: string;
  landscape?: boolean;
  /** 위 오른쪽 아래 왼쪽 (mm) */
  margins?: [number, number, number, number];
  font?: string;
  sizePt?: number;
  linePct?: number;
}

// ── 개조식 ───────────────────────────────────────────────
/** 줄 맨 앞 기호 → 단계 (공문서 개조식 관례) */
const MARKERS: { re: RegExp; level: number }[] = [
  { re: /^[□■]/, level: 0 },
  { re: /^[○●]/, level: 1 },
  { re: /^※/, level: 1 },
  { re: /^[◦▪]/, level: 2 },
  { re: /^[·∙]/, level: 3 },
];
export const GAEJO_STEP_MM = 5; // 단계마다 들여쓰기
export const GAEJO_HANG_MM = 5; // 기호 폭만큼 내어쓰기 (둘째 줄이 글자 시작에 맞도록)

export function gaejoLevel(text: string): number | null {
  // 줄 앞의 서식 태그(<span …>, <strong> 등)는 무시하고 첫 글자를 본다
  const t = text.replace(/^(\s*<[^>]+>)+/, '').trimStart();
  for (const m of MARKERS) if (m.re.test(t)) return m.level;
  return null;
}

// ── 맨 위 설정(front matter) ─────────────────────────────
function parseFrontMatter(md: string): { meta: MdMeta; body: string } {
  const m = md.match(/^﻿?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { meta: {}, body: md };
  const meta: MdMeta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const val = kv[2].replace(/^["']|["']$/g, '');
    if (['제목', 'title'].includes(key)) meta.title = val;
    else if (['용지', 'paper', '방향', 'orientation'].includes(key)) meta.landscape = /가로|landscape/i.test(val);
    else if (['여백', 'margin', 'margins'].includes(key)) {
      const n = val.split(/[\s,]+/).map(Number).filter((x) => isFinite(x) && x >= 0);
      if (n.length === 1) meta.margins = [n[0], n[0], n[0], n[0]];
      else if (n.length === 2) meta.margins = [n[0], n[1], n[0], n[1]];
      else if (n.length >= 4) meta.margins = [n[0], n[1], n[2], n[3]];
    } else if (['글꼴', 'font'].includes(key)) meta.font = val;
    else if (['글자크기', '글자 크기', 'size', 'fontsize'].includes(key)) meta.sizePt = parseFloat(val) || undefined;
    else if (['줄간격', '줄 간격', 'line', 'linespacing'].includes(key)) meta.linePct = parseFloat(val) || undefined;
  }
  return { meta, body: md.slice(m[0].length) };
}

export function pageFromMeta(meta: MdMeta): PageSetup {
  const page = { ...DEFAULT_PAGE };
  if (meta.landscape) [page.widthMm, page.heightMm] = [page.heightMm, page.widthMm];
  if (meta.margins) {
    // 여백은 "본문까지" 거리로 받는다 → 한글 방식(위 여백 + 머리말)으로 나눠 담기
    const [t, r, b, l] = meta.margins;
    page.marginTopMm = Math.max(0, t - page.headerMm);
    page.marginBottomMm = Math.max(0, b - page.footerMm);
    if (t < page.headerMm) [page.marginTopMm, page.headerMm] = [t, 0];
    if (b < page.footerMm) [page.marginBottomMm, page.footerMm] = [b, 0];
    page.marginRightMm = r;
    page.marginLeftMm = l;
  }
  return page;
}

// ── 마크다운 → HTML ──────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 한국어 강조 보정 — 마크다운 표준 규칙은 `**한글(HWPX)**과` 처럼 닫는 ** 앞이 문장부호이고 뒤에 조사가
 * 바로 붙으면 굵게로 인정하지 않는다. 한국어 문서에서는 거의 매번 생기므로 미리 HTML 태그로 바꾼다.
 * (코드 `…` 안은 건드리지 않음)
 */
export function fixKoreanEmphasis(line: string): string {
  return line
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part
            .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')
            .replace(/__(?=\S)([^_\n]*?\S)__/g, '<strong>$1</strong>')
            .replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<s>$1</s>')
            .replace(/(^|[^*\\])\*(?=[^\s*])([^*\n]*?[^\s*\\])\*(?!\*)/g, '$1<em>$2</em>'),
    )
    .join('');
}

/** 줄 안의 두 칸 이상 띄어쓰기 보존 (공문 "1부.  끝." 등). 줄 앞뒤 공백은 그대로 둔다 */
const keepSpaces = (line: string) =>
  line.replace(/(\S)( {2,})(?=\S)/g, (_m, c: string, sp: string) => c + ' ' + ' '.repeat(sp.length - 1));

/** 개조식 줄은 각각 한 문단이 되도록 빈 줄을 끼우고, 앞 공백(코드 블록으로 오인됨)을 없앤다 */
function preprocess(md: string): string {
  const out: string[] = [];
  let fence = false;
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      out.push(raw);
      continue;
    }
    if (fence) {
      out.push(raw);
      continue;
    }
    const line = keepSpaces(fixKoreanEmphasis(raw));
    if (gaejoLevel(line) !== null && !/^\s*\|/.test(line)) {
      if (out.length && out[out.length - 1].trim() !== '') out.push('');
      out.push(line.trimStart());
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** HTML 보조 문법 정리: align 속성 → style, 셀 너비 % → 편집기 열 너비, th → 굵은 가운데 td */
function postprocessHtml(html: string, contentPx: number): string {
  // <p align="center"> 등 → style="text-align:center"
  html = html.replace(/<(p|h[1-6]|div|td|th)\b([^>]*?)\salign\s*=\s*["']?(left|center|right|justify)["']?([^>]*)>/gi, (_m, tag, a, al, b) => {
    const rest = `${a}${b}`;
    return /\bstyle\s*=\s*"/i.test(rest)
      ? `<${tag}${rest.replace(/\bstyle\s*=\s*"/i, `style="text-align:${al};`)}>`
      : `<${tag}${rest} style="text-align:${al}">`;
  });
  // 표 칸: 정렬·머리글·너비
  html = html.replace(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_m, tag: string, attrs: string, inner: string) => {
    const align = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1]?.toLowerCase();
    const pct = attrs.match(/\bwidth\s*=\s*["']?([\d.]+)%/i)?.[1] ?? attrs.match(/(?:^|[;\s"])width\s*:\s*([\d.]+)%/i)?.[1];
    const colspan = Number(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1);
    let a = attrs.replace(/\swidth\s*=\s*["']?[\d.]+%?["']?/i, '');
    if (pct && colspan === 1) a += ` colwidth="${Math.round((parseFloat(pct) / 100) * contentPx)}"`; // 편집기 표는 colwidth(px, 정수)를 읽는다
    const isHead = tag.toLowerCase() === 'th';
    const pAlign = align ?? (isHead ? 'center' : undefined);
    let body = inner.trim();
    const hasBlock = /<(p|h[1-6]|ul|ol|div)\b/i.test(body);
    if (!hasBlock) {
      // 칸 안 줄바꿈(<br>)은 문단으로 나눈다 — 한글·Word 표에서 흔한 모양
      const parts = body.split(/<br\s*\/?>/i);
      body = parts.map((t) => `<p${pAlign ? ` style="text-align:${pAlign}"` : ''}>${isHead && t.trim() ? `<strong>${t}</strong>` : t}</p>`).join('');
    } else if (isHead) body = body.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_x, pa, t) => `<p${pa || ' style="text-align:center"'}><strong>${t}</strong></p>`);
    return `<td${a}>${body}</td>`;
  });
  return html;
}

export interface MdResult {
  html: string;
  meta: MdMeta;
  warnings: string[];
}

export function markdownToHtml(md: string): MdResult {
  // Windows 메모장 등에서 저장한 글(CRLF 줄바꿈, BOM)도 같게 읽도록 먼저 정리
  const { meta, body } = parseFrontMatter(md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  const warnings = new Set<string>();
  const page = pageFromMeta(meta);
  const contentPx = (contentWidthMm(page) * 96) / 25.4;

  const marked = new Marked({ gfm: true, breaks: true, async: false });
  marked.use({
    walkTokens(t) {
      if (t.type === 'image') warnings.add('그림(빠짐)');
      else if (t.type === 'hr') warnings.add('가로줄(빠짐)');
      else if (t.type === 'code') warnings.add('코드 블록(일반 글로 바뀜)');
      else if (t.type === 'blockquote') warnings.add('인용(일반 문단으로 바뀜)');
      else if (t.type === 'html' && /<img\b/i.test((t as Tokens.HTML).text)) warnings.add('그림(빠짐)');
    },
    renderer: {
      heading(this: any, t: Tokens.Heading) {
        const level = Math.min(3, t.depth);
        return `<h${level}>${this.parser.parseInline(t.tokens)}</h${level}>\n`;
      },
      paragraph(this: any, t: Tokens.Paragraph) {
        const inline = this.parser.parseInline(t.tokens);
        // 문단 전체가 HTML 블록이면 그대로
        if (/^\s*<(p|h[1-6]|table|div)\b/i.test(t.text)) return inline;
        const level = gaejoLevel(t.text);
        if (level === null) return `<p>${inline}</p>\n`;
        const left = level * GAEJO_STEP_MM + GAEJO_HANG_MM;
        return `<p data-indent-left="${left}" data-first-line="${-GAEJO_HANG_MM}" style="text-align:left">${inline}</p>\n`;
      },
      tablecell(this: any, t: Tokens.TableCell) {
        const inline = this.parser.parseInline(t.tokens);
        const tag = t.header ? 'th' : 'td';
        return `<${tag}${t.align ? ` style="text-align:${t.align}"` : ''}>${inline}</${tag}>`;
      },
      code(t: Tokens.Code) {
        return t.text.split('\n').map((l) => `<p>${esc(l)}</p>`).join('\n') + '\n';
      },
      hr() {
        return '';
      },
      image() {
        return '';
      },
      blockquote(this: any, t: Tokens.Blockquote) {
        return this.parser.parse(t.tokens);
      },
    },
  });
  const raw = marked.parse(preprocess(body)) as string;
  return { html: postprocessHtml(raw, contentPx), meta, warnings: [...warnings] };
}

/** 머리말 설정(기본 글꼴·크기·줄 간격)을 문서 전체에 적용 */
function applyMetaDefaults(blocks: Block[], meta: MdMeta) {
  const para = (p: Paragraph) => {
    if (meta.linePct && p.style.lineSpacingPct === 160) p.style.lineSpacingPct = meta.linePct;
    for (const i of p.inlines) {
      if (i.kind !== 'text') continue;
      if (meta.font && meta.font !== DEFAULT_FONT && !i.font) i.font = meta.font;
      if (meta.sizePt && p.role === 'body' && meta.sizePt !== ROLE_RUN.body.sizePt && !i.sizePt) i.sizePt = meta.sizePt;
    }
    const font = meta.font && meta.font !== DEFAULT_FONT ? meta.font : undefined;
    const size = meta.sizePt && meta.sizePt !== ROLE_RUN.body.sizePt ? meta.sizePt : undefined;
    if (!p.inlines.some((i) => i.kind === 'text') && (font || size)) {
      // 빈 문단도 같은 높이가 되도록 보이지 않는 서식 조각을 둔다 (저장기가 문단 글자모양으로 씀)
      p.inlines.push({ kind: 'text', text: '', font, sizePt: p.role === 'body' ? size : undefined });
    }
  };
  for (const b of blocks) {
    if (b.type === 'paragraph') para(b);
    else for (const row of b.rows) for (const c of row) c.blocks.forEach(para);
  }
}

export type GenerateJSON = (html: string) => PMNode;

/** 마크다운 → 문서. generateJSON 은 편집기 스키마로 HTML 을 읽는 함수 (브라우저/Node 에서 각각 주입) */
export function markdownToDoc(md: string, generateJSON: GenerateJSON, fallbackTitle = '문서'): { doc: Doc; warnings: string[] } {
  const { html, meta, warnings } = markdownToHtml(md);
  const json = generateJSON(html);
  const doc = tiptapToDoc(json, meta.title || fallbackTitle, pageFromMeta(meta));
  applyMetaDefaults(doc.blocks, meta);
  return { doc, warnings };
}

// ── 문서 → 마크다운 (AI 가 한글/Word 문서를 읽고 고칠 수 있게) ─────────────
const MD_SPECIAL = /([\\`*_~<>[\]|])/g;
const escMd = (s: string) => s.replace(MD_SPECIAL, '\\$1');
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runStyleCss(r: TextRun): string {
  const css: string[] = [];
  if (r.color) css.push(`color:${r.color}`);
  if (r.sizePt) css.push(`font-size:${r.sizePt}pt`);
  if (r.font) css.push(`font-family:${r.font}`);
  return css.join('; ');
}

/**
 * 글자 조각들 → 마크다운(md) 또는 HTML(html) 인라인.
 *  - 기본값과 같은 서식(맑은 고딕, 검정, 기본 크기)은 적지 않는다
 *  - 문단 앞뒤 공백은 마크다운에서 사라지므로 줄바꿈 없는 공백(U+00A0)으로 보존
 *  - 앞뒤에 공백이 있는 굵게/기울임은 마크다운 규칙상 ** 로 감쌀 수 없어 HTML 태그로 쓴다
 */
function inlines(p: Paragraph, mode: 'md' | 'html'): string {
  const list = p.inlines.map((i) => (i.kind === 'text' ? cleanRun(p, i) : i));
  const firstText = list.findIndex((i) => i.kind === 'text' && i.text);
  let lastText = -1;
  list.forEach((i, k) => {
    if (i.kind === 'text' && i.text) lastText = k;
  });
  let out = '';
  list.forEach((i, k) => {
    if (i.kind === 'break') {
      out += '<br>';
      return;
    }
    if (!i.text) return;
    let text = i.text;
    if (k === firstText) text = text.replace(/^ +/, (m) => '\u00A0'.repeat(m.length));
    if (k === lastText) text = text.replace(/ +$/, (m) => '\u00A0'.repeat(m.length));
    const edgeSpace = /^\s|\s$/.test(text);
    const md = mode === 'md' && !edgeSpace;
    let core = md ? escMd(text) : escHtml(text);
    if (i.strike) core = md ? `~~${core}~~` : `<s>${core}</s>`;
    if (i.italic) core = md ? `*${core}*` : `<em>${core}</em>`;
    if (i.bold) core = md ? `**${core}**` : `<strong>${core}</strong>`;
    if (i.underline) core = `<u>${core}</u>`;
    const css = runStyleCss(i);
    if (css) core = `<span style="${css}">${core}</span>`;
    out += core;
  });
  return out;
}

function paraNeedsHtml(p: Paragraph): boolean {
  const d = defaultParaStyle(p.role);
  const s = p.style;
  return (
    Math.abs(s.indentLeftMm - d.indentLeftMm) > 0.05 ||
    Math.abs(s.firstLineMm - d.firstLineMm) > 0.05 ||
    Math.abs(s.spaceBeforePt - d.spaceBeforePt) > 0.05 ||
    Math.abs(s.spaceAfterPt - d.spaceAfterPt) > 0.05 ||
    Math.abs(s.lineSpacingPct - d.lineSpacingPct) > 0.5 ||
    !p.inlines.some((i) => i.kind === 'text' && i.text.trim())
  );
}

function paraStyleCss(p: Paragraph): string {
  const d = defaultParaStyle(p.role);
  const s = p.style;
  const css: string[] = [];
  if (s.align !== 'justify') css.push(`text-align:${s.align}`);
  if (Math.abs(s.indentLeftMm - d.indentLeftMm) > 0.05) css.push(`margin-left:${+s.indentLeftMm.toFixed(2)}mm`);
  if (Math.abs(s.firstLineMm - d.firstLineMm) > 0.05) css.push(`text-indent:${+s.firstLineMm.toFixed(2)}mm`);
  if (Math.abs(s.spaceBeforePt - d.spaceBeforePt) > 0.05) css.push(`margin-top:${+s.spaceBeforePt.toFixed(1)}pt`);
  if (Math.abs(s.spaceAfterPt - d.spaceAfterPt) > 0.05) css.push(`margin-bottom:${+s.spaceAfterPt.toFixed(1)}pt`);
  if (Math.abs(s.lineSpacingPct - d.lineSpacingPct) > 0.5) css.push(`line-height:${Math.round(s.lineSpacingPct)}%`);
  return css.join('; ');
}

function paraToHtml(p: Paragraph, tag = p.role === 'body' ? 'p' : `h${p.role.slice(1)}`): string {
  const css = paraStyleCss(p);
  return `<${tag}${css ? ` style="${css}"` : ''}>${inlines(p, 'html')}</${tag}>`;
}

/** 개조식 규칙(markdownToHtml)으로 만든 모양과 정확히 같은 문단인지 — 그렇다면 "○ 내용" 한 줄로 되돌릴 수 있다 */
function isGaejo(p: Paragraph): boolean {
  if (p.role !== 'body' || p.style.align !== 'left') return false;
  const first = p.inlines.find((i) => i.kind === 'text' && i.text) as TextRun | undefined;
  const level = first && !/^\s/.test(first.text) ? gaejoLevel(first.text) : null;
  if (level === null) return false;
  const d = defaultParaStyle('body');
  const s = p.style;
  return (
    Math.abs(s.indentLeftMm - (level * GAEJO_STEP_MM + GAEJO_HANG_MM)) < 0.05 &&
    Math.abs(s.firstLineMm + GAEJO_HANG_MM) < 0.05 &&
    Math.abs(s.spaceBeforePt - d.spaceBeforePt) < 0.05 &&
    Math.abs(s.spaceAfterPt - d.spaceAfterPt) < 0.05 &&
    Math.abs(s.lineSpacingPct - d.lineSpacingPct) < 0.5
  );
}

function paraToMd(p: Paragraph): string {
  if (isGaejo(p)) return inlines(p, 'md');
  if (paraNeedsHtml(p) || (p.role !== 'body' && p.style.align !== 'justify')) return paraToHtml(p);
  let body = inlines(p, 'md');
  if (p.role !== 'body') return `${'#'.repeat(Number(p.role.slice(1)))} ${body}`;
  // 문단 맨 앞이 목록/제목 문법처럼 보이면 무력화
  body = body.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4').replace(/^(\s*)([-+#])(\s)/, '$1\\$2$3');
  if (p.style.align === 'center' || p.style.align === 'right' || p.style.align === 'left') {
    return `<p align="${p.style.align}">${inlines(p, 'html')}</p>`;
  }
  return body;
}

function tableToMd(t: Table, contentMm: number): string {
  const { placed } = placeCells(t);
  const total = contentMm || 1;
  const rows = placed.map((row) => {
    const cells = row
      .map((pc) => {
        const attrs: string[] = [];
        if (pc.colspan > 1) attrs.push(`colspan="${pc.colspan}"`);
        if (pc.rowspan > 1) attrs.push(`rowspan="${pc.rowspan}"`);
        // 열 너비: 본문 폭 대비 % (가로 병합 칸만 있는 줄도 있으므로 한 칸짜리 셀마다 적는다)
        if (pc.colspan === 1) attrs.push(`width="${Math.round((t.colWidthsMm[pc.col] / total) * 10000) / 100}%"`);
        if (pc.cell.bg) attrs.push(`style="background:${pc.cell.bg}"`);
        const content = pc.cell.blocks.map((b) => paraToHtml(b)).join('');
        return `<td${attrs.length ? ' ' + attrs.join(' ') : ''}>${content}</td>`;
      })
      .join('');
    return `  <tr>${cells}</tr>`;
  });
  return `<table>\n${rows.join('\n')}\n</table>`;
}

export function docToMarkdown(doc: Doc): string {
  const lines: string[] = [];
  const meta: string[] = [];
  if (doc.title) meta.push(`제목: ${doc.title}`);
  const p = doc.page;
  const d = DEFAULT_PAGE;
  if (p.widthMm > p.heightMm) meta.push('용지: A4 가로');
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  if (
    !near(p.marginTopMm, d.marginTopMm) || !near(p.marginBottomMm, d.marginBottomMm) || !near(p.marginLeftMm, d.marginLeftMm) ||
    !near(p.marginRightMm, d.marginRightMm) || !near(p.headerMm, d.headerMm) || !near(p.footerMm, d.footerMm)
  ) {
    const f = (n: number) => +n.toFixed(1);
    meta.push(`여백: ${f(p.marginTopMm + p.headerMm)} ${f(p.marginRightMm)} ${f(p.marginBottomMm + p.footerMm)} ${f(p.marginLeftMm)}`);
  }
  if (meta.length) lines.push('---', ...meta, '---', '');
  for (const b of doc.blocks) {
    lines.push(b.type === 'paragraph' ? paraToMd(b) : tableToMd(b, contentWidthMm(doc.page)));
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[\n ]+$/, '') + '\n';
}
