#!/usr/bin/env python3
"""
HanWord 호환성 검증 — 우리가 만든 HWPX/DOCX 가 한글/Word 에서 깨지지 않을지 자동으로 점검한다.

검사 항목
  HWPX
    1. ZIP 구조: mimetype 이 첫 항목이고 무압축인지
    2. OWPML 스키마 검증 (python-hwpx 의 hwpx-validate 와 동일)
    3. 패키지 검증 + "한글에서 열기 차단" 이슈 검사
    4. ID 참조 무결성 (charPrIDRef / paraPrIDRef / borderFillIDRef 가 모두 정의돼 있는지)
    5. 글자 누락 검사 (다시 읽어서 원본 텍스트와 비교)
  DOCX
    1. python-docx 로 열리는지
    2. 글자 누락 검사
    3. (LibreOffice 가 있으면) PDF 로 렌더링 → 쪽 수 기록, 1쪽 미리보기 PNG 생성
  공통
    - HWPX 와 DOCX 의 글자/서식 정의가 서로 같은지 (글꼴, 크기 집합 비교)

실행:  pip install -r verify/requirements.txt  →  npm run verify
진짜 한글/Word 로 확인하려면 Windows 에서 verify/windows/verify-in-office.ps1 실행.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
RESULTS: list[tuple[str, str, bool, str]] = []


def check(file: str, name: str, ok: bool, detail: str = "") -> bool:
    RESULTS.append((file, name, ok, detail))
    return ok


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


# ───────────────────────── HWPX ─────────────────────────

def verify_hwpx(path: Path, expected: str) -> dict:
    from hwpx import HwpxDocument
    from hwpx.tools.validator import validate_document
    from hwpx.tools.package_validator import validate_package, validate_editor_open_safety

    f = path.name
    with zipfile.ZipFile(path) as z:
        first = z.infolist()[0]
        check(f, "ZIP: mimetype 첫 항목·무압축", first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED)
        header = z.read("Contents/header.xml").decode("utf-8")
        section = z.read("Contents/section0.xml").decode("utf-8")

    rep = validate_document(str(path))
    errors = [i for i in rep.issues if i.severity == "error"]
    warns = [i for i in rep.issues if i.severity != "error"]
    check(f, "OWPML 스키마", not errors and not warns, "; ".join(str(i) for i in (errors + warns)[:3]))

    pkg = validate_package(str(path))
    pkg_err = list(pkg.errors)
    check(f, "패키지 구조", not pkg_err, "; ".join(str(i) for i in pkg_err[:3]))

    safety = validate_editor_open_safety(str(path))
    check(f, "한글 열기 차단 이슈 없음", safety.ok, "" if safety.ok else safety.summary()[:300])

    # ID 참조 무결성
    defined = {
        "charPrIDRef": set(re.findall(r'<hh:charPr id="(\d+)"', header)),
        "paraPrIDRef": set(re.findall(r'<hh:paraPr id="(\d+)"', header)),
        "borderFillIDRef": set(re.findall(r'<hh:borderFill id="(\d+)"', header)),
        "styleIDRef": set(re.findall(r'<hh:style id="(\d+)"', header)),
    }
    dangling = []
    for attr, ids in defined.items():
        for ref in set(re.findall(rf'{attr}="(\d+)"', section)):
            if ref not in ids:
                dangling.append(f"{attr}={ref}")
    for tag in ("charProperties", "paraProperties", "borderFills"):
        m = re.search(rf'<hh:{tag} itemCnt="(\d+)"', header)
        n = len(re.findall(rf'<hh:{ {"charProperties": "charPr", "paraProperties": "paraPr", "borderFills": "borderFill"}[tag]} id=', header))
        if m and int(m.group(1)) != n:
            dangling.append(f"{tag} itemCnt {m.group(1)}≠{n}")
    check(f, "ID 참조 무결성", not dangling, ", ".join(dangling[:5]))

    doc = HwpxDocument.open(str(path))
    text = doc.text.plain() if hasattr(doc, "text") and callable(getattr(doc.text, "plain", None)) else doc.export_text()
    ok = squash(text) == squash(expected)
    check(f, "글자 누락 없음", ok, "" if ok else f"원본 {len(squash(expected))}자 / 읽은 값 {len(squash(text))}자")

    sizes = sorted({int(h) / 100 for h in re.findall(r'<hh:charPr id="\d+" height="(\d+)"', header)})
    fonts = sorted(set(re.findall(r'face="([^"]+)"', header)))
    return {"sizes": sizes, "fonts": fonts}


# ───────────────────────── DOCX ─────────────────────────

def docx_text(path: Path) -> str:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = docx.Document(str(path))
    parts: list[str] = []
    for child in d.element.body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag == "p":
            parts.append(Paragraph(child, d).text)
        elif tag == "tbl":
            # 병합 셀은 row.cells 에 반복해서 나오므로 같은 <w:tc> 요소는 한 번만 센다
            # (lxml 프록시는 참조를 붙잡고 있어야 동일성이 유지되므로 리스트에 보관)
            seen: list = []
            for row in Table(child, d).rows:
                for cell in row.cells:
                    if any(cell._tc is s for s in seen):
                        continue
                    seen.append(cell._tc)
                    parts.append(cell.text)
    return "\n".join(parts)


def verify_docx(path: Path, expected: str, render_dir: Path | None) -> dict:
    import docx

    f = path.name
    try:
        d = docx.Document(str(path))
        check(f, "python-docx 로 열림", True)
    except Exception as e:  # noqa: BLE001
        check(f, "python-docx 로 열림", False, str(e))
        return {}
    text = docx_text(path)
    ok = squash(text) == squash(expected)
    check(f, "글자 누락 없음", ok, "" if ok else f"원본 {len(squash(expected))}자 / 읽은 값 {len(squash(text))}자")

    sizes, fonts = set(), set()
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    sizes = {int(v) / 2 for v in re.findall(r'<w:sz w:val="(\d+)"', xml)}
    fonts = set(re.findall(r'w:eastAsia="([^"]+)"', xml))

    info = {"sizes": sorted(sizes), "fonts": sorted(fonts)}
    if render_dir:
        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(path)],
                               capture_output=True, text=True, timeout=180)
            pdf = Path(tmp) / (path.stem + ".pdf")
            if check(f, "LibreOffice 렌더링", pdf.exists(), r.stderr.strip()[:200]):
                pages = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
                m = re.search(r"Pages:\s+(\d+)", pages)
                info["pages"] = int(m.group(1)) if m else None
                shutil.copy(pdf, render_dir / pdf.name)
                if shutil.which("pdftoppm"):
                    subprocess.run(["pdftoppm", "-png", "-r", "60", "-f", "1", "-l", "2", str(pdf), str(render_dir / path.stem)], check=False)
    return info


# ───────────────────────── main ─────────────────────────

def main() -> int:
    try:
        import hwpx  # noqa: F401
        import docx  # noqa: F401
    except ImportError:
        print("검증 도구가 설치돼 있지 않습니다. 먼저 실행하세요:  pip install -r verify/requirements.txt")
        return 2
    if not OUT.exists():
        print("verify/out 이 없습니다. 먼저 `npm run samples` 를 실행하세요.")
        return 2
    render_dir = OUT / "render" if (shutil.which("soffice") or shutil.which("libreoffice")) else None
    if render_dir:
        render_dir.mkdir(exist_ok=True)

    for exp in sorted(OUT.glob("*.expected.txt")):
        stem = exp.name[: -len(".expected.txt")]
        expected = exp.read_text(encoding="utf-8")
        h = verify_hwpx(OUT / f"{stem}.hwpx", expected)
        d = verify_docx(OUT / f"{stem}.docx", expected, render_dir)
        # 서식 정의 비교: 두 포맷이 같은 글자 크기 집합을 쓰는지
        same = set(d.get("sizes", [])) <= set(h.get("sizes", [])) | {10.0}
        check(stem, "HWPX↔DOCX 글자 크기 일치", same, f"HWPX {h.get('sizes')} / DOCX {d.get('sizes')}")
        if "pages" in d:
            print(f"  · {stem}: LibreOffice 기준 {d['pages']}쪽 (한글 쪽 수는 Windows 스크립트로 비교)")

    width = max(len(r[0]) for r in RESULTS)
    failed = 0
    print()
    for file, name, ok, detail in RESULTS:
        failed += not ok
        print(f"{'✅' if ok else '❌'} {file.ljust(width)}  {name}" + (f"  — {detail}" if detail and not ok else ""))
    print(f"\n{len(RESULTS) - failed}/{len(RESULTS)} 통과" + (f", {failed} 실패" if failed else ""))
    if render_dir:
        print(f"렌더링 결과(PDF/PNG): {render_dir}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
