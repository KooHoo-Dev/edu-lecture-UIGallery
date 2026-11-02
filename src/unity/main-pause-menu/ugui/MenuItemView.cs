using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 메뉴 항목 하나 (Button 과 같은 오브젝트).
    /// - 선택되면 패널의 포커스 막대 · 시선 유도선이 이 항목으로 온다
    /// - 마우스가 올라오면 Select() — 마우스 호버도 키보드·패드와 '같은 포커스 하나'로 통일
    /// - 하위 패널을 여는 항목은 target 을, 그 밖의 동작은 Button.onClick 에 연결한다
    /// </summary>
    [RequireComponent(typeof(Selectable))]
    public class MenuItemView : MonoBehaviour, ISelectHandler, IPointerEnterHandler
    {
        [SerializeField] MenuPanel owner;
        [SerializeField] MenuStack stack;
        [SerializeField, Tooltip("확정하면 push 할 하위 패널 (없으면 Button.onClick 만)")] MenuPanel target;
        [SerializeField] GuideLine guide;

        Selectable selectable;

        void Awake()
        {
            selectable = GetComponent<Selectable>();
            if (target && selectable is Button b) b.onClick.AddListener(() => stack.Push(target));
        }

        public void OnSelect(BaseEventData eventData)
        {
            owner.FocusOn((RectTransform)transform);
            stack.Remember(owner, gameObject);
            if (guide) guide.From = (RectTransform)transform;
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            // 전환 중이거나 비활성 항목이면 무시
            if (stack.IsBusy || !selectable.IsInteractable()) return;
            selectable.Select();
        }
    }
}
