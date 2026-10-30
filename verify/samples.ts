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
const doc = (...content: N[]): N => ({ type: 'doc', content });

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
};
