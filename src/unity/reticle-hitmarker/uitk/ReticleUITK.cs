using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 조준점 + 적중 표시 — UI Toolkit 버전 (UGUI 버전과 같은 수치).
    /// - 퍼짐 값 하나(CurrentSpread)를 소유하고, Fire() 가 그 원 안에서 탄 방향을 뽑는다.
    /// - 팔은 style.translate 로만 움직인다 (left/top 을 바꾸면 레이아웃을 다시 계산한다).
    /// - 적 조준 색은 클래스(reticle--hostile) + USS transition 0.06초.
    /// - 적중 표시의 튐 · 유지 · 사라짐은 USS transition 대신 C# 에서 시간으로 계산한다 (단계가 있는 연출이라).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class ReticleUITK : MonoBehaviour
    {
        [Header("퍼짐 (px, 1080p 기준)")]
        [SerializeField] float baseSpread = 16f;
        [SerializeField] float moveSpreadScale = 1.6f;
        [SerializeField] float shotBloom = 8f;
        [SerializeField] float recoveryMs = 260f;
        [SerializeField] float moveBlendMs = 150f;

        [Header("적중 표시")]
        [SerializeField] float holdMs = 120f;
        [SerializeField] bool critShapeDistinct = true;

        const float ArmLength = 34f;

        VisualElement reticle, armTop, armBottom, armLeft, armRight, hitmarker, hmLines, killRing;

        float moveBlend;
        // 적중 표시 재생 상태 (age 가 0 으로 돌아가면 처음부터 다시)
        float hmAge = 99f, hmFrom, hmPop, hmHold, hmFade;
        float ringAge = 99f;

        public float CurrentSpread { get; private set; }
        public float MaxSpread => baseSpread * 4f;
        public bool IsMoving { get; set; }

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            reticle = root.Q("reticle");
            armTop = root.Q("arm-top");
            armBottom = root.Q("arm-bottom");
            armLeft = root.Q("arm-left");
            armRight = root.Q("arm-right");
            hitmarker = root.Q("hitmarker");
            hmLines = root.Q("hm-lines");
            killRing = root.Q("kill-ring");

            // 매 프레임 transform 만 바뀌는 요소 → 렌더러에 미리 알려 준다
            foreach (var e in new[] { armTop, armBottom, armLeft, armRight, hmLines, killRing })
                e.usageHints = UsageHints.DynamicTransform;

            CurrentSpread = baseSpread;
        }

        public void SetHostile(bool on) => reticle.EnableInClassList("reticle--hostile", on);

        /// <summary>한 발 쏜다 — 지금 퍼짐 원 안의 화면 오프셋(px)을 돌려주고 퍼짐을 키운다</summary>
        public Vector2 Fire()
        {
            Vector2 offset = Random.insideUnitCircle * CurrentSpread;
            CurrentSpread = Mathf.Min(MaxSpread, CurrentSpread + shotBloom);
            return offset;
        }

        /// <summary>적중 표시 재생. crit = 약점, kill = 처치(원 추가)</summary>
        public void PlayHit(bool crit, bool kill)
        {
            hitmarker.EnableInClassList("hm--crit", crit && critShapeDistinct);
            hitmarker.EnableInClassList("hm--crit-flat", crit && !critShapeDistinct);

            hmFrom = crit ? 1.5f : 1.3f;
            hmPop = crit ? 0.06f : 0.04f;
            hmHold = holdMs / 1000f * (kill ? 1.8f : crit ? 1.4f : 1f);
            hmFade = crit || kill ? 0.16f : 0.12f;
            hmAge = 0f;
            if (kill) ringAge = 0f;
        }

        void Update()
        {
            float dt = Time.deltaTime;

            // ── 퍼짐 ──
            moveBlend = Mathf.MoveTowards(moveBlend, IsMoving ? 1f : 0f, dt / (moveBlendMs / 1000f));
            float target = baseSpread * Mathf.Lerp(1f, moveSpreadScale, moveBlend);
            float lambda = 3f / Mathf.Max(0.05f, recoveryMs / 1000f);
            CurrentSpread = Mathf.Lerp(CurrentSpread, target, 1f - Mathf.Exp(-lambda * dt));

            float s = CurrentSpread;
            armTop.style.translate = new Translate(0f, -(s + ArmLength));
            armBottom.style.translate = new Translate(0f, s);
            armLeft.style.translate = new Translate(-(s + ArmLength), 0f);
            armRight.style.translate = new Translate(s, 0f);

            // ── 적중 표시: 등장(튐) → 유지 → 사라짐 (일시정지 중에도 끝까지 사라지게 unscaled) ──
            float udt = Time.unscaledDeltaTime;
            hmAge += udt;
            float scale = 1f, alpha = 0f;
            if (hmAge < hmPop)
            {
                scale = Mathf.LerpUnclamped(hmFrom, 1f, EaseOutBack(hmAge / hmPop));
                alpha = 1f;
            }
            else if (hmAge < hmPop + hmHold) alpha = 1f;
            else
            {
                float k = Mathf.Clamp01((hmAge - hmPop - hmHold) / Mathf.Max(0.001f, hmFade));
                alpha = 1f - k * k;
            }
            hmLines.style.scale = new Scale(new Vector2(scale, scale));
            hmLines.style.opacity = alpha;

            // ── 처치 원: 0.32초 동안 1 → 2배, 1 → 0 ──
            ringAge += udt;
            float r = Mathf.Clamp01(ringAge / 0.32f);
            float e = 1f - Mathf.Pow(1f - r, 3f);
            killRing.style.scale = new Scale(new Vector2(1f + e, 1f + e));
            killRing.style.opacity = ringAge < 0.32f ? 1f - e : 0f;
        }

        static float EaseOutBack(float t)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
        }
    }
}
