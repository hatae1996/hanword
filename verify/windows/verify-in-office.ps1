<#
  HanWord - 실제 한글/Word 로 검증 (Windows 전용)

  verify\out 의 .docx 는 Microsoft Word 로, .hwpx 는 한컴오피스 한글로 열어서
    1) 열리는지 (오류/변환 대화상자 없이)
    2) 글자가 빠지지 않았는지 (*.expected.txt 와 비교)
    3) 쪽 수 (Word 와 한글이 같은 쪽 수로 나오는지)
  를 확인하고, 각 프로그램이 그린 결과를 PDF 로 저장한다 (verify\out\office-pdf).
  두 PDF 를 나란히 놓고 보면 "양쪽에서 같은 모양으로 보이는지" 바로 비교할 수 있다.

  실행 (PowerShell):
    npm run samples
    powershell -ExecutionPolicy Bypass -File verify\windows\verify-in-office.ps1

  한글 자동화 보안 대화상자:
    한글은 외부 프로그램이 파일을 열 때마다 "접근 허용" 창을 띄운다.
    한컴 개발자 사이트의 "보안승인모듈(FilePathCheckerModule)"을 받아
    HKCU\SOFTWARE\HNC\HwpAutomation\Modules 에 FilePathCheckerModule = <dll 경로> 로 등록하면 창 없이 실행된다.
    등록하지 않았으면 창이 뜰 때 "모두 허용"을 누르면 된다.
#>
param([string]$Dir = (Join-Path $PSScriptRoot "..\out"))

$ErrorActionPreference = "Stop"
$Dir = (Resolve-Path $Dir).Path
$pdfDir = Join-Path $Dir "office-pdf"
New-Item -ItemType Directory -Force $pdfDir | Out-Null

function Squash([string]$s) { return ($s -replace '\s', '') }
function Expected([string]$stem) {
  $p = Join-Path $Dir "$stem.expected.txt"
  if (Test-Path $p) { return Squash ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)) } else { return $null }
}

$rows = @()

# ── Microsoft Word ──────────────────────────────────────────
$word = $null
try { $word = New-Object -ComObject Word.Application } catch { Write-Warning "Microsoft Word 가 설치돼 있지 않아 DOCX 검사를 건너뜁니다." }
if ($word) {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($f in Get-ChildItem $Dir -Filter *.docx) {
    $r = [ordered]@{ 파일 = $f.Name; 프로그램 = "Word"; 열림 = $false; 글자 = "-"; 쪽수 = "-"; 비고 = "" }
    try {
      # Open(FileName, ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false)
      $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
      $r.열림 = $true
      if ($doc.CompatibilityMode -lt 15) { $r.비고 = "호환 모드로 열림($($doc.CompatibilityMode))" }
      $r.쪽수 = $doc.ComputeStatistics(2)   # wdStatisticPages
      $exp = Expected $f.BaseName
      if ($exp) { $r.글자 = if ((Squash $doc.Content.Text) -eq $exp) { "일치" } else { "불일치" } }
      $doc.ExportAsFixedFormat((Join-Path $pdfDir "$($f.BaseName).word.pdf"), 17)  # wdExportFormatPDF
      $doc.Close($false)
    } catch { $r.비고 = $_.Exception.Message }
    $rows += [pscustomobject]$r
  }
  $word.Quit()
}

# ── 한컴오피스 한글 ─────────────────────────────────────────
$hwp = $null
try { $hwp = New-Object -ComObject HWPFrame.HwpObject } catch { Write-Warning "한컴오피스 한글이 설치돼 있지 않아 HWPX 검사를 건너뜁니다." }
if ($hwp) {
  try { [void]$hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") } catch {}
  try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  foreach ($f in Get-ChildItem $Dir -Filter *.hwpx) {
    $r = [ordered]@{ 파일 = $f.Name; 프로그램 = "한글"; 열림 = $false; 글자 = "-"; 쪽수 = "-"; 비고 = "" }
    try {
      $r.열림 = [bool]$hwp.Open($f.FullName, "HWPX", "forceopen:true;versionwarning:false")
      if ($r.열림) {
        $r.쪽수 = $hwp.PageCount
        $exp = Expected $f.BaseName
        if ($exp) { $r.글자 = if ((Squash ($hwp.GetTextFile("TEXT", ""))) -eq $exp) { "일치" } else { "불일치" } }
        [void]$hwp.SaveAs((Join-Path $pdfDir "$($f.BaseName).hwp.pdf"), "PDF", "")
      }
      [void]$hwp.Clear(1)   # 저장하지 않고 닫기
    } catch { $r.비고 = $_.Exception.Message }
    $rows += [pscustomobject]$r
  }
  $hwp.Quit()
}

# ── 결과 ────────────────────────────────────────────────────
$rows | Format-Table -AutoSize

# 같은 샘플의 Word/한글 쪽 수 비교
$bad = 0
foreach ($g in ($rows | Group-Object { [IO.Path]::GetFileNameWithoutExtension($_.파일) })) {
  $w = $g.Group | Where-Object 프로그램 -eq "Word"
  $h = $g.Group | Where-Object 프로그램 -eq "한글"
  if ($w -and $h -and $w.쪽수 -ne $h.쪽수) {
    Write-Host ("쪽 수 다름: {0}  Word {1}쪽 / 한글 {2}쪽  → src/model/units.ts 의 LINE_CALIBRATION 보정 필요" -f $g.Name, $w.쪽수, $h.쪽수) -ForegroundColor Yellow
  }
}
foreach ($r in $rows) { if (-not $r.열림 -or $r.글자 -eq "불일치") { $bad++ } }
Write-Host ""
Write-Host "PDF 저장 위치: $pdfDir  (같은 이름의 .word.pdf 와 .hwp.pdf 를 나란히 비교하세요)"
if ($bad) { Write-Host "문제 $bad 건" -ForegroundColor Red; exit 1 } else { Write-Host "모두 통과" -ForegroundColor Green }
