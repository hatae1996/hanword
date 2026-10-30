/**
 * 작은 대화상자 — 상용구, 모양 복사, 편집 용지, 문단 모양, 쪽 번호, 양식 저장 등이 같이 쓴다.
 * 브라우저 prompt() 는 데스크톱 앱(WebView2)에서 막혀 있을 수 있어 직접 만든다.
 * Enter = 확인, Esc = 취소. 닫히면 편집기로 초점을 돌려준다.
 */

export type Field =
  | { key: string; label: string; type: 'text'; value?: string; placeholder?: string; wide?: boolean }
  | { key: string; label: string; type: 'number'; value?: number; step?: number; min?: number; max?: number; suffix?: string }
  | { key: string; label: string; type: 'select'; value?: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'check'; value?: boolean };

export interface FormOptions {
  title: string;
  fields: Field[];
  okText?: string;
  note?: string;
  /** 필드 사이에 소제목을 넣고 싶을 때: 해당 key 앞에 그룹 이름 */
  groups?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function shell(title: string): { dlg: HTMLDialogElement; body: HTMLElement; foot: HTMLElement } {
  const dlg = el('dialog', 'hw-dialog');
  dlg.setAttribute('aria-label', title);
  dlg.append(el('h2', 'hw-dialog-title', title));
  const body = el('div', 'hw-dialog-body');
  const foot = el('div', 'hw-dialog-foot');
  dlg.append(body, foot);
  document.body.append(dlg);
  return { dlg, body, foot };
}

export function finish(dlg: HTMLDialogElement, restore: Element | null) {
  dlg.close();
  dlg.remove();
  if (restore instanceof HTMLElement) restore.focus();
}

/** 여러 칸짜리 입력 대화상자. 취소하면 null */
export function formDialog(opts: FormOptions): Promise<Record<string, any> | null> {
  const restore = document.activeElement;
  const { dlg, body, foot } = shell(opts.title);
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const f of opts.fields) {
    if (opts.groups?.[f.key]) body.append(el('div', 'hw-dialog-group', opts.groups[f.key]));
    const row = el('label', `hw-dialog-row${f.type === 'check' ? ' check' : ''}${f.type === 'text' && f.wide ? ' wide' : ''}`);
    const name = el('span', 'hw-dialog-label', f.label);
    let input: HTMLInputElement | HTMLSelectElement;
    if (f.type === 'select') {
      input = el('select', 'hw-dialog-input');
      for (const o of f.options) input.add(new Option(o.label, o.value));
      if (f.value !== undefined) input.value = f.value;
    } else {
      input = el('input', 'hw-dialog-input');
      if (f.type === 'check') {
        input.type = 'checkbox';
        input.checked = !!f.value;
      } else if (f.type === 'number') {
        input.type = 'number';
        input.step = String(f.step ?? 0.1);
        if (f.min !== undefined) input.min = String(f.min);
        if (f.max !== undefined) input.max = String(f.max);
        input.value = f.value === undefined ? '' : String(+f.value.toFixed(2));
      } else {
        input.type = 'text';
        input.value = f.value ?? '';
        if (f.placeholder) input.placeholder = f.placeholder;
        input.spellcheck = false;
      }
    }
    input.dataset.key = f.key;
    inputs.set(f.key, input);
    if (f.type === 'check') row.append(input, name);
    else row.append(name, input);
    if (f.type === 'number' && f.suffix) row.append(el('span', 'hw-dialog-suffix', f.suffix));
    body.append(row);
  }
  if (opts.note) body.append(el('p', 'hw-dialog-note', opts.note));
  const ok = el('button', 'btn save', opts.okText ?? '확인');
  const cancel = el('button', 'btn ghost', '취소');
  ok.type = cancel.type = 'button';
  foot.append(cancel, ok);
  return new Promise((resolve) => {
    const done = (v: Record<string, any> | null) => {
      finish(dlg, restore);
      resolve(v);
    };
    const collect = () => {
      const out: Record<string, any> = {};
      for (const f of opts.fields) {
        const i = inputs.get(f.key)!;
        if (f.type === 'check') out[f.key] = (i as HTMLInputElement).checked;
        else if (f.type === 'number') out[f.key] = i.value === '' ? null : Number(i.value);
        else out[f.key] = i.value;
      }
      return out;
    };
    ok.addEventListener('click', () => done(collect()));
    cancel.addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 편집기 단축키(Ctrl+S 등)가 대화상자 위에서 돌지 않게
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        done(collect());
      }
    });
    dlg.showModal();
    (inputs.values().next().value as HTMLElement | undefined)?.focus();
    const first = inputs.values().next().value;
    if (first instanceof HTMLInputElement && first.type === 'text') first.select();
  });
}

/** 한 줄 입력. 취소하면 null */
export async function promptDialog(title: string, label: string, value = '', placeholder = ''): Promise<string | null> {
  const r = await formDialog({ title, fields: [{ key: 'v', label, type: 'text', value, placeholder, wide: true }] });
  if (!r) return null;
  const v = String(r.v ?? '').trim();
  return v || null;
}

export interface ListItem {
  label: string;
  sub?: string;
  /** 고르면 실행 */
  pick?: () => void;
  /** 오른쪽 작은 버튼 (예: 지우기) */
  action?: { text: string; run: () => void };
}

/** 목록에서 하나 고르기 (위·아래 화살표 + Enter, 또는 클릭) */
export function listDialog(title: string, items: ListItem[], empty = '목록이 비어 있습니다'): Promise<void> {
  const restore = document.activeElement;
  const { dlg, body, foot } = shell(title);
  const list = el('div', 'hw-dialog-list');
  body.append(list);
  const close = el('button', 'btn ghost', '닫기');
  close.type = 'button';
  foot.append(close);
  return new Promise((resolve) => {
    const done = () => {
      finish(dlg, restore);
      resolve();
    };
    const rows: HTMLButtonElement[] = [];
    const render = () => {
      list.replaceChildren();
      rows.length = 0;
      if (!items.length) list.append(el('p', 'hw-dialog-note', empty));
      items.forEach((it, i) => {
        const row = el('div', 'hw-dialog-item');
        const b = el('button', 'hw-dialog-pick');
        b.type = 'button';
        b.append(el('span', 'name', it.label));
        if (it.sub) b.append(el('span', 'sub', it.sub));
        b.addEventListener('click', () => {
          done();
          it.pick?.();
        });
        rows.push(b);
        row.append(b);
        if (it.action) {
          const a = el('button', 'hw-dialog-act', it.action.text);
          a.type = 'button';
          a.addEventListener('click', () => {
            it.action!.run();
            items.splice(i, 1);
            render();
          });
          row.append(a);
        }
        list.append(row);
      });
    };
    render();
    close.addEventListener('click', done);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done();
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const i = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = rows.length;
        if (n) rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
      }
    });
    dlg.showModal();
    (rows[0] ?? close).focus();
  });
}
