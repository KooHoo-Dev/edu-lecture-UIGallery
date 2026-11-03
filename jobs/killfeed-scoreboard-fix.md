---
# 3순위 1차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 8
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen killfeed-scoreboard
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/killfeed-scoreboard/**
  - src/unity/killfeed-scoreboard/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: killfeed-scoreboard 리뷰 반영

`killfeed-scoreboard` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. Tab 을 가로채지 않고 Q 로 누르고 있기, 보드가 남지 않게 하는 닫기 경로(keyup · blur · 포인터 캡처 · pointercancel), 사람 · 스크립트 소유 구분, 효과 끄기의 나쁜 예, 결정적인 정렬, Unity `HoldToShow` 와 풀링 · CanvasGroup 페이드, 유혈 없는 표현은 리뷰가 맞다고 확인했으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 워커 허용 명령에 `npm run build` 와 `python tools/check.py` 가 들어갔다. 끝내기 전에 직접 돌려 본다.
- 가이드 8절: UI Toolkit `NavigationMoveEvent` 는 `StopPropagation()` 과 `focusController?.IgnoreEvent(e)` 를 함께, UGUI `transition = None` 이면 선택 표시를 직접 그린다.
- 이번 묶음 5개가 main 에 합쳐져 갤러리 전체가 원본 95% · gzip 93% 다. 고치면서 용량을 늘리지 않는다. 줄일 수 있으면 줄인다 (`node tools/size.mjs <id>`).

## 필수

1. **최대 줄 수를 넘으면 내 줄과 합친 줄이 가장 먼저 밀려난다** (웹 `model.ts` `cap()`, C# `KillFeedModel.Cap()`). 배열 앞부터 빼고 `mine` · `lastAt` 을 보지 않으며, 합친 줄은 수명만 새로 채우고 옛 자리(위)에 남아 다음 밀어내기 1순위가 된다. hotspot 2 "내 줄은 1.5배" 와 어긋나고 이 규칙이 프롬프트와 Unity 로 복제된다. (a) cap 은 내 줄이 아닌 줄을 `lastAt` 이 오래된 순으로 먼저 빼고, 남은 줄이 모두 내 줄일 때만 내 줄을 뺀다. (b) 나와 관련된 이벤트는 남의 줄에 합치지 않는다 (또는 합칠 때 그 줄을 맨 아래로 옮긴다). 웹과 C# 을 같이 고친다.
2. **UITK 줄 들어오기 · ×n 튀기 transition 이 안 일어날 수 있다**: 지연 없는 `schedule.Execute` 는 같은 프레임의 스타일 계산 전에 돌 수 있다. `dialogue-choices` 처럼 `.StartingIn(16)` 이나 `GeometryChangedEvent` 뒤에 클래스를 바꾸고, meta uitk pitfall 의 "schedule.Execute 로 한 프레임 뒤" 문장도 고친다.
3. **UITK 의 닫힌 보드가 포인터를 막는다**: `pickingMode` 는 상속되지 않아 `.board` 만 Ignore 이고 안의 Label · ListView 는 opacity 0 으로도 포인터를 받는다 (피드 줄 Label 도 같다). 닫힘 transition 이 끝난 뒤 `visibility = Hidden` 으로 끄거나 하위 요소까지 Ignore 로 두고, meta 의 "Ignore 로 클릭을 통과" 문장을 사실대로 고친다.
4. **`sortBy` · `playersPerTeam` 을 바꿔도 화면에 바로 보이지 않는다** (보드가 최대 13초 뒤에야 열린다). 두 값이 바뀌면 보드를 스크립트 소유로 잠깐 연다.
5. **글 정확성**: hotspot 3 · timings 의 "최소 0.22초 간격" → "기본 0.22초, 대기가 길면 0.08초까지". 보드 아래 "같으면 제압 → 들어온 순서" 의 중복 기준 → "같으면 들어온 순서". 팀 목표 "먼저 50점" · "승리까지 남은 점수" 는 실제로 제압 수인데 개인 '점수' 열은 제압 1회 = 100점이라 헷갈린다 → "먼저 50 제압", "승리까지 n 제압".

## 권장

6. Unity 번역 층: 가해자 번호가 0 이 아닌데 선수를 못 찾으면 버린다 (`if (m.attackerNetId != 0 && e.attacker < 0) return false;`). 지금은 환경 처리돼 상대 팀에 점수가 간다.
7. 몰아치기 이벤트의 첫 건은 정지 중에도 바로 나오게 `handle` 안에서 내보낸다.
8. 해설 번호: 효과 끔에서 `my-row` · `columns` 자리 표시가 첫 줄 위에 겹친다 → 나쁜 예의 문장 줄에 `data-part` 를 달아 비교 해설로. 효과 켬에서 번호 1 이 내 줄 무기 아이콘을 가린다 → `columns` 에 `data-pin="below"`.
9. Unity `OnDisable` 에서 보드를 닫는다 (UGUI `board.alpha = 0`, UITK `OnVisible(false)`). UITK 판에도 `OnApplicationFocus` 대비책을 넣는다.
10. UGUI 스코어보드에 팀 이름 · 표식(Image + TMP)을 넣어 색과 위치로만 갈리지 않게 하고 hierarchy 에 적는다. UITK 밝은 내 줄의 팀 표식은 웹처럼 진한 색으로 대비를 맞춘다.
11. `inspiredBy`: 카드는 "Overwatch 2" 인데 meta 는 "Overwatch (2016)" 이고 연도 근거가 없다 → 버전 미확인을 적는다. learned 의 출처 설명에 War Thunder 포럼 글을 넣는다. `model.ts` 의 "같은 시드면 같은 경기" 는 프레임 경계에 따라 순서가 갈리므로 고치거나 문장을 뺀다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen killfeed-scoreboard` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 몰아치기 + 최대 5줄(내 줄이 남는지 실시간으로), 보드 열린 화면(`event:board` 나 Q 누르기), 정렬 기준 바꾸기 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
