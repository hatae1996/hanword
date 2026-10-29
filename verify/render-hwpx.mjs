/**
 * 한글 없이 HWPX 레이아웃을 눈으로 확인하는 스크립트.
 * 독립 오픈소스 렌더러 rhwp(@rhwp/core, MIT)로 verify/out/*.hwpx 를 SVG 로 그린다.
 * 결과 SVG 는 브라우저로 열면 PC 에 설치된 글꼴로 보인다.
 *
 * 실행: npm run render:hwpx
 * (참고용 렌더러일 뿐, 최종 판정은 verify/windows/verify-in-office.ps1 로 실제 한글에서 한다)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('@rhwp/core/package.json'));
const mod = await import(join(pkgDir, 'rhwp.js'));

// Node 에는 canvas 가 없어 글자 폭 측정을 근사치로 대신한다 (한글·한자 전각, 그 외 반각)
const ctx = {
  font: '10px sans-serif',
  measureText(text) {
    const px = parseFloat(String(this.font).match(/([\d.]+)px/)?.[1] ?? '10');
    let w = 0;
    for (const c of text) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(c) ? px : px * 0.55;
    return { width: w };
  },
};
globalThis.document ??= { createElement: () => ({ getContext: () => ctx }) };
globalThis.OffscreenCanvas ??= class { getContext() { return ctx; } };
mod.initSync({ module: readFileSync(join(pkgDir, 'rhwp_bg.wasm')) });

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
const svgDir = join(outDir, 'render');
mkdirSync(svgDir, { recursive: true });

for (const f of readdirSync(outDir).filter((n) => n.endsWith('.hwpx'))) {
  try {
    const doc = new mod.HwpDocument(new Uint8Array(readFileSync(join(outDir, f))));
    const pages = doc.pageCount();
    for (let i = 0; i < pages; i++) writeFileSync(join(svgDir, f.replace(/\.hwpx$/, `.hwpx-p${i + 1}.svg`)), doc.renderPageSvg(i));
    console.log(`✓ ${f}: ${pages}쪽`);
  } catch (e) {
    console.log(`✗ ${f}: ${e?.message ?? e}`);
    process.exitCode = 1;
  }
}
