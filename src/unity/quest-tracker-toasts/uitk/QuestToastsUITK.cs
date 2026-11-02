using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 퀘스트 트래커 + 토스트 큐 + 우선 배너 — UI Toolkit 뷰.
    /// 큐 규칙은 ugui 폴더의 NotificationQueue.cs(순수 C#)를 그대로 재사용한다. 이 파일은 '그리는 법'만 다르다.
    ///   OnShow   : Toast.uxml 템플릿에서 카드를 꺼내 toast--enter 상태로 넣고, 한 프레임 뒤 클래스를 떼어 USS transition 시작
    ///   OnUpdate : 수량 텍스트 교체 + toast__count--bump 를 붙였다가 80ms 뒤 뗀다
    ///   OnHide   : toast--exit(선점이면 toast--kicked 도)를 붙이고 200ms 뒤 계층에서 제거
    /// 트래커: AddProgress(feed) 는 그 feed 를 쓰는 모든 임무의 행을 올린다. 임무가 끝나면 QuestCompleted 를 내고
    ///         '완료' 태그를 보여 준 뒤 1.25초 뒤 높이를 접고, 주 임무면 사슬의 다음 임무가 목록 맨 위로 들어온다.
    /// 표시 시간 · 완료 유지 시간 계산은 Update(게임 시간)에만 맡긴다 (schedule.Execute 지연은 Time.timeScale 을 따르지 않으므로 연출에만 쓴다).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class QuestToastsUITK : MonoBehaviour
    {
        public enum Anchor { LeftUp, RightDown, BottomCenterUp }

        [Serializable] public class ObjectiveDef { public string id; public string feed; public string text; public int cur; public int max = 1; }

        [Serializable]
        public class QuestDef
        {
            public string id;
            public string title;
            public bool isMain = true;
            public string rewardText;   // 배너 아랫줄
            public int rewardCredit;
            public ObjectiveDef[] objectives;
        }

        [Header("토스트")]
        [SerializeField] VisualTreeAsset toastTemplate;     // Toast.uxml
        [SerializeField] QueueConfig config = new();
        [SerializeField, Tooltip("켜면 일시정지(Time.timeScale = 0) 중 알림 타이머가 멈춘다")] bool freezeOnPause = true;
        [SerializeField] Anchor anchor = Anchor.LeftUp;
        [SerializeField] Texture2D[] iconTextures;          // circuit, cell, oxygen, credit, repair, lens, core 순서
        [SerializeField] float bannerSeconds = 2.5f;

        [Header("트래커 (기본값 = 갤러리와 같은 임무)")]
        [SerializeField, Tooltip("주 임무 사슬 — 하나를 끝내면 다음 것을 자동 추적")]
        QuestDef[] mainChain =
        {
            Def("tower", "북쪽 통신탑 복구", true, "크레딧 +350 · 수리 키트 ×2", 350,
                Obj("drone", "kill", "잔해 드론 처치", 3, 5), Obj("cell", "cell", "냉각 셀 3개 회수", 1, 3), Obj("power", "", "통신탑 전원 연결", 0, 1)),
            Def("signal", "세라의 신호 추적", true, "크레딧 +280 · 정밀 렌즈 ×1", 280,
                Obj("drone", "kill", "신호를 막는 드론 처치", 0, 4), Obj("relay", "", "신호 중계기 조사", 0, 3)),
            Def("base", "남쪽 정비 기지 재가동", true, "크레딧 +420 · 산소 캔 ×3", 420,
                Obj("drone", "kill", "기지 주변 드론 소탕", 0, 6), Obj("cell", "cell", "냉각 셀 교체", 0, 2)),
        };
        [SerializeField] QuestDef repeatQuest =
            Def("supply", "정비 기지 보급", false, "", 0, Obj("circuit", "circuit", "회로 조각 수집", 4, 10), Obj("oxygen", "oxygen", "산소 캔 확보", 2, 4));
        [SerializeField] float completeHoldSeconds = 1.25f;
        [SerializeField] float collapseSeconds = 0.25f;

        static readonly string[] IconIds = { "circuit", "cell", "oxygen", "credit", "repair", "lens", "core" };
        static readonly string[] Numerals = { "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ" };

        public NotificationQueue Notifications { get; private set; }
        /// <summary>임무의 모든 목표가 찼을 때 (데모 · 게임이 우선 배너와 보상 토스트로 보낸다)</summary>
        public event Action<QuestDef> QuestCompleted;

        VisualElement root, dock, stack, questList, banner, pause;
        Label overflow, bannerTitle, bannerSub, bannerEyebrow, pauseNote;
        readonly Dictionary<int, VisualElement> cards = new();
        readonly Queue<(string eyebrow, string title, string sub)> bannerQueue = new();
        float bannerLeft;   // 남은 배너 시간(게임 시간)

        // 트래커 상태 — 행은 '임무 + 목표' 쌍으로 들고 있어서 두 임무가 같은 feed 를 써도 서로 덮어쓰지 않는다
        class RowState
        {
            public ObjectiveDef def;
            public int cur;
            public Label value;
            public VisualElement row, fill;
            public bool Done => cur >= def.max;
        }
        class QuestState
        {
            public QuestDef def;
            public VisualElement root;
            public readonly List<RowState> rows = new();
            public bool completed;
            public float holdLeft = -1f;       // 완료 상태를 보여 주는 남은 시간
            public float collapseLeft = -1f;   // 접는 중 남은 시간
        }
        readonly List<QuestState> quests = new();
        readonly List<QuestState> finished = new();
        int mainIndex;

        void OnEnable()
        {
            root = GetComponent<UIDocument>().rootVisualElement;
            dock = root.Q("toast-dock");
            stack = root.Q("toast-stack");
            overflow = root.Q<Label>("toast-overflow");
            questList = root.Q("quest-list");
            banner = root.Q("priority-banner");
            bannerEyebrow = root.Q<Label>("banner-eyebrow");
            bannerTitle = root.Q<Label>("banner-title");
            bannerSub = root.Q<Label>("banner-sub");
            pause = root.Q("pause");
            pauseNote = root.Q<Label>("pause-note");

            dock.RemoveFromClassList("toast-dock--left-up");
            dock.AddToClassList(anchor switch
            {
                Anchor.RightDown => "toast-dock--right-down",
                Anchor.BottomCenterUp => "toast-dock--bottom-center-up",
                _ => "toast-dock--left-up",
            });

            Notifications = new NotificationQueue(config);
            Notifications.OnShow += HandleShow;
            Notifications.OnUpdate += HandleUpdate;
            Notifications.OnHide += HandleHide;
            Notifications.OnChanged += RefreshOverflow;

            questList.Clear();
            quests.Clear();
            mainIndex = 0;
            if (mainChain.Length > 0) Spawn(mainChain[0], first: true, animate: false, resetProgress: false);
            if (repeatQuest != null && !string.IsNullOrEmpty(repeatQuest.id)) Spawn(repeatQuest, first: false, animate: false, resetProgress: false);
        }

        void OnDisable()
        {
            if (Notifications == null) return;
            Notifications.OnShow -= HandleShow;
            Notifications.OnUpdate -= HandleUpdate;
            Notifications.OnHide -= HandleHide;
            Notifications.OnChanged -= RefreshOverflow;
        }

        void OnValidate()
        {
            // 플레이 중 인스펙터에서 표시 시간 · 슬롯 수를 바꾸면 이미 떠 있는 카드에도 바로 반영한다
            if (Application.isPlaying && Notifications != null) Notifications.Reconfigure(config);
        }

        public void Enqueue(ToastRequest req) => Notifications.Enqueue(req);

        void Update()
        {
            bool paused = Time.timeScale == 0f;
            pause.EnableInClassList("pause--hidden", !paused);
            pauseNote.text = freezeOnPause ? "알림 타이머 멈춤 — 메뉴를 보는 동안 알림을 놓치지 않는다" : "알림 타이머 계속 흐름 — 돌아오면 이미 사라져 있다";

            // 배너 채널 (게임 시간)
            if (bannerLeft > 0f)
            {
                bannerLeft -= Time.deltaTime;
                if (bannerLeft <= 0f) banner.AddToClassList("banner--hidden");
            }
            else if (bannerQueue.Count > 0) ShowNextBanner();

            float dt = freezeOnPause ? Time.deltaTime : Time.unscaledDeltaTime;
            Notifications.Tick(dt, frozen: bannerLeft > 0f);

            foreach (var t in Notifications.active)
                if (cards.TryGetValue(t.uid, out var c))
                    c.Q("timer-fill").style.width = Length.Percent(t.Remaining01 * 100f);

            UpdateTracker(Time.deltaTime);   // 게임 세계 시간 — 일시정지 중 멈춘다
        }

        /* ───────── 토스트 ───────── */

        void HandleShow(Toast t)
        {
            var card = toastTemplate.Instantiate().Q("toast");   // TemplateContainer 래퍼가 아니라 실제 카드
            int r = (int)t.req.rarity;
            card.AddToClassList($"toast--r{r}");
            card.Q<Label>("numeral").text = Numerals[r];
            card.Q<Label>("message").text = t.req.label;
            int iconIndex = Array.IndexOf(IconIds, t.req.iconId);
            if (iconIndex >= 0 && iconIndex < iconTextures.Length)
                card.Q("icon").style.backgroundImage = new StyleBackground(iconTextures[iconIndex]);
            SetCount(card, t);
            stack.Add(card);
            cards[t.uid] = card;
            // 같은 프레임에 클래스를 떼면 시작 스타일이 계산되기 전이라 transition 없이 튄다 → 한 프레임 미룬다
            card.schedule.Execute(() => card.RemoveFromClassList("toast--enter")).StartingIn(16);
        }

        void HandleUpdate(Toast t)
        {
            if (!cards.TryGetValue(t.uid, out var card)) return;
            SetCount(card, t);
            var count = card.Q<Label>("count");
            count.AddToClassList("toast__count--bump");
            count.schedule.Execute(() => count.RemoveFromClassList("toast__count--bump")).StartingIn(80);
        }

        void HandleHide(Toast t, HideReason why)
        {
            if (!cards.TryGetValue(t.uid, out var card)) return;
            cards.Remove(t.uid);
            card.AddToClassList("toast--exit");
            if (why == HideReason.Preempted) card.AddToClassList("toast--kicked");   // 밀려난 카드는 들어온 쪽으로 빠진다
            // TransitionEndEvent 는 속성마다 따로 와서 중복 제거가 나기 쉽다 → 시간으로 한 번만 제거
            card.schedule.Execute(() => card.RemoveFromHierarchy()).StartingIn(200);
        }

        static void SetCount(VisualElement card, Toast t)
        {
            var count = card.Q<Label>("count");
            bool show = t.req.plusUnit || t.amount > 1;
            count.EnableInClassList("toast__count--hidden", !show);
            count.text = t.req.plusUnit ? $"+{t.amount}" : $"×{t.amount}";
        }

        void RefreshOverflow()
        {
            int n = Notifications.pending.Count;
            overflow.EnableInClassList("toast-overflow--hidden", n == 0);
            overflow.text = $"+{n} 대기";
        }

        /* ───────── 우선 배너 ───────── */

        public void ShowBanner(string eyebrow, string title, string sub) => bannerQueue.Enqueue((eyebrow, title, sub));

        void ShowNextBanner()
        {
            var b = bannerQueue.Dequeue();
            bannerEyebrow.text = b.eyebrow;
            bannerTitle.text = b.title;
            bannerSub.text = b.sub;
            banner.RemoveFromClassList("banner--hidden");
            bannerLeft = bannerSeconds;
        }

        /* ───────── 트래커 ───────── */

        void Spawn(QuestDef def, bool first, bool animate, bool resetProgress)
        {
            var q = new QuestState { def = def, root = new VisualElement { pickingMode = PickingMode.Ignore } };
            q.root.AddToClassList("quest");
            q.root.Add(MakeLabel(def.isMain ? "주 임무" : "반복 과제", "quest__kind"));
            var titleRow = new VisualElement { pickingMode = PickingMode.Ignore };
            titleRow.AddToClassList("quest__title-row");
            titleRow.Add(MakeLabel(def.title, "quest__title"));
            titleRow.Add(MakeLabel("완료", "quest__done-tag"));   // .quest--done 일 때만 보인다
            q.root.Add(titleRow);

            foreach (var o in def.objectives)
            {
                var rs = new RowState { def = o, cur = resetProgress ? 0 : o.cur, row = new VisualElement { pickingMode = PickingMode.Ignore } };
                rs.row.AddToClassList("objective");
                var check = new VisualElement { pickingMode = PickingMode.Ignore };
                check.AddToClassList("objective__check");
                rs.row.Add(check);
                rs.row.Add(MakeLabel(o.text, "objective__label"));
                rs.value = MakeLabel("", "objective__value");
                rs.row.Add(rs.value);
                rs.fill = new VisualElement { pickingMode = PickingMode.Ignore };
                rs.fill.AddToClassList("objective__fill");
                if (o.max > 1)
                {
                    var bar = new VisualElement { pickingMode = PickingMode.Ignore };
                    bar.AddToClassList("objective__bar");
                    bar.Add(rs.fill);
                    rs.row.Add(bar);
                }
                q.root.Add(rs.row);
                q.rows.Add(rs);
                Paint(rs, false);
            }

            if (first)
            {
                questList.Insert(0, q.root);
                quests.Insert(0, q);
            }
            else
            {
                questList.Add(q.root);
                quests.Add(q);
            }
            if (animate)
            {
                q.root.AddToClassList("quest--enter");
                q.root.schedule.Execute(() => q.root.RemoveFromClassList("quest--enter")).StartingIn(16);
            }
        }

        static Label MakeLabel(string text, string cls)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            return l;
        }

        /// <summary>예: AddProgress("kill") — 이 feed 를 쓰는 모든 임무의 행을 올리고, 바뀐 행만 강조한다</summary>
        public void AddProgress(string feed, int amount = 1)
        {
            if (string.IsNullOrEmpty(feed)) return;
            foreach (var q in quests)
            {
                if (q.completed) continue;
                bool hit = false;
                foreach (var r in q.rows)
                {
                    if (r.def.feed != feed || r.Done) continue;
                    r.cur = Mathf.Min(r.def.max, r.cur + amount);
                    Paint(r, true);
                    hit = true;
                }
                if (hit && q.rows.TrueForAll(r => r.Done)) Complete(q);
            }
        }

        /// <summary>현재 주 임무를 즉시 완료 (이벤트 · 치트용)</summary>
        public void CompleteCurrentMain()
        {
            foreach (var q in quests)
                if (q.def.isMain && !q.completed) { Complete(q); return; }
        }

        void Complete(QuestState q)
        {
            q.completed = true;
            foreach (var r in q.rows)
            {
                if (r.Done) continue;
                r.cur = r.def.max;
                Paint(r, true);
            }
            q.root.AddToClassList("quest--done");
            q.holdLeft = completeHoldSeconds;
            QuestCompleted?.Invoke(q.def);
        }

        void UpdateTracker(float dt)
        {
            finished.Clear();
            foreach (var q in quests)
            {
                if (q.holdLeft > 0f)
                {
                    q.holdLeft -= dt;
                    if (q.holdLeft <= 0f) StartCollapse(q);
                }
                else if (q.collapseLeft > 0f)
                {
                    q.collapseLeft -= dt;
                    if (q.collapseLeft <= 0f) finished.Add(q);
                }
            }
            // 목록을 도는 중에 넣고 빼지 않도록 끝난 것은 모아서 처리한다
            foreach (var q in finished)
            {
                quests.Remove(q);
                q.root.RemoveFromHierarchy();
                if (q.def.isMain && mainChain.Length > 0)
                {
                    mainIndex = (mainIndex + 1) % mainChain.Length;
                    Spawn(mainChain[mainIndex], first: true, animate: true, resetProgress: false);
                }
                else if (!q.def.isMain) Spawn(q.def, first: false, animate: true, resetProgress: true);
            }
        }

        void StartCollapse(QuestState q)
        {
            // height: auto 는 transition 되지 않는다 → 지금 높이를 px 로 고정하고, 한 프레임 뒤 0 으로 바꿔 USS transition 을 태운다
            q.root.style.height = q.root.resolvedStyle.height;
            q.root.AddToClassList("quest--collapsing");
            q.root.schedule.Execute(() => q.root.style.height = 0f).StartingIn(16);
            q.collapseLeft = collapseSeconds;
        }

        void Paint(RowState r, bool flash)
        {
            int max = r.def.max;
            r.value.text = max > 1 ? $"{r.cur}/{max}" : (r.Done ? "완료" : "");
            r.fill.style.width = Length.Percent(100f * r.cur / Mathf.Max(1, max));   // .objective__fill 의 transition 이 0.4초에 채운다
            r.row.EnableInClassList("objective--done", r.Done);
            if (!flash) return;
            r.row.AddToClassList("objective--flash");
            r.row.schedule.Execute(() => r.row.RemoveFromClassList("objective--flash")).StartingIn(120);
        }

        static ObjectiveDef Obj(string id, string feed, string text, int cur, int max) =>
            new() { id = id, feed = feed, text = text, cur = cur, max = max };

        static QuestDef Def(string id, string title, bool isMain, string rewardText, int rewardCredit, params ObjectiveDef[] objectives) =>
            new() { id = id, title = title, isMain = isMain, rewardText = rewardText, rewardCredit = rewardCredit, objectives = objectives };
    }
}
