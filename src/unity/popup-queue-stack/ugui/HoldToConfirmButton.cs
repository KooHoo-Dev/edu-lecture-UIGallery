using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.PopupQueueStack
{
    /// <summary>
    /// 길게 눌러 확정하는 버튼 — 분해·판매처럼 되돌릴 수 없는 행동에.
    /// - 누르고 있는 동안 링(Image · Filled · Radial 360)이 채워지고, 다 차면 onConfirmed
    /// - 중간에 떼면 빠르게 되감긴다 (확정 직전에 떼도 '취소'로 읽힌다)
    /// - 키보드·패드: 이 버튼이 선택된 상태에서 Submit 을 누르고 있으면 같은 방식으로 채워진다
    /// 같은 오브젝트에 Button 을 붙여 선택(내비게이션)만 받게 하고, Button.onClick 은 비워 둔다.
    /// </summary>
    public class HoldToConfirmButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        [SerializeField] float holdSeconds = 0.8f;
        [SerializeField] Image ring;
        [Tooltip("UI/Submit 액션 (Enter · Space · 패드 아래 버튼)")]
        [SerializeField] InputActionReference submitAction;
        public UnityEvent onConfirmed;

        float progress;
        bool pointerHeld;
        /// <summary>확정 직후 손을 뗄 때까지 다시 채우지 않는다 (계속 누르고 있어도 한 번만 실행)</summary>
        bool waitRelease;

        public void OnPointerDown(PointerEventData e) => pointerHeld = true;
        public void OnPointerUp(PointerEventData e) => pointerHeld = false;
        public void OnPointerExit(PointerEventData e) => pointerHeld = false;

        void OnDisable()
        {
            pointerHeld = false;
            waitRelease = false;
            progress = 0f;
            Paint();
        }

        void Update()
        {
            bool selected = EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
            bool keyHeld = selected && submitAction != null && submitAction.action.IsPressed();
            bool held = pointerHeld || keyHeld;
            if (!held) waitRelease = false;

            if (held && !waitRelease)
            {
                progress += Time.unscaledDeltaTime / Mathf.Max(0.05f, holdSeconds);
                if (progress >= 1f)
                {
                    progress = 0f;
                    waitRelease = true;
                    onConfirmed.Invoke();
                }
            }
            else if (progress > 0f)
            {
                progress = Mathf.Max(0f, progress - Time.unscaledDeltaTime * 4f);
            }
            Paint();
        }

        void Paint()
        {
            if (ring != null) ring.fillAmount = progress;
        }
    }
}
