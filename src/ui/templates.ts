/**
 * 양식 모음 — 한컴 어시스턴트의 공문서 양식, 노션 템플릿처럼 자주 쓰는 문서를 골라 시작한다.
 * 기본 양식은 AI 변환기와 같은 마크다운 문법으로 적어 두고(markdownToDoc), 채울 자리는 ○○ 빈칸(Tab).
 * "내 양식으로 저장"은 지금 문서를 이 PC 에 보관한다 (IndexedDB).
 */
import { kvGet, kvSet } from '../autosave';

export interface BuiltinTemplate {
  id: string;
  name: string;
  hint: string;
  markdown: string;
}

const reportMeta = (title: string) => `---
제목: ${title}
글꼴: 휴먼명조
글자크기: 15
자간: -5
표: 공문
여백: 20 20 15 20
쪽번호: 아래 가운데
---`;

const titleBox = (title: string) => `<table>
  <tr><td style="border-top:0.7mm solid #1F3864; border-bottom:0.4mm solid #1F3864; border-left:none; border-right:none"><p align="center" style="margin-top:3pt; margin-bottom:3pt; line-height:130%"><span style="font-family:HY헤드라인M; font-size:22pt">${title}</span></p></td></tr>
</table>

<p align="right"><span style="font-size:12pt">2026. ○○. ○○.(○) ｜ ○○○○</span></p>`;

