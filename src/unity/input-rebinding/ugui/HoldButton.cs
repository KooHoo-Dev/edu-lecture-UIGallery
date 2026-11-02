// 길게 눌러 확인하는 버튼 (전체 기본값 복원) — holdSeconds 동안 누르고 있어야 Completed. 중간에 떼면 처음부터.
// 마우스 · 터치는 포인터 누름, 키보드 · 패드는 이 버튼이 선택된 채 Enter · 패드 아래 버튼을 누르고 있는 동안.
using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.InputRebinding
{
    public class HoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        [SerializeField] float holdSeconds = 1f;
        [Tooltip("진행 표시 (Image Type = Filled, Horizontal)")]
        [SerializeField] Image fill;

        public event Action Completed;
        /// <summary>true 면 누르기를 받지 않고 진행을 버린다 (재설정 대기 · 충돌 창 중)</summary>
        public bool Blocked { get; set; }
        bool pointerHeld;
        bool waitRelease;
        float held;

        public void OnPointerDown(PointerEventData e) => pointerHeld = !Blocked;
        public void OnPointerUp(PointerEventData e) => pointerHeld = false;
        public void OnPointerExit(PointerEventData e) => pointerHeld = false;

        void Update()
        {
            bool selected = EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
            bool submitHeld = selected && ((Keyboard.current != null && Keyboard.current.enterKey.isPressed) || (Gamepad.current != null && Gamepad.current.buttonSouth.isPressed));
            if (Blocked) pointerHeld = false;
            bool down = !Blocked && (pointerHeld || submitHeld);
            // 한 번 채운 뒤에는 손을 뗄 때까지 다시 세지 않는다 (누른 채 두면 두 번 복원되지 않게)
            if (waitRelease)
            {
                waitRelease = down;
                held = 0f;
            }
            else if (down)
            {
                held += Time.unscaledDeltaTime;
                if (held >= holdSeconds)
                {
                    held = 0f;
                    waitRelease = true;
                    Completed?.Invoke();
                }
            }
            else held = 0f;
            if (fill != null) fill.fillAmount = held / holdSeconds;
        }
    }
}
