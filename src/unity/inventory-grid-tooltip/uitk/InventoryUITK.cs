using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.InventoryGridTooltip
{
    /// <summary>
    /// 인벤토리 그리드 + 비교 툴팁 — UI Toolkit 버전 (InventoryItem 은 ugui 폴더의 것을 함께 쓴다).
    /// 마우스(PointerEnter)와 패드·키보드(FocusIn)를 같은 Focus() 로 모으고,
    /// 툴팁은 GeometryChangedEvent 로 크기가 확정된 뒤 '오른쪽 → 넘치면 왼쪽 → Clamp' 순서로 놓는다.
    /// UI Toolkit 만 쓰는 화면이면 EventSystem 이 필요 없다 (런타임 패널이 입력을 직접 받는다).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class InventoryUITK : MonoBehaviour
    {
        public enum SortKey { Rarity, Score, Type, Acquired }

        [SerializeField] List<InventoryItem> items = new();               // 획득 순서
        [SerializeField] InventoryItem[] equipped = new InventoryItem[4];  // Head · Body · Hand · Power
        [SerializeField, Range(4, 9)] int columns = 6;
        [SerializeField] float cellSize = 175f, cellMargin = 7f;
        [SerializeField, Range(0, 800)] int tooltipDelayMs = 250;          // 호버 기준. 포커스는 절반
        [SerializeField] float gap = 16f, edgeMargin = 24f;
        [SerializeField] bool edgeCorrection = true;

        VisualElement grid, equipPanel, layer, tooltip, compare;
        ScrollView scroll;
        Label sortLabel, filterLabel, ttRarity, ttKind, ttBadge, ttName, ttVs, ttScore, ttScoreDelta, ttDesc;
        RarityMarkElement ttMark;

        readonly List<InventoryItem> view = new();
        readonly List<VisualElement> slots = new();
        readonly List<VisualElement> equipSlots = new();
        readonly HashSet<InventoryItem> newItems = new();
        SortKey sortBy = SortKey.Rarity;
        Rarity minRarity = Rarity.Common;
        VisualElement focused, anchor;
        IVisualElementScheduledItem pending;
        bool open;

        void OnEnable()
        {
            // UIDocument 는 켜질 때마다 트리를 새로 만든다 → 목록을 비우고 다시 모은다
            var root = GetComponent<UIDocument>().rootVisualElement;
            grid = root.Q("slot-grid");
            equipPanel = root.Q("equipped-panel");
            scroll = root.Q<ScrollView>("grid-scroll");
            layer = root.Q("tooltip-layer");
            tooltip = root.Q("tooltip");
            compare = root.Q("tt-compare");
            sortLabel = root.Q<Label>("sort-label");
            filterLabel = root.Q<Label>("filter-label");
            ttMark = root.Q<RarityMarkElement>("tt-mark");
            ttRarity = root.Q<Label>("tt-rarity");
            ttKind = root.Q<Label>("tt-kind");
            ttBadge = root.Q<Label>("tt-badge");
            ttName = root.Q<Label>("tt-name");
            ttVs = root.Q<Label>("tt-vs");
            ttScore = root.Q<Label>("tt-score");
            ttScoreDelta = root.Q<Label>("tt-score-delta");
            ttDesc = root.Q<Label>("tt-desc");

            // 열 수 = 컨테이너 폭 (USS 에는 grid 가 없다)
            grid.style.width = columns * (cellSize + cellMargin * 2f);
            tooltip.RegisterCallback<GeometryChangedEvent>(_ => Place());

            slots.Clear();
            equipSlots.Clear();
            open = false;
            Rebuild();
            if (slots.Count > 0) slots[0].Focus();
        }

        // ───────── 칸 만들기 ─────────

        VisualElement MakeSlot(bool isEquip)
        {
            var s = new VisualElement { focusable = true };
            s.AddToClassList("slot");
            s.Add(new RarityMarkElement { name = "mark" });   // 모서리 표식은 Painter2D 로 직접 그린다 (에셋 불필요)
            s.Add(new VisualElement { name = "icon" });
            s.Add(new Label { name = "corner" });
            s.Add(new Label("▲") { name = "up" });
            s.Add(new Label("새") { name = "new" });
            s.Add(new VisualElement { name = "delay" });
            s.Q("mark").AddToClassList("mark");
            s.Q("icon").AddToClassList("slot__icon");
            s.Q("corner").AddToClassList("slot__corner");
            s.Q("up").AddToClassList("slot__up");
            s.Q("new").AddToClassList("slot__new");
            s.Q("delay").AddToClassList("slot__delay");
            foreach (var child in s.Children()) child.pickingMode = PickingMode.Ignore;

            s.RegisterCallback<PointerEnterEvent>(_ => Focus(s, isHover: true));
            s.RegisterCallback<PointerLeaveEvent>(_ => Blur(s));
            s.RegisterCallback<FocusInEvent>(_ => Focus(s, isHover: false));
            s.RegisterCallback<FocusOutEvent>(_ => Blur(s));
            s.RegisterCallback<NavigationSubmitEvent>(_ => Equip(s));
            if (!isEquip) s.RegisterCallback<NavigationMoveEvent>(e => Move(s, e));
            return s;
        }

        void Bind(VisualElement s, InventoryItem it)
        {
            s.userData = it;
            SetRarity(s, s.Q<RarityMarkElement>("mark"), it.rarity);   // 색 + 테두리 모양 + 모서리 표식을 한 번에
            s.Q("icon").style.backgroundImage = it.icon != null ? new StyleBackground(it.icon) : StyleKeyword.None;
            s.Q<Label>("corner").text = it.IsEquipment ? it.Score.ToString() : $"×{it.quantity}";
            var eq = EquippedFor(it);
            s.Q("up").EnableInClassList("hidden", !(eq != null && it.Score > eq.Score));
            s.Q("new").EnableInClassList("hidden", !newItems.Contains(it));
            s.EnableInClassList("slot--out", it.rarity < minRarity);
        }

        void Rebuild()
        {
            var order = new Dictionary<InventoryItem, int>();
            for (int i = 0; i < items.Count; i++) order[items[i]] = i;
            view.Clear();
            view.AddRange(items);
            if (sortBy != SortKey.Acquired)
                view.Sort((a, b) =>
                {
                    int c = sortBy switch
                    {
                        SortKey.Rarity => b.rarity != a.rarity ? b.rarity.CompareTo(a.rarity) : a.slot.CompareTo(b.slot),
                        SortKey.Score => b.Score.CompareTo(a.Score),
                        _ => a.slot != b.slot ? a.slot.CompareTo(b.slot) : b.rarity.CompareTo(a.rarity),
                    };
                    return c != 0 ? c : order[a].CompareTo(order[b]);
                });

            while (slots.Count < view.Count)
            {
                var s = MakeSlot(false);
                grid.Add(s);
                slots.Add(s);
            }
            for (int i = 0; i < slots.Count; i++)
            {
                slots[i].style.display = i < view.Count ? DisplayStyle.Flex : DisplayStyle.None;
                if (i < view.Count) Bind(slots[i], view[i]);
            }

            while (equipSlots.Count < 4)
            {
                var row = new VisualElement();
                row.AddToClassList("eq-slot");
                var s = MakeSlot(true);
                row.Add(s);
                row.Add(new Label { name = "eq-name" });
                row.Q("eq-name").AddToClassList("eq-slot__name");
                equipPanel.Add(row);
                equipSlots.Add(s);
            }
            for (int i = 0; i < 4; i++)
            {
                if (equipped[i] == null) continue;
                Bind(equipSlots[i], equipped[i]);
                equipSlots[i].parent.Q<Label>("eq-name").text = equipped[i].displayName;
            }

            sortLabel.text = "정렬: " + sortBy switch { SortKey.Rarity => "희귀도", SortKey.Score => "장비 점수", SortKey.Type => "종류", _ => "획득순" };
            filterLabel.text = minRarity == Rarity.Common ? "필터: 전체" : "필터: 정예 이상";
        }

        static readonly Color[] RarityColors =
        {
            new(0.64f, 0.67f, 0.72f), new(0.37f, 0.84f, 0.56f), new(0.31f, 0.66f, 1f), new(0.78f, 0.55f, 1f), new(1f, 0.76f, 0.24f),
        };

        /// 칸 테두리(.r-N: 색 + 형태)와 모서리 표식(RarityMarkElement: 모양 + 색)을 항상 함께 바꾼다
        static void SetRarity(VisualElement frame, RarityMarkElement mark, Rarity rarity)
        {
            for (int r = 0; r < 5; r++) frame?.EnableInClassList($"r-{r}", (int)rarity == r);
            mark.Set(rarity, RarityColors[(int)rarity]);
        }

        InventoryItem EquippedFor(InventoryItem it) => it.IsEquipment ? equipped[(int)it.slot] : null;
        bool IsEquip(VisualElement s) => equipSlots.Contains(s);

        // ───────── 포커스 · 툴팁 ─────────

        void Focus(VisualElement s, bool isHover)
        {
            focused = s;
            if (!isHover && !IsEquip(s)) scroll.ScrollTo(s);   // 포커스를 따라 스크롤
            pending?.Pause();
            if (open) { Show(s); return; }                     // 이미 떠 있으면 지연 없이 교체

            int delay = isHover ? tooltipDelayMs : tooltipDelayMs / 2;
            var bar = s.Q("delay");
            long start = System.Environment.TickCount;
            // 지연 막대를 채우며 기다렸다가 연다
            pending = s.schedule.Execute(() =>
            {
                float t = delay > 0 ? Mathf.Clamp01((System.Environment.TickCount - start) / (float)delay) : 1f;
                bar.style.width = Length.Percent(t * 90f);
                if (t >= 1f) { bar.style.width = 0; pending.Pause(); Show(s); }
            }).Every(16);
        }

        void Blur(VisualElement s)
        {
            if (s != focused) return;
            pending?.Pause();
            s.Q("delay").style.width = 0;
            // 다음 칸의 FocusIn 이 곧 오므로 한 틱 뒤에도 포커스가 없을 때만 닫는다
            s.schedule.Execute(() =>
            {
                if (focused != s) return;
                focused = null;
                open = false;
                tooltip.RemoveFromClassList("tooltip--open");
                foreach (var e in equipSlots) e.parent.RemoveFromClassList("eq-slot--target");
            }).StartingIn(30);
        }

        void Show(VisualElement s)
        {
            var it = (InventoryItem)s.userData;
            bool isEquipped = IsEquip(s);
            var eq = isEquipped ? null : EquippedFor(it);
            bool cmp = it.IsEquipment && eq != null;

            string[] names = { "기본", "개량", "정예", "명품", "유일" };
            ttRarity.text = names[(int)it.rarity];                 // 희귀도는 글자로도
            SetRarity(null, ttMark, it.rarity);
            tooltip.style.borderTopColor = RarityColors[(int)it.rarity];
            ttRarity.style.color = RarityColors[(int)it.rarity];
            ttKind.text = it.slot switch { EquipSlot.Head => "머리", EquipSlot.Body => "몸", EquipSlot.Hand => "손", EquipSlot.Power => "동력", _ => "소모품" };
            ttBadge.EnableInClassList("hidden", !isEquipped);
            ttName.text = it.quantity > 0 ? $"{it.displayName} ×{it.quantity}" : it.displayName;
            ttVs.EnableInClassList("hidden", !cmp);
            if (cmp) ttVs.text = $"장착 중인 {eq.displayName} 대비";
            ttScore.text = it.IsEquipment ? it.Score.ToString() : "—";
            ttScoreDelta.EnableInClassList("hidden", !cmp);
            if (cmp) SetDelta(ttScoreDelta, it.Score - eq.Score, 1, d => Mathf.Abs(d).ToString("0"));
            ttDesc.text = it.description;

            compare.Clear();
            if (it.IsEquipment)
                foreach (var key in StatInfo.All)
                    compare.Add(MakeStatRow(key, it.stats.Get(key), cmp ? eq.stats.Get(key) : (float?)null));

            // 비교 기준이 된 장착 칸을 짚어 준다
            for (int k = 0; k < equipSlots.Count; k++) equipSlots[k].parent.EnableInClassList("eq-slot--target", cmp && k == (int)it.slot);
            if (newItems.Remove(it)) s.Q("new").AddToClassList("hidden");   // 한 번 열면 '새' 배지가 사라진다
            anchor = s;
            open = true;
            tooltip.AddToClassList("tooltip--open");
            Place();   // 크기가 바뀌면 GeometryChangedEvent 에서 한 번 더 Place()
        }

        VisualElement MakeStatRow(StatKey key, float v, float? baseValue)
        {
            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.AddToClassList("stat");
            var label = new Label(StatInfo.HigherIsBetter(key) ? StatInfo.Label(key) : StatInfo.Label(key) + " ↓좋음");
            label.AddToClassList("stat__label");
            var bar = new VisualElement();
            bar.AddToClassList("stat__bar");
            var fill = new VisualElement();
            fill.AddToClassList("stat__fill");
            fill.style.width = Length.Percent(Mathf.Clamp01(v / StatInfo.Max(key)) * 100f);
            bar.Add(fill);
            var value = new Label(StatInfo.Format(key, v));
            value.AddToClassList("stat__value");
            row.Add(label);
            row.Add(bar);
            row.Add(value);
            if (baseValue.HasValue)
            {
                var tick = new VisualElement();
                tick.AddToClassList("stat__tick");
                tick.style.left = Length.Percent(Mathf.Clamp01(baseValue.Value / StatInfo.Max(key)) * 100f);
                bar.Add(tick);
                var delta = new Label();
                delta.AddToClassList("delta");
                SetDelta(delta, v - baseValue.Value, StatInfo.HigherIsBetter(key) ? 1 : -1, d => StatInfo.Format(key, Mathf.Abs(d)));
                row.Add(delta);
            }
            foreach (var c in row.Query<VisualElement>().ToList()) c.pickingMode = PickingMode.Ignore;
            return row;
        }

        /// 화살표 = 좋고 나쁨(betterSign 로 방향 뒤집기), 숫자 부호 = 실제 증감
        static void SetDelta(Label l, float diff, int betterSign, System.Func<float, string> fmt)
        {
            int sign = Mathf.Abs(diff) < 0.05f ? 0 : (diff > 0 ? 1 : -1);
            int verdict = sign * betterSign;
            l.text = verdict == 0 ? "＝ 같음" : $"{(verdict > 0 ? "▲" : "▼")} {(diff > 0 ? "+" : "−")}{fmt(diff)}";
            l.EnableInClassList("delta--up", verdict > 0);
            l.EnableInClassList("delta--down", verdict < 0);
            l.EnableInClassList("delta--same", verdict == 0);
        }

        void Place()
        {
            if (!open || anchor == null) return;
            float w = tooltip.resolvedStyle.width, h = tooltip.resolvedStyle.height;
            if (float.IsNaN(w) || float.IsNaN(h)) return;            // 아직 레이아웃 전
            Rect a = layer.WorldToLocal(anchor.worldBound);           // 칸 → 레이어 좌표 (y 아래로 증가)
            Rect b = layer.layout;
            float x = a.xMax + gap, y = a.yMin;                       // 칸 오른쪽, 윗변 맞춤
            if (edgeCorrection)
            {
                if (x + w > b.width - edgeMargin && a.xMin - gap - w >= edgeMargin) x = a.xMin - gap - w;   // 뒤집기
                x = Mathf.Clamp(x, edgeMargin, b.width - edgeMargin - w);                                   // 고정
                y = Mathf.Clamp(y, edgeMargin, b.height - edgeMargin - h);
            }
            tooltip.style.left = x;
            tooltip.style.top = y;
        }

        // ───────── 방향 이동 (flex-wrap 격자는 기본 내비게이션이 기대와 다를 수 있어 직접 처리) ─────────

        void Move(VisualElement s, NavigationMoveEvent e)
        {
            int i = slots.IndexOf(s);
            int next = e.direction switch
            {
                NavigationMoveEvent.Direction.Left => i % columns == 0 ? -1 : i - 1,
                NavigationMoveEvent.Direction.Right => i % columns == columns - 1 ? -1 : i + 1,
                NavigationMoveEvent.Direction.Up => i - columns,
                NavigationMoveEvent.Direction.Down => i + columns,
                _ => -1,
            };
            if (next < 0 || next >= view.Count) return;
            slots[next].Focus();
            e.StopPropagation();
            s.focusController?.IgnoreEvent(e);
        }

        // ───────── 동작 (InventoryUITKDemo 에서 호출) ─────────

        public void Equip(VisualElement s)
        {
            if (s == null || IsEquip(s)) return;
            var it = (InventoryItem)s.userData;
            if (!it.IsEquipment) return;
            int k = (int)it.slot;
            var old = equipped[k];
            equipped[k] = it;
            if (old != null) items[items.IndexOf(it)] = old; else items.Remove(it);
            Rebuild();
            FocusItem(old);
        }

        public void EquipFocused() => Equip(focused);

        public void CycleSort()
        {
            var keep = focused?.userData as InventoryItem;
            sortBy = (SortKey)(((int)sortBy + 1) % 4);
            Rebuild();
            FocusItem(keep);   // 칸 번호가 아니라 보던 아이템을 따라간다
        }

        public void ToggleRarityFilter()
        {
            minRarity = minRarity == Rarity.Common ? Rarity.Elite : Rarity.Common;
            Rebuild();
        }

        public void AddLoot(InventoryItem it)
        {
            items.Add(it);
            newItems.Add(it);
            Rebuild();
        }

        public void FocusEdgeSlot()
        {
            int pick = -1;
            for (int i = columns - 1; i < view.Count; i += columns)
                if (view[i].IsEquipment) pick = i;
            if (pick >= 0) slots[pick].Focus();
        }

        void FocusItem(InventoryItem it)
        {
            int i = it != null ? view.IndexOf(it) : -1;
            if (i < 0) return;
            if (slots[i] == focused && open) Show(slots[i]);   // 같은 칸이면 FocusIn 이 다시 오지 않으므로 직접 갱신
            else slots[i].Focus();
        }
    }
}
