/**
 * 디자인 패널 (오른쪽) — 테마 카드를 누르면 문서 전체 디자인이 바로 바뀐다. 강조색도 고를 수 있다.
 * 카드의 작은 미리보기는 테마 값으로 직접 그린다 (실제 문서와 같은 글꼴·색·표 모양).
 */
import { ACCENTS, MOOD_THEMES, THEMES, type Accent, type Theme } from '../design/themes';
import { DECO_ASSETS } from '../design/decoAssets';

const decoSrc = (k: string) => `data:${DECO_ASSETS[k].mime};base64,${DECO_ASSETS[k].data}`;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** 감성 테마 미리보기: 커버 + 아이콘 붙은 제목·장 제목 + 말풍선 상자 */
function moodPreview(th: Theme): string {
  const d = th.deco!;
  const r = th.roles;
  const sz = (pt: number) => `${(pt * 0.62).toFixed(1)}px`;
  const ic = (k: string, pt: number) => `<img src="${decoSrc(k)}" alt="" style="width:${sz(pt * 1.05)};height:${sz(pt * 1.05)};vertical-align:-2px;margin-right:3px">`;
  return `
    <img class="dp-cover" src="${decoSrc(`cover:${d}`)}" alt="">
    <div style="font-size:${sz(r.title.text.sizePt ?? 24)};font-weight:700;color:${r.title.text.color};background:${th.titleBox.bg};padding:2px 4px;border-radius:2px">사업 결과 보고</div>
    <div style="font-size:${sz(r.chapter.text.sizePt ?? 15)};font-weight:700;color:${r.chapter.text.color};margin-top:4px">${ic(`icon:${d}`, r.chapter.text.sizePt ?? 15)}Ⅰ. 추진 개요</div>
    <div style="font-size:${sz(11)}">□ 기록물 120개 바구니 이관</div>
    <div style="font-size:${sz(10)};background:${th.box.bg};padding:3px 5px;margin-top:3px;border-radius:2px">${ic(`box:${d}`, 10)}차수별로 나누어 진행합니다</div>
    <img src="${decoSrc(`divider:${d}`)}" alt="" style="width:100%;display:block;margin-top:4px">`;
}

function previewHtml(th: Theme, a: Accent): string {
  const col = (c?: string) => (c === '$accent' ? a.color : c === '$soft' ? a.soft : c);
  const f = (font?: string) => `font-family:'${font ?? th.base.font}', '${th.base.font}', sans-serif`;
  const r = th.roles;
  const tb = th.titleBox;
  const T = th.table;
  const line = (mm: number, c: string) => (mm > 0 ? `${Math.max(1, Math.round(mm * 2.2))}px solid ${col(c)}` : 'none');
  const headBg = col(T.head.bg) ?? 'transparent';
  const cellBorder =
    T.lines === 'grid' ? `1px solid ${col(T.lineColor)}` : T.lines === 'minimal' ? `none; border-bottom:1px solid ${col(T.lineColor)}` : 'none';
  const tableTop = T.lines === 'official' || T.lines === 'horizontal' ? `border-top:${line(T.outerMm, T.lineColor)};border-bottom:${line(T.outerMm, T.lineColor)};` : '';
  const headBottom = T.lines === 'official' ? `border-bottom:3px double ${col(T.lineColor)};` : T.lines === 'horizontal' ? `border-bottom:1px solid ${col(T.lineColor)};` : T.lines === 'minimal' ? `border-bottom:1.5px solid ${a.color};` : '';
  const td = (t: string, head = false, zebra = false) =>
    `<td style="border:${cellBorder};${head ? `background:${headBg};color:${col(T.head.text.color) ?? '#000'};font-weight:${T.head.text.bold ? 700 : 400};${headBottom}` : zebra && T.zebra ? `background:${T.zebra};` : ''}">${t}</td>`;
  const sz = (pt: number) => `${(pt * 0.62).toFixed(1)}px`;
  return `
    <div class="dp-title" style="${f(r.title.text.font)};font-size:${sz(r.title.text.sizePt ?? 20)};font-weight:${r.title.text.bold ? 700 : 400};color:${col(r.title.text.color) ?? '#000'};text-align:${r.title.align ?? 'center'};border-top:${line(tb.top, tb.lineColor)};border-bottom:${line(tb.bottom, tb.lineColor)}">사업 결과 보고</div>
    <div style="${f(r.subtitle.text.font)};font-size:${sz(r.subtitle.text.sizePt ?? 10)};color:${col(r.subtitle.text.color) ?? '#000'};text-align:${r.subtitle.align ?? 'right'}">2026. 10. 30. ｜ ○○팀</div>
    <div style="${f(r.chapter.text.font)};font-size:${sz(r.chapter.text.sizePt ?? 14)};font-weight:${r.chapter.text.bold ? 700 : 400};color:${col(r.chapter.text.color) ?? '#000'};margin-top:4px">Ⅰ. 추진 개요</div>
    <div style="${f()};font-size:${sz(r.item0.text.sizePt ?? 11)}">□ 기록물 120개 바구니 이관</div>
    <div style="${f()};font-size:${sz(r.item1.text.sizePt ?? 11)};padding-left:6px;color:${col(r.item1.text.color) ?? '#000'}">○ 차수별로 나누어 진행</div>
    <table style="${tableTop}border-collapse:collapse;width:100%;margin-top:3px;${f(T.body.text.font)};font-size:${sz(T.body.text.sizePt ?? 10)}">
      <tr>${td('구분', true)}${td('수량', true)}${td('비고', true)}</tr>
      <tr>${td('1차')}${td('40')}${td('')}</tr>
      <tr>${td('2차', false, true)}${td('80', false, true)}${td('', false, true)}</tr>
    </table>`;
}

