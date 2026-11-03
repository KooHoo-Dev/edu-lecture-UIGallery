---
# 3순위 2차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 7
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
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: directional-combo-input 리뷰 반영

`directional-combo-input` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 판정 로직(접두사 필터, 재사용 대기 제외, 긴 후보가 있으면 기다림, 기다림 중 다른 방향이면 먼저 발동하고 새 첫 칸으로, 기다리는 동안 제한 시간 정지, 관대한 모드)은 웹과 Unity 가 같고 리뷰가 맞다고 확인했다. 열렸을 때만 방향키 · WASD 를 먹는 키 처리, 효과 끄기, 새 커맨드 이름과 시퀀스(원작 코드와 같은 것 없음)도 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 갤러리 전체가 원본 74% · gzip 92% 다. 고치면서 용량을 늘리지 않는다. 측정은 끝내기 전에 `node tools/size.mjs <id>` 한 번만 보고, 줄이는 작업은 하지 않는다.

## 필수

1. **스와이프 임계값과 "한 번 = 한 칸"** (`index.tsx` `SWIPE_PX`, `combo.ts` 양자화). 70 논리 px 라 무대가 축소되면 390px 폰에서 약 13 CSS px 가 되어 한 번 밀면 4~9칸이 들어간다 (가이드의 입력 소비 · 관통). 임계값을 화면(CSS) px 로 32~40 정도에 두고, 한 번 밀기(누름 → 뗌 또는 방향이 바뀔 때까지)가 한 칸이 되게 한다. 대각선 무시 구간을 넣고(Unity `diagonalBand` 처럼), 첫 포인터만 열기 · 닫기를 맡게 해 두 번째 손가락이 덮어쓰지 않게 한다. 주석과 해설 문구를 사실대로.
2. **누르고 있기 모드에서 아무도 안 누르는데 열린 채 남고 자동 데모가 멈춘다**: 자동 데모가 연 목록을 방향키로 넘겨받거나 이벤트(open · wrong · ambiguous)로 열면 `owner='human'`, `heldBy=null` 이 되어 Esc 전까지 데모가 영구히 멈추고 ←/→ 도 계속 먹힌다 (강사가 해설 번호를 넘기려던 → 가 커맨드로 들어간다). 누르고 있기 모드에서 누르는 사람이 없는 상태는 이벤트 · 인계로 연 경우 입력이 없으면 약 3초 뒤 닫고 자동 데모를 되살린다 (`radial-quick-select` 의 구조 참고).
3. **Unity: 열 때 이미 눌려 있던 이동 키가 첫 칸으로 들어간다** (`ComboInput.cs`). `Open()` 에서 Direction 액션을 Enable 한 그 프레임에 `ReadValue` 가 0 이라 `waitNeutral` 이 풀리고, 다음 프레임에 걷던 W 가 ↑ 로 들어간다. Direction 을 늘 켜 두고 열렸을 때만 Feed 하거나, 연 프레임은 Feed 를 건너뛴다. 주석과 meta UGUI 단계 3 을 실제 동작에 맞춘다.

## 권장

4. 닫는 경로를 나눈다: 떼기와 토글 닫기에서만 기다리던 커맨드를 발동하고, Esc · 취소 · blur · 창 포커스 잃음 · OnDisable 에서는 버린다 (`Close(bool fire)`, 웹과 Unity).
5. 기다리던 커맨드가 자동 발동된 직후 틀리면 칸 번호가 틀린다: `slot` 을 push 뒤에 계산한다 (웹 `index.tsx`, `ComboHud.cs`, `ComboHudUITK.cs`).
6. UGUI 5파일 → 4파일: `ComboMatcher` · `DirectionQuantizer` · `ComboLabels` · `MismatchStyle` 을 `ComboCommandSet.cs` 로 옮겨 UI Toolkit 판이 TMPro 를 쓰는 UGUI 화면 파일에 묶이지 않게 하고, 두 HUD 의 `hasPrefix` 계산을 `ComboCommandSet.HasPrefix(i)` 로 합친다.
7. 웹과 Unity 차이: UITK `.row--cooling` 이 `.row--mismatch` 보다 뒤에 있어 대기 줄이 더 밝다 (선언 순서나 선택자 조정), UGUI '다음 칸' 표시를 해설 1 의 "두꺼운 금색 테두리" 와 맞추고 색에만 기대지 않게, UITK 에 재사용 대기 막대, meta 에 터치가 있으니 Unity 에서 포인터 이동량을 `DirectionQuantizer` 에 넣는 방법을 단계나 함정으로 한 줄.
8. Unity 열기 · 닫기 가장자리: 누름과 뗌이 같은 프레임이면 닫히지 않는다 (`if (open.IsPressed() != IsOpen)` 식으로), 스틱 0.5 기준에 해제 기준(히스테리시스).
9. 글: `index.tsx` 주석의 "←/→ 가 갤러리로 새어 표본이 바뀐다" → 실제로는 해설 번호 이동. meta UGUI 단계 1 의 "OnValidate 가 경고한다"(실제 `Debug.Log`, 값이 바뀔 때마다). `inspiredBy.learned` 의 "출처로 확인한 것" → "후보 카드가 출처로 든 범위". `borrowed` 에 "맞는 후보만 남고 입력한 화살표가 켜지는 목록 (카드 설명 기준, 원작 화면 미확인)" 을 둘째 축으로. 해설 `row` 강조가 실제 화살표보다 넓은 것(`justify-self: start`), `errorMode` 변화가 미리보기에서 잘 보이게, timings 마지막 항목의 "권장값".

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen directional-combo-input` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 좁은 폭(390px 상당)에서 한 번 밀기, 자동 데모 중 → 키 뒤 3초, 이벤트 '틀린 방향 넣기' 뒤 자동 데모 재개 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
