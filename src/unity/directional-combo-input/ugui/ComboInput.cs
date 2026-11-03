// 방향 커맨드 입력 (새 Input System) — 열기(누르고 있기 / 토글) · 방향 4개 · 취소.
// 방향 액션은 늘 켜 두고 열린 동안에만 읽는다(연 프레임에도 실제 값이 보여, 열기 전부터 누르던 이동 키는 중립으로 돌아올 때까지 받지 않는다).
// 열린 동안 이동 액션과 UI 탐색을 끈다. UGUI · UI Toolkit HUD 가 같이 쓴다.
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
        [Tooltip("스틱 · 방향 세기가 중립에서 이 값을 넘으면 눌림")]
        [Range(0.2f, 0.9f)] [SerializeField] float pressThreshold = 0.5f;
        [Tooltip("눌린 뒤 이 값 아래로 내려와야 중립 (pressThreshold 보다 작게 — 경계에서 떨려도 두 번 들어가지 않게)")]
        [Range(0.1f, 0.8f)] [SerializeField] float releaseThreshold = 0.35f;

        public event Action Opened;
        /// <summary>true = 떼기 · 토글 닫기 (기다리던 커맨드 발동), false = 취소 · 창 포커스 잃음 · 꺼짐 (버림)</summary>
        public event Action<bool> Closed;
        public event Action<ComboDir> Direction;

        public bool IsOpen { get; private set; }
        public OpenMode Mode => openMode;

        readonly DirectionQuantizer quantizer = new();
        bool moveWasEnabled;
        bool navWasOn;
        bool waitRelease;
        EventSystem navSystem;

        /// <summary>설정 화면에서 바꾼다 (누르고 있기 ↔ 토글). 누르고 있기로 바꾸는 순간 아무것도 누르고 있지 않으면 닫는다</summary>
        public void SetOpenMode(OpenMode mode)
        {
            openMode = mode;
            if (IsOpen && mode == OpenMode.Hold && !openAction.action.IsPressed()) Close(false);
        }

        void OnEnable()
        {
            openAction.action.Enable();
            directionAction.action.Enable();   // 늘 켜 둔다 — 열 때 켜면 그 프레임의 ReadValue 가 0 이라 눌려 있던 키를 중립으로 착각한다
            if (cancelAction != null) cancelAction.action.Enable();   // UnityEngine.Object 에는 ?. 대신 != null
        }

        void OnDisable()
        {
            if (IsOpen) Close(false);   // 기다리던 커맨드는 버리고, 꺼 둔 이동 액션 · UI 탐색을 되돌린다
            waitRelease = false;
        }

        void OnApplicationFocus(bool focus)
        {
            // 창 포커스를 잃으면 뗌이 오지 않는다 — 누르고 있기 목록이 열린 채 남지 않게
            if (!focus && IsOpen && openMode == OpenMode.Hold) Close(false);
        }

        void Update()
        {
            InputAction open = openAction.action;
            if (openMode == OpenMode.Hold)
            {
                // 눌림 · 뗌 이벤트 대신 '지금 눌려 있는가' 와 비교한다 — 누름과 뗌이 같은 프레임이어도 열린 채 남지 않는다
                bool held = open.IsPressed();
                if (waitRelease) waitRelease = held;   // Esc 로 닫은 뒤 Q 를 아직 누르고 있으면 떼기 전까지 다시 열지 않는다
                else if (held != IsOpen)
                {
                    if (held) Open();
                    else Close(true);
                }
            }
            else if (open.WasPressedThisFrame())
            {
                if (IsOpen) Close(true);
                else Open();
            }
            if (!IsOpen) return;

            if (cancelAction != null && cancelAction.action.WasPressedThisFrame())
            {
                Close(false);
                return;
            }
            if (quantizer.Feed(directionAction.action.ReadValue<Vector2>(), pressThreshold, Mathf.Min(releaseThreshold, pressThreshold), out ComboDir d))
                Direction?.Invoke(d);
        }

        /// <summary>목록을 연다. 누르고 있기에서는 열기 액션이 눌려 있는 동안만 열린 채 남는다 (다음 Update 가 비교한다)</summary>
        public void Open()
        {
            if (IsOpen) return;
            IsOpen = true;
            // 걷던 W 를 누른 채 열어도 ↑ 가 첫 칸으로 들어가지 않게 — 방향 액션이 늘 켜져 있어 같은 프레임의 Feed 가 눌린 값을 보고 기다린다
            quantizer.Reset(untilNeutral: true);
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

        /// <param name="fire">true = 떼기 · 토글 닫기 (기다리던 커맨드 발동), false = 취소 · 포커스 잃음 · 꺼짐 (버림)</param>
        public void Close(bool fire)
        {
            if (!IsOpen) return;
            IsOpen = false;
            waitRelease = !fire && openMode == OpenMode.Hold && openAction.action.IsPressed();
            if (blockMovement && moveAction != null && moveWasEnabled) moveAction.action.Enable();   // 원래 켜져 있었을 때만
            if (navSystem != null) navSystem.sendNavigationEvents = navWasOn;
            navSystem = null;
            Closed?.Invoke(fire);
        }
    }
}
