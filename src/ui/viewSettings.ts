/**
 * 화면 모양 — 편집 화면만 바꾸고 한글·Word 파일과 인쇄에는 영향이 없다.
 *  - 화면 색: 시스템 따라 / 밝게 / 어둡게
 *  - 강조색: 단추·선택 색 (청록·남색·보라·주황·먹색)
 *  - 종이 색: 흰색 / 미색 / 연녹색 / 어둡게 (어두운 종이는 글자를 뒤집어 밝게 보여 줌)
 *  - 메뉴 글자 크기: 보통 / 크게 / 아주 크게
 *  - 집중 모드(F11): 메뉴를 숨기고 종이만, Esc 로 끝
 * 설정은 이 컴퓨터에 기억한다.
 */
export type Scheme = 'system' | 'light' | 'dark';
export type Paper = 'white' | 'cream' | 'green' | 'dark';
export type UiSize = 'normal' | 'large' | 'xlarge';

export interface ViewPrefs {
  scheme: Scheme;
  accent: string;
  paper: Paper;
  uiSize: UiSize;
}

interface AccentDef {
  id: string;
  name: string;
  light: string;
  dark: string;
}
export const UI_ACCENTS: AccentDef[] = [
  { id: 'teal', name: '청록', light: '#0b6b63', dark: '#4cbfb3' },
  { id: 'navy', name: '남색', light: '#1f4e8c', dark: '#7aa7e8' },
  { id: 'violet', name: '보라', light: '#6741b5', dark: '#a98ef0' },
  { id: 'orange', name: '주황', light: '#b4541b', dark: '#f0a060' },
  { id: 'graphite', name: '먹색', light: '#3d4652', dark: '#b4bcc8' },
];
const PAPERS: [Paper, string][] = [
  ['white', '흰색'],
  ['cream', '미색'],
  ['green', '연녹색'],
  ['dark', '어둡게'],
];
const SCHEMES: [Scheme, string][] = [
  ['system', '시스템 따라'],
  ['light', '밝게'],
  ['dark', '어둡게'],
];
const SIZES: [UiSize, string][] = [
  ['normal', '보통'],
  ['large', '크게'],
  ['xlarge', '아주 크게'],
];

const KEY = 'hanword.view';
export const DEFAULT_VIEW: ViewPrefs = { scheme: 'system', accent: 'teal', paper: 'white', uiSize: 'normal' };

export function loadView(): ViewPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      scheme: SCHEMES.some(([k]) => k === v.scheme) ? v.scheme : DEFAULT_VIEW.scheme,
      accent: UI_ACCENTS.some((a) => a.id === v.accent) ? v.accent : DEFAULT_VIEW.accent,
      paper: PAPERS.some(([k]) => k === v.paper) ? v.paper : DEFAULT_VIEW.paper,
      uiSize: SIZES.some(([k]) => k === v.uiSize) ? v.uiSize : DEFAULT_VIEW.uiSize,
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}
function saveView(v: ViewPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 기억 못 해도 화면은 바뀜 */
  }
}

const darkMq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = (v: ViewPrefs) => v.scheme === 'dark' || (v.scheme === 'system' && !!darkMq?.matches);

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let current: ViewPrefs = { ...DEFAULT_VIEW };

/** 화면에 입힌다 (html 요소의 data-* 와 색 변수) */
export function applyView(v: ViewPrefs) {
  current = v;
  const root = document.documentElement;
  if (v.scheme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = v.scheme;
  root.dataset.paper = v.paper;
  root.dataset.uiSize = v.uiSize;
  const a = UI_ACCENTS.find((x) => x.id === v.accent) ?? UI_ACCENTS[0];
  if (a.id === 'teal') {
    for (const p of ['--accent', '--accent-ink', '--sel']) root.style.removeProperty(p);
  } else {
    const dark = isDark(v);
    const c = dark ? a.dark : a.light;
    const [r, g, b] = hexRgb(c);
    root.style.setProperty('--accent', c);
    root.style.setProperty('--accent-ink', dark ? '#0b1016' : '#ffffff');
    root.style.setProperty('--sel', `rgba(${r}, ${g}, ${b}, ${dark ? 0.28 : 0.18})`);
  }
}
darkMq?.addEventListener?.('change', () => applyView(current));

// ── 집중 모드 ────────────────────────────────────────────
let exitBtn: HTMLButtonElement | null = null;
let fadeTimer = 0;
export function isFocusMode() {
  return document.documentElement.dataset.focus === '1';
}
export function setFocusMode(on: boolean, toast?: (m: string) => void) {
  const root = document.documentElement;
  if (on) root.dataset.focus = '1';
  else delete root.dataset.focus;
  if (on && !exitBtn) {
    exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'focus-exit';
    exitBtn.textContent = '집중 모드 끝내기 (Esc)';
    exitBtn.addEventListener('click', () => setFocusMode(false));
    document.body.append(exitBtn);
  }
  if (exitBtn) {
    exitBtn.hidden = !on;
    exitBtn.classList.add('show');
    clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => exitBtn?.classList.remove('show'), 2500);
  }
  if (on) toast?.('집중 모드 — 메뉴를 숨겼습니다. Esc 나 F11 로 끝냅니다');
}
// 마우스를 움직이면 "끝내기" 단추가 잠깐 보인다
document.addEventListener('mousemove', () => {
  if (!exitBtn || !isFocusMode()) return;
  exitBtn.classList.add('show');
  clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => exitBtn?.classList.remove('show'), 2000);
});

