/**
 * 감성 테마 장식 — 커버 그림, 장 제목 아이콘, 장 사이 구분선, 상자(말풍선) 아이콘.
 * 모두 "그림"이라 한글·Word 파일에 그대로 들어간다. 그림마다 표식(HanWordDeco=…)이 있어서
 * 저장했다 다시 열어도 장식인 줄 알아보고, 테마를 바꾸면 깨끗이 걷어 내고 새 장식으로 바꾼다.
 * 사용자가 고른 커버(cover:custom)는 테마를 바꿔도 남긴다.
 */
import type { Block, Doc, ImageRun, Inline, Paragraph, Table } from '../model/types';
import { DECO_ASSETS } from './decoAssets';

export type DecoSet = 'sky' | 'night' | 'blossom' | 'forest';

const MARK = 'HanWordDeco';

/** 그림에 든 장식 표식 (cover:sky, icon:night, divider:forest, box:blossom, cover:custom …) */
export function decoKind(img: ImageRun): string | null {
  try {
    const head = atob(img.data.slice(0, 400).replace(/[^A-Za-z0-9+/]/g, '').slice(0, 396));
    const at = head.indexOf(MARK);
    if (at < 0) return null;
    // 표식 = "종류;" (끝의 ; 까지 있어야 — 뒤에 붙는 PNG 검사값 글자를 잘못 읽지 않게)
    const m = head.slice(at + MARK.length + 1).match(/^([a-z]+:[a-z]+);/);
    return m && (m[1] === 'cover:custom' || m[1] in DECO_ASSETS) ? m[1] : null;
  } catch {
    return null;
  }
}
const isDeco = (i: Inline): i is ImageRun => i.kind === 'image' && decoKind(i) !== null;
const isCustomCover = (i: Inline) => i.kind === 'image' && decoKind(i) === 'cover:custom';

function img(key: string, widthMm: number): ImageRun {
  const a = DECO_ASSETS[key];
  return { kind: 'image', mime: a.mime, data: a.data, widthMm: round(widthMm), heightMm: round(widthMm / a.aspect) };
}
const round = (x: number) => Math.round(x * 10) / 10;

/** 장식 그림 하나만 있는 문단 (커버·구분선) */
function decoPara(i: ImageRun, spaceBeforePt = 0, spaceAfterPt = 0): Paragraph {
  return {
    type: 'paragraph',
    role: 'body',
    style: { align: 'center', indentLeftMm: 0, firstLineMm: 0, spaceBeforePt, spaceAfterPt, lineSpacingPct: 100 },
    inlines: [i],
  };
}

/** 문단 앞 장식 아이콘과 그 뒤 띄어쓰기 한 칸을 뗀다 */
function stripIcon(p: Paragraph): Paragraph {
  if (!p.inlines.some(isDeco)) return p;
  const out: Inline[] = [];
  let dropSpace = false;
  for (const i of p.inlines) {
    if (isDeco(i)) {
      dropSpace = true;
      continue;
    }
    if (dropSpace && i.kind === 'text') {
      const t = i.text.replace(/^ /, '');
      dropSpace = false;
      if (t) out.push({ ...i, text: t });
      continue;
    }
    dropSpace = false;
    out.push(i);
  }
  return { ...p, inlines: out };
}

/** 장식만 있는 문단인가 (커버·구분선) */
const onlyDeco = (p: Paragraph) => p.inlines.some(isDeco) && p.inlines.every((i) => isDeco(i) || (i.kind === 'text' && !i.text.trim()));

/** 문서에서 테마 장식을 모두 걷어 낸다. 사용자 커버는 따로 돌려준다 */
export function stripDeco(doc: Doc): { doc: Doc; customCover?: ImageRun } {
  let customCover: ImageRun | undefined;
  const blocks: Block[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'paragraph') {
      if (onlyDeco(b)) {
        const c = b.inlines.find(isCustomCover);
        if (c && !customCover) customCover = c as ImageRun;
        continue;
      }
      blocks.push(stripIcon(b));
    } else {
      blocks.push({ ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, blocks: c.blocks.map(stripIcon) }))) } as Table);
    }
  }
  return { doc: { ...doc, blocks }, customCover };
}

/** 문서에 이미 장식이 있는가 (디자인 패널 표시용) */
export function hasDeco(doc: Doc): boolean {
  return doc.blocks.some((b) => (b.type === 'paragraph' ? b.inlines.some(isDeco) : b.rows.some((r) => r.some((c) => c.blocks.some((p) => p.inlines.some(isDeco))))));
}

