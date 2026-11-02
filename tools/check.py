"""UI Gallery 검사 스크립트 (Python 표준 라이브러리만 사용).

    python tools/check.py            # 소스 규칙 + dist 용량 + 오프라인 실행 검사
    python tools/check.py --links    # + 해설·출처 링크 생존 확인 (인터넷 필요)

검사 항목
  1. 비트맵 이미지 파일 금지 (그래픽은 SVG/CSS/three.js 로)
  2. 표본 폴더: kebab-case 이름, index.tsx · meta.ts 필수, meta.ts 의 id 와 폴더명 일치
  3. Unity 코드: 표본마다 ugui · uitk 폴더 존재 (없으면 경고)
  4. 상대 경로 import 의 대소문자가 실제 파일과 정확히 일치 (Windows 에선 통과해도 Linux CI 에서 깨짐)
  5. dist/index.html 용량 예산 (원본 5MB · gzip 1.5MB, 90% 넘으면 경고)
     - gzip 은 GitHub Pages 가 실제로 보내는 양, 원본은 '오프라인용 HTML 받기' 파일 크기
     - 표본별로 얼마나 늘었는지는 node tools/size.mjs
  6. 네트워크를 완전히 막은 헤드리스 Chrome 으로 file:// 실행 → 모든 표본 제목이 렌더되는지
  7. Unity 파일: UXML 이 올바른 XML 인지 (예: 주석 속 '--' 는 Unity 가 임포트하지 못한다),
     C# 가 namespace UIGallery.<표본> 안에 있는지 (specimen-guide 8절)
"""

from __future__ import annotations

import gzip
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist" / "index.html"
BUDGET = 5 * 1024 * 1024
BUDGET_GZIP = int(1.5 * 1024 * 1024)
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
BITMAP = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tga", ".psd"}
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def check_bitmaps() -> None:
    for p in SRC.rglob("*"):
        if p.suffix.lower() in BITMAP:
            err(f"비트맵 파일 금지: {p.relative_to(ROOT)}")


def check_specimens() -> list[tuple[str, str]]:
    found = []
    for d in sorted((SRC / "specimens").iterdir()):
        if not d.is_dir():
            continue
        if not KEBAB.match(d.name):
            err(f"표본 폴더명은 kebab-case: {d.name}")
        meta = d / "meta.ts"
        if not (d / "index.tsx").exists():
            err(f"{d.name}: index.tsx 없음")
        if not meta.exists():
            err(f"{d.name}: meta.ts 없음")
            continue
        text = meta.read_text(encoding="utf-8")
        m_id = re.search(r"\bid:\s*'([^']+)'", text)
        m_title = re.search(r"\btitle:\s*'([^']+)'", text)
        if not m_id or m_id.group(1) != d.name:
            err(f"{d.name}: meta.id 가 폴더명과 다름")
        unity = SRC / "unity" / d.name
        for kind in ("ugui", "uitk"):
            if not (unity / kind).is_dir() or not any((unity / kind).iterdir()):
                warn(f"{d.name}: Unity {kind} 코드 없음")
        found.append((d.name, m_title.group(1) if m_title else d.name))
    return found


def check_unity_files() -> None:
    for f in sorted((SRC / "unity").rglob("*.uxml")):
        try:
            ElementTree.parse(f)
        except ElementTree.ParseError as e:
            err(f"UXML 이 올바른 XML 이 아님 (Unity 가 임포트하지 못함): {f.relative_to(ROOT)} — {e}")
    for f in sorted((SRC / "unity").rglob("*.cs")):
        if not re.search(r"^namespace UIGallery\.\w+\s*$", f.read_text(encoding="utf-8"), re.M):
            err(f"C# 가 namespace UIGallery.<표본> 블록 밖에 있음: {f.relative_to(ROOT)}")


IMPORT_RE = re.compile(r"""(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]""")
EXTS = ["", ".ts", ".tsx", ".js", ".css", "/index.ts", "/index.tsx"]


def exact_exists(path: Path) -> bool:
    """대소문자까지 정확히 일치하는 파일이 있는가"""
    if not path.exists():
        return False
    cur = Path(path.anchor)
    for part in path.relative_to(path.anchor).parts:
        try:
            names = os.listdir(cur)
        except OSError:
            return False
        if part not in names:
            return False
        cur = cur / part
    return True


