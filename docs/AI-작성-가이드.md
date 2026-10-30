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

자주 쓰는 색: 남색 `#1F3864` (흰 글자와 함께), 연파랑 `#DCE6F1`, 머리글 파랑 `#C5D9F1`, 회색 `#E7E6E6`.

### 보고서 꾸미기 (공공기관 보고서 모양)

글자만 있는 보고서는 밋밋해 보입니다. 아래 세 가지를 쓰면 발주처·기관 보고서다운 모양이 됩니다.

**제목 상자** — 칸 하나짜리 표에 색을 칠하고 큰 글자

```html
<table>
  <tr><td style="background:#1F3864" align="center"><p align="center"><span style="color:#FFFFFF; font-size:18pt"><strong>○○ 사업 결과 보고</strong></span></p></td></tr>
</table>
```

**정보 표** — 사업명·보고일·작성자를 칸으로 정리, 항목 이름 칸은 회색

```html
<table>
  <tr><td width="15%" style="background:#E7E6E6" align="center"><strong>사 업 명</strong></td><td colspan="3">○○ 용역</td></tr>
  <tr><td width="15%" style="background:#E7E6E6" align="center"><strong>보 고 일</strong></td><td width="35%">2026. ○○. ○○.</td><td width="15%" style="background:#E7E6E6" align="center"><strong>작 성</strong></td><td width="35%">○○팀</td></tr>
</table>
```

**장 제목 막대** — 왼쪽 남색 칸에 로마 숫자, 오른쪽 연파랑 칸에 장 이름 (`## 1. 개요` 대신)

```html
<table>
  <tr><td width="7%" style="background:#1F3864" align="center"><span style="color:#FFFFFF; font-size:13pt"><strong>Ⅰ</strong></span></td><td width="93%" style="background:#DCE6F1"><span style="color:#1F3864; font-size:13pt"><strong>추진 개요</strong></span></td></tr>
</table>
```

그 밖에: 표 머리글은 `#C5D9F1`, 합계 줄은 `#E7E6E6`. 표와 표 사이에는 `<p></p>` (빈 줄) 하나. 단계·절차는 개조식보다 "단계 | 주요 내용" 표가 깔끔합니다.

### 글자 색·크기·글꼴, 정렬

```html
<span style="color:#C00000">빨간 글자</span>
<span style="font-size:14pt">14pt 글자</span>
<span style="font-family:바탕">바탕체</span>

<p align="center">가운데 정렬 문단</p>
<p align="right">2026. 10. 29. 기획팀</p>
```

- 글꼴은 **맑은 고딕(기본)·바탕·돋움·굴림**을 권장합니다 (Windows 기본 글꼴이라 한글·Word 어디서나 같게 보임).
  함초롬바탕·함초롬돋움은 한글이 깔린 PC 에만 있습니다.
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
---
```

### 아직 지원하지 않는 것

그림, 가로줄, 머리말/꼬리말, 쪽 번호, 쪽 나누기, 각주, 수식, 표 안의 표. (코드 블록·인용은 일반 문단으로 바뀝니다)

## 3. 공문서 작성 관례 (참고)

- 날짜: `2026. 10. 29.` (연·월·일 뒤에 마침표, 사이 한 칸)
- 시각: `14:00`
- 금액: `금1,234,000원(금일백이십삼만사천원)`
- 붙임: `붙임  1. 세부 일정표 1부.` · 마지막 줄 끝에 두 칸 띄우고 `끝.`
- 항목 순서: 1. → 가. → 1) → 가) → (1) → (가) 또는 개조식 □ → ○ → ◦ → ·

## 4. 예시

[`verify/fixtures/ai-보고서.md`](../verify/fixtures/ai-보고서.md) — 개조식, 색 글자, 일반 표, 병합 표, 번호 목록이 모두 들어간 결과 보고서.
