/**
 * 쪽 시작 자리 검사 — 편집기 문서에서 계산한 "이 쪽은 여기서 시작" 자리의 글자가
 * rhwp 가 그 쪽에 그린 첫 글자와 같은지 본다 (npm run page-starts).
 */
import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { schemaExtensions } from '../src/editor/extensions';
import { tiptapToDoc } from '../src/model/fromTiptap';
import { docToTiptap } from '../src/model/toTiptap';
import { readHwpx } from '../src/import/hwpx';
import { docToHwpx } from '../src/export/hwpx';
import { paginate } from '../src/layout/pagination';
import { loadRhwpNode } from '../src/import/hwpNode';

(globalThis as any).DOMParser = DOMParser;
const schema = getSchema(schemaExtensions());
const mod: any = await loadRhwpNode();
const out = join(import.meta.dirname, 'out');
const squash = (s: string) => s.replace(/[\s\r\n]+/g, '');
let bad = 0;
let n = 0;
for (const name of ['03-긴문서', '05-쪽', 'K3-긴표', 'K7-머리말쪽번호', '01-서식', 'T2-기록물이관완료보고']) {
  const { doc: fileDoc } = await readHwpx(readFileSync(join(out, `${name}.hwpx`)));
  const pm = PMNode.fromJSON(schema, docToTiptap(fileDoc) as any);
  const doc = { ...tiptapToDoc(pm.toJSON() as any, name, fileDoc.page), header: fileDoc.header, footer: fileDoc.footer, pageNumber: fileDoc.pageNumber };
  const r = await paginate(pm, doc, mod);
  const d = new mod.HwpDocument(await docToHwpx(doc));
  const ok1 = r.pages === d.pageCount();
  n++;
  if (!ok1) bad++;
  console.log(`${ok1 ? '✅' : '❌'} ${name}: ${r.pages}쪽, 쪽 시작 ${r.starts.length}곳`);
  for (const s of r.starts) {
    n++;
    const want = squash(JSON.parse(d.getPageText(s.page - 1))).slice(0, 8);
    let got: string;
    if (s.kind === 'row') {
      const row = pm.nodeAt(s.pos)!;
      got = squash(row.textContent).slice(0, 8);
    } else got = squash(pm.textBetween(s.pos, Math.min(pm.content.size, s.pos + 40), '\n', '')).slice(0, 8);
    // 표로 시작하는 쪽: rhwp 쪽 글에는 표 안 글자가 없다 → 빈 글이면 통과로 본다
    const ok = !want || got.startsWith(want) || (s.kind !== 'inline' && want === '');
    if (!ok) bad++;
    console.log(`   ${ok ? '✅' : '❌'} ${s.page}쪽 (${s.kind}) 편집기 "${got}" / rhwp "${want}"`);
  }
}
// 여러 쪽에 걸친 표 (90줄): 쪽이 바뀌는 줄의 첫 칸이 그 쪽 그림에 있고, 앞 줄은 앞 쪽에 있어야 한다
{
  const rows = Array.from({ length: 90 }, (_, i) => ({ type: 'tableRow', content: [`행${i + 1}번`, '내용'].map((t) => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) }));
  const json = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '긴 표 앞 문단' }] }, { type: 'table', content: rows }, { type: 'paragraph', content: [{ type: 'text', text: '표 뒤 문단' }] }] };
  const pm = PMNode.fromJSON(schema, json as any);
  const doc = tiptapToDoc(pm.toJSON() as any, '긴표');
  const r = await paginate(pm, doc, mod);
  const d = new mod.HwpDocument(await docToHwpx(doc));
  const rowStarts = r.starts.filter((s) => s.kind === 'row');
  n++;
  const ok = r.pages === d.pageCount() && rowStarts.length >= 1;
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} 90줄 표: ${r.pages}쪽, 표 줄에서 쪽이 바뀜 ${rowStarts.length}곳`);
  for (const s of rowStarts) {
    n++;
    const row = pm.nodeAt(s.pos)!;
    const first = row.firstChild!.textContent;
    const svgs = (p: number) => d.renderPageSvg(p).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    const num = Number(first.match(/\d+/)![0]);
    const okRow = svgs(s.page - 1).includes(first) && !svgs(s.page - 1).includes(`행${num - 1}번`) && svgs(s.page - 2).includes(`행${num - 1}번`);
    if (!okRow) bad++;
    console.log(`   ${okRow ? '✅' : '❌'} ${s.page}쪽은 "${first}" 줄부터 (앞 줄은 ${s.page - 1}쪽)`);
  }
}
console.log(bad ? `\n${bad}개 다름` : `\n${n}/${n} 통과`);
process.exit(bad ? 1 : 0);
