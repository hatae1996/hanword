/**
 * 문장 다듬기 창 — 방식(공문체·개조식, AI 키가 있으면 요약·제목·맞춤법 등)을 고르면
 * 원래 글과 바뀐 글을 나란히 보여 주고, "바꾸기"를 눌러야 문서에 들어간다.
 */
import { diffEdits } from '../ai/polish';
import { OBJ, type Block, type Item } from '../editor/polish';
import { el, finish, shell } from './dialog';

export type Preview = (
  /** 문단마다 새 글 (null = 그대로) */
  | { kind: 'texts'; texts: (string | null)[] }
  /** 문단마다 개조식 항목들 */
  | { kind: 'items'; items: (Item[] | null)[] }
  /** 고른 문단들을 통째로 새 문단들로 (요약 등) */
  | { kind: 'replace'; paragraphs: string[] }
  /** 여러 안 중에서 고르기 (제목 추천 등) */
  | { kind: 'choices'; choices: string[]; note?: string }
  /** 알림만 (예: 고칠 곳 없음) */
  | { kind: 'message'; text: string }
) & {
  /** 상태 줄 끝에 붙일 말 (AI: 보낸 글자 수·비용) */
  note?: string;
};

export type Opt =
  | { key: string; label: string; type: 'select'; value: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'check'; value: boolean }
  | { key: string; label: string; type: 'text' | 'password'; value: string; placeholder?: string };

export interface PolishMode {
  id: string;
  label: string;
  hint: string;
  /** AI 를 쓰는 방식 (인터넷으로 보냄) */
  ai?: boolean;
  options?: Opt[];
  run: (blocks: Block[], opts: Record<string, any>, signal: AbortSignal) => Promise<Preview>;
  /** choices 를 고른 뒤 할 일 (제목 넣기 등) */
  apply?: (choice: string, blocks: Block[], opts: Record<string, any>) => void;
  /** 바꾸기 단추 글자 (기본 "바꾸기") */
  okText?: string;
}

export interface PolishChoice {
  mode: PolishMode;
  preview: Preview;
  opts: Record<string, any>;
  /** choices 일 때 고른 안 */
  choice?: string;
}

const show = (t: string) => t.split(OBJ).join('▣');

/** 바뀐 곳을 표시한 한 줄 (before: 지운 곳 / after: 넣은 곳) */
function diffLine(a: string, b: string, side: 'before' | 'after'): HTMLElement {
  const line = el('div', `pl-line ${side}`);
  const edits = diffEdits(a, b);
  const src = side === 'before' ? a : b;
  let at = 0;
  let shift = 0; // after 쪽 좌표 = a 좌표 + 누적 차이
  for (const e of edits) {
    const s = side === 'before' ? e.from : e.from + shift;
    const t = side === 'before' ? e.to : e.from + shift + e.insert.length;
    if (s > at) line.append(document.createTextNode(show(src.slice(at, s))));
    if (t > s) {
      const seg = src.slice(s, t);
      // 빈칸만 바뀐 곳은 교정 부호로 보이게: 띄움 ∨ / 붙임 ⌒
      const blank = !seg.trim();
      const mark = el(side === 'before' ? 'del' : 'ins', blank ? 'sp' : '', blank ? (side === 'before' ? '⌒' : '∨') : show(seg));
      if (blank) mark.title = side === 'before' ? '빈칸 지움 (붙여 씀)' : '빈칸 넣음 (띄어 씀)';
      line.append(mark);
    }
    at = t;
    shift += e.insert.length - (e.to - e.from);
  }
  if (at < src.length) line.append(document.createTextNode(show(src.slice(at))));
  return line;
}

