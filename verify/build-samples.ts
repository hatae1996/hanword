/**
 * 샘플 문서를 실제 저장기로 DOCX/HWPX 로 만들어 verify/out/ 에 쓴다.
 * 실행: npm run samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tiptapToDoc } from '../src/model/fromTiptap';
import { plainText } from '../src/model/resolve';
import { docToDocx } from '../src/export/docx';
import { docToHwpx } from '../src/export/hwpx';
import { SAMPLES, SAMPLE_EXTRAS } from './samples';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });

for (const [name, json] of Object.entries(SAMPLES)) {
  const doc = { ...tiptapToDoc(json as Parameters<typeof tiptapToDoc>[0], name), ...(SAMPLE_EXTRAS[name] ?? {}) };
  writeFileSync(join(outDir, `${name}.docx`), await docToDocx(doc));
  writeFileSync(join(outDir, `${name}.hwpx`), await docToHwpx(doc));
  // 검증 스크립트가 "글자가 하나도 빠지지 않았는지" 비교할 기준 텍스트
  writeFileSync(join(outDir, `${name}.expected.txt`), plainText(doc.blocks));
  console.log(`✓ ${name}.docx / ${name}.hwpx`);
}
