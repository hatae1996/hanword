/**
 * 인쇄 — 종이 내용만, 문서의 용지·여백·머리말·꼬리말·쪽 번호 그대로.
 *
 *  - 메뉴·리본·상태 막대는 인쇄 화면(@media print, style.css)에서 숨긴다
 *  - 용지 크기·여백은 @page 로, 쪽마다 바뀌는 쪽 번호는 @page 의 여백 상자(@bottom-center 등)로 찍는다
 *    (편집 화면은 쪽을 나누지 않는 긴 종이라서, 실제 쪽 나눔은 인쇄할 때 브라우저 엔진이 한다)
 *  - 데스크톱 앱은 Windows 기본 인쇄 대화상자(설치된 프린터 모두)를 연다 — platform.printDoc
 */
import type { PageNumber, PageSetup, Paragraph } from '../model/types';

type Slot = 'left' | 'center' | 'right';
const cssString = (t: string) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\A ')}"`;
const plain = (ps: Paragraph[] | undefined) =>
  (ps ?? []).map((p) => p.inlines.map((i) => (i.kind === 'text' ? i.text : ' ')).join('')).join('\n').trim();
const slotOf = (ps: Paragraph[] | undefined): Slot => {
  const al = ps?.[0]?.style.align;
  return al === 'center' ? 'center' : al === 'right' ? 'right' : 'left';
};
const f = (n: number) => String(Math.round(n * 100) / 100);

export interface PrintSetup {
  page: PageSetup;
  header?: Paragraph[];
  footer?: Paragraph[];
  pageNumber?: PageNumber;
  /** 머리말·꼬리말 글꼴 (CSS font-family) */
  font: string;
}

/** 문서 설정 → 인쇄용 @page 규칙 */
export function printPageCss({ page: p, header, footer, pageNumber, font }: PrintSetup): string {
  // 한글 방식: 본문 시작 = 위 여백 + 머리말 높이. 머리말 글자는 종이 끝에서 "위 여백" 만큼 떨어진 곳
  const top = p.marginTopMm + p.headerMm;
  const bottom = p.marginBottomMm + p.footerMm;
  const boxes = new Map<string, string[]>(); // '@top-left' → content 조각들
  const add = (where: 'top' | 'bottom', slot: Slot, piece: string) => {
    const key = `@${where}-${slot}`;
    boxes.set(key, [...(boxes.get(key) ?? []), piece]);
  };
  const h = plain(header);
  if (h) add('top', slotOf(header), cssString(h));
  const ft = plain(footer);
  if (ft) add('bottom', slotOf(footer), cssString(ft));
  if (pageNumber) {
    const where = pageNumber.pos.startsWith('top') ? 'top' : 'bottom';
    const slot: Slot = pageNumber.pos.endsWith('right') ? 'right' : 'center';
    add(where, slot, pageNumber.dash ? '"- " counter(page) " -"' : 'counter(page)');
  }
  const rules = [...boxes].map(([key, pieces]) => {
    const isTop = key.startsWith('@top');
    const pad = isTop ? `vertical-align: top; padding-top: ${f(p.marginTopMm)}mm;` : `vertical-align: bottom; padding-bottom: ${f(p.marginBottomMm)}mm;`;
    const align = key.endsWith('left') ? 'left' : key.endsWith('right') ? 'right' : 'center';
    return `  ${key} { content: ${pieces.join(' "  " ')}; ${pad} text-align: ${align}; font-family: ${font}; font-size: 10pt; color: #000; white-space: pre; }`;
  });
  return `@page {\n  size: ${f(p.widthMm)}mm ${f(p.heightMm)}mm;\n  margin: ${f(top)}mm ${f(p.marginRightMm)}mm ${f(bottom)}mm ${f(p.marginLeftMm)}mm;\n${rules.join('\n')}\n}`;
}

/** 인쇄용 @page 를 문서에 반영 (쪽 설정이 바뀔 때마다 부른다) */
export function applyPrintPage(setup: Omit<PrintSetup, 'font'>) {
  let el = document.getElementById('print-page') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'print-page';
    document.head.append(el);
  }
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-doc').trim() || 'serif';
  el.textContent = printPageCss({ ...setup, font });
}
