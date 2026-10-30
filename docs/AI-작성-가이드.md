# HanWord AI 작성 가이드

AI(Claude, ChatGPT 등)가 **한글(.hwpx)·Word(.docx) 문서를 직접 만들고 읽는** 방법입니다.
AI는 아래 문법의 마크다운으로 글을 쓰고, HanWord 변환기가 그것을 한글/Word 파일로 바꿉니다.
앱(HanWord)과 완전히 같은 저장기를 쓰므로, 만든 파일은 한컴오피스 한글과 Microsoft Word 에서 그대로 열립니다.

## 1. 변환기 받기 · 실행

Node.js 18 이상이면 설치 없이 파일 하나로 실행됩니다.

```bash
curl -fsSL -o hanword.mjs https://github.com/hatae1996/hanword/releases/latest/download/hanword.mjs
# 위 주소가 막혀 있으면: git clone --depth 1 https://github.com/hatae1996/hanword && cp hanword/cli/hanword.mjs .
```

| 하고 싶은 일 | 명령 |
|---|---|
| 마크다운 → 한글 | `node hanword.mjs 보고서.md` → `보고서.hwpx` |
| 마크다운 → Word | `node hanword.mjs 보고서.md -o 보고서.docx` |
| 둘 다 | `node hanword.mjs 보고서.md --both` |
| 한글/Word 문서 읽기 | `node hanword.mjs 받은문서.hwpx` → `받은문서.md` |
| Word → 한글 변환 | `node hanword.mjs 문서.docx -o 문서.hwpx` |

변환기는 만든 파일을 다시 열어 글자가 빠지지 않았는지 스스로 확인하고 `✓ 보고서.hwpx (글자 378자 · 문단 20개 · 표 2개 확인)` 처럼 알려 줍니다.
`⚠` 가 나오면 지원하지 않는 요소(그림 등)가 빠졌다는 뜻입니다.

## 2. 작성 문법

### 기본 (일반 마크다운)

```markdown
# 제목 1          ← 16pt 굵게
## 제목 2         ← 14pt 굵게
### 제목 3        ← 12pt 굵게 (#### 이하도 제목 3)

보통 문단. **굵게**, *기울임*, ~~취소선~~, <u>밑줄</u>.
줄을 바꾸면 문단 안에서 줄이 바뀝니다. 빈 줄은 새 문단입니다.

- 글머리표 목록
- 둘째 항목
  - 하위 항목

1. 번호 목록
2. 둘째
   1. 하위 번호는 가., 나. 로 표시됩니다
```

한국어 조사가 바로 붙은 강조(`**한글(HWPX)**과`)도 굵게 처리됩니다.

### 개조식 (공문서 기호)

줄 맨 앞에 기호를 쓰면 단계별로 자동 들여쓰기·내어쓰기됩니다. 빈 줄 없이 이어 써도 줄마다 따로 정렬됩니다.

```markdown
□ 추진 배경
  ○ 대외 기관과 주고받는 문서 형식이 달라 변환 오류가 반복됨
    ◦ 대상: 기획팀, 대외협력팀
      · 세부 항목
※ 세부 일정은 붙임 참조
```

| 기호 | 단계 |
|---|---|
| □ ■ | 1단계 |
| ○ ● ※ | 2단계 |
| ◦ ▪ | 3단계 |
| · ∙ | 4단계 |

### 표

```markdown
| 구분 | 내용 | 결과 |
|:---:|---|:---:|
| 1단계 | 시범 운영 | 완료 |
```

- 첫 줄(머리글)은 **굵게·가운데 정렬**됩니다.
- `:---:` 가운데, `---:` 오른쪽 정렬.
- 칸을 합치거나 열 너비를 정하려면 HTML 표를 씁니다 (칸 안에는 마크다운 대신 HTML 서식).

```html
<table>
  <tr><th width="25%">부서</th><th width="45%">적용 문서</th><th width="30%">비고</th></tr>
  <tr><td rowspan="2">기획팀</td><td>사업 계획서</td><td>완료</td></tr>
  <tr><td>결과 보고서</td><td>완료</td></tr>
  <tr><td>대외협력팀</td><td colspan="2" align="center">11월 적용 예정</td></tr>
</table>
```

### 칸 배경색

HTML 표의 칸에 `style="background:#색"` 을 쓰면 한글·Word 양쪽에 칸 색이 들어갑니다 (`<th>` 머리글 칸도 같음).

