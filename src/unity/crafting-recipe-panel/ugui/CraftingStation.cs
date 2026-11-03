using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.CraftingRecipePanel
{
    // 늘 켜져 있는 제작대: 인벤토리 · 해금 · 대기열. 창은 보여 주기만 하고, 창을 꺼도 제작은 여기서 계속된다.
    // 창의 OnEnable 이 해금 목록을 읽으므로 창보다 먼저 초기화한다.
    [DefaultExecutionOrder(-50)]
    public class CraftingStation : MonoBehaviour
    {
        public class Job
        {
            public Recipe Recipe;
            public float Elapsed, Duration;
            public List<Ingredient> Used;   // 걸 때 뺀 재료 = 취소 때 돌려줄 양
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

        // enabled = false 로는 코루틴이 멈추지 않는다. 직접 멈추고 비우지 않으면 다시 켤 때 둘이 되어 2배속이 된다
        void OnDisable()
        {
            if (runner != null) StopCoroutine(runner);
            runner = null;
        }

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

        /// 제작 버튼 옆 이유 (두 창이 같은 글을 쓴다). ok = 지금 걸 수 있나
        public string Reason(RecipeStatus st, out bool ok)
        {
            bool full = queue.Count >= queueSize;
            ok = st.CanCraft && !full;
            if (full) return $"✕ 대기열 가득 참 ({queue.Count}/{queueSize})";
            if (ok) return $"✓ 지금 재료로 ×{st.MaxCount} 가능";
            var parts = new List<string>();
            foreach ((string id, int have, int need) in st.Missing) parts.Add($"{DisplayName(id)} {need - have}개");
            return "✕ " + string.Join(", ", parts) + " 부족";
        }

        /// 재료는 '걸 때' 뺀다 (예약). 완성 때 빼면 기다리는 동안 다른 제작에 써 버려 완성 순간 모자랄 수 있다
        public EnqueueResult Enqueue(Recipe r)
        {
            if (queue.Count >= queueSize) return EnqueueResult.QueueFull;
            var used = new List<Ingredient>(r.ingredients);
            if (!inventory.TryTake(used, $"{r.displayName} 재료 사용")) return EnqueueResult.MissingItems;
            queue.Add(new Job { Recipe = r, Duration = r.seconds * craftTimeScale, Used = used });
            QueueChanged?.Invoke();
            if (runner == null && isActiveAndEnabled) runner = StartCoroutine(Run());   // 꺼져 있으면 OnEnable 이
            return EnqueueResult.Ok;
        }

        /// 취소 = 쓴 재료를 그대로 환불 → Changed → 창이 다시 계산한다
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
                    // 완성품도 인벤토리다 → 그것을 재료로 쓰는 레시피 상태가 바뀐다
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
