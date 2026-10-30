/**
 * "실효 서식" 계산 — DOCX/HWPX 저장기가 반드시 같은 값을 쓰도록 한 곳에서 계산한다.
 * (한쪽만 기본값을 다르게 잡으면 두 프로그램에서 문서가 달라 보이는 원인이 됨)
 */
import type { Doc, Paragraph, TextRun } from './types';
import { DEFAULT_COLOR, DEFAULT_FONT, ROLE_RUN } from './defaults';

export interface ResolvedRun {
  font: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  /** 자간 % */
  spacing: number;
}

export function resolveRun(p: Paragraph, r?: Partial<TextRun>): ResolvedRun {
  const role = ROLE_RUN[p.role];
  return {
    font: r?.font || DEFAULT_FONT,
    sizePt: r?.sizePt || role.sizePt,
    bold: role.bold || !!r?.bold,
    italic: !!r?.italic,
    underline: !!r?.underline,
    strike: !!r?.strike,
    color: (r?.color || DEFAULT_COLOR).toUpperCase(),
    spacing: Math.round(r?.spacingPct ?? 0),
  };
}

export function runKey(r: ResolvedRun): string {
  return [r.font, r.sizePt, +r.bold, +r.italic, +r.underline, +r.strike, r.color, r.spacing].join('|');
}

/** 문단에서 가장 큰 글자 크기 (빈 문단은 역할 기본 크기) */
export function maxSizePt(p: Paragraph): number {
  let max = 0;
  for (const i of p.inlines) if (i.kind === 'text') max = Math.max(max, resolveRun(p, i).sizePt);
  return max || resolveRun(p).sizePt;
}

/** XML 에 넣을 수 없는 제어 문자를 제거 */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

export function xmlEscape(s: string): string {
  return cleanText(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function plainText(blocks: Doc['blocks']): string {
  const lines: string[] = [];
  const para = (p: Paragraph) => p.inlines.map((i) => (i.kind === 'text' ? i.text : i.kind === 'break' ? '\n' : '')).join('');
  for (const b of blocks) {
    if (b.type === 'paragraph') lines.push(para(b));
    else for (const row of b.rows) lines.push(row.map((c) => c.blocks.map(para).join(' ')).join('\t'));
  }
  return lines.join('\n');
}

