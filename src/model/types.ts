/**
 * 공통 문서 모델 — 모든 변환의 중심.
 *
 * 편집기(TipTap) → Doc → DOCX / HWPX 로 흐른다. 포맷끼리 직접 변환하지 않는다.
 * 여기에는 "한글과 Word 양쪽에서 1:1로 표현되는 기능"만 넣는다.
 * 새 기능을 추가할 때는 HWPX 태그와 DOCX 태그의 짝이 확정된 경우에만 필드를 늘릴 것.
 */

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** 글자 크기 (pt). 없으면 문단 역할의 기본값 */
  sizePt?: number;
  /** #RRGGBB */
  color?: string;
  /** 글꼴 이름. fonts.ts 의 SAFE_FONTS 중 하나 */
  font?: string;
}

export interface TextRun extends RunStyle {
  kind: 'text';
  text: string;
}

/** 문단 안 줄바꿈 (Shift+Enter) */
export interface BreakRun {
  kind: 'break';
}

export type Inline = TextRun | BreakRun;

export interface ParaStyle {
  align: Align;
  /** 왼쪽 여백 (mm) */
  indentLeftMm: number;
  /** 첫 줄 들여쓰기(+) / 내어쓰기(-) (mm) */
  firstLineMm: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  /** 줄 간격 — 한글 방식의 "글자 크기 대비 %" (기본 160) */
  lineSpacingPct: number;
}

export type ParaRole = 'body' | 'h1' | 'h2' | 'h3';

export interface Paragraph {
  type: 'paragraph';
  role: ParaRole;
  style: ParaStyle;
  inlines: Inline[];
}

export interface TableCell {
  colspan: number;
  rowspan: number;
  blocks: Paragraph[];
}

/**
 * rows 에는 HTML 표처럼 "실제로 존재하는 셀"만 들어간다 (병합으로 가려진 칸은 없음).
 * colWidthsMm 은 격자 열 너비이며 합계는 본문 폭과 같도록 정규화된다.
 */
export interface Table {
  type: 'table';
  colWidthsMm: number[];
  rows: TableCell[][];
}

export type Block = Paragraph | Table;

/**
 * 쪽 설정 — 값의 의미는 "한글" 기준이다.
 * 한글: 본문 시작 = 위쪽 여백 + 머리말 높이.  Word 로 내보낼 때 units.ts 의 pageToWord 가 환산한다.
 */
export interface PageSetup {
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  headerMm: number;
  footerMm: number;
}

export interface Doc {
  title: string;
  page: PageSetup;
  blocks: Block[];
}
