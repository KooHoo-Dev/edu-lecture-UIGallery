using TMPro;
using UnityEngine;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 옵션 행 하나: 이름 · 변경 표시 점 · ◀ 값 ▶ 위젯 · 설명 문자열.
    /// 위젯은 화면을 직접 바꾸지 않고 항상 설정 데이터에 값을 쓴다 (→ Changed → 미리보기).
    /// </summary>
    public class OptionRow : MonoBehaviour
    {
        public AccessibilitySettings.Key key;
        [TextArea] public string description = "자막 뒤 반투명 판의 진하기.";
        [SerializeField] TMP_Text label;
        [SerializeField] GameObject changeDot;     // 기본값과 다를 때만 켠다
        [SerializeField] StepSelector selector;
        [SerializeField] CanvasGroup flash;        // 프리셋 적용 시 순차 강조 (alpha 0 → 1 → 0)

        public StepSelector Selector => selector;
        public string Label => label ? label.text : key.ToString();
        public CanvasGroup Flash => flash;

        AccessibilitySettings settings;

        public void Bind(AccessibilitySettings target)
        {
            settings = target;
            selector.Configure(AccessibilitySettings.Min(key), AccessibilitySettings.Max(key), AccessibilitySettings.Step(key));
            selector.Format = v => AccessibilitySettings.Label(key, v);
            selector.ValueChanged += v => settings.Set(key, v);
            if (flash) flash.alpha = 0f;
        }

        /// <summary>설정 데이터 → 위젯 표시 + 변경 점</summary>
        public void Sync(AccessibilitySettings defaults)
        {
            int v = settings.Get(key);
            selector.SetValueWithoutNotify(v);
            if (changeDot) changeDot.SetActive(v != defaults.Get(key));
        }
    }
}
