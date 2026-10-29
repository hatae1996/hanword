// templates/ 폴더의 빈 문서 템플릿을 base64로 묶어 src/export/templates.generated.ts 로 만든다.
// 브라우저(단일 HTML 빌드)와 Node(검증 스크립트) 양쪽에서 같은 템플릿을 쓰기 위함.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hwpx = readFileSync(join(root, 'templates', 'blank.hwpx')).toString('base64');

const out = `// 자동 생성 파일 — 직접 고치지 말고 templates/ 를 바꾼 뒤 \`npm run embed\` 를 실행하세요.
// blank.hwpx: 한컴오피스 한글이 저장한 빈 문서 (python-hwpx, Apache-2.0 에서 가져옴)
export const BLANK_HWPX_BASE64 = ${JSON.stringify(hwpx)};
`;
writeFileSync(join(root, 'src', 'export', 'templates.generated.ts'), out);
console.log('templates embedded:', (hwpx.length * 0.75 / 1024).toFixed(1), 'KB');
