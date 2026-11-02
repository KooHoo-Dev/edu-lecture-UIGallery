import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'inventory-grid-tooltip',
  title: '인벤토리 그리드 + 툴팁 비교',
  titleEn: 'Inventory Grid with Compare Tooltip',
  group: 'E',
  order: 1,
  paradigms: ['non-diegetic', 'menu'],
  oneLiner: '희귀도는 색과 모양으로 한눈에, 장착품과의 차이는 툴팁이 대신 계산해 주고, 화면 끝 칸에서도 툴팁이 잘리지 않는 보관함',
  goals: [
    '희귀도를 **색 하나에 맡기지 않고** 테두리 모양·모서리 표식·글자로 이중 부호화할 수 있다',
    '비교 툴팁에서 절댓값 대신 **차이(▲▼ + 부호 있는 숫자)** 를 보여 주고, "낮을수록 좋은" 수치의 방향을 뒤집어 처리할 수 있다',
    '툴팁을 **크기를 잰 뒤 → 선호 방향 → 넘치면 뒤집기 → 그래도 넘치면 고정** 순서로 배치하는 코드를 UGUI 와 UI Toolkit 에서 각각 작성할 수 있다',
    '마우스 호버·키보드·게임패드 포커스·터치 탭이 **같은 툴팁 상태**로 모이도록 입력을 정리하고, 포커스를 따라 스크롤되는 그리드를 만들 수 있다',
  ],
  principles: ['인지 부하', '가독성', '접근성', '즉각 피드백', '일관성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['mouse', 'keyboard', 'gamepad', 'touch'],
  genres: ['루트 슈터', '액션 RPG', '모바일 RPG', '생존'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'columns', label: '열 개수', type: 'range', min: 4, max: 9, step: 1, default: 6, unit: '열', hint: '한 줄에 들어가는 칸 수. 칸 크기·한 화면에 보이는 줄 수·툴팁이 가장자리에 닿는 빈도가 함께 바뀐다. 9:16 에서는 4열 고정' },
    {
      key: 'rarityStyle',
      label: '희귀도 표시',
      type: 'select',
      default: 'color-shape',
      options: [
        { value: 'color-shape', label: '색 + 모양 (테두리·모서리 표식)' },
        { value: 'background', label: '배경색 + 모서리 표식' },
        { value: 'color-only', label: '색만 (나쁜 예)' },
        { value: 'off', label: '표시 없음' },
      ],
      hint: '색 + 모양: 단계마다 테두리 두께·이중선·잘린 모서리와 원·삼각·마름모·별 표식이 붙는다. 색만으로 바꾸면 색각 이상 플레이어에게는 개량(초록)·정예(파랑)·명품(보라)이 비슷해진다',
    },
    {
      key: 'compareMode',
      label: '장착품 비교',
      type: 'select',
      default: 'inline-delta',
      options: [
        { value: 'inline-delta', label: '한 툴팁 안에 차이 표시' },
        { value: 'side-by-side', label: '장착품 툴팁을 나란히' },
        { value: 'off', label: '비교 없음 (절댓값만)' },
      ],
      hint: '차이 표시: 수치마다 ▲▼ + 부호 있는 숫자 + 막대의 늘어난/줄어든 구간. 나란히: 두 카드를 눈으로 비교 — 화면을 두 배로 차지한다',
    },
    {
      key: 'tooltipAnchor',
      label: '툴팁 위치 방식',
      type: 'select',
      default: 'slot',
      options: [
        { value: 'slot', label: '칸 옆에 붙임 (패드·키보드에 맞음)' },
        { value: 'pointer', label: '커서를 따라감 (마우스 호버일 때)' },
        { value: 'panel', label: '고정 정보 패널' },
      ],
      hint: '커서 방식은 마우스 호버면 실제 커서에, 키보드·패드·자동 데모면 칸 안의 가상 커서(화살표)에 붙는다. 고정 패널은 위치가 늘 같아 읽기 쉽다 — 패널 자리를 비워 두려고 장착 패널을 좁게 접고 그리드 칸을 줄인다. 9:16 에서는 항상 하단 고정 패널',
    },
    { key: 'edgeCorrection', label: '가장자리 위치 보정', type: 'toggle', default: true, hint: '끄면 툴팁이 늘 칸 오른쪽에 놓여, 오른쪽 열과 맨 아래 줄에서 화면 밖으로 잘린다. "오른쪽 끝 칸 포커스"로 비교해 보자 (고정 패널에서는 효과 없음)' },
    { key: 'tooltipDelayMs', label: '툴팁 지연', type: 'range', min: 0, max: 800, step: 50, default: 250, unit: 'ms', hint: '마우스 호버 기준 대기 시간. 키보드·패드 포커스는 절반을 쓴다. 포커스 칸 아래쪽의 흰 막대가 차오르는 동안이 지연이다. 툴팁이 이미 떠 있으면 이웃 칸으로 옮길 때 지연 없이 바로 바뀐다' },
    {
      key: 'sortBy',
      label: '정렬 기준',
      type: 'select',
      default: 'rarity',
      options: [
        { value: 'rarity', label: '희귀도' },
        { value: 'power', label: '장비 점수' },
        { value: 'type', label: '종류 (머리·몸·손·동력·소모품)' },
        { value: 'none', label: '획득순' },
      ],
      hint: '바꾸면 아이템이 새 자리로 미끄러져 이동하고, 포커스는 보던 아이템을 따라간다',
    },
  ],
  presets: [
    {
      id: 'loot-compare',
      name: '수집형 비교 그리드',
      look: '같은 크기 칸에 희귀도 테두리가 또렷하고, 칸 옆 툴팁이 장착품 대비 ▲▼ 차이를 바로 알려 준다. 희귀도순이라 좋은 물건이 앞줄에 모인다',
      values: { columns: 6, rarityStyle: 'color-shape', compareMode: 'inline-delta', tooltipAnchor: 'slot', edgeCorrection: true, tooltipDelayMs: 200, sortBy: 'rarity' },
    },
    {
      id: 'mouse-side-by-side',
      name: '마우스 중심 나란히 비교',
      look: '작은 칸 8열에 종류별로 정렬하고, 커서를 따라다니는 툴팁에 장착품 카드를 나란히 붙인다. 정보는 많지만 화면을 넓게 덮는다',
      values: { columns: 8, rarityStyle: 'color-shape', compareMode: 'side-by-side', tooltipAnchor: 'pointer', edgeCorrection: true, tooltipDelayMs: 350, sortBy: 'type' },
    },
    {
      id: 'touch-panel',
      name: '터치 우선 고정 패널',
      look: '호버가 없는 터치를 가정해 큰 칸 4열, 지연 없이 탭 한 번에 고정 패널이 열리고 스와이프로 줄을 넘긴다. 패널 자리는 비워 두고 장착 패널은 좁게 접는다. 희귀도는 배경색 + 표식, 장비 점수순 정렬',
      values: { columns: 4, rarityStyle: 'background', compareMode: 'inline-delta', tooltipAnchor: 'panel', edgeCorrection: true, tooltipDelayMs: 0, sortBy: 'power' },
    },
  ],
  events: [
    { id: 'focus-edge-slot', label: '오른쪽 끝 칸 포커스 (가장자리 보정)' },
    { id: 'equip-focused', label: '선택한 아이템 장착' },
    { id: 'loot-drop', label: '새 아이템 획득' },
    { id: 'cycle-sort', label: '정렬 기준 바꾸기' },
    { id: 'toggle-rarity-filter', label: '희귀도 필터 (정예 이상)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'rarity-frame',
      title: '희귀도를 색과 모양으로 함께 말한다',
      body: '칸을 열지 않아도 귀한 물건이 먼저 눈에 들어와야 한다. 단계마다 **색**에 더해 **테두리 형태**(얇은 선 → 굵은 선 → 모서리 꺾쇠 → 이중선 → 잘린 모서리)와 **모서리 표식**(빈 네모·원·삼각·마름모·별)을 달고, 툴팁에는 단계 **이름**을 쓴다. "희귀도 표시"를 **색만**으로 바꿔 보면 개량·정예·명품이 색각에 따라 구분되지 않는다.',
      principle: '접근성',
    },
    {
      n: 2,
      part: 'compare-block',
      title: '뺄셈은 UI가 대신 한다',
      body: '출력 58과 30을 나란히 보여 주면 플레이어 머릿속에서 계산이 시작된다. 차이만 **▲ +28**처럼 붙이고, 막대에는 장착품 위치(눈금)와 늘어난/줄어든 구간을 칠한다. **무게처럼 낮을수록 좋은 수치**는 숫자가 커져도 ▼(나빠짐)이다 — 화살표는 숫자의 방향이 아니라 **좋고 나쁨**을 뜻하고, 기호·색·글자 범례가 같은 뜻을 세 번 싣는다. 비교 기준이 된 장착 칸에는 "비교 기준" 표시가 붙는다. 소모품처럼 비교할 장착품이 없으면 비교 블록을 통째로 빼고 보유 수량만 보여 준다.',
      principle: '인지 부하',
    },
    {
      n: 3,
      part: 'tooltip',
      title: '크기를 잰 뒤 놓고, 넘치면 뒤집는다',
      body: '툴팁 크기를 먼저 잰 다음 칸 오른쪽에 둔다. 화면 밖으로 넘치면 **왼쪽으로 뒤집고**, 그래도 넘치면 **화면 안으로 고정**한다. 위치는 애니메이션하지 않는다(뒤집힐 때 화면을 가로질러 미끄러지지 않게). "오른쪽 끝 칸 포커스"(오른쪽 끝 열 아래쪽의 장비)를 누른 뒤 "가장자리 위치 보정"을 꺼 보자 — 가장 중요한 수치가 화면 밖으로 사라진다.',
      principle: '가독성',
    },
    {
      n: 4,
      part: 'sort-bar',
      title: '정렬은 이동으로 이어 준다',
      body: '지금 적용된 정렬 기준과 필터를 늘 보이게 두고, 기준을 바꾸면 아이템이 새 자리로 **250ms 동안 미끄러진다**. 포커스는 칸 번호가 아니라 **보던 아이템**을 따라간다. 순간이동하면 방금 보던 물건을 다시 찾아야 한다. 필터에서 빠진 아이템은 지우지 않고 흐리게 남겨 자리가 흔들리지 않게 한다.',
      principle: '즉각 피드백',
    },
    {
      n: 5,
      part: 'hint-bar',
      title: '마우스·키보드·패드가 같은 툴팁으로',
      body: '마우스 호버, 키보드·패드 포커스, 터치 탭이 모두 **"이 칸을 보고 있다" 하나의 상태**로 모인다. 호버는 지연 250ms, 포커스는 그 절반을 쓰고, 이미 툴팁이 떠 있으면 이웃 칸으로 옮길 때 바로 바꾼다. 터치는 탭 = 선택, 한 번 더 탭 = 장착, 세로 스와이프 = 스크롤이다. 하단 안내는 마지막으로 쓴 입력 장치에 맞춰 바뀐다. 무대를 클릭한 뒤 방향키·Enter·Q·F·Esc 로 직접 조작해 보자 — Enter 는 고른 칸만 장착하고, 소모품이면 이유만 알린다(입력 소비).',
      principle: '일관성',
    },
  ],
  mistakes: [
    { title: '툴팁이 화면 밖으로 잘린다', body: '툴팁을 늘 칸 오른쪽에 두면 오른쪽 끝 열과 맨 아래 줄에서 잘린다. 레이아웃이 끝난 뒤 크기를 재고, 넘치는 축만 뒤집은 다음 화면 경계로 고정한다.' },
    { title: '희귀도를 색으로만 구분한다', body: '초록·파랑·보라는 색각 이상이 있으면 구분하기 어렵다. 단계별 모서리 표식·테두리 형태·툴팁 안 단계 이름을 함께 쓴다.' },
    { title: '비교 툴팁이 절댓값만 보여 준다', body: '두 숫자를 나란히 두기만 하면 플레이어가 직접 빼야 한다. 차이와 방향(▲▼)을 붙이고, 무게·재사용 대기처럼 **낮을수록 좋은 수치는 좋고 나쁨의 방향을 뒤집는다**.' },
    { title: '툴팁이 커서를 받아 깜빡인다', body: '툴팁이 입력을 받으면 커서가 툴팁에 올라간 순간 칸에서 "나감"이 생겨 닫혔다 다시 열리는 루프가 생긴다. UGUI 는 `CanvasGroup.blocksRaycasts = false`, UI Toolkit 은 `picking-mode="Ignore"`.' },
    { title: '고정 정보 패널이 보는 칸을 덮는다', body: '패널 위치를 고정하면 읽기는 쉽지만 재배치할 칸을 가린다. 출시작 디자이너도 인정한 문제다. 레이아웃 단계에서 패널 자리를 **비워 두고**(그리드 폭을 줄이거나 다른 패널을 접어) 패널과 그리드가 겹치지 않게 나눈다. 효과를 끄고 "터치 우선 고정 패널"을 보면 오른쪽 열이 패널 밑에 숨는다.' },
  ],
  juiceOff:
    '모든 칸이 같은 회색이라 희귀도를 알 수 없고, 툴팁은 지연 없이 칸을 옮길 때마다 새로 뜨며 커서를 받아 깜빡인다. 위치 보정이 없어 오른쪽 끝 칸에서는 **절반이 화면 밖으로 잘리고**, 고정 패널은 자리를 비우지 않아 **오른쪽 열을 덮으며**, 비교 없이 절댓값만 나와 장착품 수치를 기억해서 빼야 한다. 정렬하면 아이템이 **순간이동**해 방금 보던 물건을 찾을 수 없고, 어느 장착 칸이 비교 기준인지도 표시되지 않는다.',
  timings: [
    { event: '툴팁 표시 지연 (마우스 호버)', ms: 250, easing: 'none', note: '권장값. 키보드·패드 포커스는 절반(125ms). 이미 떠 있으면 이웃 칸으로 옮길 때 0ms' },
    { event: '툴팁 나타나기 (페이드 + 0.96→1 확대)', ms: 120, easing: 'ease-out', note: '권장값. 위치는 애니메이션하지 않고 뒤집기도 즉시' },
    { event: '포커스 커서 이동', ms: 80, easing: 'ease-out', note: '권장값' },
    { event: '정렬·필터 재배치 (아이템 미끄러짐)', ms: 250, easing: 'cubic-bezier(0.2, 0, 0, 1)', note: '권장값. 모션 줄이기면 0ms' },
    { event: '장착 교체 (칸 ↔ 장착 패널 튀어 오름)', ms: 180, easing: 'cubic-bezier(0.3, 1.3, 0.6, 1)', note: '권장값. 넘침은 5% 안팎' },
    { event: '새 아이템 펄스', ms: 600, easing: 'ease-in-out', note: '권장값. 한 번만 재생, 배지는 툴팁을 한 번 열면 사라짐' },
    { event: '공간 부족 흔들림', ms: 300, easing: 'ease-out', note: '권장값. 좌우 4px 이하. 모션 줄이기면 테두리 색만' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas (Screen Space - Overlay · CanvasScaler 1920×1080 · GraphicRaycaster)
├─ InventoryScreen (InventoryScreen.cs · InventoryDemo.cs)
│  ├─ EquippedPanel (VerticalLayoutGroup)
│  │  └─ EquipSlot_Head / _Body / _Hand / _Power (아래 Slot 프리팹을 그대로 씀 · SlotView 의 모든 참조 필요)
│  ├─ SortFilterBar (HorizontalLayoutGroup)
│  │  ├─ SortLabel (TMP_Text)
│  │  └─ FilterLabel (TMP_Text)
│  └─ GridScroll (ScrollRect · Horizontal 끔 · Clamped)
│     └─ Viewport (RectMask2D)
│        └─ Content (GridLayoutGroup · Fixed Column Count + ContentSizeFitter · 피벗 위쪽)
│           └─ Slot (프리팹 × N, SlotView.cs · CanvasGroup — 필터에서 흐리게)
│              ├─ Background (Image)
│              ├─ RarityFrame (Image · 단계별 9-슬라이스 스프라이트 + 색)
│              ├─ CornerMark (Image · 빈 네모/원/삼각/마름모/별)
│              ├─ Icon (Image)
│              ├─ Corner (TMP_Text · 점수 또는 ×수량)
│              ├─ UpgradeMark (▲) · NewBadge
│              └─ DelayBar (Image · Filled Horizontal)
├─ TooltipLayer (전체 화면 stretch · 피벗 0.5 · 맨 마지막 형제)
│  └─ Tooltip (TooltipView.cs · CanvasGroup blocksRaycasts 끔 · VerticalLayoutGroup + ContentSizeFitter · 피벗 0,0)
│     ├─ Header (Image 희귀도 띠 · CornerMark · TMP 단계 이름 · 종류 · EquippedBadge)
│     ├─ Name (TMP_Text) · VsLine (TMP_Text "장착 중인 ○○ 대비")
│     ├─ ScoreRow (TMP 점수 · TMP 차이)
│     ├─ CompareBlock → StatRow × 4 (StatRowView.cs)
│     └─ Description (TMP_Text)
└─ EventSystem (InputSystemUIInputModule)
Assets: InventoryItem.asset × N · RarityStyle.asset`,
      steps: [
        '**CanvasScaler** 를 `Scale With Screen Size`, 1920×1080 으로. EventSystem 에는 `InputSystemUIInputModule` 을 둔다 (Point·Navigate·Submit 을 새 Input System 의 UI 맵이 맡는다).',
        '`InventoryItem` (ScriptableObject) 에 이름·부위·희귀도·아이콘·능력치(출력·안정·내구·무게)를 넣고, `RarityStyle` 에셋에 단계별 색·테두리 스프라이트·모서리 표식 스프라이트·이름을 넣는다. 색과 모양을 **한 에셋에서 함께** 바꾸게 해 둘 중 하나만 빠지는 실수를 막는다. 기본 단계도 표식을 비우지 않고 빈 네모 스프라이트를 넣는다.',
        'GridScroll → Viewport(RectMask2D) → Content(GridLayoutGroup + ContentSizeFitter) 를 만들고 `Constraint = Fixed Column Count` 로 열 수를 고정한다. Content 피벗은 위쪽(0.5, 1).',
        'Slot 프리팹에 `SlotView` 를 붙인다. `Selectable` 을 상속해 `OnSelect`(패드·키보드)와 `OnPointerEnter`(마우스)를 **같은** `InventoryScreen.FocusSlot()` 으로 보낸다. 호버 지연은 `tooltipDelay`, 포커스는 그 절반.',
        'TooltipLayer 를 Canvas 의 **마지막 자식**으로 두어 마스크 밖·가장 위에 그린다. Tooltip 의 `CanvasGroup.blocksRaycasts` 와 안쪽 모든 Graphic 의 Raycast Target 을 끈다.',
        '`TooltipView.Show()` 는 내용 채우기 → `LayoutRebuilder.ForceRebuildLayoutImmediate()` 로 크기 확정 → 칸 모서리를 레이어 좌표로 변환 → 오른쪽 → 넘치면 왼쪽 → `Mathf.Clamp` 순서로 위치를 정하고, 알파·크기만 120ms 페이드한다.',
        '`StatRowView` 가 차이를 `▲ +28` / `▼ +1.6` 처럼 **기호 + 부호 있는 숫자**로 쓰고, `higherIsBetter` 가 false 인 수치(무게)는 좋고 나쁨을 뒤집는다.',
        '`InventoryDemo.cs` 를 붙이면 갤러리와 같은 숫자키(1 오른쪽 끝 칸 포커스 · 2 장착 · 3 획득 · 4 정렬 · 5 필터)로 시험할 수 있다.',
      ],
      pitfalls: [
        'ContentSizeFitter 는 다음 레이아웃 패스에서 크기를 정한다. 같은 프레임에 `rect.size` 를 읽으면 0이나 이전 값이 나오므로 `ForceRebuildLayoutImmediate` 를 먼저 부른다.',
        'Screen Space - Camera 캔버스면 `ScreenPointToLocalPointInRectangle` 에 캔버스 카메라를, Overlay 면 null 을 넘긴다.',
        '툴팁을 ScrollRect Content 아래에 두면 RectMask2D 에 잘린다. 반드시 마스크 밖 레이어에 둔다.',
        'ScrollRect 는 게임패드 포커스를 따라 스크롤하지 않는다. 선택된 칸의 줄 위치로 `content.anchoredPosition.y` 를 직접 맞춘다 (`InventoryScreen.ScrollIntoView`).',
        '정렬을 `SetSiblingIndex` 로만 하면 GridLayoutGroup 이 위치를 즉시 덮어써 순간이동한다. 미끄러짐이 필요하면 아이콘만 별도 레이어로 띄워 전후 위치 사이를 코루틴으로 보간한다(이 예제는 생략).',
        '`FindObjectOfType` 는 6.3 에서 obsolete. 화면·툴팁 참조는 인스펙터 직렬화로 연결한다.',
        '장착 칸(EquipSlot_*)도 같은 `SlotView` 를 쓴다. 장착 칸을 따로 만들면서 `CanvasGroup`·`DelayBar`·`NewBadge`·`UpgradeMark` 참조를 비워 두면 `Bind()` 에서 NullReferenceException 이 난다 — Slot 프리팹을 그대로 넣는다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + InventoryUITK.cs + InventoryUITKDemo.cs
└─ Inventory.uxml
   └─ #inventory-root (.inv-root)
      ├─ #equipped-panel (.equipped)  ← C# 가 .eq-slot 4개 생성 (.slot + Label.eq-slot__name)
      ├─ .inv-main
      │  ├─ #sort-filter-bar (.bar) > Label #sort-label · Label #filter-label
      │  └─ ScrollView #grid-scroll (Vertical)
      │     └─ #slot-grid (.slot-grid · flex-wrap)  ← C# 가 .slot.r-0~4 생성
      │        └─ .slot > RarityMarkElement.mark · .slot__icon · Label.slot__corner · Label.slot__up(▲) · Label.slot__new · .slot__delay
      └─ #tooltip-layer (.tooltip-layer · picking-mode Ignore)
         └─ #tooltip (.tooltip · picking-mode Ignore)
            ├─ .tt-head > RarityMarkElement #tt-mark (.mark) · Label #tt-rarity · Label #tt-kind · Label #tt-badge
            ├─ Label #tt-name · Label #tt-vs
            ├─ .tt-score > Label #tt-score · Label #tt-score-delta
            ├─ #tt-compare  ← C# 가 .stat 행 4개 생성
            └─ Label #tt-desc
(InventoryItem.cs 는 ugui 폴더의 것을 함께 쓴다 · 모서리 표식은 RarityMarkElement.cs 가 Painter2D 로 직접 그린다 — 에셋 불필요)`,
      steps: [
        '**Panel Settings** 를 `Scale With Screen Size`, 1920×1080 으로. UI Toolkit 만 쓰는 화면이면 EventSystem 은 필요 없다 (런타임 패널이 자체 이벤트 시스템으로 Input System 입력을 받는다).',
        'USS 에는 grid 가 없으므로 `#slot-grid` 를 `flex-direction: row; flex-wrap: wrap;` 로 두고, 열 수는 C# 에서 컨테이너 `width = 열 수 × (칸 + 여백)` 으로 고정한다.',
        '`SetRarity()` 가 칸에 `.r-0`~`.r-4`(테두리 색·두께·잘린 모서리)를 붙이고, 모서리 표식 `RarityMarkElement.Set(단계, 색)` 을 **항상 함께** 부른다. 표식은 `generateVisualContent` + `Painter2D`(MoveTo·LineTo·Arc·Fill)로 빈 네모·원·삼각·마름모·별을 직접 그려 스프라이트·VectorImage 에셋 없이도 모양 부호화가 빠지지 않는다. `[UxmlElement]` 라 UXML 에 `<RarityMarkElement>` 로 바로 쓴다.',
        '`PointerEnterEvent`·`FocusInEvent` 를 같은 `Focus(slot, isHover)` 로 보내고, `schedule.Execute(...).StartingIn(ms)` 로 지연 표시를 예약한다. 나갈 때는 예약을 `Pause()` 한다.',
        '`ShowTooltip()` 은 라벨을 채우고 `.tooltip--open` 을 붙인 뒤, `GeometryChangedEvent` 에서 `resolvedStyle` 크기가 확정되면 위치를 계산한다: `slot.worldBound` → `tooltipLayer.WorldToLocal()` → 오른쪽 → 넘치면 왼쪽 → `Mathf.Clamp`.',
        '포커스가 바뀌면 `ScrollView.ScrollTo(slot)` 로 보이게 한다.',
        '`InventoryUITKDemo.cs` 로 숫자키 1~5 이벤트를 시험한다.',
      ],
      pitfalls: [
        '`VisualElement.tooltip` 속성은 **에디터 UI 전용**이라 런타임 게임에서는 뜨지 않는다. 런타임 툴팁은 직접 만든다.',
        '툴팁 레이어가 화면 전체를 덮으므로 `picking-mode="Ignore"` 를 빠뜨리면 그리드 전체가 클릭되지 않거나, 툴팁이 커서를 가로채 깜빡인다. 레이어·툴팁·안쪽 Label 모두 Ignore.',
        '`resolvedStyle` 크기는 레이아웃 전에는 NaN 이거나 이전 값이다. 크기를 읽는 코드는 `GeometryChangedEvent` 안에서 실행한다.',
        'USS `transition` 을 `left`/`top` 에 걸면 뒤집힐 때 툴팁이 화면을 가로질러 미끄러진다. 전환은 `opacity`·`scale` 에만 건다.',
        '`RarityMarkElement` 는 `[UxmlElement]` 커스텀 요소다. 코드가 `UIGallery.InventoryGridTooltip` namespace 안에 있으므로 UXML 에는 `<UIGallery.InventoryGridTooltip.RarityMarkElement>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        'USS 는 gradient·box-shadow·filter 를 지원하지 않는다. 희귀도 배경 강조는 단색 `background-color` 의 알파로, 포커스는 `border-width` 로 표현한다.',
        '한글 글리프가 있는 Text Core **FontAsset** 을 지정하지 않으면 한글과 ▲▼ 기호가 깨진다. ▲▼ 가 폰트에 있는지 확인한다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Destiny 2 (2017)',
      credit: '© Bungie, Inc.',
      borrowed: [],
      learned:
        '조사한 근거 자료에서 이 게임의 인벤토리·비교 툴팁 화면을 검증하지 못했다. 그래서 빌린 시각 축은 없고, "장착 칸 + 후보 그리드 + 장착품 비교 툴팁 + 희귀도 색 구분"을 **루트 슈터 장르의 일반적인 관례**로만 다룬다. 실제 화면 묘사는 미확인이며, 색·단계 이름·표식 모양·문구는 모두 이 표본에서 새로 정했다.',
      link: 'https://www.bungie.net/7/en/Destiny',
    },
    {
      title: 'DREDGE (2023)',
      credit: 'Black Salt Games (개발) / Team17 (퍼블리싱)',
      borrowed: [],
      learned:
        '비교 사례. 공동 디자이너의 개발 글에서 **선택한 아이템의 상세 정보 패널이 격자 일부의 공간 정보를 가린다**는 문제를 디자이너 스스로 짚었다. 이 지적을 "고정 정보 패널" 위치 방식과 흔한 실수 항목으로 옮겨, 패널 자리를 레이아웃에서 비워 두고 장착 패널을 좁게 접어 패널이 격자를 덮지 않게 했다. 원작의 공간(모양이 다른 아이템) 격자·화면 구성은 따라 하지 않았다.',
      link: 'https://www.gamedeveloper.com/design/deep-dive-the-surprising-depth-of-spatial-inventories-in-dredge',
    },
  ],
  original:
    '희귀도 다섯 단계(기본·개량·정예·명품·유일)와 색, 단계별 테두리 형태(얇은 선·굵은 선·모서리 꺾쇠·이중선·잘린 모서리)와 모서리 표식(빈 네모·원·삼각·마름모·별), 능력치 이름(출력·안정·내구·무게)과 장비 점수 공식, 아이템 이름과 직접 그린 SVG 아이콘(렌치·절단기·헤드셋·바이저·반응로·냉각 셀·산소 캔 등), 세계관 문구(외곽 탐사대·하린·궤도 정비 기지), 포커스 커서와 지연 막대, 막대 위 장착품 눈금과 증감 구간, 툴팁 안 "좋아짐·나빠짐" 범례, 가장자리 보정 안내 띠, 커서 방식의 가상 커서, 고정 패널 자리를 비우는 접힌 장착 열, 9:16 의 상단 장착 띠 + 4열 + 하단 고정 패널 재배치는 모두 이 갤러리에서 새로 만든 것이다.',
  references: [
    { label: 'Game Developer — Deep Dive: The surprising depth of spatial inventories in DREDGE (Joel Mason)', url: 'https://www.gamedeveloper.com/design/deep-dive-the-surprising-depth-of-spatial-inventories-in-dredge' },
    { label: 'Destiny 공식 사이트 (Bungie)', url: 'https://www.bungie.net/7/en/Destiny' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/' },
    { label: 'uGUI 2.0 매뉴얼 — Grid Layout Group', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-GridLayoutGroup.html' },
    { label: 'uGUI 2.0 매뉴얼 — Scroll Rect', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-ScrollRect.html' },
    { label: 'Unity 6.3 — RectTransformUtility.ScreenPointToLocalPointInRectangle', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/RectTransformUtility.ScreenPointToLocalPointInRectangle.html' },
    { label: 'Unity 6.3 — VisualElement.tooltip (에디터 UI 전용)', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.VisualElement-tooltip.html' },
    { label: 'Unity 6.3 매뉴얼 — UI Toolkit 런타임 이벤트 시스템', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-Runtime-Event-System.html' },
  ],
  related: [
    { id: 'settings-accessibility', why: '색만으로 상태를 전달하지 않는 원칙을 색각 모드·고대비 설정 쪽에서 다룬다' },
  ],
}
