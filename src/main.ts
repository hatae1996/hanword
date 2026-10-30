import './style.css';
import { Editor } from '@tiptap/core';
import { ALL_FONTS, DEFAULT_FONT, DEFAULT_PAGE, DEFAULT_SIZE_PT, HANCOM_ONLY_FONTS, keepHfOffEdge } from './model/defaults';
import type { PageNumber, PageSetup, Paragraph } from './model/types';
import { tiptapToDoc } from './model/fromTiptap';
import { docToTiptap } from './model/toTiptap';
import { docToDocx } from './export/docx';
import { docToHwpx } from './export/hwpx';
import { readDocx } from './import/docx';
import { readHwpx } from './import/hwpx';
import { loadRhwpBrowser, readHwp } from './import/hwp';
import { schemaExtensions } from './editor/extensions';
import { FontSizeStep, stepFontSize } from './editor/fontSizeStep';
import { setupZoom } from './editor/zoom';
import { MarkdownPaste } from './editor/markdownPaste';
import { Blanks, goToBlank } from './editor/blanks';
import { sumTable } from './editor/tableSum';
import { BORDER_PRESETS, applyBorderPreset } from './editor/cellBorders';
import { stepLetterSpacing } from './editor/letterSpacing';
import { FindReplace, clearFind, findState, replaceAll, replaceCurrent, setQuery, step as findStep } from './editor/findReplace';
import { markdownToDoc } from './ai/markdown';
import { Gaejo } from './editor/gaejo';
import { TableKeys } from './editor/tableKeys';
import { clearFormatCopy, formatCopy, formatCopyAll, formatPaste, onFormatCopyChange } from './editor/formatCopy';
import { SlashMenu } from './editor/slashMenu';
import { expandSnippet, openSnippetList, registerSnippet, reportParts, snippetItems } from './editor/parts';
import { generateJSON } from '@tiptap/html';
import { safeFileName } from './save';
import {
  IMAGE_EXTS, askSavePath, baseName, confirmDialog, download, extOf, isDesktop, pickFile, pickImages, printDoc, readPath, setWindowTitle, wireDesktop, writePath,
  type Format, type OpenedFile,
} from './platform';
import { SAMPLE_HTML } from './sample';
import { applyPrintPage } from './ui/print';
import { polishDialog } from './ui/polishDialog';
import { ruleModes } from './ui/polishModes';
import { aiModes } from './ui/aiModes';
import { applyTexts, replaceRange, replaceWithItems, selectedBlocks } from './editor/polish';
import { appVersion, checkForUpdates } from './updater';
import { clearRecovery, loadRecovery, setupAutosave } from './autosave';
import { addRecent, recentFiles, removeRecent, whenText } from './recent';
import { setupNavPane } from './ui/navpane';
import { headerFooterDialog, pageNumberDialog, pageSetupDialog, paraShapeDialog } from './ui/pageDialogs';
import { PageBreak } from './editor/pageBreak';
import { availableWidthMm, imageAttrs, photoSheetHtml, prepareImage, resizeImageDialog } from './ui/images';
import { contentWidthMm } from './model/defaults';
import { listDialog, promptDialog } from './ui/dialog';
import { BUILTIN_TEMPLATES, deleteMyTemplate, myTemplates, saveMyTemplate, type MyTemplate } from './ui/templates';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let loading = false; // 파일을 불러오는 중에는 '수정됨' 으로 표시하지 않는다
let autosave: ReturnType<typeof setupAutosave> | undefined; // 아래 '자동 저장·복구' 에서 만든다
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

// ── 편집기 ─────────────────────────────────────────────
// 문서 구조는 editor/extensions.ts (AI 변환기와 공유)
const editor = new Editor({
  element: $('editor'),
  extensions: [
    ...schemaExtensions({
      resizableTables: true,
      image: {
        onEdit: (pos) => void resizeImageDialog(editor, pos),
        onFiles: (files, pos) => void insertImageFiles(files.map((f) => f), pos),
      },
    }),
    FontSizeStep,
    Blanks.configure({ onCount: (n) => queueMicrotask(() => showBlanks(n)) }),
    FindReplace,
    Gaejo,
    PageBreak,
    TableKeys.configure({ calc: (o) => calc(o) }),
    SlashMenu.configure({
      items: () => [
        ...reportParts(),
        { group: '보고서 부품', label: '그림', hint: '파일에서 그림 넣기 (Ctrl+N, I)', keywords: '그림 사진 image', run: (ed, r) => (ed.chain().focus().deleteRange(r).run(), void pickAndInsertImages()) },
        { group: '보고서 부품', label: '사진대지', hint: '사진 여러 장을 표에 2장씩 + 설명', keywords: '사진대지 사진 photo', run: (ed, r) => (ed.chain().focus().deleteRange(r).run(), void makePhotoSheet()) },
        ...snippetItems(),
      ],
    }),
    MarkdownPaste.configure({
      onConverted: (w) =>
        toast(`AI 글(마크다운)을 서식으로 바꿔 붙여넣었습니다${w.length ? ` · 빠진 요소: ${w.join(', ')}` : ''} — 글자 그대로는 Ctrl+Shift+V`),
    }),
  ],
  // 브라우저 데모는 예시 문서로, 데스크톱 앱은 빈 문서로 시작
  content: isDesktop ? '<p></p>' : SAMPLE_HTML,
  onUpdate: () => {
    if (!loading) markDirty(true);
    refresh();
  },
  onSelectionUpdate: () => refresh(),
});

