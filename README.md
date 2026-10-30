# HanWord

한컴오피스 **한글(.hwpx)** 과 Microsoft **Word(.docx)** 양쪽에서 서식이 깨지지 않고 열리는 문서 편집기.

```
편집기(TipTap) ──▶ 공통 문서 모델(Doc) ──┬──▶ HWPX 저장기 (한글이 만든 빈 문서 템플릿 위에 채움)
                                          └──▶ DOCX 저장기 (docx 라이브러리)
```

포맷끼리 직접 변환하지 않고, 가운데의 **공통 문서 모델**(`src/model/types.ts`)을 거친다.
글자 크기·여백·줄 간격 등 모든 수치는 `src/model/resolve.ts` 와 `src/model/units.ts` 한 곳에서 계산하므로
두 저장기가 서로 다른 값을 쓸 수 없다.

## AI 로 한글 문서 쓰기

AI 가 마크다운으로 쓴 글을 HanWord 가 한글(.hwpx)·Word(.docx)로 바꾼다. 반대로 한글/Word 문서를 마크다운으로 바꿔 AI 가 읽고 고칠 수 있다.

- **앱에서**: ChatGPT·Claude 답변을 복사해 붙여넣으면 제목·굵게·표·개조식이 서식으로 바뀐다 (글자 그대로는 Ctrl+Shift+V). `.md` 파일도 열린다.
- **AI 가 직접**: 파일 하나짜리 변환기 `cli/hanword.mjs` (릴리스에도 첨부)
  ```bash
  node hanword.mjs 보고서.md            # → 보고서.hwpx
  node hanword.mjs 보고서.md --both     # → .hwpx + .docx
  node hanword.mjs 받은문서.hwpx        # → 받은문서.md
  ```
- 작성 문법·공문 관례: [docs/AI-작성-가이드.md](docs/AI-작성-가이드.md) — 개조식(□ ○ ◦ ·), 병합 표, 색·크기, 문서 설정
- 변환 규칙은 앱 편집기와 같은 코드(`src/ai/markdown.ts`, `src/editor/extensions.ts`)를 쓴다

## 편집 기능

