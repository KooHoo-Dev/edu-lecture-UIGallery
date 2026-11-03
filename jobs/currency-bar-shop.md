---
# 3순위 1차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen currency-bar-shop
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/currency-bar-shop/**
  - src/unity/currency-bar-shop/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: currency-bar-shop

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/gacha-reveal-odds/`, `src/unity/gacha-reveal-odds/`, `src/specimens/results-reward/`, `src/unity/results-reward/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `currency-bar-shop` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀, 카드 id 는 `currency-bar-shop-purchase`).

## 표본별

- ID `currency-bar-shop`, C# namespace `UIGallery.CurrencyBarShop`.
- 제목 '재화 바 · 상점 · 구매 확인', 그룹 E, order 9, 난이도 2. `stage.aspect` 는 'both'.
- **무엇을 보여 주나.** 한 흐름: 화면 위에 늘 있는 재화 바(일반 재화 · 유료 재화 · 에너지와 충전 + 버튼) → 상점 진열(묶음 상품, 할인, 한정 기간) → 구매 확인 창(가격, 구매 후 잔액, 청약철회 가능 여부, 재화가 모자라면 충전 안내) → 얻은 재화가 재화 바로 날아가며 숫자가 오르는 피드백(`core/countup.ts`).
- **정직한 UI 와 다크패턴 비교.** select 조절 값으로 "정직한 UI / 다크패턴" 을 둔다. 다크패턴 쪽은 재화 단위로 실제 가격 가리기, 비싼 묶음을 먼저 보여 주는 가격 앵커링, 구매를 기본 선택으로 두기, "이 창을 닫으면 다시 살 수 없습니다" 같은 유인 문구 중 몇 가지를 보여 주고, 화면에 "하지 말아야 할 예" 라고 분명히 표시한다. 법적 사례는 카드 출처(게임메카 · 뉴시스 기사)로 확인한 범위에서만, 법률 조언처럼 쓰지 않는다.
- **효과 끄기 후보.** 확인 창에 구매 후 잔액과 실제 가격이 없거나, 획득 피드백 없이 숫자만 바뀌어 무엇을 얻었는지 놓치는 모습. 다크패턴 비교와 겹치지 않게 고른다.
- **구매 안전.** 확인 버튼은 입력 잠금(`core/inputLock.ts`, 누른 시각 기준)으로 창이 막 뜬 직후 연타를 막는다. 실제 결제는 없는 모의 화면이고 Unity IAP 는 연결 지점만 설명한다.
- **세계관.** 공통 세계관의 크레딧(일반 재화)과 세계관 이름의 유료 재화. 가격 표기는 원화 예시로 둔다.
- **Unity.** 재화 바는 씬이 바뀌어도 남는 공용 UI(UGUI `DontDestroyOnLoad` 또는 공용 UIDocument)와 데이터 변경 이벤트. UGUI 코인 비행은 오브젝트 풀 + 베지어 경로, UI Toolkit 은 transition 과 바인딩.
- **`related`.** `gacha-reveal-odds`(확률 표시), `battle-pass-track`(받기 상태), `results-reward`(카운트업) 중 실제로 이어지는 것.
- **`inspiredBy`.** 카드의 게임 중 출처로 확인한 것만. 확인되지 않으면 `borrowed: []`.
- **용량.** 남은 예산으로 표본 5~6개가 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs <id>` 로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **Unity 탐색.** UI Toolkit 에서 `NavigationMoveEvent` 를 직접 처리하면 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. UGUI 에서 `transition = None` 이면 선택 표시를 `ISelectHandler` 로 직접 그린다 (가이드 8절).

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen currency-bar-shop` 가 `exit 0`.
3. `python tools/shot.py currency-bar-shop default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