```html
<td style="background:#C5D9F1">머리글</td>
```

보고서에는 옅은 회색만 권장합니다: 머리행 `#EDEDED`, 합계 줄 `#F5F5F5`.

### 칸 테두리

칸의 `style` 에 `border-top` / `border-bottom` / `border-left` / `border-right` (또는 `border`)를 쓰면 그 변의 선이 바뀝니다.
굵기는 mm, 모양은 `solid`(실선)·`double`(겹선)·`none`(선 없음). 맞닿은 이웃 칸의 변은 자동으로 같이 맞춰집니다.

```html
<td style="border-top:0.4mm solid #000; border-bottom:0.5mm double #000; border-left:none">머리글</td>
```

**공문 표** — `<table data-style="공문">` (또는 맨 위 설정 `표: 공문` 이면 모든 표)
위·아래 바깥선 0.4mm, 좌우 바깥선 없음, 첫 줄(머리행) 아래 겹선이 자동으로 들어갑니다. 칸에 직접 쓴 테두리가 우선이고, `data-style="기본"` 인 표는 그대로 둡니다.

### 공공기관 보고서 모양 (권장)

관공서 보고서는 **색 상자 없이 선과 글꼴로** 구분합니다. 남색 제목 상자·색 막대·파란 머리행은 쓰지 마세요 (웹 페이지처럼 보임).

| 요소 | 모양 |
|---|---|
| 글꼴 | 제목·장 제목 **HY헤드라인M**, 본문·표 **휴먼명조** (한컴오피스 글꼴) |
| 크기 | 제목 20~22pt, 장 제목(Ⅰ. Ⅱ.) 16pt, 본문 □ ○ 15pt, 표·주석 12pt — 이 밖의 크기는 쓰지 않음 |
| 자간 | -5% (`자간: -5`) |
| 제목 | 칸 하나짜리 표, 위아래 선만 (위 0.7mm · 아래 0.4mm), 아래 줄 오른쪽에 날짜·작성 부서 |
| 표 | 공문 표, 머리행만 옅은 회색 `#EDEDED`, 합계 줄 `#F5F5F5`, 칸 안 줄 간격 130% |
| 문장 | □ (항목) 내용 — 괄호 안 항목 이름 + 명사형 끝맺음, 한 줄에 끝나게 |

```markdown
---
제목: ○○ 결과 보고
글꼴: 휴먼명조
글자크기: 15
자간: -5
표: 공문
---

<table>
  <tr><td style="border-top:0.7mm solid #1F3864; border-bottom:0.4mm solid #1F3864"><p align="center" style="margin-top:3pt; margin-bottom:3pt"><span style="font-family:HY헤드라인M; font-size:22pt">○○ 결과 보고</span></p></td></tr>
</table>

<p align="right"><span style="font-size:12pt">2026. ○○. ○○.(○) ｜ ○○팀</span></p>

<p style="margin-top:10pt"><span style="font-family:HY헤드라인M; font-size:16pt">Ⅰ. 추진 개요</span></p>

□ (추진 기간) 2026. ○○. ○○. ~ ○○. ○○.
  ○ (세부 내용) …
  ※ 참고 사항
```

표 칸 글자는 `<td align="center"><p align="center" style="line-height:130%"><span style="font-size:12pt">내용</span></p></td>` 처럼 씁니다.
개조식 문단에 간격이 필요하면 `<p style="margin-top:5pt">○ 내용</p>` 처럼 HTML 로 써도 들여쓰기가 유지됩니다.

### 글자 색·크기·글꼴, 정렬

```html
<span style="color:#C00000">빨간 글자</span>
<span style="font-size:14pt">14pt 글자</span>
<span style="font-family:바탕">바탕체</span>

<p align="center">가운데 정렬 문단</p>
<p align="right">2026. 10. 29. 기획팀</p>
```

- 글꼴: **맑은 고딕(기본)·바탕·돋움·굴림**은 Windows 기본 글꼴이라 어디서나 같게 보입니다.
  **휴먼명조·HY헤드라인M·HY견고딕·한컴돋움·함초롬체**는 한컴오피스가 깔린 PC 에만 있습니다 (한글로 제출하는 공공기관 보고서는 이쪽이 표준).
