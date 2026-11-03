---
# 3순위 1차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 8
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen crafting-recipe-panel
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/crafting-recipe-panel/**
  - src/unity/crafting-recipe-panel/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: crafting-recipe-panel 리뷰 반영

`crafting-recipe-panel` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 보유/필요 계산과 인벤토리 변경 때 한 경로로 다시 계산하는 구조, 재료를 걸 때 원자적으로 빼고(`TryTake`) 취소 때 `used` 그대로 환불하는 대기열, 숫자 키를 쓰지 않는 키 배치는 리뷰에서 맞다고 확인됐으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 워커 허용 명령에 `npm run build` 와 `python tools/check.py` 가 들어갔다. 끝내기 전에 직접 돌려 본다.
- 가이드 8절: UI Toolkit `NavigationMoveEvent` 는 `StopPropagation()` 과 `focusController?.IgnoreEvent(e)` 를 함께, UGUI `transition = None` 이면 선택 표시를 직접 그린다.
- 이번 묶음 5개가 main 에 합쳐져 갤러리 전체가 원본 95% · gzip 93% 다. 고치면서 용량을 늘리지 않는다. 줄일 수 있으면 줄인다 (`node tools/size.mjs <id>`).

## 필수

1. **필터를 켠 채 제작하면 다음 입력이 다른 레시피를 만든다** (웹 `selectedOf` · `craft()`, UGUI `CraftingPanel`, UITK `CraftingUITK` 모두). "만들 수 있는 것만" 필터에서 제작해 재료가 모자라지면 그 줄이 빠지고 선택이 말없이 첫 줄로 바뀌어, Enter 를 한 번 더 누르면 엉뚱한 레시피가 대기열에 들어간다. 지금 고른 레시피는 선택을 바꿀 때까지 ✕ 상태로 목록에 남긴다 (또는 표시 선택이 바뀐 직후 `core/inputLock` 으로 짧게 막는다). 웹 · UGUI · UI Toolkit 이 같게 동작하게 한다.
2. **`CraftingStation.OnDisable` 이 코루틴을 멈추지 않는다.** 껐다 켜면 코루틴이 둘이 되어 진행이 2배속이 된다. 가이드와 기존 표본의 규칙: 컴포넌트를 `enabled = false` 로 꺼도 코루틴은 멈추지 않는다. `OnDisable` 에서 `StopCoroutine`(또는 `StopAllCoroutines`)과 상태 변수 초기화를 함께 한다. 꺼진 동안 `Enqueue` 가 코루틴을 시작하지 않게 `isActiveAndEnabled` 를 확인하고, 주석을 사실대로 고친다.
3. **UGUI hierarchy(`meta.ts`)에 코드가 쓰는 참조가 빠져 있다:** `RecipeRowView.content`(CanvasGroup, 아이콘 · 이름을 묶는 부모), `IngredientRow.bar`(Filled Image), `QueueSlot.icon`. hierarchy 대로 만들면 NRE 가 난다. 셋을 hierarchy 에 넣고, 단계 4 의 `Changed += RecomputeAll` 예시를 실제 시그니처(`Action<string>`)에 맞게 고친다. UI Toolkit hierarchy 에 `.body` 감싸개를 넣는다.
4. **UI Toolkit 검색창 포커스 가드** (`CraftingUITK.cs` 의 `search.Contains(f)`): `VisualElement.Contains` 는 자기 자신을 포함하지 않는데 `focusedElement` 는 TextField 자신을 돌려준다. 그래서 검색어를 치는 동안 Q · E · F 가 먹히고 Backspace 가 마지막 제작을 취소한다. `f == search || search.Contains(f)` 로 고친다 (목록 쪽 `list.Contains(f)` 도 같은 문제가 없는지 본다).
5. **해설 1번 대상이 사라진다**: `data-part="ingredients"` 가 `recipe ? … : <p>` 안에 있어 검색 결과가 없거나 필터에 모두 걸리면 DOM 에서 빠진다 (가이드 4절). 늘 그린다.

## 권장

6. Unity 선택 복원: 선택이 필터 · 검색에 가려져도 `selectedByTab[tab]` 를 첫 줄로 덮어쓰지 않는다 (웹처럼 그대로 두고 표시만 대체). UI Toolkit 은 필터 값도 `OnDisable` / `OnEnable` 에서 저장 · 복원한다. 웹 안내 띠는 대체된 줄이 아니라 실제로 복원한 상태를 말하고, 복원한 선택이 스크롤 밖이면 보이게 스크롤한다.
7. 필터에 가려진 새 레시피 배지를 지울 수 없다: 탭의 "새 n" 은 보이는 줄로만 세거나, 새 레시피는 필터와 상관없이 보이게 한다. Unity 에서 프로그램이 준 포커스(`SetTab` · `OnEnable`)로 배지가 지워지지 않게 한다.
8. 흔들림을 `key` 재마운트로 재생하지 않는다 (포커스가 body 로 빠져 키가 무대에 닿지 않는다). 클래스를 뺐다 넣거나 Web Animations API 로 재생한다.
9. "만들 수 있음" 강조는 한 번만 (탭을 바꾸거나 다시 열 때 또 번쩍이지 않게). 효과 끄기와 "필요량만" 표시에서는 빨간색 단서를 뺀다.
10. `CraftingStation` 에 `[DefaultExecutionOrder(-50)]` 처럼 창보다 먼저 초기화되게. UGUI `OnDeselect` 가 선택 표시를 지워 제작 버튼으로 옮기면 목록 선택이 사라지는 것, 스크롤 복원을 한 프레임 뒤에 적용하기.
11. 글: 해설 2 "그 줄만 빛난다"(실제로는 세 줄), 프리셋 "절반쯤만"(실제 9개 중 6개), `inspiredBy.learned` 의 "조사 카드" 같은 내부 용어를 사실과 학생 눈높이에 맞게. 카드 출처 중 Funcom 포럼 글(제작 메뉴 위치 · 탭 기억)을 `references` 에 넣는다. 해설 4 번호가 제목 글자를 덮지 않게, 자동 데모의 `select-new` 가 방금 해금된 레시피로 가게.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen crafting-recipe-panel` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 샌드박스 프리셋에서 제작 두 번(선택 유지 확인), 닫았다 열기, 검색 결과 없음 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
