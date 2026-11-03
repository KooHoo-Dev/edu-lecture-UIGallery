// 시험용 입력 (새 Input System) — 갤러리 이벤트와 같은 동작을 키 · 패드로. 노드 고르기 · 습득(Submit)은 EventSystem 이 맡는다.
// 키: L 살 수 있는 노드 하나 습득 · Backspace 고른 노드 되돌리기 · R 전체 초기화 · = / − 확대 · 축소 · F 맞춤 · P 자동 데모
// 패드: 왼쪽 버튼 = 되돌리기 · 위쪽 버튼 = 맞춤 · 오른쪽 어깨 / 왼쪽 어깨 = 확대 / 축소
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.SkillTree
{
    public class SkillTreeDemo : MonoBehaviour
    {
        [SerializeField] SkillTreeView view;
        [SerializeField] bool autoplay = true;
        [SerializeField] float interval = 1.4f;

        float timer;
        int idle;

        void Update()
        {
            if (view.Progress == null) return;
            bool touched = false;
            Keyboard kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.lKey.wasPressedThisFrame) view.LearnAny();
                if (kb.backspaceKey.wasPressedThisFrame) view.RefundSelected();
                if (kb.rKey.wasPressedThisFrame) view.ResetAll();
                if (kb.equalsKey.wasPressedThisFrame || kb.numpadPlusKey.wasPressedThisFrame) view.ZoomBy(1.25f);
                if (kb.minusKey.wasPressedThisFrame || kb.numpadMinusKey.wasPressedThisFrame) view.ZoomBy(0.8f);
                if (kb.fKey.wasPressedThisFrame) view.Fit();
                if (kb.pKey.wasPressedThisFrame) autoplay = !autoplay;
                touched |= kb.anyKey.wasPressedThisFrame;
            }
            Gamepad pad = Gamepad.current;
            if (pad != null)
            {
                // 버튼 이름은 위치로 (buttonWest = 왼쪽). 한 번 누르면 한 번만 — wasPressedThisFrame
                if (pad.buttonWest.wasPressedThisFrame) view.RefundSelected();
                if (pad.buttonNorth.wasPressedThisFrame) view.Fit();
                if (pad.rightShoulder.wasPressedThisFrame) view.ZoomBy(1.25f);
                if (pad.leftShoulder.wasPressedThisFrame) view.ZoomBy(0.8f);
                touched |= pad.wasUpdatedThisFrame && (pad.buttonSouth.isPressed || pad.leftStick.ReadValue().sqrMagnitude > 0.25f);
            }
            // 마우스 누름 · 휠 · 터치도 — 안 그러면 끄는 중인 지도를 자동 데모가 당긴다
            Mouse m = Mouse.current;
            touched |= m != null && (m.leftButton.isPressed || m.rightButton.isPressed || m.scroll.ReadValue().y != 0f);
            touched |= Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed;
            if (touched) timer = -4f;   // 사람이 만지면 자동 데모를 잠시 쉰다

            if (!autoplay) return;
            timer += Time.unscaledDeltaTime;
            if (timer < interval) return;
            timer = 0f;
            // 살 수 있는 것을 하나씩 사다가, 더 없으면 두 박자 쉬고 전체 초기화(환불)
            if (view.LearnAny()) idle = 0;
            else if (++idle >= 2)
            {
                idle = 0;
                view.ResetAll();
            }
        }
    }
}
