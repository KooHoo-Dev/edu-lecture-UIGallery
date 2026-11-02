// 충돌 창 — "E 키 — 지금 '상호작용'에 쓰고 있다" + [맞바꾸기 · 상호작용 ← Space] [취소].
// 창이 뜬 직후 inputLockSeconds 동안은 확정 버튼을 막는다(입력 잠금) — 대기 중 연타한 키가 곧바로 확정되지 않게.
// Esc · 패드 오른쪽 버튼은 취소.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.InputRebinding
{
    public class ConflictPanel : MonoBehaviour
    {
        [SerializeField] TextMeshProUGUI message;
        [SerializeField] Button acceptButton;
        [SerializeField] TextMeshProUGUI acceptLabel;
        [SerializeField] Button cancelButton;
        [SerializeField] TextMeshProUGUI cancelLabel;
        [Tooltip("창이 뜬 직후 확정을 막는 시간 (권장 0.2~0.4초)")]
        [SerializeField] float inputLockSeconds = 0.3f;

        /// <summary>true = 바꾸기, false = 취소</summary>
        public event Action<bool> Answered;
        float openedAt;

        void Awake()
        {
            acceptButton.onClick.AddListener(() => Answer(true));
            cancelButton.onClick.AddListener(() => Answer(false));
            gameObject.SetActive(false);
        }

        public void Show(string text, string acceptText, string cancelText)
        {
            message.text = text;
            acceptLabel.text = acceptText;
            if (cancelLabel != null) cancelLabel.text = cancelText;
            gameObject.SetActive(true);
            openedAt = Time.unscaledTime;
            acceptButton.interactable = false;
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(cancelButton.gameObject);
        }

        void Update()
        {
            if (!acceptButton.interactable && Time.unscaledTime - openedAt >= inputLockSeconds)
            {
                acceptButton.interactable = true;
                if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(acceptButton.gameObject);
            }
            bool cancel = (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame) || (Gamepad.current != null && Gamepad.current.buttonEast.wasPressedThisFrame);
            if (cancel) Answer(false);
        }

        void Answer(bool accept)
        {
            if (!gameObject.activeSelf) return;
            gameObject.SetActive(false);
            Answered?.Invoke(accept);
        }
    }
}
