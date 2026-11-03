using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.CraftingRecipePanel
{
    // 레시피 목록 한 줄. Selectable 이지만 transition = None 이라 선택 표시(SelectFrame)를
    // OnSelect / OnDeselect 에서 직접 그린다 — 안 그리면 키보드 · 패드로 고른 줄이 보이지 않는다.
    // 클릭 · 패드 · 키보드 선택은 모두 Owner.Select(this) 하나로 모인다.
    public class RecipeRowView : Selectable, ISubmitHandler, IPointerClickHandler
    {
        [SerializeField] Image icon;
        [SerializeField] TMP_Text nameLabel;
        [SerializeField] TMP_Text stateLabel;   // "✓ ×2 가능" / "✕ 1종 부족" — 색 + 기호 + 글자
        [SerializeField] Image okBar;           // 만들 수 있는 줄의 왼쪽 띠
        [SerializeField] Image selectFrame;
        [SerializeField] GameObject newBadge;
        [SerializeField] CanvasGroup content;   // 못 만드는 줄의 아이콘 · 이름을 흐리게
        [SerializeField] Color okColor = new(0.37f, 0.89f, 0.6f);
        [SerializeField] Color shortColor = new(1f, 0.62f, 0.62f);

        public Recipe Recipe { get; private set; }
        public CraftingPanel Owner { get; set; }

        protected override void Awake()
        {
            base.Awake();
            transition = Transition.None;
            if (selectFrame != null) selectFrame.enabled = false;
        }

        public void Bind(Recipe r, RecipeStatus st, bool isNew)
        {
            Recipe = r;
            icon.sprite = r.icon;
            nameLabel.text = r.displayName;
            stateLabel.text = st.CanCraft ? $"✓ ×{st.MaxCount} 가능" : $"✕ {st.Missing.Count}종 부족";
            stateLabel.color = st.CanCraft ? okColor : shortColor;
            okBar.enabled = st.CanCraft;
            content.alpha = st.CanCraft ? 1f : 0.6f;
            newBadge.SetActive(isNew);
        }

        public void SetNew(bool on) => newBadge.SetActive(on);
        public void SetSelectedLook(bool on) => selectFrame.enabled = on;

        public override void OnSelect(BaseEventData e)
        {
            base.OnSelect(e);
            selectFrame.enabled = true;
            Owner.Select(this);
        }

        public override void OnDeselect(BaseEventData e)
        {
            base.OnDeselect(e);
            selectFrame.enabled = false;
        }

        public void OnSubmit(BaseEventData e) => Owner.Craft();

        public void OnPointerClick(PointerEventData e)
        {
            if (e.clickCount >= 2) Owner.Craft();   // 한 번 = 고르기 (OnPointerDown 이 Select), 두 번 = 제작
        }
    }
}
