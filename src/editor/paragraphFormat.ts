/**
 * 문단 모양 속성 — 한글/Word 파일에서 읽어 온 들여쓰기·문단 간격·줄 간격을 편집기에서도 유지한다.
 * (편집기에 이 정보가 없으면 열었다 다시 저장할 때 문단 모양이 사라짐)
 * 값의 단위는 공통 모델과 같다: 들여쓰기 mm, 간격 pt, 줄 간격 %.
 */
import { Extension } from '@tiptap/core';

const numAttr = (dataName: string, css: (v: number) => string) => ({
  default: null as number | null,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${dataName}`);
    return v === null || v === '' ? null : Number(v);
  },
  renderHTML: (attrs: Record<string, any>) => {
    const key = dataName.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    const v = attrs[key];
    return v === null || v === undefined ? {} : { [`data-${dataName}`]: v, style: css(v) };
  },
});

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indentLeft: numAttr('indent-left', (v) => `margin-left: ${v}mm`),
          firstLine: numAttr('first-line', (v) => `text-indent: ${v}mm`),
          spaceBefore: numAttr('space-before', (v) => `margin-top: ${v}pt`),
          spaceAfter: numAttr('space-after', (v) => `margin-bottom: ${v}pt`),
          lineHeight: numAttr('line-height', (v) => `line-height: ${v / 100}`),
        },
      },
    ];
  },
});
