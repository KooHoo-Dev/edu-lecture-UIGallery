import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'turn-order-timeline',
  title: '턴 순서 타임라인',
  titleEn: 'Turn Order Timeline',
  group: 'A',
  order: 5,
  paradigms: ['non-diegetic'],
  oneLiner: '누가 언제 행동하는지 초상 줄로 미리 보인다. 속도 버프 · 둔화 · 끼어들기로 순서가 바뀌면 초상이 새 자리로 미끄러지고 몇 칸 움직였는지 알린다',
  goals: [
    '**행동값 = 남은 거리 ÷ 속도** 로 다음 N 턴 순서를 계산하고, 빠른 유닛이 여러 번 나오는 이유를 설명할 수 있다',
    '전투 큐(모델)와 타임라인(뷰)을 나누고, 차례마다 **영구 key** 를 줘서 같은 초상이 새 자리로 미끄러지게 만들 수 있다',
    'LayoutGroup 없이 칸 위치를 직접 계산하고 **보간**해서, 순서가 바뀐 이유(앞당김 · 지연 · 끼어들기)가 눈으로 따라가지게 할 수 있다',
    '행동값 같은 숨은 수치를 화면에 보일지 말지 **정보 밀도와 학습 곡선** 관점에서 토론할 수 있다',
  ],
  principles: ['즉각 피드백', '시각 위계', '가독성', '인지 부하', '접근성'],
  platforms: ['pc', 'mobile', 'console'],
  inputs: ['mouse', 'touch', 'keyboard'],
  genres: ['수집형 RPG', '턴제 RPG', '전술 RPG'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'previewCount', label: '미리보기 칸 수', type: 'range', min: 4, max: 10, step: 1, default: 8, unit: '칸', hint: '지금 차례 뒤로 몇 차례를 미리 보일지. 늘리면 빠른 유닛(세라 · 드론 B)이 두세 번 나온다 — 계획은 쉬워지지만 줄이 길어진다' },
    { key: 'showActionValue', label: '행동값 숫자', type: 'toggle', default: true, hint: '초상 옆에 "지금부터 몇 행동값 뒤" 인지 숫자로 보인다. 끄면 순서만 남는다 — 처음 하는 사람에게는 단순하지만 버프를 언제 쓸지 계산할 근거가 사라진다' },
    { key: 'slideMs', label: '자리 바뀜 시간', type: 'range', min: 0, max: 800, step: 50, default: 350, unit: 'ms', hint: '순서가 바뀔 때 초상이 새 자리로 미끄러지는 시간. 0 이면 순간이동 — 누가 앞질렀는지 놓친다. 너무 길면 다음 입력을 기다리게 한다' },
    {
      key: 'spacingMode',
      label: '칸 간격',
      type: 'select',
      options: [
        { value: 'slots', label: '같은 간격 (순서만)' },
        { value: 'time', label: '행동값 비례 (시간축)' },
      ],
      default: 'slots',
      hint: '같은 간격은 읽기 쉽고, 행동값 비례는 "다음 차례까지 얼마나 남았는지" 가 거리로 보인다. 비례여도 칸마다 최소 간격을 둬 초상이 겹치지 않는다',
    },
    {
      key: 'barSide',
      label: '바 위치',
      type: 'select',
      options: [
        { value: 'left', label: '왼쪽 세로' },
        { value: 'top', label: '위쪽 가로' },
      ],
      default: 'left',
      hint: '세로는 이름 · 숫자를 옆에 길게 쓸 수 있고, 가로는 전장을 덜 가린다. 어느 쪽이든 지금 차례가 맨 앞(위 · 왼쪽)이다',
    },
  ],
  presets: [
    {
      id: 'collector-rpg',
      name: '수집형 RPG',
      look: '왼쪽 세로 줄, 순서만 보이고 행동값 숫자는 숨김 — 단순하지만 속도 계산은 감으로',
      values: { previewCount: 7, showActionValue: false, slideMs: 300, spacingMode: 'slots', barSide: 'left' },
    },
    {
      id: 'tactics-initiative',
      name: '전술 RPG 이니셔티브',
      look: '위쪽 가로 줄, 짧은 미리보기, 빠른 자리 바뀜 — 전장을 넓게 쓴다',
      values: { previewCount: 6, showActionValue: false, slideMs: 250, spacingMode: 'slots', barSide: 'top' },
    },
    {
      id: 'time-axis',
      name: '시간축 타임라인',
      look: '가로 시간축에 행동값 비례로 배치, 숫자 공개, 천천히 미끄러짐 — 숙련자의 계산용',
      values: { previewCount: 10, showActionValue: true, slideMs: 500, spacingMode: 'time', barSide: 'top' },
    },
  ],
  events: [
    { id: 'next', label: '다음 턴 진행' },
    { id: 'haste', label: '속도 버프 (+40%)' },
    { id: 'slow', label: '둔화 (−30%)' },
    { id: 'advance', label: '행동 앞당김 (50%)' },
    { id: 'interrupt', label: '끼어들기 (추가 행동)' },
    { id: 'reset', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'active',
      title: '지금 행동 중인 유닛은 맨 앞 · 크게',
      body: '줄의 맨 앞 칸이 지금 차례다. 더 크게 그리고 금색 테두리 + "행동 중" 글자, 전장의 그 유닛 발밑에도 같은 금색 고리를 둔다. 줄과 전장을 같은 표시로 이어야 "초상 속 누가 저 캐릭터인지" 를 찾지 않는다. 초상에 포인터를 올리면 그 유닛의 모든 차례와 전장 위치가 함께 강조된다.',
      principle: '시각 위계',
    },
    {
      n: 2,
      part: 'slide',
      title: '순서가 바뀌면 미끄러지고, 몇 칸인지 알린다',
      body: '차례마다 **영구 key**(`doyun:3`)가 있어 순서가 바뀌어도 같은 초상이 지금 자리에서 새 자리로 **보간**된다. 대상 유닛의 칸에는 **▲3 · ▼2** 처럼 방향 모양 + 칸 수를 잠깐 붙이고, 위쪽 한 줄이 이유를 말한다. 효과를 끄면 줄이 순간이동해 "방금 누가 앞질렀는지" 를 놓친다 — 같은 이벤트를 켜고 끄고 비교.',
      principle: '즉각 피드백',
    },
    {
      n: 3,
      part: 'interrupt',
      title: '끼어들기는 정규 차례와 다르게',
      body: '추가 행동(궁극기 · 반격 등)은 지금 차례가 끝나면 **시간이 흐르지 않고** 바로 실행된다. 정규 차례 · 남은 거리는 그대로라 같은 유닛이 줄에 두 번 보인다. 그래서 점선 테두리 + 번개 표시 + "끼어들기" 글자로 따로 구분한다. 구분이 없으면 "하린이 왜 두 번?" 이 된다.',
      principle: '가독성',
    },
    {
      n: 4,
      part: 'av',
      title: '행동값 — 보일까, 숨길까',
      body: '**행동값 = 남은 거리 ÷ 속도** (기준 거리 10000). 가장 작은 유닛이 행동하고, 그만큼의 시간이 모두에게서 빠진다. 속도 버프는 남은 거리는 그대로 두고 속도만 바꿔 **버프가 남아 있는 동안의 차례**(여기서는 2턴) 간격이 줄고, 앞당김은 남은 거리를 깎아 **다음 한 번만** 당긴다. 숫자를 보이면 숙련자가 계산할 수 있지만 처음 하는 사람에게는 소음이다 — 조절 값 "행동값 숫자" 로 비교.',
      principle: '인지 부하',
    },
    {
      n: 5,
      part: 'role',
      title: '아군 · 적은 모양으로도',
      body: '아군은 둥근 사각 틀 + 캡슐, 적(잔해 드론)은 깎인 팔각 틀 + 삼각 — 갤러리 공통 실루엣 규칙이다. 색과 모양과 이름 세 가지로 구분해 색각 차이가 있어도 "다음이 적인지" 를 바로 안다. 효과를 끄면 같은 동그라미에 색만 달라진다.',
      principle: '접근성',
    },
  ],
  mistakes: [
    { title: '순서가 바뀌면 순간이동', body: '목록을 정렬한 뒤 LayoutGroup 으로 다시 늘어놓으면 초상이 새 자리에 그냥 나타난다. 무엇이 앞질렀는지 보이지 않는다. 차례마다 key 를 두고 같은 초상을 보간해서 옮긴다.' },
    { title: '뷰가 순서를 계산한다', body: '초상 리스트 안에서 정렬 · 버프 처리를 하면 미리보기 · 전투 · 저장이 서로 다른 순서를 갖게 된다. 순서는 전투 큐(모델) 하나가 계산하고 뷰는 결과만 그린다.' },
    { title: '끼어들기 표시 없음', body: '추가 행동을 평범한 칸으로 끼워 넣으면 같은 유닛이 이유 없이 두 번 보인다. 모양 · 글자로 정규 차례와 구분한다.' },
    { title: '아군 · 적 구분이 색뿐', body: '빨강 · 파랑 테두리만 다르면 색각 차이가 있는 사람은 다음 차례가 적인지 모른다. 모양(캡슐 · 삼각)과 이름을 함께 쓴다.' },
    { title: '미리보기가 버프를 모른다', body: '지금 속도로만 다음 N 턴을 계산하면 1턴짜리 버프가 끝난 뒤의 순서가 틀린다. 미리보기도 복사본으로 시간을 흘리며 버프가 끝나는 것까지 같은 규칙으로 계산한다.' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 순서가 바뀌면 초상이 보간 없이 순간이동하고, 바뀐 칸 알림(▲ · ▼)과 이유 한 줄이 없다. 지금 행동 중인 유닛도 다른 칸과 같은 크기라 맨 앞이 지금인지 다음인지 헷갈리고, 전장의 고리 · "행동 중" 표시도 없다. 끼어들기는 평범한 칸으로 들어가 같은 유닛이 이유 없이 두 번 보인다. 초상은 같은 동그라미에 색과 한 글자뿐이라 아군 · 적을 색으로만 가린다.',
  timings: [
    { event: '자리 바뀜 (미끄러짐)', ms: 350, easing: 'ease-out cubic', note: '권장값. 250~500ms — 짧으면 놓치고, 길면 다음 입력을 기다리게 한다' },
    { event: '새 차례 들어옴 · 끝난 차례 나감', ms: 350, easing: 'ease-out cubic + 투명도', note: '권장값. 자리 바뀜과 같은 시간으로 한 번에' },
    { event: '바뀐 칸 알림 (▲ · ▼)', ms: 2200, easing: '—', note: '권장값. 눈이 줄을 다시 훑을 시간' },
    { event: '이유 한 줄', ms: 3200, easing: '투명도 250ms', note: '권장값' },
    { event: '지금 차례 고리 맥동', ms: 2000, easing: 'ease-in-out 왕복 (1초씩 밝게 · 흐리게)', note: '0.5Hz — 2Hz 이하' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Battle (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ Timeline (RectTransform · Image 바탕 · TimelineView.cs — LayoutGroup 없음, 칸 위치를 직접 계산)
│  ├─ Axis (Image — 행동값 비례일 때만 켬)
│  └─ PortraitView 프리팹 (PortraitView.cs · CanvasGroup — 피벗 · 앵커 왼쪽 위, C# 가 복제)
│     ├─ ActiveOutline (Image — 지금 차례일 때만)
│     ├─ Frame (Image — 아군 둥근 사각 · 적 팔각, Raycast Target 끔)
│     ├─ Body (Image — 캡슐 · 삼각)
│     ├─ Bolt (Image — 끼어들기일 때만)
│     ├─ Badge (Image + TextMeshProUGUI — "2칸 앞" · "1칸 뒤" · "추가")
│     ├─ NameText (TextMeshProUGUI)
│     └─ ValueText (TextMeshProUGUI — 행동값 · "행동 중" · "끼어들기")
├─ CaptionText (TextMeshProUGUI — 무슨 일이 생겼는지 한 줄)
└─ TurnOrderDemo (TurnOrderDemo.cs — 시험용: Enter 다음 턴 · 1 버프 · 2 둔화 · 3 앞당김 · 4 끼어들기 · R 처음부터)
TurnQueue.cs (순수 C# 모델 — MonoBehaviour 아님. UnitSetup · TurnEntry 도 여기) · SpacingMode · BarSide 는 TimelineView.cs`,
      steps: [
        '`TurnQueue` 는 화면을 모르는 순수 C# 클래스다. 유닛마다 남은 거리(`dist`)와 속도를 들고, `Preview(n)` 이 복사본으로 시간을 흘려 **행동값 = 남은 거리 ÷ 속도** 가 가장 작은 유닛을 차례로 뽑는다. 정규 차례 key 는 `id:번호`, 끼어들기는 `x번호`.',
        '버프는 `SetSpeedMod(unit, 0.4f, modTurns)` (데모는 2턴) — 남은 거리는 그대로 두고 속도만 바꾼다. 앞당김 · 지연은 `ShiftAction(unit, 0.5f)` 로 남은 거리를 기준 거리의 비율만큼 줄이거나 늘린다. 끼어들기는 `AddExtra(unit)` 로 별도 목록에 넣고, `EndTurn()` 이 정규 차례보다 먼저 꺼낸다.',
        '모델이 바뀌면 `Changed` 이벤트가 오고, `TimelineView.Rebuild()` 가 `Preview(previewCount)` 를 받아 key 로 `PortraitView` 를 찾는다. 이미 있으면 **지금 자리 → 새 목표** 로 보간을 시작하고, 없으면 풀에서 꺼내 줄 끝 밖에서 들어오게, 사라진 key 는 밖으로 내보낸 뒤 풀에 돌려준다.',
        '칸 목표는 `TimelineView.SlotPosition(i, 행동값, …)` 이 계산한다. `spacingMode` 가 Slots 면 `i × pitch`, Time 이면 `i × minGap + av × k` (k 는 마지막 칸이 끝에 닿게). 지금 차례(i = 0)는 `activeScale` 로 키운다. 보간은 `Update` 에서 `slideSeconds` 동안 ease-out cubic — 배속을 따르게 `Time.deltaTime` 을 쓴다.',
        '바뀐 칸 알림: 이벤트 전 `Preview` 와 뒤 `Preview` 를 key 로 비교해 대상 유닛 칸에 "2칸 앞 · 1칸 뒤 · 추가" 를 2.2초 띄운다(글자 + 색). 이 비교는 뷰가 아니라 `TurnOrderDemo`(전투 관리자 자리)가 해서 `TimelineView.Flag(key, 문구, 색)` 으로 넘긴다. ▲ 같은 기호는 TMP 글꼴에 없을 수 있어 글자로 썼다.',
      ],
      pitfalls: [
        '`HorizontalLayoutGroup` · `VerticalLayoutGroup` 을 쓰면 순서를 바꾸는 순간 레이아웃이 위치를 덮어써 보간이 안 된다. 칸 위치는 직접 계산하고 레이아웃 컴포넌트는 두지 않는다.',
        '`SetSiblingIndex` 로 순서를 바꾸지 않는다. 그리는 순서만 바뀌고 위치는 그대로다 — 순서는 모델의 리스트, 위치는 `anchoredPosition`.',
        '초상을 매번 `Destroy` · `Instantiate` 하면 같은 차례가 새 오브젝트가 돼 보간할 출발점이 없다. key → 뷰 사전 + 풀로 재사용한다.',
        '미리보기를 원본 큐로 계산하면 남은 거리가 바뀌어 실제 전투가 틀어진다. 반드시 복사본(`Unit.Clone()`)으로 흘린다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ TurnOrder.uxml
   └─ #battle (.battle)
      ├─ #timeline (.timeline + 수식 클래스 left · top · time — 칸은 C# 가 Portrait.uxml 을 복제해 넣고 absolute 로 직접 배치)
      │  └─ #axis (.axis — 행동값 비례일 때만)
      └─ #caption (Label .caption)
Portrait.uxml (#portrait .portrait > .portrait__frame(.portrait__body · .portrait__bolt) · .portrait__info(.portrait__name · .portrait__value) · .portrait__badge)
TurnOrderUITK.cs (시험용 키보드 입력 포함. TurnQueue · UnitSetup · TurnEntry · SpacingMode · BarSide 는 UGUI 폴더 것을 그대로 쓴다)`,
      steps: [
        '같은 `TurnQueue` 를 쓴다. 뷰만 다르다 — 모델과 뷰를 나눈 덕분이다.',
        '칸 요소는 `position: absolute; left: 0; top: 0`. 위치는 매 프레임 `style.translate` · `style.scale` 만 바꾼다 — `left/top` 을 바꾸면 레이아웃을 다시 계산한다.',
        'key → `VisualElement` 사전으로 같은 차례를 같은 요소로 유지한다. 새 key 는 `Portrait.uxml` 을 `Instantiate()` 해 줄 끝 밖에서, 사라진 key 는 밖으로 내보낸 뒤 `RemoveFromHierarchy()`.',
        '아군 · 적은 `.portrait` 의 수식 클래스 ally · enemy 로 틀 모양(둥근 사각 · 각진 사각)과 실루엣(캡슐 · 테두리로 만든 삼각형)을 함께 바꾼다. 끼어들기는 수식 클래스 extra(번개 점 · 보라 틀), 지금 차례는 active.',
        '보간을 USS `transition` 으로 해도 되지만(translate 는 transition 이 된다) 배속 · 정지를 맞추기 어렵다. 이 예제는 C# 에서 `slideSeconds` 동안 직접 보간한다.',
      ],
      pitfalls: [
        '`ListView` 는 항목을 재활용하며 인덱스로 다시 묶기 때문에, 순서가 바뀌면 같은 칸이 다른 유닛을 그린다 — 미끄러지는 재정렬에는 맞지 않는다.',
        'flex 줄에 `Insert` 로 끼워 넣으면 나머지 칸이 한 프레임에 밀려 순간이동한다. absolute + translate 로 직접 옮긴다.',
        '`Portrait.uxml` 을 `Instantiate()` 한 `TemplateContainer` 째 넣으면 flex 흐름에 들어가 칸이 아래로 쌓인다. `.Q("portrait")` 로 안쪽 요소만 꺼내 넣는다 — 스타일은 조상(TurnOrder.uxml)의 TurnOrder.uss 가 그대로 맞는다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Honkai: Star Rail (2023)',
      credit: '© COGNOSPHERE',
      borrowed: ['왼쪽 세로로 늘어선 행동 순서 줄 (배치는 기억에 기댄 것 — 미확인)', '초상 옆 행동값 숫자 (기준 10000 ÷ 속도)'],
      learned: '행동값 = 10000 ÷ 속도 로 순서를 정하고, 값이 작을수록 먼저 행동한다(공략 기사 근거). 기본 화면(왼쪽 세로 줄 + 행동값 숫자)이 이 게임을 닮았을 수 있어 빌린 축 두 개로 밝혀 둔다 — 화면 속 위치 · 숫자 표시는 직접 확인하지 못했다(미확인). 초상 틀 · 색 · 끼어들기 표시는 새로 그렸다. 행동 앞당김 공식은 커뮤니티 계산이라 미확인.',
      link: 'https://beebom.com/honkai-star-rail-speed-breakpoints-explained/amp/',
    },
    {
      title: "Baldur's Gate 3 (2023)",
      credit: '© Larian Studios',
      borrowed: ['화면 위쪽 초상 줄로 전투 차례를 보이기'],
      learned: '차례는 화면 위 초상 줄로 보이고, 초상을 눌러 그 캐릭터로 바꿀 수 있다(공략 근거). 이니셔티브가 같으면 초상 테두리가 이어져 보인다는 기사도 있지만 화면으로 확인하지 못했다(미확인). 이 표본의 "위쪽 가로" 바 위치만 빌렸다.',
      link: 'https://www.ludo.guide/guide/baldurs-gate-3/gameplay/getting-started/surprise-rounds-and-initiative-explained',
    },
  ],
  original:
    '유닛 다섯(하린 · 도윤 · 세라 · 잔해 드론 A · B)과 속도 수치, 초상 틀 모양, 끼어들기 번개 표시, ▲ · ▼ 칸 수 알림, 행동값 비례 배치(최소 간격 + 비례 나머지), 디버그 모델 창, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 기준 거리 10000 은 공개 공략에 나온 계산 관례를 따랐다.',
  references: [
    { label: 'Beebom — Honkai: Star Rail 속도 · 행동값(10000 ÷ 속도) 설명', url: 'https://beebom.com/honkai-star-rail-speed-breakpoints-explained/amp/' },
    { label: "bg3.wiki — Turn-based mode (이니셔티브 내림차순 · 이웃한 아군 동시 차례)", url: 'https://bg3.wiki/wiki/Turn_order' },
    { label: "Shacknews — Baldur's Gate 3 전투 설명 (이니셔티브 · 같은 값이면 초상 테두리 연결)", url: 'https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3' },
    { label: 'Unity 6.3 — UI Toolkit 위치(position · translate)', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-positioning.html' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/full-list/' },
  ],
  related: [
    { id: 'card-hand-targeting', why: '같은 턴제 전투 — 손패는 원호 공식으로, 적의 다음 행동은 의도 아이콘으로 공개' },
    { id: 'popup-queue-stack', why: '큐(모델)를 두고 뷰가 결과만 그리는 같은 구조 — 알림 줄 세우기' },
    { id: 'health-bar-trail', why: '"무슨 일이 있었는지" 를 보간과 잔상으로 따라가게 하는 같은 원리' },
  ],
}
