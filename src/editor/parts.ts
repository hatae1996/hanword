/**
 * 보고서 부품 (/ 메뉴) 과 상용구 (한글 Alt+I · Word 빠른 문서 요소).
 *
 * 부품은 AI 변환기와 같은 HTML 문법으로 적어 두고 markdownToHtml 로 편집기 HTML 을 만든다
 * → 공문 표·개조식 들여쓰기가 AI 가 쓴 보고서와 똑같이 들어간다.
 * 상용구는 이 PC 에만 저장된다 (localStorage).
 */
import type { Editor, JSONContent } from '@tiptap/core';
import { markdownToHtml } from '../ai/markdown';
import type { MenuItem } from './slashMenu';
import { GAEJO_SYMBOLS } from './gaejo';
import { GAEJO_HANG_MM, GAEJO_STEP_MM } from '../ai/markdown';
import { listDialog, promptDialog } from '../ui/dialog';

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
export const CHAPTER_RE = /^\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\s*\.\s*\S/;

/** 커서 앞에 있는 장 제목(Ⅰ. Ⅱ.) 수 → 다음 번호 */
function nextRoman(editor: Editor, pos: number): string {
  let n = 0;
  editor.state.doc.nodesBetween(0, pos, (node) => {
    if (node.isTextblock && CHAPTER_RE.test(node.textContent)) n++;
    return !node.isTextblock;
  });
  return ROMAN[Math.min(n, ROMAN.length - 1)];
}

/** '/검색어' 를 지우고 HTML 을 넣는다. 줄이 '/검색어' 뿐이면 그 문단을 통째로 바꾼다 */
export function insertHtmlAt(editor: Editor, range: { from: number; to: number }, html: string) {
  const $from = editor.state.doc.resolve(range.from);
  const para = $from.parent;
  const onlySlash = para.textContent.trim() === editor.state.doc.textBetween(range.from, range.to).trim();
  const target = onlySlash && $from.depth > 0 ? { from: $from.before(), to: $from.after() } : range;
  editor.chain().focus().insertContentAt(target, html, { parseOptions: { preserveWhitespace: false } }).run();
}

const md = (src: string) => markdownToHtml(src).html;

/** 개조식 한 줄: 기호 + 공백, 들여쓰기 */
function gaejoLine(editor: Editor, range: { from: number; to: number }, level: number, symbol: string = GAEJO_SYMBOLS[level]) {
  const chain = editor.chain().focus().deleteRange(range);
  chain
    .updateAttributes('paragraph', { indentLeft: level * GAEJO_STEP_MM + GAEJO_HANG_MM, firstLine: -GAEJO_HANG_MM, textAlign: 'left' })
    .insertContent(`${symbol} `)
    .run();
}

// ── 보고서 부품 ──────────────────────────────────────────
export function reportParts(): MenuItem[] {
  const G = '보고서 부품';
  return [
    {
      group: G, label: '제목 상자', hint: '위아래 선 + HY헤드라인M 22pt + 날짜 줄', keywords: '제목 title 상자',
      run: (ed, r) =>
        insertHtmlAt(ed, r, md(`<table><tr><td style="border-top:0.7mm solid #1F3864; border-bottom:0.4mm solid #1F3864; border-left:none; border-right:none"><p align="center" style="margin-top:3pt; margin-bottom:3pt; line-height:130%"><span style="font-family:HY헤드라인M; font-size:22pt">○○ 결과 보고</span></p></td></tr></table>\n\n<p align="right"><span style="font-size:12pt">2026. ○○. ○○.(○) ｜ ○○○○</span></p>`)),
    },
    {
      group: G, label: '장 제목 (Ⅰ. Ⅱ. …)', hint: 'HY헤드라인M 16pt, 번호 자동', keywords: '장 제목 chapter 로마',
      run: (ed, r) => insertHtmlAt(ed, r, md(`<p style="margin-top:10pt; margin-bottom:2pt"><span style="font-family:HY헤드라인M; font-size:16pt">${nextRoman(ed, r.from)}. ○○</span></p>`)),
    },
    { group: G, label: '□ 항목', hint: '1단계', keywords: '네모 개조식 ㅁ', run: (ed, r) => gaejoLine(ed, r, 0) },
    { group: G, label: '○ 항목', hint: '2단계', keywords: '동그라미 개조식 ㅇ', run: (ed, r) => gaejoLine(ed, r, 1) },
    { group: G, label: '- 세부 항목', hint: '3단계', keywords: '대시 개조식', run: (ed, r) => gaejoLine(ed, r, 2) },
    { group: G, label: '※ 참고', hint: '주석', keywords: '참고 주석 쌀', run: (ed, r) => gaejoLine(ed, r, 1, '※') },
    {
      group: G, label: '공문 표', hint: '위아래 굵은 선, 머리행 겹선 (3칸 × 3줄)', keywords: '표 table 공문',
      run: (ed, r) => {
        const head = ['구분', '내용', '비고'].map((t) => `<th style="background:#EDEDED"><span style="font-size:12pt">${t}</span></th>`).join('');
        const row = `<tr>${'<td align="center"><span style="font-size:12pt">○○</span></td>'.repeat(3)}</tr>`;
        insertHtmlAt(ed, r, md(`<table data-style="공문"><tr>${head}</tr>${row}${row}</table>`));
      },
    },
    {
      group: G, label: '단위 표시', hint: '표 위 오른쪽 (단위: ○○)', keywords: '단위 unit',
      run: (ed, r) => insertHtmlAt(ed, r, md('<p align="right"><span style="font-size:11pt">(단위: ○○)</span></p>')),
    },
    {
      group: G, label: '절차 표', hint: '① → ② → ③ → ④ 한 줄', keywords: '절차 단계 흐름 process',
      run: (ed, r) => {
        const cells = ['①', '②', '③', '④'].map((n) => `<td width="25%" align="center" style="background:#F2F2F2"><span style="font-size:12pt">${n} ○○</span></td>`).join('');
        insertHtmlAt(ed, r, md(`<table data-style="기본"><tr>${cells}</tr></table>`));
      },
    },
    {
      group: G, label: '붙임 · 끝', hint: '붙임  1. ○○ 1부.  끝.', keywords: '붙임 끝 첨부',
      run: (ed, r) => insertHtmlAt(ed, r, md('<p>붙임  1. ○○ 1부.  끝.</p>')),
    },
  ];
}

