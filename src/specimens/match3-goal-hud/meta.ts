import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'match3-goal-hud',
  title: '퍼즐 목표 HUD',
  titleEn: 'Puzzle Goal HUD (Moves · Collect Goals · Star Bar · Boosters)',
  group: 'A',
  order: 6,
  paradigms: ['non-diegetic'],
  oneLiner: '남은 이동 · 수집 목표 · 별 진행 바 · 부스터. 깨진 블록이 그 자리에서 목표로 날아가 도착할 때 개수가 준다',
  goals: [
    '깨진 블록이 **그 자리에서 목표 아이콘으로 날아가 도착할 때** 개수가 줄게 하고, 날아오는 동안의 **표시값과 실제값**을 정산할 수 있다',
    '점수 바 위 별 마커를 **임계값 / 최대 점수 × 바 너비** 자리에 세우고, 남은 이동 경고를 색 · 글자 · 2Hz 이하 맥동으로 설계할 수 있다',
    '이동 0 의 실패 판정을 **마지막 연쇄와 마지막 비행이 끝날 때까지** 미루는 이유를 설명할 수 있다',
    'Unity 에서 보드(월드) 좌표를 `RectTransformUtility` 로 UI 좌표로 바꾸고, 레벨 정의 ScriptableObject 하나로 HUD 를 자동 구성할 수 있다',
  ],
  principles: ['즉각 피드백', '가독성', '시각 위계', '접근성'],
  platforms: ['mobile', 'pc'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['퍼즐', '캐주얼', '매치3', '모바일 스테이지형'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'moves', label: '이동 수', type: 'range', min: 3, max: 30, step: 1, default: 12, unit: '수', hint: '스테이지의 이동 수. 줄이면 남은 이동도 그 안으로 맞춘다 (이동 칸 아래 눈금 수가 바뀐다)' },
    { key: 'goalCount', label: '목표 개수', type: 'range', min: 3, max: 30, step: 1, default: 18, unit: '개', hint: '냉각 셀 목표. 회로 조각은 80%, 산소 캔은 60%. 이미 모은 것은 그대로 두고 남은 개수만 다시 계산한다' },
    { key: 'warnAt', label: '이동 경고 기준', type: 'range', min: 0, max: 10, step: 1, default: 5, unit: '수', hint: '남은 이동이 이 값 이하면 색 · 글자 · 맥동으로 알린다 (주황 눈금 = 경고 구간). 0 이면 경고 없음' },
    { key: 'flyMs', label: '날아가는 시간', type: 'range', min: 0, max: 1500, step: 50, default: 650, unit: 'ms', hint: '깨진 자리 → 목표 아이콘. 개수는 도착할 때 준다. 0 이면 깨지는 순간 준다' },
    {
      key: 'starCurve',
      label: '별 임계값',
      type: 'select',
      default: 'standard',
      options: [
        { value: 'standard', label: '보통 (1,000 · 2,500 · 4,000)' },
        { value: 'easy', label: '쉬움 (700 · 1,800 · 3,200)' },
        { value: 'hard', label: '어려움 (2,000 · 3,500 · 4,700)' },
      ],
      hint: '최대 점수 5,000. 마커 위치 = 임계값 / 최대 점수 × 바 너비 — 등간격이 아니다',
    },
    { key: 'deferFail', label: '연쇄가 끝난 뒤 판정', type: 'toggle', default: true, hint: '끄면 나쁜 예: 이동 0 이 되는 순간 실패. 그 이동이 일으킨 연쇄가 목표를 채워도 이미 늦다' },
    { key: 'boosterStock', label: '부스터 보유 수', type: 'range', min: 0, max: 5, step: 1, default: 2, unit: '개', hint: '바꾸면 보유 수를 다시 채운다. 가운데 부스터는 2개 적게 시작해 0개(구매 유도) 상태를 함께 보여 준다' },
    { key: 'showLedger', label: '정산 보기', type: 'toggle', default: false, hint: '목표마다 실제 남은 개수와 날아오는 중인 개수를 작게 적는다 (수업용)' },
  ],
  presets: [
    { id: 'standard', name: '기본 스테이지', look: '이동 12 · 목표 18/14/11 · 경고 5수 · 비행 0.65초', values: { moves: 12, goalCount: 18, warnAt: 5, flyMs: 650, starCurve: 'standard', deferFail: true, boosterStock: 2, showLedger: false } },
    { id: 'last-moves', name: '막판 몇 수', look: '이동 4 · 목표 6 — 처음부터 경고 구간이라 이동 칸이 주황으로 뛴다', values: { moves: 4, goalCount: 6, warnAt: 5, flyMs: 650, starCurve: 'easy', deferFail: true, boosterStock: 1, showLedger: false } },
    { id: 'ledger', name: '정산 보기 (느린 비행)', look: '비행 1.4초 + 실제 · 오는 중 표시. "연쇄 3단" 을 눌러 표시값이 실제값을 따라가는 것을 본다', values: { moves: 12, goalCount: 18, warnAt: 5, flyMs: 1400, starCurve: 'standard', deferFail: true, boosterStock: 2, showLedger: true } },
    { id: 'judge-now', name: '즉시 판정 (나쁜 규칙)', look: '이동 0 즉시 실패. "마지막 이동 + 연쇄" 로 연쇄가 목표를 채우는데도 실패가 먼저 뜨는 것을 본다', values: { moves: 12, goalCount: 18, warnAt: 5, flyMs: 650, starCurve: 'standard', deferFail: false, boosterStock: 2, showLedger: true } },
    { id: 'no-boosters', name: '부스터 소진', look: '세 부스터 모두 0개 — 배지가 "+" 로 바뀌고 버튼이 충전 안내가 된다', values: { moves: 12, goalCount: 18, warnAt: 5, flyMs: 650, starCurve: 'hard', deferFail: true, boosterStock: 0, showLedger: false } },
  ],
  events: [
    { id: 'match', label: '묶음 깨기 (이동 −1)' },
    { id: 'chain', label: '연쇄 3단 (이동 −1)' },
    { id: 'booster', label: '부스터 사용' },
    { id: 'last', label: '마지막 이동 + 연쇄' },
    { id: 'reset', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'moves',
      title: '남은 이동: 끝나기 전에 알린다',
      body: '이동이 **경고 기준 이하**가 되면 칸이 주황으로 바뀌고, 글자가 "남은 이동" → "이동 부족!" 으로 바뀌며 1.2Hz(2수 이하 2Hz)로 뛴다 — 색 · 글자 · 움직임 세 가지라 색을 못 느껴도 안다. 아래 눈금의 주황 칸이 경고 구간이다. 이동이 0 이 되어도 **마지막 연쇄가 끝나고 날아오던 아이콘이 다 도착할 때까지** 판정하지 않는다("연쇄가 끝난 뒤 판정" 을 끄고 "마지막 이동 + 연쇄" 로 비교).',
      principle: '즉각 피드백',
      pin: 'below',
    },
    {
      n: 2,
      part: 'goals',
      title: '목표는 색 + 모양 + 남은 개수',
      body: '냉각 셀은 파란 **육각형**, 회로 조각은 초록 **사각 칩**, 산소 캔은 주황 **캡슐** — 보드의 블록과 같은 그림이다. 목표가 아닌 수리 키트(분홍 **십자**)는 HUD 에 없다. 남은 개수가 0 이 되면 숫자 자리에 체크가 서고 칸이 밝아진다.',
      principle: '가독성',
    },
    {
      n: 3,
      part: 'fly',
      title: '깨진 자리에서 날아가 도착할 때 준다',
      body: '목표 블록이 깨지면 **그 칸에서** 아이콘이 이 목표 칸으로 날아오고(2차 베지어, 블록마다 35ms 간격), **도착할 때** 개수가 하나 준다. 정산 규칙: 실제값은 깨진 순간 줄고 판정은 실제값으로 한다. 표시값은 도착마다 하나씩 실제값을 따라가며 **실제값보다 작아지지 않는다**. 남은 개수보다 많이 깨지면 남은 만큼만 날린다(음수 없음). 다시 시작하거나 효과를 끄면 날던 것을 버리고 표시값 = 실제값. "정산 보기" 프리셋으로 확인한다.',
      principle: '즉각 피드백',
      pin: 'below',
    },
    {
      n: 4,
      part: 'stars',
      title: '별 마커 = 임계값 / 최대 점수',
      body: '별 세 개를 등간격이 아니라 **임계값 / 최대 점수 × 바 너비** 자리에 세운다. 1,000점이면 바의 20%. 바가 마커를 지나면 별이 켜지며 1.45배로 커졌다 돌아온다(0.4초). "별 임계값" 을 바꾸면 마커가 실제 점수 자리로 옮겨 간다 — 등간격으로 두면 "별 하나 남았다" 는 짐작이 틀린다.',
      principle: '시각 위계',
    },
    {
      n: 5,
      part: 'boosters',
      title: '보유 수 배지 · 0개면 구매 유도',
      body: '부스터마다 **남은 개수 배지**를 단다. 0 이 되면 배지가 금색 **+** 로, 아래 글자가 "충전" 으로 바뀌고 테두리가 점선이 된다 — 눌러도 되는 버튼이고 보급 상점으로 안내한다(이 표본은 결제하지 않는다). 버튼을 비활성으로 끄지 않는다: 끄면 패드 · 키보드 선택이 빠진다. 부스터는 이동을 쓰지 않는다. 폭발은 커서(마우스를 올린 칸 · 방향키) 둘레 3×3, 가로 정리는 커서 줄.',
      principle: '어포던스',
    },
  ],
  mistakes: [
    { title: '개수만 조용히 바뀐다', body: '블록이 깨지는 순간 숫자만 줄면, 연쇄로 여러 색이 한꺼번에 깨질 때 **무엇을 몇 개 모았는지** 모른다. 깨진 자리에서 목표로 날아가고, 도착한 목표가 강조되게 한다.' },
    { title: '도착할 때 실제값을 깎는다', body: '"도착하면 줄인다" 를 게임 상태에서 처리하면 판정이 비행 시간만큼 늦어지고, 다시 시작 · 화면 전환 때 날던 아이콘이 사라지면 개수가 영영 맞지 않는다. 실제값은 깨진 순간, **표시값만** 도착할 때 바꾼다.' },
    { title: '경고 없이 이동이 끝난다', body: '이동 수가 다른 숫자와 같은 모양으로 줄다가 0 이 되면 "갑자기 끝났다" 고 느낀다. 경고 구간을 미리 보여 주고, 들어가면 색 · 글자 · 맥동(2Hz 이하)으로 알린다.' },
    { title: '이동 0 즉시 실패', body: '마지막 이동이 일으킨 연쇄가 목표를 채울 수 있다. 0 이 되는 순간 실패 창을 띄우면 연쇄로 모은 것이 버려져 억울하다. **연쇄가 끝나고 비행이 다 도착한 뒤** 판정한다.' },
    { title: '별 마커를 등간격으로', body: '임계값이 1,000 · 2,500 · 4,000 인데 마커를 25 · 50 · 75% 에 두면, 바가 마커를 지났는데 별이 안 켜지거나 그 반대가 된다. 마커 위치도 데이터(임계값 / 최대 점수)에서 계산한다.' },
  ],
  juiceOff:
    '흔한 실수 두 가지. 블록이 깨지면 **날아가는 아이콘 · 목표 강조 없이 개수만 조용히** 바뀌어 무엇을 모았는지 모른다. 남은 이동이 줄어도 **경고 구간 · 색 · 글자 · 맥동이 없어** 0 이 되는 순간 갑자기 끝난다.',
  timings: [
    { event: '블록 깨짐 (작아지며 사라짐)', ms: 220, easing: 'ease-in', note: '권장값' },
    { event: '빈자리 채우기 (낙하)', ms: 280, easing: 'ease-in (t²)', note: '권장값. 끝나면 가로 · 세로 3개 줄을 찾아 연쇄' },
    { event: '목표 아이콘 비행', ms: 650, easing: 'smoothstep · 2차 베지어', note: '권장값. 블록마다 35ms 간격, 도착할 때 개수 −1' },
    { event: '목표 도착 강조', ms: 200, easing: '감쇠 (크기 1.22 → 1)', note: '권장값' },
    { event: '이동 경고 맥동', ms: 830, easing: 'ease-in-out 왕복', note: '1.2Hz, 2수 이하 500ms(2Hz). 2Hz 를 넘기지 않는다' },
    { event: '결과 판정', ms: 0, easing: '—', note: '시간이 아니라 조건: 마지막 연쇄가 끝나고 마지막 아이콘이 도착한 뒤 (성공 · 실패 모두)' },
    { event: '결과 창 입력 잠금', ms: 300, easing: '—', note: '권장값. 창이 뜬 뒤 이 안에 누른 확정 입력 · Enter 자동 반복은 버린다 (누른 시각으로 판정)' },
  ],
  unity: {
    ugui: {
      hierarchy: `Main Camera (보드를 찍는 월드 카메라 · URP Base — Stack 에 UI Camera)
UI Camera (URP Overlay 카메라 · Culling Mask UI)
Board (Match3HudDemo.cs — 시험용 보드: 7×7 칸 자리 · 키 입력)
Canvas_HUD (Screen Space - Camera · Render Camera = UI Camera · Canvas Scaler 1080×1920, Match 0.5)
├─ TopBand (Image — 노치 뒤까지 칠하는 윗줄 띠라 SafeArea 밖)
└─ SafeArea (GoalHud.cs 가 Screen.safeArea 로 앵커를 맞춘다)
   ├─ Moves (Image · Pulse > Count TMP · Label TMP)
   ├─ GoalRow (HorizontalLayoutGroup — GoalSlot 프리팹: Icon · Count · Check)
   ├─ Score (Score TMP · Bar > Fill(Image Filled · Horizontal) · Markers — StarMarker 프리팹: Star · Label)
   ├─ BoosterRow (HorizontalLayoutGroup — BoosterButton 프리팹: Icon · Name · Badge > Count · Plus)
   ├─ Result (CanvasGroup · Title · Detail · RetryButton)
   └─ FlyLayer (GoalFlyer.cs · Raycast Target 끈 Image 프리팹 풀)
EventSystem (InputSystemUIInputModule)
LevelDefinition.cs — LevelDefinition(ScriptableObject) · GoalLedger(정산) · StageState(판정) · IGoalHud`,
      steps: [
        '`Create > UI Gallery > Match3 Goal HUD > Level` 로 레벨 에셋을 만들고 이동 수 · 목표(종류 · 개수 · 아이콘) · 별 임계값 · 부스터를 채운다. HUD 는 이 에셋만 보고 목표 칸 · 별 마커 · 부스터 버튼을 **만든다** — 레벨마다 HUD 프리팹을 고치지 않는다.',
        'Canvas 를 **Screen Space - Camera** 로 두고 Canvas Scaler 를 `Scale With Screen Size`, 1080×1920, Match 0.5 로. `SafeArea` RectTransform 을 GoalHud 에 연결하면 `Screen.safeArea` 를 화면 크기로 나눠 앵커에 넣는다(노치 · 홈 표시줄). 화면 끝까지 칠할 띠만 SafeArea 밖에 두고, 화면 전체 배경은 두지 않는다(보드가 보여야 한다).',
        '별 마커는 `anchorMin.x = anchorMax.x = 임계값 / maxScore` 로 세운다 — 바 너비가 바뀌어도 같은 비율 자리. 픽셀로 계산하려면 `bar.rect.width × 비율`.',
        '깨진 블록: 보드가 `state.Find(type).Collect(n)` 으로 **실제값을 먼저** 줄이고, 돌려받은 개수만큼 `hud.Fly(type, 칸의 월드 위치, 지연)` 을 부른다. GoalFlyer 가 `RectTransformUtility.WorldToScreenPoint(보드 카메라, 월드)` → `ScreenPointToLocalPointInRectangle(FlyLayer, 화면, Canvas 카메라)` 로 바꿔 베지어로 날리고, 도착하면 `GoalLedger.Land()` 로 표시값을 하나 줄인다.',
        '판정은 보드가 매 프레임 `state.Judge(hud.FlyingCount)` 로: 연쇄 중(`Settled == false`)이거나 날아오는 것이 있으면 성공도 실패도 내지 않는다. 결과 창이 열리면 `SetSelectedGameObject(RetryButton)`, 닫으면 전에 고른 것으로 돌려준다. 창을 연 시각을 적어 두고 0.3초 안에 누른 다시 하기는 버린다(입력 잠금 — 마지막 연쇄 중 연타한 Submit 이 바로 다시 시작하지 않게).',
      ],
      pitfalls: [
        'Canvas 가 Screen Space - Camera 인데 `ScreenPointToLocalPointInRectangle` 에 카메라를 `null` 로 넘기면 아이콘이 엉뚱한 곳에서 출발한다. Overlay 일 때만 `null`, 아니면 `canvas.worldCamera`. 월드 → 화면은 **보드 카메라**로 (UI 카메라와 다를 수 있다).',
        '날던 아이콘을 코루틴으로 돌리면 HUD 가 꺼질 때 멈춘 채 남는다. GoalFlyer 는 `Update` 한 곳에서 목록을 돌리고, `OnDisable` 에서 아이콘을 풀로 돌려주며 남은 것을 도착 처리한다(표시값이 실제값보다 큰 채로 남지 않게).',
        '0개 부스터를 `interactable = false` 로 끄면 선택돼 있던 버튼에서 선택이 빠져 패드로 못 움직인다. 끄지 말고 "충전" 상태로 바꿔 상점으로 안내한다.',
        '경고 맥동 · 비행은 `Time.unscaledTime` 으로 돌린다 — 배속 · 슬로모션으로 `Time.timeScale` 을 바꿔도 맥동이 2Hz 를 넘지 않고, 판정이 기다리는 비행이 늘어지지 않는다. (결과 창이 뜨면 경고는 꺼지니 결과 창의 timeScale 과는 상관없다.)',
        '다시 시작할 때 옛 목표 칸을 지우기만 하면 남은 비행이 도착하며 지워진 TMP 를 건드린다(MissingReferenceException). `Bind` 에서 `GoalFlyer.CancelAll()` 로 콜백 없이 풀에 돌려주고, 도착점은 매 프레임 목표 아이콘에서 다시 읽는다(새 칸은 레이아웃 전이고, 회전 · 안전 영역이 바뀌면 자리가 옮겨 간다).',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size · 1080×1920 · Match 0.5)
└─ Match3Hud.uxml
   ├─ #safe (.safe — C# 가 padding 으로 안전 영역을 맞춘다)
   │  ├─ #moves (.moves · #moves-label · #moves-count)
   │  ├─ #goals (C# 가 레벨 정의로 .goal 칸을 만든다)
   │  ├─ #score-bar (.score__bar · #score-fill · #markers — 별은 left: 임계값 %)
   │  ├─ #board-space (보드는 월드에 있다 — 비운 자리, picking-mode Ignore)
   │  └─ #boosters (C# 가 .booster 버튼을 만든다)
   ├─ #fly-layer (picking-mode Ignore — 날아가는 아이콘 풀)
   └─ #result (display none ↔ .result--open)
Match3HudUITK.cs (레벨 정의 · 정산 · 판정은 UGUI 폴더 LevelDefinition.cs)`,
      steps: [
        '**Panel Settings** 를 `Scale With Screen Size`, 1080×1920, Match 0.5 로. 안전 영역은 `Screen.safeArea` 를 `RuntimePanelUtils.ScreenToPanel` 로 패널 좌표로 바꿔 `#safe` 의 padding 에 넣는다. 화면 좌표는 원점이 **왼쪽 아래**, 패널은 **왼쪽 위**라 y 를 `Screen.height − y` 로 뒤집는다.',
        '목표 칸 · 별 마커 · 부스터 버튼은 `Bind(state)` 에서 레벨 정의를 읽어 만든다. 별 마커는 `style.left = Length.Percent(임계값 / maxScore × 100)` + USS `translate: -50% 0`.',
        '날아가는 아이콘의 출발점은 `RuntimePanelUtils.CameraTransformWorldToPanel(panel, 월드 위치, 보드 카메라)`, 도착점은 `flyLayer.WorldToLocal(아이콘.worldBound.center)`. 두 점을 매 프레임 다시 읽어(새 칸의 레이아웃 · 회전 뒤에도 맞게) `style.translate` 로 베지어를 따라 옮긴다.',
        '결과 창은 `display` 로 켜고, 다음 프레임(`StartingIn(16)`)에 보이기 클래스를 붙여 USS transition 을 돌리며 다시 하기 버튼에 `Focus()`. 닫으면 열기 전 포커스로 돌려준다. 연 시각을 적어 두고, 다시 하기를 누른 시각(포인터는 `PointerDownEvent`)이 0.3초 안이면 버린다(입력 잠금).',
      ],
      pitfalls: [
        '`pickingMode` 는 자식에게 상속되지 않는다. 숨은 결과 창을 opacity 0 으로만 두면 아래 부스터 클릭을 막는다 — `display: none` 으로 끈다.',
        '막 `display` 를 켠 요소에 같은 프레임에 보이기 클래스를 붙이면 transition 이 돌지 않는다. `schedule.Execute(...).StartingIn(16)` 뒤에 붙인다.',
        '점수 바 채움은 `width` 퍼센트로. `width` 는 padding · border 를 포함하니 채움 요소에는 padding 을 두지 않는다. 숫자는 `ToString("N0", CultureInfo.InvariantCulture)` 처럼 문화권과 무관하게.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '냉각 셀 · 회로 조각 · 산소 캔 · 수리 키트 블록 그림, HUD 배치, 비행 경로와 정산 규칙, 경고 구간 눈금, 별 임계값 예시, 부스터 세 가지는 모두 이 갤러리에서 새로 만들었다. 후보 카드가 대표 사례로 든 게임들의 화면은 카드의 출처(고객 지원 문서 · 튜토리얼 · 디자인 시안)로 확인하지 못해(미확인) 빌린 시각 요소가 없고, 장르 관례로만 다뤘다. 보드는 HUD 를 움직이기 위한 최소한의 격자다 — 같은 자원 2개 이상 묶음을 누르면 깨지고, 빈자리를 채운 뒤 가로 · 세로 3개 줄이 생기면 연쇄한다.',
  references: [
    { label: 'raywenderlich — How to Make a Match 3 Game in Unity (후보 카드 출처, 튜토리얼)', url: 'https://www.raywenderlich.com/673-how-to-make-a-match-3-game-in-unity/page/4' },
    { label: 'Awem 고객 지원 문서 (후보 카드 출처)', url: 'https://support.awem.com/hc/en-gb/articles/205773352' },
    { label: 'Freelancehunt — UI/UX for mobile game (후보 카드 출처, 디자인 시안)', url: 'https://freelancehunt.com/en/showcase/work/ui-ux-for-mobile-game-three/1966246.html' },
    { label: 'Unity 6.3 — Screen.safeArea', url: 'https://docs.unity.com/en-us/engine/6000.3/script-reference/unityengine/screen/safearea' },
  ],
  related: [
    { id: 'currency-bar-shop', why: '같은 비행 원리(베지어 · 도착하면 숫자 변화 · 날아오는 중 정산)를 재화 바에서. 0개 부스터의 "충전" 이 안내하는 곳' },
    { id: 'virtual-joystick-touch-layout', why: '모바일 세로 화면의 안전 영역과 엄지 닿는 곳 — 부스터 줄을 아래에 두는 이유' },
    { id: 'health-bar-trail', why: '이동 경고와 같은 문법(경고 구간 표시 · 2Hz 이하 맥동)을 체력 바에서' },
  ],
}
