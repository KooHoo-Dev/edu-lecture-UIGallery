// 방향 커맨드 입력 (새 Input System) — 열기(누르고 있기 / 토글) · 방향 4개 · 취소.
// 열린 동안 이동 액션과 UI 탐색을 끄고 방향 액션만 켠다. UGUI · UI Toolkit HUD 가 같이 쓴다.
using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.DirectionalComboInput
{
    public class ComboInput : MonoBehaviour
    {
        public enum OpenMode { Hold, Toggle }

        [Tooltip("Button: <Keyboard>/q · <Gamepad>/leftShoulder — Interactions 없이 (Hold 상호작용은 누른 지 0.4초 뒤에야 performed)")]
        [SerializeField] InputActionReference openAction;
        [Tooltip("Vector2: 2D Vector 합성(WASD · 방향키, Digital Normalized) · <Gamepad>/dpad · <Gamepad>/leftStick")]
        [SerializeField] InputActionReference directionAction;
        [Tooltip("Button: <Keyboard>/escape · <Gamepad>/buttonEast — 닫기")]
        [SerializeField] InputActionReference cancelAction;
        [Tooltip("같은 키를 쓰는 이동 액션 — 열린 동안 끈다 (비워 두면 커맨드를 넣으며 걸어 다닌다)")]
        [SerializeField] InputActionReference moveAction;

        [SerializeField] OpenMode openMode = OpenMode.Hold;
        [SerializeField] bool blockMovement = true;
        [Range(0.2f, 0.9f)] [SerializeField] float pressThreshold = 0.5f;

        public event Action Opened;
        public event Action Closed;
        public event Action<ComboDir> Direction;

        public bool IsOpen { get; private set; }
        public OpenMode Mode => openMode;

        readonly DirectionQuantizer quantizer = new();
        bool moveWasEnabled;
        bool navWasOn;
        EventSystem navSystem;

        /// <summary>설정 화면에서 바꾼다 (누르고 있기 ↔ 토글). 누르고 있기로 바꾸는 순간 아무것도 누르고 있지 않으면 닫는다</summary>
        public void SetOpenMode(OpenMode mode)
        {
            openMode = mode;
            if (IsOpen && mode == OpenMode.Hold && !openAction.action.IsPressed()) Close();
        }

        void OnEnable()
        {
            openAction.action.Enable();
            if (cancelAction != null) cancelAction.action.Enable();   // UnityEngine.Object 에는 ?. 대신 != null
        }

        void OnDisable()
        {
            if (IsOpen) Close();   // 꺼 둔 이동 액션 · UI 탐색을 되돌린다
        }

        void OnApplicationFocus(bool focus)
        {
            // 창 포커스를 잃으면 뗌이 오지 않는다 — 누르고 있기 목록이 열린 채 남지 않게
            if (!focus && IsOpen && openMode == OpenMode.Hold) Close();
        }

        void Update()
        {
            InputAction open = openAction.action;
            if (openMode == OpenMode.Hold)
            {
                if (open.WasPressedThisFrame() && !IsOpen) Open();
                else if (IsOpen && open.WasReleasedThisFrame()) Close();
            }
            else if (open.WasPressedThisFrame())
            {
                if (IsOpen) Close();
                else Open();
            }
            if (!IsOpen) return;

            if (cancelAction != null && cancelAction.action.WasPressedThisFrame())
            {
                Close();
                return;
            }
            if (quantizer.Feed(directionAction.action.ReadValue<Vector2>(), pressThreshold, out ComboDir d))
                Direction?.Invoke(d);
        }

        public void Open()
        {
            if (IsOpen) return;
            IsOpen = true;
            quantizer.Reset(untilNeutral: true);   // 걷던 W 를 누른 채 열어도 ↑ 가 첫 칸으로 들어가지 않게
            directionAction.action.Enable();
            if (blockMovement && moveAction != null)
            {
                moveWasEnabled = moveAction.action.enabled;
                moveAction.action.Disable();
            }
            // 방향키가 UI 선택(Selectable · UI Toolkit 포커스)도 움직이지 않게
            navSystem = EventSystem.current;
            if (navSystem != null)
            {
                navWasOn = navSystem.sendNavigationEvents;
                navSystem.sendNavigationEvents = false;
            }
            Opened?.Invoke();
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            directionAction.action.Disable();
            if (blockMovement && moveAction != null && moveWasEnabled) moveAction.action.Enable();   // 원래 켜져 있었을 때만
            if (navSystem != null) navSystem.sendNavigationEvents = navWasOn;
            navSystem = null;
            Closed?.Invoke();
        }
    }
}
