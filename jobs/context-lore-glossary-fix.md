---
# 3순위 2차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 8
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
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: context-lore-glossary 리뷰 반영

`context-lore-glossary` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 용어집 질의(장면 장소 + 지금 장면 0..현재 줄의 말한 사람 · 키워드), 깊이 한도 · 순환 판정, G 키 처리(keyup · blur 해제, Tab 을 가로채지 않음), 효과 끄기의 나쁜 예, 항상 있는 `data-part` 5개, Unity 의 `IgnoreEvent` · `OnDisable` 정리 · Experimental 링크 이벤트(6000.3.20f1 에 실제로 있음을 리뷰가 확인)는 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 갤러리 전체가 원본 74% · gzip 92% 다. 고치면서 용량을 늘리지 않는다. 측정은 끝내기 전에 `node tools/size.mjs <id>` 한 번만 보고, 줄이는 작업은 하지 않는다.

## 필수

1. **셋째 겹부터 부모 툴팁과 그 안의 여는 키워드를 덮는다** (웹 `index.tsx` 겹 배치 · prune · `onKwLeave`). 4겹 프리셋에서는 넷째 겹이 셋째 겹을 거의 다 가려 열림 → 가려짐 → pointerleave → 닫힘 → 다시 열림이 반복되어 머물러 고정할 수 없다. 고정된 겹은 여는 키워드 줄을 피해 부모 위나 아래에 놓고, prune 은 Unity 처럼 포인터 좌표가 보이는 툴팁 안인지로 판정한다. Unity 배치도 부모를 가리지 않게 맞춘다.
2. **웹: 스택이 줄어들 때 그 안의 포커스를 돌려주지 않는다** (이벤트 4 · 5 · 6, 자동 데모, `maxDepth` 낮추기). 줄인 뒤 `activeElement` 가 닫힌 겹 안에 있으면 그 겹을 연 키워드(없으면 무대 루트)로 포커스를 옮긴다 (가이드 3절의 창 포커스 규칙과 같은 원리).
3. **내용의 조사**: `data.ts` 의 `[[tower]]가` 가 화면에서 "북쪽 통신탑가" 로 나온다 (두 곳). `[[tower]]이` 로 고치고, 키워드 뒤 조사가 받침에 맞는지 모든 글(웹 데이터와 Unity 데이터)을 한 번 훑는다.
4. **UGUI 툴팁이 고정되면 노란 판이 된다** (`TooltipStack.cs` 가 루트 Image 색을 매 프레임 테두리 색으로 덮어쓰는데 하이어라키에 어두운 배경 Image 가 없다). 하이어라키를 Frame(Image) › Background(Image, 2px 안쪽) 로 적고 코드는 Frame 색만 바꾼다.
5. **param 변화가 바로 안 보인다** (가이드 3절): `edgeCorrection` 은 시작 스택에 뒤집기 · 고정이 없어 토글해도 그대로, `lockMs` 는 시작 상태가 모두 고정이라 링이 안 보인다. 값이 바뀌면 중첩을 다시 열거나 마지막 겹을 고정 전 상태로 연다.
6. **자동 데모가 읽는 중에 끼어든다**: `humanAt` 이 키워드 올리기 · 클릭 · 키 입력 때만 갱신되어, 툴팁 안에 커서나 포커스를 둔 채 6초 넘게 읽으면 다음 대본이 스택을 지운다. 포인터가 툴팁 안에 있거나(`held() >= 0`) 무대에 포커스가 있으면 자동 데모를 쉰다.

## 권장

7. Unity 터치: 탭으로 고정한 툴팁이 손을 떼면 0.45초 뒤 닫힌다 (UI 모듈이 exit 를 보냄). 터치 탭은 다른 곳을 탭할 때까지 붙잡고 바깥 탭에서 모두 닫는다 (웹은 이미 그렇다).
8. UI Toolkit: 막 보이게 하거나 붙인 요소의 `Focus()` 는 한 프레임 미룬다 (`schedule.Execute(() => x.Focus())`, `dialogue-choices` 참고). `OnEnable` 에서 `RegisterCallback` 하면 컴포넌트만 껐다 켤 때 중복 등록되어 `NavigationMove` 가 두 번 처리되니 `OnDisable` 에서 해제한다. Label 을 마우스로 눌러 온 FocusIn 이면 0번 키워드 툴팁을 열지 않는다. Cancel 로 용어집을 닫고, 창 포커스를 잃으면 누르고 있기를 푼다 (UGUI 처럼).
9. Unity 에서 용어집을 열면 키보드 위치를 잃는다 (hotspot 5 "떼면 그 자리로 돌아온다" 와 불일치): (글, 링크 번호)를 저장했다 복원하고 용어집이 열린 동안 닫힘 유예를 멈춘다.
10. 글리프: 맑은 고딕 · Arial 에 ↩ 가 없고 Arial 에는 ◆ 도 없다. 순환 표시의 핵심 단서가 □ 로 나올 수 있으니 한글 폰트에도 있는 글자로 바꾸거나 pitfall 에 콕 집어 적는다. UI Toolkit USS 와 pitfall 에 한글 FontAsset 안내를 넣는다 (`dialogue-choices` 의 USS 주석 참고).
11. UGUI FocusFrame 이 TMP 글 위에 그려져 기본 흰 사각형이면 키워드를 가린다: 색 · 스프라이트와 그리는 순서를 하이어라키에 적는다. 웹 Tab 순서: 툴팁 칸을 대사 바로 뒤 DOM 으로 옮겨 Tab 으로도 툴팁 키워드에 들어가게.
12. 웹 · Unity 차이를 맞춘다: 순환 강조 맥동(웹 1.25Hz, UGUI 1.5Hz, UITK 없음), 용어집 페이드(140 / 없음 / 160ms), 깊이 한도 표식(⋯ / …). timings 표는 복사용 프롬프트에 들어간다. 해설 번호가 글을 덮는 것(2번 `pin: 'left'`, 5번 `'below'`), `holdMode` 힌트 · hotspot 5 의 "토글로 열면 첫 항목"(웹은 마지막 선택 유지)을 실제 동작에 맞춘다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen context-lore-glossary` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 4겹 프리셋에서 넷째 겹에 머물러 고정, 툴팁 안 키워드에 포커스 둔 채 이벤트 4, 툴팁을 8초 읽기(자동 데모가 끼어들지 않는지), edgeCorrection 토글 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
