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
import { BUILTIN_TEMPLATES } from '../src/ui/templates';
import { markdownToDoc } from '../src/ai/markdown';
import { inlineImages, nodeGenerateJSON } from '../src/ai/node';
import { readFileSync, readdirSync } from 'node:fs';
const kitDir = join(dirname(fileURLToPath(import.meta.url)), 'kit');

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

// 양식 모음과 AI 작성 예시도 같은 검사를 받는다 (verify.py · 렌더 · Windows 실제 프로그램 비교)
const mdSamples: [string, string][] = [
  ...BUILTIN_TEMPLATES.map((t, i): [string, string] => [`T${i + 1}-${t.name.replace(/\s+/g, '')}`, t.markdown]),
  ['M1-AI보고서', readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ai-보고서.md'), 'utf8')],
  ['M2-공문보고서', readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', '공문-보고서.md'), 'utf8')],
  ...readdirSync(kitDir).filter((f) => f.endsWith('.md')).sort().map((f): [string, string] => [f.replace(/\.md$/, ''), readFileSync(join(kitDir, f), 'utf8')]),
];
for (const [name, md] of mdSamples) {
  const { doc } = markdownToDoc(inlineImages(md, kitDir), nodeGenerateJSON, name);
  writeFileSync(join(outDir, `${name}.docx`), await docToDocx(doc));
  writeFileSync(join(outDir, `${name}.hwpx`), await docToHwpx(doc));
  writeFileSync(join(outDir, `${name}.expected.txt`), plainText(doc.blocks));
  console.log(`✓ ${name}.docx / ${name}.hwpx`);
}
