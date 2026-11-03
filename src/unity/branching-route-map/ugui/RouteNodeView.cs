// 분기 경로 맵 — 노드 하나 (Button + Image + TextMeshPro). 상태에 따라 색 · 크기 · 고리 · 체크 표시만 바꾼다.
// 갈 수 있는 노드만 interactable. 판정은 RouteMapView 가 하고 이 컴포넌트는 그리기만 한다.
// transition = None 이라 Button 이 선택 색을 그리지 않는다 — 키보드 · 패드로 고른 노드는 Select/Deselect 에서 포커스 고리를 직접 켠다.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.BranchingRouteMap
{
    public enum NodeState { Idle, Next, Past, Visited, Current }

    [RequireComponent(typeof(Button))]
    public class RouteNodeView : MonoBehaviour, ISelectHandler, IDeselectHandler
    {
        [SerializeField] Image frame;        // 원 테두리 (종류 색)
        [SerializeField] Image fill;         // 지나온 칸 · 현재 칸이면 종류 색으로 채운다
        [SerializeField] Image icon;         // 종류 아이콘 — 모양만으로도 구분되게 그린 스프라이트
        [SerializeField] Image pulseRing;    // 갈 수 있을 때만 켜는 고리 (1Hz)
        [SerializeField] Image focusRing;    // 키보드 · 패드로 고른 노드의 흰 고리 (웹 판의 점선 고리). 노드보다 조금 크게, Raycast Target 끔
        [SerializeField] GameObject check;   // 지나온 칸 표시
        [SerializeField] TMP_Text caption;   // 종류 이름 (스크린 리더 · 작은 화면용, 숨겨도 된다)

        static readonly Color Dark = new(0.04f, 0.09f, 0.13f);

        public Button Button { get; private set; }
        public MapNode Node { get; private set; }
        Color kindColor;
        NodeState state;
        bool hit;

        public void Bind(MapNode node, Sprite sprite, Color color, string kindName, Action<int> onClick)
        {
            Button = GetComponent<Button>();
            Node = node;
            kindColor = color;
            icon.sprite = sprite;
            if (caption != null) caption.text = kindName;
            Button.onClick.RemoveAllListeners();
            Button.onClick.AddListener(() => onClick(node.id));
            // 비활성 색 변화는 우리가 직접 그린다 (ColorTint 가 덮어쓰지 않게). 선택 표시도 직접 — 아래 OnSelect
            Button.transition = Selectable.Transition.None;
            SetFocusRing(false);
        }

        /* 키보드 · 패드 선택 표시. EventSystem 이 SetSelectedGameObject 할 때 부른다 (마우스 클릭으로 골라도 같다) */
        public void OnSelect(BaseEventData e) => SetFocusRing(true);
        public void OnDeselect(BaseEventData e) => SetFocusRing(false);

        void SetFocusRing(bool on)
        {
            if (focusRing == null) return;
            focusRing.gameObject.SetActive(on);
            focusRing.raycastTarget = false;
        }

        /// <summary>highlighted = 범례 강조 대상, dimmed = 범례 강조 중인데 다른 종류</summary>
        public void SetState(NodeState s, bool highlighted, bool dimmed, bool animate)
        {
            state = s;
            hit = highlighted;
            bool filled = s == NodeState.Visited || s == NodeState.Current;
            frame.color = s == NodeState.Next ? Color.white : kindColor;
            fill.color = filled ? kindColor : Dark;
            icon.color = filled ? Dark : kindColor;
            check.SetActive(s == NodeState.Visited);
            pulseRing.gameObject.SetActive(s == NodeState.Next);
            float a = dimmed ? 0.18f : s == NodeState.Past ? 0.28f : 1f;
            foreach (Graphic g in GetComponentsInChildren<Graphic>(true)) g.CrossFadeAlpha(a, animate ? 0.15f : 0f, true);
            transform.localScale = Vector3.one * (s == NodeState.Next ? 1.18f : highlighted ? 1.12f : 1f);
        }

        void Update()
        {
            // 갈 수 있는 노드: 고리가 1초에 한 번 퍼진다 (번쩍임 아님, 2Hz 이하). 범례 강조는 0.6Hz 맥동
            float t = Time.unscaledTime;
            if (state == NodeState.Next)
            {
                float k = t % 1f;
                pulseRing.rectTransform.localScale = Vector3.one * (1f + 0.5f * k);
                pulseRing.color = new Color(1f, 1f, 1f, 0.9f * (1f - k));
            }
            else if (hit) transform.localScale = Vector3.one * (1.12f + 0.04f * Mathf.Sin(t * Mathf.PI * 1.25f));
        }
    }
}