export interface DecoPlan {
  /** 장 제목 블록 번호 */
  chapters: number[];
  /** 상자(1칸 표) 블록 번호 */
  boxes: number[];
  /** 장 제목 글자 크기 (아이콘 크기) */
  chapterPt: number;
  boxPt: number;
}

/** 테마 장식을 넣는다 (역할을 입힌 뒤에) */
export function addDeco(doc: Doc, set: DecoSet | undefined, plan: DecoPlan, customCover?: ImageRun): Doc {
  const pg = doc.page;
  const contentW = pg.widthMm - pg.marginLeftMm - pg.marginRightMm;
  const out: Block[] = [];
  const chapterSet = new Set(plan.chapters);
  const boxSet = new Set(plan.boxes);
  const iconMm = (pt: number) => round(pt * 0.3528 * 1.05);
  let chapterNo = 0;
  doc.blocks.forEach((b, i) => {
    if (set && chapterSet.has(i) && b.type === 'paragraph') {
      if (chapterNo > 0) out.push(decoPara(img(`divider:${set}`, contentW), 10, 0));
      chapterNo++;
      out.push(withIcon(b, img(`icon:${set}`, iconMm(plan.chapterPt))));
      return;
    }
    if (set && boxSet.has(i) && b.type === 'table') {
      const t = b as Table;
      const cell = t.rows[0][0];
      const [first, ...rest] = cell.blocks;
      out.push({ ...t, rows: [[{ ...cell, blocks: [withIcon(first, img(`box:${set}`, iconMm(plan.boxPt))), ...rest] }]] });
      return;
    }
    out.push(b);
  });
  // 커버: 맨 위 (사용자 커버가 있으면 그것, 없으면 테마 커버)
  const cover = customCover ? { ...customCover, widthMm: round(contentW), heightMm: round((contentW * customCover.heightMm) / customCover.widthMm) } : set ? img(`cover:${set}`, contentW) : undefined;
  if (cover) out.unshift(decoPara(cover, 0, 8));
  return { ...doc, blocks: out };
}

function withIcon(p: Paragraph, icon: ImageRun): Paragraph {
  const firstText = p.inlines.find((x) => x.kind === 'text');
  const space: Inline = firstText && firstText.kind === 'text' ? { ...firstText, text: ' ' } : { kind: 'text', text: ' ' };
  return { ...p, inlines: [icon, space, ...p.inlines] };
}

/** 커버만 바꾸거나(cover) 빼기(null) — 나머지 디자인은 그대로 */
export function replaceCover(doc: Doc, cover: ImageRun | null): Doc {
  const isCover = (b: Block) => b.type === 'paragraph' && onlyDeco(b) && b.inlines.some((i) => i.kind === 'image' && (decoKind(i) ?? '').startsWith('cover:'));
  const blocks = doc.blocks.filter((b) => !isCover(b));
  if (cover) {
    const pg = doc.page;
    const w = round(pg.widthMm - pg.marginLeftMm - pg.marginRightMm);
    blocks.unshift(decoPara({ ...cover, widthMm: w, heightMm: round((w * cover.heightMm) / cover.widthMm) }, 0, 8));
  }
  return { ...doc, blocks };
}
export const hasCover = (doc: Doc) => {
  const b = doc.blocks[0];
  return !!b && b.type === 'paragraph' && b.inlines.some((i) => i.kind === 'image' && (decoKind(i) ?? '').startsWith('cover:'));
};

/** 사용자 그림을 커버로 (표식을 넣은 PNG 로 다시 만든다 — 브라우저에서만) */
export async function makeCustomCover(file: Blob, contentWmm: number): Promise<ImageRun> {
  const bmp = await createImageBitmap(file);
  // 커버 비율 5:1 로 가운데를 잘라 낸다 (Notion 커버처럼)
  const W = 1500, H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * scale, h = bmp.height * scale;
  g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.88));
  const jpg = new Uint8Array(await blob.arrayBuffer());
  const body = new TextEncoder().encode(`${MARK}=cover:custom;`);
  const seg = new Uint8Array(4 + body.length);
  seg.set([0xff, 0xfe, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  seg.set(body, 4);
  const all = new Uint8Array(jpg.length + seg.length);
  all.set(jpg.subarray(0, 2));
  all.set(seg, 2);
  all.set(jpg.subarray(2), 2 + seg.length);
  let bin = '';
  for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode(...all.subarray(i, i + 0x8000));
  return { kind: 'image', mime: 'image/jpeg', data: btoa(bin), widthMm: round(contentWmm), heightMm: round(contentWmm / 5) };
}
