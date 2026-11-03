/**
 * 쪽 보기 — 편집 화면을 한글처럼 종이 한 장 한 장으로 나눠 보여 준다.
 *
 *  - 쪽이 시작하는 자리(layout/pagination.ts 가 한글 기준으로 계산)에 "쪽 경계"를 넣는다:
 *    앞 쪽의 남은 자리 + 아래 여백(꼬리말·쪽 번호) + 종이 사이 틈 + 다음 쪽 위 여백(머리말)
 *  - 문단 중간에서 쪽이 바뀌면 그 글자 앞에서, 표가 여러 쪽에 걸치면 그 줄 위에 표시
 *  - 남은 자리 높이는 화면에 그려진 뒤 재서 맞춘다 → 쪽마다 종이 한 장 높이
 *  - 계산기(rhwp)를 못 쓰면 화면 높이로 어림해 블록 단위로 나눈다
 *  - 인쇄할 때도 같은 자리에서 쪽을 바꾼다
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { PageStart, Pagination } from '../layout/pagination';
import type { PageNumber, PageSetup } from '../model/types';

export interface PageLook {
  page: PageSetup;
  /** 머리말·꼬리말 글자: [왼쪽, 가운데, 오른쪽] */
  header?: [string, string, string];
  footer?: [string, string, string];
  pageNumber?: PageNumber;
}

export interface PagesOptions {
  look: () => PageLook;
  /** 쪽 나눔이 바뀔 때 (쪽 수, 출처) */
  onLayout?: (info: { pages: number; source: 'hangul' | 'estimate' }) => void;
}

interface PagesState {
  on: boolean;
  starts: PageStart[];
  pages: number;
  source: 'hangul' | 'estimate';
}

export const pagesKey = new PluginKey<PagesState>('hanwordPages');
const MM = 96 / 25.4;

/** 계산 결과를 편집기에 넣는다 (null = 화면 어림으로) */
export function setPagination(editor: Editor, p: Pagination | null) {
  editor.view.dispatch(editor.state.tr.setMeta(pagesKey, p ? { starts: p.starts, pages: p.pages, source: 'hangul' } : { starts: [], pages: 1, source: 'estimate' }).setMeta('addToHistory', false));
}
export function setPageView(editor: Editor, on: boolean) {
  editor.view.dispatch(editor.state.tr.setMeta(pagesKey, { on }).setMeta('addToHistory', false));
}
export function pagesOf(state: EditorState): PagesState | undefined {
  return pagesKey.getState(state);
}
/** 위치 pos 가 몇째 쪽인지 */
export function pageAt(state: EditorState, pos: number): number {
  const st = pagesKey.getState(state);
  let page = 1;
  for (const s of st?.starts ?? []) if (s.pos <= pos) page = Math.max(page, s.page);
  return page;
}

function slots(el: HTMLElement, text: [string, string, string] | undefined, pn: string | null, pnSlot: 'c' | 'r') {
  el.replaceChildren();
  for (const k of ['l', 'c', 'r'] as const) {
    const s = document.createElement('span');
    s.className = k;
    const base = text?.[['l', 'c', 'r'].indexOf(k)] ?? '';
    s.textContent = k === pnSlot && pn ? (base ? `${base}  ${pn}` : pn) : base;
    el.append(s);
  }
}

function gapWidget(page: number, look: PageLook): HTMLElement {
  const w = document.createElement('span');
  w.className = 'hw-pagegap';
  w.contentEditable = 'false';
  w.dataset.page = String(page);
  const fill = document.createElement('span');
  fill.className = 'pg-fill';
  const foot = document.createElement('span');
  foot.className = 'pg-foot';
  const gap = document.createElement('span');
  gap.className = 'pg-gap';
  gap.innerHTML = `<span class="pg-label">${page}쪽</span>`;
  const head = document.createElement('span');
  head.className = 'pg-head';
  const pn = look.pageNumber;
  const num = (n: number) => (pn ? (pn.dash ? `- ${n} -` : String(n)) : null);
  const slot = pn?.pos.endsWith('right') ? 'r' : 'c';
  const fRow = document.createElement('span');
  fRow.className = 'pg-hf';
  slots(fRow, look.footer, pn?.pos.startsWith('bottom') ? num(page - 1) : null, slot);
  foot.append(fRow);
  const hRow = document.createElement('span');
  hRow.className = 'pg-hf';
  slots(hRow, look.header, pn?.pos.startsWith('top') ? num(page) : null, slot);
  head.append(hRow);
  foot.classList.toggle('empty', !look.footer && !pn?.pos.startsWith('bottom'));
  head.classList.toggle('empty', !look.header && !pn?.pos.startsWith('top'));
  w.append(fill, foot, gap, head);
  return w;
}

