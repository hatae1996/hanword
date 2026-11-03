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
        },
        view(view) {
          const box = host(view);
          handle = document.createElement('div');
          handle.className = 'hw-handle';
          handle.setAttribute('aria-hidden', 'true');
          handle.innerHTML = '<span class="grip" title=""끌어서 옮기기 · 눌러서 메뉴 (아래 항목·내용과 함께 움직입니다)">⋮⋮</span>';
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
          // ── 끌어 옮기기: 마우스를 직접 따라간다 (데스크톱 앱은 HTML 끌어다 놓기를 파일 열기에 쓰므로) ──
          //   누르고 4px 넘게 움직이면 끌기 시작 → 블록 미리보기가 마우스를 따라오고, 놓을 자리에 선.
          //   화면 위·아래 끝에 가면 저절로 스크롤, Esc 로 취소. 움직이지 않고 떼면 = 누름 → 블록 메뉴
          let press: { x: number; y: number; id: number } | null = null;
          let ghost: HTMLElement | null = null;
          let lastY = 0;
          let scrollRaf = 0;
          const scroller = () => (box.closest('.desk') as HTMLElement | null) ?? document.scrollingElement as HTMLElement;
          const showLine = (clientY: number) => {
            if (!dragging || !line) return;
            const b = boundaryAt(view, clientY);
            dropAt = b.at;
            const inside = b.at >= dragging.start && b.at <= dragging.end;
            line.style.display = inside ? 'none' : 'block';
            line.style.top = `${b.top}px`;
            if (inside) dropAt = -1;
          };
          const autoScroll = () => {
            scrollRaf = 0;
            if (!dragging) return;
            const sc = scroller();
            const r = sc.getBoundingClientRect();
            const edge = 56;
            const v = lastY < r.top + edge ? -(r.top + edge - lastY) : lastY > r.bottom - edge ? lastY - (r.bottom - edge) : 0;
            if (v) {
              sc.scrollTop += Math.max(-24, Math.min(24, v / 2));
              showLine(lastY);
            }
            scrollRaf = requestAnimationFrame(autoScroll);
          };
          const startDrag = (e: PointerEvent) => {
            if (current < 0) return;
            dragging = groupAt(view.state.doc, current);
            setHighlight(view, { from: dragging.from, to: dragging.to });
            box.classList.add('hw-dragging');
            document.body.classList.add('hw-dragging-body');
            // 미리보기: 묶음 첫 블록 모양을 작게 (여러 블록이면 "외 n개")
            ghost = document.createElement('div');
            ghost.className = 'hw-drag-ghost';
            const first = view.nodeDOM(dragging.from) as HTMLElement | null;
            const z = zoomOf(box);
            if (first?.nodeType === 1) {
              const c = first.cloneNode(true) as HTMLElement;
              c.querySelectorAll('.hw-pagegap, .hw-handle').forEach((x) => x.remove());
              c.style.margin = '0';
              ghost.style.width = `${Math.min(520, first.getBoundingClientRect().width)}px`;
              ghost.style.zoom = String(z);
              ghost.append(c);
            }
            const n = dragging.end - dragging.start;
            if (n > 1) {
              const tag = document.createElement('span');
              tag.className = 'hw-drag-count';
              tag.textContent = `+ 아래 ${n - 1}개 함께`;
              ghost.append(tag);
            }
            document.body.append(ghost);
            moveGhost(e);
            showLine(e.clientY);
            if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScroll);
          };
          const moveGhost = (e: PointerEvent) => {
            if (!ghost) return;
            ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 12}px)`;
          };
          const endDrag = (drop: boolean) => {
            const g = dragging;
            dragging = null;
            press = null;
            cancelAnimationFrame(scrollRaf);
            scrollRaf = 0;
            ghost?.remove();
            ghost = null;
            if (line) line.style.display = 'none';
            box.classList.remove('hw-dragging');
            document.body.classList.remove('hw-dragging-body');
            setHighlight(view, null);
            if (drop && g && dropAt >= 0) {
              moveGroupTo(editor, g, dropAt);
              view.focus(); // 바로 Ctrl+Z 로 되돌릴 수 있게
            }
            dropAt = -1;
          };
          grip.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || current < 0) return;
            e.preventDefault(); // 글자 선택·커서 이동 막기
            press = { x: e.clientX, y: e.clientY, id: e.pointerId };
            grip.setPointerCapture(e.pointerId);
          });
          grip.addEventListener('pointermove', (e) => {
            if (!press || e.pointerId !== press.id) return;
            lastY = e.clientY;
            if (!dragging) {
              if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) return;
              startDrag(e);
              return;
            }
            moveGhost(e);
            showLine(e.clientY);
          });
          grip.addEventListener('pointerup', (e) => {
            if (!press || e.pointerId !== press.id) return;
            if (dragging) return endDrag(true);
            press = null;
            if (current >= 0) opts.onMenu(groupAt(view.state.doc, current), grip); // 그냥 누름 = 메뉴
          });
          grip.addEventListener('pointercancel', () => endDrag(false));
          grip.addEventListener('lostpointercapture', () => dragging && endDrag(true));
          const escKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && dragging) {
              e.preventDefault();
              e.stopPropagation();
              endDrag(false);
            }
          };
          window.addEventListener('keydown', escKey, true);
          // 손잡이는 글 왼쪽 여백에 있어서, 글에서 손잡이로 가는 길(여백)에서도 사라지면 안 된다.
          // → 종이 전체에서 마우스를 보고, 글 영역 + 왼쪽 여백 64px 안이면 그 줄의 손잡이를 띄운다.
          //   밖으로 나가도 바로 지우지 않고 잠깐 기다린다 (손이 살짝 빗나가도 잡을 수 있게)
          let hideTimer = 0;
          const hideSoon = () => {
            if (!hideTimer) hideTimer = window.setTimeout(() => ((hideTimer = 0), hide()), 400);
          };
          const keep = () => {
            clearTimeout(hideTimer);
            hideTimer = 0;
          };
          const move = (e: MouseEvent) => {
            // 끄는 중·글자를 드래그해 고르는 중에는 손잡이를 옮기지 않는다
            if (dragging || e.buttons || !editor.isEditable) return;
            if (handle!.contains(e.target as Node)) return keep();
            const d = view.dom.getBoundingClientRect();
            const inZone = e.clientX >= d.left - 64 && e.clientX <= d.right + 8 && e.clientY >= d.top && e.clientY <= d.bottom;
            if (!inZone) return hideSoon();
            keep();
            // 손잡이와 같은 높이(손잡이 쪽 여백)에서는 그 블록을 그대로 둔다
            if (current >= 0 && e.clientX < d.left) {
              const hr = handle!.getBoundingClientRect();
              if (e.clientY >= hr.top - 6 && e.clientY <= hr.bottom + 6) return;
            }
            const pos = view.posAtCoords({ left: Math.max(d.left + 4, Math.min(d.right - 4, e.clientX)), top: e.clientY });
            if (!pos) return;
            const i = topIndexAt(view.state.doc, pos.inside >= 0 ? pos.inside : pos.pos);
            if (i !== current) place(view, i);
          };
          const leave = (e: MouseEvent) => {
            const to = e.relatedTarget as Node | null;
            if (to && handle!.contains(to)) return;
            hideSoon();
          };
          box.addEventListener('mousemove', move);
          box.addEventListener('mouseleave', leave);
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc) && current >= 0) {
                if (current >= v.state.doc.childCount) hide();
                else place(v, current);
              }
            },
            destroy() {
              window.removeEventListener('keydown', escKey, true);
              box.removeEventListener('mousemove', move);
              box.removeEventListener('mouseleave', leave);
              clearTimeout(hideTimer);
              handle?.remove();
              line?.remove();
            },
          };
        },
      }),
    ];
  },
});
