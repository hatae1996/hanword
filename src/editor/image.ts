/**
 * 그림 — 글자처럼 취급하는 그림 하나 (한글 "글자처럼 취급", Word "텍스트 줄 안").
 * 원본 바이트를 data: 주소로 들고 있고, 크기는 mm 로 둔다 (저장기와 같은 단위).
 * 편집 화면: 그림을 두 번 누르면 크기 바꾸기.
 */
import { Node, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { cssToMm } from './paragraphFormat';
import { parseDataUrl } from '../model/image';

const mmAttr = (prop: 'width' | 'height') => ({
  default: null as number | null,
  parseHTML: (el: HTMLElement) => {
    const data = el.getAttribute(`data-${prop}-mm`);
    if (data) return Number(data);
    const st = (el.getAttribute('style') ?? '').match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))?.[1];
    const fromStyle = cssToMm(st?.trim());
    if (fromStyle) return Math.round(fromStyle * 10) / 10;
    const attr = el.getAttribute(prop);
    const px = attr && /^\d+(\.\d+)?$/.test(attr) ? Number(attr) : null;
    return px ? Math.round(((px * 25.4) / 96) * 10) / 10 : null;
  },
  renderHTML: () => ({}),
});

export interface ImageOptions {
  /** 두 번 눌렀을 때 (크기 바꾸기 창) */
  onEdit?: (pos: number) => void;
  /** 붙여넣거나 끌어다 놓은 그림 파일 */
  onFiles?: (files: File[], pos: number | null) => void;
}

export const ImageNode = Node.create<ImageOptions>({
  name: 'image',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return {};
  },
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => (parseDataUrl(el.getAttribute('src') ?? '') ? el.getAttribute('src') : null),
      },
      widthMm: mmAttr('width'),
      heightMm: mmAttr('height'),
    };
  },
  parseHTML() {
    // data: 주소 그림만 (웹 주소 그림은 파일에 넣을 수 없음)
    return [{ tag: 'img[src]', getAttrs: (el) => (parseDataUrl((el as HTMLElement).getAttribute('src') ?? '') ? null : false) }];
  },
  renderHTML({ node }) {
    const { src, widthMm, heightMm } = node.attrs;
    const style = [widthMm ? `width: ${widthMm}mm` : '', heightMm ? `height: ${heightMm}mm` : ''].filter(Boolean).join('; ');
    return ['img', { src, class: 'hw-image', ...(style ? { style } : {}), ...(widthMm ? { 'data-width-mm': widthMm } : {}), ...(heightMm ? { 'data-height-mm': heightMm } : {}) }];
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin({
        props: {
          handleDoubleClickOn(_view, pos, node) {
            if (node.type.name !== 'image') return false;
            opts.onEdit?.(pos);
            return true;
          },
          handlePaste(_view, e) {
            const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length || !opts.onFiles) return false;
            e.preventDefault();
            opts.onFiles(files, null);
            return true;
          },
          handleDrop(view, e) {
            const files = [...((e as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length || !opts.onFiles) return false;
            e.preventDefault();
            const at = view.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY });
            opts.onFiles(files, at?.pos ?? null);
            return true;
          },
        },
      }),
    ];
  },
});

/** 커서 자리(또는 pos)에 그림 넣기 */
export function insertImage(editor: Editor, img: { mime: string; data: string; widthMm: number; heightMm: number }, pos?: number | null) {
  const node = { type: 'image', attrs: { src: `data:${img.mime};base64,${img.data}`, widthMm: img.widthMm, heightMm: img.heightMm } };
  const c = editor.chain().focus();
  if (typeof pos === 'number') c.insertContentAt(pos, node);
  else c.insertContent(node);
  c.run();
}