// ── 리본 채우기 ─────────────────────────────────────────
const fontSel = $<HTMLSelectElement>('font-family');
for (const f of ALL_FONTS) {
  const o = new Option((HANCOM_ONLY_FONTS as readonly string[]).includes(f) ? `${f} (한글 전용)` : f, f);
  o.style.fontFamily = `'${f}'`;
  fontSel.add(o);
}
const sizeSel = $<HTMLSelectElement>('font-size');
for (const s of SIZES) sizeSel.add(new Option(String(s), String(s)));

const chain = () => editor.chain().focus();
const commands: Record<string, () => void> = {
  undo: () => chain().undo().run(),
  redo: () => chain().redo().run(),
  'size-up': () => { editor.commands.focus(); stepFontSize(editor, 1); },
  'size-down': () => { editor.commands.focus(); stepFontSize(editor, -1); },
  bold: () => chain().toggleBold().run(),
  italic: () => chain().toggleItalic().run(),
  underline: () => chain().toggleUnderline().run(),
  strike: () => chain().toggleStrike().run(),
  'align-left': () => chain().setTextAlign('left').run(),
  'align-center': () => chain().setTextAlign('center').run(),
  'align-right': () => chain().setTextAlign('right').run(),
  'align-justify': () => chain().setTextAlign('justify').run(),
  bullet: () => chain().toggleBulletList().run(),
  ordered: () => chain().toggleOrderedList().run(),
  table: () => {
    // 표 안의 표는 저장기가 아직 지원하지 않으므로 화면에서도 막는다 (화면 = 저장 결과 원칙)
    if (editor.isActive('table')) return toast('표 안에는 표를 넣을 수 없습니다. 표 바깥에 커서를 두세요.', true);
    chain().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();
  },
  'row-after': () => chain().addRowAfter().run(),
  'col-after': () => chain().addColumnAfter().run(),
  merge: () => chain().mergeCells().run(),
  split: () => chain().splitCell().run(),
  'row-del': () => chain().deleteRow().run(),
  'col-del': () => chain().deleteColumn().run(),
  'table-del': () => chain().deleteTable().run(),
  'cell-nocolor': () => chain().setCellAttribute('backgroundColor', null).run(),
  'spacing-down': () => stepSpacing(-1),
  'spacing-up': () => stepSpacing(1),
  parts: () => {
    // 빈 줄이면 그 자리에, 글이 있으면 새 줄을 만들고 / 를 쳐서 부품 메뉴를 연다
    const { $from } = editor.state.selection;
    const c = chain();
    if ($from.parent.textContent.trim()) c.splitBlock();
    c.insertContent('/').run();
  },
  sum: () => calc({ op: 'sum' }),
  avg: () => calc({ op: 'avg' }),
  'format-copy': () => void formatCopy(editor, toast),
  'page-number': () => void editPageNumber(),
  'header-footer': () => void editHeaderFooter(),
  'page-setup': () => void editPageSetup(),
  'para-shape': () => void paraShapeDialog(editor),
  image: () => void pickAndInsertImages(),
  'photo-sheet': () => void makePhotoSheet(),
  polish: () => void openPolish(),
};

// ── 문장 다듬기 (공문체·개조식, AI) ──────────────────────
async function openPolish(first?: string) {
  const blocks = selectedBlocks(editor);
  if (!blocks.some((b) => b.text.trim())) return toast('다듬을 문단을 선택하거나 문단 안에 커서를 두세요', true);
  const r = await polishDialog(blocks, [...ruleModes(), ...aiModes(editor, { setTitle: (t) => { titleInput.value = t; markDirty(true); updateTitle(); } })], first);
  if (!r) return;
  const p = r.preview;
  let n = 0;
  if (p.kind === 'texts') n = applyTexts(editor, blocks, p.texts);
  else if (p.kind === 'items') n = replaceWithItems(editor, blocks, p.items);
  else if (p.kind === 'replace') n = replaceRange(editor, blocks, p.paragraphs) ? blocks.length : 0;
  else if (p.kind === 'choices' && r.choice) {
    r.mode.apply?.(r.choice, blocks, r.opts);
    n = 1;
  }
  if (p.kind === 'replace' && !n) return toast('표 칸을 넘나드는 선택은 한 번에 바꿀 수 없습니다', true);
  if (n) toast(`${r.mode.label}: ${p.kind === 'choices' ? '넣었습니다' : `${n}개 문단을 바꿨습니다`} (Ctrl+Z 로 되돌리기)`);
  editor.commands.focus();
}
document.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => {
  b.type = 'button';
  b.addEventListener('mousedown', (e) => e.preventDefault()); // 선택 영역 유지
  b.addEventListener('click', () => commands[b.dataset.cmd!]?.());
});

$<HTMLSelectElement>('block-type').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v === 'p') chain().setParagraph().run();
  else chain().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
});
fontSel.addEventListener('change', () => {
  if (fontSel.value === DEFAULT_FONT) chain().unsetFontFamily().run();
  else chain().setFontFamily(fontSel.value).run();
});
sizeSel.addEventListener('change', () => chain().setFontSize(`${sizeSel.value}pt`).run());
const colorInput = $<HTMLInputElement>('font-color');
colorInput.addEventListener('input', () => {
  chain().setColor(colorInput.value).run();
  $('color-swatch').style.borderBottomColor = colorInput.value;
});

