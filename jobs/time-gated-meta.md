---
# 3순위 1차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen time-gated-meta
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/time-gated-meta/**
  - src/unity/time-gated-meta/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: time-gated-meta

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/battle-pass-track/`, `src/unity/battle-pass-track/`, `src/specimens/popup-queue-stack/`, `src/unity/popup-queue-stack/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `time-gated-meta` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀, 카드는 `daily-login-calendar` 와 `energy-refill-timer` 두 장).

## 표본별

- ID `time-gated-meta`, C# namespace `UIGallery.TimeGatedMeta`.
- 제목 '출석 캘린더 + 에너지 회복 타이머', 그룹 E, order 10, 난이도 2. `stage.aspect` 는 'both' (모바일 화면이 기본).
- **무엇을 보여 주나.** 시간으로 잠긴 메타 화면 두 개를 한 표본에: (1) 7일 출석판(오늘 칸 강조, 받기, 수령 도장, 놓친 날, 7일차 큰 보상, 다음 초기화까지 카운트다운, 연속 · 누적 규칙 전환), (2) 에너지(37/60, 다음 1 회복까지와 가득 찰 때까지 두 타이머, 최대치 초과 상태와 그동안 회복 정지, 부족하면 입장 버튼 비활성과 남은 시간). 탭이나 나란히 배치 중 화면에 맞는 쪽을 고른다.
- **시간 로직이 핵심.** 현재값은 "마지막 회복 시각 + 경과 시간" 으로 계산한다. 매초 1씩 더하는 방식은 앱을 껐다 켜면 틀린다. 하루 경계는 서버 시각 기준 초기화 시각(예: 오전 5시)이다. 조절 값이나 이벤트로 "앱 끄고 n시간 뒤 켜기"(오프라인 경과), "기기 시계 바꾸기", 시간 배속을 보여 준다. `battle-pass-track` 의 서버 시각(받은 UTC + 단조 시계) 방식을 이 표본 안에 다시 쓰고, 공통화 요청으로 적는다.
- **효과 끄기 후보.** 매초 증가 방식이라 오프라인 경과 뒤 에너지가 그대로이거나, 기기 시계를 바꾸면 출석이 다시 열리는 모습.
- **설계 판단을 해설에.** 연속 출석(놓치면 초기화)과 누적 출석(놓쳐도 진행)의 차이와 손실 회피, 접속 직후 팝업 순서(`popup-queue-stack` 과 `related`).
- **Unity.** `DateTime.UtcNow` · `TimeSpan` 포맷, `OnApplicationPause` / `OnApplicationFocus` 로 복귀 때 다시 계산, 서버 시각으로 시계 조작 막기(서버 호출은 가짜 함수로), 가득 참 로컬 알림은 연결 지점만 설명. UGUI 는 `GridLayoutGroup`, UI Toolkit 은 flex-wrap 그리드 + USS 상태 클래스.
- **세계관.** 공통 세계관의 보급(산소 캔, 냉각 셀, 크레딧 등). 에너지는 "탐사 연료" 처럼 세계관 이름으로.
- **`inspiredBy`.** 두 카드의 게임 중 출처로 확인한 것만. 카드 출처는 Unity 문서와 블로그 위주라 확인되지 않으면 `borrowed: []` 로 장르 관례로만 다룬다.
- **용량.** 남은 예산으로 표본 5~6개가 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs <id>` 로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **Unity 탐색.** UI Toolkit 에서 `NavigationMoveEvent` 를 직접 처리하면 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. UGUI 에서 `transition = None` 이면 선택 표시를 `ISelectHandler` 로 직접 그린다 (가이드 8절).

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen time-gated-meta` 가 `exit 0`.
3. `python tools/shot.py time-gated-meta default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
