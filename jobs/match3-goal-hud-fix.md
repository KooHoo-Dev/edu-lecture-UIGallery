---
# 3순위 2차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 7
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen match3-goal-hud
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/match3-goal-hud/**
  - src/unity/match3-goal-hud/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: match3-goal-hud 리뷰 반영

`match3-goal-hud` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 개수 정산(날리는 개수 `min(깨진 수, 남은 수)`, 도착 때 표시값이 실제값을 앞지르지 않음), 결과가 두 번 나지 않는 구조, 별 마커 위치 계산, 경고 맥동 주기, 0개 부스터의 충전 상태, 모양으로도 구분되는 블록, Unity 좌표 변환과 OnDisable 정리, SO 로 HUD 자동 구성, 안전 영역 처리는 리뷰가 맞다고 확인했으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 갤러리 전체가 원본 74% · gzip 92% 다. 고치면서 용량을 늘리지 않는다. 측정은 끝내기 전에 `node tools/size.mjs <id>` 한 번만 보고, 줄이는 작업은 하지 않는다.

## 필수

1. **UGUI: 비행 중에 다시 시작하면 MissingReferenceException** (`GoalHud.Bind` · `GoalFlyer`). `Bind` 가 옛 목표 칸을 지우지만 남은 비행을 취소하지 않아, 도착할 때 지워진 TMP 에 접근한다 (R 키, 실패 뒤 다시 하기, 연쇄 중 L). UI Toolkit 판처럼 `Bind` 에서 비행을 콜백 없이 풀로 돌려준다 (`GoalFlyer.CancelAll()`).
2. **실패 판정이 비행을 기다리지 않는다** (웹 `index.tsx` 의 판정, C# `LevelDefinition.Judge`). 성공만 비행 0 을 확인해, 연쇄 없는 마지막 이동에서는 실패 창이 먼저 뜨고 아이콘이 창 위로 날아가며 "남은 목표" 와 HUD 숫자가 잠깐 어긋난다. 해설 1, 실수 4, timings, UGUI 단계 5 와 코드 주석이 모두 "연쇄와 비행이 끝날 때까지 미룬다" 고 말하므로 코드를 글에 맞춘다: 실패도 비행 0 일 때만.
3. **자동으로 열리는 결과 창에 입력 잠금이 없다**: 마지막 연쇄 중에 Enter 를 연타하던 사람이 창이 뜬 직후 바로 다시 시작한다 (Enter 자동 반복도). 웹은 `core/inputLock` 의 `createInputLock(300)` 처럼 누른 시각으로 판정하고 `e.repeat` 를 거른다. Unity 는 창을 연 시각과 누른 시각을 비교한다 (UGUI · UI Toolkit).

## 권장

4. Unity 비행 도착점을 Fly 순간에 한 번만 읽어, 다시 시작한 같은 프레임이나 회전 · 안전 영역 변경 뒤 엉뚱한 곳으로 간다. 매 프레임 목표에서 다시 읽거나 `Bind` 에서 `LayoutRebuilder.ForceRebuildLayoutImmediate`.
5. 목표를 다 채운 뒤 비행을 기다리는 동안 탭 · 자동 데모가 이동을 쓰지 않게 막는다.
6. Unity: HUD 를 껐다 켜면 결과 창이 사라진 채 멈춘다 → `OnEnable` 에서 결과가 있으면 다시 연다. UGUI 별 마커 앵커를 늘릴 때 `sizeDelta.y` 를 0 으로. UI Toolkit `.booster` · `.result__retry` 는 테마의 `:hover` · `:active` 배경도 직접 지정한다.
7. 16:9 비행 경로의 조절점을 목표 패널 위로 올려 다른 목표 아이콘을 가로지르지 않게.
8. 글과 주석의 수치를 코드와 맞춘다: "살짝 커진다"(실제 ×1.45), "1.2→1"(실제 1.22), CSS 주석의 "왕복", 쓰이지 않는 hotspot `pin`, 해설 3 `fly` 가 보드 전체를 가리킴(가이드 4절), UI Camera 가 계층에 없음(URP Overlay 카메라 스택 한 줄), UGUI pitfall 의 timeScale 0 이유.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen match3-goal-hud` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 연쇄 없는 마지막 이동으로 실패(정산 보기 프리셋), 결과 창에서 Enter 연타, 다시 하기 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
