using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.Layouts;
using UnityEngine.InputSystem.OnScreen;

namespace UIGallery.VirtualJoystickTouchLayout
{
    /// <summary>
    /// 가상 조이스틱 — Input System 의 OnScreenControl 을 상속해 '가상 패드의 왼쪽 스틱' 값을 보낸다.
    /// → PlayerInput 의 Move 액션(<Gamepad>/leftStick)을 쓰는 이동 코드가 터치에서도 그대로 동작한다.
    /// - 손가락 하나(pointerId)만 붙잡는다. 다른 손가락은 버튼(OnScreenButton)으로 동시에 쓸 수 있다
    /// - 고정 / 플로팅(누른 곳에 받침) / 따라오기(반경을 넘으면 받침이 끌려옴)
    /// - 거리 ÷ 반경 → 0~1, 데드존 안은 0, 밖은 0~1 로 다시 펼친 뒤 반응 곡선
    ///
    /// 준비: 이 스크립트는 StickZone(투명 Image, Raycast Target 켬)에 붙인다. StickZone 의 Pivot 은 (0.5, 0.5),
    /// Base 는 StickZone 의 자식으로 Anchor = (0.5, 0.5), Knob 은 Base 의 자식으로 Anchor = (0.5, 0.5).
    /// </summary>
    public class VirtualJoystick : OnScreenControl, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public enum Mode { Fixed, Floating, Dynamic }

        [SerializeField] Mode mode = Mode.Floating;
        [SerializeField] RectTransform stickBase;
        [SerializeField] RectTransform knob;
        [Tooltip("이만큼 밀면 입력 1 (Canvas 기준 px)")]
        [SerializeField] float radius = 120f;
        [Range(0f, 0.5f)] [SerializeField] float deadzone = 0.12f;
        [Tooltip("켜면 조금 밀었을 때 더 천천히 (출력 = 입력^1.8)")]
        [SerializeField] bool fineCurve = true;
        [Tooltip("손을 뗀 동안 받침·손잡이의 투명도")]
        [Range(0f, 1f)] [SerializeField] float idleAlpha = 0.45f;
        [SerializeField] CanvasGroup visual;

        [InputControl(layout = "Vector2")]
        [SerializeField] string m_ControlPath = "<Gamepad>/leftStick";

        protected override string controlPathInternal
        {
            get => m_ControlPath;
            set => m_ControlPath = value;
        }

        const int None = int.MinValue;
        int pointerId = None;
        Vector2 home;
        RectTransform zone;

        void Awake()
        {
            zone = (RectTransform)transform;
            home = stickBase.anchoredPosition;
            stickBase.sizeDelta = Vector2.one * (radius * 2f);   // 그림 크기 = 판정 반경 × 2
            visual.alpha = idleAlpha;
        }

        public void OnPointerDown(PointerEventData e)
        {
            if (pointerId != None) return;   // 이미 다른 손가락이 조이스틱을 쓰는 중
            Vector2 local = ToLocal(e);
            if (mode == Mode.Fixed && Vector2.Distance(local, home) > radius * 1.5f) return;   // 판정은 그림보다 넉넉하게

            pointerId = e.pointerId;
            if (mode != Mode.Fixed)
            {
                // 엄지가 닿은 곳에 받침 — 받침이 영역 밖으로 잘리지 않게 안쪽으로
                Rect r = zone.rect;
                stickBase.anchoredPosition = new Vector2(
                    Mathf.Clamp(local.x, r.xMin + radius, r.xMax - radius),
                    Mathf.Clamp(local.y, r.yMin + radius, r.yMax - radius));
            }
            visual.alpha = 1f;
            OnDrag(e);
        }

        public void OnDrag(PointerEventData e)
        {
            if (e.pointerId != pointerId) return;   // 다른 손가락의 움직임은 무시
            Vector2 delta = ToLocal(e) - stickBase.anchoredPosition;

            if (mode == Mode.Dynamic && delta.magnitude > radius)
            {
                // 따라오기: 반경을 넘은 만큼 받침을 손가락 쪽으로 끌어온다
                stickBase.anchoredPosition += delta.normalized * (delta.magnitude - radius);
                delta = ToLocal(e) - stickBase.anchoredPosition;
            }

            knob.anchoredPosition = Vector2.ClampMagnitude(delta, radius);   // 손잡이는 받침 밖으로 나가지 않는다
            SendValueToControl(Shape(delta / radius));
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (e.pointerId == pointerId) Release();
        }

        protected override void OnDisable()
        {
            Release();   // 눌린 채로 꺼지면 캐릭터가 계속 걷는다
            base.OnDisable();
        }

        void Release()
        {
            pointerId = None;
            if (stickBase == null) return;
            stickBase.anchoredPosition = home;
            knob.anchoredPosition = Vector2.zero;
            visual.alpha = idleAlpha;
            SendValueToControl(Vector2.zero);
        }

        /// <summary>입력(크기 0~1 이상) → 데드존 → 0~1 로 다시 펼치기 → 반응 곡선</summary>
        Vector2 Shape(Vector2 raw)
        {
            float mag = Mathf.Min(1f, raw.magnitude);
            if (mag <= deadzone) return Vector2.zero;
            float output = (mag - deadzone) / (1f - deadzone);
            if (fineCurve) output = Mathf.Pow(output, 1.8f);
            return raw.normalized * output;
        }

        Vector2 ToLocal(PointerEventData e)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(zone, e.position, e.pressEventCamera, out Vector2 local);
            return local;   // Pivot (0.5, 0.5) 기준 = Base 의 anchoredPosition 과 같은 좌표계
        }
    }
}
