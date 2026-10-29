/**
 * 파일 저장 — 실행 환경에 따라 방법이 다르다.
 *  1) 일반 브라우저 / Tauri: <a download> 로 바로 저장
 *  2) claude.ai Artifact: 페이지가 직접 내려받을 수 없어 `downloads` 기능으로 저장 확인창을 띄운다.
 *     이때 .hwpx 는 허용 확장자가 아니므로 .zip 으로 감싸서 준다.
 */
import JSZip from 'jszip';

type Downloads = { save(req: { filename: string; data: Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: string }> };
declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  hwpx: 'application/hwp+zip',
  zip: 'application/zip',
};

let downloadsPromise: Promise<Downloads | null> | null = null;
function artifactDownloads(): Promise<Downloads | null> {
  if (!window.claude?.use) return Promise.resolve(null);
  downloadsPromise ??= window.claude.use('downloads').then((d) => (d as Downloads) ?? null).catch(() => null);
  return downloadsPromise;
}

export function safeFileName(title: string): string {
  return (title.trim() || '문서').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
}

export async function saveFile(baseName: string, ext: 'docx' | 'hwpx', bytes: Uint8Array): Promise<string> {
  const downloads = await artifactDownloads();
  if (downloads) {
    let filename = `${baseName}.${ext}`;
    let data: Uint8Array = bytes;
    if (ext === 'hwpx') {
      const zip = new JSZip();
      zip.file(filename, bytes);
      data = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
      filename = `${baseName}.hwpx.zip`;
    }
    try {
      await downloads.save({ filename, data: new Blob([data as BlobPart], { type: MIME[ext === 'hwpx' ? 'zip' : ext] }) });
      return ext === 'hwpx' ? `${filename} 저장됨 — 압축을 풀면 .hwpx 파일이 나옵니다` : `${filename} 저장됨`;
    } catch (e: any) {
      if (e?.code === 'declined') return '저장을 취소했습니다';
      throw new Error(e?.message || '이 화면에서는 저장할 수 없습니다');
    }
  }
  const blob = new Blob([bytes as BlobPart], { type: MIME[ext] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `${baseName}.${ext} 저장됨`;
}
