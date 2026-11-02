using System;
using UnityEngine;

namespace UIGallery.InventoryGridTooltip
{
    // 아이템 데이터 (ScriptableObject) + 희귀도·부위·능력치 정의.
    // 화면과 무관한 데이터만 둔다. UGUI·UI Toolkit 두 구현이 함께 쓴다.

    public enum EquipSlot { Head, Body, Hand, Power, Supply }

    /// <summary>기본 · 개량 · 정예 · 명품 · 유일</summary>
    public enum Rarity { Common, Improved, Elite, Prized, Unique }

    public enum StatKey { Power, Stability, Durability, Weight }

    [Serializable]
    public struct ItemStats
    {
        public float power;
        public float stability;
        public float durability;
        public float weight;   // kg — 낮을수록 좋다

        public float Get(StatKey key) => key switch
        {
            StatKey.Power => power,
            StatKey.Stability => stability,
            StatKey.Durability => durability,
            _ => weight,
        };
    }

    [CreateAssetMenu(menuName = "Inventory/Item")]
    public class InventoryItem : ScriptableObject
    {
        public string displayName;
        public EquipSlot slot;
        public Rarity rarity;
        public Sprite icon;
        public ItemStats stats;
        [Min(0)] public int quantity;           // 소모품 수량 (장비는 0)
        [TextArea] public string description;

        public bool IsEquipment => slot != EquipSlot.Supply;

        /// <summary>장비 점수 — 능력치를 한 숫자로 묶은 값 (정렬·요약 비교용)</summary>
        public int Score => IsEquipment
            ? Mathf.RoundToInt(stats.power * 1.5f + stats.stability * 1.1f + stats.durability * 0.9f + (12f - stats.weight) * 5f)
            : 0;
    }

    /// <summary>능력치 표시 규칙. higherIsBetter 가 false 면 숫자가 커질 때 '나빠짐'이다.</summary>
    public static class StatInfo
    {
        public static readonly StatKey[] All = { StatKey.Power, StatKey.Stability, StatKey.Durability, StatKey.Weight };

        public static string Label(StatKey k) => k switch
        {
            StatKey.Power => "출력",
            StatKey.Stability => "안정",
            StatKey.Durability => "내구",
            _ => "무게",
        };

        public static bool HigherIsBetter(StatKey k) => k != StatKey.Weight;
        public static float Max(StatKey k) => k == StatKey.Weight ? 8f : 100f;
        public static string Format(StatKey k, float v) => k == StatKey.Weight ? v.ToString("0.0") : Mathf.RoundToInt(v).ToString();

        /// <summary>1 좋아짐 · -1 나빠짐 · 0 같음 (무게는 방향을 뒤집는다)</summary>
        public static int Verdict(StatKey k, float diff)
        {
            if (Mathf.Abs(diff) < 0.05f) return 0;
            int sign = diff > 0 ? 1 : -1;
            return HigherIsBetter(k) ? sign : -sign;
        }
    }
}
