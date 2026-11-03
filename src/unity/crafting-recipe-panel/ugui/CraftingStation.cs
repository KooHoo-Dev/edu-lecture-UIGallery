using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.CraftingRecipePanel
{
    // 늘 켜져 있는 제작대: 인벤토리 · 해금 · 제작 대기열.
    // 창(CraftingPanel / CraftingUITK)은 이 데이터를 보여 주기만 한다. 창을 꺼도 코루틴은 여기서 돌아 제작이 계속된다.
    public class CraftingStation : MonoBehaviour
    {
        public class Job
        {
            public Recipe Recipe;
            public float Elapsed, Duration;
            public List<Ingredient> Used;   // 걸 때 실제로 뺀 재료 — 취소하면 이만큼 돌려준다
            public float Progress => Duration <= 0f ? 1f : Mathf.Clamp01(Elapsed / Duration);
        }

        public enum EnqueueResult { Ok, QueueFull, MissingItems }

        [SerializeField] Inventory inventory = new();
        [SerializeField] List<Recipe> recipes = new();
        [SerializeField] List<ItemInfo> items = new();
        [SerializeField, Range(1, 5)] int queueSize = 3;
        [SerializeField, Min(0.1f)] float craftTimeScale = 1f;

        readonly List<Job> queue = new();
        readonly HashSet<Recipe> unlocked = new();
        readonly HashSet<Recipe> fresh = new();   // '새' 배지
        Coroutine runner;

        public Inventory Inventory => inventory;
        public IReadOnlyList<Recipe> Recipes => recipes;
        public IReadOnlyList<Job> Queue => queue;
        public int QueueSize => queueSize;
        public float CraftTimeScale => craftTimeScale;
        public event Action QueueChanged;
        public event Action<Recipe> Unlocked;

        void Awake()
        {
            foreach (Recipe r in recipes)
                if (!r.startsLocked) unlocked.Add(r);
        }

        void OnEnable()
        {
            if (queue.Count > 0) runner = StartCoroutine(Run());
        }

        void OnDisable() => runner = null;   // 꺼지면 코루틴도 멈춘다 → 켜질 때 다시 시작

        public bool IsUnlocked(Recipe r) => unlocked.Contains(r);
        public bool IsNew(Recipe r) => fresh.Contains(r);
        public void MarkSeen(Recipe r) => fresh.Remove(r);

        public string DisplayName(string id)
        {
            foreach (ItemInfo i in items) if (i.id == id) return i.displayName;
            return id;
        }

        public Sprite Icon(string id)
        {
            foreach (ItemInfo i in items) if (i.id == id) return i.icon;
            return null;
        }

        /// 재료는 '걸 때' 뺀다 (예약). 완성 때 빼면 기다리는 동안 다른 제작에 써 버려 완성 순간 모자랄 수 있다
        public EnqueueResult Enqueue(Recipe r)
        {
            if (queue.Count >= queueSize) return EnqueueResult.QueueFull;
            var used = new List<Ingredient>(r.ingredients);
            if (!inventory.TryTake(used, $"{r.displayName} 재료 사용")) return EnqueueResult.MissingItems;
            queue.Add(new Job { Recipe = r, Duration = r.seconds * craftTimeScale, Used = used });
            QueueChanged?.Invoke();
            runner ??= StartCoroutine(Run());
            return EnqueueResult.Ok;
        }

        /// 취소 = 쓴 재료를 그대로 환불 → Inventory.Changed → 창이 레시피 상태를 다시 계산한다
        public void Cancel(int index)
        {
            if (index < 0 || index >= queue.Count) return;
            Job job = queue[index];
            queue.RemoveAt(index);
            QueueChanged?.Invoke();
            inventory.AddRange(job.Used, $"{job.Recipe.displayName} 취소 환불");
        }

        IEnumerator Run()
        {
            while (queue.Count > 0)
            {
                Job job = queue[0];
                job.Elapsed += Time.deltaTime;
                if (job.Elapsed >= job.Duration)
                {
                    queue.RemoveAt(0);
                    QueueChanged?.Invoke();
                    // 완성품도 인벤토리에 들어간다 → 그것을 재료로 쓰는 레시피의 상태가 바뀐다
                    inventory.Add(job.Recipe.resultId, job.Recipe.resultCount, $"{job.Recipe.displayName} 완성");
                }
                yield return null;
            }
            runner = null;
        }

        public void Gather(string id, int n) => inventory.Add(id, n, "재료 획득");

        public void UnlockNext()
        {
            foreach (Recipe r in recipes)
            {
                if (unlocked.Contains(r)) continue;
                unlocked.Add(r);
                fresh.Add(r);
                Unlocked?.Invoke(r);
                return;
            }
        }
    }
}