// ── 상용구 ───────────────────────────────────────────────
export interface Snippet {
  name: string;
  content: JSONContent[];
  preview: string;
  created: string;
}
const STORE = 'hanword.snippets';

export function loadSnippets(): Snippet[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveSnippets(list: Snippet[]) {
  localStorage.setItem(STORE, JSON.stringify(list));
}

export function snippetItems(): MenuItem[] {
  return loadSnippets().map((s) => ({
    group: '내 상용구',
    label: s.name,
    hint: s.preview,
    keywords: '상용구 snippet',
    run: (ed, r) => ed.chain().focus().deleteRange(r).insertContent(s.content).run(),
  }));
}

/** 선택한 내용을 상용구로 등록 */
export async function registerSnippet(editor: Editor, notify: (msg: string, err?: boolean) => void) {
  const { state } = editor;
  if (state.selection.empty) return notify('상용구로 등록할 내용을 먼저 선택하세요', true);
  const slice = state.selection.content();
  const content = (slice.content.toJSON() ?? []) as JSONContent[];
  const preview = state.doc.textBetween(state.selection.from, state.selection.to, ' ').replace(/\s+/g, ' ').slice(0, 40);
  const name = await promptDialog('상용구 등록', '준말 (이 말을 치고 Alt+I 를 누르면 펼쳐집니다)', '', '예: 보고끝');
  if (!name) return;
  if (/\s/.test(name)) return notify('준말에는 띄어쓰기를 넣을 수 없습니다', true);
  const list = loadSnippets().filter((s) => s.name !== name);
  list.unshift({ name, content, preview, created: new Date().toISOString() });
  saveSnippets(list);
  notify(`상용구 "${name}" 등록 — "${name}" 을 치고 Alt+I, 또는 / 메뉴에서 넣기`);
}

/** 커서 앞 준말을 펼친다. 준말이 없으면 목록을 연다 */
export function expandSnippet(editor: Editor, notify: (msg: string, err?: boolean) => void): void {
  const { state } = editor;
  const $from = state.selection.$from;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const word = before.match(/(\S+)$/)?.[1];
  const hit = word ? loadSnippets().find((s) => s.name === word) : undefined;
  if (!hit) {
    void openSnippetList(editor);
    if (word) notify(`"${word}" 준말의 상용구가 없습니다 — 목록에서 고르세요`, true);
    return;
  }
  editor.chain().focus().deleteRange({ from: state.selection.from - word!.length, to: state.selection.from }).insertContent(hit.content).run();
}

/** Ctrl+F3 — 상용구 목록 (넣기·지우기) */
export async function openSnippetList(editor: Editor) {
  const list = loadSnippets();
  await listDialog(
    '상용구 — 고르면 커서 자리에 넣습니다',
    list.map((s) => ({
      label: s.name,
      sub: s.preview,
      pick: () => editor.chain().focus().insertContent(s.content).run(),
      action: { text: '지우기', run: () => saveSnippets(loadSnippets().filter((x) => x.name !== s.name)) },
    })),
    '등록된 상용구가 없습니다. 내용을 선택하고 Alt+I 를 누르면 등록됩니다.',
  );
}

