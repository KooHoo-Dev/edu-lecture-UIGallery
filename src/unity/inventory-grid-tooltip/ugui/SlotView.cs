using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.InventoryGridTooltip
{
    // 인벤토리 칸 하나. Selectable 을 상속해 '마우스 호버'와 '패드·키보드 포커스'를
    // 같은 InventoryScreen.FocusSlot() 으로 보낸다 → 입력 장치가 달라도 툴팁 상태는 하나.
    public class SlotView : Selectable, ISubmitHandler, IPointerClickHandler
    {
        [SerializeField] Image rarityFrame;
        [SerializeField] Image cornerMark;
        [SerializeField] Image icon;
        [SerializeField] TMP_Text corner;        // 장비 점수 또는 ×수량
        [SerializeField] GameObject upgradeMark;  // ▲ 장착품보다 좋음
        [SerializeField] GameObject newBadge;
        [SerializeField] Image delayBar;          // Filled · Horizontal — 툴팁 지연 표시
        [SerializeField] CanvasGroup group;       // 필터에서 빠지면 흐리게

        public InventoryItem Item { get; private set; }
        public InventoryScreen Owner { get; set; }
        public int Index { get; set; }

        public void Bind(InventoryItem item, RarityStyle style, InventoryItem equippedSameSlot, bool isNew)
        {
            Item = item;
            var tier = style.Get(item.rarity);
            rarityFrame.sprite = tier.frame;           // 모양
            rarityFrame.color = tier.color;            // 색
            cornerMark.sprite = tier.cornerMark;       // 모서리 표식
            cornerMark.enabled = tier.cornerMark != null;
            cornerMark.color = tier.color;
            icon.sprite = item.icon;
            corner.text = item.IsEquipment ? item.Score.ToString() : $"×{item.quantity}";
            upgradeMark.SetActive(item.IsEquipment && equippedSameSlot != null && item.Score > equippedSameSlot.Score);
            newBadge.SetActive(isNew);
            SetDelay(0f);
        }

        public void SetFiltered(bool visible) => group.alpha = visible ? 1f : 0.25f;

        public void SetDelay(float t01)
        {
            delayBar.enabled = t01 > 0f;
            delayBar.fillAmount = t01;
        }

        public void HideNewBadge() => newBadge.SetActive(false);

        // ───── 입력: 모두 같은 상태로 모은다 ─────
        public override void OnPointerEnter(PointerEventData e)
        {
            base.OnPointerEnter(e);
            Owner.FocusSlot(this, isHover: true);
        }

        public override void OnPointerExit(PointerEventData e)
        {
            base.OnPointerExit(e);
            Owner.BlurSlot(this);
        }

        public override void OnSelect(BaseEventData e)
        {
            base.OnSelect(e);
            Owner.FocusSlot(this, isHover: false);
        }

        public override void OnDeselect(BaseEventData e)
        {
            base.OnDeselect(e);
            Owner.BlurSlot(this);
        }

        public void OnSubmit(BaseEventData e) => Owner.Equip(this);

        public void OnPointerClick(PointerEventData e)
        {
            if (e.button == PointerEventData.InputButton.Right) Owner.Equip(this);
        }
    }
}
