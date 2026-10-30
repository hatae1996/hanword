/**
 * 블록 편집 — 노션처럼 문단·표를 블록으로 다룬다.
 *  - 왼쪽 손잡이(⋮⋮): 끌어서 옮기기, 누르면 블록 메뉴(옮기기·복제·지우기·바꾸기)
 *  - 묶음: □ 항목을 옮기면 그 아래 ○ - · 항목·단위·표·※ 가 함께, 장 제목(Ⅰ.)을 옮기면 그 장 전체가 함께 간다
 *  - Alt+Shift+↑/↓ (Word 와 같은 키): 커서가 있는 묶음을 위·아래 묶음과 자리 바꾸기
 */
import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { CHAPTER_RE, LEVEL_OF, indentAttrs } from './gaejo';

// ── 묶음 계산 (문서 맨 위 단계의 블록 번호로) ─────────────────
const MARK_RE = /^\s*([□■○●※\-◦▪·∙])\s/;

/** 블록의 단계: 장 제목 0, 절 제목 1, □ 2, ○ ※ 3, - 4, · 5, 그 밖 = null (혼자 움직임) */
export function blockLevel(n: PMNode): number | null {
  if (n.type.name === 'heading') return (n.attrs.level as number) - 1;
  if (n.type.name !== 'paragraph') return null;
  const t = n.textContent;
  if (CHAPTER_RE.test(t)) return 0;
  const m = t.match(MARK_RE);
  if (m && LEVEL_OF[m[1]] !== undefined) return 2 + LEVEL_OF[m[1]];
  return null;
}

export interface Group {
  /** 맨 위 단계 블록 번호 [start, end) */
  start: number;
  end: number;
  from: number;
  to: number;
}

function offsets(doc: PMNode): number[] {
  const out: number[] = [];
  doc.forEach((_n, off) => out.push(off));
  out.push(doc.content.size);
  return out;
}

/** i 번째 블록이 거느리는 묶음 */
export function groupAt(doc: PMNode, i: number): Group {
  const off = offsets(doc);
  const n = doc.childCount;
  const lv = blockLevel(doc.child(i));
  let end = i + 1;
  if (lv !== null) {
    while (end < n) {
      const l = blockLevel(doc.child(end));
      if (l !== null && l <= lv) break;
      end++;
    }
    // 묶음 끝의 빈 문단은 따라가지 않는다 (간격으로 둔 빈 줄)
    while (end > i + 1 && doc.child(end - 1).type.name === 'paragraph' && !doc.child(end - 1).textContent.trim() && doc.child(end - 1).childCount === 0) end--;
  }
  return { start: i, end, from: off[i], to: off[end] };
}

/** 문서 위치 → 그 위치를 담은 맨 위 단계 블록 번호 */
export function topIndexAt(doc: PMNode, pos: number): number {
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  return $p.depth === 0 ? Math.min($p.index(0), doc.childCount - 1) : $p.index(0);
}

