// UI Toolkit 판 재화 바 · 상점 · 구매 확인. 상품 · 지갑 · 확인 창 로직(PurchaseFlow)은 UGUI 폴더 ShopData.cs 를 쓴다 (같은 namespace).
// 공용 UIDocument 하나를 DontDestroyOnLoad 로 남기고 바 숫자는 데이터 바인딩, 코인은 USS transition 으로 옮긴다.
using System;
using System.Collections;
using System.Collections.Generic;
using Unity.Properties;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.UIElements;

namespace UIGallery.CurrencyBarShop
{
    /// <summary>바인딩 소스 — 화면에 보이는 값(카운트업 중간값)을 들고, 바뀐 속성 이름만 알린다</summary>
    public class WalletSource : INotifyBindablePropertyChanged
    {
        public event EventHandler<BindablePropertyChangedEventArgs> propertyChanged;
        readonly float[] shown = new float[3];

        [CreateProperty] public string CreditText => Mathf.RoundToInt(shown[0]).ToString("N0");
        [CreateProperty] public string GemText => Mathf.RoundToInt(shown[1]).ToString("N0");
        [CreateProperty] public string EnergyText => $"{Mathf.RoundToInt(shown[2]):N0} / {Wallet.EnergyMax}";

        public static readonly string[] PropertyNames = { nameof(CreditText), nameof(GemText), nameof(EnergyText) };

        public float Get(Currency c) => shown[(int)c];

        public void Set(Currency c, float value)
        {
            bool same = Mathf.RoundToInt(shown[(int)c]) == Mathf.RoundToInt(value);
            shown[(int)c] = value;
            if (!same) propertyChanged?.Invoke(this, new BindablePropertyChangedEventArgs(PropertyNames[(int)c]));   // 보이는 글자가 바뀔 때만
        }
    }

    [RequireComponent(typeof(UIDocument))]
    public class CurrencyShopUITK : MonoBehaviour
    {
        [SerializeField] int coinsPerGrant = 8;
        [SerializeField] float flySeconds = 0.7f, countUpSeconds = 0.9f, inputLockSeconds = 0.35f;
        [Tooltip("끄면 '나쁜 예': 아이콘 · +N 없이 숫자만 바뀌고, 확인 창에 구매 후 잔액이 없다")] [SerializeField] bool feedback = true;

        static readonly string[] Key = { "credit", "gem", "energy" };
        static readonly StyleList<TimeValue> NoTransition = new List<TimeValue> { new(0f, TimeUnit.Second) };
        static CurrencyShopUITK instance;

        readonly WalletSource source = new();
        readonly List<Product> catalog = Catalog.Default();
        // gen: 정산할 때마다 늘린다 — 그 전에 떠난 코인은 닿아도 숫자를 다시 올리지 않는다
        readonly int[] pending = new int[3], gen = new int[3];
        readonly Coroutine[] counting = new Coroutine[3];
        readonly VisualElement[] icons = new VisualElement[3];
        readonly Label[] gains = new Label[3], amounts = new Label[3];
        readonly IVisualElementScheduledItem[] gainHide = new IVisualElementScheduledItem[3];

        VisualElement root, confirm, window, lockFill, flyLayer, packsCol;
        Label title, contents, price, after, refund, notice;
        Button cancel, buy, plusGem, plusEnergy;
        ObjectPool<VisualElement> pool;
        Wallet wallet;
        PurchaseFlow flow;
        Focusable opener;
        float pressedAt = -1f;
        int upFrame = -1;

        /// <summary>코인 하나의 비행 정보 (요소의 userData)</summary>
        class Flight
        {
            public Currency currency;
            public int amount, gen;
            public bool lead;
        }

        void Awake()
        {
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }
            instance = this;
            DontDestroyOnLoad(gameObject);   // 공용 UIDocument — 씬이 바뀌어도 바가 남는다
        }

        void OnDestroy()
        {
            if (instance == this) instance = null;
        }

