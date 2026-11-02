using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 유형별 프리셋 (시각 · 청각 · 운동 · 멀미 완화).
    /// 프리셋은 '모드'가 아니라 값을 한 번 덮어쓰는 함수일 뿐이다. 적용 뒤에도 모든 값은 다시 바꿀 수 있다.
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Accessibility Preset")]
    public class AccessibilityPreset : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public AccessibilitySettings.Key key;
            public int value;
        }

        public string displayName = "시각";
        public List<Entry> values = new();

        /// <summary>값을 덮어쓰고, 실제로 바뀐 키 목록을 돌려준다 (순차 강조·탭 배지에 쓴다).</summary>
        public List<AccessibilitySettings.Key> Apply(AccessibilitySettings settings)
        {
            var changed = new List<AccessibilitySettings.Key>();
            foreach (var e in values)
                if (settings.Set(e.key, e.value, notify: false)) changed.Add(e.key);
            settings.NotifyAll();
            return changed;
        }
    }
}
