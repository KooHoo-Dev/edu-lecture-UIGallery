using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 마지막으로 실제 입력이 들어온 장치를 기준으로 모든 버튼 안내를 한꺼번에 바꾼다.
    /// PlayerInput(Behavior: Invoke C Sharp Events, 스킴: Keyboard&amp;Mouse / Gamepad / Touch)의 onControlsChanged 를 받는다.
    /// 전환 뒤 0.25초는 다시 바꾸지 않는다 — 스틱 잡음으로 안내가 깜빡이지 않게.
    /// </summary>
    public class InputGlyphSwitcher : MonoBehaviour
    {
        public enum GlyphDevice { Keyboard, Gamepad, Touch }

        [SerializeField] PlayerInput playerInput;
        [SerializeField] SkillBar bar;
        [SerializeField] float debounceSeconds = 0.25f;
        [SerializeField] GlyphDevice startDevice = GlyphDevice.Keyboard;

        GlyphDevice current, pending;
        float lastSwitchTime = -10f;

        public GlyphDevice Current => current;

        void Start()
        {
            current = pending = startDevice;
            bar.SetDevice(current);
        }

        void OnEnable()
        {
            if (playerInput) playerInput.onControlsChanged += OnControlsChanged;
        }

        void OnDisable()
        {
            if (playerInput) playerInput.onControlsChanged -= OnControlsChanged;
        }

        void OnControlsChanged(PlayerInput input) => Request(FromScheme(input.currentControlScheme));

        static GlyphDevice FromScheme(string scheme) => scheme switch
        {
            "Gamepad" => GlyphDevice.Gamepad,
            "Touch" => GlyphDevice.Touch,
            _ => GlyphDevice.Keyboard,
        };

        public void Request(GlyphDevice device)
        {
            // 터치 화면 버튼(On-Screen Control)은 가상 Gamepad 를 만든다.
            // 터치 배치가 켜진 채 화면을 누르고 있는 동안 들어온 Gamepad 전환은 무시한다 (강사 확인 권장)
            if (current == GlyphDevice.Touch && device == GlyphDevice.Gamepad
                && Touchscreen.current != null && Touchscreen.current.primaryTouch.press.isPressed)
                return;
            pending = device;
        }

        /// <summary>테스트용: 키보드 → 패드 → 터치 순환</summary>
        public void Cycle()
        {
            pending = (GlyphDevice)(((int)current + 1) % 3);
            lastSwitchTime = -10f;
        }

        void Update()
        {
            if (pending == current) return;
            if (Time.unscaledTime - lastSwitchTime < debounceSeconds) return;
            current = pending;
            lastSwitchTime = Time.unscaledTime;
            bar.SetDevice(current);   // 모든 슬롯이 같은 프레임에 바뀐다
        }
    }
}
