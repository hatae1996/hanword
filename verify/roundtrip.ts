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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tiptapToDoc } from '../src/model/fromTiptap';
import { docToTiptap } from '../src/model/toTiptap';
import { canonical } from '../src/model/normalize';
import { docToHwpx } from '../src/export/hwpx';
import { docToDocx } from '../src/export/docx';
import { readHwpx } from '../src/import/hwpx';
import { readDocx } from '../src/import/docx';
import type { Doc, ImageRun, Paragraph } from '../src/model/types';
import { SAMPLES, SAMPLE_EXTRAS } from './samples';
import { applyTheme } from '../src/design/apply';
import { decoKind, replaceCover } from '../src/design/deco';
import { DECO_ASSETS } from '../src/design/decoAssets';
import { ACCENTS, THEMES, themeById } from '../src/design/themes';
import { BUILTIN_TEMPLATES } from '../src/ui/templates';
import { readHwp } from '../src/import/hwp';
import { loadRhwpNode } from '../src/import/hwpNode';
import { docToMarkdown, markdownToDoc } from '../src/ai/markdown';
import { inlineImages, nodeGenerateJSON } from '../src/ai/node';

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

function stripMemos(d: Doc): Doc {
  const strip = (ps: any[]) => ps.map((p) => ({ ...p, inlines: p.inlines.map(({ memo: _m, ...i }: any) => i) }));
  return { ...d, memos: undefined, blocks: d.blocks.map((b) => (b.type === 'paragraph' ? strip([b])[0] : { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, blocks: strip(c.blocks) }))) })) };
}

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
  // (메모는 마크다운에 없으므로 메모를 뺀 문서와 비교)
  same(`${name}: 문서 → 마크다운 → 문서`, stripMemos(d0), markdownToDoc(docToMarkdown(d0), nodeGenerateJSON).doc);
  if (d0.memos?.length) {
    ok(`${name}: 메모 ${d0.memos.length}개 (HWPX·DOCX 모두)`, h.doc.memos?.length === d0.memos.length && x.doc.memos?.length === d0.memos.length, `${h.doc.memos?.length} / ${x.doc.memos?.length}`);
  }
}

// ── 문서 테마: 저장·열기 그대로, 테마를 바꿔 입혀도 같은 결과 ──────────
{
  const docs: [string, Doc][] = [];
  for (const t of BUILTIN_TEMPLATES) docs.push([`양식 ${t.name}`, markdownToDoc(t.markdown, nodeGenerateJSON).doc]);
  docs.push(['샘플 02-표', { ...tiptapToDoc(SAMPLES['02-표'] as any, '02-표') }]);
  docs.push(['샘플 07-메모', { ...tiptapToDoc(SAMPLES['07-메모'] as any, '07-메모') }]);
  for (const [name, d] of docs) {
    for (const th of THEMES) {
      const a = applyTheme(d, th, ACCENTS[1]);
      const h = await readHwpx(await docToHwpx(a));
      same(`테마 ${th.name}: ${name} 저장(HWPX) → 열기`, a, h.doc);
      const x = await readDocx(await docToDocx(a));
      same(`테마 ${th.name}: ${name} 저장(DOCX) → 열기`, a, x.doc);
      // 다른 테마를 입혔다가 이 테마로 바꿔도 처음부터 이 테마인 것과 같다
      const other = THEMES[(THEMES.indexOf(th) + 1) % THEMES.length];
      same(`테마 ${other.name} → ${th.name}: ${name} 바꿔 입히기`, a, applyTheme(applyTheme(d, other, ACCENTS[3]), th, ACCENTS[1]));
    }
  }
}

