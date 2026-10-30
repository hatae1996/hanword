/**
 * 검증용 샘플 문서 — 편집기에서 만들어지는 것과 같은 TipTap JSON 형태로 정의한다.
 * 새 기능을 추가하면 여기에 그 기능을 쓰는 샘플을 꼭 추가할 것.
 */
type N = Record<string, any>;
const t = (text: string, ...marks: N[]): N => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (content: N[] = [], textAlign?: string): N => ({ type: 'paragraph', attrs: { textAlign: textAlign ?? null }, content });
const h = (level: number, text: string): N => ({ type: 'heading', attrs: { level, textAlign: null }, content: [t(text)] });
const B = { type: 'bold' }, I = { type: 'italic' }, U = { type: 'underline' }, S = { type: 'strike' };
const style = (attrs: N) => ({ type: 'textStyle', attrs });
const cell = (text: string, attrs: N = {}, marks: N[] = []): N => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
  content: [p(text ? [t(text, ...marks)] : [])],
});
const row = (...cells: N[]): N => ({ type: 'tableRow', content: cells });
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
const img = (name: string, widthMm: number, heightMm: number): N => ({
  type: 'image',
  attrs: { src: `data:image/${name.endsWith('.png') ? 'png' : 'jpeg'};base64,${fixture(name).toString('base64')}`, widthMm, heightMm },
});
const doc = (...content: N[]): N => ({ type: 'doc', content });
import type { Doc } from '../src/model/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SAMPLES: Record<string, N> = {
  '01-서식': doc(
    h(1, '1. 글자 서식 시험'),
    p([t('보통 글자, '), t('굵게', B), t(', '), t('기울임', I), t(', '), t('밑줄', U), t(', '), t('취소선', S), t('.')]),
    p([t('빨간 글자 ', style({ color: '#C00000' })), t('파란 굵은 글자', B, style({ color: '#1F4E79' }))]),
    p([t('8pt ', style({ fontSize: '8pt' })), t('10pt ', style({ fontSize: '10pt' })), t('14pt ', style({ fontSize: '14pt' })), t('20pt', style({ fontSize: '20pt' }))]),
    p([t('바탕체 문장입니다. ', style({ fontFamily: '바탕' })), t('돋움체 문장입니다. ', style({ fontFamily: '돋움' })), t('굴림체 문장입니다.', style({ fontFamily: '굴림' }))]),
    p([t('특수문자 & < > " \' 그리고 English mixed 한글 문장, 숫자 1,234.56')]),
    p([t('첫 줄'), { type: 'hardBreak' }, t('Shift+Enter 로 바꾼 둘째 줄')]),
    p(),
    h(2, '1.1 정렬'),
    p([t('왼쪽 정렬')], 'left'),
    p([t('가운데 정렬')], 'center'),
    p([t('오른쪽 정렬')], 'right'),
    p([t('양쪽 정렬된 긴 문단입니다. '.repeat(8))], 'justify'),
    h(3, '1.1.1 목록'),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p([t('첫 번째 항목')]), { type: 'bulletList', content: [{ type: 'listItem', content: [p([t('하위 항목')])] }] }] },
        { type: 'listItem', content: [p([t('두 번째 항목은 줄이 길어져서 다음 줄로 넘어갈 때 내어쓰기가 제대로 되는지 확인하기 위한 문장입니다.')])] },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        { type: 'listItem', content: [p([t('번호 항목 하나')]), { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p([t('가 항목')])] }, { type: 'listItem', content: [p([t('나 항목')])] }] }] },
        { type: 'listItem', content: [p([t('번호 항목 둘')])] },
      ],
    },
  ),
  '02-표': doc(
    h(1, '2. 표 시험'),
    p([t('기본 3×3 표:')]),
    {
      type: 'table',
      content: [
        row(cell('구분', { backgroundColor: '#DCE6F1' }, [B]), cell('내용', { backgroundColor: '#DCE6F1' }, [B]), cell('비고', { backgroundColor: '#DCE6F1' }, [B])),
        row(cell('가'), cell('첫째 행 내용이 조금 길어서 셀 안에서 줄이 바뀌는 경우'), cell('')),
        row(cell('나'), cell('둘째 행'), cell('비고')),
      ],
    },
    p([t('병합 셀 표 (가로·세로 병합):')]),
    {
      type: 'table',
      content: [
        row(cell('가로 병합 제목', { colspan: 3, backgroundColor: '#1F3864' }, [B, style({ color: '#FFFFFF' })])),
        row(cell('세로 병합', { rowspan: 2 }), cell('A'), cell('B')),
        row(cell('C'), cell('D')),
        row(cell('1', { colwidth: [60] }), cell('2', { colwidth: [200] }), cell('3', { colwidth: [120] })),
      ],
    },
    p([t('표 다음 문단.')]),
  ),
  '03-긴문서': doc(
    h(1, '3. 쪽 나눔 시험'),
    ...Array.from({ length: 60 }, (_, i) => p([t(`${i + 1}번째 문단입니다. 한글과 Word 에서 쪽 수가 같게 나오는지 확인하기 위한 문장이 이어집니다. `.repeat(2))])),
  ),
  // 공공기관 보고서 모양: 위아래 선만 있는 제목, 좌우 바깥선 없는 표, 머리행 아래 겹선, 보고서 글꼴
  '04-공문표': doc(
    {
      type: 'table',
      content: [
        row(
          cell('기록물 이관 결과 보고', {
            borders: {
              top: { style: 'solid', widthMm: 0.7, color: '#1F3864' },
              bottom: { style: 'solid', widthMm: 0.4, color: '#1F3864' },
              left: { style: 'none', widthMm: 0.1, color: '#000000' },
              right: { style: 'none', widthMm: 0.1, color: '#000000' },
            },
          }, [style({ fontFamily: 'HY헤드라인M', fontSize: '20pt' })]),
        ),
      ],
    },
    p([t('본문은 휴먼명조', style({ fontFamily: '휴먼명조', fontSize: '15pt', letterSpacing: '-0.05em' }))]),
    {
      type: 'table',
      content: [
        row(
          cell('구분', { backgroundColor: '#F2F2F2', borders: { top: { style: 'solid', widthMm: 0.4, color: '#000000' }, bottom: { style: 'double', widthMm: 0.5, color: '#000000' }, left: { style: 'none', widthMm: 0.1, color: '#000000' } } }, [B]),
          cell('수량', { backgroundColor: '#F2F2F2', borders: { top: { style: 'solid', widthMm: 0.4, color: '#000000' }, bottom: { style: 'double', widthMm: 0.5, color: '#000000' }, right: { style: 'none', widthMm: 0.1, color: '#000000' } } }, [B]),
        ),
        row(cell('본관', { borders: { left: { style: 'none', widthMm: 0.1, color: '#000000' } } }), cell('120', { borders: { right: { style: 'none', widthMm: 0.1, color: '#000000' } } })),
        row(
          cell('합계', { borders: { left: { style: 'none', widthMm: 0.1, color: '#000000' }, bottom: { style: 'solid', widthMm: 0.4, color: '#000000' } } }),
          cell('120', { borders: { right: { style: 'none', widthMm: 0.1, color: '#000000' }, bottom: { style: 'solid', widthMm: 0.4, color: '#000000' } } }),
        ),
      ],
    },
  ),
  // 쪽 나누기 + 머리말·꼬리말·쪽 번호 (문서 단위 설정은 SAMPLE_EXTRAS)
  '05-쪽': doc(
    p([t('첫 쪽 본문')]),
    { type: 'paragraph', attrs: { textAlign: null, pageBreak: true }, content: [t('둘째 쪽은 이 문단부터')] },
    p([t('둘째 쪽 본문')]),
    { type: 'heading', attrs: { level: 1, textAlign: null, pageBreak: true }, content: [t('셋째 쪽 제목')] },
    p([t('끝')]),
  ),
  // 그림: 문단 안 그림 + 사진대지 모양 표 (칸마다 그림, 아래 줄 설명)
  '06-사진': doc(
    p([t('사진 앞 글 '), img('사진1.png', 60, 45), t(' 사진 뒤 글')]),
    {
      type: 'table',
      content: [
        row(
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p([img('사진1.png', 70, 52.5)], 'center')] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p([img('사진2.jpg', 70, 43.8)], 'center')] },
        ),
        row(cell('사진 1. 이관 전 서고'), cell('사진 2. 이관 후 서가')),
      ],
    },
    p([t('끝')]),
  ),
};

const hf = (text: string, align: 'left' | 'center' | 'right') => [
  { type: 'paragraph' as const, role: 'body' as const, style: { align, indentLeftMm: 0, firstLineMm: 0, spaceBeforePt: 0, spaceAfterPt: 0, lineSpacingPct: 160 }, inlines: [{ kind: 'text' as const, text }] },
];
/** 편집기 문서(JSON) 밖에 있는 문서 단위 설정 */
export const SAMPLE_EXTRAS: Record<string, Partial<Doc>> = {
  '05-쪽': { header: hf('○○기관 기록관', 'right'), footer: hf('대외비 아님', 'left'), pageNumber: { pos: 'bottom-center', dash: true } },
};
