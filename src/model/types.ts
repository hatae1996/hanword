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
  /** 글꼴 이름. defaults.ts 의 ALL_FONTS 권장 */
  font?: string;
  /** 자간 (%) — 한글 "자간" (-5 = 5% 좁게) ↔ Word 문자 간격(pt) */
  spacingPct?: number;
}

export interface TextRun extends RunStyle {
  kind: 'text';
  text: string;
  /** 이 글자에 달린 메모 id (Doc.memos) — 한글 메모(MEMO 필드) ↔ Word 메모(comment) */
  memo?: string;
}
/** 메모 — 한글 hp:memogroup + MEMO 필드 ↔ Word comments.xml */
export interface Memo {
  id: string;
  text: string;
  author?: string;
  /** ISO 8601 */
  date?: string;
}

/** 문단 안 줄바꿈 (Shift+Enter) */
export interface BreakRun {
  kind: 'break';
}

/** 그림 (글자처럼 취급) — 한글 hp:pic(treatAsChar) + BinData ↔ Word wp:inline + media */
export interface ImageRun {
  kind: 'image';
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/bmp';
  /** 원본 바이트 (base64) */
  data: string;
  widthMm: number;
  heightMm: number;
}

export type Inline = TextRun | BreakRun | ImageRun;

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
  /** 쪽 나누기: 이 문단은 새 쪽에서 시작 — 한글 hp:p pageBreak="1" ↔ Word w:pageBreakBefore */
  pageBreak?: boolean;
}

/** 칸 테두리 선 — 한글 SOLID / DOUBLE_SLIM / NONE ↔ Word single / double / nil */
export type LineStyle = 'none' | 'solid' | 'double';
export interface BorderLine {
  style: LineStyle;
  /** 굵기 (mm) — 한글이 허용하는 값(0.12, 0.4 …)으로 맞춰진다 */
  widthMm: number;
  /** #RRGGBB */
  color: string;
}
/** 없는 쪽은 기본 선(실선 0.12mm 검정) */
export interface CellBorders {
  top?: BorderLine;
  bottom?: BorderLine;
  left?: BorderLine;
  right?: BorderLine;
}

export interface TableCell {
  colspan: number;
  rowspan: number;
  blocks: Paragraph[];
  /** 칸 배경색 #RRGGBB (없으면 색 없음) — HWPX borderFill 채우기 / DOCX w:shd */
  bg?: string;
  /** 칸 테두리 (기본 선과 다른 쪽만) — HWPX borderFill 선 / DOCX w:tcBorders */
  borders?: CellBorders;
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

/** 쪽 번호 — 한글 "쪽 번호 매기기"(hp:pageNum) ↔ Word 머리글/바닥글의 PAGE 필드 */
export type PageNumberPos = 'bottom-center' | 'bottom-right' | 'top-center' | 'top-right';
export interface PageNumber {
  pos: PageNumberPos;
  /** 줄표: "- 1 -" */
  dash: boolean;
}

export interface Doc {
  title: string;
  page: PageSetup;
  blocks: Block[];
  /** 머리말 / 꼬리말 (모든 쪽 같음) — 한글 hp:header/footer ↔ Word header/footer */
  header?: Paragraph[];
  footer?: Paragraph[];
  pageNumber?: PageNumber;
  /** 메모 (본문 글자의 memo 가 가리킴) */
  memos?: Memo[];
}