// ── 그림 · 사진대지 ──────────────────────────────────────
async function insertPrepared(files: { name: string; bytes: Uint8Array }[], pos: number | null = null) {
  const bad: string[] = [];
  const nodes: object[] = [];
  const max = availableWidthMm(editor, contentWidthMm(state.page));
  for (const f of files) {
    const p = await prepareImage(f.bytes);
    if (!p) bad.push(f.name);
    else nodes.push({ type: 'image', attrs: imageAttrs(p, max) });
  }
  if (nodes.length) {
    const c = editor.chain().focus();
    if (pos !== null) c.insertContentAt(pos, nodes);
    else c.insertContent(nodes);
    c.run();
  }
  if (bad.length) toast(`그림으로 읽을 수 없는 파일: ${bad.join(', ')} (PNG·JPEG·GIF·BMP·WebP 만)`, true);
  else if (nodes.length) toast(`그림 ${nodes.length}장을 넣었습니다 — 두 번 누르면 크기 바꾸기`);
}
async function insertImageFiles(files: File[], pos: number | null) {
  await insertPrepared(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), pos);
}
async function pickAndInsertImages() {
  const files = await pickImages(true);
  if (files.length) await insertPrepared(files);
}
async function makePhotoSheet() {
  if (editor.isActive('table')) return toast('사진대지는 표 바깥에서 만드세요 (표 안의 표는 저장할 수 없음)', true);
  const files = await pickImages(true);
  if (!files.length) return;
  const pics = (await Promise.all(files.map((f) => prepareImage(f.bytes)))).filter((p): p is NonNullable<typeof p> => !!p);
  if (!pics.length) return toast('그림으로 읽을 수 없는 파일입니다', true);
  const html = await photoSheetHtml(pics, contentWidthMm(state.page));
  if (html) {
    chain().insertContent(html).run();
    toast(`사진 ${pics.length}장으로 사진대지를 만들었습니다 — "사진 N. ○○" 은 Tab 으로 채우세요`);
  }
}

function calc(opts: Parameters<typeof sumTable>[1]) {
  const r = sumTable(editor, opts);
  toast(r.message, !r.ok);
  editor.commands.focus();
}

function stepSpacing(delta: number) {
  const v = stepLetterSpacing(editor, delta);
  if (v !== null) toast(`자간 ${v}%`);
  editor.commands.focus();
}

const borderSel = $<HTMLSelectElement>('cell-border');
for (const [key, p] of Object.entries(BORDER_PRESETS)) borderSel.add(new Option(p.label, key));
borderSel.addEventListener('change', () => {
  const key = borderSel.value;
  borderSel.value = '';
  if (key && !applyBorderPreset(editor, key)) toast('표 안의 칸을 선택하세요', true);
  editor.commands.focus();
});

const cellColor = $<HTMLInputElement>('cell-color');
cellColor.addEventListener('input', () => {
  chain().setCellAttribute('backgroundColor', cellColor.value.toUpperCase()).run();
  $('cell-color-chip').style.background = cellColor.value;
});

