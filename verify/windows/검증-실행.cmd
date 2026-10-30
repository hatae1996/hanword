@echo off
chcp 65001 >nul
echo HanWord - 한글 실제 검증을 시작합니다. 문서마다 진행 상황이 한 줄씩 나옵니다.
echo 한글 보안 창이 뜨면 "모두 허용"을 누르세요. 한글 창이 잠깐씩 열렸다 닫히는 것은 정상입니다. 1분 안에 끝납니다.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-in-office.ps1"
echo.
echo 끝났습니다. 같은 폴더의 검증결과.txt 를 보내 주세요. (중간에 멈췄다면 검증진행.txt 를 보내 주세요)
pause
