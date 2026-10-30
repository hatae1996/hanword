/**
 * 한글 쪽 수 회귀 검사 — 실제 한글이 센 쪽 수(hangul-pages.json)와,
 * 오픈소스 rhwp 가 같은 샘플(verify/out/*.hwpx)을 쪽 나눔한 결과를 비교한다.
 * 2026-10-30 실제 한글 결과와 rhwp 가 20종 모두 같았으므로, 한글 없이도 쪽 수가 바뀌는 변경을 잡는다.
 *   npm run samples && npm run pages
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRhwpNode } from '../src/import/hwpNode';

const want: Record<string, number | string> = JSON.parse(readFileSync(join(import.meta.dirname, 'hangul-pages.json'), 'utf8'));
const mod: any = await loadRhwpNode();
let bad = 0;
for (const [stem, pages] of Object.entries(want)) {
  if (stem.startsWith('_')) continue;
  let got: number | string;
  try {
    const d = new mod.HwpDocument(readFileSync(join(import.meta.dirname, 'out', `${stem}.hwpx`)));
    got = d.pageCount();
    d.free?.();
  } catch (e) {
    got = `오류 ${(e as Error).message}`;
  }
  const ok = got === pages;
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} ${stem}: 한글 ${pages}쪽 / rhwp ${got}쪽`);
}
console.log(bad ? `\n${bad}개 쪽 수 다름` : `\n한글 쪽 수 ${Object.keys(want).length - 1}종 모두 같음`);
process.exit(bad ? 1 : 0);
