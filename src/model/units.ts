/**
 * 단위 변환 — 반드시 이 파일의 함수만 사용할 것.
 *
 * 한글(HWPX): HWPUNIT = 1/7200 인치, 글자 크기 = pt × 100
 * Word(DOCX): twip = 1/1440 인치, 글자 크기 = 반 포인트(half-point), 테두리 = 1/8 pt
 */
import type { PageSetup } from './types';

const MM_PER_INCH = 25.4;

export const mmToHwp = (mm: number) => Math.round((mm * 7200) / MM_PER_INCH);
export const ptToHwp = (pt: number) => Math.round(pt * 100);
export const mmToTwip = (mm: number) => Math.round((mm * 1440) / MM_PER_INCH);
export const ptToTwip = (pt: number) => Math.round(pt * 20);
export const ptToHalfPt = (pt: number) => Math.round(pt * 2);
export const mmToEighthPt = (mm: number) => Math.max(2, Math.round(((mm / MM_PER_INCH) * 72) * 8));
export const pxToMm = (px: number) => (px * MM_PER_INCH) / 96;

/** 한글 표 테두리 굵기 문자열 ("0.12 mm") — 한글은 정해진 값만 허용 */
const HWP_BORDER_WIDTHS = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
/** 한글이 허용하는 가장 가까운 테두리 굵기 (mm) */
export function snapBorderMm(mm: number): number {
  return HWP_BORDER_WIDTHS.reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a));
}
export function hwpBorderWidth(mm: number): string {
  const best = snapBorderMm(mm);
  return `${best === 1 ? '1.0' : best === 2 ? '2.0' : best === 3 ? '3.0' : best === 4 ? '4.0' : best === 5 ? '5.0' : best} mm`;
}

/**
 * 쪽 여백 환산.
 * 한글: 위쪽 여백 20mm + 머리말 15mm → 본문은 35mm 지점에서 시작, 머리말은 20mm 지점.
 * Word: w:top = 본문까지 거리, w:header = 머리말까지 거리.
 * 그래서 Word top = 한글 top + header, Word header = 한글 top.
 */
export function pageToWord(p: PageSetup) {
  return {
    width: mmToTwip(p.widthMm),
    height: mmToTwip(p.heightMm),
    top: mmToTwip(p.marginTopMm + p.headerMm),
    bottom: mmToTwip(p.marginBottomMm + p.footerMm),
    left: mmToTwip(p.marginLeftMm),
    right: mmToTwip(p.marginRightMm),
    header: mmToTwip(p.marginTopMm),
    footer: mmToTwip(p.marginBottomMm),
  };
}

/**
 * 줄 간격 환산.
 * 한글 "글자에 따라 160%" = 줄 높이가 (그 줄의 가장 큰 글자 크기 × 1.6).
 * Word "배수"는 글꼴 자체 줄 높이(맑은 고딕은 약 1.33배)에 곱하므로 숫자를 그대로 옮기면 안 된다.
 * → Word 에는 "최소(atLeast)" 규칙으로 (문단 최대 글자 크기 × %) 를 기록한다.
 *   더 큰 글자가 섞이면 Word 가 알아서 줄을 늘리므로 한글 동작과 가장 가깝다.
 * 실제 쪽 수 비교 결과에 따라 LINE_CALIBRATION 으로 미세 보정한다.
 */
export const LINE_CALIBRATION = 1.0;
export function lineSpacingToWordTwip(maxSizePt: number, pct: number): number {
  return Math.round(maxSizePt * (pct / 100) * 20 * LINE_CALIBRATION);
}

/**
 * Word 의 "배수" 줄 간격(auto) → 한글 % 근사 계수.
 * Word 1줄 = 글꼴 자체 줄 높이(맑은 고딕 ≈ 1.33배, Calibri ≈ 1.22배) 이므로 대략 1.3 을 곱한다.
 * 우리 저장기는 "최소" 규칙을 쓰므로 이 값은 Word 가 직접 만든 문서를 열 때만 쓰인다.
 */
export const DOCX_AUTO_LINE_FACTOR = 1.3;
