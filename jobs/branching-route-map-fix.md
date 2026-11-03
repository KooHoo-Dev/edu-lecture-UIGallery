---
# 3순위 파일럿 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 8
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
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: branching-route-map 리뷰 반영

`branching-route-map` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 지도 생성 알고리즘(난수 호출 순서, 흔들림 값 jx · jy 를 뽑는 자리 포함), 지문 함수, 생성 규칙은 바꾸지 않는다. 리뷰가 시드 1~300 의 54만 개 지도에서 웹과 C# 의 지문이 모두 같고 규칙 위반이 0 임을 실제로 돌려 확인했다. 흔들림은 그리는 쪽의 계수만 바꾼다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

## 필수

1. **UI Toolkit 키보드 탐색** (`uitk/RouteMapUITK.cs` 의 NavigationMoveEvent 처리): `StopPropagation()` 만으로는 기본 포커스 이동이 막히지 않는다. Unity 6.3 의 PostDispatch 가 `FocusController.SwitchFocusOnEvent` 를 부르고 이것은 `IgnoreEvent` 만 본다. 그래서 코드가 이웃 노드로 옮긴 뒤 기본 이동이 한 번 더 일어나 가운데 노드를 건너뛴다. `inventory-grid-tooltip/uitk/InventoryUITK.cs` 처럼 `focusController?.IgnoreEvent(e)` 를 함께 부른다. 주석도 맞게 고친다.
2. **UGUI 선택 표시** (`ugui/RouteNodeView.cs`): `transition = None` 이고 `ISelectHandler` 가 없어 키보드 · 패드로 고른 노드가 화면에 보이지 않는다. `ISelectHandler` · `IDeselectHandler` 로 포커스 고리(웹의 점선 고리와 같은 뜻)를 켜고 끈다. hierarchy 설명에도 고리 Image 를 넣는다.
3. **노드 겹침**: x 흔들림이 열 폭의 ±0.25 라 7열에서 이웃 노드 중심이 66px 까지 가까워지고 노드는 80px 이다. 시드 1~999 기본값에서 239개, 고난도 런에서 366개가 겹치고, 형제 선택지가 1.18배로 커지면 더 겹친다 (`preset-hard-run` 화면에서 두 선택지가 겹쳐 보인다). 웹(`index.tsx` 의 `px`), UGUI(`RouteMapView.cs`), UI Toolkit(`RouteMapUITK.cs`) 세 곳의 그리기 계수를 함께 줄이거나 노드 크기를 열 폭의 0.45배 이하로 둬서, 커진 선택지끼리도 겹치지 않게 한다. 고난도 런과 기본값 화면으로 확인한다.
4. **저장 검증이 가짜다**: 불러오기의 "지문 일치" 는 메모리의 `map.print` 와 다시 만든 지도를 비교한다. `RunSave`(웹 `map.ts`, C# `RouteMapData.cs`)에 지문(`print`)을 넣고, 불러올 때 저장된 지문과 다시 만든 지도의 지문을 비교한다. 다르면 "생성 규칙이 바뀌었다" 를 보여 주는 길도 있어야 실수 목록 5번과 맞는다. Unity `Load` 에도 같은 비교를 넣고, 웹과 C# 의 JSON 필드 순서를 계속 같게 둔다. 해설과 meta 글을 새 형식에 맞춘다.
5. **UGUI 레이어 앵커** (`ugui/RouteMapView.cs`): 노드와 간선은 `nodeLayer` · `edgeLayer` 의 왼쪽 위(0,1) 기준으로 놓이는데 hierarchy 설명은 "빈 RectTransform" 이다. 기본값(가운데 100×100)으로 만들면 지도가 화면 밖으로 밀린다. 코드에서 두 레이어를 늘이기(앵커 0→1, 여백 0)로 정하고 hierarchy 에도 적는다.
6. **해설 대상이 사라진다** (`index.tsx` 의 `data-part="next"`): 목표에 도착하면 요소가 DOM 에서 빠진다 (가이드 4절 "항상 있어야 한다"). 늘 그리고 `visibility` 나 opacity 로 숨긴다.

## 권장

7. 저장 · 불러오기 중(약 1.5초)과 목표 도착 상태에서도 ←/→/Enter/↑ 를 먹는다. 지금은 갤러리의 해설 넘기기로 새어 나간다 (가이드 3절 "잠깐 할 일이 없어도 먹는다").
8. UGUI: 패드로 범례에 갈 수 있게 노드의 `selectOnDown` 을 첫 범례 버튼으로 잇는다. 안 하면 UGUI 단계의 "마우스와 패드 포커스가 같은 강조" 글을 고친다.
9. 효과 끄기 화면에서 키보드 후보 점선 고리가 못 가는 노드에 남는다. 키보드를 쓴 뒤에만 점선 고리를 보이게 해 "모든 노드가 똑같다" 대비를 지킨다.
10. UI Toolkit: `clicked +=` 로 건 핸들러를 `OnDisable` 에서 뗀다. 지금은 껐다 켜면 두 번 걸려 새 지도가 시드를 2씩 올린다.
11. 첫 화면(썸네일)에서 갈 수 있는 노드가 하나뿐이라 "갈라지는" 장면이 없다. 기본 시드나 처음 걸음을 바꿔 선택지가 2~3개인 순간을 첫 화면으로 둔다.
12. 사소: 새 지도 뒤 자동 데모가 출발 전 화면을 보여 주게, 해설 1번 번호가 바로 위층 노드를 가리지 않게, 해설 5번의 "지도 전체의 해시" 를 "노드 종류 · 위치 · 연결의 해시 (흔들림 제외)" 처럼 사실대로. 효과 끄기 설명의 "이 실수 하나만" 은 함께 꺼지는 연출(탐사대 표시 이동, 토스트)을 적거나 그것들은 켜 둔다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen branching-route-map` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 고난도 런, 세로 9:16, 목표 도착(자동 데모를 `live.mjs` 로 기다리기) 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
