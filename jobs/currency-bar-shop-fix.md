---
# 3순위 1차 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: 6
verify:
  - node tools/worktree-link.mjs
  - npx tsc --noEmit
  - powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen currency-bar-shop
  - npm run build
  - python tools/check.py
allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(node tools/worktree-link.mjs)", "Bash(npx tsc --noEmit*)", "Bash(python tools/shot.py *)", "Bash(node tools/live.mjs *)", "Bash(node tools/size.mjs *)", "Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)", "Bash(npm run build*)", "Bash(python tools/check.py*)", "Bash(git status*)", "Bash(git diff*)", "Bash(ls *)"]
writePaths:
  - src/specimens/currency-bar-shop/**
  - src/unity/currency-bar-shop/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: currency-bar-shop 리뷰 반영

`currency-bar-shop` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 `docs/specimen-guide.md` 를 따른다. 정직한 UI 의 핵심(누른 시각으로 판정하는 입력 잠금, 모델의 `S.paying` 가드, 확인 창의 가격 · 원화 환산 · 구매 후 잔액 줄, 효과 끄기의 나쁜 예, UGUI 재화 바의 DontDestroyOnLoad · 중복 제거 · 코루틴 정리)은 리뷰가 맞다고 확인했으니 유지한다.

맨 먼저 `node tools/worktree-link.mjs` 를 한 번 실행한다 (worktree 에 `node_modules` 를 잇는다).

리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):
- 워커 허용 명령에 `npm run build` 와 `python tools/check.py` 가 들어갔다. 끝내기 전에 직접 돌려 본다.
- 가이드 8절: UI Toolkit `NavigationMoveEvent` 는 `StopPropagation()` 과 `focusController?.IgnoreEvent(e)` 를 함께, UGUI `transition = None` 이면 선택 표시를 직접 그린다.
- 이번 묶음 5개가 main 에 합쳐져 갤러리 전체가 원본 95% · gzip 93% 다. 고치면서 용량을 늘리지 않는다. 줄일 수 있으면 줄인다 (`node tools/size.mjs <id>`).

## 필수

1. **다크패턴 자동 충전이 잔액을 음수로 만든다** (`data.ts` `packFor`, `index.tsx` `complete`). 부족분이 가장 큰 충전 상품보다 크면 그 상품 하나만 고르고, `complete()` 는 잔액을 다시 확인하지 않고 뺀다. 다크패턴 자동 데모가 약 10초에 재화 바 "−20" 을 보여 준다. 충전 묶음 합이 부족분을 넘을 때까지 고르고(원화 합계 기록), `complete()` 에서 잔액이 모자라면 중단한다. 자동 데모 첫 주기에 꾸러미를 두 번 사는 흐름도 정리한다.
2. **키보드로 창을 열면 다음 Enter 가 창을 다시 연다**: `openModal` 이 포커스를 창 안으로 옮기지 않아 포커스가 진열 카드에 남고, 다음 Enter 가 카드를 다시 눌러 잠금이 새로 시작된다. 창이 뜨면 기본 버튼(정직: 취소 또는 구매, 화면 의도대로)에 포커스하고, 닫으면 창을 연 카드로 돌려준다. Unity 도 같다: 창을 닫은 뒤 선택이 숨은 버튼에 남아 패드로 진열에 못 돌아간다 → 연 카드를 기억해 `SetSelectedGameObject` / `Focus()` 로 돌려준다. 결정 + 를 누르면 창을 먼저 닫는다.
3. **같은 재화가 날아오는 중에 그 재화를 쓰면 바 숫자가 음수로 보인다** (웹 `index.tsx`, `CurrencyBar.cs`, `CurrencyShopUITK.cs`). 쓰는 재화에 대기 중인 지급이 있으면 먼저 정산(표시값 = 실제 잔액)하고 뺀다. 같은 재화 지급 두 건이 겹칠 때 두 번째 피드백이 사라지는 문제도 같은 정산 규칙으로 고친다.
4. **Unity 두 판 모두 `TrySpend` 결과를 버린다** (`PurchaseConfirmPanel.cs`, `CurrencyShopUITK.cs`). 부족 확인과 차감 사이에 잔액이 바뀌면 차감 없이 지급된다. 실패하면 지급하지 않고 중단한다(학생이 그대로 옮기는 코드다). 확인 창 로직(문구 · 잠금 · 부족 · 차감 → 지급 순서)을 `ShopData.cs` 의 일반 클래스 하나로 모아 두 판이 같이 쓰면 이 수정이 한 곳으로 모이고 용량도 준다.
5. **콘텐츠 정책**: `meta.ts` 의 `original` 에 게임명(클래시 오브 클랜 등)이 있다. 게임명은 `inspiredBy` 에만 둔다 (가이드 6절). 빼거나 `inspiredBy` 항목(`borrowed: []`, 미확인)으로 옮긴다.
6. **법률 문구를 카드 범위로 좁힌다.** 카드가 뒷받침하는 것은 "공정위가 '닫으면 다시 살 수 없다' 같은 유인 문구와, 환불 가능한 아이템을 환불 불가로 안내한 것을 제재한 사례가 있다" 까지다. 정직 UI 의 청약철회 줄은 "(예시 문구)" 로 표시하고 기간 같은 조건을 단정하지 않는다. 에너지의 "받는 즉시 청약철회 불가" 는 카드가 말하는 제재 유형을 모범처럼 보여 주므로 빼고, 해설에서 "철회가 안 되면 그 사실과 이유를 미리 알린다 — 가능 여부는 법령 · 약관으로 확인" 정도로만 다룬다. 플레이어 문구에 섞인 설계 메모("— 구매 전에 알림")를 뺀다. `mistakes` 의 "이런 유인 문구" 는 카드 문구로 좁히고, `references` 의 출처별 주제 꼬리표 중 카드에 없는 추정은 뺀다.
7. **"다크패턴 4가지" 와 화면이 다르다**: "인기 1위", 흐리고 작은 "다음에"(거절 버튼 약화), 맥동하는 구매 버튼, 가짜 원래 가격 "−70%!!", "+ → 가장 비싼 상품" 에 꼬리표와 설명이 없다. "하지 말아야 할 예" 의 모든 장치에 이름과 설명을 붙이거나 그 장치를 뺀다. 개수를 적은 글도 맞춘다.

## 권장

8. UITK `OnDisable` 이 결제 중 상태(버튼 비활성, 창, "스토어 확인 중…", `counting[]`, 카운팅 클래스)를 되돌리지 않는다. UGUI 판처럼 되돌린다.
9. UITK 코인: `coin--fly` 를 뗀 뒤에도 인라인 `transitionDuration` 이 남아 재사용 코인의 시작 위치 이동까지 애니메이션될 수 있다 (그러면 `TransitionCancelEvent` 로 도착이 일찍 불린다). 시작 위치를 놓기 전에 transition 을 끄고 다음 프레임에 켠다. `ShowGain` 의 지우기 예약이 겹치지 않게.
10. UGUI `OnDisable` 에서 풀의 `SetActive(false)` 를 부르지 말고 `Image.enabled` 토글 등으로 바꾼다 (부모가 꺼지는 중 자식 SetActive).
11. 에너지가 최대치를 넘었는데 충전을 그대로 팔면 정직 UI 는 안내 한 줄을 띄운다.
12. 글: 정직 확인 창에 한정 기간 종료 시각 줄을 넣거나 "진열과 확인 창이 같은 종료 시각을 센다" 문장을 고친다. timings 의 "ease-out" 과 CSS 를 맞춘다. "비싼 상자 … 먼저 크게"(실제로는 금테만), "820개 부족"(실제 520 · 1,120)을 사실대로. UGUI pitfalls(별도 Canvas, OnEnable/OnDisable 구독)와 hierarchy(`contents` · `buyLabel` 누락), UITK `root.dataSource` → 실제 코드와 맞춘다.
13. 해설 번호가 설명하는 대상을 가리지 않게 (5번이 "+15,000" 을, 다크 모드 1 · 2번이 꼬리표 · 스탬프를). 코인 도착마다 리렌더하지 않는다.
14. 용량: 이전 시도에서 줄인 만큼으로 끝낸다. 바이트를 세는 데 시간을 쓰지 말고, 끝내기 전에 `node tools/size.mjs <id>` 한 번으로 처음보다 늘지 않았는지만 본다. 남은 필수 · 권장 항목을 먼저 끝낸다.

## 끝내기 전에

1. `npx tsc --noEmit` 오류 0, `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen currency-bar-shop` 가 `exit 0`.
2. `python tools/shot.py` 와 `node tools/live.mjs` 로 기본, 효과 끄기, 다크패턴 프리셋을 30초 실시간으로(자동 데모 두 주기), 충전 직후 같은 재화로 구매, 키보드로 창 열고 Enter 두 번 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 `meta.ts` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
