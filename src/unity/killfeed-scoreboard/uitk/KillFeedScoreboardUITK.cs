// UI Toolkit 판 — 같은 MatchEventSource · FeedQueue · MatchState · HoldToShow 를 쓴다 (UGUI 폴더). 바뀌는 것은 그리는 쪽뿐이다.
// 피드 줄: VisualElement 를 풀에서 꺼내 #feed 에 absolute 로 넣고, 들고 나는 연출은 USS transition (수식 클래스 in · out · pushed).
// 스코어보드: 팀마다 ListView 하나 — makeItem 은 보이는 행 수만큼만 불리고, 정렬이 바뀌면 리스트를 다시 채워 RefreshItems().
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.KillfeedScoreboard
{
    [RequireComponent(typeof(UIDocument))]
    public class KillFeedScoreboardUITK : MonoBehaviour
    {
        class FeedRefs
        {
            public VisualElement root, atkMark, icon, prec, vicMark;
            public Label me, atk, vic, extra, multi;
            public float top = -1f;
        }

        class ScoreRefs
        {
            public VisualElement root, mark;
            public Label name, me, takedowns, assists, outs, score, ping;
        }

        [SerializeField] MatchEventSource source;
        [Tooltip("Weapon enum 순서: 펄스 소총 · 산탄 방출기 · 정밀 조준총 · 충격 수류탄 · 진압봉 · 경계 밖")]
        [SerializeField] Sprite[] weaponSprites = new Sprite[6];
        [SerializeField, Range(3, 10)] int maxRows = 5;
        [SerializeField, Range(2f, 12f)] float displaySeconds = 5f;
        [SerializeField, Range(0f, 3f)] float mergeWindow = 1.5f;
        [SerializeField, Range(0f, 0.5f)] float paceSeconds = 0.22f;
        [SerializeField] float rowPitch = 58f;
        [SerializeField] SortKey sortKey = SortKey.Score;
        [Tooltip("짧게 누르면 열린 채 고정 (토글)")]
        [SerializeField] bool tapToggles;

        readonly FeedQueue queue = new();
        readonly Dictionary<FeedRow, FeedRefs> views = new();
        readonly Stack<FeedRefs> pool = new();
        readonly List<PlayerStats> orbitSorted = new(), surfaceSorted = new();
        VisualElement feed, board;
        ListView orbitList, surfaceList;
        Label orbitToWin, surfaceToWin, orbitScore, surfaceScore, headTakedowns, headScore, foot;
        HoldToShow hold;
        InputAction cycleSort;
        bool dirty = true;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            feed = root.Q("feed");
            board = root.Q("board");
            orbitList = root.Q<ListView>("orbit-list");
            surfaceList = root.Q<ListView>("surface-list");
            orbitToWin = root.Q<Label>("orbit-to-win");
            surfaceToWin = root.Q<Label>("surface-to-win");
            orbitScore = root.Q<Label>("orbit-score");
            surfaceScore = root.Q<Label>("surface-score");
            headTakedowns = root.Q<Label>("head-takedowns");
            headScore = root.Q<Label>("head-score");
            foot = root.Q<Label>("board-foot");
            SetupList(orbitList, orbitSorted);
            SetupList(surfaceList, surfaceSorted);

            queue.maxRows = maxRows;
            queue.displaySeconds = displaySeconds;
            queue.mergeWindow = mergeWindow;
            queue.paceSeconds = paceSeconds;
            queue.RowShown += OnShown;
            queue.RowMerged += OnMerged;
            queue.RowRemoved += OnRemoved;
            source.KillReceived += OnKill;

            hold = new HoldToShow(tapToggles);
            hold.VisibleChanged += OnVisible;
            hold.Enable();
            cycleSort = new InputAction("CycleSort", InputActionType.Button, "<Keyboard>/e");
            cycleSort.AddBinding("<Gamepad>/rightShoulder");
            cycleSort.performed += OnCycleSort;
            cycleSort.Enable();
            OnVisible(false);
        }

        // 켤 때 단 것은 끌 때 모두 뗀다 — 껐다 켜도 콜백이 두 벌이 되지 않게
        void OnDisable()
        {
            source.KillReceived -= OnKill;
            queue.Clear();
            queue.RowShown -= OnShown;
            queue.RowMerged -= OnMerged;
            queue.RowRemoved -= OnRemoved;
            hold.VisibleChanged -= OnVisible;
            hold.Dispose();
            cycleSort.performed -= OnCycleSort;
            cycleSort.Dispose();
        }

        void Start() => source.Match.Changed += MarkDirty;

        void OnDestroy()
        {
            if (source != null && source.Match != null) source.Match.Changed -= MarkDirty;
        }

        void MarkDirty() => dirty = true;

        void OnCycleSort(InputAction.CallbackContext _)
        {
            if (!hold.Visible) return;
            sortKey = (SortKey)(((int)sortKey + 1) % 3);
            dirty = true;
        }

        /// <summary>보드는 수식 클래스 open 하나로 — opacity · translate 가 USS transition 으로 바뀐다. 닫히면 아래 화면 클릭을 막지 않게 Ignore</summary>
        void OnVisible(bool visible)
        {
            board.EnableInClassList("board--open", visible);
            board.pickingMode = visible ? PickingMode.Position : PickingMode.Ignore;
            dirty |= visible;
        }

        void Update()
        {
            queue.Tick(Time.deltaTime);
            for (int i = 0; i < queue.rows.Count; i++)
            {
                FeedRow r = queue.rows[i];
                if (!views.TryGetValue(r, out FeedRefs v)) continue;
                float top = i * rowPitch;
                if (!Mathf.Approximately(v.top, top)) v.root.style.top = v.top = top;   // 위 줄이 빠지면 transition 으로 올라온다
                v.root.EnableInClassList("feed-row--pushed", r.leaving);
                v.root.EnableInClassList("feed-row--out", r.leaving || r.left <= FeedQueue.FadeSeconds);
            }
            if (hold.Visible && dirty) Redraw();
        }

        /* ───── 피드 ───── */

        void OnKill(KillEvent e) => queue.Push(e, source.MeIndex);

        void OnShown(FeedRow r)
        {
            FeedRefs v = pool.Count > 0 ? pool.Pop() : MakeFeedRow();
            v.root.RemoveFromClassList("feed-row--in");
            v.root.RemoveFromClassList("feed-row--out");
            v.root.RemoveFromClassList("feed-row--pushed");
            v.top = (queue.rows.Count - 1) * rowPitch;
            v.root.style.top = v.top;
            feed.Add(v.root);
            Fill(v, r);
            views[r] = v;
            // 만든 프레임에 바로 바꾸면 시작 스타일이 계산되기 전이라 transition 이 일어나지 않는다 — 한 프레임 뒤에
            v.root.schedule.Execute(() => v.root.AddToClassList("feed-row--in"));
        }

        void OnMerged(FeedRow r)
        {
            if (!views.TryGetValue(r, out FeedRefs v)) return;
            Fill(v, r);
            v.multi.AddToClassList("feed-row__multi--pop");   // 1.7배로 바로 → 다음 프레임에 떼면 0.26초 동안 1배로
            v.multi.schedule.Execute(() => v.multi.RemoveFromClassList("feed-row__multi--pop"));
        }

        void OnRemoved(FeedRow r)
        {
            if (!views.Remove(r, out FeedRefs v)) return;
            v.root.RemoveFromHierarchy();
            pool.Push(v);   // 버리지 않고 다음 줄이 다시 쓴다
        }

        FeedRefs MakeFeedRow()
        {
            var v = new FeedRefs { root = new VisualElement() };
            v.root.AddToClassList("feed-row");
            v.root.pickingMode = PickingMode.Ignore;
            v.me = Add(v.root, new Label(), "feed-row__me");
            VisualElement atk = Add(v.root, new VisualElement(), "feed-row__atk");
            v.atk = Add(atk, new Label(), "feed-row__name");
            v.atkMark = Add(atk, new VisualElement(), "mark");
            VisualElement wpn = Add(v.root, new VisualElement(), "feed-row__wpn");
            v.icon = Add(wpn, new VisualElement(), "feed-row__icon");
            v.prec = Add(wpn, new VisualElement(), "feed-row__prec");
            VisualElement vic = Add(v.root, new VisualElement(), "feed-row__vic");
            v.vicMark = Add(vic, new VisualElement(), "mark");
            v.vic = Add(vic, new Label(), "feed-row__name");
            v.extra = Add(vic, new Label(), "feed-row__extra");
            v.multi = Add(v.root, new Label(), "feed-row__multi");
            return v;
        }

        void Fill(FeedRefs v, FeedRow r)
        {
            MatchState m = source.Match;
            v.root.EnableInClassList("feed-row--mine-attacker", r.mine == Involvement.Attacker);
            v.root.EnableInClassList("feed-row--mine-victim", r.mine == Involvement.Victim);
            v.me.text = r.mine != Involvement.None ? "나" : "";
            PlayerStats a = m.Get(r.attacker);
            v.atk.text = a?.displayName ?? "";
            v.atkMark.style.display = a != null ? DisplayStyle.Flex : DisplayStyle.None;
            if (a != null) SetTeam(a.team, v.atk, v.atkMark);
            PlayerStats vi = m.Get(r.victims.Contains(source.MeIndex) ? source.MeIndex : r.victims[0]);
            v.vic.text = vi?.displayName ?? "";
            if (vi != null) SetTeam(vi.team, v.vic, v.vicMark);
            Sprite s = (int)r.weapon < weaponSprites.Length ? weaponSprites[(int)r.weapon] : null;
            v.icon.style.backgroundImage = s != null ? new StyleBackground(s) : new StyleBackground(StyleKeyword.Null);
            v.prec.style.display = r.precision ? DisplayStyle.Flex : DisplayStyle.None;
            int extra = r.Count - 1;
            v.extra.text = $"+{extra}";
            v.extra.style.display = extra > 0 ? DisplayStyle.Flex : DisplayStyle.None;
            v.multi.text = $"×{r.Count}";
            v.multi.style.visibility = extra > 0 ? Visibility.Visible : Visibility.Hidden;   // 칸은 남겨 열이 흔들리지 않게
        }

        /* ───── 스코어보드 ───── */

        void SetupList(ListView list, List<PlayerStats> items)
        {
            list.focusable = false;   // 보는 표 — 방향키 · 패드 입력을 먹지 않게
            list.selectionType = SelectionType.None;
            list.fixedItemHeight = 40;
            list.virtualizationMethod = CollectionVirtualizationMethod.FixedHeight;
            list.makeItem = MakeScoreRow;
            list.bindItem = (e, i) => Bind((ScoreRefs)e.userData, items[i]);
            list.itemsSource = items;
        }

        void Redraw()
        {
            dirty = false;
            MatchState m = source.Match;
            orbitToWin.text = m.Remaining(Team.Orbit).ToString();
            surfaceToWin.text = m.Remaining(Team.Surface).ToString();
            orbitScore.text = $"{m.TeamScore(Team.Orbit)} / {m.winScore}";
            surfaceScore.text = $"{m.TeamScore(Team.Surface)} / {m.winScore}";
            headTakedowns.EnableInClassList("table-head__cell--sort", sortKey == SortKey.Takedowns);
            headScore.EnableInClassList("table-head__cell--sort", sortKey == SortKey.Score);
            foot.text = sortKey switch
            {
                SortKey.Score => "정렬: 점수 · 같으면 제압 → 들어온 순서 (E 로 바꾸기)",
                SortKey.Takedowns => "정렬: 제압 · 같으면 들어온 순서 (E 로 바꾸기)",
                _ => "정렬: 들어온 순서 (E 로 바꾸기)",
            };
            Refill(orbitList, orbitSorted, Team.Orbit);
            Refill(surfaceList, surfaceSorted, Team.Surface);
        }

        void Refill(ListView list, List<PlayerStats> items, Team t)
        {
            int before = items.Count;
            source.Match.Sorted(t, sortKey, items);
            if (items.Count != before) list.Rebuild();   // 개수가 바뀌면 Rebuild, 데이터만 바뀌면 보이는 행만 다시 bindItem
            else list.RefreshItems();
        }

        VisualElement MakeScoreRow()
        {
            var r = new ScoreRefs { root = new VisualElement() };
            r.root.AddToClassList("score-row");
            r.mark = Add(r.root, new VisualElement(), "mark");
            r.name = Add(r.root, new Label(), "score-row__name");
            r.me = Add(r.root, new Label("나"), "score-row__me");
            r.takedowns = Add(r.root, new Label(), "score-row__cell");
            r.assists = Add(r.root, new Label(), "score-row__cell");
            r.outs = Add(r.root, new Label(), "score-row__cell");
            r.score = Add(r.root, new Label(), "score-row__cell");
            r.ping = Add(r.root, new Label(), "score-row__cell");
            r.root.userData = r;
            return r.root;
        }

        void Bind(ScoreRefs r, PlayerStats p)
        {
            r.root.EnableInClassList("score-row--me", p.isMe);
            SetTeam(p.team, r.name, r.mark);
            r.name.text = p.displayName;
            r.me.style.display = p.isMe ? DisplayStyle.Flex : DisplayStyle.None;
            r.takedowns.text = p.takedowns.ToString();
            r.assists.text = p.assists.ToString();
            r.outs.text = p.outs.ToString();
            r.score.text = p.Score.ToString();
            r.ping.text = p.ping >= 100 ? $"{p.ping}!" : p.ping.ToString();
            r.ping.EnableInClassList("score-row__cell--warn", p.ping >= 100);
            r.takedowns.EnableInClassList("score-row__cell--sort", sortKey == SortKey.Takedowns);
            r.score.EnableInClassList("score-row__cell--sort", sortKey == SortKey.Score);
        }

        static void SetTeam(Team t, params VisualElement[] els)
        {
            foreach (VisualElement e in els)
            {
                e.EnableInClassList("team-orbit", t == Team.Orbit);
                e.EnableInClassList("team-surface", t == Team.Surface);
            }
        }

        static T Add<T>(VisualElement parent, T child, string cls) where T : VisualElement
        {
            child.AddToClassList(cls);
            parent.Add(child);
            return child;
        }
    }
}
