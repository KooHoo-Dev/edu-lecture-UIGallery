// 스킬트리 (UI Toolkit) — UGUI 폴더의 SkillTreeData(표 · 규칙 · TreeMath)를 그대로 쓴다. 같은 표면 웹 · UGUI 판과 같은 트리.
// 줌 = #world 의 style.scale, 팬 = style.translate. 글자 · 표식은 1/배율, 확대 단계는 #world 의 .lod-* 클래스로 USS 가 정한다.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.SkillTree
{
    [RequireComponent(typeof(UIDocument))]
    public class SkillTreeUITK : MonoBehaviour
    {
        [SerializeField] TextAsset table;   // 비우면 SkillTreeData.DefaultTsv
        [SerializeField] int totalPoints = 14;
        [SerializeField] bool resetOnly;
        [SerializeField] float cellX = 200f, cellY = 190f, padX = 120f, padY = 100f, nodeSize = 96f;
        [SerializeField] float minZoom = 0.4f, maxZoom = 1.6f, farBelow = 0.65f, nearFrom = 1f, startZoom = 0.75f;
        [Tooltip("스프라이트 이름 = 표의 icon 열")]
        [SerializeField] Sprite[] icons;
        [Tooltip("NodeState 순서: 자물쇠 · ＋ · 반원 · 별")]
        [SerializeField] Sprite[] badges = new Sprite[4];

        static readonly string[] StateClass = { "node--locked", "node--available", "node--acquired", "node--maxed" };

        class NodeEl
        {
            public Button button;
            public VisualElement labels, badge;
            public Label rank, next;
        }

        SkillProgress progress;
        VisualElement viewport, world, tooltip;
        Label tipTitle, tipBody, zoomLabel, lodLabel, points, toast;
        EdgeLayer edgeLayer;
        readonly Dictionary<string, NodeEl> nodes = new();
        readonly List<(Button b, System.Action a)> clicks = new();
        readonly List<string> scratch = new();
        string selected;
        float zoom = 1f, zoomTarget = 1f;
        Vector2 pan, zoomPivot, size;
        bool centerPending;
        int dragId = -1;
        bool dragging;
        Vector2 dragStart, panStart;
        IVisualElementScheduledItem beat;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            viewport = root.Q("viewport");
            world = root.Q("world");
            tooltip = root.Q("tooltip");
            tipTitle = root.Q<Label>("tip-title");
            tipBody = root.Q<Label>("tip-body");
            zoomLabel = root.Q<Label>("zoom");
            lodLabel = root.Q<Label>("lod");
            points = root.Q<Label>("points");
            toast = root.Q<Label>("toast");
            OnClick(root, "btn-in", () => ZoomBy(1.25f));
            OnClick(root, "btn-out", () => ZoomBy(0.8f));
            OnClick(root, "btn-learn", () => Learn(selected));
            OnClick(root, "btn-refund", RefundSelected);
            OnClick(root, "btn-reset", ResetAll);
            viewport.RegisterCallback<WheelEvent>(OnWheel);
            // TrickleDown: 노드 Button 보다 먼저 받아야 노드 위에서 시작한 끌기도 팬이 된다
            viewport.RegisterCallback<PointerDownEvent>(OnDown, TrickleDown.TrickleDown);
            viewport.RegisterCallback<PointerMoveEvent>(OnMove, TrickleDown.TrickleDown);
            viewport.RegisterCallback<PointerUpEvent>(OnUp, TrickleDown.TrickleDown);

            SkillTreeData data = SkillTreeData.Parse(table != null ? table.text : SkillTreeData.DefaultTsv);
            progress = new SkillProgress(data, totalPoints) { resetOnly = resetOnly };
            selected = data.FirstId(table == null);
            Spawn();
            progress.Changed += Refresh;
            progress.Replay(table == null ? SkillTreeData.DemoStart : new string[0]);
            zoom = zoomTarget = Mathf.Clamp(startZoom, minZoom, maxZoom);
            centerPending = true;   // 창 크기는 첫 레이아웃 뒤에 안다
            beat = world.schedule.Execute(() => world.ToggleInClassList("world--beat")).Every(500);
            nodes[selected].button.Focus();
        }

        void OnDisable()
        {
            // 컴포넌트만 껐다 켜면 UXML 트리가 남는다 — 붙인 핸들러를 떼지 않으면 두 번 걸린다
            foreach ((Button b, System.Action a) in clicks) b.clicked -= a;
            clicks.Clear();
            viewport?.UnregisterCallback<WheelEvent>(OnWheel);
            viewport?.UnregisterCallback<PointerDownEvent>(OnDown, TrickleDown.TrickleDown);
            viewport?.UnregisterCallback<PointerMoveEvent>(OnMove, TrickleDown.TrickleDown);
            viewport?.UnregisterCallback<PointerUpEvent>(OnUp, TrickleDown.TrickleDown);
            beat?.Pause();
            if (progress != null) progress.Changed -= Refresh;
            nodes.Clear();
        }

        void OnClick(VisualElement root, string name, System.Action a)
        {
            var b = root.Q<Button>(name);
            b.clicked += a;
            clicks.Add((b, a));
        }

        /* ───── 만들기 ───── */

        Vector2 Pos(SkillNode n) => new(padX + n.col * cellX, padY + n.row * cellY);   // y 아래로 +

        static VisualElement Part(VisualElement parent, string cls)
        {
            var v = new VisualElement { pickingMode = PickingMode.Ignore };
            v.AddToClassList(cls);
            parent.Add(v);
            return v;
        }

        static Label Text(VisualElement parent, string cls, string text = "")
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            parent.Add(l);
            return l;
        }

        void Spawn()
        {
            world.Clear();
            nodes.Clear();
            size = new Vector2(padX * 2f, padY * 2f) + Vector2.Scale(progress.tree.extent, new Vector2(cellX, cellY));
            world.style.width = size.x;
            world.style.height = size.y;
            edgeLayer = new EdgeLayer();
            world.Add(edgeLayer);   // 첫 자식 = 맨 아래

            foreach (SkillNode n in progress.tree.nodes)
            {
                string id = n.id;
                var b = new Button(() => OnNode(id));
                b.ClearClassList();   // 기본 unity-button 모양을 뗀다
                b.AddToClassList("node");
                b.AddToClassList("branch-" + n.branch);
                Vector2 p = Pos(n);
                b.style.left = p.x - nodeSize / 2f;
                b.style.top = p.y - nodeSize / 2f;
                b.style.width = nodeSize;
                b.style.height = nodeSize;
                Part(b, "node__ring");
                Part(b, "node__focus");
                VisualElement icon = Part(Part(b, "node__shape"), "node__icon");
                Sprite sprite = System.Array.Find(icons ?? new Sprite[0], s => s != null && s.name == n.icon);
                if (sprite != null) icon.style.backgroundImage = new StyleBackground(sprite);
                var el = new NodeEl { button = b, badge = Part(b, "node__badge"), labels = Part(b, "node__labels") };
                Text(el.labels, "node__name", n.name);
                el.rank = Text(el.labels, "node__rank");
                el.next = Text(el.labels, "node__next");
                // 마우스 올림도 Focus — Enter · 버튼이 같은 노드에. 지도는 키 · 패드 이동 때만 따라간다
                b.RegisterCallback<FocusInEvent>(_ => SetSelected(id));
                b.RegisterCallback<PointerEnterEvent>(_ =>
                {
                    if (dragId < 0) b.Focus();
                });
                b.RegisterCallback<NavigationMoveEvent>(e => OnNavigate(e, id));
                world.Add(b);
                nodes[id] = el;
            }
        }

        /* ───── 규칙은 SkillProgress, 여기서는 결과 문구만 ───── */

        void OnNode(string id)
        {
            if (dragging) return;
            SetSelected(id);
            Learn(id);
        }

        void Learn(string id) => toast.text = progress.LearnMessage(id, progress.Learn(id));
        void RefundSelected() => toast.text = progress.RefundMessage(selected, progress.Refund(selected, scratch), scratch);
        void ResetAll() => toast.text = $"전체 초기화 — 포인트 {progress.ResetAll()} 환불";

        /* ───── 그리기 ───── */

        void Refresh()
        {
            foreach (SkillNode n in progress.tree.nodes)
            {
                NodeEl el = nodes[n.id];
                NodeState s = progress.StateOf(n);
                for (int i = 0; i < StateClass.Length; i++) el.button.EnableInClassList(StateClass[i], i == (int)s);
                el.button.EnableInClassList("node--can", progress.CheckLearn(n.id) == LearnResult.Ok);
                Sprite badge = badges != null && badges.Length > (int)s ? badges[(int)s] : null;
                if (badge != null) el.badge.style.backgroundImage = new StyleBackground(badge);
                el.rank.text = progress.RankLabel(n);
                el.next.text = progress.NextLabel(n);
            }
            edgeLayer.edges.Clear();
            foreach (SkillNode b in progress.tree.nodes)
                foreach (string id in b.req)
                {
                    SkillNode a = progress.tree.Get(id);
                    edgeLayer.edges.Add((Pos(a), Pos(b), TreeMath.BranchColor(b.branch), progress.EdgeOf(a, b)));
                }
            edgeLayer.MarkDirtyRepaint();
            points.text = $"남은 포인트 {progress.Left} / {progress.total} · 사용 {progress.Spent}";
            ShowTooltip();
        }

        void SetSelected(string id)
        {
            bool changed = selected != id;
            selected = id;
            if (changed) progress.ClearNeed();
            ShowTooltip();
        }

        void ShowTooltip()
        {
            tipTitle.text = progress.TooltipTitle(selected);
            tipBody.text = progress.TooltipBody(selected);
        }

        /* ───── 팬 · 줌 ───── */

        void ApplyTransform()
        {
            pan = TreeMath.Clamp(pan, zoom, size, ViewSize);
            world.style.translate = new Translate(pan.x, pan.y);
            world.style.scale = new Scale(new Vector2(zoom, zoom));
            var inv = new Scale(new Vector2(1f / zoom, 1f / zoom));
            foreach (NodeEl el in nodes.Values)
            {
                el.labels.style.scale = inv;
                el.badge.style.scale = inv;
            }
            int lv = TreeMath.Level(zoom, farBelow, nearFrom);
            world.EnableInClassList("lod-far", lv == 0);
            world.EnableInClassList("lod-mid", lv == 1);
            world.EnableInClassList("lod-near", lv == 2);
            edgeLayer.zoom = zoom;
            edgeLayer.MarkDirtyRepaint();
            zoomLabel.text = $"{Mathf.RoundToInt(zoom * 100f)}%";
            lodLabel.text = TreeMath.LevelNames[lv];
        }

        void ZoomTo(float z)
        {
            pan = TreeMath.ZoomPan(pan, zoom, z, zoomPivot);
            zoom = z;
            ApplyTransform();
        }

        Vector2 ViewSize => new(viewport.resolvedStyle.width, viewport.resolvedStyle.height);

        void ZoomBy(float factor)
        {
            zoomPivot = ViewSize / 2f;
            zoomTarget = Mathf.Clamp(zoomTarget * factor, minZoom, maxZoom);
        }

        void OnWheel(WheelEvent e)
        {
            zoomPivot = viewport.WorldToLocal(e.mousePosition);
            zoomTarget = Mathf.Clamp(zoomTarget * (e.delta.y < 0f ? 1.15f : 1f / 1.15f), minZoom, maxZoom);
            ZoomTo(zoomTarget);   // 휠은 칸마다 즉시
            e.StopPropagation();
        }

        void OnDown(PointerDownEvent e)
        {
            if (e.button != 0) return;
            dragId = e.pointerId;
            dragStart = viewport.WorldToLocal(e.position);
            panStart = pan;
            dragging = false;
        }

        void OnMove(PointerMoveEvent e)
        {
            if (e.pointerId != dragId) return;
            Vector2 p = viewport.WorldToLocal(e.position);
            if (!dragging && (p - dragStart).sqrMagnitude > 64f)
            {
                dragging = true;
                viewport.CapturePointer(dragId);   // 8px 넘게 움직여야 끌기 (노드 클릭과 나눈다)
            }
            if (!dragging) return;
            pan = panStart + p - dragStart;
            ApplyTransform();
        }

        void OnUp(PointerUpEvent e)
        {
            if (e.pointerId != dragId) return;
            if (dragging) viewport.ReleasePointer(dragId);
            dragId = -1;
            viewport.schedule.Execute(() => dragging = false);   // 같은 프레임의 클릭이 습득으로 새지 않게
        }

        /// <summary>방향키 · 스틱: 그 방향의 가장 가까운 노드로. IgnoreEvent 를 함께 불러야 기본 이동이 한 칸 더 가지 않는다</summary>
        void OnNavigate(NavigationMoveEvent e, string id)
        {
            Vector2 d = e.direction switch
            {
                NavigationMoveEvent.Direction.Left => Vector2.left,
                NavigationMoveEvent.Direction.Right => Vector2.right,
                NavigationMoveEvent.Direction.Up => Vector2.down,     // 화면 위 = y 감소
                NavigationMoveEvent.Direction.Down => Vector2.up,
                _ => Vector2.zero,
            };
            if (d == Vector2.zero) return;
            SkillNode from = progress.tree.Get(id), best = null;
            float bestScore = float.MaxValue;
            foreach (SkillNode n in progress.tree.nodes)
            {
                Vector2 v = Pos(n) - Pos(from);
                float along = Vector2.Dot(v, d);
                if (n == from || along <= 0f) continue;
                // ↑ 직계 선행 · ↓ 직계 후행은 반값 (대각선 위 선행을 건너뛰지 않게)
                bool link = d.y < 0f ? System.Array.IndexOf(from.req, n.id) >= 0 : d.y > 0f && System.Array.IndexOf(n.req, from.id) >= 0;
                float score = (along + 2.5f * Mathf.Abs(v.x * d.y - v.y * d.x)) * (link ? 0.5f : 1f);
                if (score < bestScore)
                {
                    bestScore = score;
                    best = n;
                }
            }
            if (best != null)
            {
                nodes[best.id].button.Focus();
                EnsureVisible(best);
            }
            e.StopPropagation();
            nodes[id].button.focusController?.IgnoreEvent(e);
        }

        void EnsureVisible(SkillNode n)
        {
            pan += TreeMath.Inside(pan + Pos(n) * zoom, ViewSize);
            ApplyTransform();
        }

        void Update()
        {
            Vector2 view = ViewSize;
            if (float.IsNaN(view.x) || view.x <= 0f) return;   // 첫 레이아웃 전
            if (centerPending)
            {
                centerPending = false;
                pan = TreeMath.Center(zoom, size, view);
                EnsureVisible(progress.tree.Get(selected));
            }
            if (Mathf.Abs(zoom - zoomTarget) > 0.001f) ZoomTo(Mathf.Lerp(zoom, zoomTarget, 1f - Mathf.Exp(-14f * Time.unscaledDeltaTime)));
            PlaceTooltip(view);
        }

        /// <summary>크기는 레이아웃 뒤(resolvedStyle)에 읽는다</summary>
        void PlaceTooltip(Vector2 view)
        {
            var tip = new Vector2(tooltip.resolvedStyle.width, tooltip.resolvedStyle.height);
            if (float.IsNaN(tip.x) || float.IsNaN(tip.y)) return;
            Vector2 p = TreeMath.Beside(pan + Pos(progress.tree.Get(selected)) * zoom, nodeSize * zoom / 2f + 6f, tip, view);
            tooltip.style.left = p.x;
            tooltip.style.top = p.y;
        }
    }

    /// <summary>연결선 (Painter2D). #world 와 함께 확대되므로 굵기 · 점선을 배율로 나눈다. 상태는 색 + 굵기 + 점선</summary>
    public class EdgeLayer : VisualElement
    {
        static readonly float[] Width = { 4f, 4f, 5f, 7f, 6f }, Dash = { 3f, 0f, 12f, 0f, 10f }, Gap = { 10f, 0f, 9f, 0f, 8f };

        public readonly List<(Vector2 a, Vector2 b, Color color, EdgeState state)> edges = new();
        public float zoom = 1f;

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
            float k = 1f / Mathf.Max(0.1f, zoom);
            for (int pass = 0; pass < Width.Length; pass++)
                foreach ((Vector2 a, Vector2 b, Color color, EdgeState s) in edges)
                {
                    if ((int)s != pass) continue;
                    p.strokeColor = s switch
                    {
                        EdgeState.Locked => new Color(0.18f, 0.29f, 0.4f),
                        EdgeState.Half => new Color(color.r, color.g, color.b, 0.45f),
                        EdgeState.Need => new Color(1f, 0.42f, 0.49f),
                        _ => color,
                    };
                    p.lineWidth = Width[pass] * k;
                    p.BeginPath();
                    float len = Vector2.Distance(a, b), on = Dash[pass] * k, step = on + Gap[pass] * k;
                    Vector2 dir = (b - a) / Mathf.Max(len, 0.01f);
                    if (on <= 0f) step = on = Mathf.Max(len, 1f);   // 실선
                    for (float t = 0f; t < len; t += step)
                    {
                        p.MoveTo(a + dir * t);
                        p.LineTo(a + dir * Mathf.Min(t + on, len));
                    }
                    p.Stroke();
                }
        }
    }
}
