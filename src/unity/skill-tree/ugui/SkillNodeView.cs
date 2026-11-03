// 스킬트리 노드 하나 (Button + Image + TextMeshPro). 상태를 색만이 아니라 모양(원 · 육각) · 테두리(점선 · 고리 · 이중선) ·
// 표식(자물쇠 · ＋ · 반원 · 별) · 글자(1/3)로 함께 그린다. 판정은 SkillProgress 가 하고 이 컴포넌트는 그리기만 한다.
// 글자 묶음(Labels)과 표식은 확대 배율의 역수로 크기를 되돌려, 트리를 확대 · 축소해도 화면에서 같은 크기로 읽힌다.
// transition = None 이라 선택 표시는 ISelectHandler · IDeselectHandler 로 FocusRing 을 직접 켠다.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.SkillTree
{
    [RequireComponent(typeof(Button))]
    public class SkillNodeView : MonoBehaviour, ISelectHandler, IDeselectHandler, IPointerEnterHandler
    {
        [Serializable]
        public class StateLook
        {
            public Sprite shape;   // 원 / 육각
            public Sprite frame;   // 점선 원 · 굵은 고리 · 흰 고리 · 육각 이중선
            public Sprite badge;   // 자물쇠 · ＋ · 반원 · 별
        }

        [SerializeField] Image shape, frame, icon, badge;
        [SerializeField] Image pulseRing;          // 지금 살 수 있을 때만 (1Hz)
        [SerializeField] Image focusRing;          // 키보드 · 패드로 고른 노드 (Raycast Target 끔)
        [SerializeField] RectTransform labels;     // 이름 · 단계 · 다음 수치 묶음 (피벗 위 가운데)
        [SerializeField] TMP_Text nameText, rankText, nextText;
        [Tooltip("NodeState 순서: 잠김 · 습득 가능 · 습득 · 최대")]
        [SerializeField] StateLook[] looks = new StateLook[4];

        static readonly Color Dim = new(0.42f, 0.5f, 0.58f), Dark = new(0.04f, 0.09f, 0.13f);

        public Button Button { get; private set; }
        public SkillNode Node { get; private set; }
        Color branchColor;
        bool pulse;
        Action<SkillNodeView> onFocus;

        public void Bind(SkillNode node, Sprite iconSprite, Color color, Action<SkillNodeView> click, Action<SkillNodeView> focus)
        {
            Button = GetComponent<Button>();
            Node = node;
            branchColor = color;
            onFocus = focus;
            icon.sprite = iconSprite;
            nameText.text = node.name;
            // 모든 노드를 고를 수 있게 둔다 (잠긴 노드도 툴팁으로 이유를 봐야 한다). 습득 판정은 누른 뒤 SkillProgress 가
            Button.transition = Selectable.Transition.None;
            Button.onClick.RemoveAllListeners();
            Button.onClick.AddListener(() => click(this));
            SetFocusRing(false);
        }

        /* 키보드 · 패드 선택(EventSystem.SetSelectedGameObject)과 마우스 올림이 같은 툴팁으로 모인다 */
        public void OnSelect(BaseEventData e)
        {
            SetFocusRing(true);
            onFocus?.Invoke(this);
        }

        public void OnDeselect(BaseEventData e) => SetFocusRing(false);
        public void OnPointerEnter(PointerEventData e) => onFocus?.Invoke(this);

        void SetFocusRing(bool on)
        {
            if (focusRing == null) return;
            focusRing.gameObject.SetActive(on);
            focusRing.raycastTarget = false;
        }

        public void SetState(NodeState s, string rankLabel, string nextLabel, bool canLearn)
        {
            StateLook look = looks[(int)s];
            shape.sprite = look.shape;
            frame.sprite = look.frame;
            badge.sprite = look.badge;
            bool filled = s == NodeState.Acquired || s == NodeState.Maxed;
            shape.color = filled ? branchColor : s == NodeState.Available ? Color.Lerp(Dark, branchColor, 0.2f) : Dark;
            frame.color = s == NodeState.Locked ? Dim : s == NodeState.Acquired ? Color.white : branchColor;
            icon.color = filled ? Dark : s == NodeState.Locked ? Dim : branchColor;
            badge.color = s == NodeState.Locked ? Dim : branchColor;

            rankText.text = rankLabel;
            nextText.text = nextLabel;

            pulse = canLearn;
            pulseRing.gameObject.SetActive(canLearn);
            pulseRing.raycastTarget = false;
        }

        /// <summary>
        /// 확대 배율과 정보 단계(0 멀리 · 1 중간 · 2 가까이)를 반영한다.
        /// keepTextSize 면 Labels · 표식에 1/배율 을 곱해 화면 크기를 지키고, 대신 단계별로 보여 줄 것을 줄인다
        /// </summary>
        public void ApplyZoom(float zoom, int level, bool keepTextSize)
        {
            Vector3 inv = Vector3.one * (keepTextSize ? 1f / zoom : 1f);
            labels.localScale = inv;
            badge.rectTransform.localScale = inv;
            int shown = keepTextSize ? level : 2;   // 나쁜 예: 늘 다 그리고 함께 작아진다
            labels.gameObject.SetActive(shown > 0);
            nameText.gameObject.SetActive(shown == 2);
            nextText.gameObject.SetActive(shown == 2);
        }

        void Update()
        {
            if (!pulse) return;
            // 1초에 한 번 퍼지는 고리 (반복 맥동 2Hz 이하)
            float k = Time.unscaledTime % 1f;
            pulseRing.rectTransform.localScale = Vector3.one * (1f + 0.25f * k);
            pulseRing.color = new Color(1f, 1f, 1f, 1f - k);
        }
    }
}
