/**
 * 그림 도우미 — 브라우저·Node(AI 변환기) 양쪽에서 DOM 없이 동작한다.
 * 그림은 원본 바이트를 그대로 보관한다 (base64). 한글·Word 둘 다 PNG·JPEG·GIF·BMP 를 그대로 넣을 수 있다.
 */
import type { ImageRun } from './types';

export type ImageMime = ImageRun['mime'];
export const IMAGE_EXT: Record<ImageMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

/** 파일 앞부분으로 형식 알아내기 (모르는 형식이면 null) */
export function sniffMime(b: Uint8Array): ImageMime | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return null;
}

/** 그림의 픽셀 크기 (PNG IHDR · JPEG SOF · GIF · BMP 머리 정보) */
export function pixelSize(b: Uint8Array, mime: ImageMime): { w: number; h: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const i32le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
  try {
    if (mime === 'image/png') return { w: u32be(16), h: u32be(20) };
    if (mime === 'image/gif') return { w: u16le(6), h: u16le(8) };
    if (mime === 'image/bmp') return { w: Math.abs(i32le(18)), h: Math.abs(i32le(22)) };
    // JPEG: SOFn 표식을 찾는다
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: u16be(i + 7), h: u16be(i + 5) };
      i += 2 + len;
    }
  } catch {
    /* 깨진 머리 정보 */
  }
  return null;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toDataUrl = (img: Pick<ImageRun, 'mime' | 'data'>) => `data:${img.mime};base64,${img.data}`;

export function parseDataUrl(src: string): { mime: ImageMime; data: string } | null {
  const m = String(src).match(/^data:(image\/(?:png|jpe?g|gif|bmp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = (m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase()) as ImageMime;
  return { mime, data: m[2].replace(/\s+/g, '') };
}

/** 픽셀 크기 → 표시 크기(mm). 96dpi 기준, maxWidthMm 를 넘으면 비율대로 줄인다 */
export function fitSize(px: { w: number; h: number } | null, maxWidthMm: number, maxHeightMm = 240): { widthMm: number; heightMm: number } {
  const w = px && px.w > 0 ? (px.w * 25.4) / 96 : maxWidthMm;
  const h = px && px.h > 0 ? (px.h * 25.4) / 96 : maxWidthMm * 0.75;
  const k = Math.min(1, maxWidthMm / w, maxHeightMm / h);
  return { widthMm: Math.round(w * k * 10) / 10, heightMm: Math.round(h * k * 10) / 10 };
}

/** 바이트 → 그림 조각 (모르는 형식이면 null) */
export function imageFromBytes(bytes: Uint8Array, maxWidthMm: number, maxHeightMm?: number): ImageRun | null {
  const mime = sniffMime(bytes);
  if (!mime) return null;
  return { kind: 'image', mime, data: bytesToBase64(bytes), ...fitSize(pixelSize(bytes, mime), maxWidthMm, maxHeightMm) };
}

/** 비교용 짧은 지문 (그림 바이트가 같은지) */
export function imageHash(data: string): string {
  let h = 5381;
  for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) | 0;
  return `${data.length}:${(h >>> 0).toString(16)}`;
}
