import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'crafting-recipe-panel',
  title: '제작 패널',
  titleEn: 'Crafting Recipe Panel',
  group: 'E',
  order: 8,
  paradigms: ['non-diegetic', 'menu'],
  oneLiner: '무엇이 몇 개 모자란지 "보유/필요"로 바로 읽히고, 제작 대기열은 진행과 환불을 보여 주며, 창을 다시 열어도 보던 자리가 그대로인 제작 창',
  goals: [
    '재료를 **보유/필요(3/5)** 로 나란히 보여 주고, 모자람을 **색 + ✕ 표식 + "2개 부족" 글자**로 함께 표시할 수 있다',
    '레시피 데이터와 인벤토리 수량 조회를 나누고, **인벤토리가 바뀔 때마다 레시피 상태 전체를 다시 계산**하는 이벤트 구조를 만들 수 있다',
    '제작 대기열을 타이머(코루틴) + `Image.fillAmount` 로 만들고, **취소하면 쓴 재료를 그대로 돌려주고 알릴** 수 있다',
    '창을 닫았다 열어도 **탭 · 선택 · 스크롤 위치**가 그대로 남도록 `OnDisable` 에 저장하고 `OnEnable` 에 복원할 수 있다',
  ],
  principles: ['인지 부하', '즉각 피드백', '접근성', '일관성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['mouse', 'keyboard', 'gamepad', 'touch'],
  genres: ['생존', '크래프팅', '샌드박스'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'stockScale', label: '보유 재료량', type: 'range', min: 0, max: 3, step: 0.25, default: 1, unit: '배', hint: '시작 자원 수량에 곱한다. 바꾸면 새 판으로 인벤토리를 다시 채우고 대기열을 비운다. 많을수록 "만들 수 있음" 줄이 늘어난다' },
    { key: 'craftTimeScale', label: '제작 시간', type: 'range', min: 0.25, max: 3, step: 0.25, default: 1, unit: '배', hint: '레시피 기본 시간에 곱한다. 목록 · 상세 · 대기열의 시간과 진행 바 속도가 함께 바뀐다' },
    { key: 'queueSize', label: '대기열 길이', type: 'range', min: 1, max: 5, step: 1, default: 3, unit: '칸', hint: '한 번에 걸어 둘 수 있는 제작 수. 가득 차면 제작 버튼이 이유를 알려 준다' },
    {
      key: 'shortageStyle',
      label: '모자란 재료 표시',
      type: 'select',
      default: 'icon-text',
      options: [
        { value: 'icon-text', label: '보유/필요 + 색 + ✕ 표식 + "n개 부족"' },
        { value: 'color-only', label: '보유/필요 + 색만' },
        { value: 'need-only', label: '필요량만 (×5)' },
      ],
      hint: '색만 쓰면 색각 이상이나 흑백 화면에서 3/5 와 5/5 의 차이가 숫자 비교로만 남는다. 필요량만 보이면 보유량은 플레이어가 인벤토리를 열어 세어야 한다',
    },
    { key: 'craftableOnly', label: '만들 수 있는 것만 보기', type: 'toggle', default: false, hint: '목록에서 지금 재료로 만들 수 없는 레시피를 숨긴다. 화면의 버튼(F)으로도 켜고 끈다' },
    {
      key: 'newBadgeClear',
      label: '새 레시피 배지',
      type: 'select',
      default: 'on-select',
      options: [
        { value: 'on-select', label: '그 레시피를 고르면 사라짐' },
        { value: 'on-open', label: '창을 다시 열면 모두 사라짐' },
        { value: 'off', label: '배지 없음' },
      ],
      hint: '배지는 레시피 줄과 그 레시피가 든 탭에 함께 붙는다. "창을 열면 모두 사라짐" 은 확인하지 않은 레시피의 표시까지 지운다 — "새 레시피 해금" 후 "창 닫았다 열기" 로 비교한다',
    },
    { key: 'restoreSelection', label: '닫았다 열 때 선택 복원', type: 'toggle', default: true, hint: '끄면 창을 열 때마다 전체 탭 · 첫 줄 · 맨 위로 돌아간다. "창 닫았다 열기" 로 비교한다' },
  ],
  presets: [
    {
      id: 'survival-standard',
      name: '생존 크래프팅 기본',
      look: '자원이 빠듯해 절반쯤만 만들 수 있다. 모자란 재료는 ✕ 와 "n개 부족"으로, 대기열은 3칸',
      values: { stockScale: 1, craftTimeScale: 1, queueSize: 3, shortageStyle: 'icon-text', craftableOnly: false, newBadgeClear: 'on-select', restoreSelection: true },
    },
    {
      id: 'sandbox-plenty',
      name: '샌드박스 풍족',
      look: '재료가 넉넉하고 제작은 빠르다. 만들 수 있는 것만 걸러 보고 대기열 5칸에 몰아서 건다',
      values: { stockScale: 2.5, craftTimeScale: 0.5, queueSize: 5, shortageStyle: 'icon-text', craftableOnly: true, newBadgeClear: 'on-select', restoreSelection: true },
    },
    {
      id: 'scarce-hardcore',
      name: '결핍형 하드코어',
      look: '재료가 반밖에 없고 제작은 두 배로 오래 걸린다. 대기열 1칸이라 무엇부터 만들지 고르는 판단이 중심',
      values: { stockScale: 0.5, craftTimeScale: 2, queueSize: 1, shortageStyle: 'icon-text', craftableOnly: false, newBadgeClear: 'on-select', restoreSelection: true },
    },
  ],
  events: [
    { id: 'gather', label: '재료 획득 (상태 다시 계산)' },
    { id: 'craft', label: '선택한 레시피 제작' },
    { id: 'cancel', label: '마지막 제작 취소 (환불)' },
    { id: 'unlock', label: '새 레시피 해금' },
    { id: 'reopen', label: '창 닫았다 열기 (선택 복원)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'ingredients',
      title: '보유/필요를 나란히, 모자람은 세 겹으로',
      body: '"회로 조각 ×5" 만 보여 주면 플레이어는 인벤토리를 열어 세어 봐야 한다. **3 / 5** 처럼 보유와 필요를 붙여 두고, 모자란 줄은 **빨간 테두리 · ✕ 표식 · "2개 부족" 글자 · 줄무늬 막대**로 함께 표시한다. 색만으로 표시하면 색각 이상이나 흑백 화면에서 숫자를 직접 비교해야 한다. "모자란 재료 표시" 를 바꿔 비교한다.',
      principle: '접근성',
    },
    {
      n: 2,
      part: 'recipe-list',
      title: '만들 수 있는 것을 먼저 보이게',
      body: '만들 수 있는 줄은 밝은 바탕 · 왼쪽 초록 띠 · "✓ ×2 가능", 못 만드는 줄은 아이콘과 이름을 흐리게 하고 "✕ 1종 부족" 으로 표시한다. 상태가 바뀌어도 **줄 순서는 바꾸지 않는다**. 순서가 바뀌면 고르던 줄이 다른 자리로 옮겨 간다. "재료 획득" 으로 드론 교란기가 가능해지면 그 줄만 잠깐 빛난다. 새로 해금된 레시피에는 "새" 배지가 줄과 탭에 함께 붙는다.',
      principle: '인지 부하',
      pin: 'inside',
    },
    {
      n: 3,
      part: 'stock',
      title: '레시피와 수량을 나누고, 바뀌면 전부 다시 계산',
      body: '레시피는 "무엇을 몇 개" 라는 고정 데이터, 인벤토리는 "지금 몇 개" 라는 바뀌는 데이터다. 상태(가능 · 부족)는 저장하지 않고 **인벤토리의 바뀜 이벤트**가 올 때마다 레시피 12개를 모두 다시 계산한다. 제작 · 취소 · 완성 · 획득이 모두 같은 길을 지나므로 목록 · 상세 · 버튼이 어긋나지 않는다. 효과를 끄면 창을 열 때 한 번만 계산해서, 재료를 얻어도 목록은 계속 "불가" 로 남는다.',
      principle: '일관성',
      pin: 'left',
    },
    {
      n: 4,
      part: 'queue',
      title: '대기열은 진행 · 남은 시간 · 취소를 함께 보여 준다',
      body: '맨 앞 칸만 진행 바가 차고 나머지는 "대기" 로 순서를 보여 준다. 재료는 **걸 때 바로 빼고**, 취소하면 쓴 만큼 돌려주며 "회로 조각 +5" 처럼 무엇이 돌아왔는지 알린다. 위의 보유 수량도 +5 로 튄다. 가득 찼을 때 제작을 누르면 버튼이 흔들리지 않고 대기열이 흔들려 원인을 짚는다. 창을 닫아도 제작은 계속된다.',
      principle: '즉각 피드백',
    },
    {
      n: 5,
      part: 'tabs',
      title: '다시 열면 보던 자리 그대로',
      body: '제작 창은 재료 하나 넣고 닫았다 다시 여는 일이 잦다. 열 때마다 첫 탭 · 첫 줄로 돌아가면 같은 레시피를 매번 다시 찾아야 한다. 닫을 때(`OnDisable`) **탭 · 탭별 선택 · 스크롤 위치**를 저장하고 열 때(`OnEnable`) 되살린다. 탭은 Q · E 로 넘긴다. 숫자 키는 갤러리 이벤트 키라 쓰지 않는다. "창 닫았다 열기" 를 눌러 보고, "닫았다 열 때 선택 복원" 을 꺼서 비교한다.',
      principle: '인지 부하',
    },
  ],
  mistakes: [
    { title: '필요량만 보여 준다', body: '"×5" 만 있으면 지금 몇 개 있는지는 플레이어가 인벤토리를 열어 세어야 한다. 보유/필요를 함께 쓰고, 모자란 개수까지 글자로 알려 준다.' },
    { title: '모자람을 빨간색으로만 표시한다', body: '색각 이상 플레이어나 흑백 화면에서는 3/5 와 5/5 가 같은 색으로 보인다. ✕ 표식 · "n개 부족" 글자 · 막대 길이를 함께 쓴다.' },
    { title: '레시피 상태를 창을 열 때 한 번만 계산한다', body: '창을 연 채 재료를 얻거나 쓰면 목록과 실제가 어긋난다. 상태를 따로 저장하지 말고 인벤토리 변경 이벤트에서 전부 다시 계산한다 (레시피 수백 개 정도면 충분히 싸다).' },
    { title: '취소하면 재료가 말없이 돌아온다', body: '환불됐는지 알려면 수량을 세어 봐야 한다. 돌아온 재료와 개수를 기록과 보유 수량 변화로 보여 준다. 재료를 완성 때 빼면 기다리는 동안 다른 데 써 버려 완성 순간 모자랄 수 있으니 걸 때 뺀다.' },
    { title: '창을 열 때마다 처음으로 돌아간다', body: '뷰를 새로 만들면서 선택 · 스크롤을 기본값으로 두면 생긴다. UI Toolkit 은 `UIDocument` 를 켤 때마다 트리를 다시 만들므로 저장 · 복원을 직접 해야 한다.' },
  ],
  juiceOff:
    '모자란 재료가 **"×5" 필요량만** 나와 보유량을 알 수 없고, 목록 상태는 **창을 열 때 한 번만 계산**해 재료를 얻어도 "불가" 로 남는다. 만들 수 있는 줄의 강조 · 새 레시피 배지 · 진행 바 · 남은 시간이 없고, 제작이 막혀도 이유를 말하지 않는다. 취소하면 재료는 돌아오지만 아무 표시가 없다. 창을 닫았다 열면 **매번 전체 탭 첫 줄 · 맨 위**로 돌아간다.',
  timings: [
    { event: '창 닫힘 (페이드 + 0.97 축소)', ms: 220, easing: 'ease-out', note: '권장값. 다시 열 때도 같은 시간으로 나타난다' },
    { event: '"만들 수 있음" 으로 바뀐 줄 강조', ms: 1100, easing: 'ease-out', note: '권장값. 한 번만, 모션 줄이기면 생략' },
    { event: '보유 수량 증감 표시 (+3 / −3)', ms: 900, easing: 'ease-out', note: '권장값' },
    { event: '막힌 제작 흔들림', ms: 300, easing: 'ease-out', note: '권장값. 좌우 6px 이하, 원인 쪽(버튼 또는 대기열)만' },
    { event: '대기열 칸 들어옴', ms: 220, easing: 'ease-out', note: '권장값' },
    { event: '복원 안내 표시', ms: 3000, easing: 'ease-in (마지막 20% 페이드)', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `CraftingStation (CraftingStation.cs · CraftingDemo.cs · 늘 켜져 있음 — 인벤토리 · 대기열 · 코루틴 · 아이템 이름/아이콘 표)
Canvas (Screen Space - Overlay · CanvasScaler 1920×1080 · GraphicRaycaster)
└─ CraftingWindow (CraftingPanel.cs · 껐다 켜는 창 — OnDisable 저장 / OnEnable 복원)
   ├─ Stock (HorizontalLayoutGroup) └─ StockLabel_× 4 (TMP_Text)
   ├─ ListPanel
   │  ├─ Tabs (HorizontalLayoutGroup) └─ Tab_× 4 (Button + TMP_Text + NewBadge)
   │  ├─ Search (TMP_InputField) · CraftableOnly (Toggle)
   │  └─ RecipeScroll (ScrollRect · Vertical) └─ Viewport (RectMask2D) └─ Content (VerticalLayoutGroup + ContentSizeFitter)
   │     └─ RecipeRow (프리팹 × N, RecipeRowView.cs · transition None)
   │        ├─ Background (Image) · SelectFrame (Image) · OkBar (Image)
   │        ├─ Icon (Image) · Name (TMP_Text) · State (TMP_Text "✓ ×2 가능" / "✕ 1종 부족")
   │        └─ NewBadge (GameObject)
   ├─ Detail
   │  ├─ DetailIcon (Image) · DetailName · DetailMeta (TMP_Text)
   │  ├─ Ingredients (VerticalLayoutGroup) └─ IngredientRow × 3 (Image Icon · TMP Name · TMP Count "3 / 5" · TMP Tag "✕ 2개 부족")
   │  └─ CraftButton (Button) · Reason (TMP_Text)
   └─ Queue (VerticalLayoutGroup)
      └─ QueueSlot × 5 (Image Fill — Type Filled · Horizontal · TMP Name · TMP Time · Button Cancel)
EventSystem (InputSystemUIInputModule)
Assets: Recipe.asset × N (ScriptableObject)`,
      steps: [
        '`Recipe` (ScriptableObject) 에 표시 이름 · 탭 · 아이콘 · 제작 시간 · 재료 목록(`Ingredient { itemId, count }`) · 결과 아이템 id 를 넣는다. 레시피는 **고정 데이터**라 수량 상태를 넣지 않는다.',
        '`Inventory` 는 일반 C# 클래스다. `Add` · `TryTake` 가 수량을 바꾼 뒤 `Changed` 이벤트를 한 번 부른다. `Recipe.Evaluate(inventory)` 는 **조회만** 해서 `RecipeStatus`(가능 여부 · 최대 개수 · 모자란 재료 목록)를 돌려준다.',
        '`CraftingStation` 을 늘 켜져 있는 오브젝트에 붙인다. 인벤토리(시작 수량) · 레시피 목록 · 아이템 이름/아이콘 표(`ItemInfo`)와 대기열을 갖고, 코루틴이 맨 앞 작업의 `elapsed` 를 올린다. 창(`CraftingWindow`)을 꺼도 제작은 계속된다.',
        '`CraftingPanel.OnEnable` 에서 `station.Inventory.Changed += RecomputeAll` 로 구독하고, `RecomputeAll` 은 모든 줄의 `RecipeRowView.Bind(status)` 와 상세 패널을 다시 채운다. `OnDisable` 에서 꼭 구독을 푼다.',
        '저장 · 복원: `OnDisable` 에서 탭 · 탭별 선택 · `ScrollRect.verticalNormalizedPosition` 을 필드에 저장하고, `OnEnable` 에서 되살린다. 스크롤은 레이아웃이 끝난 뒤 적용해야 하므로 `Canvas.ForceUpdateCanvases()` 다음에 넣는다.',
        '`RecipeRowView` 는 `Selectable` 을 상속하고 `transition = None` 으로 둔다. 그래서 `OnSelect` · `OnDeselect` 에서 SelectFrame 을 **직접** 켜고 끈다. 그래야 키보드 · 패드로 고른 줄이 보인다.',
        '대기열 칸은 `Image.type = Filled` 로 두고 `CraftingPanel.Update` 에서 `fill.fillAmount = job.Progress` 를 넣는다. 취소 버튼은 `station.Cancel(index)` → 재료 환불 → `Changed` → 목록이 다시 계산된다.',
        '`CraftingDemo` 를 CraftingStation 에 붙이고 창 GameObject 를 연결하면 G 재료 획득 · U 새 레시피 해금 · R 창 닫았다 열기로 시험할 수 있다 (UI Toolkit 창에도 그대로 쓴다).',
        '탭 넘김은 Q · E (패드 L · R 어깨 버튼). 핫바를 붙인다면 Input System 에 숫자 키 액션(`<Keyboard>/1` …)을 따로 만들 수 있지만, 이 갤러리 웹판은 숫자 키가 이벤트 단축키라 쓰지 않았다.',
      ],
      pitfalls: [
        '`OnEnable` 에서 구독하고 `OnDisable` 에서 풀지 않으면, 창을 열 때마다 구독이 쌓이고 꺼진 창의 줄까지 갱신하려다 `MissingReferenceException` 이 난다.',
        '`verticalNormalizedPosition` 을 `OnEnable` 첫 줄에서 바로 넣으면 ContentSizeFitter 가 아직 크기를 정하지 않아 무시된다. `Canvas.ForceUpdateCanvases()` 다음에 넣거나 한 프레임 뒤에 넣는다.',
        '`Selectable.transition = None` 인데 `OnSelect` 에서 표시를 그리지 않으면 키보드 · 패드로 고른 줄이 화면에 보이지 않는다.',
        'ScriptableObject 레시피에 런타임 상태(수량 · 가능 여부)를 쓰면 에디터 플레이 모드가 끝나도 에셋에 남는다. 상태는 런타임 객체에만 둔다.',
      ],
    },
    uitk: {
      hierarchy: `CraftingStation (ugui 폴더의 CraftingStation.cs · CraftingDemo.cs — 늘 켜져 있음)
UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + CraftingUITK.cs
└─ Crafting.uxml
   └─ #crafting-root (.craft-root)
      ├─ .head > Label.title · #stock (.stock)  ← C# 가 자원 Label 4개 생성
      ├─ .list-panel
      │  ├─ #tabs (.tabs) > Button.tab × 4 (#tab-all · #tab-maint · #tab-survive · #tab-gear)
      │  ├─ .tools > TextField #search · Toggle #craftable-only
      │  └─ ScrollView #recipe-list (Vertical)  ← C# 가 .row 생성 (focusable)
      ├─ .detail > Label #d-name · Label #d-meta · #ingredients (← C# 가 .ing 생성) · Button #craft · Label #reason
      └─ .queue-panel > #queue  ← C# 가 .job 생성 (.job__fill 폭 % · Button.job__cancel)
(Recipe · Inventory · CraftingStation 은 ugui 폴더의 것을 함께 쓴다)`,
      steps: [
        '**Panel Settings** 를 `Scale With Screen Size`, 1920×1080 으로. UI Toolkit 만 쓰는 화면이면 EventSystem 은 필요 없다.',
        '갱신 방식은 **직접 갱신**을 골랐다. 인벤토리 `Changed` 한 곳에서 `RecomputeAll()` 이 줄 클래스(`.row--ok`)와 글자를 바꾼다. runtime data binding 은 레시피마다 상태 객체(`INotifyBindablePropertyChanged`)와 "3 / 5" · 클래스 토글용 변환기가 필요하다. "수량이 바뀌면 전부 다시 계산" 하는 구조에서는 바인딩이 대신해 주는 일이 적고, 수업에서 흐름을 따라가기도 직접 갱신이 쉽다.',
        '줄은 `focusable = true` 인 `VisualElement` 로 만들고 `FocusInEvent` 에서 선택한다. 위아래 이동은 `NavigationMoveEvent` 를 직접 처리하고 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(evt)` 를 부른다.',
        '`UIDocument` 는 켤 때마다 트리를 새로 만든다. `OnDisable` 에서 탭 · 탭별 선택 · `ScrollView.scrollOffset` 을 필드에 저장하고, `OnEnable` 에서 다시 만든 뒤 `GeometryChangedEvent` 로 레이아웃이 끝나면 `scrollOffset` 을 되살린다.',
        '대기열 진행은 `Update` 에서 `.job__fill` 의 `style.width = Length.Percent(진행 × 100)` 으로 칠한다 (UI Toolkit 에는 Filled 이미지가 없다).',
      ],
      pitfalls: [
        '`scrollOffset` 을 `OnEnable` 에서 바로 넣으면 내용 크기가 0 이라 0 으로 잘린다. `GeometryChangedEvent` 에서 한 번만 넣고 콜백을 해제한다.',
        '`NavigationMoveEvent` 를 처리하고 `StopPropagation()` 만 부르면 Unity 6.3 은 기본 포커스 이동을 한 번 더 해서 한 칸씩 건너뛴다. `focusController?.IgnoreEvent(evt)` 를 함께 부른다.',
        '`TextField` 에 포커스가 있는 동안에는 Q · E 가 글자로 들어가야 한다. 탭 단축키는 검색창 포커스가 아닐 때만 처리한다.',
        '한글과 ✓ ✕ 기호가 든 Text Core **FontAsset** 을 지정하지 않으면 글자가 네모로 깨진다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: '7 Days to Die (2013)',
      credit: '© The Fun Pimps',
      borrowed: [],
      learned:
        '조사 카드가 근거로 든 커뮤니티 위키의 "Crafting Window" 문서가 이 게임의 제작 창을 다룬다는 것까지만 확인했다. 그래서 **레시피 목록 + 재료 확인 + 제작 대기열** 을 한 창에 두는 생존 장르 관례의 대표 사례로만 들었다. 실제 화면의 배치 · 색 · 문구는 미확인이라 빌린 시각 축은 없다.',
      link: 'https://7daystodie.wiki.gg/wiki/Crafting_Window',
    },
    {
      title: "Don't Starve Together (2016)",
      credit: '© Klei Entertainment',
      borrowed: [],
      learned:
        '조사 카드가 근거로 든 것은 개발사 포럼의 이용자 제안 글(제작 메뉴 UI 아이디어)이다. 공식 설계 자료가 아니므로 "새로 해금된 레시피 표시" 같은 요구가 플레이어 쪽에서 나온다는 참고로만 썼다. 원작 화면 묘사는 미확인이다.',
      link: 'https://kleiforums.com/forums/topic/164742-crafting-menu-ui-idea/',
    },
  ],
  original:
    '세 칸 배치, 레시피 12개와 재료 · 시간, SVG 아이콘, 보유/필요 + ✕ 표식 + "n개 부족" + 줄무늬 막대, 초록 띠와 "새로 가능" 강조, 탭까지 붙는 "새" 배지, 재계산 횟수 줄, 환불 기록, 원인 쪽만 흔드는 막힘 피드백, 복원 안내 띠, 세계관 문구는 모두 새로 만들었다.',
  references: [
    { label: '7 Days to Die 위키 — Crafting Window', url: 'https://7daystodie.wiki.gg/wiki/Crafting_Window' },
    { label: 'Klei 포럼 — 이용자 제안: Crafting menu UI idea', url: 'https://kleiforums.com/forums/topic/164742-crafting-menu-ui-idea/' },
    { label: 'Roblox Creator Docs — UI/UX design', url: 'https://create.roblox.com/docs/production/game-design/ui-ux-design' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/' },
    { label: 'uGUI 2.0 — Image.fillAmount', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/UnityEngine.UI.Image.html' },
    { label: 'Unity 6.3 매뉴얼 — UI Toolkit runtime data binding', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-runtime-binding.html' },
  ],
  related: [
    { id: 'inventory-grid-tooltip', why: '같은 세계관의 보관함. 슬롯 · 툴팁 · 희귀도 표시 문법을 이 창의 아이콘 · 수량 표기와 맞췄다' },
    { id: 'red-dot-badge-tree', why: '"새 레시피" 배지가 줄과 탭에 함께 붙는 구조를 부모 = 자식의 합 트리로 일반화한다' },
    { id: 'recycled-scroll-list', why: '레시피가 수백 개로 늘면 목록 줄을 재활용해야 한다' },
  ],
}
