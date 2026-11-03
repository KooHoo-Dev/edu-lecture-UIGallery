---
# 3순위 1차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen skill-tree
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/skill-tree/**
  - src/unity/skill-tree/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: skill-tree

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/branching-route-map/`, `src/unity/branching-route-map/`, `src/specimens/inventory-grid-tooltip/`, `src/unity/inventory-grid-tooltip/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `skill-tree` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `skill-tree`, C# namespace `UIGallery.SkillTree`.
- 제목 '스킬트리 · 성장 노드', 그룹 E, order 7, 난이도 3.
- **무엇을 보여 주나.** 노드 그래프 스킬트리. 노드 상태는 잠김 · 습득 가능 · 습득 · 최대 네 가지이고, 색만이 아니라 모양 · 테두리 · 아이콘 · 글자(예: 2/3)로 함께 구분한다. 선행 조건 연결선, 포인트 소비와 초기화(환불), 습득 가능한 노드 강조, 노드 툴팁(효과, 다음 단계 수치, 필요한 선행)을 보여 준다.
- **팬 · 줌.** 끌어서 이동, 휠 · 버튼으로 확대 축소. 확대 단계에 따라 노드 글자를 줄이지 않고 표시할 정보를 바꾼다 (멀면 아이콘과 상태만, 가까우면 이름과 수치). 너무 작아 읽히지 않는 글자가 생기지 않게 하는 것이 이 표본의 핵심 원리다. 카드의 출처(Diablo IV 스킬트리 피드백에 대한 공식 답변)로 확인한 범위에서만 그 사례를 해설한다.
- **데이터.** 트리를 표(TSV 처럼 한 줄에 노드 하나: id, 이름, 최대 단계, 선행 id 들, 비용, 위치)로 정의하고, 선행 조건 검사와 환불 계산을 화면과 분리한 순수 함수로 둔다. Unity 판은 같은 표를 `TextAsset`(TSV) 또는 ScriptableObject 로 읽는 방법을 보여 준다. 수업에서 엑셀로 트리를 짜서 붙여 넣는 흐름과 이어진다.
- **세계관.** 공통 세계관(외곽 탐사대). 예: 하린의 탐사 기술, 도윤의 정비 기술, 세라의 통신 기술 세 갈래. 아이콘은 SVG 로 직접 그린다.
- **효과 끄기 후보.** 색만으로 상태를 구분해 잠김과 습득 가능을 헷갈리는 모습, 또는 확대를 줄이면 글자가 그대로 작아져 읽을 수 없는 모습. 화면에서 분명한 것을 고른다.
- **Unity.** UGUI: 연결선은 두 노드를 잇도록 회전 · 늘린 Image(분기 경로 맵과 같은 방식)나 직접 만든 `Graphic`(UILineRenderer), 팬 · 줌은 `ScrollRect` 와 Content 의 `localScale`. UI Toolkit: `generateVisualContent` + `Painter2D` 로 선, `transform.scale` 로 줌. 같은 namespace 의 데이터 클래스를 UGUI 폴더에 둔다.
- **`inspiredBy`.** 카드의 Path of Exile, Diablo IV, Ghost of Tsushima 중 출처로 확인한 것만 가이드 6절 형식으로 넣는다 (화면 세부는 미확인으로). 확인한 근거가 없으면 `borrowed: []`.
- **용량.** 남은 예산으로 표본 5~6개가 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs <id>` 로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **Unity 탐색.** UI Toolkit 에서 `NavigationMoveEvent` 를 직접 처리하면 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. UGUI 에서 `transition = None` 이면 선택 표시를 `ISelectHandler` 로 직접 그린다 (가이드 8절).

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen skill-tree` 가 `exit 0`.
3. `python tools/shot.py skill-tree default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
