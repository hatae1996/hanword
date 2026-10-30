/**
 * 쪽 관련 대화상자 — 한글 단축키 그대로
 *  F7        편집 용지 (용지 방향·여백)
 *  Alt+T     문단 모양 (정렬·여백·첫 줄·간격·줄 간격)
 *  Ctrl+N,P  쪽 번호 매기기
 *  Ctrl+N,H  머리말/꼬리말
 */
import type { Editor } from '@tiptap/core';
import type { Align, PageNumber, PageSetup, Paragraph } from '../model/types';
import { defaultParaStyle } from '../model/defaults';
import { formDialog } from './dialog';

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function pageSetupDialog(page: PageSetup): Promise<PageSetup | null> {
  const landscape = page.widthMm > page.heightMm;
  const r = await formDialog({
    title: '편집 용지',
    fields: [
      { key: 'orient', label: '용지 방향', type: 'select', value: landscape ? 'land' : 'port', options: [{ value: 'port', label: 'A4 세로' }, { value: 'land', label: 'A4 가로' }] },
      { key: 'top', label: '위쪽', type: 'number', value: r1(page.marginTopMm), suffix: 'mm', min: 0, max: 100 },
      { key: 'bottom', label: '아래쪽', type: 'number', value: r1(page.marginBottomMm), suffix: 'mm', min: 0, max: 100 },
      { key: 'left', label: '왼쪽', type: 'number', value: r1(page.marginLeftMm), suffix: 'mm', min: 0, max: 100 },
      { key: 'right', label: '오른쪽', type: 'number', value: r1(page.marginRightMm), suffix: 'mm', min: 0, max: 100 },
      { key: 'header', label: '머리말', type: 'number', value: r1(page.headerMm), suffix: 'mm', min: 0, max: 100 },
      { key: 'footer', label: '꼬리말', type: 'number', value: r1(page.footerMm), suffix: 'mm', min: 0, max: 100 },
    ],
    groups: { top: '용지 여백 (한글과 같은 뜻: 본문은 위쪽 + 머리말 아래에서 시작)' },
    okText: '설정',
  });
  if (!r) return null;
  const v = (k: string, d: number) => (typeof r[k] === 'number' && isFinite(r[k]) && r[k] >= 0 ? r[k] : d);
  const [w, h] = r.orient === 'land' ? [297, 210] : [210, 297];
  const next: PageSetup = {
    widthMm: w, heightMm: h,
    marginTopMm: v('top', page.marginTopMm), marginBottomMm: v('bottom', page.marginBottomMm),
    marginLeftMm: v('left', page.marginLeftMm), marginRightMm: v('right', page.marginRightMm),
    headerMm: v('header', page.headerMm), footerMm: v('footer', page.footerMm),
  };
  if (next.marginLeftMm + next.marginRightMm > w - 30) return null; // 본문 폭이 너무 좁아지는 값은 무시
  return next;
}

/** Alt+T — 선택한 문단들에 적용 */
export async function paraShapeDialog(editor: Editor): Promise<boolean> {
  const p = editor.state.selection.$from.parent;
  const a = p.attrs ?? {};
  const d = defaultParaStyle();
  const first = typeof a.firstLine === 'number' ? a.firstLine : 0;
  const r = await formDialog({
    title: '문단 모양',
    fields: [
      { key: 'align', label: '정렬', type: 'select', value: a.textAlign ?? 'justify', options: [
        { value: 'justify', label: '양쪽' }, { value: 'left', label: '왼쪽' }, { value: 'center', label: '가운데' }, { value: 'right', label: '오른쪽' },
      ] },
      { key: 'left', label: '왼쪽 여백', type: 'number', value: typeof a.indentLeft === 'number' ? a.indentLeft : 0, suffix: 'mm', min: 0, max: 150 },
      { key: 'firstKind', label: '첫 줄', type: 'select', value: first > 0 ? 'indent' : first < 0 ? 'hang' : 'none', options: [
        { value: 'none', label: '보통' }, { value: 'indent', label: '들여쓰기' }, { value: 'hang', label: '내어쓰기' },
      ] },
      { key: 'first', label: '첫 줄 너비', type: 'number', value: Math.abs(first), suffix: 'mm', min: 0, max: 100 },
      { key: 'before', label: '문단 위', type: 'number', value: typeof a.spaceBefore === 'number' ? a.spaceBefore : d.spaceBeforePt, suffix: 'pt', min: 0, max: 200, step: 1 },
      { key: 'after', label: '문단 아래', type: 'number', value: typeof a.spaceAfter === 'number' ? a.spaceAfter : d.spaceAfterPt, suffix: 'pt', min: 0, max: 200, step: 1 },
      { key: 'line', label: '줄 간격', type: 'number', value: typeof a.lineHeight === 'number' ? a.lineHeight : d.lineSpacingPct, suffix: '%', min: 50, max: 500, step: 5 },
    ],
    groups: { left: '여백', before: '간격' },
    okText: '설정',
  });
  if (!r) return false;
  const firstMm = r.firstKind === 'none' ? 0 : (r.firstKind === 'hang' ? -1 : 1) * Math.abs(r.first ?? 0);
  const num = (v: unknown, def: number) => (typeof v === 'number' && isFinite(v) ? v : def);
  const attrs = {
    textAlign: r.align as Align,
    indentLeft: num(r.left, 0) || null,
    firstLine: firstMm || null,
    spaceBefore: num(r.before, 0) || null,
    spaceAfter: num(r.after, 0) || null,
    lineHeight: num(r.line, 160) === 160 ? null : Math.round(num(r.line, 160)),
  };
  const { from, to } = editor.state.selection;
  return editor.commands.command(({ tr, state }) => {
    state.doc.nodesBetween(from, Math.max(to, from + 1), (node, pos) => {
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
        return false;
      }
      return true;
    });
    return true;
  });
}

