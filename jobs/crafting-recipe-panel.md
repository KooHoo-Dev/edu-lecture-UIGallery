---
# 3순위 1차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen crafting-recipe-panel
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/crafting-recipe-panel/**
  - src/unity/crafting-recipe-panel/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: crafting-recipe-panel

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/inventory-grid-tooltip/`, `src/unity/inventory-grid-tooltip/`, `src/specimens/red-dot-badge-tree/`, `src/unity/red-dot-badge-tree/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `crafting-recipe-panel` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `crafting-recipe-panel`, C# namespace `UIGallery.CraftingRecipePanel`.
- 제목 '제작 패널', 그룹 E, order 8, 난이도 2.
- **무엇을 보여 주나.** 생존 · 크래프팅의 제작 창. 레시피 목록(탭 분류, 검색, "만들 수 있는 것만" 필터), 고른 레시피의 재료를 "보유/필요"(3/5)로 보여 주고 모자란 재료는 색과 함께 아이콘 · 글자로 표시한다. 만들 수 있는 레시피만 강조, 제작 대기열과 진행 바, 취소하면 재료 환불, 새로 해금된 레시피 배지.
- **선택 복원.** 창을 닫았다 다시 열면 탭 · 선택 · 스크롤 위치가 그대로다. 이벤트 버튼으로 "닫았다 열기" 를 보여 주고, 효과 끄기에서는 매번 첫 탭 첫 줄로 돌아가게 하는 것이 좋은 후보다.
- **데이터.** 레시피(재료 목록, 결과, 시간)와 인벤토리 수량 조회를 나누고, 수량이 바뀌면 레시피 상태 전체를 다시 계산한다 (이벤트 기반). `inventory-grid-tooltip` 의 슬롯 · 툴팁 표현과 어울리게 하되 코드는 이 표본 안에 둔다.
- **키.** 숫자 키 1~9 는 갤러리 이벤트라 쓰지 않는다 (가이드 3절). 핫바를 넣는다면 클릭과 Q · E 로 고르고, Unity 판의 숫자 키 액션은 해설로만. 핫바가 범위를 키우면 빼도 된다.
- **세계관.** 공통 세계관의 자원(수리 키트, 냉각 셀, 회로 조각, 산소 캔). 아이콘은 SVG.
- **Unity.** 레시피는 ScriptableObject, 제작 대기열은 코루틴이나 타이머 + `Image.fillAmount`, 취소 환불. UI Toolkit 은 runtime data binding 이나 직접 갱신 중 하나를 고르고 이유를 적는다. 상태 저장(탭 · 선택 · 스크롤)은 `OnDisable` / `OnEnable` 에서.
- **`inspiredBy`.** 카드의 Valheim, Don't Starve Together, 7 Days to Die 중 출처(7 Days to Die 위키의 제작 창 문서 등)로 확인한 것만. 화면 세부는 미확인으로.
- **용량.** 남은 예산으로 표본 5~6개가 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs <id>` 로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **Unity 탐색.** UI Toolkit 에서 `NavigationMoveEvent` 를 직접 처리하면 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. UGUI 에서 `transition = None` 이면 선택 표시를 `ISelectHandler` 로 직접 그린다 (가이드 8절).

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen crafting-recipe-panel` 가 `exit 0`.
3. `python tools/shot.py crafting-recipe-panel default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
