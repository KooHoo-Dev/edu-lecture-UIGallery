using UnityEngine;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 무기의 '현재 퍼짐' 값을 소유한다 (단위: 1920×1080 기준 화면 px).
    /// 탄 발사 방향(Fire / ShotRay)과 조준점 팔 간격(ReticleView)이 모두 이 값 하나를 쓴다.
    /// UI 는 이 값을 읽기만 한다 — 표시와 실제 탄착이 어긋나지 않게.
    /// </summary>
    public class WeaponSpread : MonoBehaviour
    {
        [Header("퍼짐 (px, 1080p 기준)")]
        [SerializeField] float baseSpread = 16f;
        [SerializeField] float moveSpreadScale = 1.6f;
        [SerializeField] float shotBloom = 8f;

        [Header("시간 (ms)")]
        [SerializeField] float recoveryMs = 260f;
        [SerializeField] float moveBlendMs = 150f;

        float moveBlend;

        /// <summary>지금 탄이 떨어지는 원의 반지름 (px)</summary>
        public float CurrentSpread { get; private set; }

        /// <summary>연사 상한 = 기본 퍼짐의 4배</summary>
        public float MaxSpread => baseSpread * 4f;

        /// <summary>이동 입력 중인가 (입력 코드에서 설정)</summary>
        public bool IsMoving { get; set; }

        void Awake()
        {
            CurrentSpread = baseSpread;
        }

        void Update()
        {
            float dt = Time.deltaTime;

            // 이동 퍼짐은 150ms 동안 섞어서 전환 (즉시 튀면 조준점이 덜컥거린다)
            moveBlend = Mathf.MoveTowards(moveBlend, IsMoving ? 1f : 0f, dt / (moveBlendMs / 1000f));
            float target = baseSpread * Mathf.Lerp(1f, moveSpreadScale, moveBlend);

            // 사격으로 벌어진 퍼짐은 회복 시간 동안 지수 감쇠 (약 95% 회복 = recoveryMs)
            float lambda = 3f / Mathf.Max(0.05f, recoveryMs / 1000f);
            CurrentSpread = Mathf.Lerp(CurrentSpread, target, 1f - Mathf.Exp(-lambda * dt));
        }

        /// <summary>
        /// 한 발 쏜다. 지금 퍼짐 원 안의 화면 오프셋(px)을 돌려주고 퍼짐을 키운다.
        /// </summary>
        public Vector2 Fire()
        {
            Vector2 offset = Random.insideUnitCircle * CurrentSpread;
            CurrentSpread = Mathf.Min(MaxSpread, CurrentSpread + shotBloom);
            return offset;
        }

        /// <summary>
        /// 화면 중앙 + 오프셋(px, 1080 기준) 방향의 레이. Canvas Scaler 의 Match 가 Height(1) 일 때 정확하다.
        /// </summary>
        public Ray ShotRay(Camera cam, Vector2 offsetPx)
        {
            float scale = Screen.height / 1080f;
            Vector2 center = new(Screen.width * 0.5f, Screen.height * 0.5f);
            return cam.ScreenPointToRay(center + offsetPx * scale);
        }
    }
}
