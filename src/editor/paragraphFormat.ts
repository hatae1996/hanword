/**
 * 문단 모양 속성 — 한글/Word 파일에서 읽어 온 들여쓰기·문단 간격·줄 간격을 편집기에서도 유지한다.
 * (편집기에 이 정보가 없으면 열었다 다시 저장할 때 문단 모양이 사라짐)
 * 값의 단위는 공통 모델과 같다: 들여쓰기 mm, 간격 pt, 줄 간격 %.
 *
 * 읽을 때는 우리 data-* 속성을 먼저 보고, 없으면 일반 CSS(margin-left 등)도 읽는다.
 * → AI 가 쓴 HTML, 웹/Word 에서 붙여넣은 글의 들여쓰기도 살아난다.
 */
import { Extension } from '@tiptap/core';

/** CSS 길이 → mm */
export function cssToMm(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = String(v).trim().match(/^(-?[\d.]+)\s*(mm|cm|pt|px|em|in)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'mm': return n;
    case 'cm': return n * 10;
    case 'in': return n * 25.4;
    case 'pt': return (n * 25.4) / 72;
    case 'em': return (n * 10 * 25.4) / 72; // 본문 10pt 기준
    default: return (n * 25.4) / 96; // px
  }
}
const mmToPt = (mm: number) => (mm * 72) / 25.4;
const round = (v: number, step: number) => Math.round(v / step) * step;

type Parse = (el: HTMLElement) => number | null;

const numAttr = (dataName: string, css: (v: number) => string, fromStyle: Parse) => ({
  default: null as number | null,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${dataName}`);
    if (v !== null && v !== '') return Number(v);
    const s = fromStyle(el);
    return s === null || !isFinite(s) || s === 0 ? null : s;
  },
  renderHTML: (attrs: Record<string, any>) => {
    const key = dataName.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    const v = attrs[key];
    return v === null || v === undefined ? {} : { [`data-${dataName}`]: v, style: css(v) };
  },
});

const styleMm = (prop: string): Parse => (el) => {
  const mm = cssToMm(el.style?.getPropertyValue(prop));
  return mm === null ? null : round(mm, 0.01);
};
const stylePt = (prop: string): Parse => (el) => {
  const mm = cssToMm(el.style?.getPropertyValue(prop));
  return mm === null ? null : round(mmToPt(mm), 0.1);
};
/** line-height: 1.6 → 160%, 160% → 160 */
const lineHeightPct: Parse = (el) => {
  const v = el.style?.getPropertyValue('line-height')?.trim();
  if (!v) return null;
  if (v.endsWith('%')) return Math.round(parseFloat(v));
  const n = parseFloat(v);
  return /^[\d.]+$/.test(v) && n > 0 && n < 5 ? Math.round(n * 100) : null;
};

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indentLeft: numAttr('indent-left', (v) => `margin-left: ${v}mm`, styleMm('margin-left')),
          firstLine: numAttr('first-line', (v) => `text-indent: ${v}mm`, styleMm('text-indent')),
          spaceBefore: numAttr('space-before', (v) => `margin-top: ${v}pt`, stylePt('margin-top')),
          spaceAfter: numAttr('space-after', (v) => `margin-bottom: ${v}pt`, stylePt('margin-bottom')),
          lineHeight: numAttr('line-height', (v) => `line-height: ${v / 100}`, lineHeightPct),
        },
      },
    ];
  },
});
