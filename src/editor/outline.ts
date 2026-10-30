/**
 * 탐색 창 — Word 탐색 창 · 한글 개요 보기처럼 문서의 뼈대를 옆에 보여 준다.
 *
 *  - 항목: 장 제목(Ⅰ. Ⅱ. 또는 제목 1), 제목 2·3, □ 1단계 항목
 *  - 누르면 그 자리로 이동, 장/제목을 끌어다 놓으면 그 아래 내용까지 통째로 옮겨진다 (Word)
 *  - 찾기 결과 탭: 찾은 곳을 앞뒤 글자와 함께 전부 보여 준다 (한글 2024 탐색 작업 창)
 */
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { CHAPTER_RE, markerOf } from './gaejo';

export interface OutlineItem {
  /** 문서 맨 위 블록의 시작 위치 */
  pos: number;
  /** 0 = 장, 1 = 절(제목 2 · □), 2 = 제목 3 */
  level: number;
  text: string;
  kind: 'chapter' | 'heading' | 'item';
}

function itemOf(node: PMNode): Omit<OutlineItem, 'pos'> | null {
  const text = node.textContent.trim();
  if (!text) return null;
  if (node.type.name === 'heading') {
    const l = Math.min(3, node.attrs.level ?? 1);
    return { level: l - 1, text, kind: l === 1 ? 'chapter' : 'heading' };
  }
  if (node.type.name !== 'paragraph') return null;
  if (CHAPTER_RE.test(text)) return { level: 0, text, kind: 'chapter' };
  const m = markerOf(node);
  if (m && m.level === 0 && m.hasText) return { level: 1, text, kind: 'item' };
  return null;
}

export function buildOutline(doc: PMNode): OutlineItem[] {
  const out: OutlineItem[] = [];
  doc.forEach((node, offset) => {
    const it = itemOf(node);
    if (it) out.push({ ...it, pos: offset });
  });
  return out;
}

/** 항목이 차지하는 구간: 그 항목부터 같은 단계 이상의 다음 항목 앞까지 */
export function sectionRange(doc: PMNode, items: OutlineItem[], i: number): { from: number; to: number } {
  const it = items[i];
  let to = doc.content.size;
  for (let j = i + 1; j < items.length; j++) {
    if (items[j].level <= it.level) {
      to = items[j].pos;
      break;
    }
  }
  return { from: it.pos, to };
}

export function goToOutline(editor: Editor, item: OutlineItem) {
  const { state, view } = editor;
  const pos = Math.min(item.pos + 1, state.doc.content.size);
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos))).scrollIntoView());
  view.focus();
  const dom = view.nodeDOM(item.pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'auto' });
}

/**
 * 구간 옮기기: from 번째 항목의 구간을 to 번째 항목 앞으로 (to = items.length 이면 맨 끝).
 * 자기 구간 안으로는 옮기지 않는다.
 */
export function moveSection(editor: Editor, from: number, to: number): boolean {
  const { state } = editor;
  const items = buildOutline(state.doc);
  if (!items[from]) return false;
  const src = sectionRange(state.doc, items, from);
  const target = to >= items.length ? state.doc.content.size : items[to].pos;
  if (target >= src.from && target <= src.to) return false;
  const slice = state.doc.slice(src.from, src.to);
  let tr = state.tr.delete(src.from, src.to);
  const at = tr.mapping.map(target, target > src.from ? -1 : 1);
  tr = tr.insert(at, slice.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** 커서가 들어 있는 항목 번호 */
export function currentOutline(items: OutlineItem[], cursor: number): number {
  let cur = -1;
  for (let i = 0; i < items.length; i++) if (items[i].pos <= cursor) cur = i;
  return cur;
}
