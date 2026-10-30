<#
  HanWord - 실제 한글/Word 로 검증 (Windows 전용)

  verify\out 의 .hwpx 는 한컴오피스 한글로, .docx 는 Microsoft Word 로 열어서
    1) 열리는지 (오류/변환 대화상자 없이)
    2) 글자가 빠지지 않았는지 (*.expected.txt 와 비교)
    3) 쪽 수 (Word 와 한글이 같은 쪽 수로 나오는지)
  를 확인하고, 각 프로그램이 그린 결과를 PDF 로 저장한다 (verify\out\office-pdf).
  두 PDF 를 나란히 놓고 보면 "양쪽에서 같은 모양으로 보이는지" 바로 비교할 수 있다.

  실행:
    검증 꾸러미: 압축을 풀고 "검증-실행.cmd" 를 두 번 누른다 → 같은 폴더에 "검증결과.txt"
    저장소: npm run samples 후 powershell -ExecutionPolicy Bypass -File verify\windows\verify-in-office.ps1

  한글 자동화 보안 대화상자:
    한글은 외부 프로그램이 파일을 열 때마다 "접근 허용" 창을 띄운다.
    한컴 개발자 사이트의 "보안승인모듈(FilePathCheckerModule)"을 받아
    HKCU\SOFTWARE\HNC\HwpAutomation\Modules 에 FilePathCheckerModule = <dll 경로> 로 등록하면 창 없이 실행된다.
    등록하지 않았으면 창이 뜰 때 "모두 허용"을 누르면 된다.
#>
param([string]$Dir = "", [switch]$Word)   # Word 검사는 -Word 를 붙였을 때만 (기본: 한글만)

# 검증 꾸러미(릴리스의 HanWord-검증꾸러미.zip)로 받았으면 옆의 "샘플" 폴더, 저장소에서는 verify\out
if (-not $Dir) {
  $kit = Join-Path $PSScriptRoot "샘플"
  $Dir = if (Test-Path $kit) { $kit } else { Join-Path $PSScriptRoot "..\out" }
}

$ErrorActionPreference = "Stop"
$Dir = (Resolve-Path $Dir).Path

# 검은 창을 마우스로 누르면 Windows 가 "선택" 모드로 바꾸면서 스크립트를 일시 정지시킨다 → 그 기능을 끈다
try {
  Add-Type -Namespace HanWord -Name Con -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetStdHandle(int h);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(System.IntPtr h, out uint m);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(System.IntPtr h, uint m);
'@
  $hin = [HanWord.Con]::GetStdHandle(-10); $mode = 0
  if ([HanWord.Con]::GetConsoleMode($hin, [ref]$mode)) { [void][HanWord.Con]::SetConsoleMode($hin, ($mode -band (-bnot 0x40)) -bor 0x80) }
} catch {}

# 인터넷에서 받은 zip 을 풀면 파일에 "인터넷에서 받음" 표시가 붙어 Word 가 보호된 보기로 열려다 멈출 수 있다 → 표시 지우기
Get-ChildItem $Dir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

$out = Join-Path $PSScriptRoot "검증결과.txt"
$log = Join-Path $PSScriptRoot "검증진행.txt"   # 중간에 멈춰도 어디까지 했는지 남는다
[IO.File]::WriteAllText($log, "HanWord 검증 진행 $(Get-Date -Format 'yyyy-MM-dd HH:mm')`r`n", (New-Object Text.UTF8Encoding $true))
function Step([string]$msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Write-Host $line
  [IO.File]::AppendAllText($log, "$line`r`n", (New-Object Text.UTF8Encoding $false))
}
$pdfDir = Join-Path $Dir "office-pdf"
New-Item -ItemType Directory -Force $pdfDir | Out-Null

