/**
 * 문서 정리 — 파일에서 읽어 온 Doc 을 "편집기에서 만든 Doc" 과 같은 모양으로 맞춘다.
 *  - 기본값과 같은 서식 속성은 지운다 (맑은 고딕, 검정, 역할 기본 크기 …)
 *  - 같은 서식의 이웃 글자 조각을 합친다
 *  - 저장 때 붙인 제목 서식(굵게+크기+간격+다음 문단과 함께)을 보고 제목 1~3 을 되살린다
 * 이 정리 덕분에 "저장 → 열기 → 저장" 을 반복해도 문서가 바뀌지 않는다 (verify/roundtrip.ts 가 검사).
 */
import type { Block, Doc, Inline, Paragraph, ParaRole, TableCell, TextRun } from './types';
import { DEFAULT_COLOR, DEFAULT_FONT, ROLE_RUN } from './defaults';
import { resolveRun } from './resolve';

const round = (v: number, step: number) => Math.round(v / step) * step;
const close = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

export function cleanRun(p: Paragraph, r: TextRun): TextRun {
  const role = ROLE_RUN[p.role];
  const out: TextRun = { kind: 'text', text: r.text };
  if (r.bold && !role.bold) out.bold = true;
  if (r.italic) out.italic = true;
  if (r.underline) out.underline = true;
  if (r.strike) out.strike = true;
  if (r.sizePt && !close(r.sizePt, role.sizePt, 0.01)) out.sizePt = round(r.sizePt, 0.5);
  if (r.color && r.color.toUpperCase() !== DEFAULT_COLOR) out.color = r.color.toUpperCase();
  if (r.font && r.font !== DEFAULT_FONT) out.font = r.font;
  return out;
}

const styleKey = (r: TextRun) => JSON.stringify([r.bold, r.italic, r.underline, r.strike, r.sizePt, r.color, r.font]);

function mergeInlines(list: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const i of list) {
    if (i.kind === 'text' && !i.text) continue;
    const prev = out[out.length - 1];
    if (i.kind === 'text' && prev?.kind === 'text' && styleKey(prev) === styleKey(i)) prev.text += i.text;
    else out.push(i.kind === 'text' ? { ...i } : i);
  }
  return out;
}

/**
 * 저장기가 제목에 쓰는 표시(다음 문단과 함께 + 모든 글자 굵게 + 제목 크기)가 있으면 제목으로 되돌린다.
 * 문단 간격은 판별에 쓰지 않는다 — Word 의 "제목 1" 처럼 간격이 다른 제목도 있고, 간격은 style 에 그대로 보존된다.
 */
function inferRole(p: Paragraph, keepNext: boolean): ParaRole {
  if (p.role !== 'body' || !keepNext) return p.role;
  const texts = p.inlines.filter((i): i is TextRun => i.kind === 'text' && i.text.trim() !== '');
  if (!texts.length) return 'body';
  for (const role of ['h1', 'h2', 'h3'] as const) {
    const rr = ROLE_RUN[role];
    if (texts.every((t) => t.bold === rr.bold && close(resolveRun(p, t).sizePt, rr.sizePt, 0.01))) return role;
  }
  return 'body';
}

/**
 * @param explicitRole 파일에 제목 스타일(Word "Heading 1", 한글 "제목 1")이 명시된 경우
 * 제목 역할은 글자를 굵게 만들므로, 글자가 굵지 않은 제목(최신 Word 의 "제목 1" 등)은 모양을 지키려고 본문으로 둔다.
 */
export function cleanParagraph(p: Paragraph, keepNext = false, explicitRole?: ParaRole): Paragraph {
  let role = explicitRole ?? inferRole(p, keepNext);
  if (role !== 'body') {
    const texts = p.inlines.filter((i): i is TextRun => i.kind === 'text' && i.text.trim() !== '');
    if (texts.some((t) => !t.bold)) role = 'body';
  }
  const para: Paragraph = { ...p, role, style: { ...p.style } };
  para.inlines = mergeInlines(p.inlines.map((i) => (i.kind === 'text' ? cleanRun(para, i) : i)));
  // 문단 끝의 줄바꿈 한 개는 빈 줄을 만들지 않으므로 그대로 둔다. 수치는 반올림
  const s = para.style;
  s.indentLeftMm = round(s.indentLeftMm, 0.01) || 0;
  s.firstLineMm = round(s.firstLineMm, 0.01) || 0;
  s.spaceBeforePt = round(s.spaceBeforePt, 0.1) || 0;
  s.spaceAfterPt = round(s.spaceAfterPt, 0.1) || 0;
  s.lineSpacingPct = Math.round(s.lineSpacingPct) || 160;
  return para;
}

/** 비교용 정규화 (테스트에서 사용) — 단위 변환 반올림 오차를 흡수 */
export function canonical(doc: Doc): string {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const para = (p: Paragraph) => ({
    role: p.role,
    style: { ...p.style, indentLeftMm: r1(p.style.indentLeftMm), firstLineMm: r1(p.style.firstLineMm) },
    // 줄바꿈 없는 공백(U+00A0)은 화면에서 일반 공백과 같다
    inlines: mergeInlines(p.inlines.map((i) => (i.kind === 'text' ? cleanRun(p, { ...i, text: i.text.replace(/\u00A0/g, ' ') }) : i))),
  });
  const cell = (c: TableCell) => ({ colspan: c.colspan, rowspan: c.rowspan, blocks: c.blocks.map(para) });
  const block = (b: Block) =>
    b.type === 'paragraph' ? para(b) : { table: true, colWidthsMm: b.colWidthsMm.map(r1), rows: b.rows.map((r) => r.map(cell)) };
  const page = Object.fromEntries(Object.entries(doc.page).map(([k, v]) => [k, r1(v)]));
  return JSON.stringify({ page, blocks: doc.blocks.map(block) }, null, 1);
}
