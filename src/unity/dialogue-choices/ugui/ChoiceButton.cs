using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 선택지 버튼 한 개의 포커스 연출 — 강조색 판 + 앞으로 밀기 + ▶ 표시 + 확정 키(잠금 중엔 흐림).
    /// Button 의 Transition 은 None 으로 두고 이 스크립트가 색·위치를 직접 바꾼다 (마우스·패드 경험을 같게).
    /// 확정은 Button.onClick → DialogueView.OnChoice(index) 한 곳으로 모은다.
    /// </summary>
    [RequireComponent(typeof(Button))]
    public class ChoiceButton : MonoBehaviour, ISelectHandler, IDeselectHandler, IPointerEnterHandler
    {
        [SerializeField] Image frame;                 // SkewEffect 를 붙인 배경
        [SerializeField] TMP_Text label;
        [SerializeField] RectTransform content;       // 포커스 때 왼쪽으로 30px 밀리는 묶음
        [SerializeField] GameObject marker;           // ▶
        [SerializeField] CanvasGroup confirmGlyph;    // 확정 키 안내
        [SerializeField] Image lockFill;              // Filled Horizontal — 남은 입력 잠금
        [SerializeField] GameObject defaultTag;       // '시간 초과 시' 표시
        [SerializeField] Color idleFrame = new(0.04f, 0.05f, 0.06f, 0.9f);
        [SerializeField] Color idleText = new(0.81f, 0.84f, 0.87f);
        [SerializeField, Tooltip("포커스 강조 시간 (초) — 150ms 를 넘기지 않는다")] float focusTime = 0.1f;

        public Color accent = new(1f, 0.416f, 0.239f);
        public Color ink = new(0.04f, 0.05f, 0.06f);

        // DialogueView.Awake 가 먼저 불릴 수 있으므로(실행 순서 미정) 처음 쓸 때 가져온다
        Button button;
        CanvasGroup group;
        public Button Button
        {
            get
            {
                if (button == null) button = GetComponent<Button>();
                return button;
            }
        }
        public CanvasGroup Group
        {
            get
            {
                if (group == null) group = GetComponent<CanvasGroup>();
                if (group == null) group = gameObject.AddComponent<CanvasGroup>();
                return group;
            }
        }
        public int Index { get; set; }
        public event Action<int> Focused;

        bool focused;
        float t;

        void Awake() => Button.transition = Selectable.Transition.None;

        public void Setup(int index, string text, bool isAction, bool showDefaultTag)
        {
            Index = index;
            label.text = isAction ? $"( {text} )" : text;
            defaultTag.SetActive(showDefaultTag);
            focused = false;
            t = 0f;
            Apply();
        }

        public void OnSelect(BaseEventData e)
        {
            focused = true;
            Focused?.Invoke(Index);
        }

        public void OnDeselect(BaseEventData e) => focused = false;

        // 마우스를 올리면 포커스가 따라온다 → 마우스·패드·키보드가 같은 '하나의 포커스'를 공유
        public void OnPointerEnter(PointerEventData e)
        {
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(gameObject);
        }

        /// <summary>ratio: 남은 잠금 비율 (0 = 풀림)</summary>
        public void SetLock(float ratio)
        {
            confirmGlyph.alpha = ratio > 0f ? 0.35f : 1f;
            lockFill.fillAmount = ratio;
        }

        void Update()
        {
            // 일시정지 메뉴 위에서도 움직이도록 unscaled
            t = Mathf.MoveTowards(t, focused ? 1f : 0f, Time.unscaledDeltaTime / Mathf.Max(0.01f, focusTime));
            Apply();
        }

        void Apply()
        {
            frame.color = Color.Lerp(idleFrame, accent, t);
            label.color = Color.Lerp(idleText, ink, t);
            label.fontStyle = focused ? FontStyles.Bold : FontStyles.Normal;
            content.anchoredPosition = new Vector2(-30f * t, 0f);
            marker.SetActive(focused);
            confirmGlyph.gameObject.SetActive(focused);
        }
    }
}
