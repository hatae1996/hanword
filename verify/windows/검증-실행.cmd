@echo off
chcp 65001 >nul
echo HanWord - 한글/Word 실제 검증을 시작합니다. 한글 보안 창이 뜨면 "모두 허용"을 누르세요.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-in-office.ps1"
echo.
echo 끝났습니다. 같은 폴더의 검증결과.txt 를 확인하세요.
pause
