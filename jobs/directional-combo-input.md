---
# 3순위 2차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen directional-combo-input
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/directional-combo-input/**
  - src/unity/directional-combo-input/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: directional-combo-input

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/radial-quick-select/`, `src/unity/radial-quick-select/`, `src/specimens/input-rebinding/`, `src/unity/input-rebinding/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `directional-combo-input` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `directional-combo-input`, C# namespace `UIGallery.DirectionalComboInput`.
- 제목 '방향 커맨드 입력 HUD', 그룹 G, order 6, 난이도 2.
- **무엇을 보여 주나.** 키를 누르고 있는 동안 커맨드 목록이 열리고, 방향 입력 시퀀스(예: 방향 네 개)를 넣으면 접두사가 맞는 후보만 남으며 입력한 화살표가 하나씩 켜진다. 완성되면 발동(완료 펄스), 틀리면 흔들림과 함께 처음부터. 모바일은 스와이프로 같은 입력을 넣는다.
- **로직.** 입력 버퍼와 접두사 매칭(단순 필터나 트라이), 다른 커맨드의 접두사인 커맨드 처리(완성 즉시 발동 vs 짧게 기다림), 입력 사이 제한 시간. 커맨드 정의는 데이터(이름, 시퀀스, 재사용 대기)로 화면과 분리한다.
- **콘텐츠.** 원작의 커맨드 이름과 방향 코드를 쓰지 않는다. 공통 세계관(외곽 탐사대)의 새 커맨드(예: 보급 투하, 정찰 드론, 냉각 셀 지원)와 새 시퀀스를 만든다.
- **키.** 방향키 · WASD 는 커맨드 모드가 열려 있을 때만 먹는다 (그때는 조작 키라서 잠깐 할 일이 없어도 먹는다, 닫혀 있으면 갤러리의 ←/→ 로 흘려보낸다 — 가이드 3절). 여는 키는 갤러리 단축키가 아닌 키로. Tab 은 가로채지 않는다.
- **접근성.** 누르고 있기 / 눌러서 켜기(토글) 선택, 입력 제한 시간 늘리기나 끄기, 틀려도 처음으로 돌아가지 않고 그 칸만 다시 받는 관대한 모드를 조절 값으로 둔다. 운동 접근성 설정으로 해설한다.
- **효과 끄기 후보.** 맞은 화살표가 켜지지 않아 어디까지 넣었는지 모르는 모습, 또는 틀려도 아무 피드백 없이 입력이 계속 쌓이는 모습.
- **Unity.** Input System 액션맵 전환(커맨드 모드 중 이동 입력을 막을지), 방향 입력은 Composite 나 Vector2 를 8방향 → 4방향으로 양자화, Hold / Press 상호작용 선택. UGUI · UI Toolkit 은 같은 namespace 의 데이터 · 판정 클래스(UGUI 폴더)를 함께 쓴다.
- **`inspiredBy`.** 카드의 Helldivers 2 중 출처로 확인한 범위만 (빌린 것은 "누르고 있는 동안 방향 시퀀스 입력" 이라는 조작 방식, 화면 세부는 미확인). 확인되지 않으면 `borrowed: []`.
- **가이드 보강(2026-11-03).** 1차 묶음 리뷰에서 반복된 실수가 가이드 3 · 4 · 8절 규칙이 됐다: 창을 열고 닫을 때 포커스, param 변경 뒤 상태 맞추기, `data-part` 를 조건부로 그리지 않기, React `key` 재마운트로 애니메이션하지 않기, Unity 코루틴 · `interactable` · UI Toolkit `width` · 진입 transition · `pickingMode` · 입력 칸 포커스 · 문화권과 무관한 표기. 끝내기 전에 이 규칙을 하나씩 대조한다.
- **용량.** 측정에 시간을 쓰지 않는다. 다른 3순위 표본과 비슷한 규모(Unity 파일 UGUI 4개 · UI Toolkit 3개 안팎)로 만들고, 끝내기 전에 `node tools/size.mjs <id>` 를 한 번만 본다.

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen directional-combo-input` 가 `exit 0`.
3. `python tools/shot.py directional-combo-input default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
