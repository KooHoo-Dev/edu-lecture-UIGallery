// 뽑기 표 하나 (ScriptableObject) — 추첨기(GachaServer)와 확률표(OddsTableView · GachaUITK)가 함께 읽는 유일한 데이터.
// 화면에 보이는 숫자 · 천장 문장은 모두 이 에셋에서 계산한다. 숫자를 인스펙터나 문자열 표에 따로 적지 않는다.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.GachaRevealOdds
{
    public enum Grade { Hero, Rare, Common }
    public enum PityMode { Guarantee, Exchange }

    [Serializable]
    public class GachaItem
    {
        public string displayName;
        public Grade grade;
        [Tooltip("같은 등급 안에서의 몫 (상대값). 등급 확률 × 몫 / 등급 몫 합 = 항목 확률")]
        [Min(0)] public float share = 1f;
        public Sprite icon;
    }

    [CreateAssetMenu(menuName = "UI Gallery/Gacha Table")]
    public class GachaTable : ScriptableObject
    {
        [Header("등급 확률 (%) — 일반은 나머지")]
        [Range(0f, 100f)] public float heroRatePct = 2f;
        [Range(0f, 100f)] public float rareRatePct = 13f;

        [Header("항목")]
        public List<GachaItem> items = new();

        [Header("천장")]
        public PityMode pityMode = PityMode.Guarantee;
        [Tooltip("보장형: 영웅 없이 (n − 1)회면 다음 1회 확정. 교환형: 포인트 n점이면 교환")]
        [Min(1)] public int pityCount = 80;
        [Tooltip("교환형에서 교환해 주는 항목 번호")]
        public int exchangeItem;

        public static readonly string[] GradeNames = { "영웅", "희귀", "일반" };

        public float GradePercent(Grade g) => g switch
        {
            Grade.Hero => heroRatePct,
            Grade.Rare => rareRatePct,
            _ => Mathf.Max(0f, 100f - heroRatePct - rareRatePct),
        };

        float ShareSum(Grade g)
        {
            float sum = 0f;
            foreach (GachaItem it in items) if (it.grade == g) sum += it.share;
            return sum;
        }

        /// <summary>항목 i 의 1회 확률(%). 추첨 가중치도 이 값이다</summary>
        public float ItemPercent(int i)
        {
            GachaItem it = items[i];
            float sum = ShareSum(it.grade);
            return sum > 0f ? GradePercent(it.grade) * it.share / sum : 0f;
        }

        /// <summary>천장을 포함한 영웅 종합 확률(%). 보장형: 영웅 하나에 드는 평균 횟수 E = Σ(1−p)^k (k &lt; N)</summary>
        public float ConsolidatedHeroPercent()
        {
            float p = heroRatePct / 100f;
            if (pityMode != PityMode.Guarantee || p <= 0f) return heroRatePct;
            float e = (1f - Mathf.Pow(1f - p, pityCount)) / p;
            return 100f / e;
        }

        /// <summary>천장 규칙 문장 — 숫자를 손으로 적지 않고 표에서 만든다</summary>
        public string PityRuleText() => pityMode == PityMode.Guarantee
            ? $"영웅 없이 {pityCount - 1}회 뽑으면 다음 1회는 영웅 확정 ({pityCount}회 안에 1개)"
            : $"1회마다 교환 포인트 1점, {pityCount}점이면 {items[exchangeItem].displayName} 교환";

        /// <summary>
        /// 표가 표시와 추첨을 똑같이 만들 수 있는지 확인한다. 등급 확률 합이 100 을 넘거나, 확률이 있는 등급에 항목이 없으면
        /// 추첨(가중치 합으로 나눔)과 확률표(적힌 값)가 달라진다 — 이 표본이 가르치는 바로 그 실수. 이런 표로는 추첨하지 않는다.
        /// </summary>
        public bool Validate(out string message)
        {
            message = null;
            if (heroRatePct + rareRatePct > 100f) message = $"영웅 + 희귀 = {heroRatePct + rareRatePct}% — 100% 를 넘는다";
            for (int g = 0; g < 3 && message == null; g++)
                if (GradePercent((Grade)g) > 0f && ShareSum((Grade)g) <= 0f) message = $"{GradeNames[g]} 확률이 {GradePercent((Grade)g)}% 인데 항목(몫 > 0)이 없다";
            if (message == null && pityMode == PityMode.Guarantee && ShareSum(Grade.Hero) <= 0f) message = "보장형 천장인데 영웅 항목이 없다";
            if (message == null && pityMode == PityMode.Exchange && (exchangeItem < 0 || exchangeItem >= items.Count)) message = "교환 항목 번호가 목록 밖이다";
            if (message == null)
            {
                float sum = 0f;
                for (int i = 0; i < items.Count; i++) sum += ItemPercent(i);
                if (Mathf.Abs(sum - 100f) > 0.001f) message = $"항목 확률 합이 {sum:0.###}% — 100% 가 아니다";
            }
            return message == null;
        }

        void OnValidate()
        {
            if (!Validate(out string message)) Debug.LogWarning($"[{name}] 표시와 추첨이 달라지는 표: {message}", this);
        }

        /// <summary>가중치 추첨. onlyHero 면 영웅 안에서만 (천장 확정 — 같은 표의 비율 그대로)</summary>
        public int Draw(System.Random rnd, bool onlyHero = false)
        {
            float total = 0f;
            for (int i = 0; i < items.Count; i++) if (!onlyHero || items[i].grade == Grade.Hero) total += ItemPercent(i);
            double r = rnd.NextDouble() * total;
            for (int i = 0; i < items.Count; i++)
            {
                if (onlyHero && items[i].grade != Grade.Hero) continue;
                r -= ItemPercent(i);
                if (r < 0) return i;
            }
            return items.Count - 1;
        }
    }
}
