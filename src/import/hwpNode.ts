/**
 * 명령줄·테스트용 rhwp 불러오기 (Node). canvas 가 없으므로 글자 폭은 근사치로 잰다 (변환에는 영향 없음).
 * 찾는 순서: node_modules/@rhwp/core → 변환기(hanword.mjs) 옆의 rhwp/ 폴더
 */
import type { RhwpModule } from './hwp';

export async function loadRhwpNode(nearFile?: string): Promise<RhwpModule> {
  const { createRequire } = await import('node:module');
  const { readFileSync, existsSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  let dir: string | undefined;
  try {
    dir = dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json'));
  } catch {
    // 릴리스에서 받은 경우: hanword.mjs 옆의 rhwp/ 폴더, 또는 바로 옆의 rhwp.js · rhwp_bg.wasm
    for (const near of nearFile ? [join(dirname(nearFile), 'rhwp'), dirname(nearFile)] : []) {
      if (existsSync(join(near, 'rhwp_bg.wasm')) && existsSync(join(near, 'rhwp.js'))) {
        dir = near;
        break;
      }
    }
  }
  if (!dir) throw new Error('구형 .hwp 를 읽으려면 rhwp 가 필요합니다: 변환기 옆에 rhwp 폴더(rhwp.js, rhwp_bg.wasm)를 두거나 npm i @rhwp/core');
  const ctx = {
    font: '10px sans-serif',
    measureText(text: string) {
      const px = parseFloat(String(this.font).match(/([\d.]+)px/)?.[1] ?? '10');
      let w = 0;
      for (const c of text) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(c) ? px : px * 0.55;
      return { width: w };
    },
  };
  const g = globalThis as any;
  g.document ??= { createElement: () => ({ getContext: () => ctx }) };
  g.OffscreenCanvas ??= class {
    getContext() {
      return ctx;
    }
  };
  const mod = await import(pathToFileURL(join(dir, 'rhwp.js')).href);
  mod.initSync({ module: readFileSync(join(dir, 'rhwp_bg.wasm')) });
  return mod as RhwpModule;
}
