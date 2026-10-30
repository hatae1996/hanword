/**
 * 블록 메뉴 — 손잡이(⋮⋮)를 누르면 뜬다. 옮기기·복제·지우기·종류 바꾸기.
 */
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { deleteGroup, duplicateGroup, moveGroupBy, turnInto, type Group, type TurnInto } from '../editor/blocks';

let open: HTMLElement | null = null;

export function closeBlockMenu() {
  open?.remove();
  open = null;
}

export function openBlockMenu(editor: Editor, g: Group, anchor: HTMLElement) {
  closeBlockMenu();
  const doc = editor.state.doc;
  const first = doc.child(g.start);
  const count = g.end - g.start;
  const menu = document.createElement('div');
  menu.className = 'hw-blockmenu';
  menu.setAttribute('role', 'menu');
  const focusBlock = () => {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.min(g.from + 1, editor.state.doc.content.size)))));
  };
  const item = (label: string, keys: string, run: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `hw-bm-item ${cls}`;
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `<span>${label}</span>${keys ? `<kbd>${keys}</kbd>` : ''}`;
    b.addEventListener('click', () => {
      closeBlockMenu();
      run();
      editor.commands.focus();
    });
    menu.append(b);
    return b;
  };
  const what = first.type.name === 'table' ? '표' : first.textContent.trim().slice(0, 18) || '빈 문단';
  const head = document.createElement('div');
  head.className = 'hw-bm-head';
  head.textContent = count > 1 ? `「${what}」 + 아래 ${count - 1}개` : `「${what}」`;
  menu.append(head);
  item('위로 옮기기', 'Alt+Shift+↑', () => (focusBlock(), moveGroupBy(editor, -1)));
  item('아래로 옮기기', 'Alt+Shift+↓', () => (focusBlock(), moveGroupBy(editor, 1)));
  item('복제', '', () => duplicateGroup(editor, g));
  item('지우기', '', () => deleteGroup(editor, g), 'danger');
  if (first.isTextblock) {
    const sep = document.createElement('div');
    sep.className = 'hw-bm-sep';
    sep.textContent = '바꾸기';
    menu.append(sep);
    const row = document.createElement('div');
    row.className = 'hw-bm-chips';
    const kinds: [TurnInto, string][] = [['body', '본문'], ['h1', '제목 1'], ['h2', '제목 2'], ['□', '□'], ['○', '○'], ['-', '-'], ['·', '·'], ['※', '※']];
    for (const [k, label] of kinds) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hw-bm-chip';
      b.textContent = label;
      b.title = k === 'body' ? '본문 (기호·들여쓰기 없앰)' : k.startsWith('h') ? `${label} (Word 제목 스타일)` : `${label} 항목 (개조식)`;
      b.addEventListener('click', () => {
        closeBlockMenu();
        turnInto(editor, g.start, k);
        editor.commands.focus();
      });
      row.append(b);
    }
    menu.append(row);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mh = menu.offsetHeight;
  menu.style.left = `${Math.max(8, r.left)}px`;
  menu.style.top = `${r.bottom + 4 + mh > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4}px`;
  open = menu;
  (menu.querySelector('.hw-bm-item') as HTMLElement)?.focus();
  const onDown = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      closeBlockMenu();
      document.removeEventListener('mousedown', onDown, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', onDown, true));
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button')];
    const k = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeBlockMenu();
      editor.commands.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
}
