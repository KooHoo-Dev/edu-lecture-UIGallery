import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'recycled-scroll-list',
  title: '재활용 스크롤 리스트 (1,000명 랭킹)',
  titleEn: 'Recycled Scroll List (Virtualized Ranking)',
  group: 'E',
  order: 4,
  paradigms: ['menu'],
  oneLiner: '1,000명 랭킹을 셀 열 개 남짓으로 돌려 보여 준다. 위로 나간 셀이 아래 새 항목으로 옮겨 가는 것을 디버그 지도로 보고, 재활용을 끄면 셀이 1,000개로 치솟는다',
  goals: [
    '스크롤 위치와 행 높이로 **보이는 인덱스 범위**(first = ⌊scroll ÷ h⌋ − 여유분)를 계산하고, 필요한 셀 수를 미리 셀 수 있다',
    '범위를 벗어난 셀을 **풀에 반납했다가 새 항목에 다시 배정**하고, 셀은 위치만 옮기고 내용만 다시 채우는 재활용 스크롤을 UGUI 로 직접 만들 수 있다',
    '응원 · 받음 같은 **상태는 데이터에** 두고 셀은 보여 주기만 해야 하는 이유를 재현으로 설명할 수 있다',
    'UGUI 의 직접 구현(LayoutGroup 없음 · 서브 Canvas)과 UI Toolkit `ListView` 의 내장 가상화(makeItem / bindItem)를 비교하고 Profiler 로 차이를 확인할 수 있다',
  ],
  principles: ['즉각 피드백', '인지 부하', '일관성', '가독성'],
  platforms: ['mobile', 'pc', 'console'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['모바일 RPG', '실시간 전략', '모든 장르의 랭킹 · 우편함 · 친구 목록'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    {
      key: 'recycle',
      label: '셀 재활용',
      type: 'toggle',
      default: true,
      hint: '끄면 새 항목이 보일 때마다 셀을 새로 만들고 버리지 않는다. 굴린 만큼 "만든 셀" 이 늘어 끝까지 가면 수백 개가 된다',
    },
    {
      key: 'overscan',
      label: '여유분 (overscan)',
      type: 'range',
      min: 0,
      max: 4,
      step: 1,
      default: 1,
      unit: '줄',
      hint: '보이는 범위 위아래로 이만큼 셀을 더 붙여 둔다. 빠르게 굴릴 때 빈칸이 비치지 않게 하는 값 — 늘리면 만든 셀 수와 지도의 초록 띠가 커진다',
    },
    {
      key: 'itemHeight',
      label: '행 높이',
      type: 'range',
      min: 80,
      max: 160,
      step: 8,
      default: 104,
      unit: 'px',
      hint: '모든 행이 같은 높이라서 index × 높이 로 위치를 바로 계산한다. 낮추면 한 화면에 줄이 많아져 필요한 셀이 는다',
    },
    {
      key: 'dataCount',
      label: '데이터 수',
      type: 'range',
      min: 50,
      max: 1000,
      step: 50,
      default: 1000,
      unit: '명',
      hint: '항목이 아무리 많아도 재활용하면 만든 셀 수는 같다. 재활용을 끄거나 효과를 끈 상태에서 바꾸면 차이가 커진다',
    },
    {
      key: 'cellState',
      label: '응원 상태 저장 위치',
      type: 'select',
      options: [
        { value: 'data', label: '데이터에 (바른 방법)' },
        { value: 'cell', label: '셀에 (흔한 실수)' },
      ],
      default: 'data',
      hint: '"셀에" 로 바꾸고 굴리면 하트가 셀을 따라 다른 대원에게 붙는다. 바인딩이 켜기만 하고 끄지 않아 하트가 점점 번진다',
    },
    {
      key: 'showDebug',
      label: '디버그 보기',
      type: 'toggle',
      default: true,
      hint: '셀 번호 띠, 셀 풀 지도, 서브 Canvas 표시. 끄면 플레이어가 보는 화면 그대로 — 재활용은 눈에 보이지 않아야 정상이다',
    },
  ],
  presets: [
    {
      id: 'mobile-ranking',
      name: '모바일 랭킹 (플레이어 화면)',
      look: '디버그 없이 실제 화면처럼. 1,000명을 굴려도 끊김이 없고 내 순위 행이 아래에 고정된다',
      values: { recycle: true, overscan: 1, itemHeight: 120, dataCount: 1000, cellState: 'data', showDebug: false },
    },
    {
      id: 'classroom-debug',
      name: '수업용 디버그 (큰 행)',
      look: '행을 크게 해 셀 수를 줄이고 여유분 2 — 배속 0.25 로 셀이 위에서 아래로 건너가는 것을 하나씩 센다',
      values: { recycle: true, overscan: 2, itemHeight: 144, dataCount: 1000, cellState: 'data', showDebug: true },
    },
    {
      id: 'no-recycle',
      name: '재활용 끄기 비교',
      look: '보이는 것만 만들지만 버리지도 돌려쓰지도 않는다. "맨 아래로 튀기" 를 누르면 만든 셀이 수백 개로',
      values: { recycle: false, overscan: 1, itemHeight: 104, dataCount: 1000, cellState: 'data', showDebug: true },
    },
    {
      id: 'stale-state',
      name: '셀에 상태 저장 (버그 재현)',
      look: '응원 표시를 셀이 들고 있다. 굴리면 하트가 엉뚱한 대원에게 붙고 ⚠ 표시가 늘어난다',
      values: { recycle: true, overscan: 1, itemHeight: 104, dataCount: 1000, cellState: 'cell', showDebug: true },
    },
    {
      id: 'compact',
      name: '촘촘한 목록 · 여유분 0',
      look: '낮은 행에 여유분 없이 — 필요한 셀이 가장 적지만 보이는 줄은 많다',
      values: { recycle: true, overscan: 0, itemHeight: 80, dataCount: 1000, cellState: 'data', showDebug: true },
    },
  ],
  events: [
    { id: 'fling-bottom', label: '맨 아래로 튀기' },
    { id: 'jump-me', label: '내 순위로 이동' },
    { id: 'reshuffle', label: '데이터 갱신 (순위 변동)' },
    { id: 'cheer-scroll', label: '응원 누르고 스크롤' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'cells',
      title: '보이는 범위만 셀로',
      body: '행 높이가 모두 같으면 위치는 **index × h** 로 바로 나온다. 스크롤 위치로 **first = ⌊scroll ÷ h⌋ − 여유분, last = ⌈(scroll + 보이는 높이) ÷ h⌉ − 1 + 여유분** 을 구하고 그 범위에만 셀을 붙인다. 필요한 셀은 ⌈650 ÷ 104⌉ + 1 + 2 = 10개 — 데이터가 1,000개든 100만 개든 같다. Content 높이만 count × h 로 잡아 두면 스크롤바도 그대로 맞는다.',
      principle: '즉각 피드백',
    },
    {
      n: 2,
      part: 'pool',
      title: '위로 나간 셀이 아래로 건너간다',
      body: '범위를 벗어난 셀은 **풀에 반납**하고, 새로 들어온 항목에 **반납된 셀부터** 배정한다. 모자랄 때만 새로 만든다. (첫 화면은 7줄쯤 미리 굴려 둔 상태라 화살표 몇 개가 이미 보인다) 셀은 파괴 · 생성 없이 `anchoredPosition` 만 옮기고 글자 · 아이콘만 다시 채운다. 지도의 화살표가 그 이동이다 — 배속 0.25 로 보면 셀 번호가 순서대로 돌아가는 것이 보인다. 범위 안에 계속 있던 셀은 건드리지 않는다.',
      principle: '가독성',
      pin: 'left',
    },
    {
      n: 3,
      part: 'counter',
      title: '만든 셀 수가 그대로인가',
      body: '재활용이 맞게 됐는지는 **만든 셀 수**로 확인한다. 끝까지 굴려도 10 근처에서 멈추고 재사용 수만 늘어야 한다. 재활용을 끄면 굴린 만큼, 효과를 끄면(가상화 없음) 처음부터 1,000개. Unity 에서는 Profiler 의 **UI · Canvas.BuildBatch** 시간과 Hierarchy 의 셀 개수로 같은 것을 본다. 아래 그래프는 프레임마다 Canvas 가 다시 묶을 셀 수를 Unity 기준으로 센 **모형**(로그 눈금)이고, 맨 아래 ms 는 이 웹 재현의 실측(JS + 레이아웃)이다. 첫 화면의 재사용 수는 시작할 때 7줄쯤 미리 굴려 둔 결과다.',
      principle: '즉각 피드백',
    },
    {
      n: 4,
      part: 'pinned',
      title: '내 순위는 고정 행 + 점프',
      body: '내 줄이 화면 밖이면 아래에 **고정 행**으로 보이고, 화살표가 내 줄이 위 · 아래 어느 쪽인지 알린다. 누르면(M) 내 줄로 간다. 1,000줄을 다 굴리지 않고 **바로 앞까지 건너뛴 뒤 마지막 한 화면만 굴려** 어디로 왔는지 알게 하고, 도착하면 두 번 강조한다. 내 줄이 온전히 보이면 고정 행은 내려가 숨는다.',
      principle: '인지 부하',
      pin: 'below',
    },
    {
      n: 5,
      part: 'cheer',
      title: '상태는 데이터에, 셀은 보여 주기만',
      body: '응원 버튼은 **데이터(row.cheered)** 를 바꾸고 셀을 다시 채운다. 셀이 상태를 들고 있으면(조절 값 "셀에") 셀을 돌려쓸 때 하트가 **다른 대원에게 따라붙는다**. 바인딩은 켜는 경우와 끄는 경우를 **둘 다** 써야 한다 — `heart.SetActive(row.cheered)`. "응원 누르고 스크롤" 로 비교.',
      principle: '일관성',
    },
  ],
  mistakes: [
    { title: '항목마다 Instantiate + LayoutGroup', body: '1,000개를 한꺼번에 만들면 시작이 느리고 메모리를 먹고, 하나만 움직여도 Canvas 전체를 다시 묶는다(재배치). 화면에 보이는 것은 열 줄뿐이다.' },
    { title: '만들고 버리지 않기 · 매번 Destroy', body: '보이는 것만 만들어도 버리지 않으면 굴린 만큼 쌓이고, 매번 Destroy · Instantiate 하면 GC 와 생성 비용으로 스크롤이 끊긴다. 반납 → 재배정이 답이다.' },
    { title: '셀에 상태 저장', body: '받음 · 응원 · 선택 표시를 셀(프리팹)이 들고 있으면 돌려쓸 때 엉뚱한 항목에 남는다. 상태는 데이터에, 바인딩은 켜기 · 끄기를 모두 쓴다.' },
    { title: '목록과 HUD 를 한 Canvas 에', body: '스크롤로 Content 가 움직일 때마다 같은 Canvas 의 다른 UI 까지 다시 묶인다. 목록은 **서브 Canvas** 로 떼어 낸다.' },
    { title: '먼 점프를 끝까지 굴리기 · 순간 이동만 하기', body: '500줄을 다 굴리면 기다려야 하고, 강조 없이 순간 이동하면 내 줄을 다시 찾아야 한다. 바로 앞까지 건너뛰고 마지막 한 화면만 굴린 뒤 강조한다.' },
  ],
  juiceOff:
    '가상화가 없는 흔한 구현을 재현한다. VerticalLayoutGroup 아래에 항목마다 셀을 하나씩 만들어 1,000개(DOM 요소 1만 개 이상)가 생긴다 — 페이지가 멈추지 않게 한 프레임에 60개씩 나눠 만들어 "만든 셀" 이 차오르는 것이 보인다. 그래도 프레임마다 다시 묶는 셀(Unity 기준 모형)은 1,000개로 그래프가 꼭대기에 붙는다. 데이터 갱신 때도 1,000개를 모두 다시 채운다(실측 시간 표시 — 무거워서 자동 데모에서는 빼고 버튼으로만). 끝에서 튕기지 않고 딱 멈추며, 내 순위 고정 행이 없고, 내 순위로 가면 강조 없이 순간 이동한다.',
  timings: [
    { event: '관성 감속 (decelerationRate)', ms: 1000, easing: '지수 감쇠 — 1초 뒤 속도 13.5%', note: 'Unity ScrollRect 기본값 0.135' },
    { event: '끝에서 되돌아옴 (elasticity)', ms: 100, easing: 'SmoothDamp', note: 'Unity ScrollRect 기본값 0.1초' },
    { event: '휠 · 키보드 한 칸 이동', ms: 200, easing: 'ease-out cubic', note: '권장값' },
    { event: '내 순위로 점프 (마지막 한 화면)', ms: 550, easing: 'ease-out cubic', note: '권장값. 먼 거리는 바로 앞 1.5화면까지 건너뛴 뒤' },
    { event: '도착한 내 줄 강조', ms: 1600, easing: 'ease-in-out × 2회', note: '권장값. 맥동 1.25Hz' },
    { event: '순위 변동 줄 밝힘', ms: 900, easing: 'linear', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Main (Screen Space - Overlay · Canvas Scaler 1920×1080)
└─ RankingPanel (Image)
   ├─ Header (TextMeshProUGUI — 시즌 랭킹 · 참가 수)
   ├─ ScrollView (ScrollRect · Vertical 만 · Movement Elastic · RecycledScroll.cs)
   │  ├─ Viewport (RectMask2D)
   │  │  └─ Content (Canvas + GraphicRaycaster = 서브 Canvas · LayoutGroup · ContentSizeFitter 없음 — 앵커 · 높이는 RecycledScroll 이 잡는다)
   │  │     └─ (실행 중 RankingCellView 가 열 개 남짓 생긴다)
   │  └─ Scrollbar Vertical
   ├─ PinnedMyRank (Button + CanvasGroup + RankingCellView — 같은 셀 프리팹을 내 순위 고정 행으로)
   ├─ Buttons (Button 내 순위로 · 데이터 갱신 · 맨 아래로)
   └─ DebugText (TextMeshProUGUI — 데이터 · 만든 셀 · 재사용 · 범위)
RecycledScrollDemo (RecycledScrollDemo.cs — 시험용: 데이터 1,000개 · 응원 · 점프 · 순위 변동 · 키 입력)
RankingCellView 프리팹 (RankingCellView.cs : RecycledCell.cs · 높이 = itemHeight)
├─ MeHighlight · Medal · Crest (Image)
├─ Rank · Delta · Name · Sub · Score (TextMeshProUGUI)
├─ CheerButton (Button > HeartFill Image + TextMeshProUGUI 응원 수)
└─ DebugTag (Image + TextMeshProUGUI — 셀 번호) · StaleMark (셀에 남은 표시 경고)
RankingData.cs (RankingEntry 데이터 · 시험용 1,000명 생성 · 순위 변동)`,
      steps: [
        '`RecycledScroll.SetCount(n)` 이 Content 높이를 `n × itemHeight` 로 잡는다. 스크롤바 · 관성 · 탄성은 ScrollRect 가 그대로 맡는다.',
        '`ScrollRect.onValueChanged` 마다 `Refresh()`: Content 의 `anchoredPosition.y` 와 Viewport 높이로 **first · last** 를 계산한다(여유분 `overscan` 포함). 범위가 그대로면 아무것도 하지 않는다.',
        '범위 밖 셀은 `free` 스택에 반납하고, 새 항목에는 반납된 셀부터 꺼내 쓴다. 모자랄 때만 `Instantiate` — 그때 `created` 가 는다. 반납된 셀은 대개 같은 프레임에 다시 나가므로 켜고 끄지 않고, 끝까지 남은 셀만 `SetActive(false)` 한다(켜고 끌 때마다 Canvas 가 다시 묶인다).',
        '셀 배치는 `cell.Rect.anchoredPosition = new Vector2(0, -index × itemHeight)` 하나. 내용은 `BindCell(cell, index)` 콜백이 채운다 — `RankingCellView.Bind(entry, rank)` 가 순위 · 이름 · 점수 · 하트를 **켜고 끄기 모두** 설정한다.',
        '응원 버튼 리스너는 셀의 `Awake` 에서 한 번만 단다. 누르면 `CheerClicked(this)` 로 알리고, Demo 가 지금 `Index` 의 데이터를 바꾼 뒤 그 셀만 다시 `Bind` 한다 — 리스너를 Bind 마다 달면 누를 때마다 여러 번 불린다.',
        '내 순위로: `ScrollTo(index)` 가 `StopMovement()` 후, 먼 거리면 바로 앞까지 `anchoredPosition` 을 옮기고 코루틴으로 마지막 한 화면만 굴린다. 맨 아래로: `FlingToEnd()` 가 `velocity = 거리 × (−ln decelerationRate)` 를 줘 ScrollRect 의 관성 · 탄성에 맡긴다. 순위 변동은 `RefreshVisible()` 로 보이는 셀만 다시 채운다.',
      ],
      pitfalls: [
        'Content 에 `VerticalLayoutGroup` · `ContentSizeFitter` 를 두면 셀 위치를 레이아웃이 덮어써 재활용이 깨진다. 위치는 직접 계산한다.',
        'Content 를 **서브 Canvas** 로 떼지 않으면 스크롤할 때마다 같은 Canvas 의 HUD 까지 다시 묶인다. Profiler 의 `Canvas.BuildBatch` · `Canvas.SendWillRenderCanvases` 로 확인한다.',
        '셀에 상태(받음 · 응원)를 두면 돌려쓸 때 다른 항목에 남는다. `Bind` 에서 `if (on) heart.SetActive(true)` 처럼 켜기만 하면 하트가 번진다.',
        'ScrollRect 의 `velocity` 가 남은 채 `anchoredPosition` 을 바꾸면 점프 직후 관성이 이어진다. 점프 전에 `StopMovement()`.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ RankingList.uxml
   └─ #ranking-root (.ranking)
      ├─ .ranking__header (Label 제목 · 부제 · #total)
      ├─ ListView #list (fixed-item-height 104 · virtualization-method FixedHeight · selection-type None · flex-grow 1)
      ├─ #pinned (.ranking__pinned — C# 가 RankingRow.uxml 하나를 넣는다. 내 줄이 보이면 수식 클래스 hidden)
      ├─ .ranking__buttons (Button #jump-me · #reshuffle · #to-bottom)
      └─ Label #debug (makeItem · bindItem 호출 수)
RankingRow.uxml (.row > #cell-no · #rank · #delta · #crest · #name · #sub · #score · Button #cheer > .row__heart · #cheers)
RankingListUITK.cs (RankingEntry · RankingData 는 UGUI 폴더 것을 쓴다)`,
      steps: [
        '`listView.fixedItemHeight = itemHeight`, `virtualizationMethod = FixedHeight` — 높이가 같으면 ListView 가 보이는 범위를 계산해 **필요한 만큼만** 요소를 만든다(가상화가 기본). UGUI 판의 RecycledScroll 이 하던 일이 내장돼 있다.',
        '`makeItem = () => rowTemplate.Instantiate()` — 요소를 새로 만들 때만 불린다. 여기서 자식(Label · Button)을 찾아 `userData` 에 묶어 두고, 버튼 콜백을 **한 번만** 등록하고, 카운터를 하나 올린다(만든 셀 수).',
        '`bindItem = (element, index) => …` — 요소를 다른 항목에 다시 쓸 때마다 불린다. 글자 · 하트를 모두 설정하고(`EnableInClassList` 로 켜기 · 끄기를 한 번에), 콜백이 읽을 index 를 `cheer.userData = index` 로 넘긴다. 응원은 데이터를 바꾼 뒤 `RefreshItem(index)`.',
        '`itemsSource = entries`. 데이터만 바뀌면 `RefreshItems()`(보이는 요소만 다시 bind), 개수가 바뀌면 `Rebuild()`.',
        '내 순위로는 `listView.ScrollToItem(myIndex)`. 고정 행은 ListView 밖에 같은 템플릿 하나를 같은 채우기 함수로 채우고, `listView.Q<ScrollView>().verticalScroller.valueChanged` 에서 내 줄이 보이는지 확인해 숨긴다.',
      ],
      pitfalls: [
        '`bindItem` 안에서 `clicked += …` 를 하면 요소를 다시 쓸 때마다 콜백이 쌓여 한 번 눌러도 여러 번 불린다. 콜백은 `makeItem` 에서, index 는 `userData` 로.',
        'ListView 를 `ScrollView` 안에 넣거나 높이를 내용에 맞추면(`flex-grow` 없이 auto) 모든 항목이 보이는 것으로 계산돼 가상화가 꺼진 것과 같아진다. ListView 에 고정 높이나 `flex-grow: 1` 을 준다.',
        '행마다 높이가 다르면 `DynamicHeight` 가 필요하고 비용이 커진다. 랭킹 · 우편함처럼 같은 높이로 설계할 수 있으면 FixedHeight 가 가장 싸다.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '1,000명 랭킹 데이터(이름 조합 · 점수 분포 · 순위 변동), 문장 · 메달 · 하트 아이콘, 셀 풀 지도와 재배치 화살표, 카운터와 셀 그래프, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 특정 게임의 화면을 재현하지 않고 모바일 랭킹 · 우편함 목록의 장르 관례와 Unity 공식 문서의 재활용 · 가상화 원리로 만들었다.',
  references: [
    { label: 'Unity Learn — Optimizing Unity UI (Canvas 나누기 · 레이아웃 · 풀링)', url: 'https://learn.unity.com/tutorial/optimizing-unity-ui' },
    { label: 'Unity Manual — 런타임 UI 의 ListView 바인딩 (makeItem / bindItem)', url: 'https://docs.unity3d.com/Manual/UIE-runtime-binding-list-view.html' },
    { label: 'Unity 6.3 — ListView 스크립트 레퍼런스', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.ListView.html' },
    { label: 'Unity UGUI — ScrollRect (decelerationRate · elasticity)', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-ScrollRect.html' },
  ],
  related: [
    { id: 'red-dot-badge-tree', why: '우편함 항목의 받음 · 확인 상태와 알림 점 — 상태를 데이터에 두는 같은 원리' },
    { id: 'inventory-grid-tooltip', why: '항목이 많은 또 다른 목록. 격자에서는 행 대신 줄 단위로 같은 범위 계산을 한다' },
    { id: 'results-reward', why: '보상 받기 연출 — 우편함의 "모두 받기" 뒤에 이어지는 화면' },
  ],
}
