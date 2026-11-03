using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.CraftingRecipePanel
{
    // 제작 패널 (UI Toolkit). Recipe · Inventory · CraftingStation 은 ugui 폴더의 것을 쓴다.
    // 직접 갱신: Inventory.Changed → RecomputeAll(). 트리는 켤 때마다 새로 만들어지므로 보기 상태는 필드에 둔다.
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

        // 저장되는 보기 상태
        int tab;
        readonly Recipe[] selectedByTab = new Recipe[4];
        Vector2 savedOffset;
        string savedSearch = "";
        bool savedFilter, hasSaved;

        Recipe shown, keep;   // UGUI 판과 같다: 표시한 선택 · ✕ 로 남길 레시피
        Row autoFocus;        // 프로그램이 준 포커스 (FocusInEvent 가 늦게 와도 선택 · 배지를 안 바꾼다)

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
                keep = null;
            }
            search.SetValueWithoutNotify(savedSearch);
            craftableOnly.SetValueWithoutNotify(savedFilter);
            search.RegisterValueChangedCallback(_ => ViewChanged());
            craftableOnly.RegisterValueChangedCallback(_ => ViewChanged());

            station.Inventory.Changed += OnInventoryChanged;
            station.QueueChanged += BuildQueue;
            station.Unlocked += OnUnlocked;

            for (int i = 0; i < StockIds.Length; i++) stock.Add(new Label { name = "stock-" + StockIds[i] });
            rows.Clear();
            RecomputeAll();
            BuildQueue();
            PaintTabs();
            // scrollOffset 은 레이아웃이 끝나야 먹는다 (지금은 내용 높이가 0) → 한 번만
            list.contentContainer.RegisterCallback<GeometryChangedEvent>(RestoreScroll);
        }

        void RestoreScroll(GeometryChangedEvent e)
        {
            list.contentContainer.UnregisterCallback<GeometryChangedEvent>(RestoreScroll);
            list.scrollOffset = savedOffset;
            Row row = rows.Find(r => r.recipe == shown);
            if (row == null) return;
            list.ScrollTo(row.root);   // 선택이 보이게
            FocusRow(row);
        }

        void OnDisable()
        {
            station.Inventory.Changed -= OnInventoryChanged;
            station.QueueChanged -= BuildQueue;
            station.Unlocked -= OnUnlocked;
            savedOffset = list.scrollOffset;
            savedSearch = search.value;
            savedFilter = craftableOnly.value;
            hasSaved = true;
        }

        void OnInventoryChanged(string reason) => RecomputeAll();
        void OnUnlocked(Recipe r) => BuildRows();

        void ViewChanged()
        {
            keep = null;
            BuildRows();
        }

        void FocusRow(Row row)
        {
            if (row == null) return;
            autoFocus = row;
            row.root.Focus();
        }

        /// 무엇이 바뀌었든 전부 다시 계산한다
        void RecomputeAll()
        {
            status.Clear();
            foreach (Recipe r in station.Recipes) status[r] = r.Evaluate(station.Inventory);
            for (int i = 0; i < StockIds.Length; i++)
                stock.Q<Label>("stock-" + StockIds[i]).text = $"{station.DisplayName(StockIds[i])} {station.Inventory.Count(StockIds[i])}";
            // 필터가 켜져 있으면 보이는 줄이 바뀔 수 있어 다시 만든다
            if (craftableOnly.value || rows.Count == 0) BuildRows();
            else
            {
                foreach (Row row in rows) PaintRow(row);
                RefreshDetail();
            }
        }

        bool Visible(Recipe r, int t)
        {
            if (!station.IsUnlocked(r) || t > 0 && (int)r.tab != t - 1) return false;
            string q = search.value.Trim();
            if (q.Length > 0 && !r.displayName.Contains(q)) return false;
            return !craftableOnly.value || status[r].CanCraft || r == keep;
        }

        void BuildRows()
        {
            bool hadFocus = list.focusController?.focusedElement is VisualElement f && list.Contains(f);
            list.Clear();
            rows.Clear();
            foreach (Recipe r in station.Recipes)
            {
                if (!Visible(r, tab)) continue;
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
            Recipe want = selectedByTab[tab];
            shown = want != null && Visible(want, tab) ? want : rows.Count > 0 ? rows[0].recipe : null;
            MarkSelected();
            if (hadFocus) FocusRow(rows.Find(x => x.recipe == shown));
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
            foreach (Row r in rows) r.root.EnableInClassList("row--selected", r.recipe == shown);
            for (int t = 0; t < 4; t++) tabs[t].EnableInClassList("tab--new", TabHasNew(t));
        }

        /// 보이는 줄만 센다 (가려진 배지는 지울 수 없다)
        bool TabHasNew(int t)
        {
            foreach (Recipe r in station.Recipes)
                if (station.IsNew(r) && Visible(r, t)) return true;
            return false;
        }

        /// 사람이 고른 것만 저장하고 배지를 지운다
        void Select(Row row)
        {
            if (row == autoFocus) autoFocus = null;
            else
            {
                selectedByTab[tab] = row.recipe;
                station.MarkSeen(row.recipe);
                row.badge.AddToClassList("hidden");
                if (keep != null && keep != row.recipe)
                {
                    keep = null;
                    list.schedule.Execute(BuildRows);   // ✕ 줄은 이벤트가 끝난 뒤 뺀다
                }
            }
            shown = row.recipe;
            MarkSelected();
            list.ScrollTo(row.root);
            RefreshDetail();
        }

        /// 위아래 이동을 직접 처리한다 (IgnoreEvent 가 없으면 6.3 은 한 칸씩 건너뛴다)
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
            keep = null;
            PaintTabs();
            BuildRows();
            FocusRow(rows.Find(x => x.recipe == shown));
        }

        void PaintTabs()
        {
            for (int i = 0; i < 4; i++) tabs[i].EnableInClassList("tab--active", i == tab);
        }

        void RefreshDetail()
        {
            Recipe r = shown;
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
                line.Add(L($"{have} / {ing.count}", "ing__count"));
                line.Add(L(lack ? $"✕ {ing.count - have}개 부족" : "✓ 충분", "ing__tag"));
                ingredients.Add(line);
            }

            reason.text = station.Reason(status[r], out bool ok);
            reason.EnableInClassList("reason--ok", ok);
            craft.SetEnabled(ok);
        }

        /// 건 레시피를 선택으로 굳혀 남긴다 (UGUI 판과 같다)
        void Craft()
        {
            if (shown == null) return;
            keep = selectedByTab[tab] = shown;
            station.Enqueue(shown);
        }

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
            RefreshDetail();
        }

        void Update()
        {
            // 맨 앞 작업만 칠한다 (Filled 이미지가 없어 폭 % 로)
            if (station.Queue.Count > 0 && headFill != null)
            {
                CraftingStation.Job job = station.Queue[0];
                headFill.style.width = Length.Percent(job.Progress * 100f);
                headTime.text = $"{Mathf.Max(0f, job.Duration - job.Elapsed):0.0}초";
            }

            // 검색창에 포커스가 있으면 Q · E · F · Backspace 는 글자다.
            // focusedElement 는 TextField 자신이고 Contains 는 자기 자신을 포함하지 않는다
            if (search.focusController?.focusedElement is VisualElement f && (f == search || search.Contains(f))) return;
            Keyboard kb = Keyboard.current;
            Gamepad pad = Gamepad.current;
            if (kb != null && kb.qKey.wasPressedThisFrame || pad != null && pad.leftShoulder.wasPressedThisFrame) SetTab((tab + 3) % 4);
            if (kb != null && kb.eKey.wasPressedThisFrame || pad != null && pad.rightShoulder.wasPressedThisFrame) SetTab((tab + 1) % 4);
            if (kb != null && kb.fKey.wasPressedThisFrame || pad != null && pad.buttonNorth.wasPressedThisFrame) craftableOnly.value = !craftableOnly.value;
            if (kb != null && kb.backspaceKey.wasPressedThisFrame || pad != null && pad.buttonWest.wasPressedThisFrame) station.Cancel(station.Queue.Count - 1);
        }
    }
}
