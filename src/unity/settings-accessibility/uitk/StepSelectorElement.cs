using System;
using UnityEngine.UIElements;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// ◀ 값 ▶ 커스텀 컨트롤 (UI Toolkit). UXML 에서 &lt;StepSelectorElement key="SubtitleBg" /&gt; 로 쓴다.
    /// 좌우 내비게이션 = 값 변경, 위아래는 그대로 두어 포커스 이동에 쓴다.
    /// DropdownField 는 Submit 으로 팝업을 열어 이 규칙이 깨지므로 쓰지 않는다.
    /// (UGUI 쪽 StepSelector 와 이름이 겹치지 않게 Element 를 붙였다)
    /// </summary>
    [UxmlElement]
    public partial class StepSelectorElement : VisualElement
    {
        [UxmlAttribute] public string key { get; set; } = "SubtitleBg";

        public int Min = 0, Max = 2, Step = 1;
        public int Value { get; private set; }
        public Func<int, string> Format = v => v.ToString();
        public event Action<int> ValueChanged;

        readonly Label valueLabel = new() { name = "value" };

        public StepSelectorElement()
        {
            AddToClassList("step-selector");
            focusable = true;
            valueLabel.AddToClassList("step-value");

            var left = new Button(() => Change(-1)) { text = "◀", focusable = false };
            var right = new Button(() => Change(+1)) { text = "▶", focusable = false };
            left.AddToClassList("step-arrow");
            right.AddToClassList("step-arrow");
            Add(left);
            Add(valueLabel);
            Add(right);

            RegisterCallback<NavigationMoveEvent>(OnNavigate);
        }

        void OnNavigate(NavigationMoveEvent evt)
        {
            if (evt.direction == NavigationMoveEvent.Direction.Left) Change(-1);
            else if (evt.direction == NavigationMoveEvent.Direction.Right) Change(+1);
            else return;                 // Up / Down 은 기본 포커스 이동으로
            evt.StopPropagation();       // 좌우는 여기서 소비 (부모 요소로 전파되지 않게)
            // Unity 6 에서는 포커스 이동을 FocusController 가 따로 처리한다.
            // StopPropagation 만으로는 옆 요소로 포커스가 넘어갈 수 있으므로 기본 동작도 막는다 (2023.2+ API)
            focusController?.IgnoreEvent(evt);
        }

        public void SetValueWithoutNotify(int v)
        {
            Value = Math.Clamp(v, Min, Max);
            valueLabel.text = Format(Value);
        }

        void Change(int dir)
        {
            int next = Math.Clamp(Value + dir * Step, Min, Max);
            if (next == Value) return;
            SetValueWithoutNotify(next);
            ValueChanged?.Invoke(Value);
        }
    }
}
