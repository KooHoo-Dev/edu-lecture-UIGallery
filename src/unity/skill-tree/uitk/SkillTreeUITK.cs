// 스킬트리 (UI Toolkit) — UGUI 폴더의 SkillTreeData(표 읽기 · 규칙)를 그대로 쓴다. 같은 표면 웹 · UGUI 판과 같은 트리.
// 줌은 #world 의 style.scale, 팬은 style.translate. 글자 묶음 · 표식은 1/배율 로 되돌려 화면 크기를 지키고,
// #world 에 .lod-far · .lod-mid · .lod-near 를 붙여 USS 가 확대 단계별로 보여 줄 것을 정한다. 연결선은 EdgeLayer 가 Painter2D 로 그린다.
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
        [Tooltip("스프라이트 이름을 표의 icon 열과 같게 (badge, boot, scan …)")]
        [SerializeField] Sprite[] icons;
        [Tooltip("NodeState 순서: 자물쇠 · ＋ · 반원 · 별")]
        [SerializeField] Sprite[] badges = new Sprite[4];

        static readonly string[] StateClass = { "node--locked", "node--available", "node--acquired", "node--maxed" };
        static readonly string[] LodNames = { "멀리 · 아이콘 + 표식", "중간 · + 단계", "가까이 · + 이름 · 수치" };

        class NodeEl
        {
            public Button button;
            public VisualElement labels, badge;
            public Label rank, next;
        }

        SkillProgress progress;
        VisualElement viewport, world, tooltip;
        Label tipTitle, tipBody, zoomLabel, lodLabel, points, toast;
        Button btnIn, btnOut, btnLearn, btnRefund, btnReset;
        EdgeLayer edgeLayer;
        readonly Dictionary<string, NodeEl> nodes = new();
        readonly List<string> scratch = new();
        string selected = "scan";
        float zoom = 1f, zoomTarget = 1f;
        Vector2 pan, zoomPivot;
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
            btnIn = root.Q<Button>("btn-in");
            btnOut = root.Q<Button>("btn-out");
            btnLearn = root.Q<Button>("btn-learn");
            btnRefund = root.Q<Button>("btn-refund");
            btnReset = root.Q<Button>("btn-reset");
            btnIn.clicked += ZoomIn;
            btnOut.clicked += ZoomOut;
            btnLearn.clicked += LearnSelected;
            btnRefund.clicked += RefundSelected;
            btnReset.clicked += ResetAll;
            viewport.RegisterCallback<WheelEvent>(OnWheel);
            // 노드 Button 이 포인터를 잡기 전에 받아야 노드 위에서 시작한 끌기도 팬이 된다
            viewport.RegisterCallback<PointerDownEvent>(OnDown, TrickleDown.TrickleDown);
            viewport.RegisterCallback<PointerMoveEvent>(OnMove, TrickleDown.TrickleDown);
            viewport.RegisterCallback<PointerUpEvent>(OnUp, TrickleDown.TrickleDown);

            progress = new SkillProgress(SkillTreeData.Parse(table != null ? table.text : SkillTreeData.DefaultTsv), totalPoints) { resetOnly = resetOnly };
            Spawn();
            progress.Changed += Refresh;
            progress.SetRanks(("base", 1), ("stride", 3), ("scan", 1), ("repair", 1));   // 웹 판 첫 화면과 같게
            zoom = zoomTarget = Mathf.Clamp(startZoom, minZoom, maxZoom);
            centerPending = true;   // 창 크기는 첫 레이아웃 뒤에 안다 (Update 에서 가운데 맞춤)
            // 지금 살 수 있는 노드의 고리가 1Hz 로 숨쉬게 — 0.5초마다 클래스를 바꾸고 USS transition 이 잇는다
            beat = world.schedule.Execute(() => world.ToggleInClassList("world--beat")).Every(500);
            nodes[selected].button.Focus();
        }

        void OnDisable()
        {
            // 컴포넌트만 껐다 켜면 UXML 트리가 남는다 — 붙인 핸들러를 떼지 않으면 두 번 걸린다
            if (btnIn != null) btnIn.clicked -= ZoomIn;
            if (btnOut != null) btnOut.clicked -= ZoomOut;
            if (btnLearn != null) btnLearn.clicked -= LearnSelected;
            if (btnRefund != null) btnRefund.clicked -= RefundSelected;
            if (btnReset != null) btnReset.clicked -= ResetAll;
            viewport?.UnregisterCallback<WheelEvent>(OnWheel);
            viewport?.UnregisterCallback<PointerDownEvent>(OnDown, TrickleDown.TrickleDown);
            viewport?.UnregisterCallback<PointerMoveEvent>(OnMove, TrickleDown.TrickleDown);
            viewport?.UnregisterCallback<PointerUpEvent>(OnUp, TrickleDown.TrickleDown);
            beat?.Pause();
            if (progress != null) progress.Changed -= Refresh;
            nodes.Clear();
        }

        /* ───── 만들기 ───── */

        Vector2 Pos(SkillNode n) => new(padX + n.col * cellX, padY + n.row * cellY);   // UI Toolkit 은 y 가 아래로 +

        static Color ColorOf(string branch) => branch switch
        {
            "harin" => new Color(0.37f, 0.9f, 0.79f),
            "sera" => new Color(0.56f, 0.72f, 1f),
            "doyun" => new Color(1f, 0.7f, 0.36f),
            _ => new Color(0.91f, 0.93f, 0.96f),
        };

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
            float maxCol = 0f, maxRow = 0f;
            foreach (SkillNode n in progress.tree.nodes)
            {
                maxCol = Mathf.Max(maxCol, n.col);
                maxRow = Mathf.Max(maxRow, n.row);
            }
            world.style.width = padX * 2f + maxCol * cellX;
            world.style.height = padY * 2f + maxRow * cellY;
            edgeLayer = new EdgeLayer();
            world.Add(edgeLayer);   // 첫 자식 = 맨 아래에 그려진다

            foreach (SkillNode n in progress.tree.nodes)
            {
                string id = n.id;
                var b = new Button(() => OnClick(id));
                b.ClearClassList();   // 기본 unity-button 모양을 떼고 우리 클래스만
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
                // 마우스 올림 · 키보드 포커스가 같은 툴팁으로 모인다
                b.RegisterCallback<FocusInEvent>(_ => SetSelected(id));
                b.RegisterCallback<PointerEnterEvent>(_ => SetSelected(id));
                b.RegisterCallback<NavigationMoveEvent>(e => OnNavigate(e, id));
                world.Add(b);
                nodes[id] = el;
            }
        }

        /* ───── 규칙은 SkillProgress, 여기서는 결과 문구만 ───── */

        void OnClick(string id)
        {
            if (dragging) return;
            SetSelected(id);
            Learn(id);
        }

        void Learn(string id) => toast.text = progress.LearnMessage(id, progress.Learn(id, scratch), scratch);
        void LearnSelected() => Learn(selected);
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
                    bool from = progress.Rank(id) > 0, to = progress.Rank(b.id) > 0;
                    EdgeLayer.State st = from && to ? EdgeLayer.State.Done : from ? EdgeLayer.State.Open : EdgeLayer.State.Idle;
                    edgeLayer.edges.Add((Pos(progress.tree.Get(id)), Pos(b), ColorOf(b.branch), st));
                }
            edgeLayer.MarkDirtyRepaint();
            points.text = $"남은 포인트 {progress.Left} / {progress.total} · 사용 {progress.Spent}";
            ShowTooltip();
        }

        void SetSelected(string id)
        {
            selected = id;
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
            world.style.translate = new Translate(pan.x, pan.y);
            world.style.scale = new Scale(new Vector2(zoom, zoom));
            var inv = new Scale(new Vector2(1f / zoom, 1f / zoom));   // 글자 · 표식은 화면 크기 그대로
            foreach (NodeEl el in nodes.Values)
            {
                el.labels.style.scale = inv;
                el.badge.style.scale = inv;
            }
            int lv = zoom < farBelow ? 0 : zoom < nearFrom ? 1 : 2;
            world.EnableInClassList("lod-far", lv == 0);
            world.EnableInClassList("lod-mid", lv == 1);
            world.EnableInClassList("lod-near", lv == 2);
            edgeLayer.zoom = zoom;
            edgeLayer.MarkDirtyRepaint();
            zoomLabel.text = $"{Mathf.RoundToInt(zoom * 100f)}%";
            lodLabel.text = LodNames[lv];
        }

        /// <summary>창 점 zoomPivot 아래의 월드 점이 제자리에 남도록 배율과 이동을 함께 바꾼다</summary>
        void ZoomTo(float z)
        {
            Vector2 w = (zoomPivot - pan) / zoom;
            zoom = z;
            pan = zoomPivot - w * zoom;
            ApplyTransform();
        }

        Vector2 ViewSize => new(viewport.resolvedStyle.width, viewport.resolvedStyle.height);

        void ZoomBy(float factor)
        {
            zoomPivot = ViewSize / 2f;
            zoomTarget = Mathf.Clamp(zoomTarget * factor, minZoom, maxZoom);
        }

        void ZoomIn() => ZoomBy(1.25f);
        void ZoomOut() => ZoomBy(0.8f);

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
                viewport.CapturePointer(dragId);   // 8px 넘게 움직이면 끌기 — 노드 Button 의 클릭을 빼앗는다
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
            viewport.schedule.Execute(() => dragging = false);   // 같은 프레임의 클릭이 습득으로 새지 않게 한 박자 뒤에
        }

        /// <summary>
        /// 방향키 · 스틱: 그 방향의 가장 가까운 노드로 (기본 포커스 이동은 화면 배치를 모른다).
        /// StopPropagation 은 부모로 가는 것만 막고, 기본 포커스 이동은 이벤트가 끝난 뒤 FocusController 가 따로 한다 —
        /// IgnoreEvent 를 함께 부르지 않으면 우리가 옮긴 뒤 한 칸 더 가서 노드를 건너뛴다
        /// </summary>
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
                float score = along + 2.5f * Mathf.Abs(v.x * d.y - v.y * d.x);
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
            Vector2 p = pan + Pos(n) * zoom, view = ViewSize;
            const float m = 150f;
            pan.x += p.x < m ? m - p.x : p.x > view.x - m ? view.x - m - p.x : 0f;
            pan.y += p.y < m ? m - p.y : p.y > view.y - m ? view.y - m - p.y : 0f;
            ApplyTransform();
        }

        void Update()
        {
            Vector2 view = ViewSize;
            if (float.IsNaN(view.x) || view.x <= 0f) return;   // 첫 레이아웃 전
            if (centerPending)
            {
                centerPending = false;
                pan = (view - new Vector2(world.resolvedStyle.width, world.resolvedStyle.height) * zoom) / 2f;
                ApplyTransform();
            }
            if (Mathf.Abs(zoom - zoomTarget) > 0.001f) ZoomTo(Mathf.Lerp(zoom, zoomTarget, 1f - Mathf.Exp(-14f * Time.unscaledDeltaTime)));
            PlaceTooltip(view);
        }

        /// <summary>노드 오른쪽 → 넘치면 왼쪽 → 창 안으로 고정. 툴팁 크기는 레이아웃이 끝난 뒤(resolvedStyle)에 읽는다</summary>
        void PlaceTooltip(Vector2 view)
        {
            float w = tooltip.resolvedStyle.width, h = tooltip.resolvedStyle.height;
            if (float.IsNaN(w) || float.IsNaN(h)) return;
            Vector2 c = pan + Pos(progress.tree.Get(selected)) * zoom;
            float r = nodeSize * zoom / 2f + 6f;
            float x = c.x + r + 18f;
            if (x + w > view.x - 8f) x = c.x - r - 18f - w;
            tooltip.style.left = Mathf.Clamp(x, 8f, Mathf.Max(8f, view.x - w - 8f));
            tooltip.style.top = Mathf.Clamp(c.y - h / 2f, 8f, Mathf.Max(8f, view.y - h - 8f));
        }
    }

    /// <summary>
    /// 연결선 레이어 — USS 로는 선을 그릴 수 없어 generateVisualContent + Painter2D. #world 안에 있어 함께 확대되므로
    /// 선 굵기를 배율로 나눠 화면 굵기를 지킨다. 입력을 가로막지 않게 picking-mode Ignore.
    /// </summary>
    public class EdgeLayer : VisualElement
    {
        public enum State { Idle, Open, Done }

        public readonly List<(Vector2 a, Vector2 b, Color color, State state)> edges = new();
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
            // 흐린 선부터 그려 습득한 길이 위에 오게
            for (int pass = 0; pass < 3; pass++)
                foreach ((Vector2 a, Vector2 b, Color color, State s) in edges)
                {
                    if ((int)s != pass) continue;
                    p.strokeColor = s == State.Done ? color : s == State.Open ? new Color(color.r, color.g, color.b, 0.6f) : new Color(0.18f, 0.29f, 0.4f);
                    p.lineWidth = (s == State.Done ? 8f : s == State.Open ? 5f : 4f) / Mathf.Max(0.1f, zoom);
                    p.BeginPath();
                    p.MoveTo(a);
                    p.LineTo(b);
                    p.Stroke();
                }
        }
    }
}
