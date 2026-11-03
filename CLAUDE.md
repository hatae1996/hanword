# HanWord — 새 세션이 먼저 읽을 것

한글(.hwpx)·Word(.docx) 양쪽에서 똑같이 보이는 문서를 만드는 데스크톱 편집기 (Tauri + TipTap).
사용자: 공공기관 기록물 사업을 수행하는 회사 직원(공무원 아님). 대화는 **한국어**, 쉬운 말로.

## 사용자와 일하는 방식
- 큰 작업은 버전 단위로 만들고, 버전마다 검증한 뒤 **끝에 한 번 보고**한다.
- 배포는 사용자가 직접 누른다. 릴리스 준비가 끝나면 **항상 Run workflow 링크를 준다**:
  https://github.com/hatae1996/hanword/actions/workflows/release.yml
- 설치된 앱은 자동 업데이트된다. 새 PC 설치: https://github.com/hatae1996/hanword/releases/latest 의 `HanWord_x.y.z_x64-setup.exe`
- 발주처(예: 강서구) 보고서 내용은 공개 저장소에 넣지 않는다. 서명 키는 저장소 비밀(TAURI_SIGNING_PRIVATE_KEY)에만 있다.
- 실제 한글 검증은 사용자가 Windows 에서 검증 꾸러미(`검증-실행.cmd`, 한글만 검사)를 돌려 `검증결과.txt` 를 보내 준다. Word 검사는 사용자가 원하지 않는다.

## 구조
- `src/model/` 공통 문서 모델(`types.ts`) — 모든 변환의 중심. HWPX·DOCX 에 **1:1 짝이 확정된 기능만** 넣는다
- `src/export/hwpx.ts`·`docx.ts` 저장, `src/import/hwpx.ts`·`docx.ts`·`hwp.ts`(rhwp) 열기
- `src/editor/` TipTap 확장: 개조식(gaejo), /부품(parts), 다듬기(polish), 메모(memo), 블록 손잡이(blocks) 등
- `src/design/` 문서 테마(역할 판별 `apply.ts`, 테마 값 `themes.ts`)
- `src/ui/` 대화상자·패널(디자인, 다듬기, 명령 창 Ctrl+K, 블록 메뉴, 인쇄)
- `src/ai/` 마크다운 ↔ 문서(AI 변환기), 공문체 규칙(`polish.ts`), Claude API(`claude.ts`)
- `cli/hanword.mjs` AI 용 변환기(마크다운 → 한글/Word), 문법은 `docs/AI-작성-가이드.md`
- `verify/` 샘플·검사, `verify/windows/` 실제 한글 검증 꾸러미

## 명령
```bash
npm ci
npx tsc                 # 타입 검사
npm run unit            # 단위 검사 (공문체 규칙, 초성 찾기 …)
npm run samples         # verify/out 에 샘플 hwpx/docx 생성
npm run roundtrip       # 저장 → 열기 왕복 + 테마 (CI)
npm run pages           # 실제 한글 쪽 수(verify/hangul-pages.json)와 rhwp 비교 + 편집기 쪽 시작 자리 (CI)
python3 verify/verify.py  # OWPML 스키마·python-hwpx·LibreOffice (venv 에 python-hwpx 필요)
npm run build           # dist/ (앱), npm run build:artifact → 체험판 한 파일
npm run build:cli       # cli/hanword.mjs
```
화면 시험은 Playwright 로 dist/index.html 을 열어 `window.hanword`(editor, currentDoc, loadFile, state …)로 확인한다.
데스크톱 앱 Rust 코드는 CI 의 Windows `cargo check` 로 확인한다.

## 릴리스
```bash
npm run release -- X.Y.Z "바뀐 점 한 줄"   # 버전 올리고 CHANGELOG + 커밋
# src-tauri/Cargo.lock 의 hanword 버전도 맞춘 뒤 커밋에 넣고 push → CI 확인 → 사용자에게 Run workflow 링크
```

## 지금까지 (2026-11 기준 1.7.2)
0.8 개조식·/부품 → 0.9 모양 복사·표 계산 → 0.10 자동 저장·탐색 창 → 0.11 쪽 번호·머리말 → 0.12 그림·사진대지 → 0.13 양식 →
1.0 구형 .hwp 열기·검증 꾸러미 → 1.0.1 인쇄 → 1.1 문장 다듬기 → 1.2 AI 다듬기 → 1.3 메모 → 1.4 문서 테마 → 1.5 블록 편집·Ctrl+K → 1.6 쪽 보기(한글 기준 쪽 나눔, `src/layout/pagination.ts`·`src/editor/pages.ts`) → 1.7 화면 모양·집중 모드(`src/ui/viewSettings.ts`), 손잡이 잡기 쉽게 → 1.7.1 끌어 옮기기를 마우스 추적으로(앱은 HTML 끌어다 놓기가 파일 열기에 쓰여 막힘 — 화면 안 끌기는 pointer 이벤트로 만들 것).
로드맵 문서: https://claude.ai/artifact/CLZc3rcr1NFZBdZkmmrojw · 체험판: https://claude.ai/artifact/Dh8GFPXarvNHfMdJ7NPYUD
하지 않기로 한 것: 노션식 감성 테마(그림 커버·아이콘·구분선) — 만들어 봤으나 사용자가 "한글 문서에 테마까진 필요 없다"고 해서 뺌 (1.8 취소).
남은 것: 변경 추적, 무손실 저장(지원 안 하는 요소 원본 보관), 코드 서명.
