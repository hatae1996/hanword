/**
 * 문서 테마 — 내용은 그대로, 문서 전체의 디자인(글꼴·크기·색·간격·표 모양)을 한 번에 바꾼다.
 * 테마가 쓰는 것은 모두 한글·Word 양쪽에서 1:1 로 표현되는 서식뿐이다 (글자 모양, 문단 간격, 칸 배경·테두리).
 */
import type { Align } from '../model/types';

export interface TextLook {
  font?: string;
  sizePt?: number;
  /** undefined = 원래 굵기 유지 */
  bold?: boolean;
  /** '$accent' = 강조색, '$accentDark' 등 */
  color?: string;
  spacingPct?: number;
}
export interface ParaLook {
  text: TextLook;
  align?: Align;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineSpacingPct?: number;
}
/** 표 선 모양 */
export type TableLines =
  | 'grid' // 모든 선 가늘게
  | 'official' // 공문: 위·아래 굵게, 좌우 바깥 없음, 머리행 아래 겹선
  | 'horizontal' // 위·아래 굵게, 머리행 아래 가는 선, 세로선 없음 (학술지 표)
  | 'minimal'; // 가로 가는 선만, 머리행 아래 강조색

export interface Theme {
  id: string;
  name: string;
  hint: string;
  /** 한컴오피스 글꼴을 쓴다 (Word 만 있는 PC 에서는 비슷한 글꼴로 바뀜) */
  hancomFonts?: boolean;
  base: { font: string; sizePt: number; lineSpacingPct: number; spacingPct: number; color: string };
  roles: Record<'title' | 'subtitle' | 'chapter' | 'section' | 'item0' | 'item1' | 'item2' | 'item3' | 'note' | 'unit' | 'caption' | 'body', ParaLook>;
  titleBox: { top: number; bottom: number; lineColor: string; bg?: string };
  table: {
    lines: TableLines;
    lineColor: string;
    outerMm: number;
    head: { bg?: string; text: TextLook };
    body: { text: TextLook };
    total: { bg?: string; bold?: boolean };
    zebra?: string;
  };
  box: { bg: string; lineColor: string };
  headerFooter: TextLook;
}

export interface Accent {
  id: string;
  name: string;
  color: string;
  soft: string;
}
export const ACCENTS: Accent[] = [
  { id: 'navy', name: '남색', color: '#1F3864', soft: '#DCE3EE' },
  { id: 'blue', name: '파랑', color: '#2E75B6', soft: '#DEEBF7' },
  { id: 'green', name: '초록', color: '#375623', soft: '#E2EFDA' },
  { id: 'wine', name: '자주', color: '#7B2C3B', soft: '#F2DCDB' },
  { id: 'charcoal', name: '먹색', color: '#3A3A3A', soft: '#E7E6E6' },
];

const p = (text: TextLook, more: Omit<ParaLook, 'text'> = {}): ParaLook => ({ text, ...more });

