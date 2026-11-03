/**
 * 한글 기준 쪽 나눔 — 지금 문서를 HWPX 로 저장해 rhwp(한글 조판을 따라 만든 오픈소스 엔진)로 쪽을 나눈 뒤,
 * 각 쪽이 시작하는 자리(문단 처음 / 문단 안 몇째 글자 / 표 몇째 줄)를 편집기 위치로 돌려준다.
 * 2026-10-30 실제 한글과 샘플 20종의 쪽 수를 비교해 모두 같았다 (verify/hangul-pages.json).
 *
 * 위치 맞추기:
 *  - rhwp 문단 번호 = HWPX 의 hp:p 순서 = 저장용 Doc 의 블록 순서 (표 하나 = 문단 하나)
 *  - 편집기 문서에서 같은 순서의 "단위"(문단·표, 목록은 항목 문단마다)를 만들어 짝짓는다
 *  - rhwp 글자 위치에는 컨트롤(구역 설정·메모·그림 …)이 8칸씩 들어 있어서, 컨트롤 자리를 빼고 셈한다
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Doc } from '../model/types';
import { docToHwpx } from '../export/hwpx';
import type { RhwpModule } from '../import/hwp';

export interface PageStart {
  /** 1부터 — 이 자리에서 이 쪽이 시작한다 (2쪽부터) */
  page: number;
  /** block: 블록 앞 / inline: 문단 안 글자 앞 / row: 표의 이 줄부터 */
  kind: 'block' | 'inline' | 'row';
  /** 편집기 문서 위치 (block·inline: 그 자리, row: 줄 노드 시작) */
  pos: number;
}
export interface Pagination {
  pages: number;
  starts: PageStart[];
}

interface Unit {
  kind: 'text' | 'table';
  /** 노드 시작 위치 */
  pos: number;
  node: PMNode;
  /** 목록 항목: 저장할 때 앞에 붙는 "• " 길이 */
  prefix: number;
}

/** 편집기 문서 → 저장용 Doc 블록과 같은 순서의 단위들 (fromTiptap.convertBlock 과 같은 규칙) */
export function unitsOf(doc: PMNode): Unit[] {
  const out: Unit[] = [];
  const list = (node: PMNode, pos: number) => {
    node.forEach((item, off) => {
      item.forEach((child, off2) => {
        const p = pos + 1 + off + 1 + off2;
        if (child.type.name === 'bulletList' || child.type.name === 'orderedList') return list(child, p);
        if (child.isTextblock) {
          out.push({ kind: 'text', pos: p, node: child, prefix: 0 });
        }
      });
    });
  };
  const block = (node: PMNode, pos: number) => {
    const t = node.type.name;
    if (t === 'paragraph' || t === 'heading') out.push({ kind: 'text', pos, node, prefix: 0 });
    else if (t === 'table') out.push({ kind: 'table', pos, node, prefix: 0 });
    else if (t === 'bulletList' || t === 'orderedList') list(node, pos);
    else node.forEach((c, off) => block(c, pos + 1 + off));
  };
  doc.forEach((n, off) => block(n, off));
  return out;
}
/** rhwp 의 문단 안 위치(컨트롤 8칸 포함) → 글자 위치 */
function textOffset(units: number, ctrls: number[]): number {
  const sorted = [...ctrls].sort((a, b) => a - b);
  let k = 0;
  // k + 8 × (k 이하 자리의 컨트롤 수) ≤ units 인 가장 큰 k
  for (;;) {
    const at = (x: number) => x + 8 * sorted.filter((c) => c <= x).length;
    if (at(k + 1) <= units) k++;
    else return k;
  }
}

/** 문단 안 글자 위치 → 편집기 위치 (그림은 글자가 아니고 컨트롤, 줄바꿈은 한 글자) */
function pmOffset(node: PMNode, text: number): number {
  let rem = text;
  let off = 0;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c.isText) {
      const len = c.text!.length;
      if (rem <= len) return off + rem;
      rem -= len;
      off += len;
    } else if (c.type.name === 'hardBreak') {
      if (rem === 0) return off;
      rem -= 1;
      off += 1;
    } else off += c.nodeSize; // 그림 등
  }
  return off;
}

