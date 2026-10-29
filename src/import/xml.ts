/**
 * XML 도우미 — 브라우저(DOMParser)와 Node(@xmldom/xmldom 을 globalThis.DOMParser 로 주입)에서 똑같이 동작하도록
 * querySelector 같은 브라우저 전용 API 는 쓰지 않고 childNodes / localName 만 사용한다.
 */
export type El = Element;

export function parseXml(text: string): Document {
  const P = (globalThis as any).DOMParser as typeof DOMParser | undefined;
  if (!P) throw new Error('XML 파서를 찾을 수 없습니다');
  const doc = new P().parseFromString(text.replace(/^﻿/, ''), 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('XML 형식이 올바르지 않습니다');
  return doc;
}

/** 직계 자식 요소 (localName 필터) */
export function kids(el: Node | null | undefined, name?: string): El[] {
  const out: El[] = [];
  if (!el) return out;
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as El;
    if (n.nodeType === 1 && (!name || n.localName === name)) out.push(n);
  }
  return out;
}

export function kid(el: Node | null | undefined, name: string): El | undefined {
  return kids(el, name)[0];
}

/** 경로를 따라 내려가기: path(el, 'tcPr', 'gridSpan') */
export function path(el: Node | null | undefined, ...names: string[]): El | undefined {
  let cur: Node | undefined | null = el;
  for (const n of names) cur = kid(cur, n);
  return (cur as El) ?? undefined;
}

/** 모든 하위 요소 (깊이 우선) */
export function descendants(el: Node | null | undefined, name: string): El[] {
  const out: El[] = [];
  const walk = (n: Node) => {
    for (const c of kids(n)) {
      if (c.localName === name) out.push(c);
      walk(c);
    }
  };
  if (el) walk(el);
  return out;
}

/** 접두어가 무엇이든 이름으로 속성 읽기 (w:val, val 모두) */
export function attr(el: El | undefined | null, name: string): string | null {
  if (!el) return null;
  const direct = el.getAttribute(name);
  if (direct !== null && direct !== '') return direct;
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if ((a.localName || a.name.split(':').pop()) === name) return a.value;
  }
  return null;
}

export function num(v: string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}
