// 스킬트리 화면 (UGUI) — 표(TSV)로 노드 Button 과 연결선 Image 를 만들고, 팬(ScrollRect) · 줌(Content.localScale) ·
// 확대 단계별 정보 · 툴팁 · 포인트를 맡는다. ScrollRect 와 같은 오브젝트에 붙인다 (휠을 받아 확대에 쓴다).
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.SkillTree
{
    [RequireComponent(typeof(ScrollRect))]
    public class SkillTreeView : MonoBehaviour, IScrollHandler
    {
        [SerializeField] TextAsset table;   // 비우면 DefaultTsv (웹과 같은 표 · 시작 상태)
        [SerializeField] int totalPoints = 14;
        [SerializeField] bool resetOnly;
        [SerializeField] float cellX = 200f, cellY = 190f, padX = 120f, padY = 100f, nodeSize = 96f;
        [SerializeField] float minZoom = 0.4f, maxZoom = 1.6f, farBelow = 0.65f, nearFrom = 1f, startZoom = 0.75f;
        [Tooltip("끄면 나쁜 예: 글자도 트리와 함께 작아진다")]
        [SerializeField] bool keepTextSize = true;
        [SerializeField] SkillNodeView nodePrefab;
        [SerializeField] Image edgePrefab;
        [Tooltip("점선 스프라이트 (Wrap Repeat, 선택)")]
        [SerializeField] Sprite dashSprite;
        [SerializeField] RectTransform edgeLayer;   // Content 의 첫 자식 — 선이 노드 아래에
        [SerializeField] RectTransform nodeLayer;
        [Tooltip("스프라이트 이름 = 표의 icon 열")]
        [SerializeField] Sprite[] icons;
        [SerializeField] RectTransform tooltip;     // Viewport 의 형제 (마스크 밖 · 확대 안 됨)
        [SerializeField] TMP_Text tipTitle, tipBody, pointsText, zoomText, toastText;

        static readonly Color EdgeIdle = new(0.18f, 0.29f, 0.4f), NeedRed = new(1f, 0.42f, 0.49f);
        static readonly float[] EdgeWidth = { 4f, 4f, 5f, 7f, 6f };   // EdgeState 순서 (웹과 같은 굵기)

        public SkillProgress Progress { get; private set; }
        public SkillNodeView Selected { get; private set; }
        ScrollRect scroll;
        readonly Dictionary<string, SkillNodeView> views = new();
        readonly List<(SkillNode a, SkillNode b, Image img)> edges = new();
        readonly List<string> scratch = new();
        float zoom = 1f, zoomTarget = 1f;
        Vector2 zoomPivot, lastPan;   // 확대 기준점 (창 왼쪽 위 기준, y 아래로 +)
        bool hovering, recenter;

        void Awake()
        {
            scroll = GetComponent<ScrollRect>();
            scroll.scrollSensitivity = 0f;   // 휠은 확대에
            scroll.movementType = ScrollRect.MovementType.Unrestricted;   // 범위는 LateUpdate 에서 직접 고정
        }

        void Start()
        {
            SkillTreeData data = SkillTreeData.Parse(table != null ? table.text : SkillTreeData.DefaultTsv);
            Progress = new SkillProgress(data, totalPoints) { resetOnly = resetOnly };
            Spawn();
            Progress.Changed += Refresh;
            Progress.Replay(table == null ? SkillTreeData.DemoStart : new string[0]);
            zoom = zoomTarget = Mathf.Clamp(startZoom, minZoom, maxZoom);
            scroll.content.localScale = new Vector3(zoom, zoom, 1f);
            SkillNodeView first = views[data.FirstId(table == null)];
            Pan = TreeMath.Center(zoom, Size, View);
            Pan += TreeMath.Inside(ViewPos(first), View);   // 첫 선택이 창 밖이면 툴팁이 숨는다
            ApplyZoom(zoom);
            Select(first);
        }

        /* ───── 배치 — 좌표는 왼쪽 위 기준, y 아래로 + (웹 · UI Toolkit 과 같다) ───── */

        Vector2 World(SkillNode n) => new(padX + n.col * cellX, padY + n.row * cellY);
        static Vector2 Up(Vector2 p) => new(p.x, -p.y);   // anchoredPosition 은 y 가 위로 +
        Vector2 Size => scroll.content.sizeDelta;
        Vector2 View => scroll.viewport.rect.size;
        Vector2 Pan
        {
            get => Up(scroll.content.anchoredPosition);
            set => scroll.content.anchoredPosition = Up(value);
        }
        Vector2 ViewPos(SkillNodeView v) => Pan + World(v.Node) * zoom;

        void Spawn()
        {
            RectTransform content = scroll.content;
            content.anchorMin = content.anchorMax = content.pivot = new Vector2(0f, 1f);
            content.sizeDelta = new Vector2(padX * 2f, padY * 2f) + Vector2.Scale(Progress.tree.extent, new Vector2(cellX, cellY));

            foreach (SkillNode b in Progress.tree.nodes)
                foreach (string id in b.req)
                {
                    SkillNode a = Progress.tree.Get(id);
                    Image img = Instantiate(edgePrefab, edgeLayer);
                    PlaceEdge(img.rectTransform, Up(World(a)), Up(World(b)));
                    img.raycastTarget = false;
                    edges.Add((a, b, img));
                }

            foreach (SkillNode n in Progress.tree.nodes)
            {
                SkillNodeView v = Instantiate(nodePrefab, nodeLayer);
                var rt = (RectTransform)v.transform;
                rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
                rt.anchoredPosition = Up(World(n));
                rt.sizeDelta = Vector2.one * nodeSize;
                v.Bind(n, System.Array.Find(icons ?? new Sprite[0], s => s != null && s.name == n.icon), TreeMath.BranchColor(n.branch), OnClick, OnFocus, OnHover);
                views[n.id] = v;
            }
        }

        static void PlaceEdge(RectTransform rt, Vector2 a, Vector2 b)
        {
            Vector2 d = b - a;
            rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 0.5f);
            rt.anchoredPosition = a;
            rt.sizeDelta = new Vector2(d.magnitude, 6f);
            rt.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
        }

        /* ───── 습득 · 되돌리기 · 초기화 (판정은 SkillProgress) ───── */

        void OnClick(SkillNodeView v)
        {
            Select(v);
            Learn(v.Node.id);
        }

        /// <summary>선택 → 툴팁 + 창 밖이면 따라간다. 마우스 올림(hovering)은 지도를 옮기지 않는다</summary>
        void OnFocus(SkillNodeView v)
        {
            bool changed = Selected != v;
            Selected = v;
            if (changed) Progress.ClearNeed();
            ShowTooltip();
            if (!hovering) EnsureVisible(v);
        }

        /// <summary>마우스 올림 — 선택도 옮겨 Enter · Backspace · 버튼이 같은 노드에 작동한다</summary>
        void OnHover(SkillNodeView v)
        {
            hovering = true;
            Select(v);
            hovering = false;
        }

        public void Select(SkillNodeView v)
        {
            // Unity 객체에는 ?. 를 쓰지 않는다 (파괴된 객체의 == null 재정의를 건너뛴다)
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(v.gameObject);
            if (Selected != v) OnFocus(v);
        }

        public void Learn(string id) => Say(Progress.LearnMessage(id, Progress.Learn(id)));

        public void Refund(string id)
        {
            if (Progress.tree.Has(id)) Say(Progress.RefundMessage(id, Progress.Refund(id, scratch), scratch));
        }

        /* 버튼 OnClick 에 연결하는 공개 함수 (UnityEvent 는 매개변수 하나까지) */
        public void LearnSelected() { if (Selected != null) Learn(Selected.Node.id); }
        public void RefundSelected() { if (Selected != null) Refund(Selected.Node.id); }
        public void ResetAll() => Say($"전체 초기화 — 포인트 {Progress.ResetAll()} 환불");

        /// <summary>살 수 있는 노드 하나를 골라 습득 (시험 입력 · 자동 데모). 없으면 false</summary>
        public bool LearnAny()
        {
            string id = Progress.FirstLearnable();
            if (id == null) return false;
            Select(views[id]);
            Learn(id);
            return true;
        }

        void Say(string text)
        {
            if (toastText != null) toastText.text = text;
        }

        /* ───── 그리기 ───── */

        void Refresh()
        {
            foreach (SkillNodeView v in views.Values)
                v.SetState(Progress.StateOf(v.Node), Progress.RankLabel(v.Node), Progress.NextLabel(v.Node), Progress.CheckLearn(v.Node.id) == LearnResult.Ok);
            foreach ((SkillNode a, SkillNode b, Image img) in edges)
            {
                // 색 + 굵기 + 점선 (습득 · 반쯤 열림만 실선)
                EdgeState st = Progress.EdgeOf(a, b);
                Color c = TreeMath.BranchColor(b.branch);
                img.color = st == EdgeState.Need ? NeedRed : st == EdgeState.Locked ? EdgeIdle : st == EdgeState.Half ? new Color(c.r, c.g, c.b, 0.45f) : c;
                bool dash = dashSprite != null && st != EdgeState.Done && st != EdgeState.Half;
                img.sprite = dash ? dashSprite : edgePrefab.sprite;
                img.type = dash ? Image.Type.Tiled : Image.Type.Simple;
                img.rectTransform.sizeDelta = new Vector2(img.rectTransform.sizeDelta.x, EdgeWidth[(int)st]);
            }
            if (pointsText != null) pointsText.text = $"남은 포인트 <size=150%>{Progress.Left}</size> / {Progress.total} · 사용 {Progress.Spent}";
            ShowTooltip();
        }

        void ShowTooltip()
        {
            if (Selected == null || tooltip == null) return;
            tipTitle.text = Progress.TooltipTitle(Selected.Node.id);
            tipBody.text = Progress.TooltipBody(Selected.Node.id);
            LayoutRebuilder.ForceRebuildLayoutImmediate(tooltip);   // 크기는 레이아웃을 끝낸 뒤 읽는다
            PlaceTooltip();
        }

        /// <summary>UI Toolkit 과 같은 배치 (TreeMath.Beside). Viewport 가 TreeScroll 을 꽉 채운다고 본다</summary>
        void PlaceTooltip()
        {
            tooltip.anchorMin = tooltip.anchorMax = tooltip.pivot = new Vector2(0f, 1f);
            tooltip.anchoredPosition = Up(TreeMath.Beside(ViewPos(Selected), nodeSize * zoom / 2f + 6f, tooltip.rect.size, View));
        }

        /* ───── 줌: Content.localScale, 기준점 아래의 트리 지점이 제자리에 남게 ───── */

        public void OnScroll(PointerEventData e)
        {
            if (Mathf.Approximately(e.scrollDelta.y, 0f)) return;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(scroll.viewport, e.position, e.enterEventCamera, out Vector2 p);
            Rect r = scroll.viewport.rect;
            zoomPivot = new Vector2(p.x - r.xMin, r.yMax - p.y);   // 창 왼쪽 위 기준으로
            zoomTarget = Mathf.Clamp(zoomTarget * (e.scrollDelta.y > 0f ? 1.15f : 1f / 1.15f), minZoom, maxZoom);
            ApplyZoom(zoomTarget);   // 휠은 칸마다 즉시
        }

        /// <summary>버튼 · 키 · 패드 (창 가운데 기준, Update 가 부드럽게 따라간다)</summary>
        public void ZoomBy(float factor)
        {
            zoomPivot = View / 2f;
            zoomTarget = Mathf.Clamp(zoomTarget * factor, minZoom, maxZoom);
            recenter = false;
        }

        public void Fit()
        {
            ZoomBy(Mathf.Min(View.x / Size.x, View.y / Size.y) / zoomTarget);
            recenter = true;
        }

        void Update()
        {
            float k = 1f - Mathf.Exp(-14f * Time.unscaledDeltaTime);
            if (Mathf.Abs(zoom - zoomTarget) > 0.001f) ApplyZoom(Mathf.Lerp(zoom, zoomTarget, k));
            if (!recenter) return;
            recenter = Mathf.Abs(zoom - zoomTarget) > 0.001f;
            Vector2 c = TreeMath.Center(zoom, Size, View);
            Pan = recenter ? Vector2.Lerp(Pan, c, k) : c;
        }

        /// <summary>Clamped 대신 직접 고정 (웹 panRange). 끌기 관성도 여기서 멈춘다</summary>
        void LateUpdate()
        {
            Vector2 p = Pan, c = TreeMath.Clamp(p, zoom, Size, View);
            if (c != p)
            {
                Pan = c;
                scroll.velocity = Vector2.zero;
            }
            if (Pan == lastPan || Selected == null || tooltip == null) return;
            lastPan = Pan;
            PlaceTooltip();   // 끌기 · 관성으로 움직이면 툴팁도 따라간다
        }

        void ApplyZoom(float z)
        {
            Pan = TreeMath.ZoomPan(Pan, zoom, z, zoomPivot);
            scroll.content.localScale = new Vector3(z, z, 1f);
            zoom = z;
            int lv = TreeMath.Level(z, farBelow, nearFrom);
            foreach (SkillNodeView v in views.Values) v.ApplyZoom(z, lv, keepTextSize);
            if (zoomText != null) zoomText.text = $"{Mathf.RoundToInt(z * 100f)}% · {(keepTextSize ? TreeMath.LevelNames[lv] : "글자도 축소")}";
            if (Selected != null && tooltip != null) PlaceTooltip();
        }

        /// <summary>고른 노드가 창 밖이면 들어올 만큼 옮긴다 (ScrollRect 는 선택을 따라가지 않는다)</summary>
        void EnsureVisible(SkillNodeView v)
        {
            Vector2 d = TreeMath.Inside(ViewPos(v), View);
            if (d == Vector2.zero) return;
            scroll.velocity = Vector2.zero;
            Pan += d;
        }
    }
}
