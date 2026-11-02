// 노트 하나의 그림 (풀에서 꺼내 쓴다). 위치는 NoteSpawner 가 곡 위치로 계산해 넣어 줄 뿐, 스스로 움직이지 않는다.
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.RhythmTimingFeedback
{
    [RequireComponent(typeof(RectTransform))]
    public class NoteView : MonoBehaviour
    {
        [SerializeField] Image image;
        [SerializeField] Color outerColor = new Color(0.93f, 0.96f, 1f);
        [SerializeField] Color innerColor = new Color(0.37f, 0.83f, 1f);

        RectTransform rect;
        public RectTransform Rect => rect ? rect : rect = (RectTransform)transform;

        public void Place(Vector2 anchoredPosition, bool innerLane, bool missed)
        {
            if (!gameObject.activeSelf) gameObject.SetActive(true);
            Rect.anchoredPosition = anchoredPosition;
            var c = innerLane ? innerColor : outerColor;
            c.a = missed ? 0.32f : 1f; // 놓친 노트는 흐리게 지나간다
            image.color = c;
        }

        public void Hide()
        {
            if (gameObject.activeSelf) gameObject.SetActive(false);
        }
    }
}