// ── 현재 서식을 리본에 반영 ───────────────────────────────
function refresh() {
  const on = (cmd: string, active: boolean) => document.querySelector(`[data-cmd="${cmd}"]`)?.classList.toggle('on', active);
  on('bold', editor.isActive('bold'));
  on('italic', editor.isActive('italic'));
  on('underline', editor.isActive('underline'));
  on('strike', editor.isActive('strike'));
  on('bullet', editor.isActive('bulletList'));
  on('ordered', editor.isActive('orderedList'));
  const align = (['left', 'center', 'right', 'justify'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'justify';
  for (const a of ['left', 'center', 'right', 'justify']) on(`align-${a}`, a === align);

  const level = [1, 2, 3].find((l) => editor.isActive('heading', { level: l }));
  $<HTMLSelectElement>('block-type').value = level ? String(level) : 'p';

  const ts = editor.getAttributes('textStyle');
  const font = typeof ts.fontFamily === 'string' ? ts.fontFamily.replace(/["']/g, '').split(',')[0].trim() : DEFAULT_FONT;
  fontSel.value = ALL_FONTS.includes(font) ? font : DEFAULT_FONT;
  const defaultSize = level ? { 1: 16, 2: 14, 3: 12 }[level]! : DEFAULT_SIZE_PT;
  const size = typeof ts.fontSize === 'string' ? Math.round(parseFloat(ts.fontSize) * (ts.fontSize.endsWith('px') ? 0.75 : 1)) : defaultSize;
  if (![...sizeSel.options].some((o) => o.value === String(size))) sizeSel.add(new Option(String(size), String(size)));
  sizeSel.value = String(size);
  const color = typeof ts.color === 'string' && /^#[0-9a-f]{6}$/i.test(ts.color) ? ts.color : '#000000';
  colorInput.value = color;
  $('color-swatch').style.borderBottomColor = color;

  const inTable = editor.isActive('table');
  $('table-tools').hidden = !inTable;
  (document.querySelector('[data-cmd="table"]') as HTMLButtonElement).disabled = inTable;
  const chars = editor.state.doc.textContent.length;
  $('stat-chars').textContent = `${chars.toLocaleString('ko-KR')}자`;
}
refresh();

// ── 상태 메시지 ──────────────────────────────────────────
let toastTimer = 0;
function toast(msg: string, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.textContent = ''), 6000);
}

// ── 현재 파일 상태 ───────────────────────────────────────
interface FileState {
  path?: string; // 데스크톱 앱에서 연/저장한 파일 경로
  fileName?: string; // 브라우저에서 연 파일 이름
  format?: Format;
  dirty: boolean;
  page: PageSetup;
  header?: Paragraph[];
  footer?: Paragraph[];
  pageNumber?: PageNumber;
  /** 열 때 지원하지 않아 빠진 요소 — 원본에 덮어쓰기 전에 경고 */
  dropped: string[];
}
const state: FileState = { dirty: false, page: { ...DEFAULT_PAGE }, dropped: [] };
const titleInput = $<HTMLInputElement>('doc-title');
if (!titleInput.value) titleInput.value = isDesktop ? '새 문서' : '2026년 4분기 사업 추진 계획';

function markDirty(d: boolean) {
  state.dirty = d;
  if (!d) void autosave?.reset();
  updateTitle();
}
function updateTitle() {
  const name = state.path ? baseName(state.path) : titleInput.value.trim() || '새 문서';
  void setWindowTitle(`${state.dirty ? '● ' : ''}${name} - HanWord`);
  const where = state.path ?? state.fileName;
  $('stat-file').textContent = where ? `${where}${state.dirty ? ' (수정됨)' : ''}` : state.dirty ? '저장 안 됨' : '새 문서';
}
titleInput.addEventListener('input', () => markDirty(true));

/** 쪽 설정을 종이에 반영 (한글 방식: 본문 시작 = 위 여백 + 머리말) */
function applyPage(p: PageSetup) {
  const page = $('page');
  page.style.width = `${p.widthMm}mm`;
  page.style.minHeight = `${p.heightMm}mm`;
  page.style.padding = `${p.marginTopMm + p.headerMm}mm ${p.marginRightMm}mm ${p.marginBottomMm + p.footerMm}mm ${p.marginLeftMm}mm`;
  const r = $('ruler');
  r.style.width = `${p.widthMm * (zoomCtl?.get() ?? 1)}mm`;
  const f = (n: number) => String(Math.round(n * 10) / 10);
  const paper = Math.round(p.widthMm) === 210 && Math.round(p.heightMm) === 297 ? 'A4' : Math.round(p.widthMm) === 297 && Math.round(p.heightMm) === 210 ? 'A4 가로' : '용지';
  r.textContent = `${paper} · ${f(p.widthMm)} × ${f(p.heightMm)} mm · 여백 위 ${f(p.marginTopMm)}(+머리말 ${f(p.headerMm)}) · 좌 ${f(p.marginLeftMm)} · 우 ${f(p.marginRightMm)} · 아래 ${f(p.marginBottomMm)}(+꼬리말 ${f(p.footerMm)})`;
  renderHeaderFooter();
}

/** 종이 위·아래에 머리말·꼬리말·쪽 번호 미리 보기 (실제 쪽 나눔은 한글·Word 가 한다) */
function renderHeaderFooter() {
  const p = state.page;
  const top = $('page-top');
  const bottom = $('page-bottom');
  for (const [el, mm] of [[top, p.marginTopMm], [bottom, p.marginBottomMm]] as const) {
    el.style.left = `${p.marginLeftMm}mm`;
    el.style.right = `${p.marginRightMm}mm`;
    if (el === top) el.style.top = `${mm}mm`;
    else el.style.bottom = `${mm}mm`;
    el.querySelectorAll('span').forEach((s) => (s.textContent = ''));
  }
  const put = (el: HTMLElement, ps: Paragraph[] | undefined) => {
    if (!ps?.length) return;
    const text = ps.map((x) => x.inlines.map((i) => (i.kind === 'text' ? i.text : ' ')).join('')).join(' ');
    const al = ps[0].style.align;
    el.querySelector(al === 'center' ? '.c' : al === 'right' ? '.r' : '.l')!.textContent = text;
  };
  put(top, state.header);
  put(bottom, state.footer);
  const pn = state.pageNumber;
  if (pn) {
    const el = pn.pos.startsWith('top') ? top : bottom;
    const slot = el.querySelector<HTMLElement>(pn.pos.endsWith('right') ? '.r' : '.c')!;
    slot.textContent = `${slot.textContent ? `${slot.textContent}  ` : ''}${pn.dash ? '- 1 -' : '1'}`;
  }
  top.hidden = !state.header?.length && !pn?.pos.startsWith('top');
  bottom.hidden = !state.footer?.length && !pn?.pos.startsWith('bottom');
  applyPrintPage({ page: p, header: state.header, footer: state.footer, pageNumber: pn });
}

/** 머리말 자리(위)·꼬리말 자리(아래)에 찍을 것이 있는가 */
function hfUse() {
  const pn = state.pageNumber?.pos;
  return { top: !!state.header?.length || !!pn?.startsWith('top'), bottom: !!state.footer?.length || !!pn?.startsWith('bottom') };
}
/** 쪽 번호·머리말·꼬리말을 새로 넣었는데 종이 끝에 붙는 여백이면 안쪽으로 */
function keepEdgeAfterEdit() {
  const fixed = keepHfOffEdge(state.page, hfUse());
  if (!fixed) return;
  state.page = fixed;
  applyPage(fixed);
}

async function editPageNumber() {
  const r = await pageNumberDialog(state.pageNumber);
  if (!r) return;
  state.pageNumber = r.value;
  keepEdgeAfterEdit();
  renderHeaderFooter();
  markDirty(true);
  toast(r.value ? `쪽 번호: ${r.value.pos.startsWith('top') ? '위' : '아래'} ${r.value.pos.endsWith('right') ? '오른쪽' : '가운데'} ${r.value.dash ? '"- 1 -"' : '"1"'}` : '쪽 번호를 없앴습니다');
}
async function editHeaderFooter() {
  const r = await headerFooterDialog(state.header, state.footer);
  if (!r) return;
  state.header = r.header;
  state.footer = r.footer;
  keepEdgeAfterEdit();
  renderHeaderFooter();
  markDirty(true);
}
async function editPageSetup() {
  const p = await pageSetupDialog(state.page);
  if (!p) return;
  state.page = p;
  applyPage(p);
  markDirty(true);
}
// ── 화면 확대/축소 (Ctrl+휠) ─────────────────────────────
let zoomCtl: ReturnType<typeof setupZoom> | undefined;
zoomCtl = setupZoom({
  desk: $('desk'),
  page: $('page'),
  onChange: (z) => {
    $('zoom-reset').textContent = `${Math.round(z * 100)}%`;
    $('ruler').style.width = `${state.page.widthMm * z}mm`;
  },
});
$('zoom-in').addEventListener('click', () => zoomCtl!.step(1));
$('zoom-out').addEventListener('click', () => zoomCtl!.step(-1));
$('zoom-reset').addEventListener('click', () => zoomCtl!.set(1));

applyPage(state.page);
updateTitle();

// ── 저장 ────────────────────────────────────────────────
function currentDoc() {
  const doc = tiptapToDoc(editor.getJSON(), titleInput.value.trim() || '문서', state.page);
  if (state.header?.length) doc.header = state.header;
  if (state.footer?.length) doc.footer = state.footer;
  if (state.pageNumber) doc.pageNumber = state.pageNumber;
  return doc;
}
async function encode(format: Format) {
  const doc = currentDoc();
  return format === 'hwpx' ? docToHwpx(doc) : docToDocx(doc);
}
let busy = false;
async function withBusy(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  document.querySelectorAll<HTMLButtonElement>('.file-actions .btn').forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(`작업하지 못했습니다: ${(e as Error).message ?? e}`, true);
  } finally {
    busy = false;
    document.querySelectorAll<HTMLButtonElement>('.file-actions .btn').forEach((b) => (b.disabled = false));
  }
}

/** 다른 이름으로 저장 (형식 지정) */
async function saveAs(format: Format) {
  await withBusy(async () => {
    const name = safeFileName(titleInput.value);
    if (!isDesktop) {
      toast(await download(name, format, await encode(format)));
      markDirty(false);
      return;
    }
    const path = await askSavePath(state.path ? baseName(state.path).replace(/\.[^.]+$/, '') : name, format);
    if (!path) return;
    await writePath(path, await encode(format));
    Object.assign(state, { path, fileName: baseName(path), format, dropped: [] });
    addRecent(path, baseName(path));
    markDirty(false);
    toast(`${baseName(path)} 저장됨`);
  });
}

/** 저장 (Ctrl+S): 연 파일이 있으면 그 파일에, 없으면 한글 형식으로 새로 저장 */
async function saveCurrent() {
  if (!isDesktop || !state.path || !state.format) return saveAs(state.format ?? 'hwpx');
  if (state.dropped.length) {
    const overwrite = await confirmDialog(
      `이 문서에는 HanWord 가 아직 지원하지 않는 요소(${state.dropped.join(', ')})가 있어,\n원본에 저장하면 그 부분이 사라집니다.\n\n원본을 덮어쓸까요?`,
      '덮어쓰기',
      '다른 이름으로 저장',
    );
    if (!overwrite) return saveAs(state.format);
  }
  await withBusy(async () => {
    await writePath(state.path!, await encode(state.format!));
    addRecent(state.path!, baseName(state.path!));
    state.dropped = [];
    markDirty(false);
    toast(`${baseName(state.path!)} 저장됨`);
  });
}

$('save-doc').addEventListener('click', () => saveCurrent());
$('print-doc').addEventListener('click', () => void printDoc());
$('save-hwpx').addEventListener('click', () => saveAs('hwpx'));
$('save-docx').addEventListener('click', () => saveAs('docx'));

// ── 열기 / 새 문서 ───────────────────────────────────────
async function confirmDiscard(): Promise<boolean> {
  if (!state.dirty) return true;
  if (isDesktop) return confirmDialog('저장하지 않은 변경 내용이 있습니다.\n저장하지 않고 계속할까요?', '저장하지 않고 계속', '취소');
  return true;
}

async function loadFile(file: OpenedFile) {
  const ext = extOf(file.name);
  if (ext === 'doc') return toast('구형 .doc 파일은 열 수 없습니다. Word 에서 .docx 로 저장한 뒤 여세요.', true);
  if (ext !== 'hwpx' && ext !== 'docx' && ext !== 'md' && ext !== 'hwp') return toast('한글(.hwpx·.hwp), Word(.docx), 마크다운(.md) 파일만 열 수 있습니다.', true);
  if (ext === 'hwp') toast('구형 .hwp 를 여는 중입니다… (처음 한 번은 몇 초 걸립니다)');
  const title = file.name.replace(/\.[^.]+$/, '');
  const { doc, warnings } =
    ext === 'hwpx'
      ? await readHwpx(file.bytes, title)
      : ext === 'hwp'
        ? await readHwp(file.bytes, title, loadRhwpBrowser)
        : ext === 'docx'
        ? await readDocx(file.bytes, title)
        : markdownToDoc(new TextDecoder().decode(file.bytes), (html) => generateJSON(html, schemaExtensions()) as any, title);
  loading = true;
  try {
    editor.commands.setContent(docToTiptap(doc) as any);
  } finally {
    loading = false;
  }
  editor.commands.focus('start');
  // 마크다운·구형 .hwp 는 "가져오기" — 저장할 때 한글(.hwpx)/Word 형식을 고른다 (원본을 덮어쓰지 않음)
  const imported = ext === 'md' || ext === 'hwp';
  Object.assign(state, {
    path: imported ? undefined : file.path,
    fileName: file.name,
    format: imported ? undefined : (ext as Format),
    page: doc.page,
    header: doc.header,
    footer: doc.footer,
    pageNumber: doc.pageNumber,
    dropped: imported ? [] : warnings,
  });
  // 쪽 번호·꼬리말이 종이 끝에 붙어 있으면(인쇄하면 맨 밑에 찍히거나 잘림) 10mm 안쪽으로
  const edgeFixed = keepHfOffEdge(doc.page, hfUse());
  if (edgeFixed) state.page = edgeFixed;
  titleInput.value = doc.title || title;
  if (file.path && !imported) addRecent(file.path, file.name);
  applyPage(state.page);
  markDirty(imported || !!edgeFixed);
  refresh();
  const edgeNote = edgeFixed ? ' · 쪽 번호·꼬리말이 종이 끝에 붙어 있어 10mm 안쪽으로 옮겼습니다(본문 자리는 그대로, 저장하면 반영)' : '';
  if (imported) toast(`${file.name} 을(를) 가져왔습니다 — ${ext === 'hwp' ? '구형 .hwp 는 그대로 두고, ' : ''}한글로 저장(.hwpx) / Word로 저장 을 누르세요${warnings.length ? ` · 빠진 요소: ${warnings.join(', ')}` : ''}${edgeNote}`);
  else toast(`${warnings.length ? `${file.name} 열림 · 아직 지원하지 않아 빠진 요소: ${warnings.join(', ')}` : `${file.name} 열림`}${edgeNote}`, warnings.length > 0);
}

async function openDialog() {
  if (!(await confirmDiscard())) return;
  await withBusy(async () => {
    const f = await pickFile();
    if (f) await loadFile(f);
  });
}
async function openPath(path: string) {
  if (!(await confirmDiscard())) return;
  await withBusy(async () => loadFile(await readPath(path)));
}

async function newDoc() {
  if (!(await confirmDiscard())) return;
  loading = true;
  editor.commands.setContent('<p></p>');
  loading = false;
  Object.assign(state, { path: undefined, fileName: undefined, format: undefined, page: { ...DEFAULT_PAGE }, header: undefined, footer: undefined, pageNumber: undefined, dropped: [] });
  titleInput.value = '새 문서';
  applyPage(state.page);
  markDirty(false);
  editor.commands.focus();
}
// ── 양식 모음 ────────────────────────────────────────────
function startFrom(json: unknown, title: string, page: PageSetup, extra: { header?: Paragraph[]; footer?: Paragraph[]; pageNumber?: PageNumber }) {
  loading = true;
  editor.commands.setContent(json as any);
  loading = false;
  Object.assign(state, { path: undefined, fileName: undefined, format: undefined, page: { ...page }, dropped: [], ...extra });
  titleInput.value = title;
  applyPage(state.page);
  markDirty(false);
  refresh();
  editor.commands.focus('start');
  goToBlank(editor, 1); // 첫 빈칸(○○)으로
}
async function openTemplates() {
  const mine = await myTemplates();
  const gen = (html: string) => generateJSON(html, schemaExtensions()) as any;
  await listDialog('양식으로 새 문서', [
    ...BUILTIN_TEMPLATES.map((t) => ({
      label: t.name,
      sub: t.hint,
      pick: async () => {
        if (!(await confirmDiscard())) return;
        const { doc } = markdownToDoc(t.markdown, gen, t.name);
        startFrom(docToTiptap(doc), doc.title, doc.page, { header: doc.header, footer: doc.footer, pageNumber: doc.pageNumber });
        toast(`"${t.name}" 양식 — Tab 으로 ○○ 빈칸을 차례로 채우세요`);
      },
    })),
    ...mine.map((t: MyTemplate) => ({
      label: `★ ${t.name}`,
      sub: `내 양식 · ${new Date(t.savedAt).toLocaleDateString('ko-KR')}`,
      pick: async () => {
        if (!(await confirmDiscard())) return;
        startFrom(t.json, t.title, t.page as PageSetup, { header: t.header as Paragraph[], footer: t.footer as Paragraph[], pageNumber: t.pageNumber as PageNumber });
        toast(`"${t.name}" 내 양식으로 새 문서`);
      },
      action: { text: '지우기', run: () => void deleteMyTemplate(t.name) },
    })),
    {
      label: '+ 지금 문서를 내 양식으로 저장…',
      sub: '글자·표·쪽 설정을 그대로 보관합니다 (이 PC)',
      pick: async () => {
        const name = await promptDialog('내 양식으로 저장', '양식 이름', titleInput.value.trim());
        if (!name) return;
        await saveMyTemplate({
          name, savedAt: new Date().toISOString(), json: editor.getJSON(), title: titleInput.value,
          page: state.page, header: state.header, footer: state.footer, pageNumber: state.pageNumber,
        });
        toast(`"${name}" 을(를) 내 양식으로 저장했습니다 — 양식 버튼에서 고르세요`);
      },
    },
  ]);
}
$('templates').addEventListener('click', () => void openTemplates());

$('open-doc').addEventListener('click', () => openDialog());
$('new-doc').addEventListener('click', () => newDoc());

// ── 단축키 ───────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  // 한글 단축키: Alt+I 상용구 (선택 → 등록, 준말 → 펼치기), Ctrl+F3 상용구 목록
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyI') {
    e.preventDefault();
    if (editor.state.selection.empty) expandSnippet(editor, toast);
    else void registerSnippet(editor, toast);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'F3') {
    e.preventDefault();
    void openSnippetList(editor);
    return;
  }
  // 모양 복사: Alt+C (한글), Ctrl+Alt+C / Ctrl+Alt+V (Word)
  if (e.code === 'KeyC' && e.altKey && !e.shiftKey && !e.metaKey) {
    e.preventDefault();
    if (e.ctrlKey) formatCopyAll(editor, toast);
    else void formatCopy(editor, toast);
    return;
  }
  if (e.code === 'KeyV' && e.altKey && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    formatPaste(editor, toast);
    return;
  }
  if (e.key === 'Escape' && !document.querySelector('dialog[open]') && clearFormatCopy()) {
    toast('모양 복사를 끝냈습니다');
    return;
  }
  // 한글 단축키: Alt+V 다른 이름으로 저장
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyV' || e.key.toLowerCase() === 'v')) {
    e.preventDefault();
    void saveAs(state.format ?? 'hwpx');
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's' || e.code === 'KeyS') {
    e.preventDefault();
    // 표 안의 Ctrl+Shift+S 는 블록 합계 (편집기 tableKeys 가 먼저 처리), 표 밖에서는 다른 이름으로 저장
    if (e.shiftKey && editor.isActive('table')) return;
    else if (e.shiftKey) void saveAs(state.format ?? 'hwpx');
    else void saveCurrent();
  } else if (k === 'f' || e.code === 'KeyF') {
    e.preventDefault();
    openFind(false);
  } else if (k === 'h' || e.code === 'KeyH') {
    e.preventDefault();
    openFind(true);
  } else if (k === 'o') {
    e.preventDefault();
    void openDialog();
  } else if ((k === 'g' || e.code === 'KeyG') && e.shiftKey && !e.altKey) {
    e.preventDefault();
    void openPolish();
  } else if ((k === 'p' || e.code === 'KeyP') && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    void printDoc();
  }
});