        void OnEnable()
        {
            if (instance != this) return;
            root = GetComponent<UIDocument>().rootVisualElement;
            Label L(string n) => root.Q<Label>(n);
            packsCol = root.Q("packs-col");
            confirm = root.Q("confirm");
            window = root.Q("window");
            lockFill = root.Q("lock-fill");
            flyLayer = root.Q("fly-layer");
            (title, contents, price, after, refund, notice) = (L("title"), L("contents"), L("price"), L("after"), L("refund"), L("notice"));
            (cancel, buy, plusGem, plusEnergy) = (root.Q<Button>("cancel"), root.Q<Button>("buy"), root.Q<Button>("plus-gem"), root.Q<Button>("plus-energy"));

            // 바 숫자는 바인딩으로 — 코드가 Label.text 를 직접 쓰지 않는다
            wallet = Wallet.Shared;
            flow ??= new PurchaseFlow(wallet);
            flow.lockSeconds = inputLockSeconds;
            root.Q("currency-bar").dataSource = source;
            for (int i = 0; i < 3; i++)
            {
                icons[i] = root.Q("icon-" + Key[i]);
                gains[i] = L("gain-" + Key[i]);
                amounts[i] = L("amount-" + Key[i]);
                amounts[i].SetBinding("text", new DataBinding { dataSourcePath = new PropertyPath(WalletSource.PropertyNames[i]), bindingMode = BindingMode.ToTarget });
                pending[i] = 0;
                source.Set((Currency)i, wallet[(Currency)i]);
            }
            wallet.Changed += OnChanged;

            pool ??= new ObjectPool<VisualElement>(CreateCoin, c => flyLayer.Add(c), c => c.RemoveFromHierarchy(), null, true, 32, 96);

            plusGem.clicked += OnPlusGem;
            plusEnergy.clicked += OnPlusEnergy;
            cancel.clicked += Close;
            buy.clicked += OnBuy;
            // clicked 는 손을 뗄 때 온다 — 누른 시각은 TrickleDown 으로 먼저 받아 둔다
            buy.RegisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            buy.RegisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            window.RegisterCallback<NavigationMoveEvent>(OnNavigate);
            window.RegisterCallback<NavigationCancelEvent>(OnNavigateCancel);
            BuildShop();
        }

        void OnDisable()
        {
            if (wallet != null) wallet.Changed -= OnChanged;
            StopAllCoroutines();
            if (root == null) return;
            // 결제 · 카운트업 도중 꺼져도 다시 켰을 때 멀쩡하게 — 창 · 버튼 · 카운팅 표시를 되돌린다 (숫자는 OnEnable 이 지갑 값으로)
            flow.Abort();
            flow.Close();
            confirm.RemoveFromClassList("confirm--open");
            cancel.SetEnabled(true);
            buy.SetEnabled(true);
            flyLayer.Clear();   // 날던 아이콘은 버린다 (떼어 낸 요소의 예약은 돌지 않는다)
            for (int i = 0; i < 3; i++)
            {
                counting[i] = null;
                amounts[i].RemoveFromClassList("slot__amount--counting");
                gains[i].RemoveFromClassList("slot__gain--on");
            }
            plusGem.clicked -= OnPlusGem;
            plusEnergy.clicked -= OnPlusEnergy;
            cancel.clicked -= Close;
            buy.clicked -= OnBuy;
            buy.UnregisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            buy.UnregisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            window.UnregisterCallback<NavigationMoveEvent>(OnNavigate);
            window.UnregisterCallback<NavigationCancelEvent>(OnNavigateCancel);
        }

        public void ShowShop(bool on) => root.Q("shop").style.display = on ? DisplayStyle.Flex : DisplayStyle.None;

