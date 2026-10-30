// 구형 .hwp 읽기 도구(rhwp, MIT)를 앱에 넣는다: node_modules/@rhwp/core → public/rhwp/ (빌드 때 dist/rhwp/ 로 복사됨)
// 12MB 라서 .hwp 를 열 때만 불러온다 (src/import/hwp.ts). 저장소에는 넣지 않는다 (.gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json'));
const out = join(root, 'public', 'rhwp');
mkdirSync(out, { recursive: true });
for (const f of ['rhwp.js', 'rhwp_bg.wasm', 'LICENSE']) copyFileSync(join(src, f), join(out, f));
console.log('rhwp → public/rhwp/');
