<#
  HanWord - Windows 설치 파일 만들기

  처음 한 번은 필요한 도구(Rust, Visual Studio C++ 빌드 도구)를 설치하므로 20~40분 걸릴 수 있습니다.
  그다음부터는 몇 분이면 됩니다.

  실행: 이 폴더에서 "설치파일-만들기.cmd" 를 더블클릭하거나
        powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
#>
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") + ";" + (Join-Path $env:USERPROFILE ".cargo\bin")
}

Write-Host "== 1/4 필요한 도구 확인 ==" -ForegroundColor Cyan
if (-not (Has "node")) { throw "Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요." }

if (-not (Has "cargo")) {
  Write-Host "Rust 를 설치합니다 (winget)..."
  winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
  rustup default stable
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVC = (Test-Path $vswhere) -and (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
if (-not $hasVC) {
  Write-Host "Visual Studio C++ 빌드 도구를 설치합니다 (용량이 커서 오래 걸립니다)..."
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
    --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
}
Refresh-Path

Write-Host "== 2/4 패키지 설치 ==" -ForegroundColor Cyan
npm install

Write-Host "== 3/4 검사 (저장→열기 왕복) ==" -ForegroundColor Cyan
npm run roundtrip

Write-Host "== 4/4 설치 파일 만들기 ==" -ForegroundColor Cyan
npm run app:build

$out = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "완료: $($out.FullName)" -ForegroundColor Green
explorer.exe /select,"$($out.FullName)"
