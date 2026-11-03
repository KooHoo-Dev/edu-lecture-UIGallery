using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.CraftingRecipePanel
{
    /// <summary>
    /// 제작 패널 — UI Toolkit 판. Recipe · Inventory · CraftingStation 은 ugui 폴더의 것을 그대로 쓴다.
    /// 갱신 방식: runtime data binding 대신 '직접 갱신'. Inventory.Changed 한 곳에서 RecomputeAll() 이 줄의 클래스와 글자를 바꾼다.
    ///   (레시피마다 바인딩용 상태 객체와 "3 / 5" · 클래스 토글 변환기를 만드는 것보다, 전부 다시 계산하는 흐름을 그대로 읽을 수 있다)
    /// UIDocument 는 켤 때마다 트리를 새로 만든다 → OnDisable 에서 탭 · 탭별 선택 · 검색어 · scrollOffset 을 저장하고 OnEnable 에서 되살린다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class CraftingUITK : MonoBehaviour
    {
        class Row
        {
            public VisualElement root;
            public Label state, badge;
            public Recipe recipe;
        }

        [SerializeField] CraftingStation station;
        [SerializeField] bool restoreSelection = true;
        static readonly string[] TabIds = { "all", "maint", "survive", "gear" };
        static readonly string[] StockIds = { "repair", "coolcell", "circuit", "oxygen" };

        VisualElement stock, ingredients, queue;
        ScrollView list;
        TextField search;
        Toggle craftableOnly;
        Label dName, dMeta, reason, headTime;
        VisualElement headFill;
        Button craft;
        readonly Button[] tabs = new Button[4];
        readonly List<Row> rows = new();
        readonly Dictionary<Recipe, RecipeStatus> status = new();

        // ── 저장되는 보기 상태 (트리가 새로 만들어져도 이 필드는 남는다) ──
        int tab;
        readonly Recipe[] selectedByTab = new Recipe[4];
        Vector2 savedOffset;
        string savedSearch = "";
        bool hasSaved;

        Recipe Selected => selectedByTab[tab];

        static VisualElement E(string cls)
        {
            var e = new VisualElement();
            e.AddToClassList(cls);
            return e;
        }

        static Label L(string text, string cls)
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            stock = root.Q("stock");
            ingredients = root.Q("ingredients");
            queue = root.Q("queue");
            list = root.Q<ScrollView>("recipe-list");
            search = root.Q<TextField>("search");
            craftableOnly = root.Q<Toggle>("craftable-only");
            dName = root.Q<Label>("d-name");
            dMeta = root.Q<Label>("d-meta");
            reason = root.Q<Label>("reason");
            craft = root.Q<Button>("craft");
            for (int i = 0; i < 4; i++)
            {
                int t = i;
                tabs[i] = root.Q<Button>("tab-" + TabIds[i]);
                tabs[i].clicked += () => SetTab(t);
            }
            craft.clicked += Craft;
            search.textEdition.placeholder = "레시피 검색";

            if (!restoreSelection || !hasSaved)
            {
                tab = 0;
                Array.Clear(selectedByTab, 0, selectedByTab.Length);
                savedOffset = Vector2.zero;
                savedSearch = "";
            }
            search.SetValueWithoutNotify(savedSearch);
            search.RegisterValueChangedCallback(_ => BuildRows());
            craftableOnly.RegisterValueChangedCallback(_ => BuildRows());

            station.Inventory.Changed += OnInventoryChanged;
            station.QueueChanged += BuildQueue;
            station.Unlocked += OnUnlocked;

            for (int i = 0; i < StockIds.Length; i++) stock.Add(new Label { name = "stock-" + StockIds[i] });
            rows.Clear();   // 지난번 트리의 줄은 버린다
            RecomputeAll();
            BuildQueue();
            PaintTabs();
            // scrollOffset 은 레이아웃이 끝나야 먹는다 (지금 넣으면 내용 높이가 0 이라 0 으로 잘린다) → 한 번만
            list.contentContainer.RegisterCallback<GeometryChangedEvent>(RestoreScroll);
        }

        void RestoreScroll(GeometryChangedEvent e)
        {
            list.contentContainer.UnregisterCallback<GeometryChangedEvent>(RestoreScroll);
            list.scrollOffset = savedOffset;
            rows.Find(r => r.recipe == Selected)?.root.Focus();
        }

        void OnDisable()
        {
            station.Inventory.Changed -= OnInventoryChanged;
            station.QueueChanged -= BuildQueue;
            station.Unlocked -= OnUnlocked;
            savedOffset = list.scrollOffset;
            savedSearch = search.value;
            hasSaved = true;
        }

        void OnInventoryChanged(string reason) => RecomputeAll();
        void OnUnlocked(Recipe r) => BuildRows();

        // ───────── 상태 계산 ─────────

        /// 어느 수량이 바뀌었든 레시피 전부를 다시 계산한다
        void RecomputeAll()
        {
            status.Clear();
            foreach (Recipe r in station.Recipes) status[r] = r.Evaluate(station.Inventory);
            for (int i = 0; i < StockIds.Length; i++)
                stock.Q<Label>("stock-" + StockIds[i]).text = $"{station.DisplayName(StockIds[i])} {station.Inventory.Count(StockIds[i])}";
            // '만들 수 있는 것만' 이 켜져 있으면 보이는 줄이 바뀔 수 있다 → 다시 만들고, 아니면 제자리에서 글자 · 클래스만 바꾼다
            if (craftableOnly.value || rows.Count == 0) BuildRows();
            else
            {
                foreach (Row row in rows) PaintRow(row);
                RefreshDetail();
            }
        }

        bool Visible(Recipe r)
        {
            if (!station.IsUnlocked(r)) return false;
            if (tab > 0 && (int)r.tab != tab - 1) return false;
            string q = search.value.Trim();
            if (q.Length > 0 && !r.displayName.Contains(q)) return false;
            return !craftableOnly.value || status[r].CanCraft;
        }

        // ───────── 목록 ─────────

        void BuildRows()
        {
            bool hadFocus = list.focusController?.focusedElement is VisualElement f && list.Contains(f);
            list.Clear();
            rows.Clear();
            foreach (Recipe r in station.Recipes)
            {
                if (!Visible(r)) continue;
                var row = new Row { root = E("row"), recipe = r, state = L("", "row__state"), badge = L("새", "row__new") };
                row.root.focusable = true;
                row.root.Add(L(r.displayName, "row__name"));
                row.root.Add(row.state);
                row.root.Add(row.badge);
                foreach (VisualElement c in row.root.Children()) c.pickingMode = PickingMode.Ignore;
                row.root.RegisterCallback<FocusInEvent>(_ => Select(row));
                row.root.RegisterCallback<NavigationSubmitEvent>(_ => Craft());
                row.root.RegisterCallback<NavigationMoveEvent>(e => Move(row, e));
                row.root.RegisterCallback<ClickEvent>(e => { if (e.clickCount >= 2) Craft(); });
                PaintRow(row);
                list.Add(row.root);
                rows.Add(row);
            }
            if (Selected == null || !Visible(Selected)) selectedByTab[tab] = rows.Count > 0 ? rows[0].recipe : null;
            MarkSelected();
            if (hadFocus) rows.Find(x => x.recipe == Selected)?.root.Focus();
            RefreshDetail();
        }

        void PaintRow(Row row)
        {
            RecipeStatus st = status[row.recipe];
            row.root.EnableInClassList("row--ok", st.CanCraft);
            row.state.text = st.CanCraft ? $"✓ ×{st.MaxCount} 가능" : $"✕ {st.Missing.Count}종 부족";   // 색 + 기호 + 글자
            row.badge.EnableInClassList("hidden", !station.IsNew(row.recipe));
        }

        void MarkSelected()
        {
            foreach (Row r in rows) r.root.EnableInClassList("row--selected", r.recipe == Selected);
            for (int t = 0; t < 4; t++) tabs[t].EnableInClassList("tab--new", TabHasNew(t));
        }

        bool TabHasNew(int t)
        {
            foreach (Recipe r in station.Recipes)
                if (station.IsNew(r) && station.IsUnlocked(r) && (t == 0 || (int)r.tab == t - 1)) return true;
            return false;
        }

        void Select(Row row)
        {
            selectedByTab[tab] = row.recipe;
            station.MarkSeen(row.recipe);   // 고르면 '새' 배지가 사라진다
            row.badge.AddToClassList("hidden");
            MarkSelected();
            list.ScrollTo(row.root);
            RefreshDetail();
        }

        /// 위아래 이동을 직접 처리한다. StopPropagation 만 하면 Unity 6.3 은 기본 포커스 이동을 한 번 더 해서 한 칸씩 건너뛴다
        void Move(Row row, NavigationMoveEvent e)
        {
            int step = e.direction == NavigationMoveEvent.Direction.Up ? -1 : e.direction == NavigationMoveEvent.Direction.Down ? 1 : 0;
            if (step == 0) return;   // 좌우는 기본 탐색에 맡긴다 (상세 · 대기열로)
            int next = rows.IndexOf(row) + step;
            if (next >= 0 && next < rows.Count) rows[next].root.Focus();
            e.StopPropagation();
            row.root.focusController?.IgnoreEvent(e);
        }

        void SetTab(int t)
        {
            tab = t;
            PaintTabs();
            BuildRows();
            rows.Find(x => x.recipe == Selected)?.root.Focus();
        }

        void PaintTabs()
        {
            for (int i = 0; i < 4; i++) tabs[i].EnableInClassList("tab--active", i == tab);
        }

        // ───────── 상세 ─────────

        void RefreshDetail()
        {
            Recipe r = Selected;
            ingredients.Clear();
            if (r == null)
            {
                dName.text = "레시피를 고른다";
                dMeta.text = reason.text = "";
                craft.SetEnabled(false);
                return;
            }
            Inventory inv = station.Inventory;
            dName.text = r.displayName;
            dMeta.text = $"결과 ×{r.resultCount} · {r.seconds * station.CraftTimeScale:0.#}초 · 보유 {inv.Count(r.resultId)}";
            foreach (Ingredient ing in r.ingredients)
            {
                int have = inv.Count(ing.itemId);
                bool lack = have < ing.count;
                VisualElement line = E("ing"), icon = E("ing__icon");
                line.EnableInClassList("ing--short", lack);
                Sprite sp = station.Icon(ing.itemId);
                if (sp != null) icon.style.backgroundImage = new StyleBackground(sp);
                line.Add(icon);
                line.Add(L(station.DisplayName(ing.itemId), "ing__name"));
                line.Add(L($"{have} / {ing.count}", "ing__count"));                          // 보유 / 필요
                line.Add(L(lack ? $"✕ {ing.count - have}개 부족" : "✓ 충분", "ing__tag"));   // 색 + 기호 + 글자
                ingredients.Add(line);
            }

            RecipeStatus st = status[r];
            bool full = station.Queue.Count >= station.QueueSize;
            craft.SetEnabled(st.CanCraft && !full);
            if (full) reason.text = $"✕ 대기열 가득 참 ({station.Queue.Count}/{station.QueueSize})";
            else if (st.CanCraft) reason.text = $"✓ 지금 재료로 ×{st.MaxCount} 가능";
            else
            {
                var parts = new List<string>();
                foreach ((string id, int have, int need) in st.Missing) parts.Add($"{station.DisplayName(id)} {need - have}개");
                reason.text = "✕ " + string.Join(", ", parts) + " 부족";
            }
            reason.EnableInClassList("reason--ok", st.CanCraft && !full);
        }

        void Craft()
        {
            if (Selected != null) station.Enqueue(Selected);
        }

        // ───────── 대기열 ─────────

        void BuildQueue()
        {
            queue.Clear();
            headFill = null;
            headTime = null;
            for (int i = 0; i < Mathf.Max(station.QueueSize, station.Queue.Count); i++)
            {
                VisualElement slot = E("job");
                queue.Add(slot);
                if (i >= station.Queue.Count)
                {
                    slot.AddToClassList("job--empty");
                    slot.Add(new Label("빈 칸"));
                    continue;
                }
                CraftingStation.Job job = station.Queue[i];
                VisualElement text = E("job__text"), bar = E("job__bar"), fill = E("job__fill");
                text.Add(new Label(job.Recipe.displayName));
                bar.Add(fill);
                text.Add(bar);
                Label time = L(i == 0 ? "" : "대기", "job__time");
                int k = i;
                var cancel = new Button(() => station.Cancel(k)) { text = "✕" };
                cancel.AddToClassList("job__cancel");
                slot.Add(text);
                slot.Add(time);
                slot.Add(cancel);
                if (i == 0)
                {
                    headFill = fill;
                    headTime = time;
                }
            }
            RefreshDetail();   // 대기열이 차면 제작 버튼의 이유가 바뀐다
        }

        void Update()
        {
            // 맨 앞 작업의 진행만 매 프레임 칠한다 (UI Toolkit 에는 Filled 이미지가 없어 폭 % 로)
            if (station.Queue.Count > 0 && headFill != null)
            {
                CraftingStation.Job job = station.Queue[0];
                headFill.style.width = Length.Percent(job.Progress * 100f);
                headTime.text = $"{Mathf.Max(0f, job.Duration - job.Elapsed):0.0}초";
            }

            // 탭 Q · E (패드 L · R), 필터 F, 마지막 취소 Backspace. 검색창에 포커스가 있으면 글자로 둔다
            if (search.focusController?.focusedElement is VisualElement f && search.Contains(f)) return;
            Keyboard kb = Keyboard.current;
            Gamepad pad = Gamepad.current;
            if (kb != null && kb.qKey.wasPressedThisFrame || pad != null && pad.leftShoulder.wasPressedThisFrame) SetTab((tab + 3) % 4);
            if (kb != null && kb.eKey.wasPressedThisFrame || pad != null && pad.rightShoulder.wasPressedThisFrame) SetTab((tab + 1) % 4);
            if (kb != null && kb.fKey.wasPressedThisFrame || pad != null && pad.buttonNorth.wasPressedThisFrame) craftableOnly.value = !craftableOnly.value;
            if (kb != null && kb.backspaceKey.wasPressedThisFrame || pad != null && pad.buttonWest.wasPressedThisFrame) station.Cancel(station.Queue.Count - 1);
        }
    }
}
