// 재화 · 상품 데이터와 지갑 (MonoBehaviour 아님). 진열 · 확인 창 · 재화 바가 모두 이 값을 읽는다.
// - Wallet: 잔액 + 변경 이벤트(Changed). 재화 바는 이 이벤트를 구독할 뿐 매 프레임 다시 읽지 않는다
// - Catalog: 상품표 하나. 원화 환산 · 할인율 · 남은 시간은 화면마다 따로 적지 않고 이 값에서 계산한다
// - MockStore: 실제 결제 대신 지연 뒤 성공을 돌려주는 자리 — Unity IAP 를 붙일 곳을 주석으로 표시했다
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
        public string id;
        public string displayName;
        [Tooltip("0 보다 크면 원화로 사는 결정 충전 상품")] public int priceKrw;
        [Tooltip("결정 가격 (priceKrw 가 0 일 때)")] public int priceGem;
        [Tooltip("할인 전 '실제로 팔던' 결정 가격. 0 이면 할인 없음 — 가짜 원래 가격을 넣지 않는다")] public int wasGem;
        public List<Amount> gives = new();
        [Tooltip("재화가 아닌 물품 (보관함으로)")] public string items;
        [Tooltip("한정 판매 종료 시각 (UTC 유닉스 초). 0 이면 상시")] public long endsUnix;
        public bool refundable = true;
        public string refundText;

        public bool IsCashPack => priceKrw > 0;
        public int GemsGiven
        {
            get
            {
                foreach (Amount a in gives) if (a.currency == Currency.Gem) return a.value;
                return 0;
            }
        }
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
                    gives = { new(Currency.Credit, 15000), new(Currency.Energy, 30) }, refundText = "받은 물품을 쓰기 전이면 청약철회 가능" },
                new() { id = "credits", displayName = "크레딧 묶음", priceGem = 120,
                    gives = { new(Currency.Credit, 12000) }, refundText = "크레딧을 쓰기 전이면 청약철회 가능" },
                new() { id = "crate", displayName = "탐사 보급 상자", priceGem = 1200, items = "냉각 셀 ×10",
                    gives = { new(Currency.Credit, 80000), new(Currency.Energy, 120) }, refundText = "받은 물품을 쓰기 전이면 청약철회 가능" },
                new() { id = "energy", displayName = "에너지 충전", priceGem = 50, refundable = false,
                    gives = { new(Currency.Energy, 60) }, refundText = "받는 즉시 에너지에 더해져 청약철회 불가 — 구매 전에 알림" },
                new() { id = "gem60", displayName = "궤도 결정 60", priceKrw = 1200,
                    gives = { new(Currency.Gem, 60) }, refundText = "결정을 쓰기 전이면 청약철회 가능" },
                new() { id = "gem330", displayName = "궤도 결정 330", priceKrw = 5900, items = "기본 300 + 보너스 30",
                    gives = { new(Currency.Gem, 330) }, refundText = "결정을 쓰기 전이면 청약철회 가능" },
                new() { id = "gem1100", displayName = "궤도 결정 1,100", priceKrw = 19000, items = "기본 1,000 + 보너스 100",
                    gives = { new(Currency.Gem, 1100) }, refundText = "결정을 쓰기 전이면 청약철회 가능" },
            };
        }
    }

    /// <summary>
    /// 결제 자리 표시. 실제 게임은 여기에 Unity IAP 를 붙인다:
    /// 구매 요청 → 스토어 결제 UI → 구매 확인 콜백(패키지 버전에 따라 ProcessPurchase 또는 OnPurchasePending)
    /// → 서버가 영수증 검증 → 지급 → 완료 알림. 버튼을 눌렀다는 것만으로 지급하지 않는다.
    /// 결정으로 사는 상품도 실제로는 서버가 잔액을 확인하고 차감한다.
    /// </summary>
    public class MockStore
    {
        public float cashLatency = 0.6f;
        public float gemLatency = 0.25f;

        public IEnumerator Purchase(Product p, Action<bool> done)
        {
            yield return new WaitForSecondsRealtime(p.IsCashPack ? cashLatency : gemLatency);
            done(true);
        }
    }
}
