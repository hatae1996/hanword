// 실제 한글·Word 검증 꾸러미: 샘플 문서(.hwpx/.docx/기대 글자) + 검증 스크립트 → dist-kit/HanWord-검증꾸러미.zip
// 사용자는 압축을 풀고 "검증-실행.cmd" 를 두 번 누르면 된다 (npm run samples 를 먼저 실행해 verify/out 을 만든다)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'verify', 'out');
const zip = new JSZip();
const names = readdirSync(out).filter((f) => f.endsWith('.expected.txt')).map((f) => f.replace(/\.expected\.txt$/, ''));
for (const n of names) {
  for (const ext of ['hwpx', 'docx', 'expected.txt']) {
    const p = join(out, `${n}.${ext}`);
    if (existsSync(p)) zip.file(`샘플/${n}.${ext}`, readFileSync(p));
  }
}
zip.file('verify-in-office.ps1', readFileSync(join(root, 'verify', 'windows', 'verify-in-office.ps1')));
zip.file('검증-실행.cmd', readFileSync(join(root, 'verify', 'windows', '검증-실행.cmd')));
zip.file('읽어보기.txt', `HanWord 검증 꾸러미 (샘플 ${names.length}종)

1. 이 압축을 아무 폴더에 풉니다.
2. "검증-실행.cmd" 를 두 번 누릅니다.
   - 한컴오피스 한글이 샘플을 하나씩 열어
     열리는지 / 글자가 빠지지 않았는지 / 쪽 수를 확인하고, 각 프로그램이 그린 PDF 를 샘플\\office-pdf 에 저장합니다.
   - 한글이 "접근 허용" 창을 띄우면 "모두 허용"을 누르세요.
   - 문서마다 진행 상황이 한 줄씩 나옵니다. 한 문서에서 2분 30초 넘게 멈추면 그 프로그램을 껐다 켜고 다음 문서로 넘어갑니다.
3. 끝나면 같은 폴더에 "검증결과.txt" 가 생깁니다. 이 파일을 Claude 에게 보내 주세요.
   중간에 멈췄다면 "검증진행.txt" 를 보내 주세요.
`.replace(/\n/g, '\r\n'));
const dist = join(root, 'dist-kit');
mkdirSync(dist, { recursive: true });
const file = join(dist, 'HanWord-검증꾸러미.zip');
writeFileSync(file, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
console.log(`✓ ${file} (샘플 ${names.length}종)`);