# 글자 비교: 공백·줄바꿈·제어 문자(Word 표 칸 끝 표시 등)는 빼고 비교
function Squash([string]$s) { return ($s -replace '[\s\x00-\x1F​﻿]', '') }
function Expected([string]$stem) {
  $p = Join-Path $Dir "$stem.expected.txt"
  if (Test-Path $p) { return Squash ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)) } else { return $null }
}
$diffs = @()
# 글자가 다르면 어디서부터 다른지 남긴다 (검증결과.txt 에 들어감)
function CheckText([string]$stem, [string]$prog, [string]$raw, [string]$ext) {
  [IO.File]::WriteAllText((Join-Path $pdfDir "$stem.$ext.txt"), $raw, (New-Object Text.UTF8Encoding $true))
  $exp = Expected $stem
  if (-not $exp) { return "-" }
  # 한글 GetTextFile("TEXT") 는 옛 한글 코드(CP949)로 내보내서 거기 없는 글자(• ◦ — 줄 안 바뀜 빈칸 등)를
  # &#8226; 같은 숫자 표기로 바꾼다 → 되돌려서 비교 (문서에는 제대로 들어 있음)
  $act = Squash ([System.Net.WebUtility]::HtmlDecode($raw))
  if ($act -eq $exp) { return "일치" }
  $n = [Math]::Min($exp.Length, $act.Length); $k = 0
  while ($k -lt $n -and $exp[$k] -eq $act[$k]) { $k++ }
  $st = [Math]::Max(0, $k - 12)
  $e = if ($st -lt $exp.Length) { $exp.Substring($st, [Math]::Min(45, $exp.Length - $st)) } else { "" }
  $a = if ($st -lt $act.Length) { $act.Substring($st, [Math]::Min(45, $act.Length - $st)) } else { "" }
  $script:diffs += "글자 다름: $stem ($prog)  기대 $($exp.Length)자 / 실제 $($act.Length)자, $($k+1)번째 글자부터`r`n    기대: $e`r`n    실제: $a"
  return "불일치"
}

# 감시: 한 문서에서 2분 30초 넘게 응답이 없으면(숨은 안내 창 등) 그 프로그램을 끄고 다음 문서로
$beat = Join-Path $env:TEMP "hanword-verify-beat.txt"
function Beat([string]$proc) { [IO.File]::WriteAllText($beat, $proc) }
Beat ""
$watch = Start-Job -ArgumentList $beat -ScriptBlock {
  param($beat)
  while ($true) {
    Start-Sleep -Seconds 5
    if (-not (Test-Path $beat)) { continue }
    $name = ([IO.File]::ReadAllText($beat)).Trim()
    if ($name -eq "done") { break }
    if ($name -and ((Get-Date) - (Get-Item $beat).LastWriteTime).TotalSeconds -gt 150) {
      Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
      [IO.File]::WriteAllText($beat, "")
    }
  }
}
function Alive([string]$name) { return [bool](Get-Process -Name $name -ErrorAction SilentlyContinue) }

$rows = @()

