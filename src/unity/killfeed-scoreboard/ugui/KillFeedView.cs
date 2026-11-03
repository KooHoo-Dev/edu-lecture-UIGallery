// 킬 피드 뷰 (UGUI). KillReceived → FeedQueue.Push. 큐가 알리는 대로 풀에서 줄을 꺼내고(RowShown) 돌려받는다(RowRemoved).
// LayoutGroup 없이 위치를 직접 보간하고, 투명도는 CanvasGroup.alpha. useQueueRules 를 끄면 웹 판 '효과 끄기' 와 같은 나쁜 예.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.KillfeedScoreboard
{
    public class KillFeedView : MonoBehaviour
    {
        [SerializeField] MatchEventSource source;
        [SerializeField] FeedRowView rowPrefab;
        [Tooltip("오른쪽 위 앵커 · 피벗 (1, 1). 줄 프리팹도 같은 앵커 · 피벗")]
        [SerializeField] RectTransform content;
        [SerializeField] FeedTheme theme = new();

        [Header("규칙")]
        [SerializeField, Range(3, 10)] int maxRows = 5;
        [SerializeField, Range(2f, 12f)] float displaySeconds = 5f;
        [SerializeField, Range(0f, 3f)] float mergeWindow = 1.5f;
        [SerializeField, Range(0f, 0.5f)] float paceSeconds = 0.22f;
        [SerializeField] float rowPitch = 58f;
        [SerializeField] bool useQueueRules = true;

        readonly FeedQueue queue = new();
        readonly Stack<FeedRowView> pool = new();
        readonly Dictionary<FeedRow, FeedRowView> views = new();

        public FeedQueue Queue => queue;

        void OnEnable()
        {
            Configure();
            queue.RowShown += OnShown;
            queue.RowMerged += OnMerged;
            queue.RowRemoved += OnRemoved;
            source.KillReceived += OnKill;
        }

        void OnDisable()
        {
            source.KillReceived -= OnKill;
            queue.Clear();   // 보이던 줄을 풀에 돌려준 뒤 끊는다
            queue.RowShown -= OnShown;
            queue.RowMerged -= OnMerged;
            queue.RowRemoved -= OnRemoved;
        }

        void OnValidate()
        {
            if (Application.isPlaying) Configure();   // 플레이 중 인스펙터에서 바꿔 보며 비교
        }

        void Configure()
        {
            queue.maxRows = useQueueRules ? maxRows : 99;
            queue.displaySeconds = displaySeconds;
            queue.mergeWindow = useQueueRules ? mergeWindow : 0f;
            queue.paceSeconds = useQueueRules ? paceSeconds : 0f;
            queue.mineLifeScale = useQueueRules ? 1.5f : 1f;
        }

        void OnKill(KillEvent e) => queue.Push(e, source.MeIndex);

        void OnShown(FeedRow r)
        {
            FeedRowView v = pool.Count > 0 ? pool.Pop() : Instantiate(rowPrefab, content);
            v.gameObject.SetActive(true);
            v.Bind(r, source.Match, source.MeIndex, theme);
            v.Place(-(queue.rows.Count - 1) * rowPitch, true);   // 새 줄은 맨 아래
            if (useQueueRules) v.Enter();
            v.Group.alpha = 1f;
            views[r] = v;
        }

        void OnMerged(FeedRow r)
        {
            if (!views.TryGetValue(r, out FeedRowView v)) return;
            v.Refresh(source.Match, source.MeIndex, theme);
            v.Punch();
        }

        void OnRemoved(FeedRow r)
        {
            if (!views.Remove(r, out FeedRowView v)) return;
            v.gameObject.SetActive(false);
            pool.Push(v);   // Destroy 하지 않는다 — 다음 줄이 다시 쓴다
        }

        void Update()
        {
            queue.Tick(Time.deltaTime);
            for (int i = 0; i < queue.rows.Count; i++)
            {
                if (!views.TryGetValue(queue.rows[i], out FeedRowView v)) continue;
                v.Place(-i * rowPitch, !useQueueRules);   // 위 줄이 빠지면 나머지가 올라온다
                v.Group.alpha = useQueueRules ? queue.Alpha(queue.rows[i]) : 1f;
            }
        }
    }
}