// ── 설정 창 (상태 표시줄 "화면" 단추 위에 뜸) ─────────────
let pop: HTMLElement | null = null;
export function closeViewPopover() {
  pop?.remove();
  pop = null;
}
export function openViewPopover(anchor: HTMLElement, toast?: (m: string) => void) {
  if (pop) return closeViewPopover();
  const v = { ...current };
  pop = document.createElement('div');
  pop.className = 'vw-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '화면 모양');
  const seg = (name: string, opts: [string, string][], val: string) =>
    `<div class="vw-seg" role="radiogroup" data-k="${name}">${opts
      .map(([k, l]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === val}" class="${k === val ? 'on' : ''}">${l}</button>`)
      .join('')}</div>`;
  const render = () => {
    pop!.innerHTML = `
      <div class="vw-head"><strong>화면 모양</strong><span>파일·인쇄에는 그대로</span></div>
      <div class="vw-row"><label>화면 색</label>${seg('scheme', SCHEMES, v.scheme)}</div>
      <div class="vw-row"><label>강조색</label><div class="vw-swatches" role="radiogroup" data-k="accent">${UI_ACCENTS.map(
        (a) => `<button type="button" role="radio" data-v="${a.id}" aria-checked="${a.id === v.accent}" class="${a.id === v.accent ? 'on' : ''}" title="${a.name}" aria-label="${a.name}" style="--sw:${isDark(v) ? a.dark : a.light}"></button>`,
      ).join('')}</div></div>
      <div class="vw-row"><label>종이 색</label>${seg('paper', PAPERS, v.paper)}</div>
      <div class="vw-row"><label>메뉴 글자</label>${seg('uiSize', SIZES, v.uiSize)}</div>
      <div class="vw-foot"><button type="button" class="vw-focus">집중 모드 <kbd>F11</kbd></button><button type="button" class="vw-reset">처음대로</button></div>`;
  };
  render();
  pop.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.classList.contains('vw-focus')) {
      closeViewPopover();
      setFocusMode(true, toast);
      return;
    }
    if (b.classList.contains('vw-reset')) Object.assign(v, DEFAULT_VIEW);
    else {
      const k = b.closest<HTMLElement>('[data-k]')?.dataset.k as keyof ViewPrefs | undefined;
      if (!k || !b.dataset.v) return;
      (v as Record<string, string>)[k] = b.dataset.v;
    }
    applyView({ ...v });
    saveView(v);
    render();
  });
  document.body.append(pop);
  // 단추 바로 위 오른쪽 끝에 맞춰
  const r = anchor.getBoundingClientRect();
  pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  pop.style.bottom = `${Math.max(8, innerHeight - r.top + 6)}px`;
  const outside = (e: Event) => {
    if (pop && !pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
      closeViewPopover();
      document.removeEventListener('pointerdown', outside, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
}

/** 명령 창(Ctrl+K)에 넣을 항목 */
export function viewCommands(toast?: (m: string) => void): { id: string; label: string; keys?: string; keywords: string; run: () => void }[] {
  const set = (patch: Partial<ViewPrefs>) => {
    const v = { ...current, ...patch };
    applyView(v);
    saveView(v);
  };
  return [
    { id: 'focus', label: '집중 모드 (메뉴 숨기기)', keys: 'F11', keywords: '화면 전체 집중', run: () => setFocusMode(!isFocusMode(), toast) },
    ...SCHEMES.map(([k, l]) => ({ id: `scheme:${k}`, label: `화면 색: ${l}`, keywords: '화면 모양 다크 모드 밤', run: () => set({ scheme: k }) })),
    ...PAPERS.map(([k, l]) => ({ id: `paper:${k}`, label: `종이 색: ${l}`, keywords: '화면 모양 종이 배경', run: () => set({ paper: k }) })),
    ...SIZES.map(([k, l]) => ({ id: `ui:${k}`, label: `메뉴 글자: ${l}`, keywords: '화면 모양 글씨 크기', run: () => set({ uiSize: k }) })),
    ...UI_ACCENTS.map((a) => ({ id: `accent:${a.id}`, label: `강조색: ${a.name}`, keywords: '화면 모양 색', run: () => set({ accent: a.id }) })),
  ];
}
