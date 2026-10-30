/**
 * 실행 환경별 파일 처리.
 *  - 데스크톱 앱(Tauri): Windows 파일 대화상자, 같은 파일에 덮어쓰기, 창 닫기 경고, 끌어다 놓기
 *  - 브라우저 / claude.ai: 파일 선택 창으로 열고, 다운로드로 저장 (save.ts)
 */
import { saveFile as downloadFile } from './save';

export type Format = 'hwpx' | 'docx';
export interface OpenedFile {
  name: string;
  path?: string;
  bytes: Uint8Array;
}

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const FILTERS = {
  open: [
    { name: '문서 (한글, Word, 마크다운)', extensions: ['hwpx', 'hwp', 'docx', 'md'] },
    { name: '한글 문서', extensions: ['hwpx', 'hwp'] },
    { name: 'Word 문서', extensions: ['docx'] },
    { name: 'AI 가 쓴 글 (마크다운)', extensions: ['md', 'markdown', 'txt'] },
  ],
  hwpx: [{ name: '한글 문서', extensions: ['hwpx'] }],
  docx: [{ name: 'Word 문서', extensions: ['docx'] }],
};

const tauri = () => Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/plugin-dialog')]);

export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase();

export async function readPath(path: string): Promise<OpenedFile> {
  const [{ invoke }] = await tauri();
  const buf = await invoke<ArrayBuffer>('read_file', { path });
  return { name: baseName(path), path, bytes: new Uint8Array(buf) };
}

/** 데스크톱: 파일 대화상자. 브라우저: 숨은 file input */
export async function pickFile(): Promise<OpenedFile | null> {
  if (isDesktop) {
    const [, dialog] = await tauri();
    const path = await dialog.open({ multiple: false, directory: false, filters: FILTERS.open });
    return typeof path === 'string' ? readPath(path) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hwpx,.docx,.md,.markdown,.hwp,.doc';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

/** 그림 파일 고르기 (여러 장) */
export async function pickImages(multiple = true): Promise<OpenedFile[]> {
  if (isDesktop) {
    const [, dialog] = await tauri();
    const picked = await dialog.open({ multiple, directory: false, filters: [{ name: '그림', extensions: IMAGE_EXTS }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : [];
    return Promise.all(paths.map(readPath));
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = async () => resolve(Promise.all([...(input.files ?? [])].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** 데스크톱: 저장 위치 묻기 → 경로 반환 (취소하면 null) */
export async function askSavePath(defaultName: string, format: Format): Promise<string | null> {
  const [, dialog] = await tauri();
  const path = await dialog.save({ defaultPath: `${defaultName}.${format}`, filters: FILTERS[format] });
  if (!path) return null;
  return extOf(path) === format ? path : `${path}.${format}`;
}

export async function writePath(path: string, bytes: Uint8Array): Promise<void> {
  const [{ invoke }] = await tauri();
  await invoke('write_file', bytes, { headers: { path: encodeURIComponent(path) } });
}

/** 브라우저 저장 (다운로드) */
export const download = downloadFile;

export async function confirmDialog(text: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  if (!isDesktop) return true;
  const [, dialog] = await tauri();
  return dialog.ask(text, { title: 'HanWord', kind: 'warning', okLabel, cancelLabel });
}

export async function setWindowTitle(title: string) {
  document.title = title;
  if (!isDesktop) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTitle(title).catch(() => {});
}

/** 데스크톱 앱 전용 연결: 닫기 경고, 끌어다 놓기, 실행 시 넘겨받은 파일 */
export async function wireDesktop(opts: {
  isDirty: () => boolean;
  openPath: (path: string) => void;
  /** "저장하지 않고 닫기"를 골랐을 때 (복구본 지우기) */
  onDiscard?: () => Promise<unknown>;
}): Promise<void> {
  if (!isDesktop) return;
  const [{ invoke }, dialog] = await tauri();
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  const win = getCurrentWindow();

  await win.onCloseRequested(async (event) => {
    if (!opts.isDirty()) return;
    const close = await dialog.ask('저장하지 않은 변경 내용이 있습니다.\n저장하지 않고 닫을까요?', {
      title: 'HanWord',
      kind: 'warning',
      okLabel: '저장하지 않고 닫기',
      cancelLabel: '취소',
    });
    if (!close) event.preventDefault();
    else await opts.onDiscard?.();
  });

  await getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === 'drop' && e.payload.paths.length) opts.openPath(e.payload.paths[0]);
  });

  // 탐색기에서 "연결 프로그램 → HanWord" 로 열었을 때 넘어오는 파일
  const launch = await invoke<string | null>('launch_file').catch(() => null);
  if (launch) opts.openPath(launch);
}