export async function pageNumberDialog(cur: PageNumber | undefined): Promise<{ value: PageNumber | undefined } | null> {
  const r = await formDialog({
    title: '쪽 번호 매기기',
    fields: [
      { key: 'pos', label: '번호 위치', type: 'select', value: cur?.pos ?? 'bottom-center', options: [
        { value: 'none', label: '없음' }, { value: 'bottom-center', label: '아래 가운데' }, { value: 'bottom-right', label: '아래 오른쪽' },
        { value: 'top-center', label: '위 가운데' }, { value: 'top-right', label: '위 오른쪽' },
      ] },
      { key: 'dash', label: '줄표 넣기 ( - 1 - )', type: 'check', value: cur?.dash ?? true },
    ],
    okText: '넣기',
  });
  if (!r) return null;
  return { value: r.pos === 'none' ? undefined : { pos: r.pos, dash: !!r.dash } };
}

const textOf = (ps?: Paragraph[]) => (ps ?? []).map((p) => p.inlines.map((i) => (i.kind === 'text' ? i.text : ' ')).join('')).join(' ').trim();
const alignOf = (ps?: Paragraph[]) => (ps?.[0]?.style.align === 'justify' ? 'left' : ps?.[0]?.style.align) ?? 'left';
const plain = (text: string, align: Align): Paragraph[] | undefined =>
  text.trim() ? [{ type: 'paragraph', role: 'body', style: { ...defaultParaStyle(), align }, inlines: [{ kind: 'text', text: text.trim() }] }] : undefined;

export async function headerFooterDialog(header?: Paragraph[], footer?: Paragraph[]): Promise<{ header?: Paragraph[]; footer?: Paragraph[] } | null> {
  const alignOpts = [{ value: 'left', label: '왼쪽' }, { value: 'center', label: '가운데' }, { value: 'right', label: '오른쪽' }];
  const r = await formDialog({
    title: '머리말 / 꼬리말 (모든 쪽)',
    fields: [
      { key: 'h', label: '머리말', type: 'text', value: textOf(header), placeholder: '예: ○○기관 기록관' },
      { key: 'ha', label: '머리말 정렬', type: 'select', value: alignOf(header), options: alignOpts },
      { key: 'f', label: '꼬리말', type: 'text', value: textOf(footer), placeholder: '비워 두면 없음' },
      { key: 'fa', label: '꼬리말 정렬', type: 'select', value: alignOf(footer), options: alignOpts },
    ],
    note: '쪽 번호는 "쪽 번호"(Ctrl+N, P)에서 따로 넣습니다. 꼬리말과 쪽 번호가 같은 자리에 겹치지 않도록 정렬을 다르게 두세요.',
    okText: '설정',
  });
  if (!r) return null;
  // 글자를 바꾸지 않았으면 파일에서 읽은 서식(글꼴 등)을 그대로 둔다
  const keep = (old: Paragraph[] | undefined, text: string, align: Align) =>
    old && textOf(old) === text.trim() && alignOf(old) === align ? old : plain(text, align);
  return { header: keep(header, r.h, r.ha), footer: keep(footer, r.f, r.fa) };
}