/** 묶음을 블록 경계 at(맨 위 단계 블록 번호 앞)으로 옮긴다 */
export function moveGroupTo(editor: Editor, g: Group, at: number): boolean {
  const { state } = editor;
  if (at >= g.start && at <= g.end) return false;
  const off = offsets(state.doc);
  const target = off[at];
  const slice = state.doc.slice(g.from, g.to);
  const tr = closeHistory(state.tr).delete(g.from, g.to);
  const ins = tr.mapping.map(target, target > g.from ? -1 : 1);
  tr.insert(ins, slice.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(ins + 1, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 위·아래로 한 칸 (dir -1 위, +1 아래).
 *  위: 같은 단계의 앞 항목(그 아래 내용까지) 앞으로. 앞에 윗단계(□ 위의 장 제목 등)가 있으면 그 앞으로
 *  아래: 같은 단계의 다음 항목(그 아래 내용까지) 뒤로. 다음이 윗단계면 그 바로 뒤(다음 장의 첫 항목)로
 */
export function moveGroupBy(editor: Editor, dir: -1 | 1): boolean {
  const { doc, selection } = editor.state;
  const i = topIndexAt(doc, selection.from);
  const g = groupAt(doc, i);
  const lv = blockLevel(doc.child(g.start));
  if (dir < 0) {
    if (g.start === 0) return false;
    let prev = g.start - 1;
    if (lv !== null) {
      prev = 0;
      for (let k = g.start - 1; k >= 0; k--) {
        const lk = blockLevel(doc.child(k));
        if (lk !== null && lk <= lv) {
          prev = k;
          break;
        }
      }
    }
    return moveGroupTo(editor, g, prev);
  }
  if (g.end >= doc.childCount) return false;
  const ln = blockLevel(doc.child(g.end));
  const target = lv !== null && ln !== null && ln === lv ? groupAt(doc, g.end).end : g.end + 1;
  return moveGroupTo(editor, g, target);
}

export function duplicateGroup(editor: Editor, g: Group) {
  const { state } = editor;
  const slice = state.doc.slice(g.from, g.to);
  const tr = closeHistory(state.tr).insert(g.to, slice.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(g.to + 1, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
}

export function deleteGroup(editor: Editor, g: Group) {
  const { state } = editor;
  let tr = closeHistory(state.tr).delete(g.from, g.to);
  if (!tr.doc.childCount) tr = tr.insert(0, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(g.from, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
}

export type TurnInto = 'body' | 'h1' | 'h2' | 'h3' | '□' | '○' | '-' | '·' | '※';

/** 블록 하나를 다른 종류로 (본문·제목·개조식 항목) */
export function turnInto(editor: Editor, i: number, kind: TurnInto) {
  const { state } = editor;
  const off = offsets(state.doc);
  const node = state.doc.child(i);
  if (!node.isTextblock) return;
  const pos = off[i];
  const tr = closeHistory(state.tr);
  // 원래 기호 떼기
  const m = node.textContent.match(MARK_RE);
  if (m && node.type.name === 'paragraph') tr.delete(pos + 1, pos + 1 + m[0].length);
  const { textAlign } = node.attrs;
  if (kind === 'body') tr.setNodeMarkup(pos, state.schema.nodes.paragraph, { ...node.attrs, indentLeft: null, firstLine: null });
  else if (kind === 'h1' || kind === 'h2' || kind === 'h3')
    tr.setNodeMarkup(pos, state.schema.nodes.heading, { level: Number(kind[1]), textAlign });
  else {
    tr.setNodeMarkup(pos, state.schema.nodes.paragraph, { ...(node.type.name === 'paragraph' ? node.attrs : { textAlign }), ...indentAttrs(LEVEL_OF[kind]) });
    const marks = node.firstChild?.marks ?? [];
    tr.insert(pos + 1, state.schema.text(`${kind} `, marks));
  }
  editor.view.dispatch(tr);
}

// ── 손잡이 · 끌어 옮기기 ──────────────────────────────────
const key = new PluginKey<{ hl: { from: number; to: number } | null }>('hanwordBlocks');

export interface BlockOptions {
  /** 손잡이를 눌렀을 때 (블록 메뉴) */
  onMenu: (g: Group, anchor: HTMLElement) => void;
}

function zoomOf(el: HTMLElement): number {
  const z = parseFloat(getComputedStyle(el).zoom || '1');
  return Number.isFinite(z) && z > 0 ? z : 1;
}

export const BlockHandles = Extension.create<BlockOptions>({
  name: 'blockHandles',
  addOptions() {
    return { onMenu: () => {} };
  },
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowUp': () => moveGroupBy(this.editor, -1),
      'Alt-Shift-ArrowDown': () => moveGroupBy(this.editor, 1),
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const opts = this.options;
    let handle: HTMLElement | null = null;
    let line: HTMLElement | null = null;
    let current = -1; // 손잡이가 가리키는 블록 번호
    let dragging: Group | null = null;
    let dropAt = -1;

    const host = (view: EditorView) => (view.dom.parentElement?.closest('.page') as HTMLElement | null) ?? view.dom.parentElement!;
    const setHighlight = (view: EditorView, hl: { from: number; to: number } | null) => view.dispatch(view.state.tr.setMeta(key, { hl }));
    const hide = () => {
      if (handle) handle.style.display = 'none';
      current = -1;
    };
    const place = (view: EditorView, i: number) => {
      if (!handle) return;
      const off = offsets(view.state.doc);
      const dom = view.nodeDOM(off[i]) as HTMLElement | null;
      const el = dom?.nodeType === 1 ? dom : null;
      if (!el) return hide();
      const box = host(view);
      const z = zoomOf(box);
      const r = el.getBoundingClientRect();
      const hr = box.getBoundingClientRect();
      // 첫 줄 높이 가운데에
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      handle.style.display = 'flex';
      handle.style.top = `${(r.top - hr.top) / z + Math.max(0, (Math.min(lh, r.height / z) - 22) / 2)}px`;
      handle.style.left = `${(view.dom.getBoundingClientRect().left - hr.left) / z - 30}px`;
      current = i;
    };
    const boundaryAt = (view: EditorView, y: number): { at: number; top: number } => {
      const doc = view.state.doc;
      const off = offsets(doc);
      const box = host(view);
      const z = zoomOf(box);
      const hr = box.getBoundingClientRect();
      for (let i = 0; i < doc.childCount; i++) {
        const el = view.nodeDOM(off[i]) as HTMLElement | null;
        if (!el || el.nodeType !== 1) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) return { at: i, top: (r.top - hr.top) / z - 2 };
      }
      const last = view.nodeDOM(off[doc.childCount - 1]) as HTMLElement | null;
      const r = last?.getBoundingClientRect();
      return { at: doc.childCount, top: r ? (r.bottom - hr.top) / z + 1 : 0 };
    };

    return [
      new Plugin({
        key,
        state: {
          init: (): { hl: { from: number; to: number } | null } => ({ hl: null }),
          apply: (tr, v): { hl: { from: number; to: number } | null } => {
            const m = tr.getMeta(key);
            if (m) return m;
            if (!v.hl || !tr.docChanged) return v;
            return { hl: { from: tr.mapping.map(v.hl.from), to: tr.mapping.map(v.hl.to) } };
          },
        },
        props: {
          decorations(state: EditorState) {
            const hl = key.getState(state)?.hl;
            if (!hl) return null;
            const decos: Decoration[] = [];
            state.doc.forEach((n, off) => {
              if (off >= hl.from && off + n.nodeSize <= hl.to) decos.push(Decoration.node(off, off + n.nodeSize, { class: 'hw-block-hl' }));
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleDOMEvents: {
            mousemove(view, e) {
              // 끄는 중·글자를 드래그해 고르는 중에는 손잡이를 옮기지 않는다
              if (dragging || e.buttons || !editor.isEditable) return false;
              const pos = view.posAtCoords({ left: Math.max(view.dom.getBoundingClientRect().left + 4, e.clientX), top: e.clientY });
              if (!pos) return false;
              const i = topIndexAt(view.state.doc, pos.inside >= 0 ? pos.inside : pos.pos);
              if (i !== current) place(view, i);
              return false;
            },
            dragover(view, e) {
              if (!dragging) return false;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              const b = boundaryAt(view, e.clientY);
              dropAt = b.at;
              if (line) {
                const inside = b.at > dragging.start && b.at < dragging.end;
                line.style.display = inside ? 'none' : 'block';
                line.style.top = `${b.top}px`;
              }
              return true;
            },
            drop(view, e) {
              if (!dragging) return false;
              e.preventDefault();
              const g = dragging;
              dragging = null;
              if (line) line.style.display = 'none';
              setHighlight(view, null);
              if (dropAt >= 0) moveGroupTo(editor, g, dropAt);
              view.focus(); // 바로 Ctrl+Z 로 되돌릴 수 있게
              return true;
            },
          },
        },
        view(view) {
          const box = host(view);
          handle = document.createElement('div');
          handle.className = 'hw-handle';
          handle.setAttribute('aria-hidden', 'true');
          handle.innerHTML = '<span class="grip" draggable="true" title="끌어서 옮기기 · 눌러서 메뉴 (아래 항목·내용과 함께 움직입니다)">⋮⋮</span>';
          handle.style.display = 'none';
          line = document.createElement('div');
          line.className = 'hw-drop-line';
          line.style.display = 'none';
          box.append(handle, line);
          const grip = handle.querySelector('.grip') as HTMLElement;
          grip.addEventListener('mouseenter', () => {
            if (current >= 0) {
              const g = groupAt(view.state.doc, current);
              setHighlight(view, { from: g.from, to: g.to });
            }
          });
          grip.addEventListener('mouseleave', () => !dragging && setHighlight(view, null));
          grip.addEventListener('click', (e) => {
            e.preventDefault();
            if (current < 0) return;
            opts.onMenu(groupAt(view.state.doc, current), grip);
          });
          grip.addEventListener('dragstart', (e) => {
            if (current < 0) return;
            dragging = groupAt(view.state.doc, current);
            setHighlight(view, { from: dragging.from, to: dragging.to });
            e.dataTransfer?.setData('text/plain', view.state.doc.textBetween(dragging.from, dragging.to, '\n'));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            const el = view.nodeDOM(dragging.from) as HTMLElement | null;
            if (el && e.dataTransfer) e.dataTransfer.setDragImage(el, 10, 10);
          });
          grip.addEventListener('dragend', () => {
            dragging = null;
            if (line) line.style.display = 'none';
            setHighlight(view, null);
          });
          const leave = (e: MouseEvent) => {
            const to = e.relatedTarget as Node | null;
            if (to && (handle!.contains(to) || view.dom.contains(to))) return;
            hide();
          };
          view.dom.addEventListener('mouseleave', leave);
          handle.addEventListener('mouseleave', leave);
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc) && current >= 0) {
                if (current >= v.state.doc.childCount) hide();
                else place(v, current);
              }
            },
            destroy() {
              view.dom.removeEventListener('mouseleave', leave);
              handle?.remove();
              line?.remove();
            },
          };
        },
      }),
    ];
  },
});
