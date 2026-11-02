using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.OffscreenWaypoint
{
    /// <summary>
    /// 화면 밖 목표 표시 — UI Toolkit 버전.
    /// RuntimePanelUtils.CameraTransformWorldToPanel 로 월드 좌표를 패널 좌표(y 아래로 +)로 바로 바꾼다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class WaypointsUITK : MonoBehaviour
    {
        [SerializeField] Camera cam;
        [SerializeField] Transform[] targets;
        [SerializeField] Vector3 worldOffset = new(0f, 3.2f, 0f);
        [SerializeField] float edgeMargin = 80f;

        VisualElement layer;
        VisualElement[] markers, arrows;
        Label[] distances;

        void OnEnable()
        {
            layer = GetComponent<UIDocument>().rootVisualElement.Q("waypoint-layer");
            markers = new VisualElement[targets.Length];
            arrows = new VisualElement[targets.Length];
            distances = new Label[targets.Length];

            for (int i = 0; i < targets.Length; i++)
            {
                var marker = new VisualElement { pickingMode = PickingMode.Ignore };
                marker.AddToClassList("waypoint");

                var arrow = new VisualElement();
                arrow.AddToClassList("waypoint__arrow");
                var arrowShape = new VisualElement();
                arrowShape.AddToClassList("waypoint__arrow-shape");
                arrow.Add(arrowShape);

                var icon = new VisualElement();
                icon.AddToClassList("waypoint__icon");

                var distance = new Label();
                distance.AddToClassList("waypoint__dist");

                marker.Add(arrow);
                marker.Add(icon);
                marker.Add(distance);
                layer.Add(marker);

                markers[i] = marker;
                arrows[i] = arrow;
                distances[i] = distance;
            }
        }

        void LateUpdate()
        {
            Rect area = layer.layout;
            if (float.IsNaN(area.width) || layer.panel == null) return;   // 첫 레이아웃 전

            Vector2 center = area.size * 0.5f;
            Vector2 half = center - Vector2.one * edgeMargin;

            for (int i = 0; i < targets.Length; i++)
            {
                Vector3 world = targets[i].position + worldOffset;
                bool behind = cam.WorldToViewportPoint(world).z < 0f;

                Vector2 local = RuntimePanelUtils.CameraTransformWorldToPanel(layer.panel, world, cam) - center;
                if (behind) local = -local;   // 뒤쪽은 반전된 좌표가 나오므로 되돌린다

                bool inside = !behind && Mathf.Abs(local.x) <= half.x && Mathf.Abs(local.y) <= half.y;
                if (!inside)
                {
                    Vector2 dir = local.sqrMagnitude > 0.01f ? local.normalized : Vector2.up;   // 패널은 y 가 아래로 +
                    float t = Mathf.Min(half.x / Mathf.Max(1e-4f, Mathf.Abs(dir.x)), half.y / Mathf.Max(1e-4f, Mathf.Abs(dir.y)));
                    local = dir * t;
                    float degrees = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
                    arrows[i].style.rotate = new Rotate(new Angle(degrees, AngleUnit.Degree));
                }
                arrows[i].style.display = inside ? DisplayStyle.None : DisplayStyle.Flex;

                Vector2 pos = center + local;
                markers[i].style.translate = new Translate(pos.x, pos.y);
                distances[i].text = $"{Vector3.Distance(cam.transform.position, targets[i].position):0}m";
            }
        }
    }
}
