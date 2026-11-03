// 분기 경로 맵 (UI Toolkit) — UGUI 폴더의 RouteMapData(순수 C#)를 그대로 쓴다. 같은 시드면 UGUI · 웹 판과 같은 지도.
// 노드는 Button(position: absolute), 지도는 ScrollView, 간선은 EdgeLayer 가 Painter2D 베지어로 그린다.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.BranchingRouteMap
{
    [RequireComponent(typeof(UIDocument))]
    public class RouteMapUITK : MonoBehaviour
    {
        [Header("생성 입력")]
        [SerializeField] int seed = 7;
        [SerializeField, Range(8, 16)] int floors = 12;
        [SerializeField, Range(3, 7)] int cols = 7;
        [SerializeField, Range(2, 6)] int paths = 5;
        [SerializeField] MapMix mix = MapMix.Balanced;
        [SerializeField] bool preventCross = true;

        [Header("배치 (1080×1920 기준)")]
        [SerializeField] float colWidth = 135f;
        [SerializeField] float rowHeight = 150f;
        [SerializeField] float padTop = 250f;
        [SerializeField] float padBottom = 150f;
        [SerializeField] float nodeSize = 80f;
        [Tooltip("NodeKind 순서: 교전 · 강적 · 정비 · 보급 · 회수 · 미확인 신호 · 최종 목표")]
        [SerializeField] Sprite[] icons = new Sprite[7];

        [Header("따라가기")]
        [SerializeField] bool followScroll = true;
        [SerializeField] float followSpeed = 5f;

        const string SaveKey = "UIGallery.BranchingRouteMap.Run";
        static readonly string[] KindNames = { "교전", "강적", "정비", "보급", "회수", "미확인 신호", "최종 목표" };
        static readonly string[] KindClass = { "kind-fight", "kind-elite", "kind-rest", "kind-shop", "kind-loot", "kind-signal", "kind-goal" };

        RouteMapData map;
        readonly List<int> path = new();
        VisualElement screen, content, legendBox;
        ScrollView scroll;
        EdgeLayer edgeLayer;
        Label here, seedLabel, json;
        readonly Dictionary<int, Button> nodes = new();
        readonly List<(NodeKind kind, Button button)> legend = new();
        NodeKind? hover, pinned;
        bool following;
        IVisualElementScheduledItem beat;

        float ContentHeight => padTop + (floors - 1) * rowHeight + padBottom;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            screen = root.Q("screen");
            scroll = root.Q<ScrollView>("map");
            content = root.Q("content");
            legendBox = root.Q("legend");
            here = root.Q<Label>("here");
            seedLabel = root.Q<Label>("seed");
            json = root.Q<Label>("json");
            root.Q<Button>("btn-save").clicked += OnSave;
            root.Q<Button>("btn-load").clicked += OnLoad;
            root.Q<Button>("btn-new").clicked += OnNewMap;

            edgeLayer = new EdgeLayer();
            // 사람이 휠을 굴리거나 지도를 누르면 따라가기를 멈춘다 (다음 이동 때 다시)
            scroll.RegisterCallback<WheelEvent>(StopFollow, TrickleDown.TrickleDown);
            scroll.RegisterCallback<PointerDownEvent>(StopFollow, TrickleDown.TrickleDown);
            BuildLegend();
            // 갈 수 있는 노드가 1Hz 로 숨쉬게 — 0.5초마다 클래스를 바꾸고 USS transition 이 크기를 잇는다
            beat = screen.schedule.Execute(() => screen.ToggleInClassList("screen--beat")).Every(500);
            Build(seed);
        }

        void OnDisable()
        {
            // UIDocument 를 다시 켜면 UXML 트리가 새로 만들어진다 — 이전 요소에 붙인 것을 정리
            beat?.Pause();
            scroll?.UnregisterCallback<WheelEvent>(StopFollow, TrickleDown.TrickleDown);
            scroll?.UnregisterCallback<PointerDownEvent>(StopFollow, TrickleDown.TrickleDown);
            nodes.Clear();
            legend.Clear();
        }

        void StopFollow(EventBase e) => following = false;

        /* ───── 생성 · 배치 ───── */

        void Build(int newSeed)
        {
            seed = newSeed;
            map = RouteMapData.Generate(seed, floors, cols, paths, mix, preventCross);
            path.Clear();
            Spawn();
            Refresh(true);
            following = true;
            Debug.Log($"[경로 맵 UITK] 시드 {seed} · 지문 {map.print}");
        }

        void OnNewMap() => Build(seed + 1);

        /// <summary>content 왼쪽 위 기준 좌표 (UI Toolkit 은 y 가 아래로 +)</summary>
        Vector2 Pos(MapNode n)
        {
            bool goal = n.kind == NodeKind.Goal;
            float x = goal ? map.cols * colWidth / 2f : (n.col + 0.5f + n.jx * 0.5f) * colWidth;
            float y = goal ? 105f : ContentHeight - padBottom - (n.floor + n.jy * 0.36f) * rowHeight;
            return new Vector2(x, y);
        }

        void Spawn()
        {
            content.Clear();
            nodes.Clear();
            content.style.width = map.cols * colWidth;
            content.style.height = ContentHeight;
            content.Add(edgeLayer);   // 첫 자식 = 맨 아래에 그려진다
            foreach (MapNode n in map.nodes)
            {
                int id = n.id;
                float size = n.kind == NodeKind.Goal ? nodeSize * 1.7f : nodeSize;
                Vector2 p = Pos(n);
                var b = new Button(() => MoveTo(id));
                b.ClearClassList();   // 기본 unity-button 모양을 떼고 우리 클래스만
                b.AddToClassList("node");
                b.AddToClassList(KindClass[(int)n.kind]);
                b.style.left = p.x - size / 2f;
                b.style.top = p.y - size / 2f;
                b.style.width = size;
                b.style.height = size;
                b.style.borderTopLeftRadius = b.style.borderTopRightRadius = b.style.borderBottomLeftRadius = b.style.borderBottomRightRadius = size / 2f;
                b.tooltip = KindNames[(int)n.kind];
                var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("node__icon");
                if (icons[(int)n.kind] != null) icon.style.backgroundImage = new StyleBackground(icons[(int)n.kind]);
                b.Add(icon);
                b.RegisterCallback<NavigationMoveEvent>(e => OnNavigate(e, id));
                content.Add(b);
                nodes[id] = b;
            }
            foreach ((NodeKind kind, Button button) in legend)
                button.Q<Label>(className: "legend__count").text = map.nodes.FindAll(n => n.kind == kind).Count.ToString();
        }

        /* ───── 이동 ───── */

        void MoveTo(int id)
        {
            if (!map.Reachable(path).Contains(id)) return;   // 못 가는 노드는 SetEnabled(false) 라 보통 오지 않는다
            path.Add(id);
            following = followScroll;
            Refresh(true);
        }

        /// <summary>키보드 · 패드 좌우: 갈 수 있는 노드끼리만 옮겨 다닌다 (기본 포커스 이동은 화면상 가장 가까운 요소로 간다)</summary>
        void OnNavigate(NavigationMoveEvent e, int id)
        {
            List<int> reach = map.Reachable(path);
            int i = reach.IndexOf(id);
            if (i < 0) return;
            int d = e.direction == NavigationMoveEvent.Direction.Left ? -1 : e.direction == NavigationMoveEvent.Direction.Right ? 1 : 0;
            if (d == 0) return;
            nodes[reach[(i + d + reach.Count) % reach.Count]].Focus();
            e.StopPropagation();
        }

        /* ───── 그리기 ───── */

        void Refresh(bool focusFirst)
        {
            List<int> reach = map.Reachable(path);
            MapNode cur = path.Count > 0 ? map.Get(path[^1]) : null;
            int curFloor = cur != null ? cur.floor : -1;
            var visited = new HashSet<int>(path);
            NodeKind? hl = hover ?? pinned;

            foreach (MapNode n in map.nodes)
            {
                Button b = nodes[n.id];
                bool can = reach.Contains(n.id);
                b.SetEnabled(can);   // 갈 수 있는 노드만 누를 수 있고 포커스도 받는다
                b.EnableInClassList("node--current", n == cur);
                b.EnableInClassList("node--visited", visited.Contains(n.id) && n != cur);
                b.EnableInClassList("node--next", can);
                b.EnableInClassList("node--past", !can && !visited.Contains(n.id) && n.floor <= curFloor);
                b.EnableInClassList("node--hit", hl == n.kind);
                b.EnableInClassList("node--dim", hl.HasValue && hl != n.kind);
            }

            edgeLayer.edges.Clear();
            foreach (MapNode a in map.nodes)
                foreach (int id in a.next)
                {
                    MapNode b = map.Get(id);
                    int ia = path.IndexOf(a.id);
                    EdgeLayer.State s = ia >= 0 && ia + 1 < path.Count && path[ia + 1] == id ? EdgeLayer.State.Trail
                        : cur == a && reach.Contains(id) ? EdgeLayer.State.Next
                        : b.floor <= curFloor ? EdgeLayer.State.Past : EdgeLayer.State.Idle;
                    edgeLayer.edges.Add((Pos(a), Pos(b), s));
                }
            edgeLayer.dimmed = hl.HasValue;
            edgeLayer.MarkDirtyRepaint();   // 다시 그려 달라고 알린다

            foreach ((NodeKind kind, Button button) in legend) button.EnableInClassList("legend__btn--on", hl == kind);
            if (focusFirst && reach.Count > 0) nodes[reach[0]].Focus();
            seedLabel.text = $"시드 {seed} · 지문 {map.print}";
            here.text = cur == null ? "출발 전 — 0층 노드를 고른다" : $"{KindNames[(int)cur.kind]} · {Mathf.Min(cur.floor + 1, floors)}층 / {floors}층";
        }

        /* ───── 스크롤 따라가기 ───── */

        void Update()
        {
            if (!following || map == null) return;
            float viewH = scroll.contentViewport.layout.height;
            if (float.IsNaN(viewH) || viewH <= 0f) return;   // 첫 레이아웃 전
            float maxTop = Mathf.Max(0f, ContentHeight - viewH);
            MapNode cur = path.Count > 0 ? map.Get(path[^1]) : null;
            float y = cur != null ? Pos(cur).y : ContentHeight - padBottom + 92f;
            float target = Mathf.Clamp(y - viewH * 0.66f, 0f, maxTop);   // 현재 위치를 창 아래쪽 2/3 지점에
            float v = Mathf.Lerp(scroll.scrollOffset.y, target, 1f - Mathf.Exp(-followSpeed * Time.unscaledDeltaTime));
            if (Mathf.Abs(v - target) < 0.5f)
            {
                v = target;
                following = false;
            }
            scroll.scrollOffset = new Vector2(0f, v);
        }

        /* ───── 범례 ───── */

        void BuildLegend()
        {
            legendBox.Clear();
            legend.Clear();
            for (int k = 0; k < KindNames.Length; k++)
            {
                NodeKind kind = (NodeKind)k;
                var b = new Button(() =>
                {
                    pinned = pinned == kind ? null : kind;
                    Refresh(false);
                });
                b.ClearClassList();
                b.AddToClassList("legend__btn");
                b.AddToClassList(KindClass[k]);
                var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("legend__icon");
                if (icons[k] != null) icon.style.backgroundImage = new StyleBackground(icons[k]);
                var label = new Label(KindNames[k]) { pickingMode = PickingMode.Ignore };
                label.AddToClassList("legend__name");
                var count = new Label("0") { pickingMode = PickingMode.Ignore };
                count.AddToClassList("legend__count");
                b.Add(icon);
                b.Add(label);
                b.Add(count);
                // 마우스를 올려도, 포커스를 두어도 같은 강조
                b.RegisterCallback<PointerEnterEvent>(_ => SetHover(kind));
                b.RegisterCallback<PointerLeaveEvent>(_ => SetHover(null));
                b.RegisterCallback<FocusInEvent>(_ => SetHover(kind));
                b.RegisterCallback<FocusOutEvent>(_ => SetHover(null));
                legendBox.Add(b);
                legend.Add((kind, b));
            }
        }

        void SetHover(NodeKind? kind)
        {
            hover = kind;
            if (map != null) Refresh(false);
        }

        /* ───── 저장 · 불러오기 (UGUI 판과 같은 키 · 같은 JSON) ───── */

        void OnSave()
        {
            var s = new RunSave
            {
                seed = map.seed, floors = map.floors, cols = map.cols, paths = map.paths,
                mix = RouteMapData.MixName(map.mix), at = path.Count > 0 ? path[^1] : -1, path = new List<int>(path),
            };
            string text = JsonUtility.ToJson(s);
            PlayerPrefs.SetString(SaveKey, text);
            PlayerPrefs.Save();
            json.text = text;
        }

        void OnLoad()
        {
            if (!PlayerPrefs.HasKey(SaveKey)) return;
            RunSave s = JsonUtility.FromJson<RunSave>(PlayerPrefs.GetString(SaveKey));
            if (s == null || !Enum.TryParse(s.mix, true, out MapMix m)) return;
            seed = s.seed;
            floors = s.floors;
            cols = s.cols;
            paths = s.paths;
            mix = m;
            map = RouteMapData.Generate(seed, floors, cols, paths, mix, preventCross);
            Spawn();
            path.Clear();
            bool ok = map.ValidPath(s.path);   // 지도는 시드로 다시 만들고, 길이 그 지도에서 이어지는지 검사
            if (ok) path.AddRange(s.path);
            json.text = ok ? $"불러옴 — 길 {s.path.Count}칸 검증" : "불러오기 실패 — 처음부터";
            Refresh(true);
            following = true;
        }
    }

    /// <summary>
    /// 간선 레이어 — 두 노드를 세로 접선의 3차 베지어로 잇는다. USS 로는 선을 그릴 수 없어 generateVisualContent + Painter2D.
    /// 입력을 가로막지 않게 picking-mode Ignore.
    /// </summary>
    public class EdgeLayer : VisualElement
    {
        public enum State { Idle, Past, Next, Trail }

        public readonly List<(Vector2 a, Vector2 b, State state)> edges = new();
        public bool dimmed;

        public EdgeLayer()
        {
            pickingMode = PickingMode.Ignore;
            style.position = Position.Absolute;
            style.left = 0;
            style.top = 0;
            style.right = 0;
            style.bottom = 0;
            generateVisualContent += Draw;
        }

        void Draw(MeshGenerationContext ctx)
        {
            Painter2D p = ctx.painter2D;
            p.lineCap = LineCap.Round;
            // 흐린 선부터 그려 밝은 선(지나온 길 · 다음 길)이 위에 오게
            for (int pass = 0; pass < 4; pass++)
                foreach ((Vector2 a, Vector2 b, State s) in edges)
                {
                    if ((int)s != pass) continue;
                    float alpha = dimmed ? 0.35f : 1f;
                    (Color c, float w) = s switch
                    {
                        State.Trail => (new Color(0.92f, 0.95f, 0.98f, alpha), 8f),
                        State.Next => (new Color(0.37f, 0.9f, 0.79f, alpha), 6f),
                        State.Past => (new Color(0.3f, 0.42f, 0.55f, 0.25f * alpha), 4f),
                        _ => (new Color(0.3f, 0.42f, 0.55f, 0.8f * alpha), 4f),
                    };
                    float my = (a.y + b.y) / 2f;
                    p.strokeColor = c;
                    p.lineWidth = w;
                    p.BeginPath();
                    p.MoveTo(a);
                    p.BezierCurveTo(new Vector2(a.x, my), new Vector2(b.x, my), b);
                    p.Stroke();
                }
        }
    }
}
