import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'battle-pass-track',
  title: '배틀패스 보상 트랙',
  titleEn: 'Battle Pass Reward Track',
  group: 'E',
  order: 5,
  paradigms: ['menu'],
  oneLiner: '무료 · 프리미엄 두 줄 가로 트랙을 칸 열두어 개로 돌려 보여 준다. 칸은 잠김 → 받을 수 있음 → 받는 중 → 받음을 모양 · 글자로, 트랙은 지금 레벨로 열리고, 시즌 카운트다운은 서버 시각을 따른다',
  goals: [
    '칸 상태를 **저장하지 않고 계산**하는 상태 머신(잠김 → 받을 수 있음 → 받는 중 → 받음)을 만들고, 상태마다 색 + 아이콘 + 글자 + 테두리로 구분할 수 있다',
    '[재활용 스크롤 리스트](#/s/recycled-scroll-list)의 범위 계산을 **가로**로 돌려 레벨 50~100칸을 칸 열두어 개로 보여 주고, 트랙을 열 때 지금 레벨로 스냅할 수 있다',
    '받기를 **서버 확인 뒤 확정**하고(요청 중에는 같은 칸을 다시 보내지 않음), 결과 창에 **입력 잠금**을 걸어 연타가 결과를 건너뛰지 않게 할 수 있다',
    '시즌 카운트다운을 **서버 시각 = 접속 때 받은 서버 시각 + 그 뒤 흐른 시간** 으로 계산해 기기 시계를 바꿔도 흔들리지 않게 하고, 남은 양을 숫자로 정직하게 보일 수 있다',
  ],
  principles: ['가독성', '인지 부하', '즉각 피드백', '일관성', '접근성'],
  platforms: ['mobile', 'pc', 'console'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['배틀로얄', '모바일 대전', '라이브 서비스 전반'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'levelCount', label: '레벨 수', type: 'range', min: 30, max: 100, step: 10, default: 50, unit: '칸', hint: '트랙 길이. 칸이 많아도 만든 칸 수(아래 디버그 줄)는 그대로 — 스크롤바 손잡이가 짧아지고 끝까지 남은 경험치가 는다' },
    { key: 'itemWidth', label: '칸 너비', type: 'range', min: 140, max: 240, step: 10, default: 180, unit: 'px', hint: '레벨 한 칸의 너비. 좁히면 한 화면에 칸이 많아져 필요한 칸(셀) 수가 는다. 위치 = (레벨 − 1) × 너비' },
    { key: 'freeEvery', label: '무료 보상 간격', type: 'range', min: 1, max: 3, step: 1, default: 2, unit: '칸', hint: '무료 줄은 이 간격마다 보상, 사이는 빈칸. 1 이면 매 칸, 3 이면 무료 줄이 듬성듬성해진다' },
    { key: 'premiumOwned', label: '프리미엄 보유', type: 'toggle', default: false, hint: '켜면 프리미엄 줄의 지난 레벨 칸이 모두 "받을 수 있음" 으로 바뀐다(소급). 결제 흐름은 흉내 내지 않는다 — 화면의 시연용 토글과 같다' },
    {
      key: 'clockSource',
      label: '카운트다운 기준 시계',
      type: 'select',
      options: [
        { value: 'server', label: '서버 시각 (바른 방법)' },
        { value: 'device', label: '기기 시계 (흔한 실수)' },
      ],
      default: 'server',
      hint: '"기기 시계" 로 바꾸고 "기기 시계 바꾸기" 를 누르면 카운트다운이 하루씩 줄어든다. 서버 시각이면 그대로',
    },
    { key: 'inputLockMs', label: '결과 창 입력 잠금', type: 'range', min: 0, max: 600, step: 50, default: 300, unit: 'ms', hint: '받은 보상 창이 열린 직후 이 시간 동안 확인 입력을 막는다(누른 시각 기준). 0 이면 "받기 연타" 때 창이 열리자마자 닫힌다' },
    { key: 'dailyXp', label: '하루 획득 경험치', type: 'range', min: 500, max: 6000, step: 250, default: 1500, unit: 'XP', hint: '정직한 안내의 가정값. 늘리면 "시즌 끝 예상 레벨" 깃발이 오른쪽으로 가고, 끝까지 갈 수 있으면 그렇다고 알린다' },
  ],
  presets: [
    {
      id: 'mobile-season',
      name: '모바일 시즌 패스',
      look: '50칸, 무료는 2칸마다, 프리미엄 없음 — 프리미엄 줄이 "패스 필요" 로 잠겨 있다',
      values: { levelCount: 50, itemWidth: 180, freeEvery: 2, premiumOwned: false, clockSource: 'server', inputLockMs: 300, dailyXp: 1500 },
    },
    {
      id: 'premium-owner',
      name: '프리미엄 보유 · 긴 시즌',
      look: '100칸, 무료도 매 칸, 프리미엄 보유 — 받을 칸이 쌓여 "모두 받기" 가 빛난다',
      values: { levelCount: 100, itemWidth: 180, freeEvery: 1, premiumOwned: true, clockSource: 'server', inputLockMs: 300, dailyXp: 2500 },
    },
    {
      id: 'dense-track',
      name: '촘촘한 트랙 (칸 많이 보기)',
      look: '좁은 칸 140px — 한 화면에 열 칸 남짓, 만든 칸 수가 늘어난다',
      values: { levelCount: 100, itemWidth: 140, freeEvery: 3, premiumOwned: false, clockSource: 'server', inputLockMs: 300, dailyXp: 1500 },
    },
    {
      id: 'device-clock',
      name: '기기 시계 카운트다운 (흔한 실수)',
      look: '카운트다운이 기기 시계를 따른다 — "기기 시계 바꾸기" 로 하루씩 줄어든다',
      values: { levelCount: 50, itemWidth: 180, freeEvery: 2, premiumOwned: false, clockSource: 'device', inputLockMs: 300, dailyXp: 1500 },
    },
    {
      id: 'no-lock',
      name: '입력 잠금 없음 (흔한 실수)',
      look: '결과 창 잠금 0ms — "받기 연타" 를 누르면 창이 열리자마자 닫혀 무엇을 받았는지 못 본다',
      values: { levelCount: 50, itemWidth: 180, freeEvery: 2, premiumOwned: true, clockSource: 'server', inputLockMs: 0, dailyXp: 1500 },
    },
  ],
  events: [
    { id: 'gain-xp', label: '경험치 획득 (+700)' },
    { id: 'multi-level', label: '레벨 업 여러 번 (+3,200)' },
    { id: 'claim-all', label: '모두 받기' },
    { id: 'mash-claim', label: '받기 연타' },
    { id: 'device-clock', label: '기기 시계 바꾸기 (+1일)' },
    { id: 'last-day', label: '시즌 마지막 날' },
    { id: 'open-track', label: '트랙 다시 열기' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'state',
      title: '칸 상태는 계산한다 — 모양 · 글자까지',
      body: '칸은 상태를 들고 있지 않다. **레벨 · 받음 기록 · 요청 중 · 프리미엄 보유** 네 입력에서 `tierState()` 가 매번 계산한다: 레벨 미달 = **잠김**(점선 + 자물쇠), 프리미엄 줄인데 패스 없음 = **패스 필요**(점선 보라 + 왕관), 도달 = **받을 수 있음**(금색 테두리 + 느린 맥동 0.8Hz + "받기"), 요청 보냄 = **받는 중**(도는 표시), 서버 확인 = **받음**(흐리게 + 체크). 색을 못 구분해도 아이콘과 글자로 읽힌다. 효과를 끄면 색 칠만 남는다.',
      principle: '가독성',
      pin: 'below',
    },
    {
      n: 2,
      part: 'track',
      title: '가로 가상화 + 지금 레벨로 스냅',
      body: '칸 너비가 모두 같아 위치는 **(레벨 − 1) × 너비**. 스크롤 위치로 보이는 범위를 구해 그 칸에만 셀을 붙인다 — 50칸이든 100칸이든 만든 칸은 열두어 개(아래 디버그 줄). 트랙을 열면 **지금 레벨을 화면 60% 지점에** 두어 왼쪽의 받을 칸과 오른쪽의 다음 보상이 함께 보인다. 효과를 끄면 늘 Lv 1 부터 열려 22칸을 끌어야 한다.',
      principle: '인지 부하',
    },
    {
      n: 3,
      part: 'claimAll',
      title: '모두 받기 → 서버 확인 → 요약 + 입력 잠금',
      body: '받을 수 있는 칸만 모아 **한 번의 요청**으로 보낸다. 보낸 칸은 곧바로 **받는 중** 으로 바뀌어 다시 눌러도 또 보내지 않는다. 서버가 확인하면 받음으로 바꾸고 **같은 종류끼리 묶은 요약 창**을 연다. 창이 열린 뒤 300ms 는 **누른 시각** 기준으로 확인 입력을 막는다(`core/inputLock`). "받기 연타" 로 비교 — 잠금 0 이면 창이 열리자마자 닫힌다.',
      principle: '즉각 피드백',
      pin: 'left',
    },
    {
      n: 4,
      part: 'countdown',
      title: '카운트다운은 서버 시각으로',
      body: '`DateTime.Now`(기기 시계)는 사용자가 바꿀 수 있다. 접속할 때 서버 시각을 한 번 받아 두고, 그 뒤로는 **되돌아가지 않는 시계**(`Time.realtimeSinceStartupAsDouble`)로 흐른 시간만 더한다 — 서버 시각 = 받은 서버 시각 + 흐른 시간. 종료 시각도 UTC 로 받는다. "기기 시계 바꾸기" 를 눌러도 이 카운트다운은 그대로, 조절 값을 "기기 시계" 로 바꾸면 하루씩 줄어든다. 앱이 백그라운드 · 잠자기에서 돌아오면(`OnApplicationPause(false)`) 단조 시계가 그동안 흘렀는지 플랫폼마다 달라 **서버 시각을 다시 받고**, 받기 전이나 시각을 못 읽었을 때는 숫자 대신 "동기화 중". (이 웹 재현의 시계는 갤러리 정지 · 배속을 따르는 모형이다)',
      principle: '일관성',
      pin: 'below',
    },
    {
      n: 5,
      part: 'honest',
      title: '남은 양을 숨기지 않는다',
      body: '끝까지 남은 경험치, 하루 획득량으로 걸리는 날, 시즌 남은 날, 그리고 **이 속도면 시즌 끝에 몇 레벨쯤인지**를 숫자로 보이고 트랙에 "예상 Lv" 깃발을 꽂는다. 받지 않은 보상 수도 알린다. 모두 **추정**이라고 적는다. 효과를 끄면 숫자 대신 "곧 끝납니다! 서두르세요!" 만 남는 **다크 패턴** — 얼마나 남았는지 모른 채 조급함만 준다.',
      principle: '인지 부하',
    },
  ],
  mistakes: [
    { title: '상태를 색으로만', body: '받을 수 있음과 받음이 초록 두 가지로만 다르면 색각 이상 · 밝은 화면 · 작은 폰에서 구분이 안 된다. 아이콘 모양 · 글자 · 테두리(실선/점선)를 함께 바꾼다.' },
    { title: '트랙이 늘 처음 칸부터', body: 'Lv 40 플레이어가 매번 39칸을 끌어야 한다. 열 때 지금 레벨로 스냅하고, 받을 칸이 왼쪽에 남아 있으면 함께 보이게 둔다.' },
    { title: '하나씩만 받기', body: '레벨 여러 개를 한꺼번에 올렸는데 칸마다 눌러 창을 닫게 하면 수십 번을 눌러야 한다. 받을 수 있는 것만 모아 한 번에, 결과는 묶어서 요약한다.' },
    { title: '서버 확인 전에 지갑부터 더하기', body: '누르자마자 보상을 더하고 칸은 그대로 두면 연타가 요청을 여러 번 보낸다. 서버가 중복을 거절해 되돌리면 "두 번 받았다가 사라진" 것처럼 보인다. 보낸 칸은 즉시 "받는 중" 으로 막는다.' },
    { title: '기기 시계로 카운트다운', body: '`DateTime.Now` 로 남은 시간을 계산하면 시계를 돌려 이벤트를 끝내거나 늘릴 수 있고, 시간대가 다르면 표시도 다르다. 서버 UTC + 단조 시계를 쓴다.' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 칸 상태가 색 칠뿐이라(아이콘 · 글자 · 테두리 · 맥동 없음) 받을 수 있는 칸과 받은 칸을 구분하기 어렵다. 트랙은 늘 Lv 1 부터 열리고, "모두 받기" 가 없어 하나씩 눌러야 한다. 받기는 서버 확인 전에 지갑부터 더해 연타하면 지갑의 보상 수가 여러 번 올라갔다가 서버 거절로 되돌아간다(위 오른쪽 숫자 · 떠오르는 +2 / −2). 카운트다운은 조절 값과 상관없이 기기 시계를 따르고, 남은 양 안내 대신 "곧 끝납니다! 서두르세요!" 만 보인다. 경험치 막대는 순간 이동한다.',
  timings: [
    { event: '경험치 막대 채움', ms: 500, easing: 'linear (레벨 하나에)', note: '권장값. 레벨을 넘을 때마다 그 칸이 튀어 오른다. UGUI 판은 생략(값이 바로 바뀐다) — Update 에서 표시값이 이 속도로 따라가게 하면 된다' },
    { event: '새로 열린 칸 강조', ms: 600, easing: 'ease-out', note: '권장값. 위로 8px · 1.06배. UGUI 판은 생략' },
    { event: '받을 수 있음 맥동', ms: 1200, easing: 'ease-in-out', note: '권장값. 한 주기 1.2초 = 약 0.8Hz (2Hz 이하)' },
    { event: '서버 확인 (모형)', ms: 350, easing: '—', note: '이 재현의 가정값. 실제 지연은 망에 따라 다르다' },
    { event: '결과 창 입력 잠금', ms: 300, easing: '—', note: '권장값 (0.2~0.4초). 누른 시각 기준. 웹 재현은 게임 시간으로 재서 정지하면 잠금도 멈춘다(배속 0.25 로 보기 위해)' },
    { event: '트랙 열기 스냅', ms: 500, easing: 'ease-out cubic', note: '권장값. 두 칸 반 앞에서 미끄러져 들어온다' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Pass (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ Header
│  ├─ Title (TextMeshProUGUI)
│  └─ Countdown (TextMeshProUGUI — 남은 시간) · Clocks (TextMeshProUGUI — 서버 · 기기 시각)
├─ XpRow
│  ├─ LevelText (TextMeshProUGUI) · XpFill (Image Filled Horizontal) · XpText (TextMeshProUGUI)
│  └─ PremiumButton (Button — 시연용 토글)
├─ Track (ScrollRect · Horizontal 만 · PassTrack.cs)
│  └─ Viewport (RectMask2D)
│     └─ Content (Canvas + GraphicRaycaster = 서브 Canvas · LayoutGroup 없음)
│        └─ (실행 중 TierColumnView 가 열두어 개 생긴다)
├─ Bottom
│  ├─ Honest (TextMeshProUGUI — 남은 경험치 · 걸리는 날 · 예상 레벨)
│  ├─ ClaimAllButton (Button + TextMeshProUGUI 개수)
│  └─ ToNowButton (Button)
├─ ResultPopup (CanvasGroup · ClaimResultPopup.cs)
│  ├─ Title (TextMeshProUGUI) · Lines (TextMeshProUGUI ×6)
│  ├─ LockFill (Image Filled) · LockText (TextMeshProUGUI)
│  └─ OkButton (Button)
└─ BattlePassDemo (BattlePassDemo.cs — 시험용: 모델 · 서버 지연 흉내 · 시계 · 키 입력)
TierColumnView 프리팹 (TierColumnView.cs · 너비 = itemWidth)
├─ LevelPill (Image + TextMeshProUGUI)
└─ Free · Premium (각각 Button · Frame Image · Icon Image · Name · Count TextMeshProUGUI · StateIcon Image · StateText TextMeshProUGUI · Glow Image)
PassModel.cs (상태 머신 · 보상 표 — 순수 C#) · ServerClock.cs (서버 시각 = 받은 서버 시각 + 흐른 시간 — 순수 C#)`,
      steps: [
        '`PassModel.GetState(level, track)` 이 칸 상태를 계산한다: 보상 없음 → None, 받음 기록 → Claimed, 요청 중 → Claiming, 레벨 미달 → Locked, 프리미엄 줄인데 미보유 → NeedsPremium, 나머지 → Claimable. 칸 뷰는 상태를 저장하지 않는다 — 재활용 셀에 상태를 두면 다른 레벨에 따라붙는다.',
        '`PassTrack` 은 가로 ScrollRect 재활용기다. Content 너비 = count × itemWidth, `onValueChanged` 마다 `-anchoredPosition.x` 로 first · last 를 구하고 범위 밖 칸을 반납 → 새 레벨에 다시 배정, 칸은 `anchoredPosition.x = index × itemWidth` 만 옮긴다. `BindColumn(view, index)` 콜백이 내용을 채운다.',
        '트랙을 열 때 `PassTrack.SnapTo(level)` — 지금 레벨을 화면 60% 지점에 두는 위치로 `StopMovement()` 후 짧게 미끄러진다.',
        '받기: 칸 버튼 → `TierColumnView.Clicked` → `Demo.Claim(TierRef)` → `model.BeginClaim` 이 Claiming 으로 바꾸고(같은 칸 다시 보내지 않음) 코루틴이 서버 지연을 흉내 낸 뒤 `CompleteClaim` → `ClaimResultPopup.Show(model, list)` (요약은 `model.Summarize(list)`). 모두 받기는 `model.Claimables()` 를 한 요청으로.',
        '결과 창은 `Show()` 에서 연 시각을 `Time.realtimeSinceStartupAsDouble` 로 기록하고, 확인 입력의 **누른 시각**(이 예제 전용 InputAction 의 `context.time`)이 `inputLockSeconds` 안이면 무시한다. 버튼 `onClick` 은 손을 뗄 때 불려 누른 시각이 아니므로, 잠금 중에는 버튼 `interactable` 을 꺼 클릭을 아예 받지 않는다.',
        '`ServerClock.Sync(서버 UTC)` 를 접속 때 한 번, 그 뒤 `UtcNow` = 받은 시각 + (`realtimeSinceStartupAsDouble` − 받은 순간). 카운트다운은 `seasonEndUtc − UtcNow`. 비교용으로 `clockSource = Device` 면 `DateTime.UtcNow`(기기 시계)를 쓴다.',
      ],
      pitfalls: [
        '칸 프리팹에 `bool claimed` 를 두면 셀을 돌려쓸 때 다른 레벨이 "받음" 으로 보인다. 상태는 모델, 칸은 `Bind` 에서 모든 표시를 켜고 끄기 둘 다 설정한다.',
        '받기 버튼 리스너를 `Bind` 마다 `AddListener` 하면 재활용될수록 쌓여 한 번 눌러도 여러 번 보낸다. 리스너는 `Awake` 에서 한 번, 레벨은 필드로.',
        '`HorizontalLayoutGroup` + `ContentSizeFitter` 로 100칸을 다 만들면 시작이 느리고, 위치를 레이아웃이 덮어써 재활용이 깨진다.',
        '`DateTime.Now` · `Time.time` 으로 남은 시간을 세지 않는다. 앞은 사용자가 바꾸고, 뒤는 `timeScale` · 일시정지에 멈춘다.',
        '`OnDisable` 에서 서버 지연 코루틴을 멈추지 않으면 꺼진 화면에 결과 창이 뜬다. 요청 중이던 칸은 다시 열 때 서버 상태로 맞춘다.',
        '확인 키 액션에 `UI/Submit` 을 그대로 쓰면 EventSystem 도 같은 Enter 를 처리해 한 번에 "확인 + 다음 칸 받기" 가 된다. 전용 액션을 쓰고, UI 에 선택된 것이 있으면 무시하고, 끌 때는 원래 켜져 있던 액션을 끄지 않는다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ BattlePass.uxml
   └─ #pass-root (.pass)
      ├─ .pass__header (Label #level · 제목 · #cd-label(기준 시계 이름은 C# 가) · #countdown)
      ├─ ScrollView #track (.pass__track · mode Horizontal — C# 가 TierColumn.uxml 을 열두어 개 복제해 넣는다)
      ├─ .pass__actions (Button #claim-all · Button #to-now · Button #gain-xp(시험용 경험치 +700) · Label #debug)
      └─ Label #toast (받은 보상 한 줄 요약)
TierColumn.uxml (.col > #lvl · Button #free · Button #prem — 각 칸은 .slot > .slot__icon · .slot__name · .slot__count · .slot__state > .slot__badge · .slot__text)
BattlePassUITK.cs (PassModel · ServerClock 는 UGUI 폴더 것을 쓴다. 트랙 · 경험치 · 받기 · 카운트다운까지 — 안내 문구 · 결과 모달 창은 UGUI 판)`,
      steps: [
        '**범위**: 이 판은 받은 결과를 모달 창 대신 한 줄 요약(#toast)으로 보여 입력 잠금이 필요 없다. 결과를 모달로 바꾸면 UGUI 판 `ClaimResultPopup` 같은 입력 잠금이 **반드시** 필요하다. 남은 양 안내 문구도 UGUI 판에만 있다.',
        'Unity 6.3 의 `ListView` 는 `BaseVerticalCollectionView` 를 잇는 **세로 전용**이다(`horizontalScrollingEnabled` 는 넓은 항목을 옆으로 굴리는 것일 뿐 가로 배치가 아니다). 그래서 `ScrollView` (mode Horizontal) 에 칸을 직접 재활용한다.',
        '`track.contentContainer.style.width = count × itemWidth`. 칸 요소는 `position: absolute` 로 두고 `style.translate` 로 x 만 옮긴다 — `left` 를 바꾸면 레이아웃을 다시 계산한다.',
        '`track.horizontalScroller.valueChanged` 마다 `Refresh()`: first · last 를 구해 범위 밖 칸을 스택에 반납하고 새 레벨에 다시 배정, `BindSlot` 이 상태 수식 클래스를 `EnableInClassList` 로 켜고 끈다(켜기 · 끄기를 한 번에).',
        '스냅은 첫 `GeometryChangedEvent` 뒤 `track.scrollOffset = new Vector2(x, 0)`. 칸 클릭은 칸을 만들 때 한 번 `clicked` 를 등록하고, 지금 레벨은 `userData` 로 읽는다.',
        '서버 지연 흉내는 `schedule.Execute(…).StartingIn(serverDelayMs)`, 확인 뒤 `PassModel.Summarize()` 를 #toast 한 줄로. 카운트다운은 UGUI 판과 같은 `ServerClock.TryRemaining()`. 받을 수 있음 맥동은 `schedule.Execute(Pulse).Every(500 / pulseHz)` 로 수식 클래스 pulse 를 켜고 끄고 USS `transition` 이 테두리 색을 잇는다(0.8Hz). `OnDisable` 에서 `clicked -=` · 예약 멈춤까지 모두 푼다.',
      ],
      pitfalls: [
        '결과를 모달 창으로 바꾸면서 입력 잠금을 빼면 연타가 창을 열자마자 닫는다 — `ClaimResultPopup` 처럼 누른 시각으로 막는다.',
        '모든 칸을 `ScrollView` 에 넣으면(100칸 × 요소 10여 개) 패널이 커지고 바인딩 비용이 는다. 보이는 칸만.',
        '`clicked += …` 를 바인딩할 때마다 하면 재활용될수록 콜백이 쌓인다. 만들 때 한 번, 레벨은 `userData`.',
        'USS `transition` 으로 칸 위치를 옮기면 스크롤 중에 칸이 늦게 따라와 겹친다. 위치는 즉시, 연출은 상태 클래스에만.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Fortnite (2017)',
      credit: '© Epic Games',
      borrowed: ['무료 줄 옆에 프리미엄 보상을 나란히 보이는 두 줄 배치 (기사 서술 기준, 화면 직접 미확인)'],
      learned: '무료 트랙 옆에 놓친 프리미엄 보상을 함께 보여 구매 동기를 만든다는 분석(Game Developer). 이 표본은 그 배치를 쓰되 프리미엄 줄을 "패스 필요" 로 정직하게 표시하고 결제 흐름은 흉내 내지 않는다.',
      link: 'https://www.gamedeveloper.com/game-platforms/let-s-talk-battle-passes-part-1',
    },
    {
      title: 'Brawl Stars (2018)',
      credit: '© Supercell',
      borrowed: [],
      learned: '무료 · 유료 두 트랙으로 나뉜 패스 구조(위키백과 서술). 화면 배치는 확인하지 못해 빌린 시각 요소는 없다 — 장르 관례로만 다룬다.',
      link: 'https://en.wikipedia.org/wiki/Brawl_Stars',
    },
  ],
  original:
    '패스 이름 · 시즌 설정 · 보상 표(크레딧 · 수리 키트 · 외형 이름), 보상 · 상태 아이콘, 진행 선과 예상 도달 깃발, 정직한 남은 양 안내, 서버 · 기기 시계 비교, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 칸 상태 아이콘(자물쇠 · 느낌표 · 체크)은 Unity 공식 배틀패스 예제 문서가 설명한 구분과 같은 뜻이다.',
  references: [
    { label: 'Game Developer — Let’s Talk Battle Passes, Part 1 (무료 · 프리미엄 트랙과 배치)', url: 'https://www.gamedeveloper.com/game-platforms/let-s-talk-battle-passes-part-1' },
    { label: 'Unity Gaming Services — Battle Pass 예제 (자물쇠 · 느낌표 · 체크, 서버에서 받기 확인)', url: 'https://docs.unity.com/ugs/en-us/solutions/manual/BattlePasses' },
    { label: 'Game Developer — 7 tips to create and improve a battle pass', url: 'https://www.gamedeveloper.com/design/7-tips-to-create-and-improve-battle-pass' },
    { label: 'Unity 6.3 — ListView 스크립트 레퍼런스 (세로 전용 BaseVerticalCollectionView)', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.ListView.html' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/full-list/' },
  ],
  related: [
    { id: 'recycled-scroll-list', why: '같은 core/virtualList 를 세로로 — 셀 풀 지도로 재활용 과정을 자세히 본다' },
    { id: 'upgrade-draft-choice', why: '입력 잠금을 처음 쓴 곳 — 연타가 첫 선택지를 고르는 실수' },
    { id: 'results-reward', why: '받은 보상을 하나씩 공개하는 결과 화면 연출' },
    { id: 'red-dot-badge-tree', why: '"받을 보상 있음" 알림 점을 로비까지 전파하기' },
  ],
}
