using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.InventoryGridTooltip
{
    // 인벤토리 화면: 아이템 목록 · 장착품 · 정렬 · 필터 · 툴팁 지연 · 장착 교체 · 포커스 따라 스크롤.
    // 칸(SlotView)은 화면을 직접 바꾸지 않고 FocusSlot / BlurSlot / Equip 만 부른다.
    public class InventoryScreen : MonoBehaviour
    {
        public enum SortKey { Rarity, Score, Type, Acquired }

        [Header("데이터")]
        [SerializeField] List<InventoryItem> items = new();                // 획득 순서 그대로 둔다
        [SerializeField] InventoryItem[] equipped = new InventoryItem[4];   // Head · Body · Hand · Power
        [SerializeField] RarityStyle style;

        [Header("화면")]
        [SerializeField] SlotView slotPrefab;
        [SerializeField] ScrollRect scroll;
        [SerializeField] GridLayoutGroup grid;
        [SerializeField] SlotView[] equipSlots = new SlotView[4];
        [SerializeField] TooltipView tooltip;
        [SerializeField] TMP_Text sortLabel;
        [SerializeField] TMP_Text filterLabel;

        [Header("조절 값")]
        [SerializeField, Range(4, 9)] int columns = 6;
        [SerializeField, Range(0f, 0.8f)] float tooltipDelay = 0.25f;   // 호버 기준. 포커스는 절반
        [SerializeField] SortKey sortBy = SortKey.Rarity;

        readonly List<InventoryItem> view = new();   // 화면에 보이는 순서 (정렬 결과)
        readonly List<SlotView> slots = new();
        readonly HashSet<InventoryItem> newItems = new();
        Rarity minRarity = Rarity.Common;
        SlotView focused;
        Coroutine pending;

        void Start()
        {
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = columns;
            for (int i = 0; i < equipSlots.Length; i++) equipSlots[i].Owner = this;
            Rebuild();
            if (slots.Count > 0) Select(slots[0]);
        }

        // ───────── 목록 ─────────

        void Rebuild()
        {
            Sort();
            // 칸 수를 맞추고(풀처럼 재사용), 정렬된 순서대로 내용을 다시 넣는다
            while (slots.Count < view.Count)
            {
                var s = Instantiate(slotPrefab, grid.transform);
                s.Owner = this;
                slots.Add(s);
            }
            for (int i = 0; i < slots.Count; i++)
            {
                bool used = i < view.Count;
                slots[i].gameObject.SetActive(used);
                if (!used) continue;
                var it = view[i];
                slots[i].Index = i;
                slots[i].Bind(it, style, EquippedFor(it), newItems.Contains(it));
                slots[i].SetFiltered(it.rarity >= minRarity);
            }
            for (int i = 0; i < equipSlots.Length; i++)
                if (equipped[i] != null) equipSlots[i].Bind(equipped[i], style, null, false);

            sortLabel.text = "정렬: " + SortName(sortBy);
            filterLabel.text = minRarity == Rarity.Common ? "필터: 전체" : "필터: 정예 이상";
        }

        void Sort()
        {
            // 같은 값끼리 순서가 흔들리지 않게 획득 순서를 마지막 기준으로 둔다
            var order = new Dictionary<InventoryItem, int>();
            for (int i = 0; i < items.Count; i++) order[items[i]] = i;
            view.Clear();
            view.AddRange(items);
            if (sortBy == SortKey.Acquired) return;
            view.Sort((a, b) =>
            {
                int c = sortBy switch
                {
                    SortKey.Rarity => b.rarity.CompareTo(a.rarity) != 0 ? b.rarity.CompareTo(a.rarity) : a.slot.CompareTo(b.slot),
                    SortKey.Score => b.Score.CompareTo(a.Score),
                    _ => a.slot.CompareTo(b.slot) != 0 ? a.slot.CompareTo(b.slot) : b.rarity.CompareTo(a.rarity),
                };
                return c != 0 ? c : order[a].CompareTo(order[b]);
            });
        }

        InventoryItem EquippedFor(InventoryItem it) => it.IsEquipment ? equipped[(int)it.slot] : null;
        bool IsEquipSlot(SlotView s) => System.Array.IndexOf(equipSlots, s) >= 0;

        // ───────── 포커스 · 툴팁 ─────────

        public void FocusSlot(SlotView s, bool isHover)
        {
            if (s.Item == null) return;
            focused = s;
            if (!isHover) ScrollIntoView(s);
            if (pending != null) StopCoroutine(pending);

            // 툴팁이 이미 떠 있으면 이웃 칸으로 옮길 때 지연 없이 바로 바꾼다
            if (tooltip.IsOpen) ShowFor(s);
            else pending = StartCoroutine(ShowAfter(s, isHover ? tooltipDelay : tooltipDelay * 0.5f));
        }

        public void BlurSlot(SlotView s)
        {
            if (s != focused) return;
            if (pending != null) StopCoroutine(pending);
            s.SetDelay(0f);
            // 다음 칸의 FocusSlot 이 같은 프레임에 오므로 한 프레임 기다렸다가 아무 데도 포커스가 없을 때만 닫는다
            StartCoroutine(HideIfNoFocus(s));
        }

        IEnumerator ShowAfter(SlotView s, float delay)
        {
            for (float t = 0f; t < delay; t += Time.unscaledDeltaTime)
            {
                s.SetDelay(t / delay);
                yield return null;
            }
            s.SetDelay(0f);
            ShowFor(s);
        }

        IEnumerator HideIfNoFocus(SlotView s)
        {
            yield return null;
            if (focused == s) { focused = null; tooltip.Hide(); }
        }

        void ShowFor(SlotView s)
        {
            bool isEquipped = IsEquipSlot(s);
            tooltip.Show(s.Item, isEquipped ? null : EquippedFor(s.Item), (RectTransform)s.transform, isEquipped);
            if (newItems.Remove(s.Item)) s.HideNewBadge();   // 툴팁을 한 번 열면 '새' 배지가 사라진다
        }

        /// ScrollRect 는 게임패드 포커스를 따라가지 않는다 → 포커스 칸의 줄이 보이도록 직접 맞춘다
        void ScrollIntoView(SlotView s)
        {
            if (IsEquipSlot(s)) return;
            float pitch = grid.cellSize.y + grid.spacing.y;
            float top = grid.padding.top + (s.Index / columns) * pitch;
            float bottom = top + grid.cellSize.y;
            float viewH = scroll.viewport.rect.height;
            Vector2 pos = scroll.content.anchoredPosition;   // Content 피벗 위쪽: y 가 클수록 아래로 스크롤
            if (top < pos.y) pos.y = top;
            else if (bottom > pos.y + viewH) pos.y = bottom - viewH;
            scroll.content.anchoredPosition = pos;
        }

        // ───────── 동작 (InventoryDemo · 입력 액션에서 호출) ─────────

        public void Equip(SlotView s)
        {
            if (s == null || IsEquipSlot(s) || !s.Item.IsEquipment) return;
            var it = s.Item;
            int k = (int)it.slot;
            var old = equipped[k];
            equipped[k] = it;
            if (old != null) items[items.IndexOf(it)] = old;   // 같은 자리에 이전 장착품을 넣는다 (1:1 교체)
            else items.Remove(it);
            Rebuild();
            // 포커스는 방금 내려놓은 아이템을 따라간다 → 툴팁의 ▲▼ 가 뒤집혀 보인다
            var back = slots.Find(x => x.gameObject.activeSelf && x.Item == old);
            Select(back);
            Refresh();
        }

        public void EquipFocused() => Equip(focused);

        public void CycleSort()
        {
            var keep = focused != null ? focused.Item : null;
            sortBy = (SortKey)(((int)sortBy + 1) % 4);
            Rebuild();
            // 칸 번호가 아니라 보던 아이템을 따라간다
            var again = slots.Find(x => x.gameObject.activeSelf && x.Item == keep);
            Select(again);
            Refresh();
        }

        public void ToggleRarityFilter()
        {
            minRarity = minRarity == Rarity.Common ? Rarity.Elite : Rarity.Common;
            Rebuild();   // 빠진 아이템은 지우지 않고 흐리게 → 자리가 흔들리지 않는다
        }

        public void AddLoot(InventoryItem item)
        {
            items.Add(item);
            newItems.Add(item);
            Rebuild();
        }

        /// 오른쪽 끝 열에서 가장 아래 있는 장비 칸 (가장자리 보정 시험용)
        public void FocusEdgeSlot()
        {
            SlotView pick = null;
            foreach (var s in slots)
                if (s.gameObject.activeSelf && s.Index % columns == columns - 1 && s.Item.IsEquipment) pick = s;
            Select(pick);
        }

        /// 같은 칸 오브젝트가 계속 선택돼 있으면 OnSelect 가 다시 오지 않으므로 툴팁 내용을 직접 갱신한다
        void Refresh()
        {
            if (focused != null && focused.gameObject.activeSelf && tooltip.IsOpen) ShowFor(focused);
        }

        static void Select(SlotView s)
        {
            // OnEnable·Start 순서에 따라 EventSystem.current 가 아직 없을 수 있다
            if (s != null && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(s.gameObject);
        }

        static string SortName(SortKey k) => k switch
        {
            SortKey.Rarity => "희귀도",
            SortKey.Score => "장비 점수",
            SortKey.Type => "종류",
            _ => "획득순",
        };
    }
}
