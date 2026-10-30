/**
 * 명령 창 (Ctrl+K) — 모든 기능을 이름으로 찾아 바로 실행한다.
 * 한글 초성으로도 찾는다: "ㅉㅂㅎ" → 쪽 번호, "ㄷㄷㄱ" → 다듬기, "모ㄷ" → 모던 테마.
 * 아무것도 치지 않으면 최근에 쓴 명령이 위에 온다.
 */

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keys?: string;
  keywords?: string;
  run: () => void;
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const isCho = (c: string) => CHO.includes(c);
/** 한 글자를 비교용으로: 한글 음절은 [음절, 초성] */
function choOf(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return CHO[Math.floor((code - 0xac00) / 588)];
  return c;
}
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 검색어가 글 안에 이어서 나오는가 (검색어의 초성 글자는 음절의 초성과 맞으면 됨). 맞은 위치, 없으면 -1 */
export function matchKo(text: string, query: string): number {
  const t = squash(text);
  const q = squash(query);
  if (!q) return 0;
  outer: for (let i = 0; i + q.length <= t.length; i++) {
    for (let k = 0; k < q.length; k++) {
      const a = t[i + k];
      const b = q[k];
      if (a === b) continue;
      if (isCho(b) && choOf(a) === b) continue;
      continue outer;
    }
    return i;
  }
  return -1;
}

const RECENT = 'hanword.recentCommands';
const recent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]');
  } catch {
    return [];
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 8)));
  } catch {
    /* 기억 못 해도 됨 */
  }
};

export function rank(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) {
    const r = recent();
    const byId = new Map(items.map((i) => [i.id, i]));
    const top = r.map((id) => byId.get(id)).filter((x): x is PaletteItem => !!x);
    return [...top, ...items.filter((i) => !r.includes(i.id))];
  }
  const scored: { it: PaletteItem; s: number }[] = [];
  for (const it of items) {
    const inLabel = matchKo(it.label, query);
    const inMore = inLabel < 0 ? matchKo(`${it.group} ${it.keywords ?? ''} ${it.hint ?? ''}`, query) : -1;
    if (inLabel < 0 && inMore < 0) continue;
    // 이름 앞쪽에서 맞을수록, 이름에서 맞을수록 위
    scored.push({ it, s: inLabel >= 0 ? inLabel : 100 + inMore });
  }
  return scored.sort((a, b) => a.s - b.s).map((x) => x.it);
}

let openEl: HTMLElement | null = null;

export function openCommandPalette(items: PaletteItem[]) {
  if (openEl) return;
  const restore = document.activeElement as HTMLElement | null;
  const wrap = document.createElement('div');
  wrap.className = 'hw-palette-wrap';
  wrap.innerHTML = `<div class="hw-palette" role="dialog" aria-label="명령 찾기">
      <input class="hw-palette-input" type="text" placeholder="무엇을 할까요? 기능 이름이나 초성 (예: ㅉㅂㅎ → 쪽 번호)" spellcheck="false" autocomplete="off" />
      <div class="hw-palette-list" role="listbox"></div>
      <div class="hw-palette-foot">↑↓ 고르기 · Enter 실행 · Esc 닫기</div>
    </div>`;
  document.body.append(wrap);
  openEl = wrap;
  const input = wrap.querySelector('input')!;
  const list = wrap.querySelector('.hw-palette-list') as HTMLElement;
  let shown: PaletteItem[] = [];
  let sel = 0;
  const close = (run?: PaletteItem) => {
    wrap.remove();
    openEl = null;
    if (run) {
      remember(run.id);
      run.run();
    } else restore?.focus?.();
  };
  const render = () => {
    shown = rank(items, input.value).slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren();
    const r = new Set(input.value.trim() ? [] : recent());
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'hw-palette-empty';
      empty.textContent = '맞는 기능이 없습니다';
      list.append(empty);
    }
    shown.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = `hw-palette-row${i === sel ? ' on' : ''}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === sel));
      row.innerHTML = `<span class="lab"></span><span class="hint"></span><span class="grp"></span>${it.keys ? '<kbd></kbd>' : ''}`;
      (row.querySelector('.lab') as HTMLElement).textContent = it.label;
      (row.querySelector('.hint') as HTMLElement).textContent = it.hint ?? '';
      (row.querySelector('.grp') as HTMLElement).textContent = r.has(it.id) ? '최근' : it.group;
      if (it.keys) (row.querySelector('kbd') as HTMLElement).textContent = it.keys;
      row.addEventListener('mousemove', () => {
        if (sel !== i) {
          sel = i;
          list.querySelectorAll('.hw-palette-row').forEach((x, k) => x.classList.toggle('on', k === sel));
        }
      });
      row.addEventListener('click', () => close(it));
      list.append(row);
    });
    (list.children[sel] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => {
    sel = 0;
    render();
  });
  wrap.addEventListener('keydown', (e) => {
    e.stopPropagation(); // 편집기 단축키가 돌지 않게
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      render();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (shown[sel]) close(shown[sel]);
    }
  });
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  render();
  input.focus();
}
