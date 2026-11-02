using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.RadialQuickSelect
{
    /// <summary>
    /// UI Toolkit 판 방사형 휠 — 칸은 Painter2D 로 그리고, 각도 · 칸 계산은 RadialSelection.cs(UGUI 폴더)를 그대로 쓴다.
    /// 데드존 · 히스테리시스 · 감속 규칙은 UGUI 판과 같다. 짧게 줄이려고 누르고 있기 방식만 두었다
    /// (토글 · 취소 액션 · fixedDeltaTime · 커서 잠금 처리는 UGUI 판 RadialMenu.cs 를 참고).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class RadialMenuUITK : MonoBehaviour
    {
        [Serializable]
        public class Slot
        {
            public string name;
            [TextArea] public string desc;
        }

        [SerializeField] Slot[] slots;
        [SerializeField] InputActionReference wheelAction;   // Button (누르고 있기)
        [SerializeField] InputActionReference aimAction;     // Vector2 <Gamepad>/rightStick
        [SerializeField] InputActionReference pointAction;   // Vector2 <Pointer>/position
        [SerializeField] float radius = 330f;
        [Range(0f, 0.6f)] [SerializeField] float deadzone = 0.3f;
        [SerializeField] float hysteresisDeg = 6f;
        [Range(0.05f, 1f)] [SerializeField] float slowmo = 0.3f;

        public event Action<int> Confirmed;
        public int Equipped { get; private set; }

        VisualElement wheel;
        RadialWheelElement drawing;
        Label nameLabel, descLabel;
        bool open, usingMouse;
        int sel = -1;
        float savedTimeScale = 1f;
        float appliedTimeScale;
        Vector2 lastPointer;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            wheel = root.Q("wheel");
            nameLabel = root.Q<Label>("name");
            descLabel = root.Q<Label>("desc");
            drawing = new RadialWheelElement { Count = slots.Length, InnerRatio = deadzone };
            wheel.Insert(0, drawing);   // 이름 Label 보다 뒤(아래)에 그린다

            wheelAction.action.started += OnStarted;
            wheelAction.action.canceled += OnCanceled;
            wheelAction.action.Enable();
            aimAction.action.Enable();
            pointAction.action.Enable();
        }

        void OnDisable()
        {
            wheelAction.action.started -= OnStarted;
            wheelAction.action.canceled -= OnCanceled;
            if (open) Close(false);
            drawing?.RemoveFromHierarchy();
        }

        void OnStarted(InputAction.CallbackContext _) => Open();
        void OnCanceled(InputAction.CallbackContext _) => Close(true);

        void Open()
        {
            if (open || Time.timeScale == 0f) return;   // 일시정지 중에는 열지 않는다
            open = true;
            savedTimeScale = Time.timeScale;
            Time.timeScale = savedTimeScale * slowmo;
            appliedTimeScale = Time.timeScale;
            sel = usingMouse ? -1 : Equipped;
            lastPointer = pointAction.action.ReadValue<Vector2>();
            wheel.AddToClassList("wheel--open");
            Paint();
        }

        void Close(bool confirm)
        {
            if (!open) return;
            open = false;
            if (Mathf.Approximately(Time.timeScale, appliedTimeScale)) Time.timeScale = savedTimeScale;   // 그 사이 누가 바꿨으면 그대로
            wheel.RemoveFromClassList("wheel--open");
            if (confirm && sel >= 0)
            {
                Equipped = sel;
                Confirmed?.Invoke(sel);
            }
            sel = -1;
        }

        void Update()
        {
            if (!open) return;
            Vector2 aim = aimAction.action.ReadValue<Vector2>();
            Vector2 pointer = pointAction.action.ReadValue<Vector2>();
            if (aim.magnitude >= deadzone) usingMouse = false;
            else if (pointer != lastPointer) usingMouse = true;
            lastPointer = pointer;

            Vector2 v = aim;
            if (usingMouse)
            {
                // 화면(왼쪽 아래 원점) → y 뒤집기 → 패널 좌표(왼쪽 위 원점)
                Vector2 panelPos = RuntimePanelUtils.ScreenToPanel(wheel.panel, new Vector2(pointer.x, Screen.height - pointer.y));
                Vector2 d = (panelPos - wheel.worldBound.center) / radius;
                v = new Vector2(d.x, -d.y);   // 패널은 y 가 아래로 + → 위로 + 로 바꿔 각도 계산
            }

            if (v.magnitude < deadzone)
            {
                if (usingMouse) sel = -1;
            }
            else
            {
                sel = RadialSelection.Sector(RadialSelection.Angle(v), slots.Length, sel, hysteresisDeg);
            }
            Paint();
        }

        void Paint()
        {
            if (drawing.Selected != sel)
            {
                drawing.Selected = sel;
                drawing.MarkDirtyRepaint();   // generateVisualContent 는 다시 그려 달라고 해야 불린다
            }
            nameLabel.text = sel >= 0 ? slots[sel].name : (usingMouse ? "취소" : "—");
            descLabel.text = sel >= 0 ? slots[sel].desc : "";
        }

        /// <summary>칸을 그리는 요소 — 고리 조각(바깥 호 시계 방향 + 안쪽 호 반시계 방향)을 칸 수만큼</summary>
        class RadialWheelElement : VisualElement
        {
            public int Count = 8;
            public int Selected = -1;
            public float InnerRatio = 0.3f;

            static readonly Color Normal = new(0.05f, 0.09f, 0.13f, 0.92f);
            static readonly Color Picked = new(0.37f, 0.9f, 0.79f, 1f);

            public RadialWheelElement()
            {
                pickingMode = PickingMode.Ignore;
                style.position = Position.Absolute;
                style.left = 0;
                style.top = 0;
                style.right = 0;
                style.bottom = 0;
                generateVisualContent += Draw;
            }

            void Draw(MeshGenerationContext ctx)
            {
                Painter2D p = ctx.painter2D;
                Rect r = contentRect;
                Vector2 c = r.center;
                float outer = Mathf.Min(r.width, r.height) / 2f - 4f;
                float inner = outer * Mathf.Max(0.2f, InnerRatio);
                float step = 360f / Count;
                for (int i = 0; i < Count; i++)
                {
                    // Painter2D 각도: 오른쪽 = 0°, 시계 방향 + (y 가 아래) → 위 = 0° 기준에서 90° 를 뺀다
                    float a0 = i * step - step / 2f + 1f - 90f;
                    float a1 = i * step + step / 2f - 1f - 90f;
                    p.fillColor = i == Selected ? Picked : Normal;
                    p.BeginPath();
                    p.Arc(c, i == Selected ? outer : outer - 14f, Angle.Degrees(a0), Angle.Degrees(a1));
                    p.Arc(c, inner, Angle.Degrees(a1), Angle.Degrees(a0), ArcDirection.CounterClockwise);
                    p.ClosePath();
                    p.Fill();
                }
            }
        }
    }
}
