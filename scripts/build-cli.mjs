// cli/hanword-cli.ts → cli/hanword.mjs (의존성까지 모두 묶은 파일 하나, Node 18+ 에서 바로 실행)
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
await build({
  entryPoints: ['cli/hanword-cli.ts'],
  outfile: 'cli/hanword.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: true,
  legalComments: 'none',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `#!/usr/bin/env node\n// HanWord ${pkg.version} 변환기 — https://github.com/hatae1996/hanword (자동 생성 파일, 고치지 말 것)\nimport { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);`,
  },
  logLevel: 'warning',
});
console.log('cli/hanword.mjs', (readFileSync('cli/hanword.mjs').length / 1024).toFixed(0), 'KB');
