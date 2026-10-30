/**
 * 문장 다듬기 (규칙) — 인터넷 없이 보고서 문체로 바꾼다.
 *
 *  - 공문체: 문장 끝을 명사형으로 ("확인합니다." → "확인함", "예정입니다" → "예정임", "있다" → "있음")
 *  - 개조식: 한 문단의 문장들을 □ ○ 항목으로 나누고 각 항목을 공문체로
 *
 * 문장 끝만 바꾸므로 글 내용은 그대로다. 날짜("2026. 10. 30.")·숫자 뒤 마침표는 문장 끝으로 보지 않는다.
 */

// ── 한글 음절 ────────────────────────────────────────────
const SBASE = 0xac00;
const JONG = { none: 0, n: 4, r: 8, rm: 10, m: 16, b: 17 } as const;
const isSyllable = (c: string) => c >= '가' && c <= '힣';
const jongOf = (c: string) => (isSyllable(c) ? (c.charCodeAt(0) - SBASE) % 28 : -1);
const withJong = (c: string, j: number) => String.fromCharCode(c.charCodeAt(0) - jongOf(c) + j);

/** 받침을 붙여 명사형으로: 하 → 함, 이 → 임, 만들 → 만듦, 있 → 있음 */
function nominal(stem: string): string {
  if (!stem) return stem;
  const last = stem.at(-1)!;
  const j = jongOf(last);
  if (j < 0) return stem; // 한글이 아니면 그대로
  if (j === JONG.none) return stem.slice(0, -1) + withJong(last, JONG.m);
  if (j === JONG.r) return stem.slice(0, -1) + withJong(last, JONG.rm);
  return `${stem}음`;
}

/** 이미 공문체로 끝난 문장 (바꾸지 않음) */
const DONE_RE = /(?:[함임음됨봄옴감줌짐씀][!?]?|것|예정|계획|필요|바람|요망|완료|예정임|참조|참고|등)$/;

/**
 * 문장 하나의 끝(마침표 제외)을 명사형으로. 바꿀 수 없으면 그대로 돌려준다.
 *   합니다/됩니다/입니다/바랍니다 → 함/됨/임/바람 (ㅂ니다 → ㅁ)
 *   있습니다/했습니다 → 있음/했음 (습니다 → 음)
 *   한다/된다 → 함/됨, 먹는다 → 먹음, 이다/있다/만들다 → 임/있음/만듦
 *   하십시오 → 하시기 바람, 하세요 → 하기 바람
 */
