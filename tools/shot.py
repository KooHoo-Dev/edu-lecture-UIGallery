"""표본 화면을 헤드리스 Chrome 으로 찍는 도구 (구현·리뷰 에이전트의 시각 확인용).

    python tools/shot.py <표본id>                       # 기본 상태 1장
    python tools/shot.py <표본id> default juice0 event:heavy preset:soulslike spot:2 mobile
    python tools/shot.py <표본id> --no-build ...        # 이미 빌드한 결과 재사용

- 다른 에이전트와 겹치지 않게 _shots/build-<id>/ 에 따로 빌드한다 (dist 를 건드리지 않음).
  이 표본만 등록해서 빌드하므로(UIG_ONLY) 다른 표본의 미완성 파일 때문에 깨지지 않는다. --all 이면 전체 빌드.
- 결과: _shots/<id>/<상태>-<시각>.png  (Read 도구로 열어 확인. 실행마다 새 파일)
- 상태 문법: default | juice0 | juice0:<이벤트id> | slow | event:<이벤트id> | preset:<프리셋id> | spot:<번호> | aspect916 | mobile | home
- 옵션: --no-build (빌드 재사용) · --budget=<ms> (캡처 시점, 기본 3500) · --all (모든 표본을 넣어 빌드)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = next(
    (
        c
        for c in [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            "/usr/bin/google-chrome",
        ]
        if Path(c).exists()
    ),
    None,
)
BUDGET = 3500  # 페이지를 연 뒤 캡처까지의 가상 시간(ms). 이벤트는 400ms 에 발생. --budget=5000 처럼 바꿀 수 있다
NPX = r"C:\Program Files\nodejs\npx.cmd" if Path(r"C:\Program Files\nodejs\npx.cmd").exists() else "npx"


def state_to_query(state: str) -> tuple[str, tuple[int, int]]:
    size = (1440, 1000)
    q: list[str] = []
    if state == "default":
        q.append("auto=0")
    elif state == "juice0":
        q += ["juice=0", "auto=0"]
    elif state.startswith("juice0:"):
        q += ["juice=0", f"event={state.split(':', 1)[1]}", "auto=0"]
    elif state == "slow":
        q += ["speed=0.25"]
    elif state.startswith("event:"):
        q += [f"event={state.split(':', 1)[1]}", "auto=0"]
    elif state.startswith("preset:"):
        q += [f"preset={state.split(':', 1)[1]}", "auto=0"]
    elif state.startswith("spot:"):
        q += [f"spot={state.split(':', 1)[1]}", "auto=0"]
    elif state == "aspect916":
        q += ["aspect=9:16", "auto=0"]
    elif state == "mobile":
        # 헤드리스 Chrome 은 창 폭을 약 500px 아래로 줄이지 못한다 → 좁은 폭 점검은 520px 로.
        # 실제 휴대폰 폭(375~390px)은 브라우저 패널의 Mobile 뷰포트로 확인할 것
        size = (520, 1100)
        q.append("auto=0")
    return "&".join(q), size


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    sid, states = args[0], args[1:] or ["default"]
    global BUDGET
    for a in sys.argv[1:]:
        if a.startswith("--budget="):
            BUDGET = int(a.split("=", 1)[1])
    out_build = ROOT / "_shots" / f"build-{sid}"
    out_dir = ROOT / "_shots" / sid
    out_dir.mkdir(parents=True, exist_ok=True)

    if "--no-build" not in sys.argv:
        # JayDispatch worktree 면 메인 폴더의 node_modules 를 잇는다 (tools/worktree-link.mjs)
        subprocess.run(["node", str(ROOT / "tools" / "worktree-link.mjs")], cwd=ROOT, capture_output=True)
        env = dict(os.environ)
        if "--all" not in sys.argv:
            env["UIG_ONLY"] = sid
        r = subprocess.run([NPX, "vite", "build", "--outDir", str(out_build), "--emptyOutDir", "--logLevel", "error"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
        if r.returncode != 0:
            print("빌드 실패:\n" + (r.stdout + r.stderr)[-4000:])
            return 1
    if not CHROME:
        print("Chrome/Edge 를 찾지 못했습니다")
        return 1

    html = (out_build / "index.html").as_uri()
    # 매번 새 파일명 — 같은 경로를 다시 읽으면 이전 이미지가 보일 수 있다
    stamp = time.strftime("%H%M%S")
    for st in states:
        query, (w, h) = state_to_query(st)
        url = f"{html}#/" if st == "home" else f"{html}#/s/{sid}" + (f"?{query}" if query else "")
        png = out_dir / f"{st.replace(':', '-')}-{stamp}.png"
        profile = tempfile.mkdtemp(prefix="uig-shot-")  # 동시에 여러 Chrome 을 띄워도 프로필이 겹치지 않게
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                f"--user-data-dir={profile}",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                f"--window-size={w},{h}",
                f"--virtual-time-budget={BUDGET}",
                f"--screenshot={png}",
                url,
            ],
            capture_output=True,
            timeout=120,
        )
        shutil.rmtree(profile, ignore_errors=True)
        print(f"{st}: {png}" if png.exists() else f"{st}: 실패")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
