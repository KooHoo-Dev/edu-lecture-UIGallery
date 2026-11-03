---
# 3순위 2차 (plan 10). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen context-lore-glossary
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/context-lore-glossary/**
  - src/unity/context-lore-glossary/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: context-lore-glossary

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/inventory-grid-tooltip/`, `src/unity/inventory-grid-tooltip/`, `src/specimens/dialogue-choices/`, `src/unity/dialogue-choices/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `context-lore-glossary` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `context-lore-glossary`, C# namespace `UIGallery.ContextLoreGlossary`.
- 제목 '맥락 용어집 · 중첩 툴팁', 그룹 F, order 3, 난이도 2.
- **무엇을 보여 주나.** 두 가지를 한 화면에: (1) 대사나 기록 속 키워드에 포인터를 올리거나 포커스하면 설명 툴팁이 뜨고, 툴팁 안의 키워드에 다시 올리면 하위 툴팁이 뜨는 중첩 툴팁(스택). 잠시 머물면 고정(잠금)되어 안으로 들어갈 수 있고, 화면 가장자리에서는 위치를 보정한다(`core/placement.ts`). (2) 누르고 있거나 일시정지하면 열리는 맥락 용어집: 지금 장면에 등장한 인물 · 용어 · 장소만 골라 보여 준다.
- **데이터.** 장면 · 대사 노드에 태그를 달고 "지금 장면의 항목" 만 질의한다. 용어 사전(키워드 → 설명, 설명 안의 키워드)과 장면 목록을 화면과 분리한 순수 데이터로 둔다. 중첩 깊이 제한과 순환 참조(용어 A 설명에 B, B 설명에 A) 처리를 보여 준다.
- **세계관.** 공통 세계관(외곽 탐사대). 용어 예: 궤도 정비 기지, 잔해 드론, 냉각 셀, 북쪽 통신탑, 인물 하린 · 도윤 · 세라. 원작의 용어나 문장을 쓰지 않는다.
- **키.** 용어집을 여는 누르고 있기 키는 갤러리 단축키가 아닌 키로 (가이드 3절). 툴팁 안 키워드는 키보드로도 갈 수 있게 한다 (Tab 은 가로채지 않는다, 포커스 이동은 기본 Tab 순서를 따르거나 무대 안 방향키).
- **효과 끄기 후보.** 툴팁이 마우스를 따라가거나 바로 사라져 하위 키워드에 갈 수 없는 모습(잠금 없음), 또는 용어집이 장면과 상관없이 전체 사전을 보여 주는 정보 과부하. 화면에서 분명한 것을 고른다.
- **Unity.** UGUI: TextMeshPro `<link="id">` 태그와 `TMP_TextUtilities.FindIntersectingLink` 로 키워드 판정, 툴팁 스택 프리팹. UI Toolkit: 리치 텍스트 `<link>` 와 링크 포인터 이벤트(Unity 6 의 이름을 컴파일로 확인한다), 툴팁 VisualElement 스택. 용어 DB 는 ScriptableObject.
- **`inspiredBy`.** 카드의 Final Fantasy XVI (GDC Vault "Designing Active Time Lore" 세션) 를 가이드 6절 형식으로. 빌린 것은 "지금 장면의 항목만 고른 용어집" 이라는 설계 원리이고, 화면 세부는 미확인으로 밝힌다. 다른 게임은 출처로 확인한 것만.
- **`related`.** `inventory-grid-tooltip`(툴팁 배치), `dialogue-choices`(대사 화면) 중 실제로 이어지는 것.
- **가이드 보강(2026-11-03).** 1차 묶음 리뷰에서 반복된 실수가 가이드 3 · 4 · 8절 규칙이 됐다: 창을 열고 닫을 때 포커스, param 변경 뒤 상태 맞추기, `data-part` 를 조건부로 그리지 않기, React `key` 재마운트로 애니메이션하지 않기, Unity 코루틴 · `interactable` · UI Toolkit `width` · 진입 transition · `pickingMode` · 입력 칸 포커스 · 문화권과 무관한 표기. 끝내기 전에 이 규칙을 하나씩 대조한다.
- **용량.** 측정에 시간을 쓰지 않는다. 다른 3순위 표본과 비슷한 규모(Unity 파일 UGUI 4개 · UI Toolkit 3개 안팎)로 만들고, 끝내기 전에 `node tools/size.mjs <id>` 를 한 번만 본다.

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen context-lore-glossary` 가 `exit 0`.
3. `python tools/shot.py context-lore-glossary default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
