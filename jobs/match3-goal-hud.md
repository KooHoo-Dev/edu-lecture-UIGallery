---
# 3순위 2차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
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
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: match3-goal-hud

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/currency-bar-shop/`, `src/unity/currency-bar-shop/`, `src/specimens/health-bar-trail/`, `src/unity/health-bar-trail/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `match3-goal-hud` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `match3-goal-hud`, C# namespace `UIGallery.Match3GoalHud`.
- 제목 '퍼즐 목표 HUD', 그룹 A, order 6, 난이도 2. `stage.aspect` 는 'both' (모바일 세로가 자연스럽다).
- **무엇을 보여 주나.** 매치3 같은 퍼즐 스테이지의 HUD: 위쪽 남은 이동 수(적게 남으면 경고 색 · 펄스 2Hz 이하), 색별 수집 목표 아이콘과 남은 개수, 블록이 깨지면 그 자리에서 목표 아이콘으로 날아가 도착할 때 개수가 줄어드는 연출, 점수 진행 바 위 별 3개 임계 마커(위치 = 임계값 / 최대 점수 × 바 너비)가 하나씩 켜짐, 아래 부스터 버튼의 보유 수 배지(0개면 구매 유도 상태).
- **보드는 최소한으로.** 완전한 매치3 게임을 만들지 않는다. 작은 격자에서 같은 색 묶음을 누르거나 이벤트로 "연쇄" 가 일어나게 해 HUD 를 움직이는 데 집중한다. 마지막 연쇄가 끝날 때까지 이동 0 의 실패 판정을 미루는 규칙을 보여 준다.
- **날아가는 연출.** `currency-bar-shop` 의 코인 비행(베지어 경로, 도착 시 카운트)과 같은 원리를 이 표본 안에 다시 쓴다. 여러 개가 겹쳐 날아와도 개수가 정확히 줄고, 목표가 0 이 되면 완료 표시. 정산 규칙(날아오는 중에 표시값과 실제값)을 분명히 한다.
- **세계관.** 공통 세계관의 자원(냉각 셀, 회로 조각, 산소 캔 등)을 블록과 목표 아이콘으로. SVG 로 그린다. 색만이 아니라 모양으로도 구분한다.
- **효과 끄기 후보.** 블록이 깨져도 목표 개수만 조용히 바뀌어 무엇을 모았는지 모르는 모습, 또는 이동 수가 줄어도 경고가 없어 갑자기 끝나는 모습.
- **Unity.** 보드(월드) 좌표 → UI 좌표 변환(`RectTransformUtility`, 카메라 지정), 베지어 비행 풀링, 레벨 정의 ScriptableObject → HUD 자동 구성, 안전 영역(`Screen.safeArea`)과 Canvas Scaler / UI Toolkit Panel Settings 스케일.
- **`inspiredBy`.** 카드의 게임 중 출처로 확인한 것만. 카드 출처는 고객 지원 문서와 튜토리얼이라 확인되지 않으면 `borrowed: []` 로 장르 관례로만 다룬다.
- **가이드 보강(2026-11-03).** 1차 묶음 리뷰에서 반복된 실수가 가이드 3 · 4 · 8절 규칙이 됐다: 창을 열고 닫을 때 포커스, param 변경 뒤 상태 맞추기, `data-part` 를 조건부로 그리지 않기, React `key` 재마운트로 애니메이션하지 않기, Unity 코루틴 · `interactable` · UI Toolkit `width` · 진입 transition · `pickingMode` · 입력 칸 포커스 · 문화권과 무관한 표기. 끝내기 전에 이 규칙을 하나씩 대조한다.
- **용량.** 측정에 시간을 쓰지 않는다. 다른 3순위 표본과 비슷한 규모(Unity 파일 UGUI 4개 · UI Toolkit 3개 안팎)로 만들고, 끝내기 전에 `node tools/size.mjs <id>` 를 한 번만 본다.

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen match3-goal-hud` 가 `exit 0`.
3. `python tools/shot.py match3-goal-hud default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