type RhwpDoc = InstanceType<RhwpModule['HwpDocument']> & Record<string, (...a: any[]) => any>;

/** 한글 기준으로 쪽을 나눈다. pmDoc 은 doc 을 만든 바로 그 편집기 문서여야 한다 */
export async function paginate(pmDoc: PMNode, doc: Doc, mod: RhwpModule): Promise<Pagination> {
  const bytes = await docToHwpx(doc);
  const d = new mod.HwpDocument(bytes) as RhwpDoc;
  try {
    const pages: number = d.pageCount();
    const units = unitsOf(pmDoc);
    // 목록 항목: 저장할 때 글 앞에 붙는 "• " "1. " 길이 = 저장용 문단 글자 수 - 편집기 문단 글자 수
    units.forEach((u, i) => {
      const b = doc.blocks[i];
      if (u.kind !== 'text' || b?.type !== 'paragraph') return;
      const docLen = b.inlines.reduce((n, x) => n + (x.kind === 'text' ? x.text.length : x.kind === 'break' ? 1 : 0), 0);
      let pmLen = 0;
      u.node.forEach((c) => (pmLen += c.isText ? c.text!.length : c.type.name === 'hardBreak' ? 1 : 0));
      u.prefix = Math.max(0, docLen - pmLen);
    });
    // 쪽마다 후보(본문 첫 자리, 표 줄)를 모아 문서에서 가장 앞선 것을 그 쪽의 시작으로
    const cand = new Map<number, PageStart[]>();
    const add = (s: PageStart) => cand.set(s.page, [...(cand.get(s.page) ?? []), s]);
    const caret: { list: number; para: number; pos: number }[] = JSON.parse(d.getPageCaretStarts());
    caret.forEach((c, page) => {
      if (page === 0 || c.list !== 0) return;
      const u = units[c.para];
      if (!u) return;
      if (u.kind === 'table') {
        add({ page: page + 1, kind: 'block', pos: u.pos });
        return;
      }
      let ctrls: number[] = [];
      try {
        ctrls = JSON.parse(d.getControlTextPositions(0, c.para));
      } catch {
        /* 컨트롤 없음 */
      }
      const k = Math.max(0, textOffset(c.pos, ctrls) - u.prefix);
      const off = pmOffset(u.node, k);
      add(off <= 0 ? { page: page + 1, kind: 'block', pos: u.pos } : { page: page + 1, kind: 'inline', pos: u.pos + 1 + off });
    });
    // 여러 쪽에 걸친 표: 줄마다 첫 칸이 몇째 쪽에 놓였는지
    units.forEach((u, para) => {
      if (u.kind !== 'table') return;
      let ctrls: number[] = [];
      try {
        ctrls = JSON.parse(d.getControlTextPositions(0, para));
      } catch {
        /* 없음 */
      }
      const ctrlIdx = Math.max(0, ctrls.length - 1);
      let cellIdx = 0;
      let prevPage = -1;
      u.node.forEach((row, rowOff) => {
        let pg = -1;
        try {
          pg = JSON.parse(d.getCursorRectByPath(0, para, JSON.stringify([{ controlIndex: ctrlIdx, cellIndex: cellIdx, cellParaIndex: 0 }]), 0)).pageIndex;
        } catch {
          pg = -1;
        }
        if (pg >= 0 && prevPage >= 0 && pg > prevPage) add({ page: pg + 1, kind: 'row', pos: u.pos + 1 + rowOff });
        if (pg >= 0) prevPage = pg;
        cellIdx += row.childCount;
      });
    });
    const starts = [...cand.values()].map((list) => list.sort((a, b) => a.pos - b.pos)[0]).sort((a, b) => a.page - b.page);
    return { pages, starts };
  } finally {
    d.free?.();
  }
}