// 한글 단축키 (먼저 가로챔 — 편집기에 글자가 들어가지 않도록)
//  Ctrl+N 다음 P 쪽 번호 · H 머리말/꼬리말 · T 표 · N(또는 잠시 기다리면) 새 문서
//  F7 편집 용지 · Alt+T 문단 모양 · Alt+N 새 문서
let chord = 0;
window.addEventListener(
  'keydown',
  (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (chord) {
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      clearTimeout(chord);
      chord = 0;
      e.preventDefault();
      e.stopPropagation();
      const run = chordKeys[e.code] ?? (e.key === 'Enter' ? chordKeys.KeyN : undefined);
      if (run) run();
      else toast('');
      return;
    }
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    const altOnly = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyN') {
      e.preventDefault();
      e.stopPropagation();
      chord = window.setTimeout(() => {
        chord = 0;
        toast('');
        void newDoc();
      }, 1200);
      toast('Ctrl+N — 이어서 P 쪽 번호 · H 머리말/꼬리말 · T 표 · N 새 문서');
    } else if (plain && e.key === 'F7') {
      e.preventDefault();
      void editPageSetup();
    } else if (altOnly && e.code === 'KeyT') {
      e.preventDefault();
      e.stopPropagation();
      void paraShapeDialog(editor);
    } else if (altOnly && e.code === 'KeyN') {
      e.preventDefault();
      e.stopPropagation();
      void newDoc();
    }
  },
  true,
);
const chordKeys: Record<string, () => void> = {
  KeyI: () => void pickAndInsertImages(),
  KeyP: () => void editPageNumber(),
  KeyH: () => void editHeaderFooter(),
  KeyT: () => commands.table(),
  KeyN: () => void newDoc(),
};

