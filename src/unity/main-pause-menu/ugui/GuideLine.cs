using UnityEngine;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 시선 유도선 — 포커스된 항목의 오른쪽 끝에서 출발해 꺾여서 다음 볼 곳(설명 카드 · 하위 패널 머리)으로 이어진다.
    /// 세 조각(가로 · 사선 · 가로)의 Image 를 매 프레임 두 점 사이에 맞춰 늘이고 돌린다.
    /// 모든 조각은 Raycast Target 을 끄고, pivot 은 (0.5, 0.5), 이 오브젝트와 같은 부모 아래에 둔다 (좌표는 그 부모의 localPosition).
    /// </summary>
    public class GuideLine : MonoBehaviour
    {
        [SerializeField] RectTransform segA, segB, segC;
        [SerializeField] RectTransform endMark;
        [SerializeField, Tooltip("선이 도착할 곳 (설명 카드 제목 등)")] RectTransform to;
        [SerializeField] float thickness = 5f;
        [SerializeField] float stub = 44f;

        /// <summary>MenuItemView.OnSelect 가 넣어 준다 — 선은 늘 포커스 항목에서 출발한다</summary>
        public RectTransform From { get; set; }

        readonly Vector3[] corners = new Vector3[4];

        void LateUpdate()
        {
            bool on = From && to && From.gameObject.activeInHierarchy && to.gameObject.activeInHierarchy;
            segA.gameObject.SetActive(on);
            segB.gameObject.SetActive(on);
            segC.gameObject.SetActive(on);
            endMark.gameObject.SetActive(on);
            if (!on) return;

            var space = (RectTransform)transform.parent;
            // 출발점: 항목의 오른쪽 가운데, 도착점: 대상의 왼쪽 가운데 (같은 부모 좌표계로)
            From.GetWorldCorners(corners);
            Vector2 a = space.InverseTransformPoint((corners[2] + corners[3]) * 0.5f);
            to.GetWorldCorners(corners);
            Vector2 d = space.InverseTransformPoint((corners[0] + corners[1]) * 0.5f);
            Vector2 b = new(Mathf.Min(a.x + stub, d.x - 30f), a.y);
            Vector2 c = new(d.x - stub, d.y);

            Stretch(segA, a, b);
            Stretch(segB, b, c);
            Stretch(segC, c, d);
            endMark.localPosition = d;
        }

        void Stretch(RectTransform seg, Vector2 p, Vector2 q)
        {
            Vector2 v = q - p;
            seg.localPosition = (p + q) * 0.5f;
            seg.sizeDelta = new Vector2(v.magnitude + thickness, thickness);
            seg.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(v.y, v.x) * Mathf.Rad2Deg);
        }
    }
}
