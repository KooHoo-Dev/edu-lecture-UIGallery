// UI Toolkit 판 재화 바 · 상점 · 구매 확인 — Wallet · Product · Catalog · MockStore 는 UGUI 폴더 ShopData.cs 를 그대로 쓴다 (같은 namespace).
// - 공용 UIDocument 하나를 DontDestroyOnLoad 로 남긴다. 상점이 아닌 씬에서는 ShowShop(false) 로 #shop 만 숨긴다
// - 바 숫자: 런타임 데이터 바인딩. WalletSource(INotifyBindablePropertyChanged)가 바뀐 속성만 알린다
// - 코인 비행: 풀에서 꺼낸 요소의 left · top 을 USS transition 으로 옮긴다 (left ease-out + top ease-in = 휘어진 길)
// - 확인 창 ← → 는 NavigationMoveEvent 를 직접 받아 취소 ↔ 구매에 가둔다 (StopPropagation + IgnoreEvent)
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
            if (Mathf.RoundToInt(shown[(int)c]) == Mathf.RoundToInt(value))
            {
                shown[(int)c] = value;
                return;   // 보이는 글자가 같으면 알리지 않는다
            }
            shown[(int)c] = value;
            propertyChanged?.Invoke(this, new BindablePropertyChangedEventArgs(PropertyNames[(int)c]));
        }
    }

    [RequireComponent(typeof(UIDocument))]
    public class CurrencyShopUITK : MonoBehaviour
    {
        [SerializeField] int coinsPerGrant = 8;
        [SerializeField] float flySeconds = 0.7f;
        [SerializeField] float countUpSeconds = 0.9f;
        [SerializeField] float inputLockSeconds = 0.35f;
        [Tooltip("끄면 '나쁜 예': 날아가는 아이콘 · +N 없이 숫자만 바뀌고, 확인 창에 구매 후 잔액이 없다")] [SerializeField] bool feedback = true;

        static readonly string[] Key = { "credit", "gem", "energy" };
        static CurrencyShopUITK instance;

        readonly WalletSource source = new();
        readonly List<Product> catalog = Catalog.Default();
        readonly MockStore store = new();
        readonly int[] pending = new int[3];
        readonly Coroutine[] counting = new Coroutine[3];
        readonly VisualElement[] icons = new VisualElement[3];
        readonly Label[] gains = new Label[3];
        readonly Label[] amounts = new Label[3];

        VisualElement root, shop, confirm, window, windowIcon, afterRow, lockFill, flyLayer, packsCol;
        Label title, contents, price, after, refund, shortLabel;
        Button cancel, buy;
        ObjectPool<VisualElement> pool;
        Wallet wallet;
        Product current;
        float unlockAt = -1f, pressedAt = -1f;
        int upFrame = -1;
        bool paying;

        /// <summary>코인 하나의 비행 정보 (요소의 userData)</summary>
        class Flight
        {
            public Currency currency;
            public int amount;
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
            shop = root.Q("shop");
            packsCol = root.Q("packs-col");
            confirm = root.Q("confirm");
            window = root.Q("window");
            windowIcon = root.Q("window-icon");
            afterRow = root.Q("after-row");
            lockFill = root.Q("lock-fill");
            flyLayer = root.Q("fly-layer");
            title = root.Q<Label>("title");
            contents = root.Q<Label>("contents");
            price = root.Q<Label>("price");
            after = root.Q<Label>("after");
            refund = root.Q<Label>("refund");
            shortLabel = root.Q<Label>("short");
            cancel = root.Q<Button>("cancel");
            buy = root.Q<Button>("buy");

            // 바 숫자는 바인딩으로 — 코드가 Label.text 를 직접 쓰지 않는다
            wallet = Wallet.Shared;
            VisualElement bar = root.Q("currency-bar");
            bar.dataSource = source;
            for (int i = 0; i < 3; i++)
            {
                icons[i] = root.Q("icon-" + Key[i]);
                gains[i] = root.Q<Label>("gain-" + Key[i]);
                amounts[i] = root.Q<Label>("amount-" + Key[i]);
                amounts[i].SetBinding("text", new DataBinding
                {
                    dataSourcePath = new PropertyPath(WalletSource.PropertyNames[i]),
                    bindingMode = BindingMode.ToTarget,
                });
                pending[i] = 0;
                source.Set((Currency)i, wallet[(Currency)i]);
            }
            wallet.Changed += OnChanged;

            pool ??= new ObjectPool<VisualElement>(CreateCoin, c => flyLayer.Add(c), c => c.RemoveFromHierarchy(), null, true, 32, 96);

            root.Q<Button>("plus-gem").clicked += OnPlusGem;
            root.Q<Button>("plus-energy").clicked += OnPlusEnergy;
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
            flyLayer.Clear();   // 날던 아이콘은 버린다 (떼어 낸 요소의 예약은 돌지 않는다). 다시 켜면 숫자를 지갑 값으로 맞춘다
            paying = false;
            root.Q<Button>("plus-gem").clicked -= OnPlusGem;
            root.Q<Button>("plus-energy").clicked -= OnPlusEnergy;
            cancel.clicked -= Close;
            buy.clicked -= OnBuy;
            buy.UnregisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            buy.UnregisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            window.UnregisterCallback<NavigationMoveEvent>(OnNavigate);
            window.UnregisterCallback<NavigationCancelEvent>(OnNavigateCancel);
        }

        public void ShowShop(bool on) => shop.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;

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
                if (!p.IsCashPack && p.wasGem > p.priceGem)
                    card.Add(Tag("card__sale", $"−{Mathf.RoundToInt((1f - (float)p.priceGem / p.wasGem) * 100f)}% · 지난주 {p.wasGem:N0}"));
                if (p.endsUnix > 0)
                {
                    Label limit = Tag("card__limit", "");
                    long ends = p.endsUnix;
                    // 남은 시간은 1초마다 (실제 게임은 서버 시각 기준)
                    limit.schedule.Execute(() => limit.text = "남은 " + Pricing.Remain(DateTimeOffset.FromUnixTimeSeconds(ends) - DateTimeOffset.UtcNow)).Every(1000);
                    card.Add(limit);
                }
                var name = new VisualElement();
                name.Add(Tag("card__name", p.displayName));
                name.Add(Tag("card__gives", Pricing.Contents(p).Replace(" · ", p.IsCashPack ? " · " : "\n")));
                card.Add(name);
                var priceBox = new VisualElement();
                priceBox.AddToClassList("card__price");
                priceBox.Add(Tag("", p.IsCashPack ? Pricing.Won(p.priceKrw) : $"결정 {p.priceGem:N0}"));
                priceBox.Add(Tag("card__sub", p.IsCashPack
                    ? $"100개당 {Pricing.Won(Mathf.RoundToInt(p.priceKrw * 100f / Mathf.Max(1, p.GemsGiven)))}"
                    : $"약 {Pricing.Won(Pricing.GemToKrw(p.priceGem))}"));
                card.Add(priceBox);
                (p.IsCashPack ? packs : bundles).Add(card);
            }
        }

        static Label Tag(string cls, string text)
        {
            var l = new Label(text);
            if (!string.IsNullOrEmpty(cls)) l.AddToClassList(cls);
            return l;
        }

        void OnPlusGem() => HighlightPacks();
        void OnPlusEnergy() => Open(catalog.Find(p => p.id == "energy"));

        void HighlightPacks()
        {
            packsCol.AddToClassList("shop__col--hl");
            packsCol.schedule.Execute(() => packsCol.RemoveFromClassList("shop__col--hl")).StartingIn(3000);
            packsCol.Q<Button>()?.Focus();
        }

        /* ───── 확인 창 ───── */
        void Open(Product p)
        {
            if (paying || p == null) return;
            current = p;
            int gem = wallet[Currency.Gem];
            int shortBy = wallet.ShortOf(p);
            title.text = p.displayName;
            contents.text = Pricing.Contents(p);
            price.text = p.IsCashPack ? $"{Pricing.Won(p.priceKrw)}  (모의 결제)" : $"결정 {p.priceGem:N0}  (약 {Pricing.Won(Pricing.GemToKrw(p.priceGem))})";
            afterRow.style.display = feedback ? DisplayStyle.Flex : DisplayStyle.None;
            after.text = shortBy > 0 ? $"결정 {gem:N0} → {shortBy:N0}개 부족" : $"결정 {gem:N0} → {(p.IsCashPack ? gem + p.GemsGiven : gem - p.priceGem):N0}";
            refund.text = p.refundText;
            refund.style.color = p.refundable ? new Color(0.49f, 0.95f, 0.77f) : new Color(1f, 0.7f, 0.42f);
            shortLabel.text = $"결정이 {shortBy:N0}개 모자란다. 충전 상품을 직접 고른 뒤 다시 산다 — 이 창에서 결제하지 않는다.";
            shortLabel.EnableInClassList("short--on", shortBy > 0);
            buy.text = shortBy > 0 ? "충전 상품 보기" : p.IsCashPack ? $"{Pricing.Won(p.priceKrw)} 결제" : "구매";
            unlockAt = Time.unscaledTime + inputLockSeconds;
            confirm.AddToClassList("confirm--open");
            cancel.Focus();   // 기본 선택은 취소
        }

        void Close()
        {
            if (paying || current == null) return;
            current = null;
            confirm.RemoveFromClassList("confirm--open");
        }

        void Update()
        {
            if (current == null || lockFill == null) return;
            float k = inputLockSeconds <= 0f ? 1f : Mathf.Clamp01(1f - (unlockAt - Time.unscaledTime) / inputLockSeconds);
            lockFill.style.width = Length.Percent(100f * k);
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
            if (current == null || paying || at < unlockAt) return;
            if (wallet.ShortOf(current) > 0)
            {
                Close();
                HighlightPacks();
                return;
            }
            StartCoroutine(Pay(current));
        }

        IEnumerator Pay(Product p)
        {
            paying = true;
            cancel.SetEnabled(false);
            buy.SetEnabled(false);
            buy.text = "스토어 확인 중…";
            Vector2 from = flyLayer.WorldToLocal(windowIcon.worldBound.center);
            bool ok = false;
            yield return store.Purchase(p, r => ok = r);   // Unity IAP 를 붙일 자리 (ShopData.cs 의 MockStore 주석)
            paying = false;
            cancel.SetEnabled(true);
            buy.SetEnabled(true);
            if (!ok)
            {
                buy.text = "다시 시도";
                yield break;
            }
            if (!p.IsCashPack) wallet.TrySpend(Currency.Gem, p.priceGem);
            for (int i = 0; i < p.gives.Count; i++)
            {
                Fly(p.gives[i].currency, p.gives[i].value, from, i * 160);   // 지갑보다 먼저
                wallet.Add(p.gives[i].currency, p.gives[i].value);
            }
            Close();
        }

        /* ───── 지갑 → 바 ───── */
        void OnChanged(Currency c, int old, int now)
        {
            int i = (int)c;
            if (now < old)
            {
                source.Set(c, source.Get(c) - (old - now));   // 쓰는 것은 바로
                if (counting[i] != null) CountTo(c);
                if (feedback) ShowGain(c, now - old);
                return;
            }
            if (!feedback)
            {
                if (counting[i] != null) StopCoroutine(counting[i]);
                counting[i] = null;
                source.Set(c, now);
                return;
            }
            if (pending[i] > 0) return;   // 날아오는 아이콘이 닿을 때
            CountTo(c);
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
            Label g = gains[(int)c];
            g.text = (delta > 0 ? "+" : "−") + Mathf.Abs(delta).ToString("N0");
            g.EnableInClassList("slot__gain--minus", delta < 0);
            g.AddToClassList("slot__gain--on");   // 켤 때는 바로, 끌 때는 USS transition 으로 0.4초 페이드
            g.schedule.Execute(() => g.RemoveFromClassList("slot__gain--on")).StartingIn(delta > 0 ? 1400 : 1000);
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
            pending[ci]++;
            Vector2 to = flyLayer.WorldToLocal(icons[ci].worldBound.center);
            int n = c == Currency.Energy ? Mathf.Max(1, coinsPerGrant / 2) : coinsPerGrant;
            for (int i = 0; i < n; i++)
            {
                VisualElement coin = pool.Get();
                var f = (Flight)coin.userData;
                f.currency = c;
                f.amount = amount;
                f.lead = i == 0;
                // 시작 위치는 transition 없이 (수식 클래스 fly 를 떼고) 바로 놓는다
                coin.RemoveFromClassList("coin--fly");
                for (int k = 0; k < 3; k++) coin.EnableInClassList("coin--" + Key[k], k == ci);
                coin.style.transitionDuration = new List<TimeValue> { new(flySeconds, TimeUnit.Second), new(flySeconds, TimeUnit.Second), new(flySeconds, TimeUnit.Second) };
                coin.style.left = from.x - 24f + (i * 37) % 60 - 30;
                coin.style.top = from.y - 24f + (i * 23) % 40 - 20;
                // 같은 프레임에 끝 위치를 넣으면 transition 없이 바로 끝에 나타난다 — 한 프레임 이상 미룬다
                coin.schedule.Execute(() =>
                {
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
            if (!f.lead) return;
            pending[(int)f.currency]--;
            ShowGain(f.currency, f.amount);
            CountTo(f.currency);
        }
    }
}
