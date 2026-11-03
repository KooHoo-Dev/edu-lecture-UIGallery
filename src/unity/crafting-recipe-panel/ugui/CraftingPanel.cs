using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.CraftingRecipePanel
{
    // 제작 창 (UGUI). 껐다 켜는 창에 붙인다. Inventory.Changed → RecomputeAll. 보기 상태는 필드에 남는다.
    public class CraftingPanel : MonoBehaviour
    {
        [Serializable]
        public class IngredientRow
        {
            public GameObject root;
            public Image icon;
            public TMP_Text nameLabel, count, tag;   // "3 / 5" · "✕ 2개 부족"
            public Image bar;                        // Filled
        }

        [Serializable]
        public class QueueSlot
        {
            public GameObject root;
            public Image icon, fill;                 // fill: Filled
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

        // 저장되는 보기 상태
        int tab;
        readonly Recipe[] selectedByTab = new Recipe[4];
        float savedScroll = 1f;   // 1 = 맨 위
        bool hasSaved;

        Recipe shown;   // 표시한 선택. 고른 것이 가려지면 첫 줄로 대체 (selectedByTab 은 그대로)
        Recipe keep;    // 필터를 켠 채 건 레시피 — 선택을 바꿀 때까지 ✕ 줄로 남긴다
        bool auto, listDirty;   // auto: SyncSelection 이 준 선택 (선택 · 배지를 안 바꾼다)

        void Awake()
        {
            for (int i = 0; i < tabButtons.Length; i++)
            {
                int t = i;
                tabButtons[i].onClick.AddListener(() => SetTab(t));
            }
            search.onValueChanged.AddListener(_ => ViewChanged());
            craftableOnly.onValueChanged.AddListener(_ => ViewChanged());
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
                search.SetTextWithoutNotify("");
                keep = null;
            }
            RecomputeAll();   // 닫혀 있던 동안의 변화도 반영
            RefreshQueue();
            PaintTabs();
            StartCoroutine(RestoreScroll());
        }

        // 레이아웃이 끝난 다음 프레임에 넣어야 먹는다
        IEnumerator RestoreScroll()
        {
            yield return null;
            scroll.verticalNormalizedPosition = savedScroll;
            SyncSelection(force: true);   // 선택이 보이게
        }

        void OnDisable()
        {
            // 안 풀면 열 때마다 구독이 쌓인다
            station.Inventory.Changed -= OnInventoryChanged;
            station.QueueChanged -= RefreshQueue;
            station.Unlocked -= OnUnlocked;
            savedScroll = scroll.verticalNormalizedPosition;
            hasSaved = true;
        }

        void OnInventoryChanged(string reason) => RecomputeAll();
        void OnUnlocked(Recipe r) => RecomputeAll();

        void ViewChanged()
        {
            keep = null;
            RebuildList();
        }

        /// 무엇이 바뀌었든 전부 다시 계산 — 목록 · 상세 · 버튼이 같은 상태를 본다
        void RecomputeAll()
        {
            status.Clear();
            foreach (Recipe r in station.Recipes) status[r] = r.Evaluate(station.Inventory);
            for (int i = 0; i < stockLabels.Length; i++) stockLabels[i].text = station.Inventory.Count(stockIds[i]).ToString();
            RebuildList();
        }

        bool Visible(Recipe r, int t)
        {
            if (!station.IsUnlocked(r) || t > 0 && (int)r.tab != t - 1) return false;
            string q = search.text.Trim();
            if (q.Length > 0 && !r.displayName.Contains(q)) return false;
            return !craftableOnly.isOn || status[r].CanCraft || r == keep;
        }

        /// 줄 재사용. 순서는 레시피 순서 그대로 (상태가 바뀌어도 줄이 옮기지 않는다)
        void RebuildList()
        {
            int n = 0;
            foreach (Recipe r in station.Recipes)
            {
                if (!Visible(r, tab)) continue;
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
            Recipe want = selectedByTab[tab];
            shown = want != null && Visible(want, tab) ? want : n > 0 ? rows[0].Recipe : null;
            PaintTabBadges();
            SyncSelection(force: false);
            RefreshDetail();
        }

        /// 보이는 줄만 센다 (가려진 배지는 지울 수 없다)
        void PaintTabBadges()
        {
            for (int t = 0; t < tabNewBadges.Length; t++)
            {
                bool any = false;
                foreach (Recipe r in station.Recipes) any |= station.IsNew(r) && Visible(r, t);
                tabNewBadges[t].SetActive(any);
            }
        }

        /// 선택을 '레시피' 기준으로 다시 맞춘다. force 가 아니면 검색창 포커스를 뺏지 않는다
        void SyncSelection(bool force)
        {
            RecipeRowView target = rows.Find(v => v.gameObject.activeSelf && v.Recipe == shown);
            foreach (RecipeRowView v in rows) v.SetSelectedLook(v == target);
            EventSystem es = EventSystem.current;
            if (es == null || target == null) return;
            GameObject cur = es.currentSelectedGameObject;
            bool listHasFocus = cur == null || cur.GetComponent<RecipeRowView>() != null;
            if ((force || listHasFocus) && cur != target.gameObject)
            {
                auto = true;
                es.SetSelectedGameObject(target.gameObject);
                auto = false;
            }
            if (force)
            {
                Canvas.ForceUpdateCanvases();
                ScrollIntoView((RectTransform)target.transform);
            }
        }

        /// 사람이 고른 것만 저장하고 배지를 지운다
        public void Select(RecipeRowView row)
        {
            if (auto) return;
            shown = selectedByTab[tab] = row.Recipe;
            if (keep != null && keep != row.Recipe)
            {
                keep = null;
                listDirty = true;   // ✕ 줄은 다음 프레임에 뺀다
            }
            if (station.IsNew(row.Recipe))
            {
                station.MarkSeen(row.Recipe);
                row.SetNew(false);
                PaintTabBadges();
            }
            foreach (RecipeRowView v in rows) v.SetSelectedLook(v == row);
            ScrollIntoView((RectTransform)row.transform);
            RefreshDetail();
        }

        /// ScrollRect 는 선택을 따라가지 않으므로 content 를 직접 옮긴다
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
            Recipe r = shown;
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
                row.count.text = $"{have} / {ing.count}";
                row.count.color = lack ? shortColor : Color.white;
                row.tag.text = lack ? $"✕ {ing.count - have}개 부족" : "✓ 충분";   // 색 + 기호 + 글자
                row.tag.color = lack ? shortColor : okColor;
                row.bar.fillAmount = Mathf.Clamp01(have / (float)ing.count);
            }

            reason.text = station.Reason(status[r], out bool ok);
            reason.color = ok ? okColor : shortColor;
            craftButton.interactable = ok;
        }

        /// 건 레시피를 선택으로 굳혀 남긴다 — 줄이 빠져 다음 제작이 다른 레시피를 걸지 않게
        public void Craft()
        {
            if (shown == null) return;
            keep = selectedByTab[tab] = shown;
            station.Enqueue(shown);   // 실패 이유는 reason 이 보여 준다
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
            RefreshDetail();   // 가득 차면 이유가 바뀐다
        }

        void SetTab(int t)
        {
            tab = t;
            keep = null;
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
            if (listDirty)
            {
                listDirty = false;
                RebuildList();
            }
            // 맨 앞 작업만 매 프레임 칠한다
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