function endWidget(): HTMLElement {
  const w = document.createElement('div');
  w.className = 'hw-pageend';
  w.contentEditable = 'false';
  return w;
}

/** el 의 .page 안 세로 위치 (확대·축소와 무관한 CSS px) */
function topIn(el: HTMLElement, page: HTMLElement): number {
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== page; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
  return y;
}
function leftIn(el: HTMLElement, page: HTMLElement): number {
  let x = 0;
  for (let e: HTMLElement | null = el; e && e !== page; e = e.offsetParent as HTMLElement | null) x += e.offsetLeft;
  return x;
}

export const Pages = Extension.create<PagesOptions>({
  name: 'pages',
  addOptions() {
    return { look: () => ({ page: { widthMm: 210, heightMm: 297, marginTopMm: 20, marginBottomMm: 15, marginLeftMm: 30, marginRightMm: 30, headerMm: 15, footerMm: 15 } }) };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    let lookKey = '';
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ on: true, starts: [], pages: 1, source: 'estimate' }),
          apply(tr, v) {
            const m = tr.getMeta(pagesKey) as Partial<PagesState> | undefined;
            let next = v;
            if (tr.docChanged && v.starts.length) {
              next = { ...v, starts: v.starts.map((s) => ({ ...s, pos: tr.mapping.map(s.pos, s.kind === 'row' ? 1 : -1) })) };
            }
            if (m) next = { ...next, ...m };
            return next;
          },
        },
        props: {
          decorations(state) {
            const st = pagesKey.getState(state)!;
            if (!st.on) return null;
            const look = opts.look();
            const decos: Decoration[] = [];
            const key = JSON.stringify([look.header, look.footer, look.pageNumber]);
            for (const s of st.starts) {
              if (s.pos < 0 || s.pos > state.doc.content.size) continue;
              if (s.kind === 'row') {
                // 표가 쪽에서 나뉨: 줄 위쪽을 쪽 경계 높이만큼 띄우고, 첫 칸 안에 종이 경계를 겹쳐 그린다
                const row = state.doc.nodeAt(s.pos);
                if (row?.type.name !== 'tableRow') continue;
                decos.push(Decoration.node(s.pos, s.pos + row.nodeSize, { class: 'hw-row-pagestart', 'data-page': String(s.page), style: `--pgpad: var(--pg-row-${s.page}, 0px)` }));
                const cell = row.firstChild;
                const inner = cell?.firstChild;
                if (inner?.isTextblock)
                  decos.push(Decoration.widget(s.pos + 3, () => {
                    const w = gapWidget(s.page, look);
                    w.classList.add('in-row');
                    return w;
                  }, { side: -1, key: `pgr${s.page}:${key}`, ignoreSelection: true }));
              } else {
                decos.push(Decoration.widget(s.pos, () => gapWidget(s.page, look), { side: -1, key: `pg${s.page}:${key}`, ignoreSelection: true }));
              }
            }
            decos.push(Decoration.widget(state.doc.content.size, endWidget, { side: 1, key: 'pgend' }));
            return DecorationSet.create(state.doc, decos);
          },
        },
        view(view) {
          let raf = 0;
          let estimateTimer = 0;
          const pageEl = () => view.dom.closest('.page') as HTMLElement | null;
          const measure = () => {
            raf = 0;
            const st = pagesKey.getState(view.state)!;
            const page = pageEl();
            if (!page) return;
            page.classList.toggle('paged', st.on);
            if (!st.on) return;
            const look = opts.look();
            const p = look.page;
            const top = (p.marginTopMm + p.headerMm) * MM;
            const bottom = (p.marginBottomMm + p.footerMm) * MM;
            const contentH = p.heightMm * MM - top - bottom;
            const k = JSON.stringify(p);
            if (k !== lookKey) {
              lookKey = k;
              page.style.setProperty('--pg-w', `${p.widthMm}mm`);
              page.style.setProperty('--pg-ml', `${p.marginLeftMm}mm`);
              page.style.setProperty('--pg-mr', `${p.marginRightMm}mm`);
              page.style.setProperty('--pg-top', `${p.marginTopMm + p.headerMm}mm`);
              page.style.setProperty('--pg-bottom', `${p.marginBottomMm + p.footerMm}mm`);
              page.style.setProperty('--pg-mt', `${p.marginTopMm}mm`);
              page.style.setProperty('--pg-mb', `${p.marginBottomMm}mm`);
            }
            // 쪽 경계(위젯·표 줄)를 문서 순서대로 — 한 번 읽고(배치 한 번), 앞 경계 높이가 바뀐 만큼 밀어서 계산한 뒤 한꺼번에 쓴다
            const marks = [...view.dom.querySelectorAll<HTMLElement>('.hw-pagegap:not(.in-row), tr.hw-row-pagestart, .hw-pageend')];
            const pw = page.clientWidth;
            const read = marks.map((el) => {
              if (el.tagName === 'TR') {
                const w = el.querySelector<HTMLElement>('.hw-pagegap.in-row');
                const fill = w?.querySelector<HTMLElement>('.pg-fill') ?? null;
                const cell = w?.closest('td, th') as HTMLElement | null;
                const old = fill ? fill.offsetHeight : 0;
                return { el, kind: 'row' as const, w, fill, y: topIn(el, page), fixed: w ? w.offsetHeight - old : 0, old, x: cell ? leftIn(cell, page) + cell.clientLeft : 0 };
              }
              const end = el.classList.contains('hw-pageend');
              const fill = end ? el : (el.querySelector('.pg-fill') as HTMLElement);
              const old = fill.offsetHeight;
              return { el, kind: end ? ('end' as const) : ('gap' as const), w: el, fill, y: topIn(el, page), fixed: el.offsetHeight - old, old, x: end ? 0 : leftIn(el, page) - (parseFloat(el.style.marginLeft) || 0) };
            });
            let start = topIn(view.dom, page);
            let shift = 0; // 앞 경계들의 높이 변화 합
            const writes: (() => void)[] = [];
            for (const r of read) {
              const y = r.y + shift;
              const h = Math.max(0, contentH - (y - start));
              shift += h - r.old;
              start = y + h + r.fixed;
              const { el, w, fill } = r;
              if (r.kind === 'row') {
                const pn = el.dataset.page!;
                writes.push(() => {
                  if (w && fill) {
                    fill.style.height = `${h}px`;
                    w.style.width = `${pw}px`;
                    w.style.left = `${-r.x}px`;
                  }
                  page.style.setProperty(`--pg-row-${pn}`, `${w ? h + r.fixed : 0}px`);
                });
              } else
                writes.push(() => {
                  fill!.style.height = `${h}px`;
                  if (r.kind === 'gap') {
                    // 들여쓴 문단·목록 안이어도 종이 왼쪽 끝부터 오른쪽 끝까지
                    w!.style.width = `${pw}px`;
                    w!.style.marginLeft = `${-r.x}px`;
                  }
                });
            }
            writes.forEach((f) => f());
            opts.onLayout?.({ pages: st.source === 'hangul' ? st.pages : st.starts.length + 1, source: st.source });
            if (st.source === 'estimate') {
              clearTimeout(estimateTimer);
              estimateTimer = window.setTimeout(() => estimate(contentH), 250);
            }
          };
          // 계산기가 없을 때: 화면 높이로 어림 (블록 단위)
          const estimate = (contentH: number) => {
            const st = pagesKey.getState(view.state)!;
            if (!st.on || st.source !== 'estimate') return;
            const page = pageEl();
            if (!page) return;
            const starts: PageStart[] = [];
            let widgetsAbove = 0;
            let start = 0;
            let n = 1;
            const children = [...view.dom.children] as HTMLElement[];
            let pmPos = 0;
            const sizes: number[] = [];
            view.state.doc.forEach((node) => sizes.push(node.nodeSize));
            let bi = 0;
            for (const el of children) {
              if (el.classList.contains('hw-pageend')) continue;
              if (el.classList.contains('hw-pagegap')) {
                widgetsAbove += el.offsetHeight;
                continue;
              }
              const y = topIn(el, page) - widgetsAbove;
              if (bi === 0) start = y;
              const inner = el.querySelectorAll('.hw-pagegap');
              inner.forEach((g) => (widgetsAbove += (g as HTMLElement).offsetHeight));
              const h = el.offsetHeight - [...inner].reduce((a, g) => a + (g as HTMLElement).offsetHeight, 0);
              if (bi > 0 && y + h - start > contentH && y > start) {
                n++;
                starts.push({ page: n, kind: 'block', pos: pmPos });
                start = y;
              }
              pmPos += sizes[bi] ?? 0;
              bi++;
            }
            const same = starts.length === st.starts.length && starts.every((s, i) => s.pos === st.starts[i].pos);
            if (!same) view.dispatch(view.state.tr.setMeta(pagesKey, { starts, pages: n }).setMeta('addToHistory', false));
          };
          const schedule = () => {
            if (!raf) raf = requestAnimationFrame(measure);
          };
          schedule();
          const ro = new ResizeObserver(schedule);
          ro.observe(view.dom);
          return {
            update: schedule,
            destroy() {
              ro.disconnect();
              cancelAnimationFrame(raf);
              clearTimeout(estimateTimer);
            },
          };
        },
      }),
    ];
  },
});

export type { EditorView };
