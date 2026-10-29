// dist/index.html(완전한 HTML 문서)을 claude.ai Artifact 형식(본문 조각)으로 바꾼다.
// Artifact 는 <html>/<head>/<body> 골격을 스스로 씌우므로 그 안의 내용만 남긴다.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const pick = (re) => [...head.matchAll(re)].map((m) => m[0]).join('\n');

const out = [
  pick(/<title>[\s\S]*?<\/title>/gi),
  pick(/<meta name="claude:[^>]*>/gi),
  pick(/<link [^>]*fonts\.(googleapis|gstatic)[^>]*>/gi),
  pick(/<style[\s\S]*?<\/style>/gi),
  body.trim(),
  pick(/<script[\s\S]*?<\/script>/gi),
].join('\n');
// 라이브러리 코드 안의 U+FFFD 글자는 게시 검사에 걸리므로 같은 뜻의 JS 이스케이프(\\uFFFD)로 바꾼다
writeFileSync('dist/artifact.html', out.replace(/\uFFFD/g, '\\uFFFD'));
console.log('dist/artifact.html', (out.length / 1024).toFixed(0), 'KB');
