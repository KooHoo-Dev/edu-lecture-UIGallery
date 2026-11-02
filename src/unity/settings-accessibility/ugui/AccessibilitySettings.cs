using System;
using UnityEngine;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 접근성 설정 데이터 (ScriptableObject).
    /// 메뉴 UI 와 게임 화면(미리보기·자막·HUD)은 서로를 직접 부르지 않고, 모두 이 데이터의 Changed 이벤트를 구독한다.
    ///   위젯 → Set(키, 값) → Changed → 각 적용기(글자 크기, 팔레트, 고대비, 흔들림 …)가 다시 그린다.
    /// 에셋 2개를 만든다: 실제 값(AccessibilitySettings) + 기본값(Defaults). 런타임에는 Instantiate 한 복사본을 쓴다.
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Accessibility Settings")]
    public class AccessibilitySettings : ScriptableObject
    {
        public enum Key
        {
            TextScale, HudSize, CenterDot,
            SubtitleBg, SpeakerCues, SubtitleColor,
            ColorMode, HighContrast,
            CameraShake, ReduceMotion,
            HoldToPress, AimAssist,
        }

        public enum Tab { Display, Subtitle, Color, Motion, Control }

        // 모든 값은 int 하나로 저장한다 (단계형 = 인덱스, 토글 = 0/1, 수치 = 그대로). 위젯이 하나(StepSelector)로 통일된다.
        [SerializeField] int textScale = 100;      // 80 ~ 200 (%)
        [SerializeField] int hudSize = 1;          // 0 작게 · 1 보통 · 2 크게
        [SerializeField] int centerDot = 0;        // 0/1
        [SerializeField] int subtitleBg = 1;       // 0 끔 · 1 기본 · 2 진하게
        [SerializeField] int speakerCues = 1;      // 0/1
        [SerializeField] int subtitleColor = 0;    // 0 흰색 · 1 노랑 · 2 하늘
        [SerializeField] int colorMode = 0;        // 0 끔 · 1 적색약 · 2 녹색약 · 3 청색약
        [SerializeField] int highContrast = 0;     // 0 끔 · 1 배경 억제 · 2 역할 단색 · 3 단색+외곽선
        [SerializeField] int cameraShake = 5;      // 0 ~ 10
        [SerializeField] int reduceMotion = 0;     // 0/1
        [SerializeField] int holdToPress = 0;      // 0/1
        [SerializeField] int aimAssist = 0;        // 0 끔 · 1 약하게 · 2 강하게

        /// <summary>값이 바뀌면 (어떤 키가 바뀌었는지와 함께) 호출된다. 전체 동기화는 key = null</summary>
        public event Action<AccessibilitySettings, Key?> Changed;

        public static readonly Key[] AllKeys = (Key[])Enum.GetValues(typeof(Key));

        public int Get(Key key) => key switch
        {
            Key.TextScale => textScale,
            Key.HudSize => hudSize,
            Key.CenterDot => centerDot,
            Key.SubtitleBg => subtitleBg,
            Key.SpeakerCues => speakerCues,
            Key.SubtitleColor => subtitleColor,
            Key.ColorMode => colorMode,
            Key.HighContrast => highContrast,
            Key.CameraShake => cameraShake,
            Key.ReduceMotion => reduceMotion,
            Key.HoldToPress => holdToPress,
            Key.AimAssist => aimAssist,
            _ => 0,
        };

        /// <summary>값을 쓴다. 실제로 바뀌었을 때만 Changed 를 보낸다.</summary>
        public bool Set(Key key, int value, bool notify = true)
        {
            value = Mathf.Clamp(value, Min(key), Max(key));
            if (Get(key) == value) return false;
            switch (key)
            {
                case Key.TextScale: textScale = value; break;
                case Key.HudSize: hudSize = value; break;
                case Key.CenterDot: centerDot = value; break;
                case Key.SubtitleBg: subtitleBg = value; break;
                case Key.SpeakerCues: speakerCues = value; break;
                case Key.SubtitleColor: subtitleColor = value; break;
                case Key.ColorMode: colorMode = value; break;
                case Key.HighContrast: highContrast = value; break;
                case Key.CameraShake: cameraShake = value; break;
                case Key.ReduceMotion: reduceMotion = value; break;
                case Key.HoldToPress: holdToPress = value; break;
                case Key.AimAssist: aimAssist = value; break;
            }
            if (notify) Changed?.Invoke(this, key);
            return true;
        }

        public bool GetBool(Key key) => Get(key) != 0;

        /// <summary>모든 구독자에게 현재 값 전체를 한 번 알린다 (불러오기 직후 등)</summary>
        public void NotifyAll() => Changed?.Invoke(this, null);

        public void CopyFrom(AccessibilitySettings other)
        {
            foreach (var k in AllKeys) Set(k, other.Get(k), notify: false);
            NotifyAll();
        }

        /* ───── 메타 정보: 범위·이름·탭 ───── */

        public static int Min(Key key) => key == Key.TextScale ? 80 : 0;

        public static int Max(Key key) => key switch
        {
            Key.TextScale => 200,
            Key.CameraShake => 10,
            Key.ColorMode or Key.HighContrast => 3,
            Key.HudSize or Key.SubtitleBg or Key.SubtitleColor or Key.AimAssist => 2,
            _ => 1, // 토글
        };

        public static int Step(Key key) => key == Key.TextScale ? 10 : 1;

        public static Tab TabOf(Key key) => key switch
        {
            Key.TextScale or Key.HudSize or Key.CenterDot => Tab.Display,
            Key.SubtitleBg or Key.SpeakerCues or Key.SubtitleColor => Tab.Subtitle,
            Key.ColorMode or Key.HighContrast => Tab.Color,
            Key.CameraShake or Key.ReduceMotion => Tab.Motion,
            _ => Tab.Control,
        };

        public static string Label(Key key, int v) => key switch
        {
            Key.TextScale => $"{v}%",
            Key.CameraShake => v.ToString(),
            Key.HudSize => new[] { "작게", "보통", "크게" }[v],
            Key.SubtitleBg => new[] { "끔", "기본", "진하게" }[v],
            Key.SubtitleColor => new[] { "흰색", "노랑", "하늘" }[v],
            Key.ColorMode => new[] { "끔", "적색약", "녹색약", "청색약" }[v],
            Key.HighContrast => new[] { "끔", "배경 억제", "역할 단색", "단색+외곽선" }[v],
            Key.AimAssist => new[] { "끔", "약하게", "강하게" }[v],
            _ => v != 0 ? "켬" : "끔",
        };

        /* ───── 저장 / 불러오기 ───── */

        public string ToJson() => JsonUtility.ToJson(this);

        public void LoadJson(string json)
        {
            JsonUtility.FromJsonOverwrite(json, this);
            NotifyAll();
        }
    }
}