const chapter = (t: string) => `<p style="margin-top:10pt; margin-bottom:2pt"><span style="font-family:HY헤드라인M; font-size:16pt">${t}</span></p>`;
const cell = (t: string, al = 'center') => `<td align="${al}"><p align="${al}" style="line-height:130%"><span style="font-size:12pt">${t}</span></p></td>`;
const head = (t: string, w: string) => `<th width="${w}" style="background:#EDEDED"><span style="font-size:12pt">${t}</span></th>`;

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'result',
    name: '결과 보고',
    hint: '제목 상자 · Ⅰ 추진 개요 · Ⅱ 추진 결과(표) · Ⅲ 향후 계획',
    markdown: `${reportMeta('○○ 결과 보고')}

${titleBox('○○ 결과 보고')}

${chapter('Ⅰ. 추진 개요')}

□ (추진 근거) ○○
□ (추진 기간) 2026. ○○. ○○. ~ 2026. ○○. ○○.
□ (추진 내용) ○○
  ○ ○○

${chapter('Ⅱ. 추진 결과')}

□ ○○ 실적

<p align="right"><span style="font-size:11pt">(단위: ○○)</span></p>

<table>
  <tr>${head('구분', '25%')}${head('계획', '25%')}${head('실적', '25%')}${head('비고', '25%')}</tr>
  <tr>${cell('○○')}${cell('○○')}${cell('○○')}${cell('')}</tr>
  <tr>${cell('○○')}${cell('○○')}${cell('○○')}${cell('')}</tr>
  <tr><td align="center" style="background:#F5F5F5"><span style="font-size:12pt"><strong>합 계</strong></span></td><td align="center" style="background:#F5F5F5"><span style="font-size:12pt"><strong>○○</strong></span></td><td align="center" style="background:#F5F5F5"><span style="font-size:12pt"><strong>○○</strong></span></td><td style="background:#F5F5F5"></td></tr>
</table>

${chapter('Ⅲ. 향후 계획')}

□ ○○
  ○ ○○
`,
  },
  {
    id: 'transfer',
    name: '기록물 이관 완료 보고',
    hint: '이관 개요 · 차수별 이관 현황(표) · 이관 방법(절차 표)',
    markdown: `${reportMeta('기록물 이관 완료 보고')}

${titleBox('○○ 기록관 기록물 이관 완료 보고')}

${chapter('Ⅰ. 이관 개요')}

□ (사 업 명) ○○ 기록물 전수조사 및 이관 용역
□ (이관 기간) 2026. ○○. ○○. ~ 2026. ○○. ○○.(총 ○차)
□ (이관 대상) 기록관 소장 기록물 및 실·과 보관 기록물
□ (이관 경로) ○○ → ○○ 기록관
□ (이 관 량) 총 ○○○개 바구니
  ※ 권·보존상자 수량 계수가 어려우면 운반 바구니 수량으로 산정

${chapter('Ⅱ. 이관 현황')}

□ 차수별·부서별 이관 실적

<p align="right"><span style="font-size:11pt">(단위: 바구니)</span></p>

<table>
  <tr>${head('차수', '10%')}${head('이관일자', '22%')}${head('이전 보관 장소', '20%')}${head('이관부서', '18%')}${head('수량', '12%')}${head('비고', '18%')}</tr>
  <tr>${cell('1차')}${cell('2026. ○○. ○○.')}${cell('○○')}${cell('○○과')}${cell('○○')}${cell('')}</tr>
  <tr>${cell('2차')}${cell('2026. ○○. ○○.')}${cell('○○')}${cell('○○과')}${cell('○○')}${cell('')}</tr>
  <tr><td colspan="4" align="center" style="background:#F5F5F5"><span style="font-size:12pt"><strong>합 계</strong></span></td><td align="center" style="background:#F5F5F5"><span style="font-size:12pt"><strong>○○○</strong></span></td><td style="background:#F5F5F5"></td></tr>
</table>

<p style="margin-top:3pt"><span style="font-size:12pt">※ 같은 부서라도 기존 보관 장소가 다르면 차수를 나누어 이관</span></p>

${chapter('Ⅲ. 이관 방법')}

□ (추진 절차) 사전조사부터 서가 배치까지 6단계로 추진

<table data-style="기본">
  <tr>${['① 사전조사', '② 대상 선정', '③ 라벨 부착', '④ 포장', '⑤ 이관', '⑥ 서가 배치'].map((t) => `<td width="16.66%" align="center" style="background:#F2F2F2"><p align="center" style="line-height:130%"><span style="font-size:12pt">${t}</span></p></td>`).join('')}</tr>
</table>

<p style="margin-top:5pt">○ (사전조사) 보관 장소·수량·상태 조사</p>

  ○ (대상 선정) 부서별 이관 대상 확정
  ○ (라벨 부착) 바구니별 부서명·보관 장소·일련번호 표시
  ○ (포　　장) 기존 보관 순서대로 바구니에 담아 포장
  ○ (이　　관) 보관 장소별 일정에 따라 차수별로 이관
  ○ (서가 배치) 기록관 서고 배치계획에 따라 배치
`,
  },
  {
    id: 'photos',
    name: '사진대지',
    hint: '사진 칸 4개 + 설명 — 사진을 칸에 끌어다 놓으세요',
    markdown: `---
제목: 사진대지
글꼴: 휴먼명조
여백: 20 20 15 20
쪽번호: 아래 가운데
---

<p align="center" style="margin-bottom:8pt"><span style="font-family:HY헤드라인M; font-size:20pt">사 진 대 지</span></p>

<table>
  <tr><td width="15%" align="center" style="background:#EDEDED"><span style="font-size:12pt"><strong>사 업 명</strong></span></td><td width="85%"><span style="font-size:12pt">○○</span></td></tr>
</table>

<p></p>

<table>
  <tr><td width="50%" align="center"><p align="center" style="margin-top:28mm; margin-bottom:28mm"><span style="font-size:11pt; color:#7F7F7F">(사진을 여기에 끌어다 놓으세요)</span></p></td><td width="50%" align="center"><p align="center" style="margin-top:28mm; margin-bottom:28mm"><span style="font-size:11pt; color:#7F7F7F">(사진을 여기에 끌어다 놓으세요)</span></p></td></tr>
  <tr>${cell('사진 1. ○○')}${cell('사진 2. ○○')}</tr>
  <tr><td align="center"><p align="center" style="margin-top:28mm; margin-bottom:28mm"><span style="font-size:11pt; color:#7F7F7F">(사진을 여기에 끌어다 놓으세요)</span></p></td><td align="center"><p align="center" style="margin-top:28mm; margin-bottom:28mm"><span style="font-size:11pt; color:#7F7F7F">(사진을 여기에 끌어다 놓으세요)</span></p></td></tr>
  <tr>${cell('사진 3. ○○')}${cell('사진 4. ○○')}</tr>
</table>
`,
  },
  {
    id: 'minutes',
    name: '회의록',
    hint: '회의명·일시·장소·참석자 · 안건 · 논의 · 결정 · 향후 조치',
    markdown: `---
제목: 회의록
글꼴: 휴먼명조
글자크기: 12
여백: 20 20 15 20
---

<p align="center" style="margin-bottom:8pt"><span style="font-family:HY헤드라인M; font-size:20pt">회 의 록</span></p>

<table>
  <tr><td width="16%" align="center" style="background:#EDEDED"><strong>회 의 명</strong></td><td colspan="3">○○ 회의</td></tr>
  <tr><td width="16%" align="center" style="background:#EDEDED"><strong>일    시</strong></td><td width="34%">2026. ○○. ○○.(○) ○○:○○</td><td width="16%" align="center" style="background:#EDEDED"><strong>장    소</strong></td><td width="34%">○○</td></tr>
  <tr><td align="center" style="background:#EDEDED"><strong>참 석 자</strong></td><td colspan="3">○○○, ○○○, ○○○</td></tr>
  <tr><td align="center" style="background:#EDEDED"><strong>안    건</strong></td><td colspan="3">1. ○○<br>2. ○○</td></tr>
  <tr><td align="center" style="background:#EDEDED"><strong>논의 내용</strong></td><td colspan="3">□ ○○<br>  ○ ○○</td></tr>
  <tr><td align="center" style="background:#EDEDED"><strong>결정 사항</strong></td><td colspan="3">○○</td></tr>
  <tr><td align="center" style="background:#EDEDED"><strong>향후 조치</strong></td><td colspan="3">○○ (담당: ○○, 기한: ○○. ○○.)</td></tr>
</table>
`,
  },
];

// ── 내 양식 ──────────────────────────────────────────────
export interface MyTemplate {
  name: string;
  savedAt: string;
  json: unknown;
  title: string;
  page: unknown;
  header?: unknown;
  footer?: unknown;
  pageNumber?: unknown;
}
const KEY = 'templates';

export async function myTemplates(): Promise<MyTemplate[]> {
  try {
    return (await kvGet<MyTemplate[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}
export async function saveMyTemplate(t: MyTemplate) {
  const list = (await myTemplates()).filter((x) => x.name !== t.name);
  list.unshift(t);
  await kvSet(KEY, list);
}
export async function deleteMyTemplate(name: string) {
  await kvSet(KEY, (await myTemplates()).filter((x) => x.name !== name));
}