- 자간: `<span style="letter-spacing:-0.05em">` = 자간 -5%. 문서 전체는 맨 위 설정 `자간: -5`.
- 들여쓰기·간격이 꼭 필요하면 `<p style="margin-left:10mm; text-indent:-5mm; margin-top:6pt">` 처럼 쓸 수 있습니다.

### 문서 설정 (맨 위, 선택)

```markdown
---
제목: 2026년 하반기 사업 결과 보고
용지: A4 가로        ← 생략하면 A4 세로
여백: 20 30 15 30   ← 위 오른쪽 아래 왼쪽 (mm, 본문까지 거리)
글꼴: 바탕          ← 문서 전체 기본 글꼴
글자크기: 11        ← 본문 기본 크기 (pt)
줄간격: 160         ← % (한글 기본 160)
자간: -5            ← % (한글 보고서는 보통 -5)
표: 공문            ← 모든 표를 공문 표 모양으로
쪽번호: 아래 가운데   ← "- 1 -" (숫자만: "아래 가운데 (숫자만)", 위치: 아래 오른쪽 · 위 가운데 · 위 오른쪽)
머리말: [오른쪽] ○○기관 기록관   ← [왼쪽]/[가운데]/[오른쪽] 생략하면 왼쪽
꼬리말: 대외비 아님
---
```

### 채울 빈칸

사람이 나중에 채울 자리는 `○○` 로 씁니다 (예: `2026. ○○. ○○.`, `총 ○○○개`, `○○○○(주)`).
HanWord 에서 빈칸이 노란색으로 표시되고 **Tab** 으로 하나씩 돌며 채울 수 있습니다. (줄 맨 앞의 개조식 기호 `○ ` 는 빈칸이 아님)
합계 칸도 `○○○` 로 두면, 숫자를 채운 뒤 그 칸에서 **Ctrl+Shift+S** 를 눌러 위쪽 숫자의 합계를 넣을 수 있습니다.

### 쪽 나누기

새 쪽에서 시작할 문단에 `page-break-before:always` 를 씁니다 (한글·Word 의 Ctrl+Enter 와 같음).

```html
<p style="page-break-before:always"><span style="font-family:HY헤드라인M; font-size:16pt">Ⅱ. 추진 계획</span></p>
```

### 그림 · 사진대지

마크다운 파일과 같은 폴더의 그림 파일을 경로로 씁니다. 변환기가 그림을 문서 안에 넣습니다 (PNG·JPEG·GIF·BMP).

```markdown
![이관 전 서고](사진1.jpg)
```

크기를 정하려면 HTML 로 씁니다 (하나만 주면 원본 비율로 나머지를 정함). 사진대지는 칸마다 사진, 아래 줄에 설명:

```html
<table>
  <tr><td><p align="center"><img src="사진1.jpg" style="width:70mm"></p></td><td><p align="center"><img src="사진2.jpg" style="width:70mm"></p></td></tr>
  <tr><td align="center"><span style="font-size:11pt">사진 1. 이관 전 서고</span></td><td align="center"><span style="font-size:11pt">사진 2. 이관 후 서가</span></td></tr>
</table>
```

한글/Word 문서를 마크다운으로 읽으면 그림은 `문서명_그림1.png` 처럼 같은 폴더에 파일로 나옵니다. 웹 주소(https://…) 그림은 넣지 못합니다.

### 아직 지원하지 않는 것

글 뒤·앞으로 떠 있는 그림(글자처럼 취급으로 바뀜), 도형, 가로줄, 각주, 수식, 표 안의 표. (코드 블록·인용은 일반 문단으로 바뀝니다)

## 3. 공문서 작성 관례 (참고)

- 날짜: `2026. 10. 29.` (연·월·일 뒤에 마침표, 사이 한 칸)
- 시각: `14:00`
- 금액: `금1,234,000원(금일백이십삼만사천원)`
- 붙임: `붙임  1. 세부 일정표 1부.` · 마지막 줄 끝에 두 칸 띄우고 `끝.`
- 항목 순서: 1. → 가. → 1) → 가) → (1) → (가) 또는 개조식 □ → ○ → ◦ → ·

## 4. 예시

[`verify/fixtures/ai-보고서.md`](../verify/fixtures/ai-보고서.md) — 개조식, 색 글자, 일반 표, 병합 표, 번호 목록이 모두 들어간 결과 보고서.