        /* ───── 진열 ───── */
        void BuildShop()
        {
            VisualElement bundles = root.Q("bundles"), packs = root.Q("packs");
            bundles.Clear();
            packs.Clear();
            foreach (Product p in catalog)
            {
                if (p.id == "energy") continue;   // 재화 바의 + 로만 연다
                var card = new Button(() => Open(p));
                card.AddToClassList(p.IsCashPack ? "pack" : "card");
                if (p.wasGem > p.priceGem)   // 할인율은 실제로 팔던 가격과 비교
                    card.Add(Tag("card__sale", $"−{Mathf.RoundToInt((1f - (float)p.priceGem / p.wasGem) * 100f)}% · 지난주 {p.wasGem:N0}"));
                if (p.endsUnix > 0)
                {
                    Label limit = Tag("card__limit", "");
                    limit.schedule.Execute(() => limit.text = "남은 " + Pricing.Remain(DateTimeOffset.FromUnixTimeSeconds(p.endsUnix) - DateTimeOffset.UtcNow)).Every(1000);
                    card.Add(limit);
                }
                var name = new VisualElement();
                name.Add(Tag("card__name", p.displayName));
                name.Add(Tag("card__gives", Pricing.Contents(p).Replace(" · ", p.IsCashPack ? " · " : "\n")));
                card.Add(name);
                var priceBox = new VisualElement();
                priceBox.AddToClassList("card__price");
                priceBox.Add(new Label(p.IsCashPack ? Pricing.Won(p.priceKrw) : $"결정 {p.priceGem:N0}"));
                priceBox.Add(Tag("card__sub", p.IsCashPack   // 실제 가격(원화)을 재화 단위 뒤에 숨기지 않는다
                    ? $"100개당 {Pricing.Won(Mathf.RoundToInt(p.priceKrw * 100f / Mathf.Max(1, p.GemsGiven)))}"
                    : $"약 {Pricing.Won(Pricing.GemToKrw(p.priceGem))}"));
                card.Add(priceBox);
                (p.IsCashPack ? packs : bundles).Add(card);
            }
        }

        static Label Tag(string cls, string text)
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        void OnPlusGem()
        {
            // 결정 + 는 결제 창을 열지 않는다 — 열린 창을 먼저 닫고 충전 목록으로
            if (flow.Paying) return;
            flow.Close();
            HighlightPacks();
        }

        void OnPlusEnergy() => Open(catalog.Find(p => p.id == "energy"));

        void HighlightPacks()
        {
            Hide(packsCol.Q<Button>());
            packsCol.AddToClassList("shop__col--hl");
            packsCol.schedule.Execute(() => packsCol.RemoveFromClassList("shop__col--hl")).StartingIn(3000);
        }

        /* ───── 확인 창 (로직은 PurchaseFlow) ───── */
        void Open(Product p)
        {
            bool wasOpen = flow.Current != null;
            if (!flow.Open(p, Time.unscaledTime)) return;
            if (!wasOpen) opener = root.focusController?.focusedElement;   // 창을 연 카드 — 닫으면 포커스를 돌려준다
            Fill();
            confirm.AddToClassList("confirm--open");
            // 기본 선택은 취소. 막 display 를 켠 요소는 다음 프레임에야 포커스를 받을 수 있다
            cancel.schedule.Execute(() => { if (flow.Current != null) cancel.Focus(); });
        }

        void Close()
        {
            if (flow.Close()) Hide(opener);
        }

        void Fill()
        {
            title.text = flow.Current.displayName;
            contents.text = flow.Contents;
            price.text = flow.Price;
            root.Q("after-row").style.display = feedback ? DisplayStyle.Flex : DisplayStyle.None;
            after.text = flow.After;
            refund.text = flow.Current.refundText;
            notice.text = flow.Notice;
            notice.EnableInClassList("notice--on", flow.Notice != null);
            buy.text = flow.BuyLabel;
            cancel.SetEnabled(!flow.Paying);   // 스토어 확인 중에는 두 번 결제되지 않게
            buy.SetEnabled(!flow.Paying);
        }

        void Update()
        {
            if (flow?.Current != null) lockFill.style.width = Length.Percent(100f * flow.LockProgress(Time.unscaledTime));
        }

        void OnPress(PointerDownEvent e) => pressedAt = Time.unscaledTime;
        void OnRelease(PointerUpEvent e) => upFrame = Time.frameCount;

