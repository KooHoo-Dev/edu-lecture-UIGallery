using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1 넘기기 · 2 빨리감기(누르고 있는 동안) · 3 선택지 포커스 이동 · 4 선택 확정 · 5 대화 기록 · 6 처음부터
    /// (실제 조작은 DialogueView 의 Input Action: Enter/F/L/R · 패드 아래/왼쪽/위/R 숄더)
    /// </summary>
    public class DialogueChoicesDemo : MonoBehaviour
    {
        [SerializeField] DialogueView view;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.digit1Key.wasPressedThisFrame) view.Advance();
            // 누르고 있는 동안만 빨리감기 — 선택지에서는 DialogueView 가 스스로 멈춘다
            if (kb.digit2Key.wasPressedThisFrame) view.FastForwardDown();
            if (kb.digit2Key.wasReleasedThisFrame) view.FastForwardUp();
            if (kb.digit3Key.wasPressedThisFrame) view.MoveFocus(1);
            if (kb.digit4Key.wasPressedThisFrame) view.ConfirmFocused();   // 잠금 중이면 무시된다
            if (kb.digit5Key.wasPressedThisFrame) view.ToggleLog();
            if (kb.digit6Key.wasPressedThisFrame) view.Begin();
        }
    }
}