| 기능 | 사용법 |
|---|---|
| 보고서 부품 | 줄 맨 앞에서 **/** (또는 **/ 부품** 버튼) — 제목 상자, 장 제목(Ⅰ. 번호 자동), □ ○ - ※ 항목, 공문 표, 단위 표시, 절차 표, 붙임·끝, 내 상용구 |
| 상용구 | 내용 선택 → **Alt+I** 로 준말 등록 · 준말 입력 후 **Alt+I** 로 펼치기 · **Ctrl+F3** 목록 (한글과 같음) |
| 개조식 자동 입력 | □ ○ - · 줄에서 Enter → 같은 기호로 다음 줄, 기호만 있는 줄에서 Enter → 끝 · 단계: **Ctrl+숫자판 −/+** (한글 개요) 또는 **Alt+Shift+→/←** |
| 모양 복사 | 가져올 글자에서 **Alt+C** → 글자·문단·칸 모양 고르기 → 바꿀 곳 선택 후 **Alt+C** (Esc 까지 여러 번) · Word 식 **Ctrl+Alt+C / Ctrl+Alt+V** |
| 한글 표 단축키 | **F5** 칸 선택(두 번 = 표 전체, Shift+방향키로 넓히기), 칸 선택 + **M** 합치기 / **S** 나누기, **Alt+Insert** 줄·칸 추가, **Alt+Delete** 줄·칸 지우기, **Ctrl+Enter** 줄 추가, **Ctrl+Backspace** 줄 지우기 |
| 표 계산 | 합계 **Ctrl+Shift+S**, 평균 **Ctrl+Shift+A**, 가로 합계 **Ctrl+Shift+H**, 세로 합계 **Ctrl+Shift+V**(칸 선택 상태) |
| 탐색 창 | 상태 표시줄 **탐색 창** — 장(Ⅰ.)·제목·□ 목차, 누르면 이동, **장을 끌어 순서 바꾸기**(아래 내용까지), 찾기 결과 전체 목록 |
| 자동 저장·복구 | 저장 안 한 변경은 1분마다 복구본(IndexedDB) — 앱이 꺼졌다 켜지면 "복구" 안내. 저장하거나 "저장하지 않고 닫기" 하면 지움 |
| 최근 문서 | 데스크톱 앱 **최근 ▾** — 열거나 저장한 파일 10개 |
| 쪽 나누기 | **Ctrl+Enter** (표 밖) — 편집 화면에 점선 표시, 문단 맨 앞 Backspace 로 지움. 한글 pageBreak ↔ Word pageBreakBefore |
| 쪽 번호 | **Ctrl+N, P** 또는 **쪽 번호** — 아래/위 · 가운데/오른쪽, "- 1 -". 한글 "쪽 번호 매기기" ↔ Word PAGE 필드 |
| 머리말·꼬리말 | **Ctrl+N, H** 또는 **머리말** — 모든 쪽 같은 글자, 정렬 |
| 편집 용지 · 문단 모양 | **F7** 용지 방향·여백 · **Alt+T** 정렬·여백·첫 줄·간격·줄 간격 (한글과 같음) |
| 차례 만들기 | / 메뉴 → 장 제목(Ⅰ.)·제목으로 차례, 본문은 새 쪽 |
| 새 문서 | **Alt+N** (한글) · Ctrl+N 은 한글처럼 이어 누르는 키(P·H·T)의 시작, 그냥 두면 새 문서 |
| 그림 | **그림** 버튼 · **Ctrl+N, I** · 붙여넣기 · 끌어다 놓기 — 본문(표 안이면 칸) 폭에 맞춤, 두 번 누르면 크기 바꾸기. WebP 는 PNG 로, 긴 변 2400px 넘는 사진은 줄여서 |
| 사진대지 | **사진대지** 버튼 — 사진 여러 장을 표에 1~3장씩 + "사진 N. ○○" 설명 칸 |
| 빈칸 채우기 | `○○` 자리가 노란색으로 표시됨 · **Tab** / Shift+Tab 으로 다음·이전 빈칸 선택 후 바로 입력 (한글 누름틀처럼) |
| 표 합계 | 더할 칸과 합계 칸을 드래그 → **∑ 합계** 또는 **Ctrl+Shift+S** (한글 블록 합계). 합계 칸에 커서만 두고 눌러도 위쪽 숫자를 더함 |
| 찾기·바꾸기 | **Ctrl+F** / **Ctrl+H** · Enter 다음, Shift+Enter 이전, 모두 바꾸기 |
| 글자 크기 | **Ctrl+]** 크게 / **Ctrl+[** 작게 |
| 화면 배율 | **Ctrl+휠**, Ctrl+= / Ctrl+- / Ctrl+0 |
| 칸 배경색 | 표 안에서 **칸 색** / **색 없음** |
| 칸 테두리 | 표 안에서 **테두리 ▾** — 기본 선, 선 없음, 바깥 굵게, 위·아래 선만(제목 상자), 아래 굵게/겹선, **공문 표**(표 전체). 선 없는 변은 편집 화면에만 점선으로 보임 |
| 자간 | **Alt+Shift+N** 좁게 / **Alt+Shift+W** 넓게 (한글과 같음, 1% 씩) |
| 보고서 글꼴 | 휴먼명조 · HY헤드라인M · HY견고딕 · 한컴돋움 (한컴오피스 글꼴) |
| AI 글 붙여넣기 | ChatGPT·Claude 답변을 Ctrl+V → 서식으로 변환 (글자 그대로는 Ctrl+Shift+V) |
| 저장 | Ctrl+S · 다른 이름으로 저장 Ctrl+Shift+S(표 밖) 또는 **Alt+V** (한글과 같음) |

## 실행

```bash
npm install
npm run dev          # 브라우저에서 편집기 실행 (http://localhost:5173)
npm run app:dev      # 데스크톱 앱 창으로 실행 (Rust 필요)
```

## 새 버전 배포 (자동 업데이트)

```bash
npm run release -- 0.3.1 "바뀐 내용"   # 버전 올리기 + CHANGELOG + 커밋
git push                                 # 그다음 GitHub Actions → "배포" → Run workflow
```

- 배포: `.github/workflows/release.yml` (Run workflow 를 누르면 버전 태그를 만들고 Windows 설치 파일 + `latest.json` 을 GitHub Release 에 게시)
- 앱은 켤 때 `releases/latest/download/latest.json` 을 확인하고, "지금 업데이트" 를 누르면 내려받아 설치 후 다시 켜진다
- 업데이트 파일은 서명된다. 개인 키는 저장소 Secret `TAURI_SIGNING_PRIVATE_KEY` 에만 둔다 (**잃어버리면 기존 설치본에 업데이트를 보낼 수 없으니 따로 백업**)
- 평소 커밋은 `.github/workflows/ci.yml` 이 타입 검사·왕복 테스트·구조 검증을 돌린다

## Windows 설치 파일 만들기

세 가지 방법 중 하나를 쓴다. 결과물은 `HanWord_0.2.0_x64-setup.exe` 한 개다.

1. **내 PC에서** — `설치파일-만들기.cmd` 더블클릭. 처음엔 Rust·Visual Studio C++ 빌드 도구를 자동 설치하느라 20~40분, 이후엔 몇 분.
2. **GitHub 에서 자동으로** — 위의 "새 버전 배포" 참고.
3. **리눅스에서 교차 빌드** — `scripts/cross-build-windows.sh` (MinGW + NSIS, 개발자용)

데스크톱 앱에서만 되는 것: Windows 파일 대화상자, 연 파일에 바로 저장(Ctrl+S), 창 제목에 파일 이름·수정 표시,
저장 안 하고 닫을 때 경고, 파일을 창에 끌어다 놓아 열기, 탐색기 "연결 프로그램 → HanWord".
저장은 임시 파일에 쓴 뒤 바꿔치기하므로 저장 도중 꺼져도 원본이 깨지지 않는다.

## 열기

- `.hwpx` — 한글 문서. 저장기의 역방향 + 한글이 만든 일반 문서
- `.docx` — Word 문서. 스타일 상속, 번호 목록, 병합 표, "같은 스타일 문단 간격 무시"까지 처리
- 그림·도형·머리말 등 아직 지원하지 않는 요소는 열 때 알려 주고, **원본에 덮어쓰기 전에 한 번 더 확인**한다
- 구형 `.hwp`/`.doc` 는 열지 못한다 (한글/Word 에서 hwpx/docx 로 저장 후 열기)

## 검증 — "한글/Word 에서 깨지지 않는가"

```bash
pip install -r verify/requirements.txt
npm run verify
```

| 단계 | 하는 일 |
|---|---|
| `npm run roundtrip` | **왕복 테스트**: 저장→열기, 형식 바꿔 저장→열기, 편집기 거쳐 저장 — 결과가 원본과 한 글자·한 서식도 다르지 않은지 |
| `npm run samples` | `verify/samples.ts` 의 샘플(서식·표·긴 문서)을 실제 저장기로 `verify/out/` 에 HWPX·DOCX 로 만든다 |
| `verify/verify.py` | HWPX: ZIP 구조, OWPML 스키마, 한글 열기 차단 이슈, ID 참조 무결성, 글자 누락 / DOCX: 열림, 글자 누락, LibreOffice 렌더링(PDF·PNG) |
| `npm run render:hwpx` | 독립 렌더러 rhwp 로 HWPX 를 SVG 로 그려 한글 없이 레이아웃 확인 |
| `verify/windows/verify-in-office.ps1` | **Windows 에서 실제 한글·Word 로** 열어 글자 비교, 쪽 수 비교, 각 프로그램이 그린 PDF 저장 |

최종 판정은 마지막 Windows 스크립트다. 새 기능을 넣을 때마다 샘플을 추가하고 이 스크립트까지 돌린다.

```powershell
npm run samples
powershell -ExecutionPolicy Bypass -File verify\windows\verify-in-office.ps1
```

## 호환성을 위해 지키는 규칙

**편집기에는 양쪽에서 1:1 로 표현되는 기능만 둔다.** 현재: 글꼴, 크기, 자간, 굵게·기울임·밑줄·취소선, 글자색, 정렬, 제목 1–3, 목록, 표(가로·세로 병합, 열 너비, 칸 배경색, 칸 테두리), 문단 안 줄바꿈, 쪽 나누기, 머리말·꼬리말, 쪽 번호, 그림(글자처럼 취급).

| 항목 | 한글(HWPX) | Word(DOCX) | 처리 |
|---|---|---|---|
| 단위 | HWPUNIT(1/7200in), 글자 pt×100 | twip(1/1440in), 반 포인트 | `units.ts` 에서만 변환 |
| 쪽 여백 | 본문 시작 = 위 여백 + 머리말 | `top` = 본문까지 거리 | Word top = 한글 top + header |
| 줄 간격 | 글자 크기 × 160% | 배수는 글꼴 자체 줄 높이 기준 | Word 에 "최소" 규칙으로 (최대 글자 크기 × %) 기록 |
| 문단 여백 | `hp:case` 와 `hp:default`(값 2배) 두 곳 | 한 곳 | 두 곳 모두 기록 |
| 양쪽 정렬 + Shift+Enter | 줄을 늘리지 않음 | 줄을 양끝으로 늘림 | Word 에 `doNotExpandShiftReturn` |
| 표 | 고정 열 너비, 셀 세로 가운데 | 자동 맞춤이 기본 | Word 표를 `fixed` 레이아웃·가운데 정렬로 |
| 글꼴 | 함초롬체 기본 | 맑은 고딕 기본 | 기본 맑은 고딕, 한컴오피스 글꼴(휴먼명조 등)은 "(한글 전용)" 표시 |
| 칸 배경색 | borderFill 의 `hc:fillBrush/winBrush faceColor` (색마다 borderFill 하나) | `w:tcPr/w:shd w:fill` | 둘 다 기록, 열 때 둘 다 읽음 |
| 칸 테두리 | borderFill 의 left/right/top/bottomBorder (SOLID·DOUBLE_SLIM·NONE, 정해진 굵기) | `w:tcBorders` (single·double·nil, 1/8pt) | 맞닿은 칸의 변을 같게 맞춘 뒤 기록 (`borders.ts`) |
| 자간 | charPr `spacing` (글자 크기 대비 %) | `w:spacing` (twip) | 크기 × % 로 환산 |
| 쪽 번호 | `hp:pageNum pos sideChar="-"` (쪽 번호 매기기) | 머리글/바닥글 문단의 `PAGE` 필드 + "- " " -" | 열 때 한글 머리말 안 `autoNum PAGE` 도 쪽 번호로 |
| 머리말/꼬리말 | 첫 문단 구역 run 의 `hp:header`/`hp:footer` 컨트롤 | `w:headerReference`/`footerReference` (default) | 모든 쪽 같은 것 하나만 |
| 그림 | `hp:pic`(treatAsChar) + `BinData/imageN` + content.hpf 목록 + `hh:binDataList` | `wp:inline` + `word/media` | 원본 바이트 그대로, 크기 mm |
| 빈 문단 높이 | 문단 글자모양 기준 | 문단 기호 서식 기준 | 둘 다 같은 글자모양 지정 |

HWPX 는 XML 을 처음부터 만들지 않는다. **한글이 직접 저장한 빈 문서**(`templates/blank.hwpx`)를 열어
`header.xml` 에는 글꼴·글자모양·문단모양·테두리를 *추가만* 하고, `section0.xml` 에는 한글이 만든 구역 설정을 그대로 둔 채 본문만 채운다.

## 구조

```
src/
  model/      공통 문서 모델 · 기본값 · 단위 변환 · 실효 서식 · 표 격자 계산 · TipTap 변환
  export/     hwpx.ts, docx.ts, templates.generated.ts (npm run embed 가 생성)
  import/     hwpx.ts, docx.ts (열기), xml.ts
  ai/         markdown.ts (마크다운 ↔ 문서), node.ts (명령줄용 연결)
  editor/     편집기 확장 (문단 들여쓰기·간격)
  main.ts     편집기 UI      platform.ts  데스크톱/브라우저별 파일 처리
src-tauri/    데스크톱 앱 (Rust: 파일 읽기/쓰기만)
cli/          AI 용 변환기 (hanword-cli.ts → 묶은 파일 hanword.mjs, `npm run build:cli`)
docs/         AI 작성 가이드
templates/    blank.hwpx (한글이 저장한 빈 문서)
verify/       샘플, 검증 스크립트, Windows 실제 프로그램 검증
```

## 아직 하지 않은 것 (로드맵)

1. **보정 (지금 바로)** — Windows 스크립트로 샘플 20종을 비교해 쪽 수가 다르면 `LINE_CALIBRATION` 조정. Word 의 한글 줄나눔(어절/글자 단위)이 한글과 같은지도 확인
2. **무손실 저장** — 지원하지 않는 요소(그림 등)를 원본 XML 그대로 보관했다가 다시 쓰기
3. 기능 추가 (각각 HWPX·DOCX 짝을 확정한 뒤): 자동 번호 목록, 그림, 머리말/꼬리말·쪽 번호, 쪽 나누기, 표 속 표
4. **구형 .hwp 열기** — rhwp 또는 hwpjs 로 읽기
5. 자동 업데이트, 최근 문서 목록, 코드 서명(설치 시 Windows 경고 없애기)

## 라이선스

MIT. `templates/blank.hwpx` 는 [python-hwpx](https://github.com/airmang/python-hwpx)(Apache-2.0)에서 가져왔다 — `templates/NOTICE-python-hwpx` 참고.