        void OnNavigate(NavigationMoveEvent e)
        {
            // 창 안에서는 ← → 로 취소 ↔ 구매만, 위 · 아래는 막는다 (진열로 포커스가 새지 않게)
            if (e.direction == NavigationMoveEvent.Direction.Left || e.direction == NavigationMoveEvent.Direction.Right)
                (cancel.focusController?.focusedElement == cancel ? buy : cancel).Focus();
            e.StopPropagation();
            window.focusController?.IgnoreEvent(e);   // 안 부르면 Unity 6.3 이 기본 포커스 이동을 한 번 더 해서 한 칸 건너뛴다
        }

        void OnNavigateCancel(NavigationCancelEvent e)
        {
            Close();
            e.StopPropagation();
        }

        void OnBuy()
        {
            // 마우스 · 터치는 누른 시각, 키보드 · 패드 Submit 은 지금 시각
            float at = pressedAt >= 0f && upFrame == Time.frameCount ? pressedAt : Time.unscaledTime;
            pressedAt = -1f;
            switch (flow.Press(at))
            {
                case PurchaseFlow.Result.NeedCharge: HighlightPacks(); break;
                case PurchaseFlow.Result.Pay: StartCoroutine(Pay()); break;
            }
        }

        IEnumerator Pay()
        {
            Vector2 from = flyLayer.WorldToLocal(root.Q("window-icon").worldBound.center);
            // 스토어 확인 → 차감 → 지급 (차감이 실패하면 주지 않는다). 코인은 지갑에 더하기 전에 띄운다
            Coroutine pay = StartCoroutine(flow.Pay((g, i) => Fly(g.currency, g.value, from, i * 160)));
            Fill();   // '스토어 확인 중…' · 두 버튼 끔
            yield return pay;
            if (flow.Current != null) Fill();   // 멈췄다 — 이유를 창에 남긴다
            else Hide(opener);
        }

        void Hide(Focusable focus)
        {
            confirm.RemoveFromClassList("confirm--open");
            focus?.Focus();   // 숨은 버튼에 포커스가 남으면 패드로 진열에 못 돌아간다
        }

        /* ───── 지갑 → 바 ───── */
        void OnChanged(Currency c, int old, int now)
        {
            if (now < old || !feedback)
            {
                // 쓰는 것은 바로. 같은 재화가 날아오거나 오르는 중이면 먼저 정산한다 — 표시값에서 빼면 음수가 보일 수 있다
                Settle(c, now);
                if (feedback) ShowGain(c, now - old);
                return;
            }
            if (pending[(int)c] > 0) return;   // 날아오는 아이콘이 닿을 때
            CountTo(c);
        }

        /// <summary>날아오거나 오르는 중인 것을 끝내고 표시값 = 지갑 값으로 맞춘다</summary>
        void Settle(Currency c, int value)
        {
            int i = (int)c;
            if (counting[i] != null) StopCoroutine(counting[i]);
            counting[i] = null;
            amounts[i].RemoveFromClassList("slot__amount--counting");
            pending[i] = 0;
            gen[i]++;
            source.Set(c, value);
        }

        void CountTo(Currency c)
        {
            int i = (int)c;
            if (counting[i] != null) StopCoroutine(counting[i]);
            counting[i] = StartCoroutine(CountRoutine(c));
        }

        IEnumerator CountRoutine(Currency c)
        {
            int i = (int)c;
            float from = source.Get(c);
            amounts[i].AddToClassList("slot__amount--counting");
            for (float t = 0f; t < countUpSeconds; t += Time.unscaledDeltaTime)
            {
                source.Set(c, Mathf.Lerp(from, wallet[c], 1f - Mathf.Pow(1f - t / countUpSeconds, 3f)));   // 바인딩이 Label 을 갱신
                yield return null;
            }
            source.Set(c, wallet[c]);
            amounts[i].RemoveFromClassList("slot__amount--counting");
            counting[i] = null;
        }

