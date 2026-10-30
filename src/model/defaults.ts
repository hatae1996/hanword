import type { PageSetup, ParaRole, ParaStyle } from './types';

/**
 * 양쪽 프로그램에서 "같은 글꼴로 보이는" 것이 보장되는 글꼴만 고른다.
 * - Windows 기본 설치: 맑은 고딕, 바탕, 돋움, 굴림
 * - 함초롬체는 한글(한컴오피스)이 깔린 PC에만 있음 → Word 사용자에게 보내면 대체 글꼴로 바뀐다.
 */
export const SAFE_FONTS = ['맑은 고딕', '바탕', '돋움', '굴림'] as const;
/**
 * 한컴오피스를 설치하면 함께 깔리는 글꼴 — 한글에서는 그대로, 한컴오피스가 없는 PC 의 Word 에서는 다른 글꼴로 보인다.
 * 휴먼명조(본문)·HY헤드라인M(제목)은 공공기관 보고서의 표준 조합.
 */
export const HANCOM_ONLY_FONTS = ['휴먼명조', 'HY헤드라인M', 'HY견고딕', '한컴돋움', '함초롬바탕', '함초롬돋움'] as const;
export const ALL_FONTS: readonly string[] = [...SAFE_FONTS, ...HANCOM_ONLY_FONTS];

export const DEFAULT_FONT = '맑은 고딕';
export const DEFAULT_SIZE_PT = 10;
export const DEFAULT_LINE_PCT = 160;
export const DEFAULT_COLOR = '#000000';

/** 한글 새 문서 기본값과 동일한 A4 쪽 설정 */
export const DEFAULT_PAGE: PageSetup = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 20,
  marginBottomMm: 15,
  marginLeftMm: 30,
  marginRightMm: 30,
  headerMm: 15,
  footerMm: 15,
};

export function contentWidthMm(p: PageSetup): number {
  return p.widthMm - p.marginLeftMm - p.marginRightMm;
}

/** 문단 역할별 기본 글자 모양 — 두 포맷 모두 "직접 서식"으로 기록해 스타일 차이를 없앤다 */
export const ROLE_RUN: Record<ParaRole, { sizePt: number; bold: boolean }> = {
  body: { sizePt: DEFAULT_SIZE_PT, bold: false },
  h1: { sizePt: 16, bold: true },
  h2: { sizePt: 14, bold: true },
  h3: { sizePt: 12, bold: true },
};

export const ROLE_PARA: Record<ParaRole, Pick<ParaStyle, 'spaceBeforePt' | 'spaceAfterPt'>> = {
  body: { spaceBeforePt: 0, spaceAfterPt: 0 },
  h1: { spaceBeforePt: 12, spaceAfterPt: 6 },
  h2: { spaceBeforePt: 10, spaceAfterPt: 4 },
  h3: { spaceBeforePt: 8, spaceAfterPt: 4 },
};

export function defaultParaStyle(role: ParaRole = 'body'): ParaStyle {
  return {
    align: 'justify', // 한글 기본값(양쪽 정렬)
    indentLeftMm: 0,
    firstLineMm: 0,
    lineSpacingPct: DEFAULT_LINE_PCT,
    ...ROLE_PARA[role],
  };
}

/** 표 기본값 (한글 표 기본값과 맞춤) */
export const TABLE_DEFAULTS = {
  borderMm: 0.12,
  cellPadLeftRightMm: 1.8,
  cellPadTopBottomMm: 0.5,
};

/** 목록(글머리표/번호)을 위한 내어쓰기 폭 */
export const LIST_INDENT_MM = 7;

/** 프린터가 못 찍는 종이 끝을 피해 머리말·꼬리말(쪽 번호)을 둘 최소 거리 */
export const HF_EDGE_MM = 10;

/**
 * 머리말·꼬리말·쪽 번호가 종이 끝에 붙어 있으면(위/아래 여백 < 10mm) 10mm 안쪽으로 옮긴다.
 * 머리말/꼬리말 높이에서 덜어 내므로 본문 자리(위 여백 + 머리말, 아래 여백 + 꼬리말)는 그대로다.
 * 바꿀 게 없으면 null.
 */
export function keepHfOffEdge(p: PageSetup, use: { top: boolean; bottom: boolean }): PageSetup | null {
  const MIN_HF = 5; // 10pt 한 줄이 들어갈 높이
  let out: PageSetup | null = null;
  const move = (edge: 'marginTopMm' | 'marginBottomMm', hf: 'headerMm' | 'footerMm') => {
    const page = out ?? p;
    const need = HF_EDGE_MM - page[edge];
    const take = Math.min(need, Math.max(0, page[hf] - MIN_HF));
    if (need <= 0 || take <= 0) return;
    out = { ...page, [edge]: Math.round((page[edge] + take) * 100) / 100, [hf]: Math.round((page[hf] - take) * 100) / 100 };
  };
  if (use.top) move('marginTopMm', 'headerMm');
  if (use.bottom) move('marginBottomMm', 'footerMm');
  return out;
}
