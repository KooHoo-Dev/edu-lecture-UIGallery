using TMPro;
using UnityEngine;

namespace UIGallery.OffscreenWaypoint
{
    /// <summary>
    /// 화면 밖 목표 표시 — UGUI 버전. 목표마다 마커 하나.
    /// layer: 화면 전체를 덮는 RectTransform (Pivot 0.5, 0.5). 마커의 Anchor 도 가운데.
    /// </summary>
    public class WaypointMarker : MonoBehaviour
    {
        [SerializeField] Transform target;
        [SerializeField] Camera cam;
        [SerializeField] RectTransform layer;
        [SerializeField] RectTransform arrow;              // 화면 밖일 때만 표시
        [SerializeField] TextMeshProUGUI distanceText;
        [SerializeField] CanvasGroup group;
        [SerializeField] Vector3 worldOffset = new(0f, 3.2f, 0f);
        [SerializeField, Tooltip("캔버스 단위 여백")] float edgeMargin = 80f;
        [SerializeField, Tooltip("이 거리 안에서는 흐려진다 (m)")] float fadeNear = 8f;

        RectTransform rect;

        void Awake() => rect = (RectTransform)transform;

        void LateUpdate()   // 카메라가 Update 에서 움직인 뒤에 계산
        {
            Vector3 world = target.position + worldOffset;
            Vector3 screen = cam.WorldToScreenPoint(world);
            bool behind = screen.z < 0f;   // 카메라 뒤쪽: 좌표가 반전되어 나온다

            // 스크린 픽셀 → 레이어 로컬 좌표 (가운데가 0,0). Overlay Canvas 는 카메라 인자 null
            RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, screen, null, out Vector2 local);
            if (behind) local = -local;

            Vector2 half = layer.rect.size * 0.5f - Vector2.one * edgeMargin;
            bool inside = !behind && Mathf.Abs(local.x) <= half.x && Mathf.Abs(local.y) <= half.y;

            if (inside)
            {
                rect.anchoredPosition = local;
            }
            else
            {
                Vector2 dir = local.sqrMagnitude > 0.01f ? local.normalized : Vector2.down;
                rect.anchoredPosition = ClampToEdge(dir, half);
                arrow.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg);
            }
            arrow.gameObject.SetActive(!inside);

            float distance = Vector3.Distance(cam.transform.position, target.position);
            distanceText.text = $"{distance:0}m";
            group.alpha = inside && fadeNear > 0f ? Mathf.Max(0.15f, Mathf.InverseLerp(fadeNear * 0.5f, fadeNear, distance)) : 1f;
        }

        /// 가운데에서 dir 방향으로 뻗은 선이 여백 사각형과 만나는 점
        static Vector2 ClampToEdge(Vector2 dir, Vector2 half)
        {
            float tx = half.x / Mathf.Max(1e-4f, Mathf.Abs(dir.x));
            float ty = half.y / Mathf.Max(1e-4f, Mathf.Abs(dir.y));
            return dir * Mathf.Min(tx, ty);
        }
    }
}
