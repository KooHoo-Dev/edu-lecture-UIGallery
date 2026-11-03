// 스킬트리 화면 (UGUI) — 표(TSV)를 읽어 노드 Button 과 연결선 Image 를 만들고, 팬(ScrollRect) · 줌(Content.localScale) ·
// 확대 단계별 정보 · 툴팁 · 포인트를 맡는다. ScrollRect 와 같은 오브젝트에 붙인다 (휠 이벤트를 받아 확대에 쓴다).
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
        [Header("데이터 — 비우면 SkillTreeData.DefaultTsv (웹 판과 같은 표)")]
        [SerializeField] TextAsset table;
        [SerializeField] int totalPoints = 14;
        [SerializeField] bool resetOnly;

        [Header("배치 (1920×1080 기준, 웹 판과 같은 값)")]
        [SerializeField] float cellX = 200f, cellY = 190f, padX = 120f, padY = 100f, nodeSize = 96f;

        [Header("확대")]
        [SerializeField] float minZoom = 0.4f, maxZoom = 1.6f, farBelow = 0.65f, nearFrom = 1f, startZoom = 0.75f;
        [Tooltip("끄면 나쁜 예: 글자도 트리와 함께 작아진다")]
        [SerializeField] bool keepTextSize = true;

        [Header("프리팹 · 참조")]
        [SerializeField] SkillNodeView nodePrefab;
        [SerializeField] Image edgePrefab;          // 가로로 긴 흰 Image (피벗 왼쪽 가운데는 코드가 정한다)
        [SerializeField] RectTransform edgeLayer;   // Content 의 첫 자식 — 선이 노드 아래에
        [SerializeField] RectTransform nodeLayer;
        [Tooltip("스프라이트 이름을 표의 icon 열과 같게 (badge, boot, scan …)")]
        [SerializeField] Sprite[] icons;
        [SerializeField] Color harin = new(0.37f, 0.9f, 0.79f), sera = new(0.56f, 0.72f, 1f), doyun = new(1f, 0.7f, 0.36f), core = new(0.91f, 0.93f, 0.96f);
        [SerializeField] RectTransform tooltip;     // Viewport 의 형제 (마스크 밖 · 확대 안 됨)
        [SerializeField] TMP_Text tipTitle, tipBody, pointsText, zoomText, toastText;

        static readonly Color EdgeIdle = new(0.18f, 0.29f, 0.4f);

        public SkillProgress Progress { get; private set; }
        public SkillNodeView Selected { get; private set; }
        ScrollRect scroll;
        readonly Dictionary<string, SkillNodeView> views = new();
        readonly List<(SkillNode a, SkillNode b, Image img)> edges = new();
        readonly List<string> scratch = new();
        float zoom = 1f, zoomTarget = 1f;
        Vector2 zoomPivot;   // 확대 기준점 (Viewport 로컬)
        int level = -1;

        void Awake()
        {
            scroll = GetComponent<ScrollRect>();
            scroll.scrollSensitivity = 0f;   // 휠은 스크롤이 아니라 확대에 쓴다
        }

        void Start()
        {
            SkillTreeData data = SkillTreeData.Parse(table != null ? table.text : SkillTreeData.DefaultTsv);
            Progress = new SkillProgress(data, totalPoints) { resetOnly = resetOnly };
            Spawn();
            Progress.Changed += Refresh;
            Progress.SetRanks(("base", 1), ("stride", 3), ("scan", 1), ("repair", 1));
            zoomPivot = scroll.viewport.rect.center;
            zoomTarget = Mathf.Clamp(startZoom, minZoom, maxZoom);
            ApplyZoom(zoomTarget);
            Select(views["scan"]);
        }

        /* ───── 배치 ───── */

        /// <summary>Content 왼쪽 위 기준 좌표 (UGUI 는 y 가 위로 + 라 아래는 음수)</summary>
        Vector2 Pos(SkillNode n) => new(padX + n.col * cellX, -(padY + n.row * cellY));

        void Spawn()
        {
            float maxCol = 0f, maxRow = 0f;
            foreach (SkillNode n in Progress.tree.nodes)
            {
                maxCol = Mathf.Max(maxCol, n.col);
                maxRow = Mathf.Max(maxRow, n.row);
            }
            RectTransform content = scroll.content;
            content.anchorMin = content.anchorMax = content.pivot = new Vector2(0f, 1f);
            content.sizeDelta = new Vector2(padX * 2f + maxCol * cellX, padY * 2f + maxRow * cellY);

            foreach (SkillNode b in Progress.tree.nodes)
                foreach (string id in b.req)
                {
                    SkillNode a = Progress.tree.Get(id);
                    Image img = Instantiate(edgePrefab, edgeLayer);
                    PlaceEdge(img.rectTransform, Pos(a), Pos(b));
                    img.raycastTarget = false;
                    edges.Add((a, b, img));
                }

            foreach (SkillNode n in Progress.tree.nodes)
            {
                SkillNodeView v = Instantiate(nodePrefab, nodeLayer);
                var rt = (RectTransform)v.transform;
                rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
                rt.anchoredPosition = Pos(n);
                rt.sizeDelta = Vector2.one * nodeSize;
                v.Bind(n, System.Array.Find(icons ?? new Sprite[0], s => s != null && s.name == n.icon), ColorOf(n.branch), OnClick, OnFocus);
                views[n.id] = v;
            }
        }

        Color ColorOf(string branch) => branch switch { "harin" => harin, "sera" => sera, "doyun" => doyun, _ => core };

        /// <summary>두 점을 잇는 Image: 피벗을 왼쪽 가운데에 두고 길이만큼 늘린 뒤 각도만큼 돌린다 (분기 경로 맵과 같은 방식)</summary>
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

        void OnFocus(SkillNodeView v)
        {
            Selected = v;
            ShowTooltip();
            EnsureVisible(v);
        }

        public void Select(SkillNodeView v)
        {
            // Unity 객체에는 ?. 를 쓰지 않는다 (파괴된 객체의 == null 재정의를 건너뛴다)
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(v.gameObject);
            else OnFocus(v);
        }

        public void Learn(string id) => Say(Progress.LearnMessage(id, Progress.Learn(id, scratch), scratch));

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
                bool from = Progress.Rank(a.id) > 0, to = Progress.Rank(b.id) > 0;
                Color c = ColorOf(b.branch);
                // 습득한 길 = 굵은 갈래 색, 다음에 갈 수 있는 길 = 갈래 색, 아직 먼 길 = 흐린 선
                img.color = from && to ? c : from ? new Color(c.r, c.g, c.b, 0.6f) : EdgeIdle;
                img.rectTransform.sizeDelta = new Vector2(img.rectTransform.sizeDelta.x, from && to ? 8f : 5f);
            }
            if (pointsText != null) pointsText.text = $"남은 포인트 <size=150%>{Progress.Left}</size> / {Progress.total} · 사용 {Progress.Spent}";
            ShowTooltip();
        }

        void ShowTooltip()
        {
            if (Selected == null || tooltip == null) return;
            tipTitle.text = Progress.TooltipTitle(Selected.Node.id);
            tipBody.text = Progress.TooltipBody(Selected.Node.id);
            PlaceTooltip();
        }

        /// <summary>노드 오른쪽 → 넘치면 왼쪽 → 그래도 넘치면 창 안으로 고정. 크기는 레이아웃을 강제로 끝낸 뒤 읽는다</summary>
        void PlaceTooltip()
        {
            LayoutRebuilder.ForceRebuildLayoutImmediate(tooltip);
            var parent = (RectTransform)tooltip.parent;
            var corners = new Vector3[4];
            ((RectTransform)Selected.transform).GetWorldCorners(corners);
            Vector2 min = parent.InverseTransformPoint(corners[0]), max = parent.InverseTransformPoint(corners[2]);
            Rect area = parent.rect;
            Vector2 size = tooltip.rect.size;
            const float gap = 18f;
            float x = max.x + gap;
            if (x + size.x > area.xMax) x = min.x - gap - size.x;
            x = Mathf.Clamp(x, area.xMin, area.xMax - size.x);
            float y = Mathf.Clamp((min.y + max.y) / 2f + size.y / 2f, area.yMin + size.y, area.yMax);
            tooltip.pivot = new Vector2(0f, 1f);
            tooltip.localPosition = new Vector3(x, y, 0f);
        }

        /* ───── 줌: Content.localScale, 기준점 아래의 트리 지점이 제자리에 남게 ───── */

        public void OnScroll(PointerEventData e)
        {
            if (Mathf.Approximately(e.scrollDelta.y, 0f)) return;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(scroll.viewport, e.position, e.enterEventCamera, out Vector2 p);
            zoomPivot = p;
            zoomTarget = Mathf.Clamp(zoomTarget * (e.scrollDelta.y > 0f ? 1.15f : 1f / 1.15f), minZoom, maxZoom);
            ApplyZoom(zoomTarget);   // 휠은 칸마다 즉시
        }

        /// <summary>버튼 · 키 · 패드 (창 가운데 기준, Update 가 부드럽게 따라간다)</summary>
        public void ZoomBy(float factor)
        {
            zoomPivot = scroll.viewport.rect.center;
            zoomTarget = Mathf.Clamp(zoomTarget * factor, minZoom, maxZoom);
        }

        public void Fit()
        {
            Vector2 view = scroll.viewport.rect.size, size = scroll.content.sizeDelta;
            ZoomBy(Mathf.Min(view.x / size.x, view.y / size.y) / zoomTarget);
        }

        void Update()
        {
            if (Mathf.Abs(zoom - zoomTarget) > 0.001f)
                ApplyZoom(Mathf.Lerp(zoom, zoomTarget, 1f - Mathf.Exp(-14f * Time.unscaledDeltaTime)));
        }

        void ApplyZoom(float z)
        {
            RectTransform content = scroll.content;
            Vector2 before = ViewportToContent(zoomPivot);
            content.localScale = new Vector3(z, z, 1f);
            Vector2 after = ViewportToContent(zoomPivot);
            content.anchoredPosition += (after - before) * z;   // 기준점 아래 지점을 되돌려 놓는다
            zoom = z;
            int lv = z < farBelow ? 0 : z < nearFrom ? 1 : 2;
            foreach (SkillNodeView v in views.Values) v.ApplyZoom(z, lv, keepTextSize);   // 역수 스케일은 매번, 켜고 끄기는 단계가 바뀔 때 효과가 있다
            level = lv;
            if (zoomText != null) zoomText.text = $"{Mathf.RoundToInt(z * 100f)}% · {(keepTextSize ? new[] { "아이콘 + 표식", "+ 단계", "+ 이름 · 수치" }[level] : "글자도 축소")}";
            if (Selected != null) PlaceTooltip();
        }

        Vector2 ViewportToContent(Vector2 p) => scroll.content.InverseTransformPoint(scroll.viewport.TransformPoint(p));

        /// <summary>키보드 · 패드로 고른 노드가 창 밖이면 들어올 만큼 Content 를 옮긴다 (ScrollRect 는 선택을 따라가지 않는다)</summary>
        void EnsureVisible(SkillNodeView v)
        {
            Vector2 p = scroll.viewport.InverseTransformPoint(v.transform.position);
            Rect r = scroll.viewport.rect;
            const float m = 150f;
            float dx = p.x < r.xMin + m ? r.xMin + m - p.x : p.x > r.xMax - m ? r.xMax - m - p.x : 0f;
            float dy = p.y < r.yMin + m ? r.yMin + m - p.y : p.y > r.yMax - m ? r.yMax - m - p.y : 0f;
            if (dx == 0f && dy == 0f) return;
            scroll.velocity = Vector2.zero;
            scroll.content.anchoredPosition += new Vector2(dx, dy);
        }
    }
}
