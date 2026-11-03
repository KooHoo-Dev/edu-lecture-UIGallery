---
# 3순위 파일럿 (plan 11). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: 15
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen branching-route-map
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/branching-route-map/**
  - src/unity/branching-route-map/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: branching-route-map

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 `node_modules` 가 없다. 맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 `npx` 를 쓰지 않는다.

## 먼저 읽을 것

1. `docs/specimen-guide.md` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. `docs/agent-contract.md` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 `src/specimens/health-bar-trail/` 와 가까운 표본 `src/specimens/red-dot-badge-tree/`, `src/unity/red-dot-badge-tree/`, `src/specimens/card-hand-targeting/`, `src/unity/card-hand-targeting/`.
4. meta 형식 `src/core/types.ts`, 공통 유틸(가이드 3절 표).
5. 후보 카드: `research/next-batch-candidates.json` 의 `branching-route-map` 항목, `docs/next-specimens-research.md` 3절 (3순위 후보 풀).

## 표본별

- ID `branching-route-map`, C# namespace `UIGallery.BranchingRouteMap`.
- 제목 '분기 경로 맵', 그룹 D(메뉴 · 흐름), order 6, 난이도 2. `stage.aspect` 는 'both' (세로 9:16 이 자연스러운 화면이다).
- **무엇을 보여 주나.** 로그라이크 런의 지도 화면이다. 아래에서 위로 층이 이어지고, 층마다 노드가 갈라졌다 합쳐지며 마지막 층의 최종 목표까지 간다. 지금 갈 수 있는 다음 노드만 강조되고, 고르면 그 노드로 이동하며 지나온 길은 선으로 남는다. 범례의 종류 하나에 마우스를 올리거나 포커스를 두면 같은 종류의 노드가 모두 강조된다. 지도는 세로로 스크롤되고 이동하면 현재 위치가 화면 안으로 따라온다.
- **세계관.** 공통 세계관(외곽 탐사대, 가이드 3절)을 쓴다. 노드 종류 예: 교전(잔해 드론), 강적, 정비(휴식), 보급(상점), 회수(보물), 미확인 신호(무작위 사건), 최종 목표. 아이콘은 SVG 로 직접 그리고 모양이 서로 달라 색 없이도 구분되게 한다. 원작의 아이콘 모양, 노드 이름, 지도 그림체를 따라 하지 않는다.
- **핵심 로직 (웹과 Unity 같은 알고리즘).** (1) 층 × 열 격자에서 시작점 여러 개로 경로를 위로 그어 노드와 간선을 만든다. 간선은 이웃 열로만 가고 서로 교차하지 않게 한다 (교차하는 간선을 만들려 하면 다른 열을 고르거나 버린다). (2) 종류 배정은 비율과 제약으로 한다: 최종 목표 바로 앞 층은 정비, 중간 층은 회수, 처음 몇 층에는 강적 없음, 같은 경로에서 정비가 연달아 나오지 않음. (3) **시드 난수**: 웹과 C# 에 같은 작은 난수기(예: mulberry32)를 넣어 같은 시드면 웹과 Unity 가 같은 지도를 만들게 한다. 시드 고정이 버그 재현과 공정한 공유에 왜 필요한지 해설한다. (4) 진행 상태(시드, 현재 노드, 지나온 길)를 JSON 으로 저장하고 불러오는 것을 보여 준다 (웹은 화면 속 표시만, `localStorage` 를 쓰지 않는다. Unity 는 `JsonUtility` 와 `PlayerPrefs` 또는 파일).
- **조절 값 후보.** 층 수, 열 수, 경로 수, 종류 비율(예: 위험한 지도 · 보급이 많은 지도 같은 select), 시드. 모든 값이 화면을 눈에 띄게 바꿔야 한다.
- **이벤트 후보.** 다음 노드로 이동(자동 선택), 새 지도(시드 + 1), 범례 종류 강조 순환, 저장 후 다시 불러오기. 자동 데모는 노드를 하나씩 골라 올라가다가 끝에 새 지도로 돌아간다.
- **효과 끄기(`juice=false`) 후보.** 흔한 실수 하나를 고른다. 예: 갈 수 있는 노드와 못 가는 노드를 똑같이 그려 눌러 본 뒤에야 막히는 모습, 간선이 서로 교차해 길을 읽을 수 없는 지도, 이동해도 스크롤이 따라오지 않아 현재 위치를 잃는 모습. 화면에서 분명한 것을 고르고 `meta` 의 실수 목록과 맞춘다.
- **해설 번호(3~5개) 후보.** 갈 수 있는 다음 노드 강조, 지나온 길, 범례 강조, 최종 목표 앞 정비 보장, 현재 위치 따라가기.
- **Unity UGUI.** 지도 생성은 MonoBehaviour 와 분리한 순수 C# 클래스(직렬화 가능한 데이터). 노드는 `Button` + `Image` + TextMeshPro, 간선은 두 노드 사이를 잇도록 회전하고 늘린 `Image`(RectTransform). 갈 수 있는 노드만 `interactable`. `ScrollRect` 를 현재 노드 쪽으로 부드럽게 옮긴다. 키보드·패드 이동은 `Selectable` 의 명시적 Navigation 으로 갈 수 있는 노드끼리만 잇는다. 새 Input System 만 쓴다.
- **Unity UI Toolkit.** UXML + USS + C#. 간선은 `generateVisualContent` 와 `Painter2D` 로 곡선(베지어)을 그린다. 노드는 `Button`, 지도는 `ScrollView`. UGUI 폴더의 데이터 클래스를 그대로 쓴다 (같은 namespace, 가이드 8절). USS 에 없는 CSS 기능을 쓰지 않는다.
- **용량.** 남은 예산으로 표본 8개 안팎이 들어간다. 이 표본의 증분은 100KB 안팎을 목표로 한다 (`node tools/size.mjs branching-route-map` 으로 잰다). Unity 원문도 HTML 에 들어가므로 Unity 파일은 UGUI 4개, UI Toolkit 3개 안팎으로 둔다.
- **`inspiredBy`.** 카드의 Slay the Spire 를 `Slay the Spire (2019)` (정식 출시 연도) 로 가이드 6절 형식으로 넣는다. 빌린 시각 축은 "아래에서 위로 갈라졌다 합쳐지는 층 지도" 하나와 "종류 아이콘 + 범례 강조" 정도로 2개 이하. 카드 출처(muddasheep 생성 알고리즘 글, untapped 가이드)로 확인한 것만 쓰고 화면 세부는 미확인으로 밝힌다. Monster Train, FTL 은 근거가 없으면 넣지 않는다. 장르(로그라이크 · 덱빌딩)는 `genres` 에.
- **`related`.** `red-dot-badge-tree`(트리 데이터와 UI 분리), `card-hand-targeting`(Painter2D 선 그리기), `tutorial-spotlight` 나 `popup-queue-stack` 처럼 실제로 이어지는 것만.

## 범위

- 위 `writePaths` 밖은 고치지 않는다. 특히 `src/app`, `src/core`, `tools`, `docs`, `research`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (`docs/plan.md` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0.
2. `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen branching-route-map` 가 `exit 0`.
3. `python tools/shot.py branching-route-map default juice0 <이벤트·프리셋> mobile` 과 `node tools/live.mjs` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(`live.mjs`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
