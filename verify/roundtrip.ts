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
import { SAMPLES, SAMPLE_EXTRAS } from './samples';
import { docToMarkdown, markdownToDoc } from '../src/ai/markdown';
import { nodeGenerateJSON } from '../src/ai/node';

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

/** 편집기 JSON 에 없는 문서 단위 설정(머리말·쪽 번호)을 붙인다 — 앱의 currentDoc() 과 같음 */
const extrasOf = (d: Doc) => ({ ...(d.header ? { header: d.header } : {}), ...(d.footer ? { footer: d.footer } : {}), ...(d.pageNumber ? { pageNumber: d.pageNumber } : {}) });

for (const [name, json] of Object.entries(SAMPLES)) {
  const d0 = { ...tiptapToDoc(json as any, name), ...(SAMPLE_EXTRAS[name] ?? {}) };

  const h = await readHwpx(await docToHwpx(d0), name);
  same(`${name}: 저장(HWPX) → 열기`, d0, h.doc);
  ok(`${name}: HWPX 열기 경고 없음`, h.warnings.length === 0, h.warnings.join(', '));

  const x = await readDocx(await docToDocx(d0), name);
  same(`${name}: 저장(DOCX) → 열기`, d0, x.doc);
  ok(`${name}: DOCX 열기 경고 없음`, x.warnings.length === 0, x.warnings.join(', '));

  same(`${name}: HWPX 로 연 문서 → DOCX 저장 → 열기`, d0, (await readDocx(await docToDocx(h.doc))).doc);
  same(`${name}: DOCX 로 연 문서 → HWPX 저장 → 열기`, d0, (await readHwpx(await docToHwpx(x.doc))).doc);

  same(`${name}: 연 문서 → 편집기 → 저장용 문서`, d0, { ...tiptapToDoc(docToTiptap(h.doc) as any, name, h.doc.page), ...extrasOf(h.doc) });

  // AI 연동: 문서 → 마크다운 → 문서 (AI 가 한글 문서를 읽고 다시 쓰는 경로)
  same(`${name}: 문서 → 마크다운 → 문서`, d0, markdownToDoc(docToMarkdown(d0), nodeGenerateJSON).doc);
}

// ── AI 가 쓴 마크다운 ─────────────────────────────────────
{
  const md = readFileSync(join(here, 'fixtures', 'ai-보고서.md'), 'utf8');
  const { doc, warnings } = markdownToDoc(md, nodeGenerateJSON);
  ok('AI 보고서: 변환 경고 없음', warnings.length === 0, warnings.join(', '));
  const runs = doc.blocks.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
  ok('AI 보고서: 조사가 붙은 굵게(**한글(HWPX)**과) 적용', runs.some((r) => r.kind === 'text' && r.text === '한글(HWPX)' && r.bold));
  ok('AI 보고서: 색 글자 적용', runs.some((r) => r.kind === 'text' && r.text === '0건' && r.color === '#C00000'));
  const gaejo = doc.blocks.filter((b) => b.type === 'paragraph' && /^[□○◦※]/.test(b.inlines.map((i) => (i.kind === 'text' ? i.text : '')).join('')));
  ok('AI 보고서: 개조식 7줄 단계별 들여쓰기', gaejo.length === 7 && gaejo.every((p) => p.type === 'paragraph' && p.style.firstLineMm === -5), `${gaejo.length}줄`);
  const tables = doc.blocks.filter((b) => b.type === 'table');
  ok('AI 보고서: 표 2개 (병합 포함)', tables.length === 2 && tables[1].type === 'table' && tables[1].rows[1][0].rowspan === 2 && tables[1].rows[3][1].colspan === 2);
  same('AI 보고서: 마크다운 → 한글 저장 → 열기', doc, (await readHwpx(await docToHwpx(doc))).doc);
  same('AI 보고서: 마크다운 → Word 저장 → 열기', doc, (await readDocx(await docToDocx(doc))).doc);
  same('AI 보고서: 문서 → 마크다운 → 문서', doc, markdownToDoc(docToMarkdown(doc), nodeGenerateJSON).doc);
  // Windows 메모장 형식(CRLF 줄바꿈 + BOM)으로 저장된 글도 똑같이 읽혀야 한다
  const crlf = markdownToDoc('\uFEFF' + md.replace(/\r?\n/g, '\r\n'), nodeGenerateJSON);
  ok('AI 보고서: Windows 줄바꿈(CRLF·BOM)도 경고 없음', crlf.warnings.length === 0, crlf.warnings.join(', '));
  same('AI 보고서: Windows 줄바꿈(CRLF·BOM)도 같은 문서', doc, crlf.doc);
}

// ── 공문 보고서 모양 (글꼴·자간·칸 테두리·공문 표) ─────────────
{
  const md = readFileSync(join(here, 'fixtures', '공문-보고서.md'), 'utf8');
  const { doc, warnings } = markdownToDoc(md, nodeGenerateJSON);
  ok('공문 보고서: 변환 경고 없음', warnings.length === 0, warnings.join(', '));
  const tables = doc.blocks.filter((b): b is Extract<typeof b, { type: 'table' }> => b.type === 'table');
  const title = tables[0].rows[0][0];
  ok('공문 보고서: 제목 상자 위아래 선·좌우 선 없음', title.borders?.top?.widthMm === 0.7 && title.borders?.top?.color === '#1F3864' && title.borders?.left?.style === 'none' && title.borders?.right?.style === 'none', JSON.stringify(title.borders));
  const head = tables[1].rows[0][0];
  ok('공문 보고서: 공문 표 (머리행 아래 겹선, 왼쪽 바깥선 없음)', head.borders?.bottom?.style === 'double' && head.borders?.left?.style === 'none' && tables[1].rows[2][1].borders?.bottom?.widthMm === 0.4, JSON.stringify(head.borders));
  ok('공문 보고서: data-style="기본" 표는 그대로', !tables[2].rows[0][0].borders);
  const runs = doc.blocks.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
  ok('공문 보고서: 자간 -5 · 휴먼명조 · HY헤드라인M', runs.every((r) => r.kind !== 'text' || r.spacingPct === -5) && runs.some((r) => r.kind === 'text' && r.font === '휴먼명조') && tables[0].rows[0][0].blocks[0].inlines.some((r) => r.kind === 'text' && r.font === 'HY헤드라인M'));
  const htmlGaejo = doc.blocks.find((b) => b.type === 'paragraph' && b.inlines.some((i) => i.kind === 'text' && i.text.startsWith('○ (방법)')));
  ok('공문 보고서: HTML 문단의 개조식도 들여쓰기', htmlGaejo?.type === 'paragraph' && htmlGaejo.style.indentLeftMm === 10 && htmlGaejo.style.spaceBeforePt === 5, JSON.stringify(htmlGaejo && (htmlGaejo as any).style));
  same('공문 보고서: 마크다운 → 한글 저장 → 열기', doc, (await readHwpx(await docToHwpx(doc))).doc);
  same('공문 보고서: 마크다운 → Word 저장 → 열기', doc, (await readDocx(await docToDocx(doc))).doc);
  same('공문 보고서: 문서 → 마크다운 → 문서', doc, markdownToDoc(docToMarkdown(doc), nodeGenerateJSON).doc);
  same('공문 보고서: 편집기 거쳐 저장', doc, tiptapToDoc(docToTiptap(doc), doc.title, doc.page));
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
