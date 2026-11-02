using System;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.RadialQuickSelect
{
    /// <summary>
    /// 방사형 선택 휠 (UGUI).
    /// - Wheel 액션을 누르고 있는 동안 열림(토글 옵션이면 한 번 눌러 열고 다시 눌러 확정), 놓으면 확정
    /// - 입력: 오른쪽 스틱이 데드존 밖이면 스틱, 마우스가 움직이면 마우스 위치 − 휠 가운데
    /// - 가운데 데드존: 마우스는 '취소', 스틱은 손을 떼면 가운데로 돌아오므로 마지막 선택 유지
    /// - 칸 경계 히스테리시스 (RadialSelection.Sector)
    /// - 열린 동안 Time.timeScale = slowmo, 휠 연출은 unscaledDeltaTime
    ///
    /// 칸 프리팹: Image (Type Filled · Fill Method Radial 360 · Fill Origin Top · Clockwise 켬) + 자식 Image "Icon".
    /// SectorRoot 의 Pivot (0.5, 0.5) 이 휠 가운데. 칸 프리팹도 SectorRoot 와 같은 크기 · 가운데 정렬.
    /// </summary>
    public class RadialMenu : MonoBehaviour
    {
        [Serializable]
        public class Slot
        {
            public string name;
            [TextArea] public string desc;
            public Sprite icon;
        }

        public enum OpenMode { Hold, Toggle }

        [SerializeField] Slot[] slots;
        [SerializeField] Image sectorPrefab;
        [SerializeField] RectTransform sectorRoot;
        [SerializeField] CanvasGroup group;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI descText;

        [Header("입력")]
        [Tooltip("Button: <Gamepad>/leftShoulder · <Keyboard>/tab · <Mouse>/rightButton")]
        [SerializeField] InputActionReference wheelAction;
        [Tooltip("Vector2: <Gamepad>/rightStick")]
        [SerializeField] InputActionReference aimAction;
        [Tooltip("Vector2: <Pointer>/position")]
        [SerializeField] InputActionReference pointAction;
        [Tooltip("Button: <Keyboard>/escape · <Gamepad>/buttonEast — 확정하지 않고 닫기")]
        [SerializeField] InputActionReference cancelAction;

        [Header("값")]
        [SerializeField] OpenMode openMode = OpenMode.Hold;
        [Tooltip("휠 바깥 반지름 (Canvas px)")]
        [SerializeField] float radius = 330f;
        [Range(0f, 0.6f)] [SerializeField] float deadzone = 0.3f;
        [SerializeField] float hysteresisDeg = 6f;
        [Range(0.05f, 1f)] [SerializeField] float slowmo = 0.3f;
        [SerializeField] float openSeconds = 0.16f;
        [SerializeField] Color normalColor = new(0.05f, 0.09f, 0.13f, 0.9f);
        [SerializeField] Color selectedColor = new(0.37f, 0.9f, 0.79f, 1f);

        /// <summary>칸을 확정했을 때 (칸 번호)</summary>
        public event Action<int> Confirmed;
        public int Equipped { get; private set; }

        Image[] sectors;
        bool open;
        int sel = -1;
        float openT;
        float savedTimeScale = 1f;
        float savedFixedDelta;
        float appliedTimeScale;
        CursorLockMode savedLock;
        bool savedVisible;
        bool usingMouse;
        Vector2 lastPointer;

        void Awake()
        {
            Build();
            Show(0f);
        }

        void OnEnable()
        {
            wheelAction.action.started += OnWheelStarted;
            wheelAction.action.canceled += OnWheelCanceled;
            wheelAction.action.performed += OnWheelPerformed;
            if (cancelAction != null) cancelAction.action.performed += OnCancel;
            wheelAction.action.Enable();
            aimAction.action.Enable();
            pointAction.action.Enable();
            if (cancelAction != null) cancelAction.action.Enable();   // UnityEngine.Object 에는 ?. 대신 != null
        }

        void OnDisable()
        {
            wheelAction.action.started -= OnWheelStarted;
            wheelAction.action.canceled -= OnWheelCanceled;
            wheelAction.action.performed -= OnWheelPerformed;
            if (cancelAction != null) cancelAction.action.performed -= OnCancel;
            if (open) Close(false);   // 열린 채 꺼지면 시간이 느린 채로 남는다
        }

        void OnWheelStarted(InputAction.CallbackContext _)
        {
            if (openMode == OpenMode.Hold) Open();
        }

        void OnWheelCanceled(InputAction.CallbackContext _)
        {
            if (openMode == OpenMode.Hold) Close(true);
        }

        void OnWheelPerformed(InputAction.CallbackContext _)
        {
            if (openMode != OpenMode.Toggle) return;
            if (open) Close(true);
            else Open();
        }

        void OnCancel(InputAction.CallbackContext _)
        {
            if (open) Close(false);
        }

        void Build()
        {
            float step = 360f / slots.Length;
            sectors = new Image[slots.Length];
            for (int i = 0; i < slots.Length; i++)
            {
                Image img = Instantiate(sectorPrefab, sectorRoot);
                img.fillAmount = 1f / slots.Length - 0.006f;   // 칸 사이에 아주 작은 틈
                // Fill Origin Top + Clockwise: 위에서 시계 방향으로 채운다 → 칸 i 가 [i·step − step/2, i·step + step/2] 를 덮게 회전
                float start = i * step - step / 2f;
                img.rectTransform.localEulerAngles = new Vector3(0f, 0f, -start);
                sectors[i] = img;

                Transform iconT = img.transform.Find("Icon");
                if (iconT is RectTransform icon)
                {
                    // 회전된 칸 안에서 '시작 + step/2' 방향, 반지름 2/3 지점. 아이콘은 반대로 돌려 똑바로 세운다
                    float mid = step / 2f * Mathf.Deg2Rad;
                    icon.anchoredPosition = new Vector2(Mathf.Sin(mid), Mathf.Cos(mid)) * (radius * 0.66f);
                    icon.localEulerAngles = new Vector3(0f, 0f, start);
                    if (icon.TryGetComponent(out Image iconImage)) iconImage.sprite = slots[i].icon;
                }
            }
        }

        void Open()
        {
            if (open || Time.timeScale == 0f) return;   // 일시정지 중에는 열지 않는다
            open = true;
            savedTimeScale = Time.timeScale;
            savedFixedDelta = Time.fixedDeltaTime;
            Time.timeScale = savedTimeScale * slowmo;
            Time.fixedDeltaTime = savedFixedDelta * slowmo;   // 물리도 같은 비율로 촘촘하게 (안 하면 느린 동안 물리가 끊겨 보인다)
            appliedTimeScale = Time.timeScale;

            // 커서가 잠긴 게임(3인칭 등): 여는 동안 풀고 휠 가운데로 옮긴다
            savedLock = Cursor.lockState;
            savedVisible = Cursor.visible;
            if (Mouse.current != null)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                Mouse.current.WarpCursorPosition(RectTransformUtility.WorldToScreenPoint(null, sectorRoot.position));
            }
            // 스틱이면 지금 장착한 칸을 먼저 가리킨다 — 그대로 놓으면 아무것도 바뀌지 않게
            sel = usingMouse ? -1 : Equipped;
            lastPointer = pointAction.action.ReadValue<Vector2>();
            Paint();
        }

        void Close(bool confirm)
        {
            if (!open) return;
            open = false;
            // 휠이 바꾼 값 그대로일 때만 되돌린다 — 그 사이 일시정지 메뉴가 0 으로 바꿨다면 건드리지 않는다
            if (Mathf.Approximately(Time.timeScale, appliedTimeScale))
            {
                Time.timeScale = savedTimeScale;
                Time.fixedDeltaTime = savedFixedDelta;
            }
            Cursor.lockState = savedLock;
            Cursor.visible = savedVisible;
            if (confirm && sel >= 0)
            {
                Equipped = sel;
                Confirmed?.Invoke(sel);
            }
            sel = -1;
        }

        void Update()
        {
            // 연출은 실제 시간 — 세계가 느려져도 휠은 그대로 빠르게
            openT = Mathf.MoveTowards(openT, open ? 1f : 0f, Time.unscaledDeltaTime / Mathf.Max(0.01f, openSeconds));
            Show(1f - Mathf.Pow(1f - openT, 3f));
            if (!open) return;

            Vector2 aim = aimAction.action.ReadValue<Vector2>();
            Vector2 pointer = pointAction.action.ReadValue<Vector2>();
            if (aim.magnitude >= deadzone) usingMouse = false;
            else if (pointer != lastPointer) usingMouse = true;   // 마우스가 조금이라도 움직였다 (고주사율에서 느린 움직임도)
            lastPointer = pointer;

            Vector2 v = aim;
            if (usingMouse)
            {
                RectTransformUtility.ScreenPointToLocalPointInRectangle(sectorRoot, pointer, null, out Vector2 local);
                v = local / radius;   // UGUI 는 y 가 위로 + → 그대로 각도 계산
            }

            if (v.magnitude < deadzone)
            {
                if (usingMouse) sel = -1;   // 마우스: 가운데 = 취소. 스틱: 마지막 선택 유지
            }
            else
            {
                sel = RadialSelection.Sector(RadialSelection.Angle(v), slots.Length, sel, hysteresisDeg);
            }
            Paint();
        }

        void Show(float k)
        {
            group.alpha = k;
            group.blocksRaycasts = open;
            transform.localScale = Vector3.one * Mathf.Lerp(0.85f, 1f, k);
        }

        void Paint()
        {
            for (int i = 0; i < sectors.Length; i++)
            {
                bool on = i == sel;
                sectors[i].color = on ? selectedColor : normalColor;
                sectors[i].rectTransform.localScale = Vector3.one * (on ? 1.06f : 1f);   // 고른 칸이 바깥으로 살짝
            }
            nameText.text = sel >= 0 ? slots[sel].name : (usingMouse ? "취소" : "—");
            descText.text = sel >= 0 ? slots[sel].desc : "";
        }
    }
}
