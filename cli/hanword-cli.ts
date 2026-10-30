/**
 * HanWord 명령줄 변환기 — AI(또는 사람)가 한글·Word 문서를 만들고 읽게 해 준다.
 *
 *   node hanword.mjs 보고서.md                    → 보고서.hwpx
 *   node hanword.mjs 보고서.md -o 결과.docx       → Word 로
 *   node hanword.mjs 보고서.md --both             → .hwpx 와 .docx 둘 다
 *   node hanword.mjs 받은문서.hwpx                → 받은문서.md (AI 가 읽고 고칠 수 있게)
 *   node hanword.mjs 받은문서.docx -o 변환.hwpx   → Word → 한글 변환
 *
 * 앱(HanWord)과 완전히 같은 변환 규칙·저장기를 쓴다. 만든 파일은 다시 열어 글자 누락이 없는지 스스로 확인한다.
 * 작성 문법: docs/AI-작성-가이드.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { IMAGE_EXT, base64ToBytes } from '../src/model/image';
import type { ImageRun } from '../src/model/types';
import { inlineImages, nodeGenerateJSON } from '../src/ai/node';
import { docToMarkdown, markdownToDoc } from '../src/ai/markdown';
import { docToHwpx } from '../src/export/hwpx';
import { docToDocx } from '../src/export/docx';
import { readHwpx } from '../src/import/hwpx';
import { readDocx } from '../src/import/docx';
import { readHwp } from '../src/import/hwp';
import { loadRhwpNode } from '../src/import/hwpNode';
import { plainText } from '../src/model/resolve';
import type { Doc } from '../src/model/types';

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const HELP = `HanWord ${VERSION} — 마크다운 ↔ 한글(HWPX)·Word(DOCX) 변환

사용법
  node hanword.mjs <입력> [-o <출력>] [--both]

  입력이 .md   → 기본 출력 .hwpx  (-o 로 .docx 지정, --both 는 둘 다)
  입력이 .hwpx/.docx → 기본 출력 .md  (-o 로 .hwpx/.docx 지정하면 형식 변환)
  입력 대신 - 를 쓰면 표준 입력에서 마크다운을 읽는다

작성 문법: https://github.com/hatae1996/hanword/blob/main/docs/AI-작성-가이드.md`;

type Fmt = 'md' | 'hwpx' | 'docx';
const fmtOf = (p: string): Fmt | null => {
  const e = extname(p).toLowerCase().slice(1);
  return e === 'md' || e === 'markdown' || e === 'txt' ? 'md' : e === 'hwpx' ? 'hwpx' : e === 'docx' ? 'docx' : null;
};

async function readInput(path: string): Promise<{ doc: Doc; warnings: string[] }> {
  const fmt = path === '-' ? 'md' : fmtOf(path);
  const title = path === '-' ? '문서' : basename(path, extname(path));
  if (fmt === 'md') {
    const md = readFileSync(path === '-' ? 0 : path, 'utf8');
    return markdownToDoc(inlineImages(md, path === '-' ? process.cwd() : dirname(resolve(path))), nodeGenerateJSON, title);
  }
  if (fmt === 'hwpx') return readHwpx(readFileSync(path), title);
  if (fmt === 'docx') return readDocx(readFileSync(path), title);
  if (/\.hwp$/i.test(path)) return readHwp(new Uint8Array(readFileSync(path)), title, () => loadRhwpNode(process.argv[1]));
  throw new Error(`알 수 없는 입력 형식입니다: ${path} (.md, .hwpx, .docx 만 가능)`);
}

/** 만든 파일을 다시 열어 글자가 하나도 빠지지 않았는지 확인 */
async function selfCheck(bytes: Uint8Array, fmt: 'hwpx' | 'docx', doc: Doc): Promise<string> {
  const back = fmt === 'hwpx' ? await readHwpx(bytes) : await readDocx(bytes);
  const a = plainText(doc.blocks).replace(/\s+/g, '');
  const b = plainText(back.doc.blocks).replace(/\s+/g, '');
  if (a !== b) throw new Error(`검증 실패: 원본 ${a.length}자, 저장 후 ${b.length}자 — 버그로 보입니다. 이슈로 알려 주세요.`);
  const tables = doc.blocks.filter((x) => x.type === 'table').length;
  return `글자 ${a.length.toLocaleString('ko-KR')}자 · 문단 ${doc.blocks.length - tables}개 · 표 ${tables}개 확인`;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (args.includes('-v') || args.includes('--version')) {
    console.log(VERSION);
    return;
  }
  const oi = args.findIndex((a) => a === '-o' || a === '--out');
  const out = oi >= 0 ? args[oi + 1] : undefined;
  const both = args.includes('--both');
  const input = args.find((a, i) => (oi < 0 || (i !== oi && i !== oi + 1)) && (a === '-' || !a.startsWith('-')));
  if (!input) throw new Error('입력 파일을 지정하세요.\n\n' + HELP);

  const inFmt = input === '-' ? 'md' : fmtOf(input);
  const base = input === '-' ? '문서' : input.slice(0, input.length - extname(input).length);
  const { doc, warnings } = await readInput(input);
  if (warnings.length) console.error(`⚠ 아직 지원하지 않아 빠지거나 바뀐 요소: ${warnings.join(', ')}`);

  const targets: string[] = out ? [out] : inFmt === 'md' ? (both ? [`${base}.hwpx`, `${base}.docx`] : [`${base}.hwpx`]) : [`${base}.md`];
  if (out && both && fmtOf(out) !== 'md') targets.push(out.replace(/\.(hwpx|docx)$/i, (m) => (m.toLowerCase() === '.hwpx' ? '.docx' : '.hwpx')));

  for (const t of targets) {
    const fmt = fmtOf(t);
    if (fmt === 'md') {
      // 그림은 마크다운 옆에 파일로 빼고 경로로 적는다 (문서명_그림1.png …)
      let n = 0;
      const stem = basename(t, extname(t));
      const saved = new Map<string, string>();
      const imageSrc = (img: ImageRun) => {
        const hit = saved.get(img.data);
        if (hit) return hit;
        const name = `${stem}_그림${++n}.${IMAGE_EXT[img.mime]}`;
        writeFileSync(join(dirname(resolve(t)), name), base64ToBytes(img.data));
        const ref = name.replace(/ /g, '%20');
        saved.set(img.data, ref);
        return ref;
      };
      writeFileSync(t, docToMarkdown(doc, { imageSrc }));
      console.log(`✓ ${t}${n ? `  (그림 ${n}개: ${stem}_그림1… 같은 폴더)` : ''}`);
    } else if (fmt === 'hwpx' || fmt === 'docx') {
      const bytes = fmt === 'hwpx' ? await docToHwpx(doc) : await docToDocx(doc);
      const check = await selfCheck(bytes, fmt, doc);
      writeFileSync(t, bytes);
      console.log(`✓ ${t}  (${check})`);
    } else throw new Error(`알 수 없는 출력 형식입니다: ${t} (.md, .hwpx, .docx 만 가능)`);
  }
}

main().catch((e) => {
  console.error(`✗ ${e?.message ?? e}`);
  process.exit(1);
});