export interface DesignPanelOptions {
  /** 테마·강조색을 문서에 입힌다 */
  apply: (themeId: string, accentId: string) => void;
  current: () => { themeId?: string; accentId: string };
  /** 커버를 내 그림으로 (파일 고르기) / 빼기 */
  pickCover?: () => void;
  removeCover?: () => void;
  hasCover?: () => boolean;
}

export function setupDesignPanel(pane: HTMLElement, opts: DesignPanelOptions) {
  let accent = opts.current().accentId;
  const render = () => {
    const cur = opts.current();
    const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
    pane.innerHTML = `
      <div class="dp-head"><strong>디자인</strong><button type="button" class="dp-close" aria-label="닫기" title="닫기">✕</button></div>
      <p class="dp-note">누르면 문서 전체에 바로 입혀집니다. 내용은 그대로이고 Ctrl+Z 로 되돌립니다.</p>
      <div class="dp-sec">기본 테마 <span>강조색</span></div>
      <div class="dp-accents" role="radiogroup" aria-label="강조색">
        ${ACCENTS.map((x) => `<button type="button" class="dp-accent${x.id === accent ? ' on' : ''}" data-accent="${x.id}" title="${x.name}" aria-label="강조색 ${x.name}" style="--c:${x.color}"></button>`).join('')}
      </div>
      <div class="dp-cards">
        ${THEMES.filter((t) => !t.deco).map(
          (t) => `<button type="button" class="dp-card${cur.themeId === t.id ? ' on' : ''}" data-theme="${t.id}" title="${esc(t.hint)}">
            <div class="dp-paper">${previewHtml(t, a)}</div>
            <div class="dp-name">${t.name}${t.hancomFonts ? ' <span class="dp-badge" title="한컴오피스 글꼴: Word 만 있는 PC 에서는 비슷한 글꼴로 보입니다">한컴 글꼴</span>' : ''}</div>
            <div class="dp-hint">${esc(t.hint)}</div>
          </button>`,
        ).join('')}
      </div>
      <div class="dp-sec">감성 테마 <span>노션 꾸미기처럼 — 커버·아이콘·구분선도 파일에 들어갑니다</span></div>
      <div class="dp-cards mood">
        ${MOOD_THEMES.map(
          (t) => `<button type="button" class="dp-card${cur.themeId === t.id ? ' on' : ''}" data-theme="${t.id}" title="${esc(t.hint)}">
            <div class="dp-paper">${moodPreview(t)}</div>
            <div class="dp-name">${t.name}</div>
            <div class="dp-hint">${esc(t.hint)}</div>
          </button>`,
        ).join('')}
      </div>
      <div class="dp-cover-row">
        <button type="button" class="dp-btn" data-act="pick-cover" title="가지고 있는 그림(사진, AI 로 만든 그림 …)을 문서 맨 위 커버로. 5:1 로 가운데를 잘라 씁니다">커버를 내 그림으로…</button>
        ${opts.hasCover?.() ? '<button type="button" class="dp-btn" data-act="remove-cover">커버 빼기</button>' : ''}
      </div>
      <p class="dp-note">제목·장 제목(Ⅰ.)·□ ○ 항목·표 머리행·합계 줄을 알아보고 모양을 입힙니다. 한글과 Word 에서 같은 모양으로 저장됩니다.</p>`;
  };
  pane.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.dp-close')) {
      pane.hidden = true;
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'pick-cover') return opts.pickCover?.();
    if (act === 'remove-cover') {
      opts.removeCover?.();
      render();
      return;
    }
    const ac = t.closest<HTMLElement>('[data-accent]');
    if (ac) {
      accent = ac.dataset.accent!;
      const cur = opts.current();
      if (cur.themeId) opts.apply(cur.themeId, accent); // 이미 입힌 테마가 있으면 색만 바꿔 다시 입힘
      render();
      return;
    }
    const card = t.closest<HTMLElement>('[data-theme]');
    if (card) {
      opts.apply(card.dataset.theme!, accent);
      render();
    }
  });
  return {
    toggle(show = pane.hidden) {
      pane.hidden = !show;
      if (show) render();
    },
    refresh: render,
  };
}
