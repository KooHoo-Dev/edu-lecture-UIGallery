using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.CraftingRecipePanel
{
    // 제작 데이터: 레시피(고정, ScriptableObject)와 인벤토리(바뀌는 수량)를 나눈다.
    // 상태(가능 · 모자람)는 저장하지 않고 Evaluate() 로 그때그때 계산한다. UI Toolkit 판도 쓴다.

    public enum RecipeTab { Maintenance, Survival, Gear }

    [Serializable]
    public struct Ingredient
    {
        public string itemId;   // 자원 id 또는 다른 레시피의 resultId
        public int count;
    }

    /// id → 이름 · 아이콘. 레시피와 인벤토리는 id 로만 이야기한다
    [Serializable]
    public struct ItemInfo
    {
        public string id;
        public string displayName;
        public Sprite icon;
    }

    [CreateAssetMenu(menuName = "UI Gallery/Crafting Recipe")]
    public class Recipe : ScriptableObject
    {
        public string displayName;
        public RecipeTab tab;
        public Sprite icon;
        [Min(0.1f)] public float seconds = 6f;
        public List<Ingredient> ingredients = new();
        public string resultId;
        [Min(1)] public int resultCount = 1;
        public bool startsLocked;

        /// 인벤토리를 조회만 한다. 에셋에 결과를 쓰지 않는다
        public RecipeStatus Evaluate(Inventory inv)
        {
            var status = new RecipeStatus { MaxCount = ingredients.Count > 0 ? int.MaxValue : 0 };
            foreach (Ingredient ing in ingredients)
            {
                int have = inv.Count(ing.itemId);
                status.MaxCount = Mathf.Min(status.MaxCount, have / Mathf.Max(1, ing.count));
                if (have < ing.count) status.Missing.Add((ing.itemId, have, ing.count));
            }
            return status;
        }
    }

    public class RecipeStatus
    {
        public int MaxCount;
        public readonly List<(string itemId, int have, int need)> Missing = new();
        public bool CanCraft => Missing.Count == 0;
    }

    /// 수량을 바꾸는 메서드는 끝에 Changed 를 한 번 부른다 → 구독자가 전부 다시 계산한다
    [Serializable]
    public class Inventory
    {
        [SerializeField] List<Ingredient> start = new();   // 시작 수량
        readonly Dictionary<string, int> counts = new();
        bool ready;

        /// 인자: 바뀐 이유
        public event Action<string> Changed;

        void Init()
        {
            if (ready) return;
            ready = true;
            foreach (Ingredient e in start) counts[e.itemId] = e.count;
        }

        public int Count(string id)
        {
            Init();
            return counts.TryGetValue(id, out int n) ? n : 0;
        }

        public void Add(string id, int n, string reason)
        {
            counts[id] = Mathf.Max(0, Count(id) + n);
            Changed?.Invoke(reason);
        }

        public void AddRange(IReadOnlyList<Ingredient> items, string reason)
        {
            foreach (Ingredient it in items) counts[it.itemId] = Count(it.itemId) + it.count;
            Changed?.Invoke(reason);
        }

        /// 전부 있을 때만 한꺼번에 뺀다 (일부만 빠지는 일이 없게)
        public bool TryTake(IReadOnlyList<Ingredient> items, string reason)
        {
            foreach (Ingredient it in items)
                if (Count(it.itemId) < it.count) return false;
            foreach (Ingredient it in items) counts[it.itemId] -= it.count;
            Changed?.Invoke(reason);
            return true;
        }
    }
}
