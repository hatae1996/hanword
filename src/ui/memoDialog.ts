/**
 * 메모 넣기·고치기 창 — 내용(여러 줄), 작성자(이 PC 에 기억). 고칠 때는 "지우기" 단추.
 */
import { el, finish, shell } from './dialog';

const AUTHOR = 'hanword.author';
export const lastAuthor = () => {
  try {
    return localStorage.getItem(AUTHOR) ?? '';
  } catch {
    return '';
  }
};

export interface MemoResult {
  action: 'save' | 'delete';
  text: string;
  author: string;
}

export function memoDialog(opts: { title: string; text?: string; author?: string; anchor?: string; canDelete?: boolean }): Promise<MemoResult | null> {
  const restore = document.activeElement;
  const { dlg, body, foot } = shell(opts.title);
  if (opts.anchor) body.append(el('p', 'hw-dialog-note', `「${opts.anchor.length > 40 ? `${opts.anchor.slice(0, 40)}…` : opts.anchor}」에 다는 메모`));
  const area = el('textarea', 'hw-dialog-input hw-memo-text');
  area.rows = 4;
  area.value = opts.text ?? '';
  area.placeholder = '메모 내용 (Ctrl+Enter 로 확인)';
  const who = el('input', 'hw-dialog-input');
  who.type = 'text';
  who.value = opts.author ?? lastAuthor();
  who.placeholder = '작성자 (선택)';
  const row = el('label', 'hw-dialog-row');
  row.append(el('span', 'hw-dialog-label', '작성자'), who);
  body.append(area, row);
  const del = el('button', 'btn ghost danger', '메모 지우기');
  const cancel = el('button', 'btn ghost', '취소');
  const ok = el('button', 'btn save', '확인');
  del.type = cancel.type = ok.type = 'button';
  if (opts.canDelete) foot.append(del);
  foot.append(cancel, ok);
  return new Promise((resolve) => {
    const done = (v: MemoResult | null) => {
      finish(dlg, restore);
      resolve(v);
    };
    const save = () => {
      const text = area.value.replace(/\s+$/, '');
      if (!text.trim()) {
        area.focus();
        return;
      }
      try {
        localStorage.setItem(AUTHOR, who.value.trim());
      } catch {
        /* 기억 못 해도 됨 */
      }
      done({ action: 'save', text, author: who.value.trim() });
    };
    ok.addEventListener('click', save);
    cancel.addEventListener('click', () => done(null));
    del.addEventListener('click', () => done({ action: 'delete', text: '', author: '' }));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.target === who)) {
        e.preventDefault();
        save();
      }
    });
    dlg.showModal();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
}
