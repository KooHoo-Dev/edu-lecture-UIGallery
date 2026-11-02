import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'gacha-reveal-odds',
  title: '뽑기 연출 + 확률표 · 천장',
  titleEn: 'Gacha Reveal, Odds Table & Pity',
  group: 'E',
  order: 6,
  paradigms: ['menu', 'meta'],
  oneLiner: '확률표 · 천장 문장 · 추첨이 표 하나를 함께 읽고, 결과는 서버가 먼저 정한다. 연출은 등급 예고 → 한 장씩 공개, 언제든 건너뛴다',
  goals: [
    '확률 테이블 **하나**를 추첨기와 확률표 UI 가 함께 읽게 만들어, 표시와 실제가 어긋날 수 없는 구조를 설명할 수 있다',
    '결과를 **서버 응답으로 먼저 받고** 연출은 그것을 보여 주기만 하는 흐름(요청 → 응답 → 예고 → 공개)을 만들 수 있다',
    '등급 예고와 항목 공개를 분리한 2단계 연출에 **건너뛰기 · 탭 한 번 = 한 장 · 결과 직후 입력 잠금**을 붙일 수 있다',
    '천장(보장) 규칙을 남은 횟수 카운터와 확률표 문장으로 공개하고, 천장을 포함한 **종합 확률**을 계산할 수 있다',
  ],
  principles: ['가독성', '일관성', '즉각 피드백', '접근성', '시각 위계'],
  platforms: ['mobile', 'pc'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['수집형 RPG', '모바일 RPG', '라이브 서비스'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'heroRatePct', label: '영웅 등급 확률', type: 'range', min: 0.5, max: 10, step: 0.5, default: 2, unit: '%', hint: '표 하나의 값만 바꾼다 — 확률표 숫자 · 천장 포함 종합 확률 · 실제 추첨이 함께 바뀐다. 희귀는 13% 고정, 일반이 나머지' },
    { key: 'pityCount', label: '천장 횟수', type: 'range', min: 10, max: 200, step: 10, default: 80, unit: '회', hint: '보장형: 영웅 없이 (n − 1)회면 다음 1회 확정. 교환형: 포인트 n점이면 교환. 카운터 · 확률표 문장 · 종합 확률이 이 값에서 만들어진다' },
    {
      key: 'pityMode',
      label: '천장 방식',
      type: 'select',
      options: [
        { value: 'guarantee', label: '보장형 (n회 안에 확정)' },
        { value: 'exchange', label: '교환형 (포인트 n점)' },
      ],
      default: 'guarantee',
      hint: '보장형은 추첨 자체를 바꾸므로 종합 확률이 기본 확률보다 높다. 교환형은 추첨은 그대로 두고 포인트로 바꿔 준다',
    },
    { key: 'teaseMs', label: '등급 예고 시간', type: 'range', min: 0, max: 2000, step: 100, default: 900, unit: 'ms', hint: '1단계 — 가장 높은 등급을 색 · 모양 · 글자로 먼저 알리는 시간. 0 이면 바로 카드로. 탭하면 바로 넘어간다' },
    { key: 'flipMs', label: '카드 공개 간격', type: 'range', min: 150, max: 900, step: 30, default: 420, unit: 'ms', hint: '2단계 — 한 장씩 뒤집는 간격. 영웅은 0.7초 더 머문다. 탭 · Enter 로 바로 다음 장' },
    { key: 'inputLockMs', label: '결과 직후 입력 잠금', type: 'range', min: 0, max: 800, step: 50, default: 400, unit: 'ms', hint: '결과가 열린 직후 "뽑기" 버튼을 막는 시간. 카드를 넘기던 연타가 다음 뽑기로 관통하지 않게. "연타" 이벤트로 비교' },
  ],
  presets: [
    {
      id: 'guarantee',
      name: '보장형 천장',
      look: '영웅 2% · 80회 안에 확정 — 확률표에 천장 포함 종합 확률을 함께',
      values: { heroRatePct: 2, pityCount: 80, pityMode: 'guarantee', teaseMs: 900, flipMs: 420, inputLockMs: 400 },
    },
    {
      id: 'exchange',
      name: '교환 포인트형',
      look: '영웅 3% · 100점이면 원하는 영웅과 교환 — 추첨은 그대로, 카운터는 포인트',
      values: { heroRatePct: 3, pityCount: 100, pityMode: 'exchange', teaseMs: 900, flipMs: 420, inputLockMs: 400 },
    },
    {
      id: 'quick-repeat',
      name: '빠른 반복',
      look: '예고 0.3초 · 0.18초 간격 — 여러 번 뽑는 사람을 위한 짧은 연출',
      values: { heroRatePct: 2, pityCount: 80, pityMode: 'guarantee', teaseMs: 300, flipMs: 180, inputLockMs: 300 },
    },
    {
      id: 'low-pity',
      name: '낮은 천장 (수업 확인용)',
      look: '영웅 1% · 30회 천장 — 첫 10회부터 "천장 확정" 카드가 나온다',
      values: { heroRatePct: 1, pityCount: 30, pityMode: 'guarantee', teaseMs: 1200, flipMs: 600, inputLockMs: 400 },
    },
  ],
  events: [
    { id: 'pull-1', label: '1회 뽑기' },
    { id: 'pull-10', label: '10회 뽑기' },
    { id: 'skip', label: '건너뛰기' },
    { id: 'mash', label: '공개 중 연타' },
    { id: 'reconnect', label: '공개 중 재접속' },
    { id: 'simulate', label: '1,000회 시뮬레이션' },
    { id: 'reset', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'odds',
      title: '확률표는 추첨기와 같은 표에서',
      body: '등급별 · 항목별 확률, 천장 문장, 천장 포함 종합 확률을 모두 `GACHA_TABLE`(항목마다 정수 가중치, 합 100,000) 하나에서 **계산해서** 그린다. 숫자를 손으로 적은 표는 운영 중 가중치가 바뀌어도 그대로 남는다. 시뮬레이션 막대는 천장을 포함한 **기대** 비율과 실제를 비교하고, 정직한 표에서 잘못 경고하지 않게 우연일 확률이 0.001% 미만일 때만 경고한다(여러 줄을 한꺼번에 보는 다중 비교라서). 효과를 끄면 표시용 `ODDS_TEXT` 와 추첨용 `DROP_WEIGHTS` 가 따로 있다 — "1,000회 시뮬레이션" 을 두세 번 누르면 영웅이 표시보다 훨씬 적고 한 항목은 0회라는 경고가 뜬다.',
      principle: '일관성',
      pin: 'left',
    },
    {
      n: 2,
      part: 'server',
      title: '결과는 서버가 먼저, 연출은 나중',
      body: '뽑기를 누르면 요청을 보내고, 응답으로 **결과 10개와 천장 상태가 확정**된 뒤에야 연출이 시작된다. 연출 도중 연결이 끊겨도 재접속하면 같은 결과로 이어진다("공개 중 재접속"). 효과를 끄면 카드를 뒤집는 순간 기기에서 추첨해, 재접속하면 본 카드가 사라지고 다른 결과가 나온다 — 되감기로 결과를 고르는 악용과 기록 불일치.',
      principle: '일관성',
      pin: 'right',
    },
    {
      n: 3,
      part: 'tease',
      title: '등급 예고 → 한 장씩 공개',
      body: '1단계는 가장 높은 등급을 **색 + 모양(별 · 마름모 · 원) + 글자**로 알리고, 2단계는 엎어진 카드 뒷면에 등급을 보인 채 한 장씩 뒤집는다. 영웅은 짧게 강조하고 0.7초 더 머문다(번쩍임은 초당 3회 제한). 예고는 이미 정해진 결과에서 만들므로 거짓이 없다. 효과를 끄면 결과를 모르는 채 "영웅 신호" 를 띄워 기대를 부풀리고, 마지막 장을 금빛으로 떨다 낮은 등급으로 바꾼다.',
      principle: '시각 위계',
    },
    {
      n: 4,
      part: 'skip',
      title: '건너뛰기 · 탭 한 장 · 결과 직후 잠금',
      body: '연출 중에는 언제든 **건너뛰기**(Esc)로 남은 카드를 한 번에 뒤집고 결과 목록으로 간다. 탭 · Enter 한 번은 카드 한 장(입력 소비). 결과가 열린 직후 400ms 는 뽑기 버튼을 막아(`createInputLock`, 누른 시각으로 판정) 넘기던 연타가 다음 10회로 관통하지 않는다. 효과를 끄면 건너뛰기도 잠금도 없다.',
      principle: '접근성',
      pin: 'left',
    },
    {
      n: 5,
      part: 'pity',
      title: '천장까지 남은 횟수',
      body: '보장형은 "영웅 확정까지 n회" 와 진행 막대, 교환형은 "교환 포인트 n / 100" 과 교환 버튼. 카운터와 서버 로그의 결과 내용은 공개를 다 보여 준 **뒤에** 갱신해 결과를 미리 알려 주지 않는다. 효과를 끄면 카운터가 없어 천장이 있는지조차 알 수 없다.',
      principle: '즉각 피드백',
    },
  ],
  mistakes: [
    { title: '표시용 표와 추첨용 표를 따로 둔다', body: '확률표 문구를 손으로 적고 추첨은 다른 가중치를 읽으면, 운영 중 한쪽만 바뀌어 표시가 거짓이 된다. 국내에서는 2024년 1월 공정위가 넥슨에 인기 옵션 확률을 낮추거나 0%로 두고 알리지 않은 행위로 과징금 약 116억 원을 부과했다(넥슨이 취소 소송 중 — 2026년 하반기 보도 기준 서울고법 선고가 여러 차례 연기되어 계류). 표는 하나, 화면 문장은 그 표에서 생성.' },
    { title: '클라이언트에서 추첨한다', body: '연출 중에 기기에서 난수를 굴리면 앱을 끄고 다시 켜는 것만으로 결과를 다시 고를 수 있고, 서버 기록과 화면이 어긋난다. 결과는 서버가 정해 응답으로 내려보내고, 클라이언트는 받은 결과를 보여 주기만 한다.' },
    { title: '건너뛰기가 없다', body: '같은 연출을 수십 번 보게 하면 피로하고, 움직임에 민감한 사람에게는 접근성 문제다. 남은 연출을 한 번에 끝내는 건너뛰기와 결과 목록은 필수.' },
    { title: '결과와 무관한 예고 · 아깝게 놓친 연출', body: '결과를 모르는 채 높은 등급 빛을 띄우거나, 높은 등급처럼 보이다 낮은 등급으로 바뀌는 연출은 "거의 됐다" 는 착각을 준다. 도박 연구에서는 아깝게 놓친 결과(near-miss)가 이긴 것이 아닌데도 계속하고 싶은 마음을 키웠다(Clark 외, Neuron 2009). 예고는 확정된 결과에서만 만든다.' },
    { title: '결과 직후 입력을 받는다', body: '카드를 넘기려고 연타하던 손가락이 결과 화면의 "다시 10회" 를 그대로 누른다. 결과가 열린 직후 짧게 잠그고, 판정은 처리한 시각이 아니라 누른 시각으로.' },
  ],
  juiceOff:
    '다크패턴을 한꺼번에 재현한다. 확률표는 영웅 2%라고 적지만 추첨은 몰래 바꾼 표(영웅 ×0.3, 오로라 방벽 모듈 0)를 읽는다 — 시뮬레이션을 누르면 차이가 드러난다. 천장 카운터와 천장 문장이 없고 실제로도 천장이 없다. 서버 요청 없이 카드를 뒤집을 때 기기에서 추첨하므로, 재접속하면 본 카드가 사라지고 다른 결과가 나온다(기록에는 이미 들어감). 예고 빛은 결과와 무관하게 절반 가까이 "영웅 신호" 이고, 영웅이 없으면 마지막 장을 금빛으로 떨다 낮은 등급으로 바꾼다. 건너뛰기 · Esc 가 없고, 결과 직후 입력 잠금도 없어 연타가 다음 10회를 눌러 버린다.',
  timings: [
    { event: '서버 응답 대기 (흉내)', ms: 350, easing: '—', note: '모형 값. 실제 지연은 네트워크에 따라 다르므로 연출은 응답을 받은 뒤에 시작' },
    { event: '등급 예고 (1단계)', ms: 900, easing: 'ease-out 등장', note: '권장값. 탭하면 바로 2단계' },
    { event: '카드 깔기 (첫 장 공개까지)', ms: 450, easing: 'ease-out 360ms, 장마다 40ms 차이', note: '권장값' },
    { event: '카드 공개 간격 (2단계)', ms: 420, easing: '뒤집기 = 간격의 80% (최대 420ms)', note: '권장값. 영웅은 +700ms 머문다' },
    { event: '영웅 강조 번쩍임', ms: 300, easing: 'ease-out', note: 'requestFlash() 로 초당 3회 이하. 동작 줄이기 설정이면 생략' },
    { event: '결과 직후 입력 잠금', ms: 400, easing: '—', note: '권장값 (입력 잠금 0.2~0.4초 범위의 위쪽)' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Gacha (Screen Space - Overlay · Canvas Scaler 1920×1080 · Match 0.5)
├─ Stage
│  ├─ Beam (CanvasGroup · Image 등급 모양 · TextMeshProUGUI — 1단계 예고)
│  ├─ Cards (GridLayoutGroup 5열 — 자리만 잡는다, 뒤집기는 카드가 스스로)
│  │  └─ GachaCardView 프리팹 ×10 (GachaCardView.cs)
│  │     ├─ Back (Image 등급 테두리 + Image 모양 + TextMeshProUGUI 등급)
│  │     └─ Face (Image 등급 테두리 · Image 아이콘 · TextMeshProUGUI 이름 · 등급 · ForcedTag)
│  ├─ Flash (Image 전체 · CanvasGroup — 영웅 강조, Raycast Target 끔)
│  ├─ TapCatcher (투명 Image + Button — 연출 중 탭 = 다음 장)
│  └─ SkipButton (Button)
├─ PullButtons
│  ├─ Pull1Button · Pull10Button (Button + PressStamp.cs — 누른 시각 기록)
│  └─ LockBar (Image Filled 하나 — 결과 직후 잠금 진행)
├─ PityCounter (TextMeshProUGUI · Image Filled · ExchangeButton)
├─ ServerLog (TextMeshProUGUI)
├─ OddsPanel (OddsTableView.cs)
│  ├─ Rows (VerticalLayoutGroup) > OddsRow 프리팹 (TextMeshProUGUI 이름 · TextMeshProUGUI 확률)
│  └─ PityRule (TextMeshProUGUI — 천장 문장)
├─ GachaRevealPanel (GachaRevealPanel.cs — 위 참조를 모두 받는다)
└─ GachaDemo (GachaDemo.cs — 시험용 키 입력 · 1,000회 시뮬레이션)
EventSystem (InputSystemUIInputModule — 새 Input System)
GachaTable 에셋 (GachaTable.cs — ScriptableObject) · GachaServer (GachaServer.cs — 일반 C# 클래스, PullResult 포함)`,
      steps: [
        '`GachaTable`(ScriptableObject)에 `heroRatePct` · `rareRatePct` · 항목 목록(이름 · 등급 · 등급 안 몫 `share`) · `pityMode` · `pityCount` 를 둔다. `ItemPercent(i)` · `GradePercent(g)` · `ConsolidatedHeroPercent()` · `PityRuleText()` 가 모두 이 값에서 계산한다. `Validate()` 가 등급 확률 합 · 빈 등급 · 항목 확률 합 100% 를 검사해 `OnValidate` 에서 경고하고, 검사에 실패한 표로는 서버가 추첨하지 않는다(표시와 추첨이 달라지는 표를 막는다).',
        '`GachaServer` 는 서버 흉내다. `IEnumerator Request(table, count, Action<PullResult> done)` 가 지연 뒤 **결과 목록과 천장 상태를 한 번에** 돌려준다. 천장 카운터(`SinceHero` · `Points`)는 `PlayerPrefs` 에 저장한다(실제 게임이면 서버 DB). 정했지만 아직 다 보여 주지 않은 결과는 `Unseen` 에 남고, 공개가 끝나면 `Acknowledge()` 로 지운다.',
        '`OddsTableView.Build(table)` 이 같은 에셋으로 등급 머리줄 · 항목 줄 · 천장 문장을 만든다. 표를 바꾸면 `Build` 를 다시 부른다 — 화면 숫자를 인스펙터에 따로 적지 않는다.',
        '`GachaRevealPanel.Pull(count, pressedAt)` → 버튼을 끄고 `Server.Request` → 응답을 받은 뒤에 `Reveal` 코루틴: 예고(`teaseSeconds`) → 카드 깔기 → `flipSeconds` 간격(뒤집기 시간 포함)으로 `GachaCardView.Flip(초)`(가로 크기 1 → 0 → 1, 간격의 80% · 최대 0.42초). 영웅이면 강조(번쩍임은 1초에 3번 제한) + `heroHoldSeconds` 0.7초 더. 연출 도중 꺼졌다 켜지면 `OnEnable` 이 `Server.Unseen` 을 다시 받아 이어서 보여 준다(새로 뽑지 않는다).',
        '건너뛰기: `Skip()` 이 플래그를 세우고, 코루틴은 매 단계에서 그 플래그를 보고 남은 카드를 `ShowFaceNow()` 로 즉시 뒤집은 뒤 결과로 간다. 탭은 `advance` 플래그로 다음 장을 앞당긴다(한 번에 한 장).',
        '결과가 열리면 그제야 천장 카운터를 갱신하고 `unlockAt = Time.unscaledTime + inputLockSeconds`. 뽑기 버튼마다 붙인 `PressStamp`(`IPointerDownHandler` · `IPointerUpHandler`)가 **누른 시각**을 기록해, 그 시각이 `unlockAt` 보다 이르면 무시한다(손을 뗀 프레임의 클릭에만 그 시각을 쓰고, 키보드 Submit 은 지금 시각). `GachaDemo` 의 F9 는 저장하지 않는 `new GachaServer(false)` 로 1,000회를 돌려 표시 vs 실제를 콘솔에 찍는다.',
      ],
      pitfalls: [
        '확률표 텍스트를 인스펙터나 로컬라이즈 표에 숫자로 따로 적으면, 가중치를 바꿀 때 한쪽만 고쳐져 표시가 거짓이 된다. 문장도 표에서 만든다.',
        '`Random.Range` 로 연출 중에 결과를 정하면 앱을 다시 켜는 것으로 결과를 바꿀 수 있다. 결과는 요청 시점에 서버(여기서는 `GachaServer`)가 정한다.',
        '연출 코루틴을 `OnDisable` 에서 멈추지 않으면 창을 닫았다 열 때 코루틴 두 개가 같은 카드를 뒤집는다. 멈출 때 버튼도 다시 켜고, 이미 정해진 결과는 버리지 말고(`Unseen`) 다시 켰을 때 보여 준다.',
        '번쩍임 제한기처럼 `static` 으로 둔 상태는 Enter Play Mode 에서 도메인 리로드를 끄면 이전 실행 값이 남는다. `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]` 에서 비운다.',
        '`WaitForSeconds` 는 `Time.timeScale = 0` 이면 멈춘다. 일시정지 메뉴 위에서도 돌아야 하는 연출이면 `WaitForSecondsRealtime` 과 `Time.unscaledTime` 을 쓴다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ Gacha.uxml
   └─ #gacha (.gacha)
      ├─ #main (.main)
      │  ├─ #title (.title)
      │  ├─ #stage (.stage)
      │  │  ├─ #beam (.beam > #beam-mark · #beam-label)
      │  │  ├─ #cards (.cards — C# 가 카드 요소를 만들어 넣는다. 카드 클래스 card, 수식 클래스 squash · flipped · hero · rare · common)
      │  │  ├─ #flash (.flash) · #tap (.tap)
      │  │  └─ Button #skip (.skip)
      │  ├─ #pulls (.pulls > Button #pull-1 · Button #pull-10 · #lock > #lock-fill)
      │  ├─ #pity (.pity > #pity-label · #pity-bar > #pity-fill)
      │  └─ #server-log (.server-log)
      └─ #side (.side)
         ├─ Label (.side__title)
         ├─ ListView #odds (.odds — 확률표, 같은 GachaTable 로 makeItem · bindItem)
         └─ #pity-rule (.pity-rule)
GachaUITK.cs (GachaTable · GachaServer 는 UGUI 폴더 것을 쓴다)`,
      steps: [
        '확률표는 `ListView` 하나: `itemsSource` 를 표에서 만든 줄 목록(등급 머리줄 + 항목 번호)으로, `bindItem` 에서 `table.ItemPercent(i)` · `GradePercent` 를 그대로 쓴다. 손으로 적은 숫자가 없다.',
        '뽑기 버튼 → `GachaServer.Request` 코루틴(UGUI 판과 같은 클래스) → 응답을 받은 뒤 `Reveal` 코루틴이 `.beam--on` → 카드 생성 → 한 장씩 `.card--flipped` 를 붙인다. 뒤집기 모양은 USS `transition: scale` 로. 연출 도중 꺼졌다 켜지면 `OnEnable` 이 `server.Unseen` 으로 `Reveal` 을 다시 시작한다.',
        '카드 뒤집기는 `.card--squash`(scale 0 1)를 붙였다 떼며 X 를 1 → 0 → 1 로 transition 하고, 가운데에서 `.card--flipped` 로 뒷면 · 앞면을 바꾼다(UI Toolkit 은 3D 회전이 없다). transition 길이는 C# 가 `style.transitionDuration` 으로 맞춘다(접기 · 펴기 각각 뒤집기 시간의 절반, 공개 간격은 UGUI 판과 같은 `flipSeconds`).',
        '입력 잠금: 버튼에 `PointerDownEvent` · `PointerUpEvent` 를 `TrickleDown` 으로 등록해 누른 시각을 먼저 받고, `clicked` 에서 그 시각이 `unlockAt` 보다 이르면 무시한다. 건너뛰기 · 탭(#tap 의 PointerDownEvent)은 UGUI 판과 같은 플래그. 교환 버튼은 UGUI 판에만 있다.',
      ],
      pitfalls: [
        'USS 에는 `rotateY` 가 없다. `rotate` 는 Z 축 회전만이라 뒤집기는 `scale` X 로 흉내 낸다.',
        '`ListView` 의 `bindItem` 은 줄이 재활용될 때마다 다시 불린다. 줄 요소에 이전 등급 클래스를 남기지 않게 매번 지우고 붙인다.',
        '`schedule.Execute` 로 연출을 짜면 건너뛰기 때 예약을 모두 취소해야 한다. 여기서는 코루틴 하나와 플래그로 단순하게 둔다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Genshin Impact (2020)',
      credit: '© COGNOSPHERE',
      borrowed: [],
      learned: '"정해진 횟수 안에 최고 등급 확정" 형 천장(보장형)을 참고했다. 2차 자료(공략 기사)는 최고 등급 기본 확률 0.6% · 90회 확정을 기록한다. 이 표본의 공식으로는 1.44% 지만 2차 자료가 적는 종합 확률은 1.6% 다 — 실제 게임은 일정 횟수 뒤 확률을 올리는 "소프트 천장" 이 더해져 이 공식보다 높다(세부 수치는 판본마다 달라 미확인). 연출의 색 · 모양은 직접 확인하지 못해 빌리지 않았다.',
      link: 'https://www.rpgsite.net/feature/10312-genshin-impact-wish-system-gacha-rates-banners-and-the-pity-mechanic-explained',
    },
    {
      title: 'Blue Archive (2021)',
      credit: '© NEXON Games · © Yostar',
      borrowed: [],
      learned: '모집할 때마다 포인트가 쌓이고 200점이면 원하는 픽업 학생과 교환하는 "교환형" 천장을 참고했다. 2026년 7월 일본 서버는 이를 "100회 · 200회 확정" 보장형으로 바꿨다(기사 기준). 화면 연출은 미확인.',
      link: 'https://labs.invenglobal.com/articles/24203/blue-archive-details-upcoming-monetization-changes-for-jp-server',
    },
  ],
  original:
    '보급품 12종과 등급 이름 · 모양(별 · 마름모 · 원), 보급 쿠폰, 확률 수치, 예고 · 카드 디자인, 서버 흉내 · 재접속 시연, 시뮬레이션 비교, 다크패턴 재현은 모두 이 갤러리에서 새로 만들었다. 실제 결제 · 가격 · 구매 버튼은 일부러 넣지 않았다 — 이 표본은 뽑기를 권하지 않고, 만든다면 정직하게 만드는 법을 다룬다.',
  references: [
    { label: '아주경제 — 확률형 아이템 정보 표시 의무화 시행령 국무회의 의결, 2024-03-22 시행 (2024-01-02)', url: 'https://www.ajunews.com/view/20240102104711033' },
    { label: '뉴스토마토 — 메이플스토리 큐브 확률 변경 미고지, 공정위 과징금 116억 원 (2024-01-03)', url: 'https://newstomato.com/ReadNews.aspx?no=1214731' },
    { label: '데일리안 — 시행령 개정안: 캡슐형 · 강화형 · 합성형 유형별 표시, 천장제도 표시 대상 (2023-11)', url: 'https://www.dailian.co.kr/news/view/1294309/' },
    { label: 'Fenwick — Apple App Store 3.1.1: 구매 전 항목별 확률 공개 의무 (2017)', url: 'https://www.fenwick.com/insights/publications/apple-now-requires-disclosure-of-loot-box-odds' },
    { label: '머니투데이방송 — 넥슨 과징금 취소 소송 선고 또 연기 (2026-07)', url: 'https://news.mtn.co.kr/news-detail/2026072215222126966' },
    { label: 'Clark 외 (2009) Neuron — 아깝게 놓친 결과가 계속하려는 마음을 키운다', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/' },
    { label: 'Fenwick — Google Play 도 확률 공개 의무화 (2019)', url: 'https://fenwick.com/insights/publications/google-play-now-requires-disclosure-of-loot-box-odds' },
  ],
  related: [
    { id: 'results-reward', why: '보상이 하나씩 등장하는 결과 화면 — 카운트업과 건너뛰기' },
    { id: 'upgrade-draft-choice', why: '입력 잠금을 처음 쓴 곳 — 나타난 직후 연타가 카드를 고르지 않게' },
    { id: 'red-dot-badge-tree', why: '뽑기 · 상점 알림 배지가 사람을 끌어당기는 방식과 그 절제' },
  ],
  flashes: true,
}
