using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.ContextLoreGlossary
{
    // TextMeshPro 글 안의 <link="id"> 키워드 판정.
    // 포인터가 움직일 때마다 TMP_TextUtilities.FindIntersectingLink 로 "지금 어느 링크 위인가" 를 구하고,
    // 바뀐 순간에만 TooltipStack 에 들어옴 · 나감을 알린다. 링크 사각형(툴팁 기준점)과 키보드 포커스 테두리도 여기서 계산한다.
    // TMP_Text 의 Raycast Target 이 켜져 있어야 포인터 이벤트가 온다.
    [RequireComponent(typeof(TMP_Text))]
    public class KeywordText : MonoBehaviour, IPointerMoveHandler, IPointerExitHandler, IPointerClickHandler
    {
        [Tooltip("0 = 대사, n = 툴팁 n-1 안의 글")]
        public int level;
        public TooltipStack stack;
        [SerializeField] Image focusFrame;   // 키보드 · 패드로 고른 키워드 테두리 (Raycast Target 끔)

        TMP_Text text;
        Canvas canvas;
        int hovered = -1;
        readonly Vector3[] corners = new Vector3[4];

        public TMP_Text Text => text != null ? text : text = GetComponent<TMP_Text>();
        public int LinkCount => Text.textInfo.linkCount;
        public string LinkId(int i) => i >= 0 && i < LinkCount ? Text.textInfo.linkInfo[i].GetLinkID() : null;

        void Awake()
        {
            canvas = GetComponentInParent<Canvas>();
            if (focusFrame != null) focusFrame.raycastTarget = false;
        }

        void OnDisable()
        {
            hovered = -1;
            ShowFocus(-1);
        }

        /// 글을 바꾼 직후에 부른다 — linkInfo 는 메시가 다시 만들어진 뒤에야 채워진다
        public void SetText(string rich)
        {
            Text.text = rich;
            Text.ForceMeshUpdate();
            hovered = -1;
            ShowFocus(-1);
        }

        Camera Cam => canvas == null || canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;

        public void OnPointerMove(PointerEventData e)
        {
            int i = TMP_TextUtilities.FindIntersectingLink(Text, e.position, Cam);
            if (i == hovered) return;
            if (hovered >= 0) stack.KeywordExit(this);
            hovered = i;
            if (i >= 0) stack.KeywordEnter(this, i, LinkId(i));
        }

        public void OnPointerExit(PointerEventData e)
        {
            if (hovered >= 0) stack.KeywordExit(this);
            hovered = -1;
        }

        public void OnPointerClick(PointerEventData e)
        {
            // 터치는 PointerMove 가 오지 않을 수 있어 누른 자리에서 다시 판정한다
            int i = TMP_TextUtilities.FindIntersectingLink(Text, e.position, Cam);
            if (i >= 0) stack.KeywordClick(this, i, LinkId(i));
        }

        /// i 번째 링크가 차지한 사각형 (target 의 로컬 좌표). 여러 줄로 갈라지면 첫 글자가 있는 줄만 쓴다
        public Rect LinkRectIn(RectTransform target, int i)
        {
            var info = Text.textInfo;
            if (i < 0 || i >= info.linkCount) return RectIn(target, (RectTransform)transform);
            var link = info.linkInfo[i];
            var first = info.characterInfo[link.linkTextfirstCharacterIndex];
            Vector3 min = first.bottomLeft, max = first.topRight;
            for (int c = 1; c < link.linkTextLength; c++)
            {
                var ch = info.characterInfo[link.linkTextfirstCharacterIndex + c];
                if (ch.lineNumber != first.lineNumber || !ch.isVisible) continue;
                min = Vector3.Min(min, ch.bottomLeft);
                max = Vector3.Max(max, ch.topRight);
            }
            Vector3 wMin = transform.TransformPoint(min), wMax = transform.TransformPoint(max);
            Vector2 a = target.InverseTransformPoint(wMin), b = target.InverseTransformPoint(wMax);
            return Rect.MinMaxRect(Mathf.Min(a.x, b.x), Mathf.Min(a.y, b.y), Mathf.Max(a.x, b.x), Mathf.Max(a.y, b.y));
        }

        Rect RectIn(RectTransform target, RectTransform r)
        {
            r.GetWorldCorners(corners);
            Vector2 a = target.InverseTransformPoint(corners[0]), b = target.InverseTransformPoint(corners[2]);
            return Rect.MinMaxRect(a.x, a.y, b.x, b.y);
        }

        /// 키보드 포커스 테두리를 i 번째 링크에 맞춘다 (-1 = 숨김)
        public void ShowFocus(int i)
        {
            if (focusFrame == null) return;
            bool on = i >= 0 && i < LinkCount;
            focusFrame.enabled = on;
            if (!on) return;
            var parent = (RectTransform)focusFrame.rectTransform.parent;
            Rect r = LinkRectIn(parent, i);
            var fr = focusFrame.rectTransform;
            fr.anchorMin = fr.anchorMax = new Vector2(0.5f, 0.5f);
            fr.pivot = new Vector2(0.5f, 0.5f);
            fr.anchoredPosition = r.center - parent.rect.center;
            fr.sizeDelta = r.size + new Vector2(10f, 6f);
        }
    }
}
