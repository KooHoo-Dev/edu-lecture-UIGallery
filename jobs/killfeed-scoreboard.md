---
# 3순위 1차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen killfeed-scoreboard
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/killfeed-scoreboard/**
  - src/unity/killfeed-scoreboard/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: killfeed-scoreboard

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/quest-tracker-toasts/`, `src/unity/quest-tracker-toasts/`, `src/specimens/turn-order-timeline/`, `src/unity/turn-order-timeline/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `killfeed-scoreboard` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `killfeed-scoreboard`, C# namespace `UIGallery.KillfeedScoreboard`.
- 제목 '킬 피드 + 스코어보드', 그룹 C, order 4, 난이도 2.
- **무엇을 보여 주나.** 팀 대전의 오른쪽 위 피드: 한 줄에 "가해자 [무기 아이콘] 피해자" 와 팀 색, 정밀 타격 표시. 최대 줄 수를 넘거나 시간이 지나면 오래된 줄부터 사라지고, 내가 관련된 줄은 강조한다. 누르고 있는 동안만 뜨는 팀별 스코어보드(제압 · 지원 · 이탈 · 점수 · 핑), 정렬 기준, 모드에 중요한 숫자(승리까지 남은 점수)를 가장 크게.
- **차별점.** `quest-tracker-toasts` 의 알림 큐와 비슷하다. 이 표본은 짧은 시간에 몰려 오는 이벤트를 훑어 읽게 하는 설계(고정 열 정렬, 아이콘, 내 줄 강조, 몰릴 때 합치기 · 속도 조절)와 누르고 있는 동안만 보이는 표에 집중한다. `related` 로 잇는다.
- **세계관과 표현.** 공통 세계관(외곽 탐사대)의 모의 훈련 두 팀. 피 · 사망 표현 대신 "제압", "이탈" 같은 말을 쓴다. 무기 아이콘은 SVG 로 직접 그린다. 팀은 색과 함께 모양(예: 팀 표식 도형)으로도 구분한다.
- **키.** 웹에서 Tab 을 가로채지 않는다 (키보드 갇힘). 화면의 "누르고 있기" 버튼과 갤러리 단축키가 아닌 키 하나로 보여 준다 (가이드 3절 키보드). 실제 게임이 Tab 을 쓰는 이유와 Unity Input System 의 Hold 상호작용 설정은 해설과 Unity 탭에 적는다.
- **조절 값 후보.** 최대 줄 수, 유지 시간, 이벤트 빈도(몰아치기 포함), 플레이어 수, 정렬 기준.
- **효과 끄기 후보.** 줄 수 제한 없이 쌓여 화면을 덮거나, 내 줄 강조 · 정렬 없이 글자만 길게 이어져 훑어 읽을 수 없는 피드.
- **Unity.** UGUI: 줄 오브젝트 풀링, `CanvasGroup.alpha` 페이드, 스코어보드 행 재사용. 아이콘은 Image 로 둔다 (TMP Sprite Asset 은 비트맵이 필요하니 방법만 설명한다). UI Toolkit: 행 재사용은 `ListView` 가상화, 페이드는 USS transition. 네트워크 이벤트를 UI 이벤트로 바꾸는 층(가짜 이벤트 소스)을 따로 둔다.
- **`inspiredBy`.** 카드의 게임 중 출처로 확인한 것만. 카드 출처는 모드 · 커뮤니티 글이라 근거가 약하다. 확인되지 않으면 `borrowed: []` 로 장르 관례로만 다룬다.
- **용량.** 남은 예산으로 표본 5~6개가 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs <id>` 로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **Unity 탐색.** UI Toolkit 에서 `NavigationMoveEvent` 를 직접 처리하면 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. UGUI 에서 `transition = None` 이면 선택 표시를 `ISelectHandler` 로 직접 그린다 (가이드 8절).

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen killfeed-scoreboard` 가 `exit 0`.
3. `python tools/shot.py killfeed-scoreboard default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