// ── 빈칸(○○) ────────────────────────────────────────────
function showBlanks(n: number) {
  const b = $<HTMLButtonElement>('stat-blanks');
  b.hidden = n === 0;
  b.textContent = `빈칸 ${n}개 · Tab`;
}
$('stat-blanks').addEventListener('click', () => goToBlank(editor, 1));
onFormatCopyChange((on) => ($('stat-fmt').hidden = !on));
$('stat-fmt').addEventListener('click', () => {
  clearFormatCopy();
  toast('모양 복사를 끝냈습니다');
});

// ── 찾기·바꾸기 ───────────────────────────────────────────
const findbar = $('findbar');
const findInput = $<HTMLInputElement>('find-input');
const replaceInput = $<HTMLInputElement>('replace-input');
function updateFindCount() {
  const s = findState(editor);
  const c = $('find-count');
  c.textContent = !s.query ? '' : s.matches.length ? `${s.current + 1}/${s.matches.length}` : '없음';
  c.classList.toggle('none', !!s.query && !s.matches.length);
}
function openFind(withReplace: boolean) {
  findbar.hidden = false;
  $('find-replace-row').hidden = !withReplace;
  // 선택한 글자가 있으면 그것을 찾는다
  const { from, to } = editor.state.selection;
  const picked = editor.state.doc.textBetween(from, to, ' ');
  if (picked && picked.length < 80 && !picked.includes('\n')) findInput.value = picked;
  findInput.focus();
  findInput.select();
  setQuery(editor, findInput.value);
  findInput.focus();
  updateFindCount();
}
function closeFind() {
  findbar.hidden = true;
  clearFind(editor);
  editor.commands.focus();
}
findInput.addEventListener('input', () => {
  setQuery(editor, findInput.value);
  findInput.focus();
  updateFindCount();
});
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    findStep(editor, e.shiftKey ? -1 : 1);
    findInput.focus();
    updateFindCount();
  } else if (e.key === 'Escape') closeFind();
});
replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    replaceCurrent(editor, replaceInput.value);
    replaceInput.focus();
    updateFindCount();
  } else if (e.key === 'Escape') closeFind();
});
$('find-next').addEventListener('click', () => (findStep(editor, 1), updateFindCount()));
$('find-prev').addEventListener('click', () => (findStep(editor, -1), updateFindCount()));
$('replace-one').addEventListener('click', () => (replaceCurrent(editor, replaceInput.value), updateFindCount()));
$('replace-all').addEventListener('click', () => {
  const n = replaceAll(editor, replaceInput.value);
  updateFindCount();
  toast(n ? `${n}곳을 바꿨습니다` : '바꿀 내용이 없습니다', !n);
});
$('find-toggle-replace').addEventListener('click', () => {
  const row = $('find-replace-row');
  row.hidden = !row.hidden;
  (row.hidden ? findInput : replaceInput).focus();
});
$('find-close').addEventListener('click', closeFind);
editor.on('update', () => {
  if (!findbar.hidden) updateFindCount();
});

