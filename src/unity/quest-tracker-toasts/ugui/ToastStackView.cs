using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 토스트 스택 — UGUI 뷰. NotificationQueue(순수 로직)를 만들고 OnShow / OnUpdate / OnHide 만 받아 그린다.
    /// 큐 타이머는 이 컴포넌트의 Update 에서 Tick 한다:
    ///   freezeOnPause = true  → Time.deltaTime          (Time.timeScale = 0 인 일시정지 중 멈춤)
    ///   freezeOnPause = false → Time.unscaledDeltaTime  (일시정지 메뉴 뒤에서도 흘러 알림을 놓친다)
    /// 우선 배너가 떠 있는 동안(Frozen)에도 표시 시간이 줄지 않는다.
    /// </summary>
    public class ToastStackView : MonoBehaviour
    {
        public enum Anchor { LeftUp, RightDown, BottomCenterUp }

        [Header("큐 규칙")]
        [SerializeField] QueueConfig config = new();
        [SerializeField, Tooltip("켜면 일시정지 중 알림 타이머가 멈춘다")] bool freezeOnPause = true;

        [Header("뷰")]
        [SerializeField] RectTransform stack;                 // VerticalLayoutGroup (Control Child Size Height 켬, Child Force Expand 끔)
        [SerializeField] VerticalLayoutGroup layout;
        [SerializeField] ToastCardView slotPrefab;
        [SerializeField] TextMeshProUGUI overflowLabel;       // "+N 대기"
        [SerializeField] Anchor anchor = Anchor.LeftUp;
        [SerializeField, Tooltip("일반 · 고급 · 희귀 · 전설")] Color[] rarityColors =
        {
            new(0.62f, 0.69f, 0.77f), new(0.25f, 0.84f, 0.75f), new(0.89f, 0.42f, 0.84f), new(1f, 0.71f, 0.28f),
        };
        [SerializeField] IconEntry[] icons;
        [SerializeField, Tooltip("미리 만들어 둘 슬롯 수 (최대 슬롯 + 나가는 중인 카드 여유분)")] int poolSize = 8;

        [System.Serializable] public struct IconEntry { public string id; public Sprite sprite; }

        public NotificationQueue Notifications { get; private set; }
        /// <summary>우선 배너가 떠 있는 동안 true (PriorityBanner 가 설정)</summary>
        public bool Frozen { get; set; }

        readonly Stack<ToastCardView> pool = new();
        readonly Dictionary<int, ToastCardView> views = new();
        readonly Dictionary<string, Sprite> iconMap = new();

        void Awake()
        {
            foreach (var e in icons) iconMap[e.id] = e.sprite;
            for (int i = 0; i < poolSize; i++)
            {
                var v = Instantiate(slotPrefab, stack);
                v.gameObject.SetActive(false);
                pool.Push(v);
            }
            ApplyAnchor();

            Notifications = new NotificationQueue(config);
            Notifications.OnShow += HandleShow;
            Notifications.OnUpdate += HandleUpdate;
            Notifications.OnHide += HandleHide;
            Notifications.OnChanged += RefreshOverflow;
            RefreshOverflow();
        }

        void OnDestroy()
        {
            if (Notifications == null) return;
            Notifications.OnShow -= HandleShow;
            Notifications.OnUpdate -= HandleUpdate;
            Notifications.OnHide -= HandleHide;
            Notifications.OnChanged -= RefreshOverflow;
        }

        public void Enqueue(ToastRequest req) => Notifications.Enqueue(req);

        void OnValidate()
        {
            // 플레이 중 인스펙터에서 표시 시간 · 슬롯 수를 바꾸면 이미 떠 있는 카드에도 바로 반영한다
            if (Application.isPlaying && Notifications != null) Notifications.Reconfigure(config);
        }

        void Update()
        {
            // 일시정지(Time.timeScale = 0)일 때 deltaTime 은 0 이 된다 → freezeOnPause 면 자연히 멈춘다
            float dt = freezeOnPause ? Time.deltaTime : Time.unscaledDeltaTime;
            Notifications.Tick(dt, Frozen);
            foreach (var t in Notifications.active)
                if (views.TryGetValue(t.uid, out var v)) v.SetTimer(t.Remaining01);
        }

        /// <summary>쌓이는 가장자리와 방향. 새 카드는 '다음 카드가 들어올 쪽'에 붙는다</summary>
        void ApplyAnchor()
        {
            layout.childAlignment = anchor switch
            {
                Anchor.RightDown => TextAnchor.UpperRight,
                Anchor.BottomCenterUp => TextAnchor.LowerCenter,
                _ => TextAnchor.LowerLeft,
            };
        }

        void HandleShow(Toast t)
        {
            var v = pool.Count > 0 ? pool.Pop() : Instantiate(slotPrefab, stack);
            v.gameObject.SetActive(true);
            // 위로 쌓기 = 새 카드가 맨 아래(마지막 형제), 아래로 쌓기 = 새 카드가 맨 위(첫 형제)
            if (anchor == Anchor.RightDown) v.transform.SetAsFirstSibling();
            else v.transform.SetAsLastSibling();
            iconMap.TryGetValue(t.req.iconId, out var sprite);
            v.Bind(t, rarityColors[(int)t.req.rarity], sprite);
            v.PlayEnter(anchor == Anchor.LeftUp ? -1f : anchor == Anchor.RightDown ? 1f : 0f);
            views[t.uid] = v;
        }

        void HandleUpdate(Toast t)
        {
            if (views.TryGetValue(t.uid, out var v)) v.Bump();
        }

        void HandleHide(Toast t, HideReason why)
        {
            if (!views.TryGetValue(t.uid, out var v)) return;
            views.Remove(t.uid);
            v.PlayExit(why == HideReason.Preempted, () =>
            {
                v.gameObject.SetActive(false);
                pool.Push(v);
            });
        }

        void RefreshOverflow()
        {
            int n = Notifications.pending.Count;
            overflowLabel.gameObject.SetActive(n > 0);
            if (n > 0) overflowLabel.text = $"+{n} 대기";
        }
    }
}