        void ShowGain(Currency c, int delta)
        {
            int i = (int)c;
            Label g = gains[i];
            g.text = (delta > 0 ? "+" : "−") + Mathf.Abs(delta).ToString("N0");
            g.EnableInClassList("slot__gain--minus", delta < 0);
            g.AddToClassList("slot__gain--on");   // 켤 때는 바로, 끌 때는 USS transition 으로 0.4초 페이드
            // 지우기 예약은 칸마다 하나 — 다시 잡아서 앞선 예약이 새 +N 을 일찍 지우지 않게
            gainHide[i] ??= g.schedule.Execute(() => g.RemoveFromClassList("slot__gain--on"));
            gainHide[i].ExecuteLater(delta > 0 ? 1400 : 1000);
        }

        /* ───── 코인 비행 ───── */
        VisualElement CreateCoin()
        {
            var coin = new VisualElement { pickingMode = PickingMode.Ignore, userData = new Flight() };
            coin.AddToClassList("coin");
            coin.RegisterCallback<TransitionEndEvent>(OnCoinTransitionEnd);
            coin.RegisterCallback<TransitionCancelEvent>(e => Arrive(coin));   // 중간에 끊겨도 숫자가 멈춰 있지 않게
            return coin;
        }

        void Fly(Currency c, int amount, Vector2 from, long delayMs)
        {
            if (!feedback) return;
            int ci = (int)c;
            // 같은 재화의 앞선 지급이 아직 오는 중이면 먼저 정산 — 이번 +N 과 카운트업이 묻히지 않게
            if (pending[ci] > 0 || counting[ci] != null) Settle(c, wallet[c]);
            pending[ci]++;
            Vector2 to = flyLayer.WorldToLocal(icons[ci].worldBound.center);
            var fly = new StyleList<TimeValue>(new List<TimeValue> { new(flySeconds, TimeUnit.Second), new(flySeconds, TimeUnit.Second), new(flySeconds, TimeUnit.Second) });
            int n = c == Currency.Energy ? Mathf.Max(1, coinsPerGrant / 2) : coinsPerGrant;
            for (int i = 0; i < n; i++)
            {
                VisualElement coin = pool.Get();
                var f = (Flight)coin.userData;
                f.currency = c;
                f.amount = amount;
                f.lead = i == 0;
                f.gen = gen[ci];
                // 시작 위치는 transition 을 끄고 놓는다 — 재사용 코인이 이전 끝 위치에서 미끄러지면 TransitionCancel 로 일찍 '도착' 한다
                coin.RemoveFromClassList("coin--fly");
                coin.style.transitionDuration = NoTransition;
                for (int k = 0; k < 3; k++) coin.EnableInClassList("coin--" + Key[k], k == ci);
                coin.style.left = from.x - 24f + (i * 37) % 60 - 30;
                coin.style.top = from.y - 24f + (i * 23) % 40 - 20;
                // 다음 프레임 이후에 transition 을 켜고 끝 위치를 넣는다 (같은 프레임이면 바로 끝에 나타난다)
                coin.schedule.Execute(() =>
                {
                    coin.style.transitionDuration = fly;
                    coin.AddToClassList("coin--fly");
                    coin.style.left = to.x - 24f;
                    coin.style.top = to.y - 24f;
                }).StartingIn(delayMs + i * 50 + 16);
            }
        }

        void OnCoinTransitionEnd(TransitionEndEvent e)
        {
            // left · top · scale 마다 오므로 top 하나만
            if (e.stylePropertyNames.Contains(new StylePropertyName("top"))) Arrive((VisualElement)e.currentTarget);
        }

        void Arrive(VisualElement coin)
        {
            if (coin.parent == null) return;   // 이미 돌려준 아이콘
            var f = (Flight)coin.userData;
            pool.Release(coin);
            VisualElement icon = icons[(int)f.currency];
            icon.AddToClassList("slot__icon--pulse");
            icon.schedule.Execute(() => icon.RemoveFromClassList("slot__icon--pulse")).StartingIn(120);
            if (!f.lead || f.gen != gen[(int)f.currency]) return;   // 정산된 지급의 코인은 숫자를 다시 올리지 않는다
            pending[(int)f.currency]--;
            ShowGain(f.currency, f.amount);
            CountTo(f.currency);
        }
    }
}