# ── 한컴오피스 한글 ─────────────────────────────────────────
function NewHwp {
  $h = New-Object -ComObject HWPFrame.HwpObject
  try { [void]$h.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") } catch {}
  # 창을 보이게 둔다 — 보안 창("접근 허용")이 숨은 창 뒤에 떠서 멈추는 일을 막는다
  try { $h.XHwpWindows.Item(0).Visible = $true } catch {}
  return $h
}
$hwp = $null
$hwps = @(Get-ChildItem $Dir -Filter *.hwpx)
Step "한글 시작 (문서 $($hwps.Count)개) — 보안 창이 뜨면 '모두 허용'"
try { $hwp = NewHwp } catch { Step "한컴오피스 한글이 설치돼 있지 않아 HWPX 검사를 건너뜁니다." }
if ($hwp) {
  $i = 0
  foreach ($f in $hwps) {
    $i++
    Step "한글 [$i/$($hwps.Count)] $($f.Name) 여는 중..."
    $r = [ordered]@{ 파일 = $f.Name; 프로그램 = "한글"; 열림 = $false; 글자 = "-"; 쪽수 = "-"; 비고 = "" }
    try {
      if (-not $hwp) { $hwp = NewHwp }
      Beat "Hwp"
      $r.열림 = [bool]$hwp.Open($f.FullName, "HWPX", "forceopen:true;versionwarning:false")
      if ($r.열림) {
        Beat "Hwp"; $r.쪽수 = $hwp.PageCount
        Beat "Hwp"; $r.글자 = CheckText $f.BaseName "한글" ($hwp.GetTextFile("TEXT", "")) "hwp"
        Beat "Hwp"; [void]$hwp.SaveAs((Join-Path $pdfDir "$($f.BaseName).hwp.pdf"), "PDF", "")
      }
      [void]$hwp.Clear(1)   # 저장하지 않고 닫기
    } catch {
      $r.비고 = $_.Exception.Message
      if (-not (Alive "Hwp")) { $r.비고 = "응답 없음 — 한글을 다시 켜고 다음 문서로"; $hwp = $null }
    }
    Beat ""
    Step "    → 열림 $($r.열림) · 글자 $($r.글자) · $($r.쪽수)쪽 $($r.비고)"
    $rows += [pscustomobject]$r
  }
  if ($hwp) { try { $hwp.Quit() } catch {} }
}

# ── Microsoft Word ──────────────────────────────────────────
function NewWord {
  $w = New-Object -ComObject Word.Application
  # 창을 보이게 둔다 — Word 가 묻는 창(첫 실행 안내, 로그인 등)이 뜨면 사람이 눌러 줄 수 있게
  $w.Visible = $true
  $w.DisplayAlerts = 0
  try { $w.AutomationSecurity = 3 } catch {}   # 매크로 묻지 않기
  return $w
}
$word = $null
$wordPdf = $true   # 로그인 안 된 Word 는 PDF 저장에서 멈춘다 → 한 번 멈추면 나머지는 PDF 없이 쪽 수만
$docs = @(Get-ChildItem $Dir -Filter *.docx)
if ($Word) {
  Step "Word 시작 (문서 $($docs.Count)개)"
  try { $word = NewWord } catch { Step "Microsoft Word 가 설치돼 있지 않아 DOCX 검사를 건너뜁니다." }
}
if ($word) {
  $i = 0
  foreach ($f in $docs) {
    $i++
    Step "Word [$i/$($docs.Count)] $($f.Name) 여는 중..."
    $r = [ordered]@{ 파일 = $f.Name; 프로그램 = "Word"; 열림 = $false; 글자 = "-"; 쪽수 = "-"; 비고 = "" }
    $stage = "열기"
    try {
      if (-not $word) { $word = NewWord }
      Beat "WINWORD"
      # Open(FileName, ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false)
      $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
      $r.열림 = $true
      if ($doc.CompatibilityMode -lt 15) { $r.비고 = "호환 모드로 열림($($doc.CompatibilityMode))" }
      $stage = "쪽 수"; Beat "WINWORD"; $r.쪽수 = $doc.ComputeStatistics(2)   # wdStatisticPages
      $stage = "글자"; Beat "WINWORD"; $r.글자 = CheckText $f.BaseName "Word" ($doc.Content.Text) "word"
      if ($wordPdf) { $stage = "PDF"; Beat "WINWORD"; $doc.ExportAsFixedFormat((Join-Path $pdfDir "$($f.BaseName).word.pdf"), 17) }  # wdExportFormatPDF
      $doc.Close($false)
    } catch {
      $r.비고 = "$stage 단계: $($_.Exception.Message)"
      if (-not (Alive "WINWORD")) {
        $r.비고 = "$stage 단계에서 응답 없음 — Word 를 다시 켜고 다음 문서로"
        if ($stage -eq "PDF") { $wordPdf = $false; $r.비고 += " (이후 PDF 저장은 건너뜀: Word 로그인·정품 인증 확인)" }
        $word = $null
      }
    }
    Beat ""
    Step "    → 열림 $($r.열림) · 글자 $($r.글자) · $($r.쪽수)쪽 $($r.비고)"
    $rows += [pscustomobject]$r
  }
  if ($word) { try { $word.Quit() } catch {} }
}
Beat "done"
Remove-Job $watch -Force -ErrorAction SilentlyContinue

# ── 결과 ────────────────────────────────────────────────────
$table = $rows | Format-Table -AutoSize | Out-String -Width 200
Write-Host $table
$report = @("HanWord 실제 프로그램 검증 결과  $(Get-Date -Format 'yyyy-MM-dd HH:mm')", "Windows $([Environment]::OSVersion.Version)", $table)

# 같은 샘플의 Word/한글 쪽 수 비교
$bad = 0
foreach ($g in ($rows | Group-Object { [IO.Path]::GetFileNameWithoutExtension($_.파일) })) {
  $w = $g.Group | Where-Object 프로그램 -eq "Word"
  $h = $g.Group | Where-Object 프로그램 -eq "한글"
  if ($w -and $h -and $w.쪽수 -ne $h.쪽수) {
    $msg = "쪽 수 다름: {0}  Word {1}쪽 / 한글 {2}쪽" -f $g.Name, $w.쪽수, $h.쪽수
    Write-Host $msg -ForegroundColor Yellow
    $report += $msg
  }
}
foreach ($r in $rows) { if (-not $r.열림 -or $r.글자 -eq "불일치") { $bad++ } }
if ($diffs.Count) { $report += ""; $report += $diffs }
Write-Host ""
Write-Host "PDF 저장 위치: $pdfDir  (같은 이름의 .word.pdf 와 .hwp.pdf 를 나란히 비교하세요)"
$report += if ($bad) { "문제 $bad 건" } else { "모두 통과" }
[IO.File]::WriteAllLines($out, $report, (New-Object Text.UTF8Encoding $true))
Write-Host "결과 파일: $out  (이 파일을 Claude 에게 보내 주면 맞춰 고칩니다)"
if ($bad) { Write-Host "문제 $bad 건" -ForegroundColor Red; exit 1 } else { Write-Host "모두 통과" -ForegroundColor Green }
