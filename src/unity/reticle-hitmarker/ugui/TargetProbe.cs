using UnityEngine;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 화면 중앙 레이캐스트로 '지금 적을 겨누고 있는가'를 판정해 조준점 색을 바꾼다.
    /// 벽 뒤의 적까지 빨갛게 되지 않도록, 모든 충돌 레이어로 쏜 뒤 처음 맞은 것이 적인지 본다.
    /// </summary>
    public class TargetProbe : MonoBehaviour
    {
        [SerializeField] Camera cam;
        [SerializeField] ReticleView reticle;
        [Tooltip("벽 + 적 (레이를 막는 모든 것)")]
        [SerializeField] LayerMask hitMask = ~0;
        [SerializeField] LayerMask enemyMask;
        [SerializeField] float maxDistance = 100f;

        public bool IsHostile { get; private set; }

        void Update()
        {
            Ray ray = cam.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            IsHostile = Physics.Raycast(ray, out RaycastHit hit, maxDistance, hitMask, QueryTriggerInteraction.Ignore)
                        && (enemyMask.value & (1 << hit.collider.gameObject.layer)) != 0;
            reticle.SetHostile(IsHostile);
        }
    }
}
