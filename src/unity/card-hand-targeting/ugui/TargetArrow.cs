using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.CardHandTargeting
{
    /// <summary>
    /// 타겟 화살표 — 2차 베지어 곡선 위에 점 Image 를 찍고 끝에 화살촉을 접선 방향으로 돌려 놓는다.
    /// 이 RectTransform 은 화면 전체를 덮고(앵커 늘림, 피벗 가운데), 점 · 화살촉은 앵커 · 피벗 가운데.
    /// 모든 Graphic 의 Raycast Target 을 끈다 — 안 그러면 화살표가 포인터 아래 적을 가린다.
    /// </summary>
    public class TargetArrow : MonoBehaviour
    {
        [SerializeField] RectTransform[] dots = new RectTransform[14];
        [SerializeField] RectTransform head;
        [SerializeField] Color idleColor = new(0.81f, 0.89f, 0.96f);
        [SerializeField] Color targetColor = new(1f, 0.7f, 0.28f);
        [Tooltip("곡선이 위로 휘는 정도")]
        [SerializeField] float arch = 90f;

        RectTransform rect;
        Graphic[] graphics;

        void Awake()
        {
            rect = (RectTransform)transform;
            graphics = GetComponentsInChildren<Graphic>(true);
            foreach (Graphic g in graphics) g.raycastTarget = false;
        }

        public void Draw(Vector2 screenStart, Vector2 screenEnd, bool onTarget)
        {
            if (!gameObject.activeSelf) gameObject.SetActive(true);
            if (rect == null) Awake();
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, screenStart, null, out Vector2 a);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, screenEnd, null, out Vector2 b);
            // 조절점: 시작점 바로 위쪽 — 카드에서 위로 솟았다가 대상 쪽으로 꺾인다
            Vector2 c = new(a.x + (b.x - a.x) * 0.05f, Mathf.Max(a.y, b.y) + arch);
            for (int i = 0; i < dots.Length; i++)
                Place(dots[i], a, c, b, 0.04f + 0.86f * i / (dots.Length - 1), 0.6f + 0.5f * i / dots.Length);
            Place(head, a, c, b, 1f, 1f);
            Color col = onTarget ? targetColor : idleColor;   // 대상 위 = 금색 (색만이 아니라 적 쪽 괄호 · 미리보기도 함께)
            foreach (Graphic g in graphics) g.color = col;
        }

        public void Hide() => gameObject.SetActive(false);

        static void Place(RectTransform r, Vector2 p0, Vector2 c, Vector2 p1, float t, float scale)
        {
            float u = 1f - t;
            Vector2 p = u * u * p0 + 2f * u * t * c + t * t * p1;
            Vector2 d = 2f * u * (c - p0) + 2f * t * (p1 - c);   // 접선 — 점 · 화살촉이 곡선 방향을 본다
            r.anchoredPosition = p;
            r.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
            r.localScale = Vector3.one * scale;
        }
    }
}
