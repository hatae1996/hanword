/**
 * 왕복 테스트 — "저장한 파일을 다시 열면 원래 문서와 똑같은가"
 *
 *   편집기 문서 ─저장→ HWPX ─열기→ 문서   (같아야 함)
 *   편집기 문서 ─저장→ DOCX ─열기→ 문서   (같아야 함)
 *   HWPX 에서 연 문서 ─저장→ DOCX ─열기→ 문서   (형식을 바꿔도 같아야 함)
 *   열린 문서 → 편집기 → 문서   (편집기에 띄웠다 저장해도 같아야 함)
 *
 * 실행: npm run roundtrip
 */
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tiptapToDoc } from '../src/model/fromTiptap';
import { docToTiptap } from '../src/model/toTiptap';
import { canonical } from '../src/model/normalize';
import { docToHwpx } from '../src/export/hwpx';
import { docToDocx } from '../src/export/docx';
import { readHwpx } from '../src/import/hwpx';
import { readDocx } from '../src/import/docx';
import type { Doc } from '../src/model/types';
import { SAMPLES } from './samples';

(globalThis as any).DOMParser = DOMParser;
const here = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
function same(label: string, a: Doc, b: Doc) {
  const ca = canonical(a);
  const cb = canonical(b);
  if (ca === cb) {
    pass++;
    console.log(`✅ ${label}`);
    return;
  }
  fail++;
  const la = ca.split('\n');
  const lb = cb.split('\n');
  const i = la.findIndex((l, k) => l !== lb[k]);
  console.log(`❌ ${label}\n   ${i}행 차이\n   기대: ${la.slice(Math.max(0, i - 2), i + 3).join(' ').trim()}\n   실제: ${lb.slice(Math.max(0, i - 2), i + 3).join(' ').trim()}`);
}
function ok(label: string, cond: boolean, detail = '') {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

for (const [name, json] of Object.entries(SAMPLES)) {
  const d0 = tiptapToDoc(json as any, name);

  const h = await readHwpx(await docToHwpx(d0), name);
  same(`${name}: 저장(HWPX) → 열기`, d0, h.doc);
  ok(`${name}: HWPX 열기 경고 없음`, h.warnings.length === 0, h.warnings.join(', '));

  const x = await readDocx(await docToDocx(d0), name);
  same(`${name}: 저장(DOCX) → 열기`, d0, x.doc);
  ok(`${name}: DOCX 열기 경고 없음`, x.warnings.length === 0, x.warnings.join(', '));

  same(`${name}: HWPX 로 연 문서 → DOCX 저장 → 열기`, d0, (await readDocx(await docToDocx(h.doc))).doc);
  same(`${name}: DOCX 로 연 문서 → HWPX 저장 → 열기`, d0, (await readHwpx(await docToHwpx(x.doc))).doc);

  same(`${name}: 연 문서 → 편집기 → 저장용 문서`, d0, tiptapToDoc(docToTiptap(h.doc) as any, name, h.doc.page));
}

// ── 다른 프로그램이 만든 파일 ──────────────────────────────
const blank = await readHwpx(readFileSync(join(here, '..', 'templates', 'blank.hwpx')));
ok('한글이 만든 빈 문서 열기', blank.doc.blocks.length === 1 && Math.round(blank.doc.page.widthMm) === 210, JSON.stringify(blank.doc.page));

const extra = join(here, 'fixtures');
for (const f of ['word-styles.docx', 'python-hwpx.hwpx']) {
  const p = join(extra, f);
  if (!existsSync(p)) continue;
  const r = f.endsWith('.docx') ? await readDocx(readFileSync(p)) : await readHwpx(readFileSync(p));
  const text = r.doc.blocks.map((b) => (b.type === 'paragraph' ? b.inlines.map((i) => (i.kind === 'text' ? i.text : '\n')).join('') : '[표]')).join(' | ');
  ok(`외부 파일 열기: ${f}`, r.doc.blocks.length > 1, '');
  console.log(`   ↳ ${text.slice(0, 200)}${r.warnings.length ? `  (건너뜀: ${r.warnings.join(', ')})` : ''}`);
  // 외부 파일도 "열기 → 저장 → 열기" 는 안정적이어야 한다
  const again = f.endsWith('.docx') ? await readDocx(await docToDocx(r.doc)) : await readHwpx(await docToHwpx(r.doc));
  same(`외부 파일 재저장 안정성: ${f}`, r.doc, again.doc);
}

console.log(`\n${pass}/${pass + fail} 통과${fail ? `, ${fail} 실패` : ''}`);
process.exit(fail ? 1 : 0);
