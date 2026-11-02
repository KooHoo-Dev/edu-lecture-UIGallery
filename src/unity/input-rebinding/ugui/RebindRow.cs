// 입력표의 한 행 — 행동 이름 + 키보드 칸 + 패드 칸 + ↺ 복원.
// 칸이 가리키는 바인딩 번호는 그룹(Keyboard&Mouse · Gamepad)과 합성 부분 이름으로 찾는다. 못 찾으면 '고정' 칸(예: 패드 이동 = 스틱).
using System;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.InputRebinding
{
    public class RebindRow : MonoBehaviour
    {
        [Serializable]
        public class Slot
        {
            public Button button;
            public Image glyph;
            public TextMeshProUGUI text;
            [Tooltip("기본값과 다를 때 켠다 — '바뀜' 글자 (색만으로 알리지 않는다)")]
            public GameObject changedMark;
            [Tooltip("키 입력 대기 중에 켠다 — '키를 누르세요'")]
            public GameObject listeningMark;
            [Tooltip("남은 시간 (Image Type = Filled)")]
            public Image timeFill;
            [HideInInspector] public int index = -1;
        }

        [Tooltip("맵/액션 이름. 예: Player/Jump")]
        [SerializeField] string actionPath = "Player/Jump";
        [Tooltip("합성 바인딩의 부분 이름 (Move 의 up · down …). 버튼 행동이면 비운다")]
        [SerializeField] string compositePart = "";
        [SerializeField] string displayName = "점프";
        [SerializeField] TextMeshProUGUI label;
        [SerializeField] Slot keyboard = new();
        [SerializeField] Slot gamepad = new();
        [SerializeField] Button resetButton;

        public InputAction Action { get; private set; }

        public void Init(RebindMenu menu, InputActionAsset asset)
        {
            Action = asset.FindAction(actionPath, true);
            if (label != null) label.text = displayName;
            keyboard.index = RebindService.IndexFor(Action, RebindService.KeyboardGroup, compositePart);
            gamepad.index = RebindService.IndexFor(Action, RebindService.GamepadGroup, compositePart);
            foreach (var slot in new[] { keyboard, gamepad })
            {
                var s = slot;
                s.button.interactable = s.index >= 0;
                s.button.onClick.AddListener(() => menu.BeginRebind(this, s.index));
            }
            if (resetButton != null)
                resetButton.onClick.AddListener(() =>
                {
                    foreach (var s in new[] { keyboard, gamepad })
                        if (s.index >= 0 && RebindService.IsChanged(Action, s.index)) menu.Service.ResetBinding(Action, s.index);
                });
        }

        public string DisplayName => displayName;

        public void Refresh(RebindService service, GlyphTable glyphs)
        {
            bool any = false;
            foreach (var s in new[] { keyboard, gamepad })
            {
                bool listening = service.IsListening && service.ListeningAction == Action && service.ListeningIndex == s.index;
                bool changed = s.index >= 0 && RebindService.IsChanged(Action, s.index);
                any |= changed;
                Sprite sprite = null;
                string text = s.index < 0 ? "고정" : glyphs != null ? glyphs.Describe(Action, s.index, out sprite) : Action.GetBindingDisplayString(s.index);
                if (s.text != null) s.text.text = listening ? "키를 누르세요…" : text;
                if (s.glyph != null)
                {
                    s.glyph.sprite = sprite;
                    s.glyph.enabled = sprite != null && !listening;
                }
                if (s.changedMark != null) s.changedMark.SetActive(changed && !listening);
                if (s.listeningMark != null) s.listeningMark.SetActive(listening);
                if (s.timeFill != null) s.timeFill.enabled = listening && service.TimeoutSeconds > 0f;
            }
            if (resetButton != null) resetButton.interactable = any;
        }

        /// <summary>매 프레임: 대기 중인 칸의 남은 시간 막대</summary>
        public void Tick(RebindService service)
        {
            foreach (var s in new[] { keyboard, gamepad })
                if (s.timeFill != null && s.timeFill.enabled && service.TimeoutSeconds > 0f) s.timeFill.fillAmount = service.TimeLeft / service.TimeoutSeconds;
        }
    }
}