export function nominalize(sentence: string): string {
  const m = sentence.match(/^([\s\S]*?)(["'”’」』)\]]*)$/); // 끝 따옴표·괄호는 빼고 본다
  const body = m ? m[1] : sentence;
  const tail = m ? m[2] : '';
  const out = (s: string) => s + tail;
  if (!body || DONE_RE.test(body)) return sentence;
  if (body.endsWith('십시오')) return out(`${body.slice(0, -3)}시기 바람`);
  if (body.endsWith('세요')) return out(`${body.slice(0, -2)}기 바람`);
  if (body.endsWith('습니다')) return out(`${body.slice(0, -3)}음`);
  if (body.endsWith('니다')) {
    const stem = body.slice(0, -2);
    const last = stem.at(-1) ?? '';
    if (jongOf(last) === JONG.b) return out(stem.slice(0, -1) + withJong(last, JONG.m));
    return sentence;
  }
  if (body.endsWith('는다')) return out(nominal(body.slice(0, -2)));
  if (body.endsWith('다')) {
    const stem = body.slice(0, -1);
    const last = stem.at(-1) ?? '';
    if (!isSyllable(last)) return sentence;
    // 한다·된다·간다 (현재형 -ㄴ다): ㄴ 받침을 떼고 명사형
    if (jongOf(last) === JONG.n && !/(?:않|많|앉|얹)$/.test(stem) && stem.length >= 1) {
      const base = stem.slice(0, -1) + withJong(last, JONG.none);
      // "안다"(알다)처럼 원래 ㄴ 받침인 말은 드묾 — 보고서에서는 대부분 "-ㄴ다"
      return out(nominal(base));
    }
    return out(nominal(stem));
  }
  return sentence;
}

/** 문장 끝: 한글 뒤 마침표·물음표·느낌표 (숫자·○ 뒤 마침표 = 날짜 등은 아님) */
const SENT_END = /(?<=[가-힣)"'”’」』])[.!?。](?=\s|$)/g;

/** 문단 글을 문장으로 나눈다 (마침표 포함, 앞뒤 공백 정리) */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(SENT_END)) {
    const end = m.index! + 1;
    const s = text.slice(last, end).trim();
    if (s) out.push(s);
    last = end;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push(rest);
  return out;
}

export interface GongmunOptions {
  /** 바꾼 문장 끝에 마침표를 남길까 (보고서 개조식은 보통 없음) */
  keepPeriod?: boolean;
}

/** 문단 글 → 공문체. 문장 사이 띄어쓰기·문단 앞 기호는 그대로 */
export function toGongmun(text: string, opts: GongmunOptions = {}): string {
  let out = '';
  let last = 0;
  const ends = [...text.matchAll(SENT_END)].map((m) => m.index!);
  // 마침표 없이 끝나는 마지막 문장도 본다
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed && !/[.!?。]$/.test(trimmed)) ends.push(trimmed.length);
  ends.forEach((end, k) => {
    const sentence = text.slice(last, end);
    const punct = text[end] && /[.!?。]/.test(text[end]) ? text[end] : '';
    const conv = nominalize(sentence);
    const changed = conv !== sentence;
    out += conv;
    // 마지막 문장의 마침표만 뺀다 (문단 안 문장 사이 마침표는 남겨야 읽힌다)
    const isLast = k === ends.length - 1;
    if (punct) out += changed && punct === '.' && isLast && !opts.keepPeriod ? '' : punct;
    last = end + (punct ? 1 : 0);
  });
  return out + text.slice(last);
}

/** 개조식 앞 기호 (□ ○ - · ※ 등) */
const MARKER_RE = /^\s*([□■○●※\-◦▪·∙])\s+/;
export function stripMarker(text: string): { marker: string | null; rest: string } {
  const m = text.match(MARKER_RE);
  return m ? { marker: m[1], rest: text.slice(m[0].length) } : { marker: null, rest: text };
}

/** 문단 글 → 개조식 항목들 (기호 없이, 공문체, 마침표 없음) */
export function toGaejoItems(text: string): string[] {
  const { rest } = stripMarker(text);
  return splitSentences(rest).map((s) => toGongmun(s).replace(/[.。]$/, '').trim()).filter(Boolean);
}

// ── 글자 단위 차이 (바뀐 곳만 고쳐서 굵게·색 등 모양을 지킨다) ────────
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** a → b 로 바꾸는 최소 고침 목록 (앞에서부터, 겹치지 않음) */
export function diffEdits(a: string, b: string): TextEdit[] {
  if (a === b) return [];
  // 앞뒤 같은 부분은 빼고 가운데만 LCS
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const A = a.slice(p, a.length - s);
  const B = b.slice(p, b.length - s);
  if (A.length * B.length > 4_000_000) return [{ from: p, to: a.length - s, insert: B }]; // 너무 길면 통째로
  const n = A.length;
  const m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const edits: TextEdit[] = [];
  let i = 0;
  let j = 0;
  let cur: TextEdit | null = null;
  const flush = () => {
    if (cur) edits.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      cur ??= { from: p + i, to: p + i, insert: '' };
      cur.insert += B[j++];
    } else {
      cur ??= { from: p + i, to: p + i, insert: '' };
      cur.to = p + ++i;
    }
  }
  flush();
  return edits;
}
