import './style.css';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { ALL_FONTS, DEFAULT_FONT, DEFAULT_PAGE, DEFAULT_SIZE_PT, HANCOM_ONLY_FONTS } from './model/defaults';
import type { PageSetup } from './model/types';
import { tiptapToDoc } from './model/fromTiptap';
import { docToTiptap } from './model/toTiptap';
import { docToDocx } from './export/docx';
import { docToHwpx } from './export/hwpx';
import { readDocx } from './import/docx';
import { readHwpx } from './import/hwpx';
import { ParagraphFormat } from './editor/paragraphFormat';
import { FontSizeStep, stepFontSize } from './editor/fontSizeStep';
import { setupZoom } from './editor/zoom';
import { safeFileName } from './save';
import {
  askSavePath, baseName, confirmDialog, download, extOf, isDesktop, pickFile, readPath, setWindowTitle, wireDesktop, writePath,
  type Format, type OpenedFile,
} from './platform';
import { SAMPLE_HTML } from './sample';
import { appVersion, checkForUpdates } from './updater';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let loading = false; // 파일을 불러오는 중에는 '수정됨' 으로 표시하지 않는다
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

// ── 편집기 ─────────────────────────────────────────────
// 양쪽 포맷에 1:1 대응이 없는 기능(코드 블록, 인용, 가로줄, 링크)은 끈다.
const editor = new Editor({
  element: $('editor'),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: false,
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 30 } }),
    ParagraphFormat,
    FontSizeStep,
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
};
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
  /** 열 때 지원하지 않아 빠진 요소 — 원본에 덮어쓰기 전에 경고 */
  dropped: string[];
}
const state: FileState = { dirty: false, page: { ...DEFAULT_PAGE }, dropped: [] };
const titleInput = $<HTMLInputElement>('doc-title');
if (!titleInput.value) titleInput.value = isDesktop ? '새 문서' : '2026년 4분기 사업 추진 계획';

function markDirty(d: boolean) {
  state.dirty = d;
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
  return tiptapToDoc(editor.getJSON(), titleInput.value.trim() || '문서', state.page);
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
    state.dropped = [];
    markDirty(false);
    toast(`${baseName(state.path!)} 저장됨`);
  });
}

$('save-doc').addEventListener('click', () => saveCurrent());
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
  if (ext === 'hwp') return toast('구형 .hwp 파일은 아직 열 수 없습니다. 한글에서 "다른 이름으로 저장 → HWPX"로 저장한 뒤 여세요.', true);
  if (ext === 'doc') return toast('구형 .doc 파일은 열 수 없습니다. Word 에서 .docx 로 저장한 뒤 여세요.', true);
  if (ext !== 'hwpx' && ext !== 'docx') return toast('한글(.hwpx) 또는 Word(.docx) 파일만 열 수 있습니다.', true);
  const title = file.name.replace(/\.[^.]+$/, '');
  const { doc, warnings } = ext === 'hwpx' ? await readHwpx(file.bytes, title) : await readDocx(file.bytes, title);
  loading = true;
  try {
    editor.commands.setContent(docToTiptap(doc) as any);
  } finally {
    loading = false;
  }
  editor.commands.focus('start');
  Object.assign(state, { path: file.path, fileName: file.name, format: ext as Format, page: doc.page, dropped: warnings });
  titleInput.value = title;
  applyPage(doc.page);
  markDirty(false);
  refresh();
  toast(warnings.length ? `${file.name} 열림 · 아직 지원하지 않아 빠진 요소: ${warnings.join(', ')}` : `${file.name} 열림`, warnings.length > 0);
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
  Object.assign(state, { path: undefined, fileName: undefined, format: undefined, page: { ...DEFAULT_PAGE }, dropped: [] });
  titleInput.value = '새 문서';
  applyPage(state.page);
  markDirty(false);
  editor.commands.focus();
}
$('open-doc').addEventListener('click', () => openDialog());
$('new-doc').addEventListener('click', () => newDoc());

// ── 단축키 ───────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    if (e.shiftKey) void saveAs(state.format ?? 'hwpx');
    else void saveCurrent();
  } else if (k === 'o') {
    e.preventDefault();
    void openDialog();
  } else if (k === 'n') {
    e.preventDefault();
    void newDoc();
  }
});

// 브라우저: 실수로 탭을 닫을 때 경고 (데스크톱은 wireDesktop 이 처리)
window.addEventListener('beforeunload', (e) => {
  if (state.dirty && !isDesktop) e.preventDefault();
});

void wireDesktop({ isDirty: () => state.dirty, openPath });

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
Object.assign(window as any, { hanword: { editor, tiptapToDoc, loadFile, state } });
