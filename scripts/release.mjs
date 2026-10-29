// 새 버전 내기:  npm run release -- 0.3.1 "글자 크기 단축키 추가"
//
// 1) package.json · tauri.conf.json · Cargo.toml 의 버전을 한꺼번에 바꾸고
// 2) CHANGELOG.md 맨 위에 변경 내용을 적고
// 3) 커밋 + 태그(v0.3.1)를 만든다.
// 그다음 `git push --follow-tags` 하면 GitHub 가 설치 파일을 만들어 배포하고, 사용자 앱이 자동 업데이트된다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [version, ...noteParts] = process.argv.slice(2);
const notes = noteParts.join(' ').trim();
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !notes) {
  console.error('사용법: npm run release -- 0.3.1 "바뀐 내용"');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [a, b, c] = pkg.version.split('.').map(Number);
const [x, y, z] = version.split('.').map(Number);
if (x * 1e6 + y * 1e3 + z <= a * 1e6 + b * 1e3 + c) {
  console.error(`새 버전(${version})은 지금 버전(${pkg.version})보다 커야 합니다.`);
  process.exit(1);
}

pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

const confPath = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

const cargoPath = 'src-tauri/Cargo.toml';
writeFileSync(cargoPath, readFileSync(cargoPath, 'utf8').replace(/^version = "[^"]+"/m, `version = "${version}"`));

const date = new Date().toISOString().slice(0, 10);
const old = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# 변경 기록\n+/, '') : '';
writeFileSync('CHANGELOG.md', `# 변경 기록\n\n## v${version} (${date})\n\n- ${notes}\n\n${old}`);

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md');
run(`git commit -m ${JSON.stringify(`v${version}: ${notes}`)}`);
run(`git tag v${version}`);
console.log(`\nv${version} 준비 완료. 배포하려면:  git push --follow-tags`);
