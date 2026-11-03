import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'currency-bar-shop',
  title: '재화 바 · 상점 · 구매 확인',
  titleEn: 'Currency Bar, Shop & Purchase Confirmation',
  group: 'E',
  order: 9,
  paradigms: ['menu', 'meta'],
  oneLiner: '늘 위에 있는 재화 바 → 상점 진열 → 가격 · 구매 후 잔액을 보여 주는 확인 창 → 산 재화가 날아가 숫자가 오르는 한 흐름. 같은 화면을 다크패턴으로 바꿔 비교한다',
  goals: [
    '재화 바를 **씬이 바뀌어도 남는 공용 UI** 로 두고 지갑의 변경 이벤트를 구독해 숫자를 갱신할 수 있다',
    '확인 창에 **실제 가격(원화 환산) · 구매 후 잔액 · 판매 종료 · 청약철회 안내 · 부족할 때의 충전 안내**를 빠짐없이 배치할 수 있다',
    '확인 버튼에 **누른 시각 기준 입력 잠금**을 걸고, 결제 확인 중에는 버튼을 막고, 차감이 실패하면 지급하지 않게 할 수 있다',
    '얻은 재화가 **날아간 뒤 숫자가 오르는** 피드백을 만들고, 꼬리표를 단 다크패턴 6가지를 구별해 설명할 수 있다',
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
      hint: '다크패턴은 "하지 말아야 할 예" 로 표시하고 6가지마다 ✕ 꼬리표를 단다: 가격 숨기기 · 앵커링(가짜 원래 가격) · 구매 기본 선택 · 거절 버튼 약화 · 유인 문구 · + 지름길',
    },
    { key: 'inputLockMs', label: '확인 창 입력 잠금', type: 'range', min: 0, max: 800, step: 50, default: 350, unit: 'ms', hint: '창이 뜬 직후 구매 버튼을 막는 시간(누른 시각 기준). 0 이면 "창 뜬 직후 연타" 가 그대로 구매된다' },
    { key: 'flyCount', label: '날아가는 아이콘 수', type: 'range', min: 1, max: 16, step: 1, default: 8, unit: '개', hint: '재화 바로 날아가는 아이콘 수 (에너지는 절반)' },
    { key: 'countUpMs', label: '숫자 올리기 시간', type: 'range', min: 0, max: 2000, step: 100, default: 900, unit: 'ms', hint: '첫 아이콘이 닿은 뒤 숫자가 오르는 시간 (값 크기와 무관). 0 이면 닿는 순간 바뀐다' },
  ],
  presets: [
    { id: 'honest', name: '정직한 상점', look: '원화 환산 · 구매 후 잔액 · 판매 종료 · 잠금 350ms · 아이콘 8개', values: { uiMode: 'honest', inputLockMs: 350, flyCount: 8, countUpMs: 900 } },
    { id: 'dark-pattern', name: '다크패턴 비교 (하지 말아야 할 예)', look: '같은 상품 · 같은 잔액에 패턴 6가지를 얹고 꼬리표를 단다', values: { uiMode: 'dark', inputLockMs: 350, flyCount: 8, countUpMs: 900 } },
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
      body: '크레딧 · 궤도 결정 · 에너지가 늘 맨 위에 있고, 확인 창이 떠도 **어둡게 덮이지 않아** 사기 전에 잔액을 다시 볼 수 있다. **+** 는 충전으로 가는 길이다. 정직한 UI 는 충전 목록을 보여 주고 고르게 하고, 다크패턴의 **+ 지름길**은 가장 비싼 상품(₩99,000) 창을 바로 연다. Unity 에서는 씬이 바뀌어도 남는 공용 UI 가 지갑의 변경 이벤트를 듣는다.',
      principle: '일관성',
      pin: 'below',
    },
    {
      n: 2,
      part: 'shelf',
      title: '할인 · 한정 기간은 사실만',
      body: '할인율은 **실제로 팔던 가격**(지난주 375)과 비교하고, 진열 카드와 확인 창의 "판매 종료" 줄이 **같은 종료 시각**을 센다. 묶음 가격 옆에는 원화 환산(결정 1개 ≈ ₩20)을 적는다. 다크패턴은 **가격 숨기기**(결정으로만 적은 가격)와 **앵커링**(가장 비싼 상자를 맨 앞에 금테로, ₩99,000 상품을 충전 목록 맨 위에 크게 — 뒤 상품이 싸 보인다. 팔지 않던 1,000 대비 −70%!! 같은 **가짜 원래 가격**도 같은 장치)이다.',
      principle: '시각 위계',
    },
    {
      n: 3,
      part: 'price',
      title: '가격 · 구매 후 잔액 · 청약철회 안내',
      body: '확인 창은 "정말 사겠습니까?" 가 아니라 **판단할 정보**를 준다: 가격(결정 300 · 약 ₩6,000), 구매 후 잔액(680 → 380), 판매 종료까지 남은 시간, 청약철회 안내(예시 문구). 철회가 안 되면 **그 사실과 이유를 미리** 알린다 — 가능 여부는 법령 · 약관으로 확인한다. 모자라면 "520개 부족"(잔액 680, 상자 1,200)과 **충전 상품 보기** — 이 창에서 몰래 결제하지 않는다. 에너지가 이미 최대치를 넘었으면 그 사실을 한 줄 알린다.',
      principle: '가독성',
      pin: 'left',
    },
    {
      n: 4,
      part: 'lock',
      title: '확인 버튼 입력 잠금 · 포커스',
      body: '상품을 누르던 손가락이 막 뜬 창의 구매 버튼을 그대로 누르지 않게 350ms 는 구매를 막는다(`createInputLock`, **누른 시각**으로 판정 — 늦게 처리된 프레임도 잠금을 피하지 못한다). 기본 선택은 **취소**. 창이 뜨면 포커스를 기본 버튼으로 옮기고, 닫으면 **창을 연 카드로** 돌려준다 — 카드에 남으면 다음 Enter 가 창을 다시 연다. 결제 확인 중에는 버튼을 막아 두 번 결제되지 않게 한다. "창 뜬 직후 연타" 와 "잠금 없음" 프리셋으로 비교한다.',
      principle: '접근성',
      pin: 'right',
    },
    {
      n: 5,
      part: 'fly',
      title: '날아간 뒤 오르는 숫자',
      body: '산 재화의 아이콘이 **자기 칸으로** 날아가고(2차 베지어, 끝으로 갈수록 빨라짐), 첫 아이콘이 닿으면 칸이 살짝 커지며 숫자가 `createCountUp` 으로 오르고 "+15,000" 이 남는다. 쓰는 재화는 **바로** 줄인다. 날아오는 중인 재화를 쓰거나 또 받으면 먼저 **정산**(표시값 = 실제 잔액)한다 — 안 그러면 바가 음수를 보이거나 두 번째 +N 이 묻힌다. 효과를 끄면 숫자만 바뀐다.',
      principle: '즉각 피드백',
      pin: 'left',
    },
  ],
  mistakes: [
    {
      title: '확인 창에 가격과 잔액이 없다',
      body: '"구매하시겠습니까? [예] [아니요]" 만 있으면 사람은 머릿속으로 잔액을 계산해야 한다. 가격(원화 환산 포함), 구매 후 잔액, 청약철회 안내를 창 안에 둔다.',
    },
    {
      title: '재화 단위로 실제 가격을 가린다',
      body: '결정 300 이 얼마인지 알려면 충전 상품표를 거꾸로 계산해야 한다(다크패턴의 **가격 숨기기**). 충전 묶음 크기를 일부러 상품 가격과 어긋나게 두면 남는 재화 때문에 또 충전하게 된다. 묶음 가격 옆에 원화 환산을, 충전 상품에는 100개당 가격을 적는다.',
    },
    {
      title: '"이 창을 닫으면 다시 살 수 없습니다"',
      body: '압박하는 **유인 문구**와 닫아도 다시 도는 가짜 타이머. 후보 카드의 요약(출처: 게임메카 · 뉴시스 보도)에 따르면 공정위가 "닫으면 다시 살 수 없다" 같은 유인 문구와, 환불 가능한 아이템을 환불 불가로 안내한 것을 제재한 사례가 있다(법률 조언이 아니다 — 실제 기준은 법령 · 약관으로 확인). 한정 기간이 사실이면 진열과 같은 종료 시각을 담담하게 적는다.',
    },
    {
      title: '구매를 기본 선택으로, 거절은 작게',
      body: '구매 버튼에 포커스를 두거나 "부족분 자동 충전" 을 미리 체크해 두면(**구매 기본 선택**) Enter 한 번이 결제가 된다 — 몰래 고르는 충전은 부족분을 넘을 때까지 여러 묶음일 수도 있다. 취소를 흐리고 작은 "다음에" 로 두는 **거절 버튼 약화**도 같다. 기본 선택은 취소, 두 버튼은 같은 크기, 충전 상품은 직접 고르게 한다.',
    },
    {
      title: '획득 피드백 없이 숫자만 바꾼다',
      body: '여러 재화가 한꺼번에 들어오면 어떤 숫자가 얼마나 바뀌었는지 놓친다. 아이콘이 그 칸으로 날아가고, 닿은 뒤 숫자가 오르며, "+N" 이 잠시 남게 한다.',
    },
  ],
  juiceOff:
    '흔한 실수 두 가지. 확인 창에 **구매 후 잔액 줄이 없어** 남는 양을 머리로 계산해야 한다. 구매 뒤에는 **아이콘 비행 · 칸 강조 · +N 없이 숫자만 바뀌어** 크레딧과 에너지가 함께 들어오면 무엇을 얼마나 얻었는지 놓친다.',
  timings: [
    { event: '확인 창 등장 · 닫힘', ms: 180, easing: 'ease-out (불투명도 + 크기 0.96 ↔ 1)', note: '권장값' },
    { event: '확인 버튼 입력 잠금', ms: 350, easing: '—', note: '권장값 (0.2~0.4초 범위)' },
    { event: '스토어 결제 확인 (모의)', ms: 600, easing: '—', note: '모형 값. 실제는 스토어 콜백을 받은 뒤 지급' },
    { event: '아이콘 비행', ms: 700, easing: 'ease-in (t²) · 2차 베지어', note: '권장값. 아이콘마다 50ms, 재화마다 160ms 간격' },
    { event: '숫자 올리기', ms: 900, easing: 'easeOutCubic', note: '권장값. 첫 아이콘이 닿은 뒤, 값 크기와 무관' },
    { event: '+N 표시', ms: 1800, easing: '마지막 0.4초 페이드', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `PersistentUI (DontDestroyOnLoad — CurrencyBar.cs)
└─ Canvas_CurrencyBar (Overlay · Sort Order 높게 · Canvas Scaler 1920×1080)
   ├─ Slots (HorizontalLayoutGroup)
   │  └─ Slot_Credit · Slot_Gem · Slot_Energy (아이콘 · 숫자 TMP · +N TMP · Button +)
   └─ FlyLayer (Raycast Target 끈 아이콘 프리팹을 풀에서 꺼내 쓴다)
ShopScene
└─ Canvas_Shop (Sort Order 낮게)
   ├─ ShopScreen (ShopScreen.cs — 진열 · + 연결 · 시험용 키 F1 · F2)
   │  ├─ BundleGrid > BundleCard 프리팹 (Button transition None · ShopItemCard.cs · SelectedFrame)
   │  ├─ PackList > PackCard 프리팹 (ShopItemCard.cs)
   │  └─ PackHighlight (Image 테두리)
   └─ ConfirmPanel (PurchaseConfirmPanel.cs · CanvasGroup)
      ├─ Dim (Raycast Target 켬 — 뒤 진열을 막는다)
      └─ Window (Icon · Title · Contents · Price · AfterBalance · Refund · Notice · CancelButton · BuyButton > BuyLabel · LockBar)
EventSystem (InputSystemUIInputModule)
ShopData.cs — Product · Catalog · Wallet · PurchaseFlow(확인 창 로직) · MockStore`,
      steps: [
        '`Wallet` 은 일반 클래스로 잔액과 `event Action<Currency, int, int> Changed` 를 가진다. `Wallet.Shared` 하나를 바와 상점이 같이 쓰고, 상품표(`Catalog.Default()`)도 데이터로만 둔다 — 원화 환산 · 할인율 · 남은 시간은 화면마다 적지 않고 계산한다.',
        '`CurrencyBar` 는 Awake 에서 이미 있으면 자신을 지우고, 없으면 `DontDestroyOnLoad`. `OnEnable` / `OnDisable` 에서 `Wallet.Changed` 를 구독 · 해제해 **줄면 바로**, 늘면 아이콘이 닿은 뒤 카운트업한다. 오는 중에 같은 재화가 바뀌면 먼저 `Settle`(표시값 = 지갑 값).',
        '코인: `CurrencyBar.Fly` 가 `ObjectPool<Image>` 에서 아이콘을 꺼내 2차 베지어로 옮긴다. 풀은 `SetActive` 대신 `Image.enabled` 로 켜고 끈다.',
        '확인 창 로직은 일반 클래스 `PurchaseFlow` 에 모아 두 판이 같이 쓴다: 문구, `Press(누른 시각)` 의 잠금 · 부족 판정, `Pay` 의 스토어 확인 → `TrySpend` → 지급. **`TrySpend` 가 실패하면 지급하지 않고 멈춘다.**',
        '`PurchaseConfirmPanel` 은 누른 시각을 `EventTrigger`(PointerDown)로 받고(Submit 은 지금 시각), 열 때 선택된 카드를 기억했다가 닫으면 `SetSelectedGameObject` 로 돌려준다. 결정 + 는 열린 창을 먼저 닫는다.',
        '`ShopItemCard` 는 `Button.transition = None` 이라 선택 테두리를 `ISelectHandler` · `IDeselectHandler` 로 직접 그린다.',
      ],
      pitfalls: [
        '`DontDestroyOnLoad` 오브젝트가 들어 있는 씬을 다시 불러오면 바가 두 개가 된다. Awake 에서 `Instance` 가 이미 있으면 새로 생긴 쪽을 `Destroy(transform.root.gameObject)`.',
        '바는 매 프레임 지갑을 다시 읽지(폴링) 말고 변경 이벤트를 구독한다. 남는 바의 + 이벤트는 상점이 `Start` 에서 구독하고 `OnDestroy` 에서 푼다 — 사라진 상점이 이벤트를 계속 받으면 MissingReferenceException 이 난다.',
        '실제 결제는 **Unity IAP** 의 구매 확인 콜백(버전에 따라 `ProcessPurchase` 또는 `OnPurchasePending`)에서 서버가 영수증을 확인한 뒤 지급한다. `MockStore` 는 그 자리 표시다.',
        '재화 바와 날아가는 아이콘은 진열과 다른 Canvas(`Canvas_CurrencyBar`)에 둔다 — 카운트업 · 비행 중에 진열 Canvas 까지 다시 그리지 않게.',
      ],
    },
    uitk: {
      hierarchy: `PersistentUI (UIDocument · DontDestroyOnLoad — 바 · 상점 · 확인 창을 한 문서에)
└─ CurrencyShop.uxml > #app
   ├─ #shop (#bundles · #packs 는 C# 가 상품표로 채운다)
   ├─ #confirm (#dim · #window · #title · #contents · #price · #after · #refund · #notice · #cancel · #buy · #lock-fill)
   ├─ #currency-bar (확인 창 뒤에 두어 위에 그린다. 슬롯마다 아이콘 · 숫자(바인딩) · +N · Button +)
   └─ #fly-layer (picking-mode Ignore — 코인을 풀에서 꺼내 쓴다)
CurrencyShopUITK.cs (데이터 · PurchaseFlow 는 UGUI 폴더 ShopData.cs)`,
      steps: [
        '공용 UIDocument 하나를 `DontDestroyOnLoad` 로 남기고, 상점이 아닌 씬에서는 `#shop` 만 `display: none`. (상점을 별도 UIDocument 로 나누면 같은 Panel Settings 에 바의 Sort Order 를 높인다.)',
        '숫자 Label 은 **런타임 데이터 바인딩**: `#currency-bar` 의 `dataSource = source` · `label.SetBinding("text", new DataBinding { dataSourcePath = new PropertyPath("CreditText") })`. 소스는 `INotifyBindablePropertyChanged` 로 바뀐 속성만 알린다.',
        '코인은 **USS transition** 으로: transition 을 끈 채 시작점에 두고, 다음 프레임에 켜며 `left` · `top` 을 칸 위치로 바꾼다(`left` ease-out + `top` ease-in = 휘어진 길). `TransitionEndEvent` 에서 도착 처리 후 풀에 돌려준다.',
        '확인 창은 UGUI 판과 같은 `PurchaseFlow` 를 쓴다. 열 때 `focusController.focusedElement` 를 기억했다가 닫으면 `Focus()`. ← → 는 `NavigationMoveEvent` 를 받아 취소 ↔ 구매에 가두고 `StopPropagation()` 과 `focusController?.IgnoreEvent(evt)` 를 함께 부른다.',
      ],
      pitfalls: [
        '`[CreateProperty]` 를 붙이지 않은 속성은 바인딩 경로로 찾지 못한다. 속성 이름은 `nameof` 로.',
        'transition 은 값이 **바뀔 때만** 돈다. 시작과 끝을 같은 프레임에 넣으면 바로 끝에 나타나고, 재사용 요소에 transition 을 켠 채 시작 위치를 놓으면 그 이동까지 애니메이션된다 — 끄고 놓은 뒤 다음 프레임에 켠다.',
        '같은 Label 의 지우기 예약을 겹쳐 걸면 앞선 예약이 새 +N 을 일찍 지운다 — 예약 하나를 `ExecuteLater` 로 다시 잡는다. `OnDisable` 에서는 창 · 버튼 · 카운팅 표시를 되돌린다.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '궤도 결정 · 크레딧 · 에너지 아이콘, 상품 구성과 가격 예시(원화), 확인 창 배치, 비행 경로 규칙, 다크패턴 재현과 꼬리표는 모두 이 갤러리에서 새로 만들었다. 조사 카드가 대표 사례로 든 게임들의 상점 화면은 출처로 확인하지 못해(미확인) 빌린 시각 요소가 없고, 장르 관례로만 다뤘다. 청약철회 문구는 예시이고 실제 결제는 없다.',
  references: [
    { label: '게임메카 — 후보 카드가 인용한 보도', url: 'https://www.gamemeca.com/view.php?gid=100991' },
    { label: '뉴시스 (2019-06-26) — 후보 카드가 인용한 보도', url: 'https://mobile.newsis.com/view/NISX20190626_0000692144' },
    { label: 'arXiv 2412.05039 — 후보 카드가 인용한 논문 (PDF)', url: 'https://arxiv.org/pdf/2412.05039' },
    { label: 'PocketGamer.biz — Currency confusion reduces player trust (Edd Coates)', url: 'https://www.pocketgamer.biz/comment-and-opinion/78654/currency-confusion-reduces-player-trust-f2p-edd-coates/' },
    { label: 'Adrian Crook — 5 Psychological Pricing Tactics for Freemium Games', url: 'https://adriancrook.com/5-psychological-pricing-tactics-for-freemium-games/' },
  ],
  related: [
    { id: 'gacha-reveal-odds', why: '상점에서 산 재화를 쓰는 다음 화면 — 확률표를 추첨과 같은 표에서 만들고, 결과 직후 입력 잠금' },
    { id: 'results-reward', why: '같은 카운트업(고정 시간 + 감속 곡선)을 정산 화면에서 — 건너뛰어도 최종 값이 정확히 남게' },
    { id: 'battle-pass-track', why: '받기 상태(잠김 → 받을 수 있음 → 받음)와 받은 보상의 결과 창 — 그 보상이 들어오는 곳이 이 재화 바' },
  ],
}
