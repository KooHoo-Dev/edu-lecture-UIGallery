using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.CraftingRecipePanel
{
    // 제작 창 (UGUI). 껐다 켜는 창 GameObject 에 붙인다.
    // - Inventory.Changed 를 구독해 레시피 상태 전체를 다시 계산한다 (RecomputeAll)
    // - OnDisable 에서 탭 · 탭별 선택 · 스크롤을 저장하고, OnEnable 에서 되살린다 (컴포넌트가 꺼져도 필드는 남는다)
    // - 대기열 진행은 Update 에서 Image.fillAmount 로 칠한다 (시간은 CraftingStation 의 코루틴이 흐르게 한다)
    public class CraftingPanel : MonoBehaviour
    {
        [Serializable]
        public class IngredientRow
        {
            public GameObject root;
            public Image icon;
            public TMP_Text nameLabel, count, tag;   // count "3 / 5" · tag "✕ 2개 부족" / "✓ 충분"
            public Image bar;                        // Filled · Horizontal — 보유 / 필요
        }

        [Serializable]
        public class QueueSlot
        {
            public GameObject root;
            public Image icon, fill;                 // fill: Filled · Horizontal
            public TMP_Text nameLabel, time;
            public Button cancel;
        }

        [SerializeField] CraftingStation station;
        [SerializeField] bool restoreSelection = true;

        [Header("목록")]
        [SerializeField] Button[] tabButtons = new Button[4];       // 전체 · 정비 · 생존 · 장비
        [SerializeField] GameObject[] tabNewBadges = new GameObject[4];
        [SerializeField] Color tabOn = new(1f, 0.76f, 0.24f), tabOff = new(0.2f, 0.24f, 0.3f);
        [SerializeField] TMP_InputField search;
        [SerializeField] Toggle craftableOnly;
        [SerializeField] ScrollRect scroll;
        [SerializeField] RecipeRowView rowPrefab;

        [Header("상세 · 대기열 · 자원")]
        [SerializeField] Image detailIcon;
        [SerializeField] TMP_Text detailName, detailMeta, reason;
        [SerializeField] IngredientRow[] ingredientRows = new IngredientRow[3];
        [SerializeField] Button craftButton;
        [SerializeField] QueueSlot[] queueSlots = new QueueSlot[5];
        [SerializeField] TMP_Text[] stockLabels = new TMP_Text[4];
        [SerializeField] string[] stockIds = { "repair", "coolcell", "circuit", "oxygen" };
        [SerializeField] Color okColor = new(0.37f, 0.89f, 0.6f), shortColor = new(1f, 0.48f, 0.48f);

        readonly List<RecipeRowView> rows = new();
        readonly Dictionary<Recipe, RecipeStatus> status = new();

        // ── 저장되는 보기 상태 ──
        int tab;
        readonly Recipe[] selectedByTab = new Recipe[4];
        float savedScroll = 1f;   // verticalNormalizedPosition (1 = 맨 위)
        bool hasSaved;

        Recipe Selected => selectedByTab[tab];

        void Awake()
        {
            for (int i = 0; i < tabButtons.Length; i++)
            {
                int t = i;
                tabButtons[i].onClick.AddListener(() => SetTab(t));
            }
            search.onValueChanged.AddListener(_ => RebuildList());
            craftableOnly.onValueChanged.AddListener(_ => RebuildList());
            craftButton.onClick.AddListener(Craft);
            for (int i = 0; i < queueSlots.Length; i++)
            {
                int k = i;
                queueSlots[i].cancel.onClick.AddListener(() => station.Cancel(k));
            }
        }

        void OnEnable()
        {
            station.Inventory.Changed += OnInventoryChanged;
            station.QueueChanged += RefreshQueue;
            station.Unlocked += OnUnlocked;

            if (!restoreSelection || !hasSaved)
            {
                tab = 0;
                Array.Clear(selectedByTab, 0, selectedByTab.Length);
                savedScroll = 1f;
            }
            RecomputeAll();   // 닫혀 있는 동안 바뀐 수량(완성 · 획득)도 여기서 반영된다
            RefreshQueue();
            PaintTabs();

            // 스크롤은 레이아웃이 끝난 뒤에 넣어야 먹는다
            Canvas.ForceUpdateCanvases();
            scroll.verticalNormalizedPosition = savedScroll;
            SyncSelection(force: true);
        }

        void OnDisable()
        {
            // 풀지 않으면 다시 열 때마다 구독이 쌓이고, 꺼진 창을 계속 갱신한다
            station.Inventory.Changed -= OnInventoryChanged;
            station.QueueChanged -= RefreshQueue;
            station.Unlocked -= OnUnlocked;
            savedScroll = scroll.verticalNormalizedPosition;   // tab · selectedByTab 은 이미 필드에 있다
            hasSaved = true;
        }

        void OnInventoryChanged(string reason) => RecomputeAll();
        void OnUnlocked(Recipe r) => RecomputeAll();

        /// 어느 수량이 바뀌었든 레시피 전부를 다시 계산한다 — 목록 · 상세 · 버튼이 같은 상태를 본다
        void RecomputeAll()
        {
            status.Clear();
            foreach (Recipe r in station.Recipes) status[r] = r.Evaluate(station.Inventory);
            for (int i = 0; i < stockLabels.Length; i++) stockLabels[i].text = station.Inventory.Count(stockIds[i]).ToString();
            RebuildList();
        }

        bool Visible(Recipe r)
        {
            if (!station.IsUnlocked(r)) return false;
            if (tab > 0 && (int)r.tab != tab - 1) return false;
            string q = search.text.Trim();
            if (q.Length > 0 && !r.displayName.Contains(q)) return false;
            return !craftableOnly.isOn || status[r].CanCraft;
        }

        /// 줄은 재사용한다. 순서는 레시피 순서 그대로 — 상태가 바뀌어도 줄이 자리를 옮기지 않는다
        void RebuildList()
        {
            int n = 0;
            foreach (Recipe r in station.Recipes)
            {
                if (!Visible(r)) continue;
                if (n == rows.Count)
                {
                    RecipeRowView v = Instantiate(rowPrefab, scroll.content);
                    v.Owner = this;
                    rows.Add(v);
                }
                rows[n].gameObject.SetActive(true);
                rows[n].Bind(r, status[r], station.IsNew(r));
                n++;
            }
            for (int i = n; i < rows.Count; i++) rows[i].gameObject.SetActive(false);
            if (Selected == null || !Visible(Selected)) selectedByTab[tab] = n > 0 ? rows[0].Recipe : null;
            for (int t = 0; t < tabNewBadges.Length; t++) tabNewBadges[t].SetActive(TabHasNew(t));
            SyncSelection(force: false);
            RefreshDetail();
        }

        bool TabHasNew(int t)
        {
            foreach (Recipe r in station.Recipes)
                if (station.IsNew(r) && station.IsUnlocked(r) && (t == 0 || (int)r.tab == t - 1)) return true;
            return false;
        }

        /// 줄을 재사용하므로 같은 GameObject 가 다른 레시피를 그릴 수 있다 → 선택을 '레시피' 기준으로 다시 맞춘다.
        /// 검색창에 입력 중일 때는 포커스를 빼앗지 않는다 (force 가 아니면 목록 줄이 선택돼 있을 때만)
        void SyncSelection(bool force)
        {
            EventSystem es = EventSystem.current;
            RecipeRowView target = rows.Find(v => v.gameObject.activeSelf && v.Recipe == Selected);
            foreach (RecipeRowView v in rows) v.SetSelectedLook(v == target);
            if (es == null || target == null) return;
            GameObject cur = es.currentSelectedGameObject;
            bool listHasFocus = cur == null || cur.GetComponent<RecipeRowView>() != null;
            if ((force || listHasFocus) && cur != target.gameObject) es.SetSelectedGameObject(target.gameObject);
        }

        public void Select(RecipeRowView row)
        {
            selectedByTab[tab] = row.Recipe;
            if (station.IsNew(row.Recipe))
            {
                station.MarkSeen(row.Recipe);   // 고르면 '새' 배지가 사라진다
                row.SetNew(false);
                for (int t = 0; t < tabNewBadges.Length; t++) tabNewBadges[t].SetActive(TabHasNew(t));
            }
            ScrollIntoView((RectTransform)row.transform);
            RefreshDetail();
        }

        /// ScrollRect 는 패드 · 키보드 선택을 따라 스크롤하지 않는다 → 고른 줄이 보이게 content 를 직접 옮긴다
        void ScrollIntoView(RectTransform item)
        {
            RectTransform viewport = scroll.viewport;
            var c = new Vector3[4];
            item.GetWorldCorners(c);
            float bottom = viewport.InverseTransformPoint(c[0]).y, top = viewport.InverseTransformPoint(c[1]).y;
            Rect vr = viewport.rect;
            float dy = top > vr.yMax ? top - vr.yMax : bottom < vr.yMin ? bottom - vr.yMin : 0f;
            if (dy != 0f) scroll.content.anchoredPosition -= new Vector2(0f, dy);
        }

        void RefreshDetail()
        {
            Recipe r = Selected;
            Inventory inv = station.Inventory;
            if (r == null)
            {
                detailName.text = "레시피를 고른다";
                detailMeta.text = reason.text = "";
                foreach (IngredientRow row in ingredientRows) row.root.SetActive(false);
                craftButton.interactable = false;
                return;
            }
            detailIcon.sprite = r.icon;
            detailName.text = r.displayName;
            detailMeta.text = $"결과 ×{r.resultCount} · {r.seconds * station.CraftTimeScale:0.#}초 · 보유 {inv.Count(r.resultId)}";
            for (int i = 0; i < ingredientRows.Length; i++)
            {
                IngredientRow row = ingredientRows[i];
                row.root.SetActive(i < r.ingredients.Count);
                if (i >= r.ingredients.Count) continue;
                Ingredient ing = r.ingredients[i];
                int have = inv.Count(ing.itemId);
                bool lack = have < ing.count;
                row.icon.sprite = station.Icon(ing.itemId);
                row.nameLabel.text = station.DisplayName(ing.itemId);
                row.count.text = $"{have} / {ing.count}";                       // 보유 / 필요
                row.count.color = lack ? shortColor : Color.white;
                row.tag.text = lack ? $"✕ {ing.count - have}개 부족" : "✓ 충분";   // 색 + 기호 + 글자
                row.tag.color = lack ? shortColor : okColor;
                row.bar.fillAmount = Mathf.Clamp01(have / (float)ing.count);
            }

            RecipeStatus st = status[r];
            bool full = station.Queue.Count >= station.QueueSize;
            craftButton.interactable = st.CanCraft && !full;
            if (full) reason.text = $"✕ 대기열 가득 참 ({station.Queue.Count}/{station.QueueSize})";
            else if (st.CanCraft) reason.text = $"✓ 지금 재료로 ×{st.MaxCount} 가능";
            else
            {
                var parts = new List<string>();
                foreach ((string id, int have, int need) in st.Missing) parts.Add($"{station.DisplayName(id)} {need - have}개");
                reason.text = "✕ " + string.Join(", ", parts) + " 부족";
            }
            reason.color = craftButton.interactable ? okColor : shortColor;
        }

        public void Craft()
        {
            if (Selected != null) station.Enqueue(Selected);   // 실패하면 reason 이 이미 이유를 보여 주고 있다
        }

        void RefreshQueue()
        {
            for (int i = 0; i < queueSlots.Length; i++)
            {
                QueueSlot slot = queueSlots[i];
                slot.root.SetActive(i < Mathf.Max(station.QueueSize, station.Queue.Count));
                bool has = i < station.Queue.Count;
                slot.icon.enabled = has;
                if (has) slot.icon.sprite = station.Queue[i].Recipe.icon;
                slot.cancel.gameObject.SetActive(has);
                slot.nameLabel.text = has ? station.Queue[i].Recipe.displayName : "빈 칸";
                slot.fill.fillAmount = has ? station.Queue[i].Progress : 0f;
                slot.time.text = has && i > 0 ? "대기" : "";
            }
            RefreshDetail();   // 대기열이 차면 제작 버튼의 이유가 바뀐다
        }

        void SetTab(int t)
        {
            tab = t;
            PaintTabs();
            RebuildList();
            SyncSelection(force: true);
        }

        void PaintTabs()
        {
            for (int i = 0; i < tabButtons.Length; i++) tabButtons[i].targetGraphic.color = i == tab ? tabOn : tabOff;
        }

        void Update()
        {
            // 진행 바: 맨 앞 작업만 매 프레임 칠한다
            if (station.Queue.Count > 0)
            {
                CraftingStation.Job job = station.Queue[0];
                queueSlots[0].fill.fillAmount = job.Progress;
                queueSlots[0].time.text = $"{Mathf.Max(0f, job.Duration - job.Elapsed):0.0}초";
            }

            if (search.isFocused) return;   // 검색창에 입력 중이면 Q · E · F 는 글자다
            Keyboard kb = Keyboard.current;
            Gamepad pad = Gamepad.current;
            if (kb != null && kb.qKey.wasPressedThisFrame || pad != null && pad.leftShoulder.wasPressedThisFrame) SetTab((tab + 3) % 4);
            if (kb != null && kb.eKey.wasPressedThisFrame || pad != null && pad.rightShoulder.wasPressedThisFrame) SetTab((tab + 1) % 4);
            if (kb != null && kb.fKey.wasPressedThisFrame || pad != null && pad.buttonNorth.wasPressedThisFrame) craftableOnly.isOn = !craftableOnly.isOn;
            if (kb != null && kb.backspaceKey.wasPressedThisFrame || pad != null && pad.buttonWest.wasPressedThisFrame) station.Cancel(station.Queue.Count - 1);
        }
    }
}
