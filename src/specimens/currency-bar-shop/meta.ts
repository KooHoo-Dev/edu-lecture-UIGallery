import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'currency-bar-shop',
  title: '재화 바 · 상점 · 구매 확인',
  titleEn: 'Currency Bar, Shop & Purchase Confirmation',
  group: 'E',
  order: 9,
  paradigms: ['menu', 'meta'],
  oneLiner: '늘 위에 있는 재화 바 → 상점 진열 → 가격 · 구매 후 잔액 · 청약철회를 보여 주는 확인 창 → 산 재화가 바로 날아가 숫자가 오르는 한 흐름. 같은 화면을 다크패턴으로 바꿔 비교한다',
  goals: [
    '재화 바를 **씬이 바뀌어도 남는 공용 UI** 로 두고, 지갑 데이터의 변경 이벤트를 구독해 숫자를 갱신하는 구조를 만들 수 있다',
    '구매 확인 창에 들어갈 정보 — **실제 가격(원화 환산) · 구매 후 잔액 · 청약철회 가능 여부 · 부족할 때의 충전 안내** — 를 빠짐없이 배치할 수 있다',
    '확인 버튼에 **누른 시각 기준 입력 잠금**을 걸고, 결제 확인 중에는 버튼을 막아 두 번 사지 않게 할 수 있다',
    '얻은 재화가 **바로 날아간 뒤 숫자가 오르는** 피드백(베지어 경로 + 카운트업)을 만들고, 다크패턴(가격 숨기기 · 앵커링 · 구매 기본 선택 · 유인 문구)을 구별해 설명할 수 있다',
  ],
  principles: ['가독성', '즉각 피드백', '일관성', '시각 위계', '접근성'],
  platforms: ['mobile', 'pc'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['모바일 RPG', '수집형 RPG', '라이브 서비스'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    {
      key: 'uiMode',
      label: '상점 UI',
      type: 'select',
      options: [
        { value: 'honest', label: '정직한 UI' },
        { value: 'dark', label: '다크패턴 (하지 말아야 할 예)' },
      ],
      default: 'honest',
      hint: '다크패턴은 화면에 "하지 말아야 할 예" 라고 표시하고, 넣은 패턴마다 빨간 꼬리표를 붙인다: 결정으로만 적은 가격, 비싼 상품을 먼저 크게(가짜 원래 가격), 구매를 기본 선택으로(자동 충전 체크 · 구매 버튼에 포커스), "닫으면 다시 살 수 없다" 와 다시 도는 타이머',
    },
    { key: 'inputLockMs', label: '확인 창 입력 잠금', type: 'range', min: 0, max: 800, step: 50, default: 350, unit: 'ms', hint: '창이 뜬 직후 구매 버튼을 막는 시간(누른 시각 기준). "창 뜬 직후 연타" 로 비교 — 0 이면 연타가 그대로 구매를 누른다' },
    { key: 'flyCount', label: '날아가는 아이콘 수', type: 'range', min: 1, max: 16, step: 1, default: 8, unit: '개', hint: '산 재화가 재화 바로 날아가는 아이콘 수 (에너지는 절반). 미리 만들어 둔 40개를 돌려쓴다' },
    { key: 'countUpMs', label: '숫자 올리기 시간', type: 'range', min: 0, max: 2000, step: 100, default: 900, unit: 'ms', hint: '첫 아이콘이 바에 닿은 뒤 숫자가 목표까지 오르는 시간. 값이 크든 작든 같은 시간에 끝난다. 0 이면 닿는 순간 바뀐다' },
  ],
  presets: [
    { id: 'honest', name: '정직한 상점', look: '원화 환산 · 구매 후 잔액 · 청약철회 · 잠금 350ms · 아이콘 8개', values: { uiMode: 'honest', inputLockMs: 350, flyCount: 8, countUpMs: 900 } },
    { id: 'dark-pattern', name: '다크패턴 비교 (하지 말아야 할 예)', look: '같은 상품 · 같은 잔액에 패턴 4가지를 얹는다', values: { uiMode: 'dark', inputLockMs: 350, flyCount: 8, countUpMs: 900 } },
    { id: 'quick-repeat', name: '빠른 반복 구매', look: '아이콘 4개 · 0.4초 카운트업 · 잠금 250ms — 여러 번 사는 화면용 짧은 피드백', values: { uiMode: 'honest', inputLockMs: 250, flyCount: 4, countUpMs: 400 } },
    { id: 'no-lock', name: '잠금 없음 (수업 확인용)', look: '"창 뜬 직후 연타" 를 누르면 첫 탭이 바로 구매된다', values: { uiMode: 'honest', inputLockMs: 0, flyCount: 8, countUpMs: 900 } },
  ],
  events: [
    { id: 'buy', label: '묶음 상품 열기' },
    { id: 'confirm', label: '확인 누르기' },
    { id: 'short', label: '재화 부족 (비싼 상자)' },
    { id: 'charge', label: '결정 충전 (₩5,900)' },
    { id: 'energy', label: '에너지 + 충전' },
    { id: 'mash', label: '창 뜬 직후 연타' },
    { id: 'reset', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'bar',
      title: '재화 바는 늘 같은 자리에',
      body: '크레딧 · 궤도 결정 · 에너지가 화면 맨 위에 늘 있고, 확인 창이 떠도 **어둡게 덮이지 않는다** — 사기 전에 잔액을 다시 볼 수 있다. 결정 · 에너지 옆 **+** 는 충전으로 가는 길이다. 정직한 UI 는 충전 상품 목록을 보여 주고 고르게 한다. 다크패턴은 + 가 가장 비싼 상품 창을 바로 연다. Unity 에서는 씬이 바뀌어도 남는 공용 UI(UGUI `DontDestroyOnLoad`, UI Toolkit 공용 UIDocument)가 지갑의 변경 이벤트를 듣는다.',
      principle: '일관성',
      pin: 'below',
    },
    {
      n: 2,
      part: 'shelf',
      title: '할인 · 한정 기간은 사실만',
      body: '할인율은 **실제로 팔던 가격**(지난주 375)과 비교하고, 한정 기간은 진열과 확인 창이 **같은 종료 시각**을 센다. 묶음 가격 옆에 원화 환산(결정 1개 ≈ ₩20, 기본 충전 기준)을 적는다. 다크패턴으로 바꾸면 비싼 상자와 ₩99,000 상품이 먼저 크게 놓이고(가격 앵커링 — 뒤 상품이 싸 보인다), 할인율은 가짜 원래 가격과 비교한 −70%, 가격은 결정으로만 적힌다.',
      principle: '시각 위계',
    },
    {
      n: 3,
      part: 'price',
      title: '가격 · 구매 후 잔액 · 청약철회',
      body: '확인 창은 "정말 사겠습니까?" 가 아니라 **판단할 정보**를 준다. 가격(결정 300 · 약 ₩6,000), 구매 후 잔액(680 → 380), 청약철회 가능 여부(에너지처럼 바로 쓰이는 상품은 **불가를 미리** 알린다). 재화가 모자라면 "820개 부족" 과 **충전 상품 보기** 버튼 — 이 창에서 몰래 결제하지 않는다. 문구는 예시이고 실제 조건은 약관 · 스토어 정책에 맞춘다.',
      principle: '가독성',
      pin: 'left',
    },
    {
      n: 4,
      part: 'lock',
      title: '확인 버튼 입력 잠금',
      body: '상품을 누르던 손가락이 막 뜬 창의 구매 버튼을 그대로 누르지 않게, 창이 뜬 뒤 350ms 는 구매를 막는다(`createInputLock`, **누른 시각**으로 판정 — 늦게 처리된 프레임이 잠금을 피하지 못한다). 정직한 UI 는 기본 선택이 **취소**다. 원화 결제는 스토어 확인을 기다리는 동안 버튼을 막아 두 번 결제되지 않게 한다. "창 뜬 직후 연타" 로 확인하고, "잠금 없음" 프리셋과 비교한다.',
      principle: '접근성',
      pin: 'right',
    },
    {
      n: 5,
      part: 'fly',
      title: '날아간 뒤 오르는 숫자',
      body: '산 재화의 아이콘이 확인 창에서 **자기 재화 칸으로** 날아가고(2차 베지어, 끝으로 갈수록 빨라짐), 첫 아이콘이 닿으면 칸이 살짝 커지며 숫자가 `createCountUp` 으로 오른다. 칸 아래 "+15,000" 이 무엇을 얼마나 얻었는지 남긴다. 쓰는 재화는 기다릴 이유가 없어 **바로** 줄인다. 효과를 끄면 숫자만 바뀌어 무엇이 들어왔는지 놓친다.',
      principle: '즉각 피드백',
      pin: 'below',
    },
  ],
  mistakes: [
    {
      title: '확인 창에 가격과 잔액이 없다',
      body: '"구매하시겠습니까? [예] [아니요]" 만 있으면 사람은 머릿속으로 잔액을 계산해야 한다. 가격(원화 환산 포함), 구매 후 잔액, 청약철회 가능 여부를 창 안에 둔다.',
    },
    {
      title: '재화 단위로 실제 가격을 가린다',
      body: '결정 300 이 얼마인지 알려면 충전 상품표를 거꾸로 계산해야 한다. 충전 묶음 크기를 일부러 상품 가격과 어긋나게 두면 남는 재화 때문에 또 충전하게 된다. 묶음 가격 옆에 원화 환산을, 충전 상품에는 100개당 가격을 적는다.',
    },
    {
      title: '"이 창을 닫으면 다시 살 수 없습니다"',
      body: '압박하는 유인 문구와 닫아도 다시 도는 가짜 타이머. 후보 카드의 요약(출처: 게임메카 · 뉴시스 보도)에 따르면 국내에서 공정위가 이런 유인 문구와, 환불 가능한 아이템을 환불 불가로 안내한 것을 제재한 사례가 있다(법률 조언이 아니다 — 실제 기준은 법령 · 스토어 정책으로 확인). 한정 기간이 사실이면 진열과 같은 종료 시각을 담담하게 적는다.',
    },
    {
      title: '구매를 기본 선택으로 둔다',
      body: '구매 버튼에 포커스를 두거나 "부족분 자동 충전" 을 미리 체크해 두면, Enter 한 번 · 습관적인 탭 한 번이 결제가 된다. 기본 선택은 취소, 부족하면 충전 상품을 직접 고르게 한다.',
    },
    {
      title: '획득 피드백 없이 숫자만 바꾼다',
      body: '여러 재화가 한꺼번에 들어오면 어떤 숫자가 얼마나 바뀌었는지 놓친다. 아이콘이 그 칸으로 날아가고, 닿은 뒤 숫자가 오르며, "+N" 이 잠시 남게 한다.',
    },
  ],
  juiceOff:
    '흔한 실수 두 가지. 확인 창에 **구매 후 잔액 줄이 없다** — 가격만 보고 남는 양은 머리로 계산해야 한다. 구매 뒤에는 **아이콘 비행 · 칸 강조 · +N 표시 없이 숫자만 바뀐다** — 묶음처럼 크레딧과 에너지가 함께 들어오면 무엇을 얼마나 얻었는지 놓친다. (실제 가격 숨기기는 다크패턴 쪽에서 비교한다.)',
  timings: [
    { event: '확인 창 등장', ms: 180, easing: 'ease-out (불투명도 + 크기 0.96 → 1)', note: '권장값' },
    { event: '확인 버튼 입력 잠금', ms: 350, easing: '—', note: '권장값 (입력 잠금 0.2~0.4초 범위)' },
    { event: '스토어 결제 확인 (모의)', ms: 600, easing: '—', note: '모형 값. 실제는 네트워크 · 스토어에 따라 다르므로 콜백을 받은 뒤 지급' },
    { event: '아이콘 비행', ms: 700, easing: 'ease-in (t²) · 2차 베지어', note: '권장값. 아이콘마다 50ms 간격, 재화 종류마다 160ms 간격' },
    { event: '숫자 올리기', ms: 900, easing: 'easeOutCubic', note: '권장값. 첫 아이콘이 닿은 뒤 시작, 값 크기와 무관하게 같은 시간' },
    { event: '+N 표시', ms: 1800, easing: '마지막 0.4초 페이드', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `PersistentUI (DontDestroyOnLoad — CurrencyBar.cs 가 Awake 에서 남긴다)
└─ Canvas_CurrencyBar (Screen Space - Overlay · Sort Order 높게 · Canvas Scaler 1920×1080)
   ├─ Slots (HorizontalLayoutGroup)
   │  └─ Slot_Credit · Slot_Gem · Slot_Energy (Image 배경 · Image 아이콘 · TextMeshProUGUI 숫자 · TextMeshProUGUI +N · Button +)
   └─ FlyLayer (RectTransform 전체 · Raycast Target 끈 아이콘 프리팹을 풀에서 꺼내 쓴다)
ShopScene
└─ Canvas_Shop (Sort Order 낮게)
   ├─ ShopScreen (ShopScreen.cs — 진열 · 시험용 키 F1 · F2)
   │  ├─ BundleGrid (GridLayoutGroup) > BundleCard 프리팹 (Button transition None + ShopItemCard.cs · SelectedFrame)
   │  ├─ PackList (VerticalLayoutGroup) > PackCard 프리팹 (같은 ShopItemCard.cs)
   │  └─ PackHighlight (Image 테두리 — 충전 안내 때만 켠다)
   └─ ConfirmPanel (PurchaseConfirmPanel.cs · CanvasGroup)
      ├─ Dim (Image · Raycast Target 켬 — 뒤 진열을 막는다)
      └─ Window (아이콘 · 이름 · Price · AfterBalance · Refund · ShortBox · CancelButton · BuyButton · LockBar Image Filled)
EventSystem (InputSystemUIInputModule)
ShopData.cs — Currency · Product · Wallet(변경 이벤트) · MockStore (Unity IAP 연결 지점)`,
      steps: [
        '`Wallet` 은 MonoBehaviour 가 아닌 일반 클래스로, 잔액 사전과 `event Action<Currency, int, int> Changed` 를 가진다. `Wallet.Shared` 하나를 재화 바와 상점이 같이 쓴다. 상품표(`Catalog.Default()` 의 `List<Product>`)도 데이터로만 두고 진열 · 확인 창이 같은 값을 읽는다 — 원화 환산 · 할인율 · 남은 시간은 화면마다 적지 않고 계산한다.',
        '`CurrencyBar` 는 Awake 에서 이미 있으면 자신을 지우고, 없으면 `DontDestroyOnLoad(transform.root.gameObject)`. `Wallet.Changed` 를 구독해 **줄어들면 바로**, 늘어나면 날아온 아이콘이 닿은 뒤 카운트업으로 숫자를 바꾼다.',
        '코인 비행: `CurrencyBar.Fly(currency, amount, fromScreenPos)` 가 `ObjectPool<Image>` 에서 아이콘을 꺼내 2차 베지어(시작 · 조절점 · 칸 아이콘)로 옮긴다. 첫 아이콘이 닿으면 칸을 키웠다 줄이고 숫자 올리기 코루틴을 시작한다. 다 쓰면 `Release`.',
        '`PurchaseConfirmPanel.Open(product)` 은 가격(원화 환산), 구매 후 잔액, 청약철회 문구를 채우고, 부족하면 구매 버튼 글자를 "충전 상품 보기" 로 바꾼다. 기본 선택은 `EventSystem.SetSelectedGameObject(cancelButton)`. `unlockAt = Time.unscaledTime + inputLockSeconds`.',
        '구매 버튼의 누른 시각은 `EventTrigger`(PointerDown)로 받아, `onClick` 에서 그 시각이 `unlockAt` 보다 이르면 무시한다(키보드 Submit 은 지금 시각). 통과하면 버튼을 끄고 `MockStore.Purchase` → 콜백에서 지갑에 반영 → `CurrencyBar.Fly`.',
        '`ShopItemCard` 는 `Button.transition = None` 이라 선택 표시를 `ISelectHandler` · `IDeselectHandler` 로 직접 그린다(테두리 Image 켜고 끄기). 안 그리면 패드 · 키보드로 고른 카드가 보이지 않는다.',
      ],
      pitfalls: [
        '`DontDestroyOnLoad` 오브젝트가 들어 있는 씬을 다시 불러오면 바가 두 개가 된다. Awake 에서 `Instance` 가 이미 있으면 `Destroy(gameObject)`.',
        '재화 바를 매 프레임 지갑에서 다시 읽게(Update 폴링) 하지 말고 변경 이벤트를 구독한다. 구독은 `OnEnable` / `OnDisable` 짝으로 — 씬이 바뀌어 사라진 상점이 이벤트를 계속 받으면 MissingReferenceException 이 난다.',
        '실제 결제는 **Unity IAP** 의 구매 확인 콜백(패키지 버전에 따라 `ProcessPurchase` 또는 `OnPurchasePending`)에서, 서버가 영수증을 확인한 뒤에 지급하고 완료를 알린다. 클라이언트가 버튼을 눌렀다는 것만으로 지급하지 않는다. 이 표본의 `MockStore` 는 그 자리를 표시만 한다.',
        '자주 바뀌는 숫자 · 날아가는 아이콘은 별도 Canvas 에 둔다. 진열 Canvas 전체가 매 프레임 다시 그려지지 않게.',
      ],
    },
    uitk: {
      hierarchy: `PersistentUI (UIDocument · DontDestroyOnLoad — 공용 UIDocument 하나에 바 · 상점 · 확인 창)
└─ CurrencyShop.uxml
   └─ #app (.app)
      ├─ #currency-bar (.bar — 슬롯 3개: 아이콘 · Label 숫자(데이터 바인딩) · Label +N · Button +)
      ├─ #shop (.shop — 상점 씬에서만 보인다. #bundles · #packs 는 C# 가 상품표로 채운다)
      ├─ #confirm (.confirm — #dim · #window · #price · #after · #refund · #short · Button #cancel · Button #buy · #lock-fill)
      └─ #fly-layer (.fly-layer, picking-mode: Ignore — 아이콘 요소를 풀에서 꺼내 쓴다)
CurrencyShopUITK.cs (Wallet · Product · MockStore 는 UGUI 폴더 ShopData.cs 를 쓴다)`,
      steps: [
        '공용 UIDocument 하나를 `DontDestroyOnLoad` 로 남기고, 상점이 아닌 씬에서는 `#shop` 만 `display: none`. 바는 늘 그대로다. (상점을 별도 UIDocument 로 나누면 같은 Panel Settings 를 쓰고 바의 Sort Order 를 높인다.)',
        '숫자 Label 은 **런타임 데이터 바인딩**: `root.dataSource = walletSource` · `label.SetBinding("text", new DataBinding { dataSourcePath = new PropertyPath("CreditText") })`. 소스는 `INotifyBindablePropertyChanged` 로 바뀐 속성만 알린다 — 카운트업 중에는 매 프레임, 평소에는 지갑이 바뀔 때만.',
        '코인 비행은 **USS transition** 으로: 아이콘을 시작점에 두고 한 프레임 뒤 `left` · `top` 을 칸 위치로 바꾼다. `left` 는 ease-out, `top` 은 ease-in 이라 두 곡선이 합쳐져 휘어진 길이 된다. `TransitionEndEvent` 에서 도착 처리 후 풀에 돌려준다.',
        '확인 창의 ← → 는 `NavigationMoveEvent` 를 직접 받아 취소 ↔ 구매만 오가게 가둔다. 이때 `evt.StopPropagation()` 과 함께 `focusController?.IgnoreEvent(evt)` 를 불러야 기본 포커스 이동이 한 번 더 일어나지 않는다. 입력 잠금은 `PointerDownEvent`(TrickleDown)로 누른 시각을 받아 `clicked` 에서 판정한다.',
      ],
      pitfalls: [
        '`[CreateProperty]` 를 붙이지 않은 속성은 바인딩 경로로 찾지 못한다. 속성 이름은 `nameof` 로 써서 오타를 막는다.',
        'transition 은 값이 **바뀔 때만** 돈다. 새로 만든 요소의 시작 위치와 끝 위치를 같은 프레임에 넣으면 바로 끝 위치에 나타난다 — `schedule.Execute` 로 한 프레임 미룬다.',
        'USS 에는 `box-shadow` 가 없다. 확인 창 강조는 테두리 색 · 두께로 한다.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '궤도 결정 · 크레딧 · 에너지 아이콘, 상품 구성과 가격 예시(원화), 확인 창 배치, 비행 경로 규칙, 다크패턴 재현과 빨간 꼬리표는 모두 이 갤러리에서 새로 만들었다. 카드가 대표 사례로 든 게임(클래시 오브 클랜 · 쿠키런: 킹덤 · 브롤스타즈)의 상점 화면은 출처로 확인하지 못해(미확인) 빌린 시각 요소가 없고, 장르 관례로만 다뤘다. 실제 결제는 없다.',
  references: [
    { label: '게임메카 — 카드가 인용한 게임 결제 · 공정위 제재 관련 보도', url: 'https://www.gamemeca.com/view.php?gid=100991' },
    { label: '뉴시스 (2019-06-26) — 카드가 인용한 게임 결제 · 청약철회 관련 보도', url: 'https://mobile.newsis.com/view/NISX20190626_0000692144' },
    { label: 'arXiv 2412.05039 — 카드가 다크패턴 근거로 든 논문 (PDF)', url: 'https://arxiv.org/pdf/2412.05039' },
    { label: 'PocketGamer.biz — Currency confusion reduces player trust (Edd Coates)', url: 'https://www.pocketgamer.biz/comment-and-opinion/78654/currency-confusion-reduces-player-trust-f2p-edd-coates/' },
    { label: 'Adrian Crook — 5 Psychological Pricing Tactics for Freemium Games', url: 'https://adriancrook.com/5-psychological-pricing-tactics-for-freemium-games/' },
  ],
  related: [
    { id: 'gacha-reveal-odds', why: '상점에서 산 재화를 쓰는 다음 화면 — 확률표를 추첨과 같은 표에서 만들고, 결과 직후 입력 잠금' },
    { id: 'results-reward', why: '같은 카운트업(고정 시간 + 감속 곡선)을 정산 화면에서 — 건너뛰어도 최종 값이 정확히 남게' },
    { id: 'battle-pass-track', why: '받기 상태(잠김 → 받을 수 있음 → 받음)와 받은 보상의 결과 창 — 그 보상이 들어오는 곳이 이 재화 바' },
  ],
}
