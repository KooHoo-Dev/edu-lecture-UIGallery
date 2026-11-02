// 아래 안내 줄 — "[E] 상호작용 [Space] 점프 …" 를 지금 바인딩과 마지막 입력 장치에서 뽑는다 (글자로 박아 두지 않는다).
// 장치: InputSystem.onAnyButtonPress 로 마지막으로 버튼을 누른 장치를 본다.
// 갱신: InputSystem.onActionChange 의 BoundControlsChanged — 재설정 · 불러오기 · 복원 뒤에 자동으로 온다.
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.UI;

namespace UIGallery.InputRebinding
{
    public class BindingPromptBar : MonoBehaviour
    {
        public enum DeviceMode { Auto, Keyboard, Gamepad }

        [Serializable]
        public class Prompt
        {
            [Tooltip("맵/액션 이름. 예: Player/Interact")]
            public string actionPath = "Player/Interact";
            public string displayName = "상호작용";
            public Image glyph;
            public TextMeshProUGUI keyText;
            public TextMeshProUGUI nameText;
        }

        [SerializeField] RebindMenu menu;
        [SerializeField] GlyphTable glyphs;
        [SerializeField] List<Prompt> prompts = new();
        [Tooltip("Auto = 마지막으로 누른 장치를 따른다")]
        [SerializeField] DeviceMode inputDevice = DeviceMode.Auto;
        [SerializeField] TextMeshProUGUI deviceText;

        bool lastWasGamepad;
        IDisposable anyButton;

        void OnEnable()
        {
            anyButton = InputSystem.onAnyButtonPress.Call(OnAnyButton);
            InputSystem.onActionChange += OnActionChange;
        }

        void OnDisable()
        {
            anyButton?.Dispose();
            InputSystem.onActionChange -= OnActionChange;
        }

        void Start() => Refresh();

        void OnAnyButton(InputControl control)
        {
            bool pad = control.device is Gamepad;
            if (pad == lastWasGamepad) return;
            lastWasGamepad = pad;
            Refresh();
        }

        void OnActionChange(object obj, InputActionChange change)
        {
            if (change == InputActionChange.BoundControlsChanged) Refresh();
        }

        public void Refresh()
        {
            var asset = menu != null ? menu.Actions : null;
            if (asset == null) return;
            bool pad = inputDevice == DeviceMode.Gamepad || (inputDevice == DeviceMode.Auto && lastWasGamepad);
            if (deviceText != null) deviceText.text = pad ? "패드" : "키보드";
            string group = pad ? RebindService.GamepadGroup : RebindService.KeyboardGroup;
            foreach (var p in prompts)
            {
                var action = asset.FindAction(p.actionPath);
                if (action == null) continue;
                int index = RebindService.IndexFor(action, group, null);
                Sprite sprite = null;
                string key = index < 0 ? "—" : glyphs != null ? glyphs.Describe(action, index, out sprite) : action.GetBindingDisplayString(index);
                bool empty = index >= 0 && string.IsNullOrEmpty(action.bindings[index].effectivePath);
                if (p.keyText != null) p.keyText.text = empty ? "키 없음" : key;
                if (p.glyph != null)
                {
                    p.glyph.sprite = sprite;
                    p.glyph.enabled = sprite != null;
                }
                if (p.nameText != null) p.nameText.text = p.displayName;
            }
        }
    }
}
