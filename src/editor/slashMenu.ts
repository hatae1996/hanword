/**
 * `/` 메뉴 — 노션처럼 줄 맨 앞에서 / 를 치면 넣을 수 있는 부품 목록이 뜬다.
 * 이어서 글자를 치면 걸러지고, ↑↓ 로 고르고 Enter(또는 Tab)로 넣는다. Esc 로 닫는다.
 * 목록 내용은 밖에서 준다 (보고서 부품 + 내 상용구).
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface MenuItem {
  label: string;
  hint?: string;
  group?: string;
  keywords?: string;
  /** range = 줄의 '/검색어' 위치. 넣기 전에 지울 것 */
  run: (editor: Editor, range: { from: number; to: number }) => void;
}

export interface SlashOptions {
  items: () => MenuItem[];
}

const key = new PluginKey('hanwordSlash');

function match(item: MenuItem, q: string): boolean {
  if (!q) return true;
  const hay = `${item.label} ${item.keywords ?? ''} ${item.group ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export const SlashMenu = Extension.create<SlashOptions>({
  name: 'slashMenu',
  priority: 1100, // 빈칸 Tab·개조식 Enter 보다 먼저 (메뉴가 열려 있을 때)
  addOptions() {
    return { items: () => [] };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;
    let box: HTMLDivElement | null = null;
    let shown: MenuItem[] = [];
    let active = 0;
    let range: { from: number; to: number } | null = null;
    let dismissedAt = -1; // Esc 로 닫은 자리 (같은 / 에서는 다시 열지 않음)

    const close = () => {
      box?.remove();
      box = null;
      range = null;
      shown = [];
    };
    const choose = (i: number) => {
      const item = shown[i];
      const r = range;
      close();
      if (item && r) item.run(editor, r);
    };
    const render = (q: string, coords: { left: number; bottom: number }) => {
      shown = options.items().filter((it) => match(it, q));
      if (!shown.length) return close();
      active = Math.min(active, shown.length - 1);
      if (!box) {
        box = document.createElement('div');
        box.className = 'hw-slash';
        box.setAttribute('role', 'listbox');
        box.addEventListener('mousedown', (e) => e.preventDefault());
        document.body.append(box);
      }
      box.replaceChildren();
      let group = '';
      shown.forEach((it, i) => {
        if (it.group && it.group !== group) {
          group = it.group;
          const g = document.createElement('div');
          g.className = 'hw-slash-group';
          g.textContent = group;
          box!.append(g);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `hw-slash-item${i === active ? ' on' : ''}`;
        b.setAttribute('role', 'option');
        b.innerHTML = '';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = it.label;
        b.append(name);
        if (it.hint) {
          const h = document.createElement('span');
          h.className = 'hint';
          h.textContent = it.hint;
          b.append(h);
        }
        b.addEventListener('click', () => choose(i));
        box!.append(b);
      });
      const maxTop = window.innerHeight - Math.min(box.offsetHeight || 320, 360) - 8;
      box.style.left = `${Math.max(8, Math.min(coords.left, window.innerWidth - 300))}px`;
      box.style.top = `${Math.max(8, Math.min(coords.bottom + 4, maxTop))}px`;
      box.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };

    return [
      new Plugin({
        key,
        view: () => ({
          update: (view) => {
            const sel = view.state.selection;
            if (!sel.empty || !view.hasFocus()) return close();
            const $from = sel.$from;
            if (!$from.parent.isTextblock) return close();
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
            const m = before.match(/^\s*\/([^\s/]{0,20})$/);
            if (!m) {
              dismissedAt = -1;
              return close();
            }
            const slashPos = $from.start() + before.indexOf('/');
            if (slashPos === dismissedAt) return close();
            if (!range || range.from !== slashPos) active = 0;
            range = { from: slashPos, to: sel.from };
            const c = view.coordsAtPos(sel.from);
            render(m[1], { left: c.left, bottom: c.bottom });
          },
          destroy: close,
        }),
        props: {
          handleKeyDown(_view, e) {
            if (!box || !range) return false;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
              box.querySelectorAll('.hw-slash-item').forEach((b, i) => b.classList.toggle('on', i === active));
              box.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
              return true;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              choose(active);
              return true;
            }
            if (e.key === 'Escape') {
              dismissedAt = range.from;
              close();
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            blur: () => {
              setTimeout(close, 120);
              return false;
            },
          },
        },
      }),
    ];
  },
});
