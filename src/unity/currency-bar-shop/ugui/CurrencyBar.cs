// 재화 바 — 씬이 바뀌어도 남는 공용 UI (DontDestroyOnLoad). Wallet.Changed 를 구독해 숫자를 바꾼다.
// - 줄어들면 바로 줄인다. 늘어나면 Fly 로 날아온 첫 아이콘이 칸에 닿은 뒤 카운트업(고정 시간 + 감속 곡선)
// - 코인 비행: ObjectPool<Image> + 2차 베지어. 아이콘 프리팹은 Raycast Target 을 끄고 앵커 · 피벗을 가운데로
// - feedback 을 끄면 '나쁜 예': 날아가는 아이콘 · 칸 강조 · +N 없이 숫자만 바뀐다
using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.UI;

namespace UIGallery.CurrencyBarShop
{
    public class CurrencyBar : MonoBehaviour
    {
        [Serializable]
        public class Slot
        {
            public Currency currency;
            [Tooltip("비행 도착점 · 강조 대상")] public RectTransform icon;
            public TextMeshProUGUI amount;
            [Tooltip("+15,000 처럼 잠시 뜨는 글자")] public TextMeshProUGUI gain;
            [Tooltip("충전 버튼 (크레딧은 비워 둔다)")] public Button plus;
            [NonSerialized] public float shown;
            [NonSerialized] public int pendingFlights;
            [NonSerialized] public Coroutine counting, gainFade;
        }

        public static CurrencyBar Instance { get; private set; }

        [SerializeField] Slot[] slots;
        [SerializeField] RectTransform flyLayer;
        [SerializeField] Image coinPrefab;
        [Tooltip("Currency 순서: 크레딧 · 결정 · 에너지")] [SerializeField] Sprite[] coinSprites = new Sprite[3];
        [SerializeField] int coinsPerGrant = 8;
        [SerializeField] float flySeconds = 0.7f;
        [SerializeField] float countUpSeconds = 0.9f;
        [SerializeField] bool feedback = true;

        /// <summary>+ 버튼 — 상점이 구독한다 (상점이 사라질 때 꼭 해제)</summary>
        public event Action<Currency> PlusPressed;

        ObjectPool<Image> pool;
        readonly System.Collections.Generic.List<Image> flying = new();
        Wallet wallet;

