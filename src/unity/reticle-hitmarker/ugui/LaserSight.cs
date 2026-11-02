using UnityEngine;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 비교 모드: 세계 안 레이저 조준. 총구에서 조준 지점까지 LineRenderer 로 선을 긋고,
    /// 표면에 접촉점을 둔다. 적에 닿으면 접촉점 재질만 바꾼다.
    /// 이 컴포넌트를 켜면 화면 고정 조준점(ReticleCanvas)을 끄고, 끄면 다시 켠다.
    /// </summary>
    [RequireComponent(typeof(LineRenderer))]
    public class LaserSight : MonoBehaviour
    {
        [SerializeField] Camera cam;
        [SerializeField] Transform muzzle;
        [SerializeField] Transform contactDot;
        [SerializeField] Renderer contactRenderer;
        [SerializeField] Material dotNormal;
        [SerializeField] Material dotHostile;
        [SerializeField] LayerMask hitMask = ~0;
        [SerializeField] LayerMask enemyMask;
        [SerializeField] float maxDistance = 60f;
        [Tooltip("화면 고정 조준점이 들어 있는 하위 Canvas")]
        [SerializeField] GameObject reticleCanvas;

        LineRenderer line;
        bool wasHostile;

        void Awake()
        {
            line = GetComponent<LineRenderer>();
            line.positionCount = 2;
            line.useWorldSpace = true;
        }

        void OnEnable()
        {
            if (reticleCanvas != null) reticleCanvas.SetActive(false);
            contactDot.gameObject.SetActive(true);
        }

        void OnDisable()
        {
            if (reticleCanvas != null) reticleCanvas.SetActive(true);
            if (contactDot != null) contactDot.gameObject.SetActive(false);
        }

        void LateUpdate()
        {
            // 조준 지점은 화면 중앙 레이가 처음 닿는 표면
            Ray ray = cam.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            Vector3 end = ray.GetPoint(maxDistance);
            bool hostile = false;
            if (Physics.Raycast(ray, out RaycastHit hit, maxDistance, hitMask, QueryTriggerInteraction.Ignore))
            {
                end = hit.point;
                hostile = (enemyMask.value & (1 << hit.collider.gameObject.layer)) != 0;
                contactDot.SetPositionAndRotation(hit.point + hit.normal * 0.01f, Quaternion.LookRotation(-hit.normal));
            }
            else
            {
                contactDot.position = end;
            }

            line.SetPosition(0, muzzle.position);
            line.SetPosition(1, end);

            // 바뀔 때만 재질 교체 (매 프레임 material 인스턴스를 만들지 않는다)
            if (hostile != wasHostile)
            {
                contactRenderer.sharedMaterial = hostile ? dotHostile : dotNormal;
                wasHostile = hostile;
            }
        }
    }
}
