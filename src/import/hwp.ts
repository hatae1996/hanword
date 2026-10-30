/**
 * 구형 한글(.hwp, HWP 5.0) 열기 — 오픈소스 rhwp(@rhwp/core, MIT)가 .hwp 를 HWPX 로 바꾸고,
 * 그 HWPX 를 우리 HWPX 읽기(readHwpx)로 읽는다. 저장은 .hwpx/.docx 로만 한다 (.hwp 쓰기는 하지 않음).
 *
 * rhwp 는 12MB 짜리 WebAssembly 라서 .hwp 를 열 때만 불러온다.
 *  - 앱: dist/rhwp/ 의 파일(public/rhwp 에서 복사)을 가져온다
 *  - 명령줄·테스트: node_modules/@rhwp/core
 */
import { readHwpx, type ImportResult } from './hwpx';

export interface RhwpModule {
  HwpDocument: new (data: Uint8Array) => { exportHwpx(): Uint8Array; free?: () => void };
}

/** HWP 5.0 파일인가 (OLE 복합 문서 머리: D0 CF 11 E0 A1 B1 1A E1) */
export function isHwp5(b: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return sig.every((v, i) => b[i] === v);
}

export async function readHwp(bytes: Uint8Array, title: string, load: () => Promise<RhwpModule>): Promise<ImportResult> {
  if (!isHwp5(bytes)) throw new Error('HWP 5.0 문서가 아닙니다 (한글 97 등 아주 오래된 형식은 한글에서 .hwpx 로 저장한 뒤 여세요)');
  const mod = await load();
  let hwpx: Uint8Array;
  try {
    const d = new mod.HwpDocument(bytes);
    hwpx = d.exportHwpx();
    d.free?.();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/password|암호|encrypt/i.test(msg)) throw new Error('암호가 걸린 .hwp 입니다. 한글에서 암호를 풀고 .hwpx 로 저장한 뒤 여세요.');
    throw new Error(`.hwp 를 읽지 못했습니다 (${msg.slice(0, 120)}). 한글에서 "다른 이름으로 저장 → HWPX" 후 여세요.`);
  }
  const r = await readHwpx(hwpx, title);
  // 바뀐 형식 안내: 저장은 HWPX (원본 .hwp 는 그대로 둔다)
  return { doc: r.doc, warnings: r.warnings };
}

let browserModule: Promise<RhwpModule> | null = null;
/** 앱(브라우저·Tauri): 같은 폴더의 rhwp/ 에서 불러온다 */
export function loadRhwpBrowser(): Promise<RhwpModule> {
  browserModule ??= (async () => {
    const base = new URL('rhwp/', location.href);
    const mod = await import(/* @vite-ignore */ new URL('rhwp.js', base).href);
    await mod.default({ module_or_path: new URL('rhwp_bg.wasm', base) });
    return mod as RhwpModule;
  })().catch((e) => {
    browserModule = null;
    throw new Error(`.hwp 읽기 도구를 불러오지 못했습니다 (데스크톱 앱에서 여세요): ${(e as Error)?.message ?? e}`);
  });
  return browserModule;
}
