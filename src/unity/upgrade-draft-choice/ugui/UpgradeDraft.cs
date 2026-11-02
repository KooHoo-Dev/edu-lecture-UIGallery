using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.UpgradeDraftChoice
{
    /// <summary>
    /// 레벨업 카드 추첨 (순수 계산 — UGUI · UI Toolkit 판이 함께 쓴다).
    /// - 고를 수 있는 것만: 최대 레벨 제외 · 슬롯이 가득 찬 종류의 '새 것' 제외 · 추방한 것 제외
    /// - 그 안에서 중복 없이 n 장 (뽑은 것을 목록에서 빼며 뽑는다). 희귀도는 가중치
    /// - 모자라면 대체 보상(회복 · 크레딧 같은 fillers)으로 채운다 — 빈 카드를 보여 주지 않는다
    /// </summary>
    public static class UpgradeDraft
    {
        public const int MaxLevel = 5;

        public class Build
        {
            public readonly Dictionary<Upgrade, int> levels = new();
            /// <summary>지금까지 쌓인 수치 — 희귀도마다 오르는 양이 달라서 '레벨 × 기본값' 으로 다시 계산할 수 없다</summary>
            public readonly Dictionary<Upgrade, float> values = new();
            public readonly HashSet<Upgrade> banished = new();
            public int slotLimit = 4;

            public int Level(Upgrade u) => levels.TryGetValue(u, out int l) ? l : 0;
            public float Value(Upgrade u) => values.TryGetValue(u, out float v) ? v : 0f;

            public int Owned(UpgradeKind kind)
            {
                int n = 0;
                foreach (KeyValuePair<Upgrade, int> kv in levels)
                    if (kv.Key.kind == kind && kv.Value > 0) n++;
                return n;
            }

            /// <summary>고른 카드를 빌드에 반영 (대체 보상은 빌드가 아니라 게임 쪽에서 처리)</summary>
            public void Apply(Offer o)
            {
                if (o.level < 0) return;
                levels[o.upgrade] = o.level + 1;
                values[o.upgrade] = Value(o.upgrade) + Step(o.upgrade, o.rarity);
            }
        }

        public struct Offer
        {
            public Upgrade upgrade;
            public Rarity rarity;
            /// <summary>지금 레벨. 0 = 새로 얻음, -1 = 대체 보상</summary>
            public int level;
        }

        static readonly (Rarity rarity, float weight)[] Weights = { (Rarity.Common, 70f), (Rarity.Rare, 25f), (Rarity.Epic, 5f) };

        public static List<Upgrade> Eligible(IReadOnlyList<Upgrade> pool, Build b)
        {
            var list = new List<Upgrade>();
            foreach (Upgrade u in pool)
            {
                int lv = b.Level(u);
                if (b.banished.Contains(u)) continue;
                if (lv >= MaxLevel) continue;
                if (lv == 0 && b.Owned(u.kind) >= b.slotLimit) continue;   // 슬롯이 가득 → 새 것은 빼고 강화만
                list.Add(u);
            }
            return list;
        }

        /// <param name="shown">이미 화면에 있는 카드 — 한 자리만 다시 뽑을 때 같은 보상이 두 장 되지 않게</param>
        public static List<Offer> Draw(IReadOnlyList<Upgrade> pool, Build b, int n, IReadOnlyList<Upgrade> fillers, System.Random rnd, ICollection<Upgrade> shown = null)
        {
            List<Upgrade> bag = Eligible(pool, b);
            var offers = new List<Offer>();
            while (offers.Count < n && bag.Count > 0)
            {
                int i = rnd.Next(bag.Count);
                Upgrade u = bag[i];
                bag.RemoveAt(i);   // 중복 없음
                offers.Add(new Offer { upgrade = u, rarity = PickRarity(rnd), level = b.Level(u) });
            }
            if (fillers == null || fillers.Count == 0) return offers;
            var used = new HashSet<Upgrade>();
            if (shown != null) used.UnionWith(shown);
            for (int f = 0; offers.Count < n; f++)
            {
                Upgrade pick = fillers[f % fillers.Count];
                foreach (Upgrade x in fillers)
                    if (!used.Contains(x)) { pick = x; break; }   // 화면에 없는 보상부터
                used.Add(pick);
                offers.Add(new Offer { upgrade = pick, rarity = Rarity.Common, level = -1 });
            }
            return offers;
        }

        static Rarity PickRarity(System.Random rnd)
        {
            double x = rnd.NextDouble() * 100.0;
            foreach ((Rarity rarity, float weight) in Weights)
            {
                if (x < weight) return rarity;
                x -= weight;
            }
            return Rarity.Common;
        }

        public static float Multiplier(Rarity r) => r switch { Rarity.Rare => 1.6f, Rarity.Epic => 2.5f, _ => 1f };

        // Mathf.Round 는 .5 를 짝수 쪽으로 보낸다(2.5 → 2). 카드 숫자는 늘 올림 쪽(2.5 → 3)이 자연스럽다
        static float RoundHalfUp(float x) => Mathf.Floor(x + 0.5f);

        /// <summary>이번 카드로 오르는 양 — 정수 수치는 반올림, 개수는 최소 1</summary>
        public static float Step(Upgrade u, Rarity r)
        {
            float raw = u.perLevel * Multiplier(r);
            if (u.integerStep) return Mathf.Max(1f, RoundHalfUp(raw));
            return Mathf.Approximately(u.perLevel, Mathf.Round(u.perLevel)) ? RoundHalfUp(raw) : RoundHalfUp(raw * 10f) / 10f;
        }

        /// <summary>카드 문구: "피해 +18 → +33" (지금 값은 빌드에 쌓인 값)</summary>
        public static string DiffText(Offer o, Build b)
        {
            if (o.level < 0) return $"{o.upgrade.statName} +{o.upgrade.perLevel:0.#}";
            float now = b.Value(o.upgrade);
            float next = now + Step(o.upgrade, o.rarity);
            return $"{o.upgrade.statName} {Format(now, o.upgrade)} → {Format(next, o.upgrade)}";
        }

        static string Format(float v, Upgrade u) => $"{(v > 0f ? "+" : "")}{v:0.#}{u.unit}";
    }
}
