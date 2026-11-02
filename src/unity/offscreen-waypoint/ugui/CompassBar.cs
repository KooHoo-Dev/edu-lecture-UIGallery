using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.OffscreenWaypoint
{
    /// <summary>
    /// 나침반 띠 — UGUI 버전.
    /// ticks: 360° 눈금이 그려진 텍스처 한 장 (Wrap Mode = Repeat). uvRect 를 옮겨 스크롤한다.
    /// bar 에는 RectMask2D 를 붙여 범위 밖 아이콘을 잘라낸다.
    /// </summary>
    public class CompassBar : MonoBehaviour
    {
        [SerializeField] Camera cam;
        [SerializeField] RectTransform bar;
        [SerializeField] RawImage ticks;
        [SerializeField, Range(90f, 360f)] float visibleDegrees = 180f;
        [SerializeField] Transform[] targets;
        [SerializeField] RectTransform[] icons;   // targets 와 같은 순서

        void LateUpdate()
        {
            float heading = cam.transform.eulerAngles.y;   // 0 = +Z(북쪽)
            float span = visibleDegrees / 360f;
            ticks.uvRect = new Rect(heading / 360f - span * 0.5f, 0f, span, 1f);

            float halfWidth = bar.rect.width * 0.5f;
            float halfDegrees = visibleDegrees * 0.5f;
            Vector3 forward = Vector3.ProjectOnPlane(cam.transform.forward, Vector3.up);

            for (int i = 0; i < targets.Length; i++)
            {
                Vector3 to = Vector3.ProjectOnPlane(targets[i].position - cam.transform.position, Vector3.up);
                float angle = Vector3.SignedAngle(forward, to, Vector3.up);   // + 면 오른쪽
                float clamped = Mathf.Clamp(angle, -halfDegrees, halfDegrees);

                Vector2 pos = icons[i].anchoredPosition;
                pos.x = clamped / halfDegrees * halfWidth;
                icons[i].anchoredPosition = pos;

                // 범위 밖이면 끝에 붙인 채 흐리게
                var image = icons[i].GetComponent<Graphic>();
                if (image != null) image.canvasRenderer.SetAlpha(Mathf.Abs(angle) > halfDegrees ? 0.55f : 1f);
            }
        }
    }
}
