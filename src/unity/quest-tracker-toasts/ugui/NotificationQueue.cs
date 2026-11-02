using System;
using System.Collections.Generic;

namespace UIGallery.QuestTrackerToasts
{
    // 알림 큐 — 뷰(UGUI / UI Toolkit)와 분리된 순수 C# 로직. MonoBehaviour 가 아니다.
    // 갤러리의 queue.ts 와 같은 구조라 줄 단위로 비교하며 읽을 수 있다. 이름 대응 (시간은 ms → 초):
    //   displayMs → displaySeconds · mergeWindowMs → mergeWindowSeconds · unit → plusUnit · icon → iconId
    //   show/update/hide/changed → OnShow/OnUpdate/OnHide/OnChanged · stats.merged → statMerged
    //
    //   Enqueue(req)          알림 요청 1건. 같은 키면 병합, 아니면 대기열에 넣고 '정렬 필요' 표시만 한다
    //   Tick(dt, frozen)      시간 진행(초). frozen 이면 표시 시간이 줄지 않는다 (일시정지 · 우선 배너 중)
    //   Reconfigure(config)   설정 변경을 바로 반영 (표시 시간 · 슬롯 수)
    //   Clear()               전부 비우기
    //
    // Rarity · Toast 처럼 흔한 이름이 다른 표본 코드와 부딪히지 않도록 모두 UIGallery.QuestToasts 네임스페이스에 둔다.
    //
    // 뷰는 OnShow / OnUpdate / OnHide / OnChanged 만 구독해서 그린다. 시간 계산은 뷰에서 하지 않는다.

    public enum Rarity { Common = 0, Uncommon = 1, Rare = 2, Legendary = 3 }
    public enum QueueMode { Fifo, Priority, PriorityPreempt }
    public enum HideReason { Expired, Preempted, Cleared }

    [Serializable]
    public class ToastRequest
    {
        public string key;          // 병합 키 (아이템 ID)
        public Rarity rarity;
        public string label;
        public int amount = 1;
        public bool plusUnit;       // true = "+120" 합계, false = "×3" 개수
        public string iconId;

        public ToastRequest(string key, string label, Rarity rarity, int amount = 1, bool plusUnit = false)
        {
            this.key = key; this.label = label; this.rarity = rarity; this.amount = amount; this.plusUnit = plusUnit; iconId = key;
        }
    }

    public class Toast
    {
        public int uid;
        public ToastRequest req;
        public int amount;
        public float duration;      // 초
        public float remaining;     // 초
        public float arrivedAt;     // 처음 도착한 시각 — fifo 정렬, 같은 등급 안의 순서
        public float lastMergeAt;   // 마지막 병합 시각 — 병합 창 판정
        public int mergeCount;

        public float Remaining01 => duration > 0f ? Math.Max(0f, remaining / duration) : 0f;
    }

    [Serializable]
    public class QueueConfig
    {
        public int maxVisible = 3;
        public float displaySeconds = 3.5f;
        public float mergeWindowSeconds = 1.5f;     // 0 이면 병합하지 않는다
        public QueueMode mode = QueueMode.Priority;
        public bool rarityBonus = true;             // 희귀 ×1.3, 전설 ×1.6
        public float accessibilityScale = 1f;       // 접근성 옵션: 표시 시간 배율 (설정 메뉴에서 늘릴 수 있게)
    }

    public class NotificationQueue
    {
        public static readonly float[] RarityTimeScale = { 1f, 1f, 1.3f, 1.6f };

        public readonly List<Toast> active = new();
        public readonly List<Toast> pending = new();
        public int statShown, statMerged, statPreempted;

        public event Action<Toast> OnShow;
        public event Action<Toast> OnUpdate;
        public event Action<Toast, HideReason> OnHide;
        public event Action OnChanged;

        public QueueConfig config;
        float now;
        int nextUid = 1;
        bool needsSort;

        public NotificationQueue(QueueConfig config) { this.config = config; }

        public float DurationOf(Rarity r) =>
            config.displaySeconds * config.accessibilityScale * (config.rarityBonus ? RarityTimeScale[(int)r] : 1f);

        public void Enqueue(ToastRequest req)
        {
            if (config.mergeWindowSeconds > 0f)
            {
                // (1) 표시 중인 같은 키 — 병합 창 안이면 수량만 올리고 표시 시간을 다시 채운다
                var live = active.Find(t => t.req.key == req.key && now - t.lastMergeAt <= config.mergeWindowSeconds);
                if (live != null)
                {
                    live.amount += req.amount;
                    live.remaining = live.duration;
                    live.lastMergeAt = now;
                    live.mergeCount++;
                    statMerged++;
                    OnUpdate?.Invoke(live);
                    OnChanged?.Invoke();
                    return;
                }
                // (2) 대기 중인 같은 키 — 아직 안 보였으니 수량만 합친다 (+N 대기 수는 그대로)
                var waiting = pending.Find(t => t.req.key == req.key);
                if (waiting != null)
                {
                    waiting.amount += req.amount;
                    waiting.lastMergeAt = now;
                    waiting.mergeCount++;
                    statMerged++;
                    OnChanged?.Invoke();
                    return;
                }
            }
            // (3) 새 요청 — 대기열에 넣고 정렬은 Tick 에서 한 번만
            float d = DurationOf(req.rarity);
            pending.Add(new Toast { uid = nextUid++, req = req, amount = req.amount, duration = d, remaining = d, arrivedAt = now, lastMergeAt = now });
            needsSort = true;
            OnChanged?.Invoke();
        }

