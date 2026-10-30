/** 탐색 창 화면 — 목차(장·제목·□) 와 찾기 결과 두 탭 */
import type { Editor } from '@tiptap/core';
import { buildOutline, currentOutline, goToOutline, moveSection, type OutlineItem } from '../editor/outline';
import { findState, goToMatch } from '../editor/findReplace';

const STORE = 'hanword.navpane';

export function setupNavPane(editor: Editor, els: { pane: HTMLElement; toggle: HTMLElement; onFindMove?: () => void }) {
  const { pane, toggle } = els;
  pane.innerHTML = `
    <div class="nav-tabs" role="tablist">
      <button type="button" role="tab" data-tab="outline" class="on">목차</button>
      <button type="button" role="tab" data-tab="results">찾기 결과</button>
      <button type="button" class="nav-close" title="탐색 창 닫기" aria-label="닫기">✕</button>
    </div>
    <div class="nav-body" data-body="outline"></div>
    <div class="nav-body" data-body="results" hidden></div>`;
  const outlineBody = pane.querySelector<HTMLElement>('[data-body=outline]')!;
  const resultBody = pane.querySelector<HTMLElement>('[data-body=results]')!;
  let tab: 'outline' | 'results' = 'outline';
  let items: OutlineItem[] = [];
  let dragFrom = -1;

  const setTab = (t: typeof tab) => {
    tab = t;
    pane.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    outlineBody.hidden = t !== 'outline';
    resultBody.hidden = t !== 'results';
    render();
  };
  pane.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab as typeof tab)));
  pane.querySelector('.nav-close')!.addEventListener('click', () => show(false));

  function renderOutline() {
    items = buildOutline(editor.state.doc);
    outlineBody.replaceChildren();
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'nav-empty';
      p.textContent = '장 제목(Ⅰ. Ⅱ.)이나 제목, □ 항목이 생기면 여기에 목차가 나옵니다.';
      outlineBody.append(p);
      return;
    }
    const cur = currentOutline(items, editor.state.selection.from);
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `nav-item lv${it.level} ${it.kind}${i === cur ? ' on' : ''}`;
      b.textContent = it.text.length > 60 ? `${it.text.slice(0, 60)}…` : it.text;
      b.title = it.kind === 'item' ? it.text : `${it.text}\n끌어서 장 순서를 바꿀 수 있습니다`;
      b.draggable = true;
      b.addEventListener('click', () => goToOutline(editor, it));
      b.addEventListener('dragstart', (e) => {
        dragFrom = i;
        e.dataTransfer?.setData('text/plain', String(i));
        b.classList.add('dragging');
      });
      b.addEventListener('dragend', () => b.classList.remove('dragging'));
      b.addEventListener('dragover', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        b.classList.add('drop');
      });
      b.addEventListener('dragleave', () => b.classList.remove('drop'));
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        b.classList.remove('drop');
        if (dragFrom >= 0 && dragFrom !== i) moveSection(editor, dragFrom, i);
        dragFrom = -1;
      });
      outlineBody.append(b);
    });
    // 맨 끝으로 옮기는 자리
    const tail = document.createElement('div');
    tail.className = 'nav-tail';
    tail.addEventListener('dragover', (e) => {
      if (dragFrom >= 0) e.preventDefault();
    });
    tail.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom >= 0) moveSection(editor, dragFrom, items.length);
      dragFrom = -1;
    });
    outlineBody.append(tail);
  }

  function renderResults() {
    const s = findState(editor);
    resultBody.replaceChildren();
    const head = document.createElement('p');
    head.className = 'nav-empty';
    if (!s.query) head.textContent = 'Ctrl+F 로 찾을 말을 넣으면 찾은 곳이 모두 여기에 나옵니다.';
    else head.textContent = s.matches.length ? `"${s.query}" ${s.matches.length}곳` : `"${s.query}" 없음`;
    resultBody.append(head);
    const doc = editor.state.doc;
    s.matches.slice(0, 300).forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `nav-hit${i === s.current ? ' on' : ''}`;
      const before = doc.textBetween(Math.max(0, m.from - 18), m.from, ' ', ' ').replace(/\s+/g, ' ');
      const after = doc.textBetween(m.to, Math.min(doc.content.size, m.to + 24), ' ', ' ').replace(/\s+/g, ' ');
      const mark = document.createElement('mark');
      mark.textContent = doc.textBetween(m.from, m.to);
      b.append(document.createTextNode(`…${before}`), mark, document.createTextNode(`${after}…`));
      b.addEventListener('click', () => {
        goToMatch(editor, i);
        els.onFindMove?.();
      });
      resultBody.append(b);
    });
  }

  let pending = 0;
  function render() {
    if (pane.hidden) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => (tab === 'outline' ? renderOutline() : renderResults()));
  }

  function show(on: boolean) {
    pane.hidden = !on;
    toggle.classList.toggle('on', on);
    try {
      localStorage.setItem(STORE, on ? '1' : '0');
    } catch {
      /* 저장 못 해도 동작에는 지장 없음 */
    }
    render();
  }
  toggle.addEventListener('click', () => show(!!pane.hidden));
  editor.on('update', render);
  editor.on('selectionUpdate', render);
  // 찾기 결과는 찾을 말이 바뀔 때(문서는 그대로)도 새로 그린다
  editor.on('transaction', () => {
    if (tab === 'results') render();
  });
  let saved = '0';
  try {
    saved = localStorage.getItem(STORE) ?? '0';
  } catch {
    /* 무시 */
  }
  show(saved === '1');
  return { show, setTab, render };
}