export function polishDialog(blocks: Block[], modes: PolishMode[], firstId?: string): Promise<PolishChoice | null> {
  const restore = document.activeElement;
  const { dlg, body, foot } = shell('문장 다듬기');
  dlg.classList.add('pl-dialog');
  const tabs = el('div', 'pl-tabs');
  tabs.setAttribute('role', 'tablist');
  const optRow = el('div', 'pl-opts');
  const status = el('p', 'hw-dialog-note pl-status');
  const view = el('div', 'pl-view');
  body.append(tabs, optRow, status, view);
  const cancel = el('button', 'btn ghost', '취소');
  const again = el('button', 'btn ghost', '다시');
  const ok = el('button', 'btn save', '바꾸기');
  cancel.type = again.type = ok.type = 'button';
  foot.append(cancel, again, ok);

  let mode = modes.find((m) => m.id === firstId) ?? modes[0];
  let preview: Preview | null = null;
  let choice: string | undefined;
  let ctrl: AbortController | null = null;
  const values = new Map<string, Record<string, any>>();

  return new Promise((resolve) => {
    const done = (v: PolishChoice | null) => {
      ctrl?.abort();
      finish(dlg, restore);
      resolve(v);
    };
    const optsOf = (m: PolishMode) => {
      if (!values.has(m.id)) values.set(m.id, Object.fromEntries((m.options ?? []).map((o) => [o.key, o.value])));
      return values.get(m.id)!;
    };

    const renderPreview = () => {
      renderBody();
      if (preview?.note) status.textContent = `${status.textContent}  ·  ${preview.note}`;
    };
    const renderBody = () => {
      view.replaceChildren();
      ok.disabled = true;
      if (!preview) return;
      const p = preview;
      if (p.kind === 'message') {
        status.textContent = p.text;
        return;
      }
      if (p.kind === 'texts') {
        let n = 0;
        p.texts.forEach((t, i) => {
          if (t == null || t === blocks[i].text) return;
          n++;
          const card = el('div', 'pl-card');
          card.append(diffLine(blocks[i].text, t, 'before'), diffLine(blocks[i].text, t, 'after'));
          view.append(card);
        });
        status.textContent = n ? `${n}개 문단이 바뀝니다. 바뀐 곳은 색으로 표시했습니다.` : '바꿀 곳이 없습니다 (이미 그 문체이거나 문장 끝을 알아보지 못했습니다).';
        ok.disabled = !n;
        return;
      }
      if (p.kind === 'items') {
        let n = 0;
        p.items.forEach((items, i) => {
          if (!items?.length) return;
          n++;
          const card = el('div', 'pl-card');
          card.append(el('div', 'pl-line before', show(blocks[i].text)));
          const after = el('div', 'pl-line after');
          for (const it of items) after.append(el('div', `pl-item lv${'□○-·'.indexOf(it.symbol)}`, `${it.symbol} ${it.text}`));
          card.append(after);
          view.append(card);
        });
        status.textContent = n ? `${n}개 문단을 개조식 항목으로 나눕니다.` : '나눌 문장이 없습니다.';
        ok.disabled = !n;
        return;
      }
      if (p.kind === 'replace') {
        const card = el('div', 'pl-card');
        card.append(el('div', 'pl-line before', blocks.map((b) => show(b.text)).join('\n')));
        const after = el('div', 'pl-line after');
        for (const t of p.paragraphs) after.append(el('div', 'pl-item', t));
        card.append(after);
        view.append(card);
        status.textContent = `고른 ${blocks.length}개 문단을 아래 ${p.paragraphs.length}개 문단으로 바꿉니다.`;
        ok.disabled = !p.paragraphs.length;
        return;
      }
      // choices
      status.textContent = '하나를 고르세요.';
      const list = el('div', 'pl-choices');
      p.choices.forEach((c, i) => {
        const lab = el('label', 'pl-choice');
        const r = el('input');
        r.type = 'radio';
        r.name = 'pl-choice';
        r.checked = i === 0;
        r.addEventListener('change', () => (choice = c));
        lab.append(r, el('span', '', c));
        list.append(lab);
      });
      choice = p.choices[0];
      view.append(list);
      ok.disabled = !p.choices.length;
    };

    const run = async () => {
      ctrl?.abort();
      const my = (ctrl = new AbortController());
      preview = null;
      renderPreview();
      status.textContent = mode.ai ? 'AI 에게 묻는 중… (몇 초 걸립니다)' : '';
      dlg.classList.add('busy');
      try {
        const p = await mode.run(blocks, optsOf(mode), my.signal);
        if (my.signal.aborted) return;
        preview = p;
      } catch (e) {
        if (my.signal.aborted) return;
        preview = { kind: 'message', text: `할 수 없습니다: ${(e as Error)?.message ?? e}` };
      } finally {
        if (ctrl === my) dlg.classList.remove('busy');
      }
      // 방식이 값을 바꿨으면(예: 저장한 키 칸 비우기) 칸에도 반영
      const v = optsOf(mode);
      optRow.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((i) => {
        if (i.value !== (v[i.dataset.key!] ?? '')) i.value = v[i.dataset.key!] ?? '';
      });
      optRow.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((c, k) => {
        const o = (mode.options ?? []).filter((x) => x.type === 'check')[k];
        if (o) c.checked = !!v[o.key];
      });
      renderPreview();
    };

    const renderOpts = () => {
      optRow.replaceChildren();
      const v = optsOf(mode);
      for (const o of mode.options ?? []) {
        const lab = el('label', `pl-opt ${o.type}`);
        if (o.type === 'check') {
          const c = el('input');
          c.type = 'checkbox';
          c.checked = !!v[o.key];
          c.addEventListener('change', () => {
            v[o.key] = c.checked;
            void run();
          });
          lab.append(c, el('span', '', o.label));
        } else if (o.type === 'select') {
          const s = el('select', 'hw-dialog-input');
          for (const x of o.options) s.add(new Option(x.label, x.value));
          s.value = v[o.key];
          s.addEventListener('change', () => {
            v[o.key] = s.value;
            void run();
          });
          lab.append(el('span', '', o.label), s);
        } else {
          const t = el('input', 'hw-dialog-input');
          t.type = o.type;
          t.autocomplete = 'off';
          t.dataset.key = o.key;
          t.value = v[o.key] ?? '';
          t.placeholder = o.placeholder ?? '';
          t.spellcheck = false;
          t.addEventListener('change', () => {
            // Enter 로 이미 보낸 값이면 다시 묻지 않는다 (바꾸기를 누르려고 칸을 벗어날 때 또 묻지 않게)
            if (v[o.key] === t.value || !t.value) return;
            v[o.key] = t.value;
            void run();
          });
          // 지시·키를 쓰고 Enter → 다시 (대화상자 Enter=바꾸기 와 구분)
          t.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              v[o.key] = t.value;
              void run();
            }
          });
          lab.append(el('span', '', o.label), t);
        }
        optRow.append(lab);
      }
      optRow.hidden = !mode.options?.length;
      again.hidden = !mode.ai;
      ok.textContent = mode.okText ?? '바꾸기';
    };

    const tabButtons = modes.map((m) => {
      const b = el('button', 'pl-tab', m.label);
      b.type = 'button';
      b.title = m.hint;
      b.setAttribute('role', 'tab');
      if (m.ai) b.classList.add('ai');
      b.addEventListener('click', () => {
        // 탭을 누른 뒤 Enter = 바꾸기 (지시를 쓰는 방식이면 그 칸으로)
        void select(m).then(() => (optRow.querySelector<HTMLInputElement>('input[type="text"],input[type="password"]') ?? (ok.disabled ? b : ok)).focus());
      });
      tabs.append(b);
      return b;
    });
    const select = (m: PolishMode) => {
      mode = m;
      tabButtons.forEach((b, i) => b.setAttribute('aria-selected', String(modes[i] === m)));
      renderOpts();
      return run();
    };

    ok.addEventListener('click', () => preview && done({ mode, preview, choice, opts: optsOf(mode) }));
    again.addEventListener('click', () => void run());
    cancel.addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement && ['text', 'password'].includes(e.target.type)) && !ok.disabled) {
        e.preventDefault();
        ok.click();
      }
    });
    dlg.showModal();
    void select(mode).then(() => !ok.disabled && ok.focus());
  });
}