        /// <param name="dt">초. 일시정지 중 멈추려면 Time.deltaTime, 계속 흐르게 하려면 Time.unscaledDeltaTime</param>
        /// <param name="frozen">true 면 표시 시간이 줄지 않는다 (우선 배너 중 등)</param>
        public void Tick(float dt, bool frozen)
        {
            now += dt;
            if (!frozen)
            {
                for (int i = active.Count - 1; i >= 0; i--)
                {
                    var t = active[i];
                    t.remaining -= dt;
                    if (t.remaining <= 0f)
                    {
                        active.RemoveAt(i);
                        OnHide?.Invoke(t, HideReason.Expired);
                        OnChanged?.Invoke();
                    }
                }
            }
            if (needsSort)
            {
                SortPending();
                needsSort = false;
            }
            Pump();
        }

        // 빈 슬롯을 채우고, 선점 모드면 낮은 등급 카드를 밀어낸다
        void Pump()
        {
            while (pending.Count > 0)
            {
                if (active.Count < config.maxVisible) { ShowNext(); continue; }
                if (config.mode != QueueMode.PriorityPreempt || active.Count == 0) break;

                // 표시 중인 카드 중 등급이 가장 낮고, 그중 가장 오래된 것
                var victim = active[0];
                foreach (var t in active)
                    if (t.req.rarity < victim.req.rarity || (t.req.rarity == victim.req.rarity && t.arrivedAt < victim.arrivedAt)) victim = t;
                if (pending[0].req.rarity <= victim.req.rarity) break;

                active.Remove(victim);
                OnHide?.Invoke(victim, HideReason.Preempted);
                statPreempted++;
                ShowNext();
                // 밀려난 알림은 표시 시간을 다시 채워 대기열로 돌아간다 (같은 등급 안에서는 먼저 온 순서라 맨 앞)
                victim.remaining = victim.duration;
                pending.Add(victim);
                SortPending();
                OnChanged?.Invoke();
            }
        }

        void ShowNext()
        {
            var t = pending[0];
            pending.RemoveAt(0);
            t.remaining = t.duration;
            t.lastMergeAt = now;
            active.Add(t);
            statShown++;
            OnShow?.Invoke(t);
            OnChanged?.Invoke();
        }

        void SortPending()
        {
            if (config.mode == QueueMode.Fifo)
                pending.Sort((a, b) => a.arrivedAt != b.arrivedAt ? a.arrivedAt.CompareTo(b.arrivedAt) : a.uid.CompareTo(b.uid));
            else
                pending.Sort((a, b) =>
                    a.req.rarity != b.req.rarity ? ((int)b.req.rarity).CompareTo((int)a.req.rarity)
                    : a.arrivedAt != b.arrivedAt ? a.arrivedAt.CompareTo(b.arrivedAt)
                    : a.uid.CompareTo(b.uid));
        }

        public void Clear()
        {
            foreach (var t in active) OnHide?.Invoke(t, HideReason.Cleared);
            active.Clear();
            pending.Clear();
            statShown = statMerged = statPreempted = 0;
            OnChanged?.Invoke();
        }

        /// <summary>
        /// 설정 변경(슬롯 수 · 표시 시간 · 정렬 방식)을 바로 반영한다. 인스펙터 값을 바꿀 때 OnValidate 에서 불러도 된다.
        /// 표시 시간이 바뀌면 떠 있거나 기다리는 카드도 새 길이로 바꾸고, 남은 비율은 그대로 둔다.
        /// </summary>
        public void Reconfigure(QueueConfig newConfig)
        {
            config = newConfig;
            foreach (var t in active) Rescale(t);
            foreach (var t in pending) Rescale(t);
            needsSort = true;
            // 슬롯 수가 줄었으면 오래된 것부터 대기열로 돌려보낸다.
            // 규칙에 따른 선점이 아니라 설정 변경이므로 statPreempted 에는 세지 않는다 (나가는 연출만 선점과 같다)
            while (active.Count > config.maxVisible)
            {
                var t = active[0];
                active.RemoveAt(0);
                OnHide?.Invoke(t, HideReason.Preempted);
                t.remaining = t.duration;
                pending.Add(t);
            }
            OnChanged?.Invoke();
        }

        void Rescale(Toast t)
        {
            float d = DurationOf(t.req.rarity);
            if (Math.Abs(d - t.duration) < 0.0001f) return;
            t.remaining = t.duration > 0f ? t.remaining / t.duration * d : d;
            t.duration = d;   // 뷰는 매 프레임 Remaining01 을 읽으므로 따로 알릴 필요가 없다
        }
    }
}
