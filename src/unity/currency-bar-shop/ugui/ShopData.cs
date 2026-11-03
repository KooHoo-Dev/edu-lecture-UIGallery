// 상품표 · 지갑(변경 이벤트) · 확인 창 로직(PurchaseFlow) · MockStore — MonoBehaviour 아님. UGUI · UI Toolkit 두 판이 같이 쓴다.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.CurrencyBarShop
{
    public enum Currency { Credit, Gem, Energy }

    [Serializable]
    public struct Amount
    {
        public Currency currency;
        public int value;
        public Amount(Currency c, int v) { currency = c; value = v; }
    }

    [Serializable]
    public class Product
    {
        public string id, displayName;
        [Tooltip("0 보다 크면 원화로 사는 결정 충전 상품")] public int priceKrw;
        [Tooltip("결정 가격 (priceKrw 가 0 일 때)")] public int priceGem;
        [Tooltip("할인 전 '실제로 팔던' 결정 가격. 0 이면 할인 없음 — 가짜 원래 가격을 넣지 않는다")] public int wasGem;
        public List<Amount> gives = new();
        [Tooltip("재화가 아닌 물품 (보관함으로)")] public string items;
        [Tooltip("한정 판매 종료 시각 (UTC 유닉스 초). 0 이면 상시")] public long endsUnix;
        [Tooltip("예시 문구. 실제 가능 여부 · 조건은 법령 · 약관으로 확인해 적는다")] public string refundText = "가능 — 조건 · 방법은 약관 참고 (예시 문구)";

        public bool IsCashPack => priceKrw > 0;
        public int GemsGiven => gives.Find(a => a.currency == Currency.Gem).value;
    }

    public static class Pricing
    {
        /// <summary>기본 충전 상품(결정 60 = ₩1,200) 기준 결정 1개 값 — 원화 환산은 이 값 하나에서</summary>
        public const int KrwPerGem = 20;
        public static int GemToKrw(int gems) => Mathf.RoundToInt(gems * KrwPerGem / 100f) * 100;
        public static string Won(int krw) => "₩" + krw.ToString("N0");
        public static readonly string[] Names = { "크레딧", "궤도 결정", "에너지" };

        public static string Contents(Product p)
        {
            var parts = new List<string>();
            foreach (Amount a in p.gives) parts.Add($"{Names[(int)a.currency]} {a.value:N0}");
            if (!string.IsNullOrEmpty(p.items)) parts.Add(p.items);
            return string.Join(" · ", parts);
        }

        public static string Remain(TimeSpan t)
        {
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            return (t.Days > 0 ? $"{t.Days}일 " : "") + $"{t.Hours:00}:{t.Minutes:00}:{t.Seconds:00}";
        }
    }

    /// <summary>잔액과 변경 이벤트. 재화 바 · 상점이 같은 인스턴스(Shared)를 쓴다</summary>
    public class Wallet
    {
        public const int EnergyMax = 60;
        public static Wallet Shared { get; private set; } = new Wallet(4200, 680, 42);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Shared = new Wallet(4200, 680, 42);   // 도메인 리로드를 꺼도 이전 실행 값이 남지 않게

        readonly int[] balance = new int[3];

        /// <summary>(재화, 이전 값, 새 값)</summary>
        public event Action<Currency, int, int> Changed;

        public Wallet(int credit, int gem, int energy)
        {
            balance[0] = credit;
            balance[1] = gem;
            balance[2] = energy;
        }

        public int this[Currency c] => balance[(int)c];
        public int ShortOf(Product p) => p.IsCashPack ? 0 : Mathf.Max(0, p.priceGem - this[Currency.Gem]);

        public void Add(Currency c, int delta)
        {
            int old = balance[(int)c];
            balance[(int)c] = old + delta;
            Changed?.Invoke(c, old, balance[(int)c]);
        }

        public bool TrySpend(Currency c, int value)
        {
            if (this[c] < value) return false;
            Add(c, -value);
            return true;
        }
    }

    public static class Catalog
    {
        public static List<Product> Default()
        {
            long ends = DateTimeOffset.UtcNow.AddHours(2 * 24 + 13).AddMinutes(20).ToUnixTimeSeconds();
            return new List<Product>
            {
                new() { id = "kit", displayName = "정비 꾸러미", priceGem = 300, wasGem = 375, endsUnix = ends, items = "수리 키트 ×5",
                    gives = { new(Currency.Credit, 15000), new(Currency.Energy, 30) } },
                new() { id = "credits", displayName = "크레딧 묶음", priceGem = 120, gives = { new(Currency.Credit, 12000) } },
                new() { id = "crate", displayName = "탐사 보급 상자", priceGem = 1200, items = "냉각 셀 ×10",
                    gives = { new(Currency.Credit, 80000), new(Currency.Energy, 120) } },
                // 바로 쓰이는 상품은 가능 여부를 단정하지 않는다. 철회가 안 되면 그 사실과 이유를 구매 전에 적는다
                new() { id = "energy", displayName = "에너지 충전", priceGem = 50, gives = { new(Currency.Energy, 60) },
                    refundText = "가능 여부 · 조건은 약관 참고 (예시 문구)" },
                new() { id = "gem60", displayName = "궤도 결정 60", priceKrw = 1200, gives = { new(Currency.Gem, 60) } },
                new() { id = "gem330", displayName = "궤도 결정 330", priceKrw = 5900, items = "기본 300 + 보너스 30", gives = { new(Currency.Gem, 330) } },
                new() { id = "gem1100", displayName = "궤도 결정 1,100", priceKrw = 19000, items = "기본 1,000 + 보너스 100", gives = { new(Currency.Gem, 1100) } },
            };
        }
    }

    /// <summary>
    /// 결제 자리 표시. 실제 게임은 여기에 Unity IAP 를 붙인다: 구매 요청 → 스토어 결제 UI → 구매 확인 콜백
    /// (패키지 버전에 따라 ProcessPurchase 또는 OnPurchasePending) → 서버가 영수증 검증 → 지급 → 완료 알림.
    /// 버튼을 눌렀다는 것만으로 지급하지 않는다. 결정으로 사는 상품도 실제로는 서버가 잔액을 확인하고 차감한다.
    /// </summary>
    public class MockStore
    {
        public float cashLatency = 0.6f, gemLatency = 0.25f;

        public IEnumerator Purchase(Product p, Action<bool> done)
        {
            yield return new WaitForSecondsRealtime(p.IsCashPack ? cashLatency : gemLatency);
            done(true);
        }
    }

    /// <summary>확인 창 로직 — 문구 · 누른 시각 기준 입력 잠금 · 부족 판정 · 결제(차감 → 지급). 두 판의 확인 창은 이 값을 그리기만 한다</summary>
    public class PurchaseFlow
    {
        public enum Result { Ignored, NeedCharge, Pay }

        public float lockSeconds = 0.35f;
        public Product Current { get; private set; }
        public bool Paying { get; private set; }
        /// <summary>결제가 멈춘 이유 (없으면 null)</summary>
        public string Error { get; private set; }

        readonly Wallet wallet;
        readonly MockStore store = new();
        float unlockAt;

        public PurchaseFlow(Wallet w) => wallet = w;

        public int ShortBy => Current == null ? 0 : wallet.ShortOf(Current);
        public float LockProgress(float now) => lockSeconds <= 0f ? 1f : Mathf.Clamp01(1f - (unlockAt - now) / lockSeconds);

        public bool Open(Product p, float now)
        {
            if (Paying || p == null) return false;
            Current = p;
            Error = null;
            unlockAt = now + lockSeconds;
            return true;
        }

        public bool Close()
        {
            if (Paying || Current == null) return false;
            Current = null;
            return true;
        }

        /// <summary>결제 대기 중 화면이 꺼졌다 (코루틴이 멈춘다). 실제 게임은 다음 접속 때 스토어의 미완료 구매를 받아 지급한다</summary>
        public void Abort() => Paying = false;

        // 한정 상품은 진열 카드와 같은 종료 시각을 적는다
        public string Contents => Pricing.Contents(Current)
            + (Current.endsUnix > 0 ? $"\n판매 종료 {DateTimeOffset.FromUnixTimeSeconds(Current.endsUnix).ToLocalTime():M월 d일 HH:mm}" : "");
        public string Price => Current.IsCashPack
            ? $"{Pricing.Won(Current.priceKrw)}  (모의 결제)"
            : $"결정 {Current.priceGem:N0}  (약 {Pricing.Won(Pricing.GemToKrw(Current.priceGem))})";
        public string After
        {
            get
            {
                int gem = wallet[Currency.Gem];
                return ShortBy > 0 ? $"결정 {gem:N0} → {ShortBy:N0}개 부족" : $"결정 {gem:N0} → {(Current.IsCashPack ? gem + Current.GemsGiven : gem - Current.priceGem):N0}";
            }
        }
        /// <summary>창 아래 안내 한 줄 (없으면 null): 멈춘 이유 · 부족 · 이미 최대치인 에너지</summary>
        public string Notice => Error
            ?? (ShortBy > 0 ? $"결정이 {ShortBy:N0}개 모자란다. 충전 상품을 고른 뒤 다시 산다."
            : Current.gives.TrueForAll(g => g.currency == Currency.Energy) && wallet[Currency.Energy] >= Wallet.EnergyMax
                ? $"에너지가 이미 {wallet[Currency.Energy]} / {Wallet.EnergyMax} 로 최대치를 넘었다. 지금 사지 않아도 된다." : null);
        public string BuyLabel => Paying ? "스토어 확인 중…" : ShortBy > 0 ? "충전 상품 보기" : Current.IsCashPack ? $"{Pricing.Won(Current.priceKrw)} 결제" : "구매";

        /// <summary>구매 버튼. pressedAt = 누른 시각 (마우스 · 터치는 PointerDown 시각, 키보드 · 패드 Submit 은 지금)</summary>
        public Result Press(float pressedAt)
        {
            if (Current == null || Paying || pressedAt < unlockAt) return Result.Ignored;
            if (ShortBy == 0) return Result.Pay;
            Current = null;   // 부족하면 이 창에서 결제하지 않고 충전 상품 목록으로
            return Result.NeedCharge;
        }

        /// <summary>스토어 확인 → (결정 상품이면) 차감 → 지급. 차감이 실패하면(그사이 잔액이 바뀜) 주지 않고 멈춘다.
        /// beforeGrant(지급, 순서) 는 지갑에 더하기 '전에' 부른다 — 재화 바가 날아오는 중인 줄 알아야 숫자를 기다린다</summary>
        public IEnumerator Pay(Action<Amount, int> beforeGrant)
        {
            Product p = Current;
            Paying = true;
            Error = null;
            bool ok = false;
            yield return store.Purchase(p, r => ok = r);
            Paying = false;
            if (!ok) Error = "결제가 끝나지 않았다 — 다시 시도";
            else if (!p.IsCashPack && !wallet.TrySpend(Currency.Gem, p.priceGem)) Error = "그사이 결정이 줄어 구매를 멈췄다 — 빼지도 주지도 않았다";
            if (Error != null) yield break;
            for (int i = 0; i < p.gives.Count; i++)
            {
                beforeGrant?.Invoke(p.gives[i], i);
                wallet.Add(p.gives[i].currency, p.gives[i].value);
            }
            Current = null;
        }
    }
}
