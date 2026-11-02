// 타임라인 뷰 — 전투 큐의 Preview() 를 받아 초상을 LayoutGroup 없이 직접 배치하고, 순서가 바뀌면 같은 초상을 새 자리로 보간한다.
// key → PortraitView 사전으로 같은 차례를 같은 오브젝트로 유지하고, 사라진 칸은 풀에 돌려준다.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.TurnOrderTimeline
{
    public enum SpacingMode { Slots, Time }
    public enum BarSide { Left, Top }

    public class TimelineView : MonoBehaviour
    {
        [Header("조절 값")]
        [Tooltip("지금 차례 뒤로 미리 보일 차례 수")]
        [SerializeField] int previewCount = 8;
        [Tooltip("초상 옆에 행동값 숫자를 보인다")]
        [SerializeField] bool showActionValue = true;
        [Tooltip("순서가 바뀔 때 새 자리로 미끄러지는 시간(초). 0 이면 순간이동")]
        [SerializeField] float slideSeconds = 0.35f;
        [Tooltip("Slots = 같은 간격 · Time = 행동값 비례 (최소 간격 + 비례 나머지)")]
        [SerializeField] SpacingMode spacingMode = SpacingMode.Slots;
        [SerializeField] BarSide barSide = BarSide.Left;

        [Header("배치 (Timeline 왼쪽 위 기준, 아래로 −y) — 초상 프리팹의 피벗 · 앵커는 왼쪽 위")]
        [SerializeField] Vector2 activePosLeft = new(20f, -16f);
        [SerializeField] Vector2 activePosTop = new(20f, -14f);
        [Tooltip("지금 차례 뒤 첫 칸까지의 거리")]
        [SerializeField] float startLeft = 172f;
        [SerializeField] float startTop = 226f;
        [SerializeField] float pitchLeft = 84f;
        [SerializeField] float pitchTop = 150f;
        [SerializeField] float minGapLeft = 70f;
        [SerializeField] float minGapTop = 112f;
        [Tooltip("행동값 비례일 때 첫 칸부터 마지막 칸까지 쓸 길이")]
        [SerializeField] float spanLeft = 760f;
        [SerializeField] float spanTop = 1500f;
        [SerializeField] float activeScale = 1.35f;
        [Tooltip("들어오고 나가는 칸이 움직이는 거리")]
        [SerializeField] float enterOffset = 90f;

        [Header("참조")]
        [SerializeField] PortraitView portraitPrefab;
        [Tooltip("행동값 비례일 때만 켜는 축 Image")]
        [SerializeField] GameObject axis;

        public int PreviewCount => previewCount;

        TurnQueue queue;
        RectTransform rect;
        readonly Dictionary<string, PortraitView> views = new();
        readonly List<PortraitView> leaving = new();
        readonly Stack<PortraitView> pool = new();
        readonly List<TurnEntry> entries = new();
        readonly HashSet<string> seen = new();
        readonly List<string> gone = new();
        string lastActiveKey = "";

        void Awake() => rect = (RectTransform)transform;

        public void Bind(TurnQueue q)
        {
            if (queue != null) queue.Changed -= Rebuild;
            queue = q;
            queue.Changed += Rebuild;
            Rebuild(true);
        }

        void OnDestroy()
        {
            if (queue != null) queue.Changed -= Rebuild;
        }

        // 플레이 중에 인스펙터 값을 바꾸면 바로 다시 배치 (이것도 미끄러진다)
        void OnValidate()
        {
            if (Application.isPlaying && queue != null && rect != null) Rebuild(false);
        }

        void Rebuild() => Rebuild(false);

        void Rebuild(bool snap)
        {
            queue.Preview(previewCount, entries);
            if (axis != null) axis.SetActive(spacingMode == SpacingMode.Time);
            bool left = barSide == BarSide.Left;
            float lastAv = Mathf.Max(1f, entries[entries.Count - 1].actionValue);
            seen.Clear();
            for (int i = 0; i < entries.Count; i++)
            {
                TurnEntry e = entries[i];
                seen.Add(e.key);
                Vector2 pos = SlotPosition(i, e.actionValue, entries.Count - 1, lastAv);
                float scale = i == 0 ? activeScale : 1f;
                if (views.TryGetValue(e.key, out PortraitView v))
                {
                    v.Bind(e, queue.Units[e.unit], i == 0, showActionValue);
                    // 같은 차례 = 같은 오브젝트 → 지금 자리에서 새 자리로 보간 (순서가 바뀐 것이 눈으로 따라가진다)
                    if (v.Target != pos || !Mathf.Approximately(v.TargetScale, scale)) v.MoveTo(pos, scale, 1f, slideSeconds, snap);
                }
                else
                {
                    v = pool.Count > 0 ? pool.Pop() : Instantiate(portraitPrefab, rect);
                    v.gameObject.SetActive(true);
                    v.HideBadge();
                    v.Bind(e, queue.Units[e.unit], i == 0, showActionValue);
                    // 새 차례는 줄 끝 바깥에서, 끼어들기는 줄 옆에서 들어온다
                    Vector2 off = e.kind == EntryKind.Extra ? (left ? new Vector2(-enterOffset, 0f) : new Vector2(0f, enterOffset)) : (left ? new Vector2(0f, -enterOffset) : new Vector2(enterOffset, 0f));
                    v.Enter(pos, scale, off, snap ? 0f : slideSeconds);
                    views.Add(e.key, v);
                }
                v.transform.SetAsLastSibling();   // 그리는 순서만 — 위치는 anchoredPosition 이 정한다
            }
            gone.Clear();
            foreach (KeyValuePair<string, PortraitView> kv in views)
                if (!seen.Contains(kv.Key)) gone.Add(kv.Key);
            foreach (string key in gone)
            {
                PortraitView v = views[key];
                views.Remove(key);
                // 끝난 차례(맨 앞)는 앞쪽 밖으로, 밀려난 차례는 줄 끝 밖으로
                bool done = key == lastActiveKey;
                Vector2 off = left ? new Vector2(0f, done ? enterOffset : -enterOffset) : new Vector2(done ? -enterOffset : enterOffset, 0f);
                v.Leave(off, slideSeconds);
                leaving.Add(v);
            }
            lastActiveKey = entries[0].key;
        }

        /// <summary>칸 i 의 자리. Slots = i × 간격, Time = i × 최소 간격 + 행동값 × k (마지막 칸이 끝에 닿게)</summary>
        public Vector2 SlotPosition(int i, float actionValue, int n, float lastAv)
        {
            bool left = barSide == BarSide.Left;
            if (i == 0) return left ? activePosLeft : activePosTop;
            int j = i - 1;
            float along;
            if (spacingMode == SpacingMode.Time)
            {
                float min = left ? minGapLeft : minGapTop;
                float span = left ? spanLeft : spanTop;
                float k = Mathf.Max(0f, span - (n - 1) * min) / lastAv;
                along = j * min + actionValue * k;   // 겹치지 않으면서 '얼마나 기다리는지' 가 거리로 보인다
            }
            else along = j * (left ? pitchLeft : pitchTop);
            return left ? new Vector2(activePosLeft.x, -(startLeft + along)) : new Vector2(startTop + along, activePosTop.y - 12f);
        }

        /// <summary>바뀐 칸 알림 — 전투 쪽(데모)이 이벤트 전후 미리보기를 비교해 부른다</summary>
        public void Flag(string key, string text, Color color, float seconds = 2.2f)
        {
            if (views.TryGetValue(key, out PortraitView v)) v.Flag(text, color, seconds);
        }

        void Update()
        {
            float dt = Time.deltaTime;   // 배속(timeScale)을 따른다
            foreach (PortraitView v in views.Values) v.Tick(dt);
            for (int i = leaving.Count - 1; i >= 0; i--)
            {
                if (leaving[i].Tick(dt)) continue;
                leaving[i].gameObject.SetActive(false);
                pool.Push(leaving[i]);   // Destroy 대신 풀 — 다음에 들어오는 차례가 다시 쓴다
                leaving.RemoveAt(i);
            }
        }
    }
}
