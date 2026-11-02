using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.CircularMinimapSample
{
    /// <summary>
    /// 원형 미니맵 — UI Toolkit 버전 (UIDocument + CircularMinimap.uxml/uss).
    /// UGUI 와 같은 변환(오프셋 × 축척 → 회전)을 y-up 으로 계산한 뒤, 화면에 놓을 때만 y 를 뒤집는다.
    /// 주의: UITK 는 y 가 아래로 증가하고 rotate 는 화면 '시계 방향'이 + 다 (UGUI 의 Z 회전과 반대).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class CircularMinimapUITK : MonoBehaviour
    {
        public enum Orientation { Rotate, NorthUp }
        public enum Tier { Primary = 0, Danger = 1, Minor = 2 }

        [System.Serializable]
        public class Marker
        {
            public Transform target;
            public Tier tier = Tier.Minor;
            [HideInInspector] public VisualElement icon;
        }

        [SerializeField] Transform player;
        [Tooltip("흔들림을 더하기 전의 카메라 리그")] [SerializeField] Transform cameraRig;
        [SerializeField] Marker[] markers;
        [SerializeField] Orientation orientation = Orientation.Rotate;
        [SerializeField] float radius = 150f;
        [SerializeField] float metersAtZoom1 = 80f;
        [SerializeField, Range(0.5f, 3f)] float zoom = 1f;
        [SerializeField] bool edgeClamp = true;
        [SerializeField] float edgeMargin = 18f;
        [SerializeField, Range(40f, 120f)] float fovDeg = 70f;
        [Tooltip("지도 쪽 방위 추종 시간 상수(초). 카메라가 이미 스무딩되면 0, 아니면 0.12 권장")] [SerializeField] float yawTau = 0f;
        [SerializeField] float zoomTime = 0.25f;
        [SerializeField] Vector2 worldMin = new(-340f, -340f);
        [SerializeField] Vector2 worldMax = new(340f, 340f);

        VisualElement pivot, mapImage, cone, player_, iconsIn, edgePrimary, edgeWedge;
        Label north, edgeDist;
        Marker primary;
        float shownYaw, shownZoom, zoomFrom, zoomTo, zoomT = 1f, coneAngle;
        int lastMeters = -1;

        float BasePpm => radius / metersAtZoom1;

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            pivot = root.Q("map-pivot");
            mapImage = root.Q("map-image");
            cone = root.Q("view-cone");
            player_ = root.Q("player");
            iconsIn = root.Q("icons-in");
            edgePrimary = root.Q("edge-primary");
            edgeWedge = root.Q("edge-wedge");
            north = root.Q<Label>("north");
            edgeDist = root.Q<Label>("edge-dist");

            // 지도 크기와 '월드 원점 = 원 중심' 기준 위치 (지도 위쪽 = 북쪽 = worldMax.y)
            Vector2 size = (worldMax - worldMin) * BasePpm;
            mapImage.style.width = size.x;
            mapImage.style.height = size.y;
            mapImage.style.left = radius + worldMin.x * BasePpm;
            mapImage.style.top = radius - worldMax.y * BasePpm;

            // 아이콘은 회전하지 않는 icons-in 에 위계 순서(주변 → 위험 → 주요)로 만든다 → 뒤에 넣은 것이 위에 그려진다
            iconsIn.Clear();
            var sorted = new List<Marker>(markers);
            sorted.Sort((a, b) => b.tier.CompareTo(a.tier));
            foreach (var m in sorted)
            {
                var el = new VisualElement { pickingMode = PickingMode.Ignore };
                el.AddToClassList("icon");
                el.AddToClassList(m.tier switch { Tier.Primary => "icon--primary", Tier.Danger => "icon--danger", _ => "icon--minor" });
                if (m.tier == Tier.Primary)
                {
                    var core = new VisualElement { pickingMode = PickingMode.Ignore };
                    core.AddToClassList("icon__core");
                    el.Add(core);
                    primary ??= m;
                }
                iconsIn.Add(el);
                m.icon = el;
            }

            // 시야 원뿔: Painter2D 로 부채꼴 (시야각이 바뀌면 MarkDirtyRepaint)
            cone.generateVisualContent += DrawCone;

            shownYaw = cameraRig.eulerAngles.y;
            shownZoom = zoomFrom = zoomTo = zoom;
            orientation = (Orientation)PlayerPrefs.GetInt("minimap.orientation", (int)orientation);
        }

        void OnDisable()
        {
            if (cone != null) cone.generateVisualContent -= DrawCone;
        }

        void DrawCone(MeshGenerationContext ctx)
        {
            var p = ctx.painter2D;
            Vector2 c = new(radius, radius);
            float r = radius * 0.86f;
            p.fillColor = new Color(1f, 1f, 1f, 0.22f);
            p.BeginPath();
            p.MoveTo(c);
            // 위(-90°)를 중심으로 ±시야각/2 — UITK 각도도 시계 방향 +
            p.Arc(c, r, Angle.Degrees(-90f - fovDeg * 0.5f), Angle.Degrees(-90f + fovDeg * 0.5f), ArcDirection.Clockwise);
            p.ClosePath();
            p.Fill();
        }

        void LateUpdate()
        {
            float dt = Time.deltaTime;
            float camYaw = cameraRig.eulerAngles.y;
            shownYaw = yawTau <= 0f ? camYaw : Mathf.LerpAngle(shownYaw, camYaw, 1f - Mathf.Exp(-dt / yawTau));

            // 축척: UGUI 와 같은 250ms ease-out-cubic
            if (zoomT < 1f)
            {
                zoomT = Mathf.Min(1f, zoomT + dt / zoomTime);
                shownZoom = Mathf.Lerp(zoomFrom, zoomTo, 1f - Mathf.Pow(1f - zoomT, 3f));
            }

            float ppm = BasePpm * shownZoom;
            Vector2 p = new(player.position.x, player.position.z);

            // 지도: y-up 오프셋을 화면(y-down)으로 옮길 때 y 를 뒤집는다
            mapImage.style.translate = new Translate(-p.x * BasePpm, p.y * BasePpm);
            pivot.style.scale = new Scale(new Vector2(shownZoom, shownZoom));
            float mapRot = orientation == Orientation.Rotate ? shownYaw : 0f;
            pivot.style.rotate = new Rotate(Angle.Degrees(-mapRot));        // UITK 는 시계 + → 지도를 반시계로 돌리려면 -yaw
            Quaternion rot = Quaternion.Euler(0f, 0f, mapRot);               // y-up 계산은 UGUI 와 같은 식

            float arrow = orientation == Orientation.Rotate ? Mathf.DeltaAngle(shownYaw, camYaw) : camYaw;
            player_.style.rotate = new Rotate(Angle.Degrees(arrow));
            if (!Mathf.Approximately(arrow, coneAngle))
            {
                cone.style.rotate = new Rotate(Angle.Degrees(arrow));
                coneAngle = arrow;
            }

            Vector2 n = rot * (Vector2.up * (radius + 1f));
            north.style.translate = new Translate(n.x, -n.y);                // 위치만, 글자는 회전하지 않는다

            float edgeR = radius - edgeMargin;
            bool primaryClamped = false;
            foreach (var m in markers)
            {
                if (!m.target || m.icon == null) continue;
                Vector2 d = new(m.target.position.x - p.x, m.target.position.z - p.y);
                Vector2 off = rot * (d * ppm);
                float len = off.magnitude;
                // 가장자리 표시는 주요 목표만 (위험 경보 클램프는 UGUI 버전 참고)
                bool clamped = edgeClamp && m == primary && len > edgeR;
                m.icon.style.display = !clamped && len < radius + 24f ? DisplayStyle.Flex : DisplayStyle.None;
                m.icon.style.translate = new Translate(off.x, -off.y);

                if (clamped)
                {
                    primaryClamped = true;
                    Vector2 dir = off / len;
                    edgePrimary.style.translate = new Translate(dir.x * edgeR, -dir.y * edgeR);
                    // 쐐기: 위를 향한 스프라이트를 바깥 방향으로 (화면 각도 = 시계 +)
                    float deg = 90f - Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
                    edgeWedge.style.rotate = new Rotate(Angle.Degrees(deg));
                    edgeWedge.style.translate = new Translate(dir.x * 30f, -dir.y * 30f);
                    edgeDist.style.translate = new Translate(-dir.x * 58f, dir.y * 58f);
                    int meters = Mathf.RoundToInt(d.magnitude);
                    if (meters != lastMeters) { edgeDist.text = $"{meters} m"; lastMeters = meters; }
                }
            }
            edgePrimary.EnableInClassList("edge--on", primaryClamped);
        }

        public void SetOrientation(Orientation o)
        {
            orientation = o;
            PlayerPrefs.SetInt("minimap.orientation", (int)o);
        }

        public void SetZoom(float z)
        {
            zoomFrom = shownZoom;
            zoomTo = Mathf.Clamp(z, 0.5f, 3f);
            zoomT = 0f;
        }

        public void SetFov(float deg)
        {
            fovDeg = deg;
            cone.MarkDirtyRepaint();
        }
    }
}