// ── 감성 테마 장식: 커버·장 아이콘·구분선·상자 아이콘 ────────────
{
  const d0 = markdownToDoc(BUILTIN_TEMPLATES[0].markdown, nodeGenerateJSON).doc;
  // 상자(1칸 표) 하나를 본문 중간에 넣어 둔다
  const para = d0.blocks.find((b) => b.type === 'paragraph' && b.inlines.length) as Paragraph;
  const box: Doc['blocks'][number] = { type: 'table', colWidthsMm: [150], rows: [[{ colspan: 1, rowspan: 1, blocks: [{ ...para, inlines: [{ kind: 'text', text: '참고: 차수별로 나누어 진행합니다' }] }] }]] };
  const d: Doc = { ...d0, blocks: [...d0.blocks.slice(0, 4), box, ...d0.blocks.slice(4)] };
  const kinds = (doc: Doc) => {
    const out: string[] = [];
    const scan = (ps: Paragraph[]) => ps.forEach((p) => p.inlines.forEach((i) => i.kind === 'image' && decoKind(i) && out.push(decoKind(i)!)));
    for (const b of doc.blocks) b.type === 'paragraph' ? scan([b]) : b.rows.forEach((r) => r.forEach((c) => scan(c.blocks)));
    return out;
  };
  const count = (ks: string[], pre: string) => ks.filter((k) => k.startsWith(pre)).length;
  const sky = themeById('sky'), night = themeById('night'), modern = themeById('modern');
  const a = applyTheme(d, sky);
  const ka = kinds(a);
  const chapters = a.blocks.filter((b) => b.type === 'paragraph' && /^\s*[ⅠⅡⅢⅣⅤ]\s*\./.test(b.inlines.map((i) => (i.kind === 'text' ? i.text : '')).join(''))).length;
  ok(`하늘: 커버 1 · 장 아이콘 ${chapters} · 구분선 ${chapters - 1}`, a.blocks[0].type === 'paragraph' && ka[0] === 'cover:sky' && count(ka, 'cover:') === 1 && count(ka, 'icon:sky') === chapters && count(ka, 'divider:sky') === chapters - 1 && chapters >= 2, ka.join(','));
  const one = (b: Doc['blocks'][number]) => b.type === 'table' && b.rows.length === 1 && b.rows[0].length === 1;
  const boxes = a.blocks.filter(one).length - (one(a.blocks[1]) ? 1 : 0);
  ok(`하늘: 상자(1칸 표) ${boxes}개에 말풍선 아이콘`, boxes >= 1 && count(ka, 'box:sky') === boxes, `${count(ka, 'box:sky')} / ${boxes}`);
  const h = (await readHwpx(await docToHwpx(a))).doc;
  ok('하늘: 한글로 저장했다 열어도 장식인 줄 앎', kinds(h).join() === ka.join(), kinds(h).join(','));
  const x = (await readDocx(await docToDocx(a))).doc;
  ok('하늘: Word 로 저장했다 열어도 장식인 줄 앎', kinds(x).join() === ka.join(), kinds(x).join(','));
  const n = applyTheme(h, night);
  ok('다시 연 문서에 밤하늘 → 장식이 겹치지 않고 바뀜', kinds(n).join() === ka.join().replace(/sky/g, 'night'), kinds(n).join(','));
  same('하늘 → 밤하늘 = 처음부터 밤하늘', applyTheme(d, night), n);
  const m = applyTheme(n, modern);
  ok('밤하늘 → 모던: 장식이 모두 빠짐', kinds(m).length === 0, kinds(m).join(','));
  same('장식 뺀 결과 = 처음부터 모던', applyTheme(d, modern), m);
  // 사용자 커버는 테마를 바꿔도 남음
  const fake: ImageRun = { ...(a.blocks[0] as Paragraph).inlines[0] as ImageRun };
  const custom: ImageRun = { ...fake, data: Buffer.from(Buffer.from(fake.data, 'base64').toString('latin1').replace('cover:sky', 'cover:custom'), 'latin1').toString('base64') };
  const c = replaceCover(applyTheme(d, sky), custom);
  ok('내 커버로 바꿈', kinds(c)[0] === 'cover:custom' && count(kinds(c), 'cover:') === 1, kinds(c).join(','));
  const c2 = applyTheme(applyTheme(c, night), modern);
  ok('내 커버는 테마를 바꿔도 남음 (기본 테마에서도)', kinds(c2).join() === 'cover:custom', kinds(c2).join(','));
  ok('커버 빼기', kinds(replaceCover(c2, null)).length === 0);
  ok('감성 테마 장식 그림은 모두 그림 형식 (한글·Word 공통)', Object.values(DECO_ASSETS).every((x) => x.mime === 'image/png' || x.mime === 'image/jpeg'));
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

// ── 양식 모음 (앱의 "양식" 버튼) ─────────────────────────────
for (const t of BUILTIN_TEMPLATES) {
  const { doc, warnings } = markdownToDoc(t.markdown, nodeGenerateJSON, t.name);
  ok(`양식 "${t.name}": 변환 경고 없음`, warnings.length === 0, warnings.join(', '));
  ok(`양식 "${t.name}": 빈칸(○○) 있음`, /○○/.test(JSON.stringify(doc.blocks)));
  same(`양식 "${t.name}": 한글 저장 → 열기`, doc, (await readHwpx(await docToHwpx(doc))).doc);
  same(`양식 "${t.name}": Word 저장 → 열기`, doc, (await readDocx(await docToDocx(doc))).doc);
}

// ── 실제 프로그램 검증용 추가 샘플 (verify/kit) ───────────────────
{
  const kitDir = join(here, 'kit');
  for (const f of readdirSync(kitDir).filter((x) => x.endsWith('.md')).sort()) {
    const { doc, warnings } = markdownToDoc(inlineImages(readFileSync(join(kitDir, f), 'utf8'), kitDir), nodeGenerateJSON, f);
    ok(`검증 샘플 ${f}: 변환 경고 없음`, warnings.length === 0, warnings.join(', '));
    same(`검증 샘플 ${f}: 한글 저장 → 열기`, doc, (await readHwpx(await docToHwpx(doc))).doc);
    same(`검증 샘플 ${f}: Word 저장 → 열기`, doc, (await readDocx(await docToDocx(doc))).doc);
  }
}

// ── 구형 .hwp (HWP 5.0) — python-hwpx 로 만든 .hwp 를 rhwp 로 읽어 원래 문서와 같은지 ─────
for (const n of ['01-서식', '02-표', '06-사진']) {
  const original = { ...tiptapToDoc(SAMPLES[n] as any, n), ...(SAMPLE_EXTRAS[n] ?? {}) };
  const r = await readHwp(new Uint8Array(readFileSync(join(here, 'fixtures', `${n}.hwp`))), n, () => loadRhwpNode());
  same(`구형 .hwp 열기: ${n}`, original, r.doc);
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
