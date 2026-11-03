---
# 3순위 1차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 10
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen skill-tree
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/skill-tree/**
  - src/unity/skill-tree/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: skill-tree 리뷰 반영

`skill-tree` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 환불 규칙(`checkRefund` 의 AND 선행 기준, history 의 `lastIndexOf` 제거), 웹과 Unity 의 같은 TSV 표, 좋은 예의 글자 크기(이름 26 · 단계 24 · 수치 22px), stageKeys 키 처리, UITK 의 `IgnoreEvent` · `OnDisable` 해제 · Painter2D 선 두께 보정은 리뷰가 맞다고 확인했으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 워커 허용 명령에 `npm run build` 와 `python tools/check.py` 가 들어갔다. 끝내기 전에 직접 돌려 본다.
- 가이드 8절: UI Toolkit `NavigationMoveEvent` 는 `StopPropagation()` 과 `focusController?.IgnoreEvent(e)` 를 함께, UGUI `transition = None` 이면 선택 표시를 직접 그린다.
- 이번 묶음 5개가 main 에 합쳐져 갤러리 전체가 원본 95% · gzip 93% 다. 고치면서 용량을 늘리지 않는다. 줄일 수 있으면 줄인다 (`node tools/size.mjs <id>`).

## 필수

1. **포인트가 음수가 된다** (`index.tsx` 의 `total`). param · 프리셋을 바꿔도 다시 마운트되지 않아 `R.ranks` 가 남는다. 자동 데모가 14점을 다 쓴 뒤 "되돌릴 수 없는 성장"(10점)을 누르면 "남은 포인트 −4 / 10". `total < spent` 가 되면 history 끝에서부터 `checkRefund` 를 통과하는 노드를 되돌려 예산 안으로 맞추거나, `points` 가 바뀔 때 시작 상태로 되돌린다.
2. **"표만 바꾸면 트리가 바뀐다" 를 코드가 지키지 못한다.** Unity: `views["scan"]` · `nodes["scan"]` 때문에 학생 표에 `scan` 이 없으면 KeyNotFoundException. `SetRanks` 는 규칙을 거치지 않아 선행 없는 습득 노드나 최대 단계를 넘는 rank 가 들어간다. 웹: `AUTO_ORDER` · `START` · `'scan'` · `'joint'` 하드코딩과 `find(...)!` 로 표를 바꾸면 크래시. 시작 상태는 START 기록을 `Learn()` 으로 재생하고 없는 id 는 건너뛴다. 첫 선택은 표의 첫 노드로 대체하고, 데모 시작 상태는 기본 표일 때만 쓴다. Unity `Parse` 는 웹처럼 선행 id 를 Trim 한다 (엑셀의 "scan, o2").
3. **"잠긴 노드 눌러 보기" 에서 빠진 선행이 툴팁에 가려진다** (hotspot 4 "선행을 덜 가리는 쪽에 둔다" 가 효과가 없다). 후보에 창의 네 모서리를 추가하거나, 실패하면 노드와 빠진 선행이 함께 보이도록 카메라를 옮긴다. `event-locked-try` 화면으로 확인한다.
4. **UGUI 에서 마우스를 올리기만 해도 지도가 움직인다** (`SkillNodeView.OnPointerEnter` → `onFocus` → `EnsureVisible`). 가장자리 노드에 올리면 Content 가 커서 밑에서 밀리고 끄는 중에도 튄다. hover 는 선택(EventSystem · FocusRing)과 툴팁을 함께 옮기되 `EnsureVisible` 은 부르지 않는 경로로 따로 둔다. Enter · Backspace · 버튼이 같은 노드에 작동하게 한다.
5. **효과 끄기 설명과 코드가 다르다**: juiceOff 는 "강조 · 툴팁은 그대로, 글자 크기 차이만 비교" 인데 `data-hl={(highlight && juice)}` 라 고리 맥동과 흐르는 선도 꺼진다. 강조는 juice 와 무관하게 두고, 기본 배율에서는 차이가 작으니 글에 "이벤트 '멀리 보기' 에서 비교" 를 넣는다.
6. **해설 3번 대상이 크기 0 인 `.node` 다**: 핀이 노드를 덮고 강조 테두리가 점이 된다. `data-part` 를 `.shape` 로 옮기고, 대상은 창 안에 있는 습득 가능 노드 중에서 고른다. 프리셋 첫 화면에서 고른 노드가 창 밖이라 툴팁이 숨는 문제도 `startCam` 뒤 바로 보이게 맞춘다.
7. **포인트가 모자라도 연결선이 흐른다**: `edgeState` 의 'open' 기준을 `checkLearn(...).ok` 로 바꿔 hotspot 3 "지금 살 수 있는 것만 움직인다" 와 맞춘다.

## 권장

8. UGUI ScrollRect Clamped: 기본 배율에서 Content 가 창보다 낮아 트리가 위에 붙고 휠 기준점 보정을 덮어쓴다. Unrestricted + 웹 `panRange` 같은 수동 고정으로 웹과 첫 화면을 맞춘다.
9. UGUI 자동 데모가 마우스 · 터치로 멈추게 한다 (지금은 키 · 패드만 감지해 끄는 중인 지도를 당긴다).
10. Unity 연결선을 색 · 알파로만 구분하지 않는다 (굵기나 점선, 웹의 반쯤 열림 상태와 선행 빨강 표시).
11. `KeyCap label="Enter" size={30}` 의 글자가 12px 이다. 22px 이상으로 (가독성이 주제인 표본이다).
12. `prefers-reduced-motion` @media 블록 (회전 고리, 맥동, 흐름, 흔들림).
13. 조사: "${name} 은 이미 최대 단계" → 받침과 무관한 문장으로 (웹과 C#). 키보드 이동 점수의 수직 가중이 커서 ↑ 가 직계 선행을 건너뛴다. 휠: Ctrl+휠(브라우저 확대)은 가로채지 않는다. `paint()` 가 멈춰 있을 때도 매 프레임 `--ns` 를 쓰고 `offsetWidth` 를 읽는다 → 값이 바뀔 때만.
14. 용량 116KB → 106KB 근처: Unity 주석 · XML doc 에서 meta steps 를 되풀이하는 부분, UGUI 와 UITK 가 따로 가진 확대 기준점 · EnsureVisible · LOD 계산을 `SkillTreeData.cs` 정적 함수로 공유, meta steps · pitfalls 중복.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen skill-tree` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 되돌릴 수 없는 성장 프리셋(자동 데모 뒤 전환 포함), 잠긴 노드 눌러 보기, 멀리 보기 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