export const THEMES: Theme[] = [
  {
    id: 'gongmun',
    name: '공문',
    hint: '공공기관 보고서: 휴먼명조 15pt · HY헤드라인M 제목 · 위아래 굵은 선 표',
    hancomFonts: true,
    base: { font: '휴먼명조', sizePt: 15, lineSpacingPct: 160, spacingPct: -5, color: '#000000' },
    roles: {
      title: p({ font: 'HY헤드라인M', sizePt: 22, bold: false, color: '#000000', spacingPct: -5 }, { align: 'center', spaceBeforePt: 3, spaceAfterPt: 3, lineSpacingPct: 130 }),
      subtitle: p({ sizePt: 12, color: '#000000' }, { align: 'right', spaceBeforePt: 2, spaceAfterPt: 6 }),
      chapter: p({ font: 'HY헤드라인M', sizePt: 16, color: '#000000' }, { spaceBeforePt: 10, spaceAfterPt: 2 }),
      section: p({ sizePt: 15, bold: true }, { spaceBeforePt: 6 }),
      item0: p({ sizePt: 15 }, { spaceBeforePt: 2 }),
      item1: p({ sizePt: 15 }),
      item2: p({ sizePt: 13 }),
      item3: p({ sizePt: 13 }),
      note: p({ sizePt: 12 }),
      unit: p({ sizePt: 11 }, { align: 'right', spaceBeforePt: 2 }),
      caption: p({ sizePt: 12 }, { align: 'center' }),
      body: p({ sizePt: 15 }),
    },
    titleBox: { top: 0.7, bottom: 0.4, lineColor: '$accent' },
    table: { lines: 'official', lineColor: '#000000', outerMm: 0.4, head: { bg: '#EDEDED', text: { sizePt: 12, bold: false } }, body: { text: { sizePt: 12 } }, total: { bg: '#F5F5F5', bold: true } },
    box: { bg: '$soft', lineColor: '$accent' },
    headerFooter: { sizePt: 10, color: '#000000' },
  },
  {
    id: 'modern',
    name: '모던',
    hint: '맑은 고딕 · 강조색 제목과 표 머리행 · 얼룩무늬 표 (Word 와 같은 글꼴)',
    base: { font: '맑은 고딕', sizePt: 11, lineSpacingPct: 160, spacingPct: 0, color: '#000000' },
    roles: {
      title: p({ sizePt: 22, bold: true, color: '$accent', spacingPct: -3 }, { align: 'left', spaceBeforePt: 2, spaceAfterPt: 4, lineSpacingPct: 130 }),
      subtitle: p({ sizePt: 10, color: '#595959' }, { align: 'right', spaceBeforePt: 2, spaceAfterPt: 8 }),
      chapter: p({ sizePt: 15, bold: true, color: '$accent' }, { spaceBeforePt: 16, spaceAfterPt: 4 }),
      section: p({ sizePt: 12, bold: true, color: '#262626' }, { spaceBeforePt: 10, spaceAfterPt: 2 }),
      item0: p({ sizePt: 11 }, { spaceBeforePt: 5 }),
      item1: p({ sizePt: 11 }, { spaceBeforePt: 2 }),
      item2: p({ sizePt: 10.5, color: '#404040' }),
      item3: p({ sizePt: 10.5, color: '#404040' }),
      note: p({ sizePt: 9.5, color: '#595959' }),
      unit: p({ sizePt: 9, color: '#595959' }, { align: 'right', spaceBeforePt: 4 }),
      caption: p({ sizePt: 9.5, color: '#595959' }, { align: 'center' }),
      body: p({ sizePt: 11 }),
    },
    titleBox: { top: 0, bottom: 0.7, lineColor: '$accent' },
    table: { lines: 'grid', lineColor: '#BFBFBF', outerMm: 0.12, head: { bg: '$accent', text: { sizePt: 10, bold: true, color: '#FFFFFF' } }, body: { text: { sizePt: 10 } }, total: { bg: '$soft', bold: true }, zebra: '#F6F8FB' },
    box: { bg: '$soft', lineColor: '$soft' },
    headerFooter: { sizePt: 9, color: '#7F7F7F' },
  },
  {
    id: 'classic',
    name: '클래식',
    hint: '바탕 본문 · 돋움 제목 · 가로선만 있는 표 (논문·백서 느낌)',
    base: { font: '바탕', sizePt: 11, lineSpacingPct: 170, spacingPct: 0, color: '#000000' },
    roles: {
      title: p({ font: '바탕', sizePt: 20, bold: true, color: '#000000' }, { align: 'center', spaceBeforePt: 4, spaceAfterPt: 4, lineSpacingPct: 140 }),
      subtitle: p({ font: '돋움', sizePt: 9.5, color: '#404040' }, { align: 'center', spaceBeforePt: 2, spaceAfterPt: 10 }),
      chapter: p({ font: '돋움', sizePt: 14, bold: true, color: '$accent' }, { spaceBeforePt: 16, spaceAfterPt: 4 }),
      section: p({ font: '돋움', sizePt: 11.5, bold: true, color: '#000000' }, { spaceBeforePt: 10, spaceAfterPt: 2 }),
      item0: p({ sizePt: 11 }, { spaceBeforePt: 4 }),
      item1: p({ sizePt: 11 }, { spaceBeforePt: 1 }),
      item2: p({ sizePt: 10.5 }),
      item3: p({ sizePt: 10.5 }),
      note: p({ font: '돋움', sizePt: 9, color: '#404040' }),
      unit: p({ font: '돋움', sizePt: 9, color: '#404040' }, { align: 'right', spaceBeforePt: 4 }),
      caption: p({ font: '돋움', sizePt: 9.5, color: '#404040' }, { align: 'center' }),
      body: p({ sizePt: 11 }),
    },
    titleBox: { top: 1, bottom: 0.4, lineColor: '#000000' },
    table: { lines: 'horizontal', lineColor: '#000000', outerMm: 0.5, head: { text: { font: '돋움', sizePt: 9.5, bold: true } }, body: { text: { sizePt: 10 } }, total: { bold: true } },
    box: { bg: '#F2F2F2', lineColor: '#F2F2F2' },
    headerFooter: { font: '돋움', sizePt: 9, color: '#595959' },
  },
  {
    id: 'minimal',
    name: '미니멀',
    hint: '여백 넉넉한 맑은 고딕 · 회색 위계 · 선을 줄인 표',
    base: { font: '맑은 고딕', sizePt: 10.5, lineSpacingPct: 175, spacingPct: 0, color: '#222222' },
    roles: {
      title: p({ sizePt: 20, bold: true, color: '#111111', spacingPct: -3 }, { align: 'left', spaceBeforePt: 0, spaceAfterPt: 2, lineSpacingPct: 130 }),
      subtitle: p({ sizePt: 9.5, color: '#7F7F7F' }, { align: 'left', spaceBeforePt: 0, spaceAfterPt: 12 }),
      chapter: p({ sizePt: 13, bold: true, color: '$accent' }, { spaceBeforePt: 18, spaceAfterPt: 4 }),
      section: p({ sizePt: 11, bold: true, color: '#333333' }, { spaceBeforePt: 10, spaceAfterPt: 2 }),
      item0: p({ sizePt: 10.5 }, { spaceBeforePt: 4 }),
      item1: p({ sizePt: 10.5 }, { spaceBeforePt: 1 }),
      item2: p({ sizePt: 10, color: '#555555' }),
      item3: p({ sizePt: 10, color: '#555555' }),
      note: p({ sizePt: 9, color: '#7F7F7F' }),
      unit: p({ sizePt: 8.5, color: '#7F7F7F' }, { align: 'right', spaceBeforePt: 4 }),
      caption: p({ sizePt: 9, color: '#7F7F7F' }, { align: 'center' }),
      body: p({ sizePt: 10.5 }, { spaceAfterPt: 3 }),
    },
    titleBox: { top: 0, bottom: 0, lineColor: '#FFFFFF' },
    table: { lines: 'minimal', lineColor: '#D9D9D9', outerMm: 0.12, head: { bg: '#F2F2F2', text: { sizePt: 9.5, bold: true, color: '#333333' } }, body: { text: { sizePt: 9.5 } }, total: { bold: true } },
    box: { bg: '#F5F5F5', lineColor: '#F5F5F5' },
    headerFooter: { sizePt: 8.5, color: '#A6A6A6' },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const accentById = (id: string) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
