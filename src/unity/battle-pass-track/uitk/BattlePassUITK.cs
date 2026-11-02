// UI Toolkit 판 — 같은 PassModel · ServerClock(UGUI 폴더)으로 가로 트랙을 만든다. 트랙 · 경험치 · 받기 · 카운트다운까지.
// 받은 결과는 한 줄 요약(#toast)이라 입력 잠금이 필요 없다. 결과를 모달 창으로 바꾸면 UGUI 판 ClaimResultPopup 같은 입력 잠금이 반드시 필요하다.
// Unity 6.3 의 ListView 는 BaseVerticalCollectionView 를 잇는 세로 전용이다(horizontalScrollingEnabled 는 넓은 항목을 옆으로 굴릴 뿐).
// 그래서 ScrollView(mode Horizontal) 안에 칸을 직접 재활용한다 — UGUI 판 PassTrack 과 같은 두 단계:
//   ① scrollOffset.x 로 보이는 레벨 범위 ② 범위 밖 칸을 반납해 새 레벨에 다시 배정 (모자랄 때만 템플릿 복제)
// 칸은 position absolute + style.translate 로 x 만 옮긴다(left 를 바꾸면 레이아웃을 다시 계산한다).
// 칸 클릭 콜백은 만들 때 한 번, 지금 레벨은 userData 로 읽는다.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.BattlePassTrack
{
    [RequireComponent(typeof(UIDocument))]
    public class BattlePassUITK : MonoBehaviour
    {
        class Col
        {
            public TemplateContainer root;
            public Button free, prem;
            public int index = -1;
        }

        [SerializeField] VisualTreeAsset columnTemplate;
        [Range(30, 100)] [SerializeField] int levelCount = 50;
        [Range(1, 3)] [SerializeField] int freeEvery = 2;
        [SerializeField] bool premiumOwned;
        [SerializeField] float itemWidth = 180f;
        [SerializeField] ClockSource clockSource = ClockSource.Server;
        [SerializeField] float serverDelayMs = 350f;
        [Tooltip("받을 수 있음 맥동 (Hz) — 2Hz 이하")]
        [Range(0.2f, 2f)] [SerializeField] float pulseHz = 0.8f;
        [Tooltip("TierState 순서 (None, Locked, NeedsPremium, Claimable, Claiming, Claimed)")]
        [SerializeField] Sprite[] stateIcons = new Sprite[6];
        [Tooltip("RewardKind 순서")]
        [SerializeField] Sprite[] rewardIcons = new Sprite[8];
        [SerializeField] string serverNowUtc = "2026-11-02T05:47:27Z";
        [SerializeField] string seasonEndUtc = "2026-11-08T10:00:00Z";

        static readonly string[] StateClass = { "slot--none", "slot--locked", "slot--need-prem", "slot--claimable", "slot--claiming", "slot--claimed" };
        static readonly string[] Labels = { "", "잠김", "패스 필요", "받기", "받는 중", "받음" };

        PassModel model;
        readonly ServerClock clock = new();
        DateTime seasonEnd;
        ScrollView track;
        Label countdown, cdLabel, levelLabel, debug, toast;
        Button claimAll, toNow, gainXp;
        readonly Dictionary<int, Col> byIndex = new();
        readonly Stack<Col> free = new();
        readonly List<int> leaving = new();
        readonly List<TierRef> scratch = new();
        readonly List<IVisualElementScheduledItem> requests = new();
        IVisualElementScheduledItem ticker, pulser;
        int first, last = -1, created, reused;
        bool pulseOn;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            track = root.Q<ScrollView>("track");
            toast = root.Q<Label>("toast");
            countdown = root.Q<Label>("countdown");
            cdLabel = root.Q<Label>("cd-label");
            gainXp = root.Q<Button>("gain-xp");
            levelLabel = root.Q<Label>("level");
            debug = root.Q<Label>("debug");
            claimAll = root.Q<Button>("claim-all");
            toNow = root.Q<Button>("to-now");

            model = new PassModel(levelCount, freeEvery, premiumOwned);
            model.Restore(23, 640, 17);
            model.Changed += OnModelChanged;
            if (ServerClock.TryParseUtc(serverNowUtc, out DateTime now)) clock.Sync(now, Time.realtimeSinceStartupAsDouble);
            if (!ServerClock.TryParseUtc(seasonEndUtc, out seasonEnd)) seasonEnd = DateTime.MaxValue;
            cdLabel.text = clockSource == ClockSource.Server ? "시즌 종료까지 (서버 시각 기준)" : "시즌 종료까지 (⚠ 기기 시계 기준)";

            track.mode = ScrollViewMode.Horizontal;
            track.contentContainer.style.width = model.LevelCount * itemWidth;
            track.contentContainer.style.height = Length.Percent(100);
            track.horizontalScroller.valueChanged += OnScrolled;
            track.RegisterCallback<GeometryChangedEvent>(OnFirstLayout);   // 첫 레이아웃이 끝나야 보이는 너비를 안다 — 그때 스냅
            claimAll.clicked += ClaimAll;
            toNow.clicked += SnapToNow;
            gainXp.clicked += GainXp;
            ticker = root.schedule.Execute(Tick).Every(250);
            pulser = root.schedule.Execute(Pulse).Every((long)(500f / pulseHz));   // 반 주기마다 켜고 끈다 → 0.8Hz
            OnModelChanged();
        }

        void OnDisable()
        {
            // 등록한 것은 모두 풀고 멈춘다 — 다시 켤 때 OnEnable 이 같은 버튼에 콜백을 또 달기 때문
            claimAll.clicked -= ClaimAll;
            toNow.clicked -= SnapToNow;
            gainXp.clicked -= GainXp;
            ticker?.Pause();
            pulser?.Pause();
            foreach (IVisualElementScheduledItem r in requests) r.Pause();   // 확인 대기 요청 (다시 켜면 서버 상태로 새로 만든다)
            requests.Clear();
            model.Changed -= OnModelChanged;
            track.horizontalScroller.valueChanged -= OnScrolled;
            track.UnregisterCallback<GeometryChangedEvent>(OnFirstLayout);
            track.contentContainer.Clear();
            byIndex.Clear();
            free.Clear();
            last = -1;
        }

        void OnFirstLayout(GeometryChangedEvent e)
        {
            track.UnregisterCallback<GeometryChangedEvent>(OnFirstLayout);
            SnapToNow();
        }

        void OnScrolled(float _) => Refresh(false);

        /// <summary>지금 레벨을 화면 60% 지점에 (트랙은 늘 지금 레벨로 연다)</summary>
        void SnapToNow()
        {
            float view = track.contentViewport.layout.width;
            if (float.IsNaN(view) || view <= 0f) return;
            float max = Mathf.Max(0f, model.LevelCount * itemWidth - view);
            track.scrollOffset = new Vector2(Mathf.Clamp((model.Level - 1) * itemWidth + itemWidth * 0.5f - view * 0.6f, 0f, max), 0f);
            Refresh(true);
        }

        void Refresh(bool rebind)
        {
            float view = track.contentViewport.layout.width;
            if (float.IsNaN(view) || view <= 0f) return;
            float x = track.scrollOffset.x;
            int f = Mathf.Max(0, Mathf.FloorToInt(x / itemWidth) - 1);
            int l = Mathf.Min(model.LevelCount - 1, Mathf.CeilToInt((x + view) / itemWidth));
            if (!rebind && f == first && l == last) return;
            first = f;
            last = l;
            leaving.Clear();
            foreach (KeyValuePair<int, Col> kv in byIndex)
                if (kv.Key < f || kv.Key > l) leaving.Add(kv.Key);
            foreach (int i in leaving)
            {
                Col c = byIndex[i];
                byIndex.Remove(i);
                c.index = -1;
                c.root.style.display = DisplayStyle.None;
                free.Push(c);
            }
            for (int i = f; i <= l; i++)
            {
                if (byIndex.TryGetValue(i, out Col c))
                {
                    if (rebind) Bind(c);
                    continue;
                }
                if (free.Count > 0)
                {
                    c = free.Pop();
                    reused++;
                }
                else c = MakeCol();
                c.index = i;
                c.root.style.display = DisplayStyle.Flex;
                c.root.style.translate = new Translate(i * itemWidth, 0);   // 위치만 옮긴다
                byIndex[i] = c;
                Bind(c);
            }
            debug.text = $"{model.LevelCount}칸 중 만든 칸 {created} · 재사용 {reused}";
        }

        Col MakeCol()
        {
            created++;
            var c = new Col { root = columnTemplate.Instantiate() };
            c.root.style.position = Position.Absolute;
            c.root.style.width = itemWidth;
            c.root.style.height = Length.Percent(100);
            c.free = c.root.Q<Button>("free");
            c.prem = c.root.Q<Button>("prem");
            c.free.userData = c;
            c.prem.userData = c;
            // 한 번만 등록 — 지금 레벨은 누를 때 userData(칸)에서 읽는다
            c.free.clicked += () => Claim(new TierRef(((Col)c.free.userData).index + 1, PassTrackRow.Free));
            c.prem.clicked += () => Claim(new TierRef(((Col)c.prem.userData).index + 1, PassTrackRow.Premium));
            track.contentContainer.Add(c.root);
            return c;
        }

        void Bind(Col c)
        {
            int level = c.index + 1;
            c.root.Q<Label>("lvl").text = level.ToString();
            c.root.EnableInClassList("col--reached", level <= model.Level);
            c.root.EnableInClassList("col--cur", level == model.Level);
            BindSlot(c.free, level, PassTrackRow.Free);
            BindSlot(c.prem, level, PassTrackRow.Premium);
        }

        void BindSlot(Button b, int level, PassTrackRow row)
        {
            Reward? r = model.RewardFor(level, row);
            int st = (int)model.GetState(level, row);
            for (int i = 0; i < StateClass.Length; i++) b.EnableInClassList(StateClass[i], i == st);   // 켜기 · 끄기를 한 번에
            if (st != (int)TierState.Claimable) b.RemoveFromClassList("slot--pulse");   // 재활용된 칸에 맥동이 남지 않게
            b.Q(className: "slot__icon").style.backgroundImage = r.HasValue ? new StyleBackground(rewardIcons[(int)r.Value.kind]) : new StyleBackground(StyleKeyword.None);
            b.Q<Label>(className: "slot__name").text = r.HasValue ? r.Value.name : row == PassTrackRow.Free ? "빈칸" : "";
            b.Q<Label>(className: "slot__count").text = r.HasValue && r.Value.count > 1 ? $"×{r.Value.count:N0}" : "";
            b.Q(className: "slot__badge").style.backgroundImage = new StyleBackground(stateIcons[st]);
            b.Q<Label>(className: "slot__text").text = Labels[st];
        }

        /// <summary>시험용: 경험치 +700 — 레벨을 넘으면 그 칸이 Locked → Claimable 로 바뀐다</summary>
        void GainXp() => model.AddXp(700);

        /// <summary>받을 수 있는 칸의 pulse 수식 클래스를 켜고 끈다. USS transition 이 테두리 색을 부드럽게 잇는다</summary>
        void Pulse()
        {
            pulseOn = !pulseOn;
            foreach (Col c in byIndex.Values)
            {
                c.free.EnableInClassList("slot--pulse", pulseOn && c.free.ClassListContains("slot--claimable"));
                c.prem.EnableInClassList("slot--pulse", pulseOn && c.prem.ClassListContains("slot--claimable"));
            }
        }

        void OnModelChanged()
        {
            Refresh(true);
            levelLabel.text = $"Lv {model.Level}";
            model.Claimables(scratch);
            claimAll.text = $"모두 받기 {scratch.Count}";
            claimAll.SetEnabled(scratch.Count > 0);
        }

        void Claim(TierRef t)
        {
            if (model.BeginClaim(t)) Send(new List<TierRef> { t });   // 요청 중 · 받음 · 잠김이면 보내지 않는다
        }

        void ClaimAll()
        {
            model.Claimables(scratch);
            if (scratch.Count == 0) return;
            var list = new List<TierRef>(scratch);
            foreach (TierRef t in list) model.BeginClaim(t);   // 한 요청으로 모아 보낸다
            Send(list);
        }

        /// <summary>서버 지연 흉내 — serverDelayMs 뒤 확인하고 요약 한 줄 (결과 창 · 입력 잠금은 UGUI 판 ClaimResultPopup)</summary>
        void Send(List<TierRef> list)
        {
            IVisualElementScheduledItem item = null;
            item = toast.schedule.Execute(() =>
            {
                requests.Remove(item);
                model.CompleteClaim(list, true);
                toast.text = $"보상 {list.Count}개 받음 · " + string.Join(" · ", model.Summarize(list));
            }).StartingIn((long)serverDelayMs);
            requests.Add(item);
        }

        void Tick()
        {
            if (!clock.TryRemaining(seasonEnd, Time.realtimeSinceStartupAsDouble, clockSource, out TimeSpan left)) countdown.text = "동기화 중";
            else countdown.text = left > TimeSpan.Zero ? ServerClock.Format(left) : "시즌 종료";
        }
    }
}