def check_import_case() -> None:
    for f in SRC.rglob("*.ts*"):
        text = f.read_text(encoding="utf-8")
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)  # 주석 속 예시 코드는 제외
        text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
        for m in IMPORT_RE.finditer(text):
            spec = (m.group(1) or m.group(2)).split("?")[0]
            base = (f.parent / spec).resolve()
            if not any(exact_exists(Path(str(base) + ext)) for ext in EXTS):
                err(f"import 경로 대소문자/존재 불일치: {f.relative_to(ROOT)} → {spec}")


def check_dist(titles: list[tuple[str, str]]) -> None:
    if not DIST.exists():
        warn("dist/index.html 없음 — npm run build 후 다시 실행하면 용량·오프라인 검사를 합니다")
        return
    raw = DIST.read_bytes()
    for label, size, budget in [
        ("원본", len(raw), BUDGET),
        ("gzip", len(gzip.compress(raw, compresslevel=6)), BUDGET_GZIP),
    ]:
        print(f"  dist/index.html {label}: {size / 1024:,.0f} KB (예산 {budget / 1024:,.0f} KB, {size / budget:.0%})")
        if size > budget:
            err(f"용량 예산 초과({label}): {size / 1024:,.0f} KB")
        elif size > budget * 0.9:
            warn(f"용량 예산 90% 넘음({label}): {size / 1024:,.0f} KB — 예산 재검토 시점")

    html = DIST.read_text(encoding="utf-8")
    for pat, what in [
        (r"<script[^>]+src=[\"']https?:", "외부 스크립트"),
        (r"<link[^>]+href=[\"']https?:[^>]*stylesheet|<link[^>]+stylesheet[^>]+href=[\"']https?:", "외부 스타일시트"),
        (r"@import\s+url\([\"']?https?:", "외부 CSS @import"),
    ]:
        if re.search(pat, html, re.I):
            err(f"dist 에 {what} 참조가 있음 (오프라인 실행 불가)")

    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        warn("Chrome/Edge 를 찾지 못해 오프라인 실행 검사를 건너뜀")
        return
    url = DIST.as_uri() + "#/"
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--host-resolver-rules=MAP * ~NOTFOUND",  # 모든 네트워크 차단 = 완전 오프라인
        "--virtual-time-budget=4000",
        "--dump-dom",
        url,
    ]
    try:
        dom = subprocess.run(cmd, capture_output=True, timeout=90).stdout.decode("utf-8", "replace")
    except subprocess.TimeoutExpired:
        err("오프라인 실행 검사 시간 초과")
        return
    missing = [t for _, t in titles if t not in dom]
    if missing:
        err(f"오프라인(file://, 네트워크 차단)에서 렌더되지 않은 표본: {missing}")
    else:
        print(f"  오프라인 실행: 표본 {len(titles)}개 모두 렌더됨")


def check_links() -> None:
    urls = set()
    for f in (SRC / "specimens").rglob("meta.ts"):
        for u in re.findall(r"https?://[^\s'\"`<>]+", f.read_text(encoding="utf-8")):
            # 위키 주소처럼 괄호가 든 URL 은 살리고, 문장 끝의 닫는 괄호·구두점만 떼어 낸다
            u = u.rstrip(".,;")
            while u.endswith(")") and u.count("(") < u.count(")"):
                u = u[:-1]
            urls.add(u)
    bad = []
    for u in sorted(urls):
        req = urllib.request.Request(u, method="GET", headers={"User-Agent": "Mozilla/5.0 (UIGallery link check)"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                if r.status >= 400:
                    bad.append(f"{r.status} {u}")
        except Exception as e:  # noqa: BLE001
            bad.append(f"{getattr(e, 'code', type(e).__name__)} {u}")
    print(f"  링크 {len(urls)}개 확인, 문제 {len(bad)}개")
    for b in bad:
        warn(f"링크 확인 필요: {b}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    print("UI Gallery 검사")
    check_bitmaps()
    titles = check_specimens()
    print(f"  표본 {len(titles)}개")
    check_unity_files()
    check_import_case()
    check_dist(titles)
    if "--links" in sys.argv:
        check_links()
    for w in warnings:
        print(f"  [경고] {w}")
    for e in errors:
        print(f"  [오류] {e}")
    print("통과" if not errors else f"실패: 오류 {len(errors)}개")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
