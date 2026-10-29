/**
 * 문서 들여다보기 — HanWord 가 이 파일을 어떻게 읽는지 보여 준다.
 * 실행: npm run inspect -- 파일.hwpx [파일.docx …]
 */
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';
import { readHwpx } from '../src/import/hwpx';
import { readDocx } from '../src/import/docx';

(globalThis as any).DOMParser = DOMParser;

for (const f of process.argv.slice(2)) {
  const bytes = readFileSync(f);
  const r = f.toLowerCase().endsWith('.docx') ? await readDocx(bytes) : await readHwpx(bytes);
  const p = r.doc.page;
  console.log(`\n■ ${f}`);
  console.log(`  쪽: ${p.widthMm.toFixed(0)}×${p.heightMm.toFixed(0)}mm, 여백 위${p.marginTopMm.toFixed(1)}(+${p.headerMm.toFixed(1)}) 좌${p.marginLeftMm.toFixed(1)} 우${p.marginRightMm.toFixed(1)} 아래${p.marginBottomMm.toFixed(1)}(+${p.footerMm.toFixed(1)})`);
  for (const b of r.doc.blocks) {
    if (b.type === 'table') {
      console.log(`  [표 ${b.rows.length}줄 × ${b.colWidthsMm.length}칸] ${b.rows.map((row) => row.map((c) => c.blocks.map((x) => x.inlines.map((i) => (i.kind === 'text' ? i.text : '/')).join('')).join(' ')).join(' | ')).join(' // ')}`);
    } else {
      const text = b.inlines.map((i) => (i.kind === 'text' ? i.text : '↵')).join('');
      console.log(`  ${b.role === 'body' ? '  ' : b.role.toUpperCase()} ${text || '(빈 줄)'}`);
    }
  }
  if (r.warnings.length) console.log(`  ⚠ 아직 지원하지 않아 빠진 요소: ${r.warnings.join(', ')}`);
}
