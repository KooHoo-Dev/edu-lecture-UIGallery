import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'results-reward',
  title: '결과 · 보상 정산 화면',
  titleEn: 'Sequential Reward Tally & Level-up Spotlight',
  group: 'D',
  order: 2,
  paradigms: ['menu'],
  oneLiner: '보상을 한 줄씩 세워 숫자를 올려 세고, 레벨 업만 따로 무대에 올리며, 입력 한 번은 한 단계만 넘기는 정산 화면',
  goals: [
    '보상 행을 **간격을 두고 하나씩** 등장시켜 한 번에 하나씩 읽히게 하는 이유를 설명할 수 있다',
    '숫자 카운트업을 **고정 시간 + 감속 곡선**으로 만들어 값이 640이든 12,650이든 같은 리듬으로 끝낼 수 있다',
    '스킵을 **입력 소비** 규칙(한 입력 = 현재 단계 즉시 완료, 다음 입력 = 다음 단계)으로 설계하고, 스킵해도 최종 값이 정확히 남게 할 수 있다',
    '레벨 업처럼 동기부여가 큰 정보를 **별도 단계(딤 + 카드)** 로 분리해 시각 위계를 세울 수 있다',
  ],
  principles: ['인지 부하', '시각 위계', '즉각 피드백', '접근성', '몰입'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'gamepad', 'mouse', 'touch'],
  genres: ['JRPG', '턴제 RPG', '로그라이트', '모바일 RPG'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    {
      key: 'tallyMode',
      label: '정산 방식',
      type: 'select',
      default: 'category-pages',
      options: [
        { value: 'category-pages', label: '단계형 (경험치 → 크레딧 → 물자)' },
        { value: 'ledger-lines', label: '원장형 (한 패널에 줄 + 합계)' },
      ],
      hint: '단계형은 종류마다 페이지를 넘긴다. 원장형은 한 패널에 줄이 하나씩 붙고 아래 합계가 그때마다 늘어나 "왜 이만큼 받았는지"가 보인다',
    },
    { key: 'countupMs', label: '카운트업 시간', type: 'range', min: 0, max: 2000, step: 100, default: 900, unit: 'ms', hint: '값 하나가 0에서 목표까지 올라가는 시간. 값의 크기와 상관없이 고정 — "큰 보상 승리"에서도 같은 시간에 끝난다. 0이면 즉시' },
    { key: 'staggerMs', label: '행 등장 간격', type: 'range', min: 0, max: 800, step: 50, default: 250, unit: 'ms', hint: '보상 행이 차례로 들어오는 간격. 0이면 모든 행이 한꺼번에 나와 순차 공개의 효과가 사라진다' },
    {
      key: 'countEasing',
      label: '카운트 곡선',
      type: 'select',
      default: 'easeOutExpo',
      options: [
        { value: 'linear', label: '일정 (linear)' },
        { value: 'easeOutCubic', label: '감속 (easeOutCubic)' },
        { value: 'easeOutExpo', label: '강한 감속 (easeOutExpo)' },
      ],
      hint: '일정하면 기계적으로 똑같이 오르고, 감속 곡선은 빠르게 오르다 목표 근처에서 느려져 "도착"이 느껴진다',
    },
    {
      key: 'skipBehavior',
      label: '스킵 방식',
      type: 'select',
      default: 'finish-step',
      options: [
        { value: 'finish-step', label: '단계별 (현재 단계 완료 → 다음)' },
        { value: 'skip-all', label: '모두 건너뛰기 (레벨 업은 남김)' },
        { value: 'disabled', label: '스킵 불가 (비교용)' },
      ],
      hint: '확인 입력 하나가 무엇을 하는지. 오른쪽 아래 안내 문구와 입력 기록이 함께 바뀐다',
    },
    { key: 'levelupSpotlight', label: '레벨 업 스포트라이트', type: 'toggle', default: true, hint: '끄면 레벨 업이 합계 위 작은 글자로만 표시되어 다른 수치와 위계가 같아진다' },
    { key: 'rankStamp', label: '등급 도장', type: 'toggle', default: false, hint: '정산 마지막에 S·A·B 등급 도장을 찍는 단계를 더한다 (글자 + 테두리 모양으로 구분)' },
    { key: 'autoAdvanceMs', label: '자동 진행 대기', type: 'range', min: 0, max: 3000, step: 250, default: 1000, unit: 'ms', hint: '정산이 끝난 단계가 다음 단계로 저절로 넘어가기까지의 시간. 0이면 끄고 입력을 기다린다(시간 제한 끄기). 레벨 업과 마지막 화면은 항상 입력을 기다린다' },
    { key: 'skewDeg', label: '패널 기울기', type: 'range', min: 0, max: 12, step: 1, default: 6, unit: '°', hint: '패널·행 바탕만 기울이고 글자와 숫자는 반듯하게 둔다 (스타일은 틀에만)' },
    { key: 'accentColor', label: '강조색', type: 'color', default: '#ffb547', hint: '배너 띠, 확정된 값, 합계, 레벨 업 카드, 등급 도장에 쓰는 색' },
  ],
  presets: [
    {
      id: 'stylish-stages',
      name: '스타일리시 단계형 정산',
      look: 'JRPG·턴제 RPG. 사선 패널이 단계마다 바뀌고 레벨 업은 따로 크게 등장한다. 보여 주는 순간이 길지만 단계별 스킵으로 반복 피로를 줄인다',
      values: { tallyMode: 'category-pages', countupMs: 900, staggerMs: 300, countEasing: 'easeOutExpo', skipBehavior: 'finish-step', levelupSpotlight: true, rankStamp: false, autoAdvanceMs: 1250, skewDeg: 8, accentColor: '#ffb547' },
    },
    {
      id: 'minimal-ledger',
      name: '미니멀 원장 합산',
      look: '로그라이트·덱빌딩. 기울기 없는 한 패널에 기본 보상·처치 보너스·남은 시간·저축 이자가 일정한 박자로 붙고 합계가 늘어난다. 계산 과정을 가르치는 정산',
      values: { tallyMode: 'ledger-lines', countupMs: 400, staggerMs: 450, countEasing: 'linear', skipBehavior: 'finish-step', levelupSpotlight: false, rankStamp: false, autoAdvanceMs: 0, skewDeg: 0, accentColor: '#7ee0a1' },
    },
    {
      id: 'quick-session',
      name: '짧은 세션용 빠른 정산',
      look: '모바일·반복 전투. 전체가 1~2초 안에 끝나고 한 번 탭으로 모두 넘어가지만, 레벨 업과 등급은 결과로 남겨 핵심 성취를 놓치지 않게 한다',
      values: { tallyMode: 'ledger-lines', countupMs: 300, staggerMs: 100, countEasing: 'easeOutCubic', skipBehavior: 'skip-all', levelupSpotlight: true, rankStamp: true, autoAdvanceMs: 500, skewDeg: 3, accentColor: '#5ad1ff' },
    },
  ],
  events: [
    { id: 'victory-normal', label: '일반 승리' },
    { id: 'victory-levelup', label: '레벨 업 포함 승리' },
    { id: 'victory-big', label: '큰 보상 승리 (12,650)' },
    { id: 'confirm', label: '확인 입력 1회' },
    { id: 'mash', label: '연타하던 중 승리 (입력 4회)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'reward-row',
      title: '한 번에 하나씩 읽힌다',
      body: '경험치·크레딧·물자를 한꺼번에 띄우면 눈이 어디부터 볼지 헤맨다. 행을 **일정한 간격으로 하나씩** 들여보내고 값은 0에서 올려 세우면 시선이 위에서 아래로 따라가고, 보상마다 짧은 "자기 순간"이 생긴다. `행 등장 간격`을 0으로 바꿔 비교해 보자.',
      principle: '인지 부하',
    },
    {
      n: 2,
      part: 'levelup-spotlight',
      title: '성장은 따로 무대에 세운다',
      body: '레벨 업은 크레딧 몇 개보다 동기부여가 훨씬 크다. 경험치 바가 넘치는 순간 파티 카드에 표시하고, 정산이 끝나면 **화면을 어둡게 한 별도 단계**에 카드로 올려 다른 수치와 층위를 나눈다. 이 단계는 자동으로 넘어가지 않는다 — 입력을 받아야만 닫힌다.',
      principle: '시각 위계',
    },
    {
      n: 3,
      part: 'total-line',
      title: '숫자가 오르는 동안 "이유"가 보인다',
      body: '행이 하나 들어올 때마다 합계가 새 누적값을 향해 다시 오르고, 행 값이 확정되면 합계가 한 번 맥동한다. 원장형으로 바꾸면 기본 보상 + 처치 보너스 + 남은 시간 + 이자가 한 패널에 쌓여 **무엇을 잘해서 더 받았는지** 배우고 다음 판에 반영한다.',
      principle: '즉각 피드백',
    },
    {
      n: 4,
      part: 'prompt-hint',
      title: '입력 하나는 한 단계만',
      body: '**입력 소비** — 연출 중 확인을 누르면 **현재 단계만** 즉시 끝내고(값은 정확한 최종값), 다음 입력이 다음 단계로 간다. 안내 문구가 "이 단계 완료 → 다음 · 크레딧"으로 바뀌어 다음 입력이 무엇을 할지 미리 알려 준다. 결과 화면 진입 직후 **0.3초 입력 잠금**은 전투 중 연타가 결과를 날리지 않게 한다. "연타하던 중 승리"를 효과 켜기·끄기로 비교해 보자.',
      principle: '접근성',
    },
    {
      n: 5,
      part: 'victory-banner',
      title: '마무리를 각인시키되 길이는 아낀다',
      body: '크게 튀어나왔다 자리 잡는 배너가 전투의 끝을 선언해 결과 화면을 행정 절차가 아닌 클라이맥스로 만든다. 하지만 전투가 잦을수록 같은 연출은 피로가 된다. 시간은 **배너·레벨 업처럼 인상이 큰 순간에만** 쓰고, 나머지는 자동 진행과 스킵으로 짧게 끝낸다.',
      principle: '몰입',
    },
  ],
  mistakes: [
    { title: '단위당 속도로 카운트업', body: '"프레임마다 18씩 증가"로 만들면 640은 0.6초, 12,650은 12초가 걸린다. 항상 **고정 시간** 동안 보간하고 정수로 반올림해 표시한다. 효과를 끄고 "큰 보상 승리"를 눌러 보자.' },
    { title: '한 입력이 여러 단계를 관통', body: '스킵 처리와 닫기 처리가 같은 입력을 각각 받거나, `wasPressedThisFrame` 대신 `isPressed`(누르고 있는 동안 매 프레임 참)를 쓰면 한 번 눌렀는데 레벨 업·크레딧까지 줄줄이 넘어간다. 입력은 **한 곳에서 한 번만** 소비한다.' },
    { title: '스킵하면 값이 틀어짐', body: '코루틴만 멈추고 최종 값을 대입하지 않으면 1,237에서 멈춘다. 스킵은 "멈추기"가 아니라 **모든 행·합계·경험치 바를 목표값으로 확정**하는 함수로 만든다.' },
    { title: '전투 연타가 결과를 날림', body: '공격 버튼을 연타하던 입력이 그대로 들어가 결과·레벨 업을 못 보고 지나간다. 진입 직후 0.2~0.3초 **입력 잠금**을 두고, 잠금 중 입력은 버린다.' },
    { title: '숫자 폭이 출렁임', body: '비례폭 숫자는 1과 8의 폭이 달라 카운트 중 라벨이 좌우로 떨린다. 고정폭 숫자(`tabular-nums`, TMP `<mspace>`)와 오른쪽 정렬을 쓴다.' },
  ],
  juiceOff:
    '배너 모션·순차 등장·레벨 업 카드 없이 경험치·크레딧·레벨 업 문구·물자가 **같은 크기의 회색 목록**으로 한꺼번에 뜬다. 내역 없이 합계만 있어 왜 그만큼 받았는지 알 수 없고, 숫자는 **단위당 속도**로 올라 큰 보상은 한참 걸린다. 입력 잠금이 없어 "연타하던 중 승리"는 결과가 뜨자마자 닫히고, 카운트 중 확인 한 번이 숫자 완성과 닫기를 **함께 처리(관통)** 해 결과를 못 보고 지나간다.',
  timings: [
    { event: '승리 배너 등장', ms: 450, easing: 'easeOutBack (1.6 → 1.0)', note: '권장값. 살짝 넘쳤다 돌아오는 overshoot' },
    { event: '정산 패널 밀려 들어옴', ms: 300, easing: 'easeOutCubic', note: '권장값. 배너 뒤에 140px 이동 + 페이드' },
    { event: '보상 행 등장 간격', ms: 250, easing: '—', note: '권장값(staggerMs). 각 행은 200ms 동안 48px 이동 + 페이드' },
    { event: '숫자 카운트업', ms: 900, easing: 'easeOutExpo', note: '권장값. 값 크기와 무관한 고정 시간' },
    { event: '합계 확정 맥동', ms: 150, easing: 'sin (1 → 1.12 → 1)', note: '권장값. 행 값이 확정될 때마다 1회' },
    { event: '완료 단계 → 다음 단계 자동 진행', ms: 1000, easing: '—', note: '권장값. 0으로 끌 수 있어야 한다(시간 제한). 레벨 업·마지막 화면은 자동 진행 없음' },
    { event: '레벨 업 스포트라이트', ms: 600, easing: '딤 200ms → 카드 easeOutBack 400ms', note: '권장값. 입력 전까지 유지' },
    { event: '등급 도장', ms: 350, easing: 'easeInQuad (2.0 → 1.0)', note: '권장값. "찍히는" 가속 곡선 뒤 도장만 맥동 1회' },
    { event: '진입 직후 입력 잠금', ms: 300, easing: '—', note: '권장값. 전투 중 연타가 결과를 날리지 않게' },
    { event: '결과 화면 닫기', ms: 250, easing: 'easeIn (아래로 + 페이드)', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `ResultsCanvas (Canvas · CanvasScaler 1920×1080 · GraphicRaycaster)
├─ Results (ResultsSequence.cs · ResultsDemo.cs)
│  ├─ Root (CanvasGroup) ← 닫기 페이드
│  │  ├─ VictoryBanner (RectTransform · CanvasGroup)
│  │  │  ├─ Slash (Image + SkewEffect)
│  │  │  ├─ Word (TextMeshProUGUI "승리")
│  │  │  └─ Mission (TextMeshProUGUI)
│  │  ├─ Party (VerticalLayoutGroup)
│  │  │  └─ MemberCard × 3 (MemberCard.cs)
│  │  │     ├─ Plate (Image + SkewEffect)
│  │  │     ├─ Name · Level · Exp · Gain (TextMeshProUGUI)
│  │  │     ├─ ExpBar > Fill (Image · Type: Filled · Horizontal)
│  │  │     └─ LevelUpChip (GameObject, 기본 꺼짐)
│  │  ├─ TallyPanel (RectTransform · CanvasGroup)
│  │  │  ├─ Frame (Image + SkewEffect)
│  │  │  ├─ PageTitle (TextMeshProUGUI)
│  │  │  ├─ Rows (VerticalLayoutGroup)
│  │  │  │  └─ RowSlot × 4 (LayoutElement)
│  │  │  │     └─ RewardRow (RewardRow.cs · CanvasGroup) ← 애니메이션은 슬롯 안의 이것만
│  │  │  │        ├─ Plate (Image + SkewEffect)
│  │  │  │        ├─ Label · Sub (TextMeshProUGUI)
│  │  │  │        └─ Value (TextMeshProUGUI · 오른쪽 정렬)
│  │  │  ├─ TotalLine > Label · Value (TextMeshProUGUI)
│  │  │  └─ Items (TextMeshProUGUI)
│  │  ├─ RankStamp (CanvasGroup) > Text (TextMeshProUGUI)
│  │  └─ PromptHint (TextMeshProUGUI)
│  └─ LevelUpSpotlight (CanvasGroup, 기본 alpha 0)
│     ├─ Dim (Image, Raycast Target 끔)
│     └─ Card (RectTransform) > Badge · LevelUpText (TextMeshProUGUI)
└─ EventSystem (InputSystemUIInputModule)
(데이터: ResultData.cs — RewardLine · ItemLine · MemberStart · 시험용 결과 3종)`,
      steps: [
        '`ResultData.cs` 의 `ResultData`(행·물자·레벨 업·등급)를 전투 쪽에서 만들어 `ResultsSequence.Play(data)` 를 부른다. 시험용으로는 `ResultsDemo.cs` 가 숫자키 1~5(1~3 결과 · 4 확인 입력 · 5 연타하던 중 승리)로 갤러리 이벤트를 재현한다.',
        '`ResultsSequence` 는 단계마다 코루틴 하나(`Banner` → `Page` → `LevelUp` → `Page` → `Items` → `Rank` → 완료)를 순서대로 `yield return` 한다. `Banner` 만 `noHold` 로 끝나는 즉시 정산이 이어지고, 나머지는 완료 뒤 입력이나 자동 진행을 기다린다. 단계 코루틴은 모두 `Time.unscaledDeltaTime` 으로 시간을 센다.',
        '카운트업은 `t = elapsed / duration` 에 곡선을 걸어 `Mathf.Lerp(0, target, curve(t))` 를 반올림해 표시한다. 루프가 끝나면 **반드시 target 을 그대로 대입**한다.',
        '확인 입력은 `InputActionReference`(UI/Submit) 의 `performed` 한 곳에서만 받아 `pendingPress = true` 로 기록한다. 단계 코루틴이 `ConsumePress()` 로 꺼내 쓰면 플래그가 내려가므로 **한 입력 = 한 단계**가 보장된다.',
        '스킵은 `finishRequested` 를 세워 각 루프가 t=1 로 점프하게 하고, 단계가 끝나면 `FinishPage()` 가 모든 행·합계·경험치 바를 최종값으로 맞춘다.',
        '진입 직후 `inputLock`(0.3초) 동안 들어온 입력은 기록하지 않고 버린다(`Time.unscaledTime` 비교).',
        'Frame·Plate 의 기울기는 `SkewEffect`(BaseMeshEffect) 로 정점만 밀어 만든다. 글자는 기울이지 않는다.',
      ],
      pitfalls: [
        'LayoutGroup 자식의 위치를 직접 움직이면 다음 레이아웃 갱신에서 되돌아간다. **슬롯(LayoutElement) 안의 자식**(RewardRow)만 움직인다.',
        '`Time.timeScale = 0` 인 결과 화면에서 `deltaTime` 을 쓰면 카운트업이 멈춘다. `unscaledDeltaTime` 을 쓴다.',
        '`StopCoroutine` 만으로 스킵하면 값이 중간에서 멈춘다. 스킵은 "목표값 확정" 함수로 처리한다.',
        '`Keyboard.current.enterKey.isPressed` 처럼 **누르고 있는 상태**로 판정하면 한 번 누르는 동안 여러 프레임이 참이 되어 단계를 관통한다. `performed` 이벤트나 `wasPressedThisFrame` 을 쓴다.',
        '`TMP_Text.text` 에 매 프레임 새 문자열을 넣으면 GC 가 쌓인다. 표시값이 바뀔 때만 `ToString("N0")` 으로 갱신한다.',
        '`Rotate Z` 로 패널을 기울이면 자식 글자도 기울어 숫자가 읽기 어렵다. 이 예제처럼 바탕 메시만 기울인다.',
        '`FindObjectOfType` 은 6.3 에서 obsolete. 참조는 인스펙터로 연결한다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + ResultsSequenceUITK.cs + ResultsUITKDemo.cs
└─ Results.uxml (#root.results)
   ├─ #banner.banner > SlantedBox.banner__slash · Label "승리" · #mission
   ├─ #party > .member ×3 (코드로 생성) > .member__head (이름 · 레벨) · .member__bar > .member__fill · Label.member__exp
   ├─ #panel.panel
   │  ├─ SlantedBox.panel__frame (Painter2D 로 평행사변형)
   │  ├─ Label #page-title
   │  ├─ #rows  (.row 는 코드로 생성 → .row--shown 으로 등장)
   │  ├─ #total.total > Label #total-label · Label #total-value
   │  └─ Label #items
   ├─ Label #rank.rank
   ├─ #levelup.levelup (picking-mode Ignore) > .levelup__card
   └─ Label #hint.hint
(ResultData.cs 는 ugui 폴더의 것을 함께 쓴다)`,
      steps: [
        '`SlantedBox` 는 `[UxmlElement]` 커스텀 컨트롤이다. `generateVisualContent` 에서 `Painter2D` 로 평행사변형을 채워 USS 에 없는 skew 를 대신한다. 채움·윗변 색은 `[UxmlAttribute]` 라 UXML 에서 `fill-color="#FFB547"` 처럼 지정한다(배너 띠는 강조색 + 어두운 글자). 글자는 일반 Label 이라 반듯하다. 코드가 `UIGallery.ResultsReward` namespace 안에 있으므로 UXML 에는 `<UIGallery.ResultsReward.SlantedBox>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        '행은 코드로 만들어 `#rows` 에 넣고, `schedule.Execute(() => row.AddToClassList("row--shown")).StartingIn(stagger * i)` 로 차례로 켠다. 등장 모션은 USS `transition`(opacity · translate, `ease-out-cubic`)이 맡는다.',
        '숫자는 코루틴(unscaledDeltaTime)에서 표시값이 바뀔 때만 `Label.text` 를 갱신하고, 끝에 목표값을 그대로 넣는다.',
        '입력은 UGUI 판과 같이 `performed` 한 곳에서 받아 `ConsumePress()` 로 한 단계에 한 번만 쓴다.',
        '레벨 업은 `#levelup` 에 `levelup--open` 클래스를 붙여 딤과 카드가 transition 으로 들어오게 한다(`display` 전환은 애니메이션되지 않으므로 opacity·scale 로).',
        '다시 `Play` 할 때는 `BuildView` 가 먼저 `.results--instant` 를 붙여 초기 상태로 즉시 되돌린다 — 그래야 다음 프레임의 등장 transition 이 처음처럼 재생된다.',
        '`ResultsUITKDemo.cs` 로 숫자키 1~5 이벤트를 시험한다. (이 판은 단계형만 구현했다 — 원장형 구성은 UGUI 판의 `TallyMode.LedgerLines` 를 참고해 같은 방식으로 옮긴다)',
      ],
      pitfalls: [
        '요소를 만든 **같은 프레임**에 `row--shown` 을 붙이면 이전 상태가 없어 transition 이 실행되지 않는다. `schedule.Execute` 로 한 프레임 이상 늦춘다.',
        'USS 에는 gradient · box-shadow · filter · skew 가 없다. 기울어진 판은 Painter2D, 강조는 `border-color` 로 만든다.',
        '`#levelup` 같은 덮개 요소가 입력을 가로채지 않게 `picking-mode="Ignore"` 로 둔다.',
        'USS transition 이 `Time.timeScale` 의 영향을 받는지는 문서에 명시가 없다. 결과 화면에서 timeScale 을 0 으로 둔다면 숫자(코루틴)와 행 등장(transition)이 어긋나지 않는지 **강사가 6.3 에서 직접 확인**한다.',
        '한글 글리프가 있는 FontAsset 을 Panel Settings 의 Text Settings 에 지정해야 한글이 깨지지 않는다. 숫자 떨림 방지는 고정폭 숫자 폰트로.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Persona 5 Royal (2019)',
      credit: '© ATLUS © SEGA',
      borrowed: ['레이아웃 구조 (정산을 단계로 나누고 레벨 업을 분리)', '형태 · 기울기 (사선 패널 — 시리즈 UI 전반의 인상, 결과 화면에서는 미확인)'],
      learned:
        '승리 연출 → 경험치·돈·아이템 → 레벨 업 안내 → 버튼으로 복귀라는 흐름을 "정산을 단계로 나누고 레벨 업을 따로 세운다"는 구조로 일반화했다. 다만 결과 화면의 실제 표시 순서·타이밍·배치는 **미확인**이다. 사선 패널은 CEDEC+KYUSHU 2017 개발자 패널 보도의 "예고장처럼 UI 를 구성하고 사선 형태를 많이 쓴다"는 설명을 근거로, 결과 화면이 아닌 시리즈 UI 전반에서 가져온 축이다. "화려하지만 반복되면 번거롭다"는 플레이어 의견을 스킵 설계의 근거로 삼았다. 빨강 중심 배색, 고유 서체, 마무리 공격 연출은 가져오지 않았다.',
      link: 'https://atlus.com/persona-5-royal-launch-faq/',
    },
    {
      title: 'Balatro (2024)',
      credit: '© Playstack · LocalThunk',
      borrowed: [],
      learned:
        '비교 사례. 라운드 정산이 기본 보상 · 남은 기회 보너스 · 이자처럼 **여러 항목으로 나뉜다**는 점(위키 수준 근거)만 참고했다. 정산 화면의 실제 배치와 박자는 **미확인**이다. 이 표본의 "한 줄씩 붙고 합계가 그때마다 늘어나는 원장형 리듬"은 이 갤러리가 새로 설계한 것이다.',
      link: 'https://www.playstack.com/news/balatro-gdc-awards-2025/',
    },
  ],
  original:
    '남색 배경 + 청록 패널 + 호박색 강조의 색, 배너 띠와 패널 모양, 파티 경험치 카드, 캡슐 실루엣 레벨 업 카드, 마름모 물자 아이콘, 모든 문구(외곽 탐사대·하린·도윤·세라·잔해 드론·크레딧)는 새로 만들었다. **등급 도장, 스킵 방식 3종 비교, 카운트 곡선 비교, 진입 입력 잠금, 입력 소비 기록, 자동 진행 대기(끌 수 있음), 큰 보상으로 고정 시간 확인, 원장형 리듬**은 참고 게임 근거가 아닌 교육용 추가 요소다.',
  references: [
    { label: 'ATLUS 공식 — Persona 5 Royal FAQ', url: 'https://atlus.com/persona-5-royal-launch-faq/' },
    { label: 'Persona Central — CEDEC+KYUSHU 2017 Persona UI 패널 보도', url: 'https://personacentral.com/persona-5-panel-concept-development-ui/' },
    { label: 'Persona Central — CEDEC Awards 2019 Visual Arts (UI 디자이너 수상)', url: 'https://personacentral.com/cedec-awards-2019-persona-5-masayoshi-sutoh-visual-arts/' },
    { label: 'ResetEra — 결과 화면 스킵 요청 스레드 (플레이어 의견, T3)', url: 'https://www.resetera.com/threads/victory-results-screens-in-rpgs-are-annoying-please-let-players-completely-disable-them-to-speed-things-up-devs.556687/' },
    { label: 'Playstack 공식 — Balatro GDC Awards 2025', url: 'https://www.playstack.com/news/balatro-gdc-awards-2025/' },
    { label: 'Unity 6.3 Manual — USS transitions', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-Transitions.html' },
    { label: 'Unity 6.3 Manual — 커스텀 컨트롤 만들기 ([UxmlElement])', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-create-custom-controls.html' },
    { label: 'uGUI 2.0 — BaseMeshEffect', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/UnityEngine.UI.BaseMeshEffect.html' },
  ],
  related: [
    { id: 'settings-accessibility', why: '자동으로 넘어가는 화면의 시간 제한을 끄는 기준' },
    { id: 'dialogue-choices', why: '같은 입력 소비 규칙 — 대사 넘기기도 한 입력 = 한 결과(타자 효과 완료 → 다음 줄)' },
    { id: 'main-pause-menu', why: '입력 버퍼와의 차이 — 메뉴는 전환 중 입력을 모아 두었다 하나씩 소비하고, 결과 화면은 진입 직후 입력을 버린다(입력 잠금)' },
    { id: 'damage-numbers', why: '같은 createCountUp 리듬 — 공간에 뜨는 숫자 vs 정산 화면의 숫자' },
  ],
}
