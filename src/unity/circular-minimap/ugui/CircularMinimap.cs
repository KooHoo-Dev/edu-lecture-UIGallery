using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.CircularMinimapSample
{
    /// <summary>
    /// 원형 미니맵 — UGUI 버전.
    /// 회전형(지도가 돎) / 북쪽 고정(화살표가 돎)을 한 변환 함수로 처리하고,
    /// 범위 밖 주요 목표는 마스크 바깥 EdgeMarkers 레이어에서 테두리 안쪽에 고정한다.
    /// 하이어라키: MinimapRoot ─ MaskCircle(Mask) ─ MapPivot ─ MapImage / ViewCone / InRangeIcons,
    ///            Ring · PlayerArrow · EdgeMarkers(마스크 바깥) · North
    /// 좌표 약속: 월드 yaw 는 위에서 볼 때 시계 방향 +, UI 의 Z 회전은 화면 반시계 + (그래서 회전형 지도 = +yaw).
    /// </summary>
    public class CircularMinimap : MonoBehaviour
    {
        public enum Orientation { Rotate, NorthUp }
        /// <summary>위계 — 숫자가 작을수록 중요(크게, 맨 위에 그림)</summary>
        public enum Tier { Primary = 0, Danger = 1, Minor = 2 }

        [System.Serializable]
        public class Marker
        {
            public Transform target;
            public Tier tier = Tier.Minor;
            [Tooltip("InRangeIcons 아래의 아이콘 (회전하지 않는 레이어)")] public RectTransform icon;
            [Tooltip("EdgeMarkers 아래의 가장자리 표시 (주요 목표·위험만, 없으면 비워 둔다)")] public RectTransform edgeIcon;
            [Tooltip("edgeIcon 의 자식 — 위를 향한 쐐기 스프라이트")] public RectTransform edgeWedge;
            [HideInInspector] public float alert;       // 위험: 경보 남은 시간(초) — 이 동안만 가장자리에 붙인다
            [HideInInspector] public bool wasClamped;
            [HideInInspector] public bool wasVisible = true;
        }

        [Header("참조 — 인스펙터에서 직접 연결 (Find 검색 금지)")]
        [SerializeField] Transform player;
        [Tooltip("yaw 를 읽을 카메라 리그. 흔들림(쉐이크)을 더하기 전 Transform 을 연결한다")]
        [SerializeField] Transform cameraRig;
        [SerializeField] RectTransform mapPivot;
        [SerializeField] RectTransform mapImage;
        [SerializeField] RectTransform viewCone;      // Image · Filled · Radial 360 · Origin Top · Clockwise
        [SerializeField] Image viewConeImage;
        [SerializeField] RectTransform playerArrow;
        [SerializeField] RectTransform north;         // TextMeshProUGUI "N"
        [SerializeField] RectTransform distanceRect;  // 주요 목표 가장자리 표시의 거리 글자
        [SerializeField] TextMeshProUGUI distanceLabel;
        [SerializeField] RectTransform pingWave;      // 코랄 링 이미지 (InRangeIcons 아래)
        [SerializeField] CanvasGroup pingWaveGroup;
        [SerializeField] Marker[] markers;

        [Header("월드 범위 (지도 텍스처가 덮는 영역, m)")]
        [SerializeField] Vector2 worldMin = new(-340f, -340f);
        [SerializeField] Vector2 worldMax = new(340f, 340f);

        [Header("값")]
        [SerializeField] Orientation orientation = Orientation.Rotate;
        [SerializeField] float radius = 150f;                       // 미니맵 반지름 (캔버스 단위)
        [SerializeField, Tooltip("축척 1× 일 때 반지름이 담는 거리(m)")] float metersAtZoom1 = 80f;
        [SerializeField, Range(0.5f, 3f)] float zoom = 1f;
        [SerializeField] bool edgeClamp = true;
        [SerializeField, Tooltip("범위 밖 아이콘을 테두리에서 얼마나 안쪽에 둘지")] float edgeMargin = 18f;
        [SerializeField, Range(40f, 120f)] float fovDeg = 70f;
        [SerializeField, Tooltip("지도 쪽 방위 추종 시간 상수(초). 카메라 리그가 이미 스무딩된다면 0 — 두 번 거르면 지도가 화면보다 늦다. 카메라가 스무딩되지 않는 게임일 때만 0.12 권장")]
        float yawTau = 0f;
        [SerializeField] float zoomTime = 0.25f;

        static readonly float[] ZoomSteps = { 0.7f, 1.2f, 2.5f };
        const string PrefKey = "minimap.orientation";

        float shownYaw, shownZoom, zoomFrom, zoomTo, zoomT = 1f;
        int lastMeters = -1;
        Marker primary;
        Coroutine pingRoutine;

        float BasePpm => radius / metersAtZoom1;   // 축척 1× 의 px/m

        void Awake()
        {
            orientation = (Orientation)PlayerPrefs.GetInt(PrefKey, (int)orientation);
            shownZoom = zoomFrom = zoomTo = zoom;
            shownYaw = cameraRig.eulerAngles.y;

            // 지도 이미지: 월드 원점이 피벗이 되게 크기·피벗을 맞춘다 → anchoredPosition = -플레이어 × ppm 한 줄로 이동
            Vector2 size = worldMax - worldMin;
            mapImage.sizeDelta = size * BasePpm;
            mapImage.pivot = new Vector2(-worldMin.x / size.x, -worldMin.y / size.y);

            // 그리기 순서 = 위계: 주변 정보(아래) → 위험 → 주요 목표(맨 위). 뒤 형제일수록 위에 그려진다
            foreach (Tier t in new[] { Tier.Minor, Tier.Danger, Tier.Primary })
                foreach (var m in markers)
                    if (m.tier == t && m.icon) m.icon.SetAsLastSibling();

            foreach (var m in markers)
            {
                if (m.tier == Tier.Primary && primary == null) primary = m;
                if (m.edgeIcon) m.edgeIcon.gameObject.SetActive(false);
            }
            if (viewConeImage) viewConeImage.fillAmount = fovDeg / 360f;
            if (pingWaveGroup) pingWaveGroup.alpha = 0f;
        }

        // 카메라·플레이어가 움직인 뒤에 계산해야 1프레임 늦은 떨림이 없다
        void LateUpdate()
        {
            float dt = Time.deltaTime;
            float camYaw = cameraRig.eulerAngles.y;

            // 방위: yawTau = 0 이면 카메라 값을 그대로(이미 스무딩된 카메라), 아니면 지수 스무딩 + 최단 경로 (359° → 1° 에서 한 바퀴 돌지 않게 LerpAngle)
            shownYaw = yawTau <= 0f ? camYaw : Mathf.LerpAngle(shownYaw, camYaw, 1f - Mathf.Exp(-dt / yawTau));

            // 축척: ease-out-cubic
            if (zoomT < 1f)
            {
                zoomT = Mathf.Min(1f, zoomT + dt / zoomTime);
                float e = 1f - Mathf.Pow(1f - zoomT, 3f);
                shownZoom = Mathf.Lerp(zoomFrom, zoomTo, e);
            }

            float ppm = BasePpm * shownZoom;
            Vector2 p = new(player.position.x, player.position.z);

            // 지도 이동·축척·회전
            mapImage.anchoredPosition = -p * BasePpm;
            mapPivot.localScale = Vector3.one * shownZoom;
            float mapRot = orientation == Orientation.Rotate ? shownYaw : 0f;
            mapPivot.localEulerAngles = new Vector3(0f, 0f, mapRot);
            Quaternion rot = Quaternion.Euler(0f, 0f, mapRot);

            // 화살표·시야 원뿔: 게임 화면을 그린 카메라 방위와 같은 값으로
            float arrowZ = orientation == Orientation.Rotate ? -Mathf.DeltaAngle(shownYaw, camYaw) : -camYaw;
            playerArrow.localEulerAngles = new Vector3(0f, 0f, arrowZ);
            if (viewCone) viewCone.localEulerAngles = new Vector3(0f, 0f, arrowZ + fovDeg * 0.5f);   // Radial 360 은 Top 에서 시계로 채워지므로 절반만큼 되돌린다

            // N: 테두리를 따라 위치만 움직이고 글자는 바로 세운다
            north.anchoredPosition = rot * (Vector2.up * (radius + 1f));
            north.localRotation = Quaternion.identity;

            float edgeR = radius - edgeMargin;
            foreach (var m in markers)
            {
                if (!m.target || !m.icon) continue;
                m.alert = Mathf.Max(0f, m.alert - dt);
                Vector2 d = new(m.target.position.x - p.x, m.target.position.z - p.y);
                Vector2 off = rot * (d * ppm);          // 아이콘은 회전하지 않는 레이어 — 위치만 돌린다
                float len = off.magnitude;
                bool clampable = edgeClamp && m.edgeIcon && (m.tier == Tier.Primary || (m.tier == Tier.Danger && m.alert > 0f));
                bool clamped = clampable && len > edgeR;
                bool visible = !clamped && len < radius + 24f;

                if (visible != m.wasVisible) { m.icon.gameObject.SetActive(visible); m.wasVisible = visible; }
                if (visible) m.icon.anchoredPosition = off;

                if (m.edgeIcon)
                {
                    if (clamped != m.wasClamped) { m.edgeIcon.gameObject.SetActive(clamped); m.wasClamped = clamped; }
                    if (clamped)
                    {
                        Vector2 dir = off / len;
                        m.edgeIcon.anchoredPosition = dir * edgeR;
                        // 쐐기 스프라이트는 위를 향하게 그려 두고(Pivot 기본값 0.5, 0.5), 아이콘 바깥쪽으로 옮긴 뒤 바깥 방향으로 돌린다
                        if (m.edgeWedge)
                        {
                            m.edgeWedge.anchoredPosition = dir * 30f;
                            m.edgeWedge.localEulerAngles = new Vector3(0f, 0f, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f);
                        }
                        if (m == primary && distanceRect)
                        {
                            distanceRect.anchoredPosition = dir * (edgeR - 58f);   // 원 중심 쪽 — 테두리 밖으로 삐져나가지 않게
                            int meters = Mathf.RoundToInt(d.magnitude);
                            if (meters != lastMeters) { distanceLabel.text = $"{meters} m"; lastMeters = meters; }   // 정수가 바뀔 때만 → GC 최소
                        }
                    }
                }
            }
            if (distanceRect) distanceRect.gameObject.SetActive(primary != null && primary.wasClamped);
        }

        /* ───── 공개 API (설정 메뉴·입력·게임 로직에서 호출) ───── */

        public void SetOrientation(Orientation o)
        {
            orientation = o;
            PlayerPrefs.SetInt(PrefKey, (int)o);   // 설정은 저장해 다음 실행에도 유지
        }

        public void ToggleOrientation() => SetOrientation(orientation == Orientation.Rotate ? Orientation.NorthUp : Orientation.Rotate);

        public void SetZoom(float z)
        {
            zoomFrom = shownZoom;
            zoomTo = Mathf.Clamp(z, 0.5f, 3f);
            zoomT = 0f;
        }

        /// <summary>0.7 → 1.2 → 2.5 → 0.7 … 순환. 단계에 없는 값(예: 1.0)이면 가장 먼 단계로 가서 첫 입력부터 확실히 바뀐다</summary>
        public void StepZoom()
        {
            for (int i = 0; i < ZoomSteps.Length; i++)
                if (Mathf.Abs(ZoomSteps[i] - zoomTo) < 0.05f) { SetZoom(ZoomSteps[(i + 1) % ZoomSteps.Length]); return; }
            float far = ZoomSteps[0];
            foreach (float s in ZoomSteps)
                if (Mathf.Abs(s - zoomTo) > Mathf.Abs(far - zoomTo)) far = s;
            SetZoom(far);
        }

        public void AddZoom(float delta) => SetZoom(zoomTo + delta);

        /// <summary>주요 목표 바꾸기</summary>
        public void SetPrimaryTarget(Transform target)
        {
            if (primary != null) { primary.target = target; lastMeters = -1; }
        }

        /// <summary>위험 감지: 5초 경보(이 동안 범위 밖이면 가장자리에 붙음) + 파동 한 번</summary>
        public void Ping(Transform danger)
        {
            foreach (var m in markers)
            {
                if (m.target != danger) continue;
                m.alert = 5f;
                if (pingWave && m.icon)
                {
                    if (pingRoutine != null) StopCoroutine(pingRoutine);
                    pingRoutine = StartCoroutine(PingWave(m));
                }
            }
        }

        IEnumerator PingWave(Marker m)
        {
            // 한 번만 재생: 크기 0.4 → 1.6, 투명도 1 → 0, 0.6초 ease-out-quad
            for (float t = 0f; t < 0.6f; t += Time.deltaTime)
            {
                float u = t / 0.6f;
                float e = 1f - (1f - u) * (1f - u);
                pingWave.anchoredPosition = m.wasClamped ? m.edgeIcon.anchoredPosition : m.icon.anchoredPosition;
                pingWave.localScale = Vector3.one * Mathf.Lerp(0.4f, 1.6f, e);
                pingWaveGroup.alpha = 1f - u;
                yield return null;
            }
            pingWaveGroup.alpha = 0f;
        }
    }
}
