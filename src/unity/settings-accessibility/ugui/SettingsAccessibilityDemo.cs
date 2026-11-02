using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1 시각 프리셋 · 2 옵션 하나 직접 바꾸기 · 3 대사 재생 · 4 피격(흔들림) · 5 고대비 빠른 전환 · 6 기본값 복원
    /// </summary>
    public class SettingsAccessibilityDemo : MonoBehaviour
    {
        [SerializeField] SettingsMenu menu;
        [SerializeField] SettingsPreview preview;

        static readonly (string who, string line, int voice, int dir)[] Lines =
        {
            ("하린", "저 언덕 너머에 보급 상자가 있어. 내가 엄호할게.", 0, 0),
            ("도윤", "왼쪽에 둘 더 있어! 몸 낮춰!", 1, -1),
            ("하린", "좋아, 신호하면 같이 움직이자.", 0, 0),
            ("도윤", "뒤쪽은 내가 막을게. 서둘러.", 1, 1),
        };
        int lineIndex;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.digit1Key.wasPressedThisFrame) menu.ApplyPreset(0);
            if (kb.digit2Key.wasPressedThisFrame)
            {
                // 프리셋 뒤 한 값만 고친다 → 상태 라벨이 '프리셋 · 수정됨' 으로
                var s = menu.Settings;
                int v = s.Get(AccessibilitySettings.Key.TextScale);
                s.Set(AccessibilitySettings.Key.TextScale, v > 120 ? v - 10 : v + 10);
            }
            if (kb.digit3Key.wasPressedThisFrame)
            {
                var l = Lines[lineIndex++ % Lines.Length];
                preview.PlayLine(l.who, l.line, l.voice, l.dir);
            }
            if (kb.digit4Key.wasPressedThisFrame) preview.HitTest();
            if (kb.digit5Key.wasPressedThisFrame) menu.ToggleQuickContrast();
            if (kb.digit6Key.wasPressedThisFrame) menu.OpenReset();
        }
    }
}
