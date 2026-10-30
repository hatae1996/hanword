/**
 * 그림 넣기 · 사진대지 (편집기 쪽)
 *  - 한글·Word 가 넣을 수 있는 PNG·JPEG·GIF·BMP 는 그대로, 그 밖(WebP 등)은 PNG 로 바꿔 넣는다
 *  - 아주 큰 사진(긴 변 2400px 넘음)은 2400px JPEG 로 줄여 넣는다 (문서가 수십 MB 가 되지 않게)
 *  - 크기는 본문 폭(표 안이면 칸 폭)에 맞춘다
 */
import type { Editor } from '@tiptap/core';
import { CellSelection, TableMap, cellAround } from '@tiptap/pm/tables';
import { bytesToBase64, fitSize, pixelSize, sniffMime, type ImageMime } from '../model/image';
import { formDialog } from './dialog';

export interface Picked {
  name: string;
  bytes: Uint8Array;
}
export interface Prepared {
  mime: ImageMime;
  data: string;
  px: { w: number; h: number };
}

const MAX_SIDE = 2400;

async function reencode(bytes: Uint8Array, maxSide: number, asJpeg: boolean): Promise<Prepared | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (asJpeg) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, asJpeg ? 'image/jpeg' : 'image/png', 0.88));
    if (!blob) return null;
    const out = new Uint8Array(await blob.arrayBuffer());
    return { mime: asJpeg ? 'image/jpeg' : 'image/png', data: bytesToBase64(out), px: { w, h } };
  } catch {
    return null;
  }
}

/** 파일 바이트 → 문서에 넣을 그림 (못 읽는 형식이면 null) */
export async function prepareImage(bytes: Uint8Array): Promise<Prepared | null> {
  const mime = sniffMime(bytes);
  if (!mime) return reencode(bytes, MAX_SIDE, false); // WebP 등 → PNG
  const px = pixelSize(bytes, mime);
  if (px && Math.max(px.w, px.h) > MAX_SIDE) return (await reencode(bytes, MAX_SIDE, mime === 'image/jpeg')) ?? { mime, data: bytesToBase64(bytes), px };
  return { mime, data: bytesToBase64(bytes), px: px ?? { w: 400, h: 300 } };
}

/** 커서 자리에 넣을 그림의 최대 폭 (mm): 표 칸이면 칸 폭, 아니면 본문 폭 */
export function availableWidthMm(editor: Editor, contentMm: number): number {
  const sel = editor.state.selection;
  const $cell = sel instanceof CellSelection ? sel.$anchorCell : cellAround(sel.$from);
  if (!$cell) return contentMm;
  const table = $cell.node(-1);
  const cell = editor.state.doc.nodeAt($cell.pos);
  const map = TableMap.get(table);
  const cw = cell?.attrs.colwidth as number[] | null;
  const span = cell?.attrs.colspan ?? 1;
  const mm = cw?.every((v) => v > 0) ? (cw.reduce((a, b) => a + b, 0) * 25.4) / 96 : (contentMm * span) / map.width;
  return Math.max(10, mm - 4); // 칸 안 여백
}

export function imageAttrs(p: Prepared, maxWidthMm: number, maxHeightMm = 200) {
  const size = fitSize(p.px, maxWidthMm, maxHeightMm);
  return { src: `data:${p.mime};base64,${p.data}`, widthMm: size.widthMm, heightMm: size.heightMm };
}

/** 두 번 누른 그림의 크기 바꾸기 (비율 유지) */
export async function resizeImageDialog(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return;
  const w0 = node.attrs.widthMm ?? 50;
  const h0 = node.attrs.heightMm ?? 37.5;
  const r = await formDialog({
    title: '그림 크기',
    fields: [
      { key: 'w', label: '너비', type: 'number', value: w0, suffix: 'mm', min: 5, max: 400, step: 1 },
      { key: 'h', label: '높이', type: 'number', value: h0, suffix: 'mm', min: 5, max: 400, step: 1 },
      { key: 'keep', label: '가로세로 비율 유지 (너비 기준)', type: 'check', value: true },
    ],
    okText: '바꾸기',
  });
  if (!r) return;
  const w = Math.max(5, Number(r.w) || w0);
  const h = r.keep ? (w * h0) / w0 : Math.max(5, Number(r.h) || h0);
  editor.chain().focus().command(({ tr }) => {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, widthMm: Math.round(w * 10) / 10, heightMm: Math.round(h * 10) / 10 });
    return true;
  }).run();
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * 사진대지: 사진을 표에 칸마다 하나씩, 아래 줄에 설명 칸.
 * 공공기관 사진대지 관례: 2칸(가로 2장), 사진 아래 "사진 1. ○○"
 */
export async function photoSheetHtml(pics: Prepared[], contentMm: number): Promise<string | null> {
  const r = await formDialog({
    title: `사진대지 — 사진 ${pics.length}장`,
    fields: [
      { key: 'cols', label: '한 줄에', type: 'select', value: '2', options: [{ value: '1', label: '1장' }, { value: '2', label: '2장' }, { value: '3', label: '3장' }] },
      { key: 'height', label: '사진 높이 최대', type: 'number', value: 65, suffix: 'mm', min: 20, max: 200, step: 5 },
      { key: 'caption', label: '사진 아래 설명 칸 ("사진 1. ○○")', type: 'check', value: true },
    ],
    okText: '만들기',
  });
  if (!r) return null;
  const cols = Math.max(1, Math.min(3, Number(r.cols) || 2));
  const cellMm = contentMm / cols - 4;
  const rows: string[] = [];
  for (let i = 0; i < pics.length; i += cols) {
    const group = pics.slice(i, i + cols);
    const photo = Array.from({ length: cols }, (_, k) => {
      const p = group[k];
      if (!p) return '<td><p></p></td>';
      const a = imageAttrs(p, cellMm, Number(r.height) || 65);
      return `<td><p style="text-align:center"><img src="${esc(a.src)}" style="width:${a.widthMm}mm; height:${a.heightMm}mm"></p></td>`;
    }).join('');
    rows.push(`<tr>${photo}</tr>`);
    if (r.caption) {
      const cap = Array.from({ length: cols }, (_, k) =>
        group[k] ? `<td><p style="text-align:center"><span style="font-size:11pt">사진 ${i + k + 1}. ○○</span></p></td>` : '<td><p></p></td>',
      ).join('');
      rows.push(`<tr>${cap}</tr>`);
    }
  }
  return `<table>${rows.join('')}</table><p></p>`;
}