// 브라우저: 실수로 탭을 닫을 때 경고 (데스크톱은 wireDesktop 이 처리)
window.addEventListener('beforeunload', (e) => {
  if (state.dirty && !isDesktop) e.preventDefault();
});

// 끌어다 놓은 파일: 그림이면 커서 자리에 넣고, 문서면 연다
void wireDesktop({
  isDirty: () => state.dirty,
  openPath: (path) => {
    if (IMAGE_EXTS.includes(extOf(path))) void readPath(path).then((f) => insertPrepared([f]));
    else void openPath(path);
  },
  onDiscard: clearRecovery,
});

// ── 최근 문서 (데스크톱) ─────────────────────────────────
$('recent-doc').hidden = !isDesktop;
$('recent-doc').addEventListener('click', () =>
  listDialog(
    '최근 문서',
    recentFiles().map((r) => ({
      label: r.name,
      sub: `${whenText(r.at)} · ${r.path}`,
      pick: () => void openPath(r.path),
      action: { text: '목록에서 빼기', run: () => removeRecent(r.path) },
    })),
    '아직 열거나 저장한 문서가 없습니다.',
  ),
);

// ── 탐색 창 ──────────────────────────────────────────────
const navPane = setupNavPane(editor, { pane: $('navpane'), toggle: $('nav-toggle'), onFindMove: () => updateFindCount() });

