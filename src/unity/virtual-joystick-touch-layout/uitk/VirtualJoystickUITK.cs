using System;
using UnityEngine;
using UnityEngine.InputSystem.Layouts;
using UnityEngine.InputSystem.OnScreen;
using UnityEngine.UIElements;

namespace UIGallery.VirtualJoystickTouchLayout
{
    /// <summary>
    /// UI Toolkit 판 가상 조이스틱 + 세이프 에어리어.
    /// - OnScreenControl 을 상속(MonoBehaviour)해 UI Toolkit 포인터 이벤트로 '가상 패드 왼쪽 스틱' 값을 보낸다
    /// - #stick-zone 을 누른 손가락을 CapturePointer 로 붙잡아 그 손가락의 이동·떼기만 받는다 (멀티터치)
    /// - 버튼은 PointerDownEvent 로 누르는 순간 반응한다 (Button.clicked 는 손을 뗄 때 불린다).
    ///   이 예제는 C# 이벤트로 알린다 — Input System 으로 보내려면 버튼마다 OnScreenControl 을 하나씩 둔다
    /// - Screen.safeArea(왼쪽 아래 원점 픽셀)를 패널 좌표(왼쪽 위 원점)로 바꿔 #safe-area 의 padding 으로 넣는다
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class VirtualJoystickUITK : OnScreenControl
    {
        [SerializeField] float radius = 120f;
        [Range(0f, 0.5f)] [SerializeField] float deadzone = 0.12f;
        [SerializeField] bool fineCurve = true;

        [InputControl(layout = "Vector2")]
        [SerializeField] string m_ControlPath = "<Gamepad>/leftStick";

        protected override string controlPathInternal
        {
            get => m_ControlPath;
            set => m_ControlPath = value;
        }

        /// <summary>버튼이 눌린 순간 ("attack" · "skill1" · "dodge")</summary>
        public event Action<string> ButtonPressed;

        VisualElement safeArea, zone, stickBase, knob;
        int pointerId = PointerId.invalidPointerId;
        Vector2 basePos;
        Rect appliedSafe;
        /// <summary>콜백을 건 트리 — 컴포넌트만 껐다 켜면 같은 트리이므로 두 번 걸지 않는다</summary>
        VisualElement boundRoot;

        protected override void OnEnable()
        {
            base.OnEnable();
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            safeArea = root.Q("safe-area");
            zone = root.Q("stick-zone");
            stickBase = root.Q("stick-base");
            knob = root.Q("stick-knob");
            stickBase.style.width = radius * 2f;   // 그림 크기 = 판정 반경 × 2
            stickBase.style.height = radius * 2f;
            stickBase.style.borderTopLeftRadius = radius;
            stickBase.style.borderTopRightRadius = radius;
            stickBase.style.borderBottomLeftRadius = radius;
            stickBase.style.borderBottomRightRadius = radius;
            appliedSafe = Rect.zero;
            if (root == boundRoot) return;
            boundRoot = root;

            zone.RegisterCallback<PointerDownEvent>(OnDown);
            zone.RegisterCallback<PointerMoveEvent>(OnMove);
            zone.RegisterCallback<PointerUpEvent>(OnUp);
            zone.RegisterCallback<PointerCaptureOutEvent>(e =>
            {
                if (e.pointerId == pointerId) Release();   // 늦게 온 다른 손가락의 해제는 무시
            });

            foreach (string id in new[] { "attack", "skill1", "dodge" })
            {
                VisualElement btn = root.Q($"btn-{id}");
                btn.RegisterCallback<PointerDownEvent>(e =>
                {
                    if (!isActiveAndEnabled) return;
                    btn.AddToClassList("touch-btn--pressed");
                    ButtonPressed?.Invoke(id);
                });
                btn.RegisterCallback<PointerUpEvent>(_ => btn.RemoveFromClassList("touch-btn--pressed"));
                btn.RegisterCallback<PointerLeaveEvent>(_ => btn.RemoveFromClassList("touch-btn--pressed"));
            }

            zone.RegisterCallback<GeometryChangedEvent>(_ => PlaceIdle());
        }

        protected override void OnDisable()
        {
            Release();
            base.OnDisable();
        }

        void Update()
        {
            if (Screen.safeArea != appliedSafe && safeArea?.panel != null) ApplySafeArea();
        }

        void ApplySafeArea()
        {
            appliedSafe = Screen.safeArea;
            IPanel panel = safeArea.panel;
            // 화면 좌표(왼쪽 아래 원점) → y 를 뒤집어 왼쪽 위 원점 → 패널 좌표
            Vector2 topLeft = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(appliedSafe.xMin, Screen.height - appliedSafe.yMax));
            Vector2 bottomRight = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(appliedSafe.xMax, Screen.height - appliedSafe.yMin));
            Vector2 full = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(Screen.width, Screen.height));
            safeArea.style.paddingLeft = topLeft.x;
            safeArea.style.paddingTop = topLeft.y;
            safeArea.style.paddingRight = full.x - bottomRight.x;
            safeArea.style.paddingBottom = full.y - bottomRight.y;
        }

        void OnDown(PointerDownEvent e)
        {
            if (!isActiveAndEnabled) return;   // 컴포넌트를 꺼도 UI 요소의 콜백은 남아 있다
            if (pointerId != PointerId.invalidPointerId) return;   // 이미 다른 손가락이 쓰는 중
            pointerId = e.pointerId;
            zone.CapturePointer(pointerId);   // 손가락이 영역 밖으로 나가도 이동을 계속 받는다
            Rect r = zone.contentRect;
            Vector2 local = zone.WorldToLocal(e.position);
            // 플로팅: 누른 곳에 받침 (영역 밖으로 잘리지 않게 안쪽으로)
            basePos = new Vector2(Mathf.Clamp(local.x, radius, r.width - radius), Mathf.Clamp(local.y, radius, r.height - radius));
            stickBase.AddToClassList("stick-base--active");
            Move(local);
        }

        void OnMove(PointerMoveEvent e)
        {
            if (e.pointerId != pointerId) return;
            Move(zone.WorldToLocal(e.position));
        }

        void OnUp(PointerUpEvent e)
        {
            if (e.pointerId != pointerId) return;
            zone.ReleasePointer(pointerId);
            Release();
        }

        void Move(Vector2 local)
        {
            Vector2 delta = local - basePos;
            Vector2 clamped = Vector2.ClampMagnitude(delta, radius);
            SetBase(basePos);
            knob.style.translate = new Translate(clamped.x, clamped.y);
            // UI Toolkit 은 y 가 아래로 커진다 → 스틱 값은 위가 + 이므로 뒤집는다
            Vector2 raw = new Vector2(delta.x, -delta.y) / radius;
            SendValueToControl(Shape(raw));
        }

        void Release()
        {
            if (pointerId == PointerId.invalidPointerId) return;
            pointerId = PointerId.invalidPointerId;
            stickBase?.RemoveFromClassList("stick-base--active");
            if (knob != null) knob.style.translate = new Translate(0, 0);
            PlaceIdle();
            SendValueToControl(Vector2.zero);
        }

        /// <summary>손을 뗀 동안은 영역 왼쪽 아래 근처(홈)에 옅게</summary>
        void PlaceIdle()
        {
            if (pointerId != PointerId.invalidPointerId || zone == null) return;
            Rect r = zone.contentRect;
            if (float.IsNaN(r.width)) return;
            basePos = new Vector2(radius + 60f, r.height - radius - 40f);
            SetBase(basePos);
        }

        void SetBase(Vector2 center) => stickBase.style.translate = new Translate(center.x - radius, center.y - radius);

        Vector2 Shape(Vector2 raw)
        {
            float mag = Mathf.Min(1f, raw.magnitude);
            if (mag <= deadzone) return Vector2.zero;
            float output = (mag - deadzone) / (1f - deadzone);
            if (fineCurve) output = Mathf.Pow(output, 1.8f);
            return raw.normalized * output;
        }
    }
}
