using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 테스트용 입력 (UI Toolkit 버전) — 갤러리와 같은 숫자키.
    /// 1 넘기기 · 2 빨리감기(누르고 있는 동안) · 3 선택지 포커스 이동 · 4 선택 확정 · 5 대화 기록 · 6 처음부터
    /// </summary>
    public class DialogueUITKDemo : MonoBehaviour
    {
        [SerializeField] DialogueUITK view;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.digit1Key.wasPressedThisFrame) view.Advance();
            view.ForceFastForward = kb.digit2Key.isPressed;
            if (kb.digit3Key.wasPressedThisFrame) view.MoveFocus(1);
            if (kb.digit4Key.wasPressedThisFrame) view.ConfirmFocused();
            if (kb.digit5Key.wasPressedThisFrame) view.ToggleLog();
            if (kb.digit6Key.wasPressedThisFrame) view.Begin();
        }
    }
}