// ── 자동 저장·복구 ───────────────────────────────────────
autosave = setupAutosave({
  isDirty: () => state.dirty,
  snapshot: () => ({
    json: editor.getJSON(),
    title: titleInput.value,
    page: state.page,
    path: state.path,
    fileName: state.fileName,
    format: state.format,
    header: state.header,
    footer: state.footer,
    pageNumber: state.pageNumber,
    savedAt: new Date().toISOString(),
  }),
});
void loadRecovery().then((snap) => {
  if (!snap) return;
  const bar = $('recover-bar');
  const when = new Date(snap.savedAt);
  $('recover-text').textContent = `저장하지 않고 끝난 문서가 있습니다 — "${snap.fileName ?? snap.title}" (${when.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 복구본)`;
  bar.hidden = false;
  $('recover-now').onclick = () => {
    loading = true;
    editor.commands.setContent(snap.json as any);
    loading = false;
    Object.assign(state, {
      path: snap.path, fileName: snap.fileName, format: snap.format, page: snap.page ?? { ...DEFAULT_PAGE },
      header: snap.header, footer: snap.footer, pageNumber: snap.pageNumber, dropped: [],
    });
    titleInput.value = snap.title;
    applyPage(state.page);
    markDirty(true);
    bar.hidden = true;
    toast('복구했습니다 — 꼭 저장하세요 (Ctrl+S)');
  };
  $('recover-drop').onclick = () => {
    void clearRecovery();
    bar.hidden = true;
  };
});

// ── 버전 / 자동 업데이트 ─────────────────────────────────
const updaterUi = {
  isDirty: () => state.dirty,
  save: async () => {
    await saveCurrent();
    return !state.dirty;
  },
  confirm: confirmDialog,
  toast,
};
void appVersion().then((v) => ($('app-version').textContent = `v${v}`));
$('app-version').addEventListener('click', () => checkForUpdates(updaterUi, true));
// 켜자마자 확인하면 첫 화면이 늦어지므로 잠깐 뒤에 확인
setTimeout(() => void checkForUpdates(updaterUi), 3000);

// 디버그/테스트용
Object.assign(window as any, { hanword: { editor, tiptapToDoc, loadFile, state, sumTable, currentDoc, autosave, navPane, markDirty, recent: { addRecent, recentFiles, removeRecent } } });
