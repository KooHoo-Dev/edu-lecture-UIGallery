// 분기 경로 맵 (UGUI) — RouteMapData 를 노드 Button 과 간선 Image 로 그리고, 이동 · 범례 강조 · 스크롤 따라가기 · 저장을 맡는다.
// ScrollRect 와 같은 오브젝트에 붙인다 (끌기 · 휠 이벤트를 함께 받아 사람이 스크롤하면 따라가기를 멈춘다).
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.BranchingRouteMap
{
    [RequireComponent(typeof(ScrollRect))]
    public class RouteMapView : MonoBehaviour, IBeginDragHandler, IScrollHandler
    {
        [Serializable]
        public class LegendEntry
        {
            public NodeKind kind;
            public Button button;
            public TMP_Text count;
        }

        [Header("생성 입력 — 같은 값이면 웹 판과 같은 지도")]
        [SerializeField] int seed = 7;
        [SerializeField, Range(8, 16)] int floors = 12;
        [SerializeField, Range(3, 7)] int cols = 7;
        [SerializeField, Range(2, 6)] int paths = 5;
        [SerializeField] MapMix mix = MapMix.Balanced;
        [SerializeField] bool preventCross = true;

        [Header("배치 (Canvas Scaler 1080×1920 기준, y 는 위에서 아래로 잰다)")]
        [SerializeField] float colWidth = 135f;
        [SerializeField] float rowHeight = 150f;
        [SerializeField] float padTop = 250f;
        [SerializeField] float padBottom = 150f;
        [SerializeField] float nodeSize = 80f;

        [Header("프리팹 · 참조")]
        [SerializeField] RouteNodeView nodePrefab;
        [SerializeField] Image edgePrefab;        // 가로로 긴 흰 Image (Raycast Target 끔). 점선은 Tiled 스프라이트로
        [SerializeField] RectTransform edgeLayer;  // content 의 첫 자식 — 간선이 노드 아래에 그려지게
        [SerializeField] RectTransform nodeLayer;
        [Tooltip("NodeKind 순서: 교전 · 강적 · 정비 · 보급 · 회수 · 미확인 신호 · 최종 목표")]
        [SerializeField] Sprite[] icons = new Sprite[7];
        [SerializeField] Color[] colors =
        {
            new(1f, 0.6f, 0.42f), new(1f, 0.33f, 0.44f), new(0.37f, 0.9f, 0.79f), new(1f, 0.82f, 0.4f),
            new(0.73f, 0.65f, 1f), new(0.49f, 0.78f, 1f), Color.white,
        };
        [SerializeField] List<LegendEntry> legend = new();
        [SerializeField] TMP_Text seedLabel, hereLabel, jsonLabel;

        [Header("따라가기")]
        [SerializeField] bool followScroll = true;
        [SerializeField] float followSpeed = 5f;

        const string SaveKey = "UIGallery.BranchingRouteMap.Run";
        static readonly string[] KindNames = { "교전", "강적", "정비", "보급", "회수", "미확인 신호", "최종 목표" };
        static readonly Color EdgeIdle = new(0.3f, 0.42f, 0.55f), EdgeNext = new(0.37f, 0.9f, 0.79f);

        public RouteMapData Map { get; private set; }
        readonly List<int> path = new();
        public IReadOnlyList<int> Path => path;

        ScrollRect scroll;
        readonly Dictionary<int, RouteNodeView> views = new();
        readonly List<(MapNode a, MapNode b, Image img)> edges = new();
        NodeKind? hover, pinned;
        bool following;

        float ContentHeight => padTop + (floors - 1) * rowHeight + padBottom;

        void Awake() => scroll = GetComponent<ScrollRect>();

        void Start()
        {
            SetupLegend();
            Build(seed);
        }

        /* ───── 생성 · 배치 ───── */

        public void Build(int newSeed)
        {
            seed = newSeed;
            Map = RouteMapData.Generate(seed, floors, cols, paths, mix, preventCross);
            path.Clear();
            Spawn();
            Refresh(false, true);
            following = true;
            Debug.Log($"[경로 맵] 시드 {seed} · 지문 {Map.print} — 웹 판에서 같은 값을 넣으면 같은 지문이 나온다");
        }

        public void NewMap() => Build(seed + 1);

        public void Restart()
        {
            path.Clear();
            Refresh(false, true);
            following = true;
        }

        /// <summary>content 왼쪽 위 기준 좌표 (UGUI 는 y 가 위로 + 라 아래 방향은 음수)</summary>
        Vector2 Pos(MapNode n)
        {
            bool goal = n.kind == NodeKind.Goal;
            float x = goal ? Map.cols * colWidth / 2f : (n.col + 0.5f + n.jx * 0.5f) * colWidth;
            float y = goal ? 105f : ContentHeight - padBottom - (n.floor + n.jy * 0.36f) * rowHeight;
            return new Vector2(x, -y);
        }

        void Spawn()
        {
            foreach (Transform t in edgeLayer) Destroy(t.gameObject);
            foreach (Transform t in nodeLayer) Destroy(t.gameObject);
            views.Clear();
            edges.Clear();
            scroll.content.sizeDelta = new Vector2(Map.cols * colWidth, ContentHeight);

            foreach (MapNode a in Map.nodes)
                foreach (int id in a.next)
                {
                    MapNode b = Map.Get(id);
                    Image img = Instantiate(edgePrefab, edgeLayer);
                    PlaceEdge(img.rectTransform, Pos(a), Pos(b));
                    img.raycastTarget = false;
                    edges.Add((a, b, img));
                }

            foreach (MapNode n in Map.nodes)
            {
                RouteNodeView v = Instantiate(nodePrefab, nodeLayer);
                var rt = (RectTransform)v.transform;
                rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
                rt.anchoredPosition = Pos(n);
                rt.sizeDelta = Vector2.one * (n.kind == NodeKind.Goal ? nodeSize * 1.7f : nodeSize);
                v.Bind(n, icons[(int)n.kind], colors[(int)n.kind], KindNames[(int)n.kind], MoveTo);
                views[n.id] = v;
            }

            foreach (LegendEntry e in legend)
                if (e.count != null) e.count.text = Map.nodes.FindAll(n => n.kind == e.kind).Count.ToString();
        }

        /// <summary>두 점을 잇는 Image: 피벗을 왼쪽 가운데에 두고 길이만큼 늘린 뒤 각도만큼 돌린다</summary>
        static void PlaceEdge(RectTransform rt, Vector2 a, Vector2 b)
        {
            Vector2 d = b - a;
            rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 0.5f);
            rt.anchoredPosition = a;
            rt.sizeDelta = new Vector2(d.magnitude, rt.sizeDelta.y);
            rt.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
        }

        /* ───── 이동 ───── */

        public void MoveTo(int id)
        {
            if (!Map.Reachable(path).Contains(id)) return;   // interactable 이 꺼져 있어 보통은 오지 않는다
            path.Add(id);
            following = followScroll;
            Refresh(true, true);
        }

        /// <summary>자동 선택 — 웹 판 autoChoice 와 같은 규칙 (같은 지도면 같은 길)</summary>
        public void StepAuto()
        {
            List<int> r = Map.Reachable(path);
            if (r.Count == 0) NewMap();
            else MoveTo(r[(path.Count * 3 + seed) % r.Count]);
        }

        /* ───── 그리기 ───── */

        /// <summary>select = 첫 번째 갈 수 있는 노드에 포커스 (이동 · 새 지도 때만. 범례 강조 중에 부르면 범례 포커스를 빼앗는다)</summary>
        void Refresh(bool animate, bool select = false)
        {
            List<int> reach = Map.Reachable(path);
            MapNode cur = path.Count > 0 ? Map.Get(path[^1]) : null;
            int curFloor = cur != null ? cur.floor : -1;
            var visited = new HashSet<int>(path);
            NodeKind? hl = hover ?? pinned;

            foreach (RouteNodeView v in views.Values)
            {
                MapNode n = v.Node;
                bool can = reach.Contains(n.id);
                NodeState s = visited.Contains(n.id) ? (n == cur ? NodeState.Current : NodeState.Visited)
                    : can ? NodeState.Next
                    : n.floor <= curFloor ? NodeState.Past : NodeState.Idle;
                v.Button.interactable = can;   // 갈 수 있는 노드만 누를 수 있다
                v.Button.navigation = new Navigation { mode = Navigation.Mode.None };
                v.SetState(s, hl == n.kind, hl.HasValue && hl != n.kind, animate);
            }

            foreach ((MapNode a, MapNode b, Image img) in edges)
            {
                int ia = path.IndexOf(a.id);
                bool trail = ia >= 0 && ia + 1 < path.Count && path[ia + 1] == b.id;
                bool next = cur == a && reach.Contains(b.id);
                img.color = trail ? Color.white : next ? EdgeNext : new Color(EdgeIdle.r, EdgeIdle.g, EdgeIdle.b, b.floor <= curFloor ? 0.25f : 1f);
                var rt = img.rectTransform;
                rt.sizeDelta = new Vector2(rt.sizeDelta.x, trail ? 8f : next ? 6f : 4f);
            }

            // 키보드 · 패드: 갈 수 있는 노드끼리만 좌우로 잇는다 (자동 Navigation 은 못 가는 노드로도 간다)
            List<RouteNodeView> list = reach.ConvertAll(id => views[id]);
            list.Sort((x, y) => x.Node.col.CompareTo(y.Node.col));
            for (int i = 0; i < list.Count; i++)
                list[i].Button.navigation = new Navigation
                {
                    mode = Navigation.Mode.Explicit,
                    selectOnLeft = i > 0 ? list[i - 1].Button : null,
                    selectOnRight = i < list.Count - 1 ? list[i + 1].Button : null,
                };
            if (select && EventSystem.current != null && list.Count > 0) EventSystem.current.SetSelectedGameObject(list[0].gameObject);

            if (seedLabel != null) seedLabel.text = $"시드 {seed} · 지문 {Map.print}";
            if (hereLabel != null)
                hereLabel.text = cur == null ? "출발 전 — 0층 노드를 고른다" : $"{KindNames[(int)cur.kind]} · {Mathf.Min(cur.floor + 1, floors)}층 / {floors}층";
        }

        /* ───── 스크롤 따라가기 ───── */

        void LateUpdate()
        {
            if (!following || Map == null) return;
            float viewH = scroll.viewport.rect.height;
            float maxTop = Mathf.Max(0f, ContentHeight - viewH);
            MapNode cur = path.Count > 0 ? Map.Get(path[^1]) : null;
            float y = cur != null ? -Pos(cur).y : ContentHeight - padBottom + 92f;
            float top = Mathf.Clamp(y - viewH * 0.66f, 0f, maxTop);   // 현재 위치를 창 아래쪽 2/3 지점에
            float target = maxTop > 0f ? 1f - top / maxTop : 1f;      // verticalNormalizedPosition: 1 = 맨 위
            scroll.velocity = Vector2.zero;
            float v = Mathf.Lerp(scroll.verticalNormalizedPosition, target, 1f - Mathf.Exp(-followSpeed * Time.unscaledDeltaTime));
            if (Mathf.Abs(v - target) < 0.0005f)
            {
                v = target;
                following = false;
            }
            scroll.verticalNormalizedPosition = v;
        }

        // 사람이 끌거나 휠을 굴리면 따라가기를 멈춘다 (다음 이동 때 다시)
        public void OnBeginDrag(PointerEventData e) => following = false;
        public void OnScroll(PointerEventData e) => following = false;

        /* ───── 범례 강조 ───── */

        void SetupLegend()
        {
            foreach (LegendEntry e in legend)
            {
                NodeKind kind = e.kind;
                EventTrigger trig = e.button.gameObject.AddComponent<EventTrigger>();
                void On(EventTriggerType type, Action act)
                {
                    var entry = new EventTrigger.Entry { eventID = type };
                    entry.callback.AddListener(_ => act());
                    trig.triggers.Add(entry);
                }
                // 마우스를 올려도, 키보드 · 패드 포커스를 두어도 같은 강조
                On(EventTriggerType.PointerEnter, () => SetHover(kind));
                On(EventTriggerType.Select, () => SetHover(kind));
                On(EventTriggerType.PointerExit, () => SetHover(null));
                On(EventTriggerType.Deselect, () => SetHover(null));
                e.button.onClick.AddListener(() =>
                {
                    pinned = pinned == kind ? null : kind;
                    Refresh(true);
                });
            }
        }

        void SetHover(NodeKind? kind)
        {
            hover = kind;
            Refresh(true);
        }

        public void CycleLegend()
        {
            pinned = pinned == null ? NodeKind.Fight : pinned == NodeKind.Goal ? null : pinned + 1;
            Refresh(true);
        }

        /* ───── 저장 · 불러오기 ───── */

        /// <summary>지도는 저장하지 않는다 — 생성 입력과 지나온 길만. 불러올 때 시드로 다시 만든다</summary>
        public string Save()
        {
            var s = new RunSave
            {
                seed = Map.seed, floors = Map.floors, cols = Map.cols, paths = Map.paths,
                mix = RouteMapData.MixName(Map.mix), at = path.Count > 0 ? path[^1] : -1, path = new List<int>(path),
            };
            string json = JsonUtility.ToJson(s);
            PlayerPrefs.SetString(SaveKey, json);
            PlayerPrefs.Save();
            if (jsonLabel != null) jsonLabel.text = json;
            return json;
        }

        public bool Load()
        {
            if (!PlayerPrefs.HasKey(SaveKey)) return false;
            RunSave s = JsonUtility.FromJson<RunSave>(PlayerPrefs.GetString(SaveKey));
            if (s == null || !Enum.TryParse(s.mix, true, out MapMix m)) return false;
            seed = s.seed;
            floors = s.floors;
            cols = s.cols;
            paths = s.paths;
            mix = m;
            Map = RouteMapData.Generate(seed, floors, cols, paths, mix, preventCross);
            Spawn();
            bool ok = Map.ValidPath(s.path);   // 생성 코드가 바뀌어 다른 지도가 나왔다면 여기서 걸러진다
            path.Clear();
            if (ok) path.AddRange(s.path);
            Refresh(false, true);
            following = true;
            return ok;
        }
    }
}
