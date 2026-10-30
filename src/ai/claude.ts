/**
 * Claude API — AI 다듬기용. 키는 이 PC(앱 저장소)에만 두고, 고른 글만 보낸다.
 * 데스크톱 앱(WebView2)에서 바로 부른다 (anthropic-dangerous-direct-browser-access).
 */

export interface AiConfig {
  key: string;
  model: string;
}

export const AI_MODELS = [
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (기본)' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5 (빠르고 가장 쌈)' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5 (가장 좋음 · 약 2배 비쌈)' },
];
const STORE = 'hanword.ai';
export const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export function loadAi(): AiConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return v?.key ? { key: String(v.key), model: String(v.model || AI_MODELS[0].value) } : null;
  } catch {
    return null;
  }
}
export function saveAi(cfg: AiConfig | null) {
  try {
    if (cfg?.key) localStorage.setItem(STORE, JSON.stringify(cfg));
    else localStorage.removeItem(STORE);
  } catch {
    /* 저장소를 못 쓰면 이번 실행 동안만 */
  }
}
export const maskKey = (k: string) => (k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••');

export interface AiAnswer {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** 한 번 묻기 (대화 없음) */
export async function askClaude(cfg: AiConfig, system: string, user: string, signal?: AbortSignal, maxTokens = 2048): Promise<AiAnswer> {
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new Error('AI 에 연결하지 못했습니다. 인터넷 연결(기관 방화벽에서 api.anthropic.com 허용 여부)을 확인하세요.');
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* 본문 없음 */
    }
    const why: Record<number, string> = {
      400: '요청이 잘못됐습니다',
      401: 'API 키가 맞지 않습니다 (AI 설정에서 다시 넣으세요)',
      403: '이 키로는 쓸 수 없습니다 (권한)',
      404: '모델 이름을 찾지 못했습니다 (AI 설정에서 모델을 바꿔 보세요)',
      413: '보낼 글이 너무 깁니다',
      429: '요청이 너무 많거나 사용 한도를 넘었습니다. 잠시 뒤 다시 하세요',
      500: 'AI 서버 오류입니다. 잠시 뒤 다시 하세요',
      529: 'AI 서버가 바쁩니다. 잠시 뒤 다시 하세요',
    };
    throw new Error(`${why[res.status] ?? `AI 오류 (${res.status})`}${detail ? ` — ${detail.slice(0, 160)}` : ''}`);
  }
  const data = await res.json();
  const text = (data?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('');
  if (data?.stop_reason === 'max_tokens') throw new Error('AI 답이 너무 길어 잘렸습니다. 더 적게 골라서 다시 하세요');
  return { text, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 };
}

// ── 문단 번호 붙여 주고받기: [1] … [2] … ─────────────────
export function numbered(paragraphs: string[]): string {
  return paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n');
}
/** "[1] …\n[2] …" → 문단들 (번호 순서대로, 번호 없는 줄은 앞 문단에 이어 붙임) */
export function parseNumbered(text: string): string[] {
  const out = new Map<number, string>();
  let cur = -1;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const m = raw.match(/^\s*\[(\d+)\]\s?(.*)$/);
    if (m) {
      cur = Number(m[1]);
      out.set(cur, m[2]);
    } else if (cur > 0 && raw.trim()) out.set(cur, `${out.get(cur)} ${raw.trim()}`.trim());
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.trim());
}

/** 대략적인 비용 (원) — 표시용 */
export function costWon(model: string, a: AiAnswer): number {
  const usd: Record<string, [number, number]> = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'claude-opus-5-5': [4, 20] };
  const [i, o] = usd[model] ?? [2, 10];
  return ((a.inputTokens * i + a.outputTokens * o) / 1e6) * 1400;
}
