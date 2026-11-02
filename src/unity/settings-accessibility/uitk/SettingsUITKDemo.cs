using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// UI Toolkit 버전 테스트 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1 시각 프리셋 · 2 옵션 하나 직접 바꾸기 · 3 대사 재생 · 4 피격(흔들림은 SettingsPreview 와 같은 방식) · 5 고대비 빠른 전환 · 6 기본값 복원
    /// </summary>
    public class SettingsUITKDemo : MonoBehaviour
    {
        [SerializeField] SettingsMenuUITK menu;
        [SerializeField] Transform previewCamera;

        static readonly (string who, string line, int voice, int dir)[] Lines =
        {
            ("하린", "저 언덕 너머에 보급 상자가 있어. 내가 엄호할게.", 0, 0),
            ("도윤", "왼쪽에 둘 더 있어! 몸 낮춰!", 1, -1),
            ("하린", "좋아, 신호하면 같이 움직이자.", 0, 0),
            ("도윤", "뒤쪽은 내가 막을게. 서둘러.", 1, 1),
        };
        int lineIndex;
        float shakeTime;
        Vector3 cameraHome;

        void Start() => cameraHome = previewCamera ? previewCamera.localPosition : Vector3.zero;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.digit1Key.wasPressedThisFrame) menu.ApplyPreset(0);
                if (kb.digit2Key.wasPressedThisFrame)
                {
                    int v = menu.Settings.Get(AccessibilitySettings.Key.TextScale);
                    menu.Settings.Set(AccessibilitySettings.Key.TextScale, v > 120 ? v - 10 : v + 10);
                }
                if (kb.digit3Key.wasPressedThisFrame)
                {
                    var l = Lines[lineIndex++ % Lines.Length];
                    menu.PlayLine(l.who, l.line, l.voice, l.dir);
                }
                if (kb.digit4Key.wasPressedThisFrame) shakeTime = 0.3f;
                if (kb.digit5Key.wasPressedThisFrame) menu.ToggleQuickContrast();
                if (kb.digit6Key.wasPressedThisFrame) menu.OpenReset();
            }

            // 피격 흔들림: 진폭 = 카메라 흔들림 값. 일시정지 메뉴라 unscaledDeltaTime
            if (previewCamera && shakeTime > 0f)
            {
                shakeTime = Mathf.Max(0f, shakeTime - Time.unscaledDeltaTime);
                float amp = menu.Settings.Get(AccessibilitySettings.Key.CameraShake) * 0.02f * (shakeTime / 0.3f);
                float t = Time.unscaledTime;
                previewCamera.localPosition = cameraHome + new Vector3(Mathf.Sin(t * 70f), Mathf.Cos(t * 53f) * 0.6f, 0f) * amp;
            }
        }
    }
}
