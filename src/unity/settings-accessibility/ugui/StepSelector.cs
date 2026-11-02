using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// ◀ 값 ▶ 위젯 — 슬라이더·단계 선택·토글을 모두 이 하나로 만든다.
    /// 규칙은 하나: 위아래 = 행 이동(기본 내비게이션), 좌우 = 값 변경.
    /// 팝업을 여는 드롭다운처럼 이 규칙에서 벗어나는 위젯은 쓰지 않는다.
    /// </summary>
    public class StepSelector : Selectable
    {
        [Header("값")]
        [SerializeField] int min = 0;
        [SerializeField] int max = 2;
        [SerializeField] int step = 1;
        [SerializeField] int value = 1;

        [Header("표시 (선택)")]
        [SerializeField] TMP_Text valueText;
        [SerializeField] Image fill;            // 수치형이면 Image Type = Filled (Horizontal)
        [SerializeField] Button leftArrow;      // 마우스·터치용
        [SerializeField] Button rightArrow;

        public event Action<int> ValueChanged;
        public event Action<StepSelector> Selected;

        /// <summary>값을 글자로 바꾸는 함수 (OptionRow 가 넣어 준다)</summary>
        public Func<int, string> Format = v => v.ToString();

        public int Value => value;

        protected override void Awake()
        {
            base.Awake();
            if (leftArrow) leftArrow.onClick.AddListener(() => Step(-1));
            if (rightArrow) rightArrow.onClick.AddListener(() => Step(+1));
        }

        public void Configure(int newMin, int newMax, int newStep)
        {
            min = newMin;
            max = newMax;
            step = Mathf.Max(1, newStep);
        }

        /// <summary>외부(설정 데이터)에서 값을 넣을 때. 이벤트를 다시 보내지 않는다.</summary>
        public void SetValueWithoutNotify(int v)
        {
            value = Mathf.Clamp(v, min, max);
            Refresh();
        }

        public void Step(int dir)
        {
            int next = Mathf.Clamp(value + dir * step, min, max);
            if (next == value) return;
            value = next;
            Refresh();
            ValueChanged?.Invoke(value);
        }

        public override void OnMove(AxisEventData eventData)
        {
            // 좌우는 값 변경, 위아래는 원래 내비게이션(행 이동)으로 넘긴다
            if (eventData.moveDir == MoveDirection.Left) { Step(-1); eventData.Use(); return; }
            if (eventData.moveDir == MoveDirection.Right) { Step(+1); eventData.Use(); return; }
            base.OnMove(eventData);
        }

        public override void OnSelect(BaseEventData eventData)
        {
            base.OnSelect(eventData);
            Selected?.Invoke(this);
        }

        void Refresh()
        {
            if (valueText) valueText.text = Format(value);
            if (fill) fill.fillAmount = max > min ? (value - min) / (float)(max - min) : 0f;
            if (leftArrow) leftArrow.interactable = value > min;
            if (rightArrow) rightArrow.interactable = value < max;
        }
    }
}
