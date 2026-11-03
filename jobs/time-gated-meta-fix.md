---
# 3순위 1차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 8
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen time-gated-meta
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/time-gated-meta/**
  - src/unity/time-gated-meta/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: time-gated-meta 리뷰 반영

`time-gated-meta` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 에너지 계산식(마지막 회복 시각 + 경과), 하루 경계(서버 시각 기준 초기화 시각), 서버 시각 모델(받은 UTC + 단조 시계), 연속 · 누적 규칙, 효과 끄기의 실수 묶음은 리뷰가 구체 시각으로 계산해 웹과 Unity 모두 맞다고 확인했으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 워커 허용 명령에 `npm run build` 와 `python tools/check.py` 가 들어갔다. 끝내기 전에 직접 돌려 본다.
- 가이드 8절: UI Toolkit `NavigationMoveEvent` 는 `StopPropagation()` 과 `focusController?.IgnoreEvent(e)` 를 함께, UGUI `transition = None` 이면 선택 표시를 직접 그린다.
- 이번 묶음 5개가 main 에 합쳐져 갤러리 전체가 원본 95% · gzip 93% 다. 고치면서 용량을 늘리지 않는다. 줄일 수 있으면 줄인다 (`node tools/size.mjs <id>`).

## 필수

1. **모드를 바꿀 때 낡은 서버 시계로 연료 기록을 다시 만든다** (`index.tsx` 모드 전환 효과와 `wake`). 기기 시계 · 효과 끔 모드의 `wake()` 는 `S.world` 만 앞당기고 `S.clock` 을 다시 받지 않는데, 모드 전환은 `basisNow()` 로 `E.lastAt` 을 만든 뒤에야 `syncClock` 을 부른다. 재현: 효과 끔 → 앱 끄고 8시간 → 탐사 출발 → J 로 효과 켬 → 화면 60/60, 서버 계산 40, "화면과 다름". `syncClock` 을 먼저 부르고(또는 서버 모드에서는 `E = { ...ts }`), 서버 모드가 아닐 때도 `wake` 에서 시계를 다시 받는다. "복귀 = 다시 동기화" 를 한 곳에 모은다.
2. **모드 전환이 출석 규칙 적용 없이 날짜만 옮기고, `claim()` 에 7칸 가드가 없다.** 재현: 7칸을 다 받은 날 기기 시계 +1일 → J → 버튼이 "8일차 보급 받기" 가 되고 누르면 `REWARDS[7]` 에서 TypeError. 모드 전환에서 `S.lastDay` 를 직접 바꾸지 말고 `checkDay()`(새 주기 · 끊김 판정 포함)를 쓰고, `claim` 에 `if (k >= 7) return` 을 넣는다.
3. **해설 1 의 `data-part="today"` 가 사라진다**: `k === n` 은 7칸을 다 받은 날(n = 7) 어느 칸에도 맞지 않는다. `k === Math.min(n, 6)` 처럼 늘 한 칸에 둔다 (가이드 4절).
4. **UI Toolkit 출석판이 3열로 접힌다**: UITK 의 `width` 는 padding · border 를 포함해 패널 안쪽 폭이 1080 − 60 − 4 = 1016px 인데 칸은 255px × 4 = 1020px 이다. 3 · 3 · 1 로 접혀 7일차 칸이 받기 버튼을 덮는다. 칸 여백이나 패널 padding 을 줄여 4열에 맞추고, meta 해설의 "1020px" 문장을 고친다.
5. **meta 글 3곳**: 해설 5 의 식을 "(필요량 − 지금 − 1) × 간격 + 다음 +1 까지" 로 (복사용 프롬프트에 들어간다). UGUI hierarchy 의 Header "서버 시각" 과 RuleChip 은 코드가 갱신하지 않으니 코드를 넣거나 hierarchy 에서 뺀다. `TimeGatedDemo.cs` 의 "실제 기기에서 백그라운드로 보냈다 돌아와 확인" 은 가짜 서버가 `realtimeSinceStartup` 위에서 흐르므로 "O 키로 시험" 으로 한정한다.

## 권장

6. Unity UGUI: `interactable = false` 로 바꾸면 그 버튼이 선택돼 있을 때 선택이 풀려 패드로 더 움직일 수 없다 (받기 뒤, 동기화 중). 끄기 전에 다른 버튼으로 선택을 옮기고 끝나면 되돌리거나, 버튼을 켠 채 처리 함수에서 막는다.
7. 비용이 최대치보다 크면 "40까지 1:5x:xx" 처럼 오지 않을 시각을 보여 준다. "최대치보다 큼 — 보상으로만 가능" 으로 따로 안내하거나 비용 범위를 최대치 이하로 묶는다 (웹과 Unity 모델 모두).
8. 동기화 중에는 "보급 +30" 도 막는다 (해설 2 "판정하지 않는다" 와 맞춘다).
9. `prefers-reduced-motion` 을 따른다 (오늘 칸 맥동, 도장, 새날 확대, 흔들기, 시계 바늘). `core/flash.ts` 의 `prefersReducedMotion()`.
10. Unity: `ToString("M/d")` 는 ko-KR 에서 "11-3" 이 된다 → `$"{d.Month}/{d.Day}"` 처럼 문화권과 무관하게. Device 모드 시작 직후 0.3초 동안 60/60 으로 보이는 문제는 `lastRegenUtc` 초기화를 `OnEnable` 로. 받은 칸의 "받음" 꼬리표가 opacity 0.2 로 거의 안 보이니 꼬리표는 흐리게 하지 않는다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen time-gated-meta` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 효과 끔 → 앱 끄고 8시간 → 탐사 출발 → 효과 켬, 7칸 다 받은 날, 세로 9:16 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