        void Awake()
        {
            // 공용 UI 가 든 씬을 다시 불러오면 바가 둘이 된다 — 먼저 있던 것을 남긴다
            if (Instance != null && Instance != this)
            {
                Destroy(transform.root.gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(transform.root.gameObject);
            pool = new ObjectPool<Image>(
                createFunc: () => Instantiate(coinPrefab, flyLayer),
                actionOnGet: c => c.gameObject.SetActive(true),
                actionOnRelease: c => c.gameObject.SetActive(false),
                actionOnDestroy: c => Destroy(c.gameObject),
                collectionCheck: true,
                defaultCapacity: 32,
                maxSize: 96);
            foreach (Slot s in slots)
            {
                if (s.plus == null) continue;
                Currency c = s.currency;
                s.plus.onClick.AddListener(() => PlusPressed?.Invoke(c));
            }
        }

        void OnEnable()
        {
            if (Instance != this) return;
            wallet = Wallet.Shared;
            wallet.Changed += OnChanged;
            foreach (Slot s in slots)
            {
                s.shown = wallet[s.currency];
                s.pendingFlights = 0;
                s.counting = s.gainFade = null;
                s.icon.localScale = Vector3.one;
                if (s.gain != null) s.gain.alpha = 0f;
                Draw(s);
            }
        }

        void OnDisable()
        {
            if (wallet != null) wallet.Changed -= OnChanged;
            StopAllCoroutines();
            // 날던 아이콘은 코루틴과 함께 멈춘다 — 화면에 남지 않게 풀로 돌려준다 (다시 켜면 OnEnable 이 숫자를 지갑 값으로 맞춘다)
            foreach (Image c in flying) pool.Release(c);
            flying.Clear();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void SetFeedback(bool on) => feedback = on;

        void OnChanged(Currency c, int old, int now)
        {
            Slot s = Find(c);
            if (s == null) return;
            if (now < old)
            {
                // 쓰는 것은 기다릴 이유가 없다 — 바로 줄이고, 올라가던 중이면 남은 목표로 다시 센다
                s.shown -= old - now;
                if (s.counting != null) CountTo(s);
                else Draw(s);
                if (feedback) ShowGain(s, now - old);
                return;
            }
            if (!feedback)
            {
                if (s.counting != null) StopCoroutine(s.counting);
                s.counting = null;
                s.shown = now;
                Draw(s);
                return;
            }
            if (s.pendingFlights > 0) return;   // 날아오는 아이콘이 닿을 때 올린다
            CountTo(s);                         // 날아오는 것 없이 늘어난 값(시간 회복 등)은 바로
        }

        /// <summary>지갑에 더하기 '전에' 부른다 — 그래야 Changed 가 왔을 때 날아오는 중인 줄 안다</summary>
        public void Fly(Currency c, int amount, Vector2 fromScreen, float delay = 0f)
        {
            Slot s = Find(c);
            if (s == null || !feedback) return;
            s.pendingFlights++;
            int n = c == Currency.Energy ? Mathf.Max(1, coinsPerGrant / 2) : coinsPerGrant;
            for (int i = 0; i < n; i++) StartCoroutine(FlyOne(s, amount, fromScreen, delay + i * 0.05f, i));
        }

        IEnumerator FlyOne(Slot s, int amount, Vector2 fromScreen, float delay, int i)
        {
            for (float w = 0f; w < delay; w += Time.unscaledDeltaTime) yield return null;
            // Overlay Canvas 라 카메라 인자는 null
            RectTransformUtility.ScreenPointToLocalPointInRectangle(flyLayer, fromScreen, null, out Vector2 p0);
            p0 += new Vector2((i * 37) % 60 - 30, (i * 23) % 40 - 20);
            Vector2 p2 = flyLayer.InverseTransformPoint(s.icon.position);
            // 조절점을 옆 · 위로 흩어 아이콘마다 다른 호를 그린다
            float side = (i % 2 == 0 ? -1f : 1f) * (120f + (i * 53) % 160);
            Vector2 p1 = new((p0.x + p2.x) * 0.5f + side, Mathf.Lerp(p0.y, p2.y, 0.75f) + 60f);

            Image coin = pool.Get();
            flying.Add(coin);
            coin.sprite = coinSprites[(int)s.currency];
            RectTransform rt = coin.rectTransform;
            for (float t = 0f; t < flySeconds; t += Time.unscaledDeltaTime)
            {
                float e = t / flySeconds;
                e *= e;   // ease-in: 바에 가까울수록 빨라진다
                float u = 1f - e;
                rt.anchoredPosition = u * u * p0 + 2f * u * e * p1 + e * e * p2;
                rt.localScale = Vector3.one * (1.15f - 0.45f * e);
                yield return null;
            }
            flying.Remove(coin);
            pool.Release(coin);
            StartCoroutine(Pulse(s.icon));
            if (i == 0)
            {
                s.pendingFlights--;
                ShowGain(s, amount);
                CountTo(s);
            }
        }

        void CountTo(Slot s)
        {
            if (s.counting != null) StopCoroutine(s.counting);
            s.counting = StartCoroutine(CountRoutine(s));
        }

        IEnumerator CountRoutine(Slot s)
        {
            float from = s.shown;
            for (float t = 0f; t < countUpSeconds; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / countUpSeconds, 3f);   // easeOutCubic — 값 크기와 무관하게 같은 시간
                s.shown = Mathf.Lerp(from, wallet[s.currency], k);
                Draw(s);
                yield return null;
            }
            s.shown = wallet[s.currency];
            Draw(s);
            s.counting = null;
        }

        IEnumerator Pulse(RectTransform icon)
        {
            for (float t = 0f; t < 0.2f; t += Time.unscaledDeltaTime)
            {
                icon.localScale = Vector3.one * (1f + 0.2f * Mathf.Sin(t / 0.2f * Mathf.PI));
                yield return null;
            }
            icon.localScale = Vector3.one;
        }

        void ShowGain(Slot s, int delta)
        {
            if (s.gain == null) return;
            s.gain.text = (delta > 0 ? "+" : "−") + Mathf.Abs(delta).ToString("N0");
            s.gain.color = delta > 0 ? new Color(0.49f, 0.95f, 0.77f) : new Color(1f, 0.7f, 0.42f);
            if (s.gainFade != null) StopCoroutine(s.gainFade);
            s.gainFade = StartCoroutine(GainFade(s.gain, delta > 0 ? 1.8f : 1.4f));
        }

        static IEnumerator GainFade(TextMeshProUGUI label, float seconds)
        {
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime)
            {
                label.alpha = Mathf.Clamp01((seconds - t) / 0.4f);   // 마지막 0.4초만 사라진다
                yield return null;
            }
            label.alpha = 0f;
        }

        static void Draw(Slot s)
        {
            int v = Mathf.RoundToInt(s.shown);
            s.amount.text = s.currency == Currency.Energy ? $"{v:N0} / {Wallet.EnergyMax}" : v.ToString("N0");
        }

        Slot Find(Currency c)
        {
            foreach (Slot s in slots) if (s.currency == c) return s;
            return null;
        }
    }
}
