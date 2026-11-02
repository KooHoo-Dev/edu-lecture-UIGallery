using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.HealthBarTrailSample
{
    /// <summary>
    /// 체력 바 + 잔상(데미지 트레일) + 회복 미리보기 + 저체력 테두리 — UGUI 버전.
    /// Fill · HealPreview · Trail 세 Image 는 모두 Image Type = Filled, Fill Method = Horizontal.
    /// 그리는 순서(아래 → 위): Trail → HealPreview → Fill
    /// </summary>
    public class HealthBarTrail : MonoBehaviour
    {
        [Header("참조")]
        [SerializeField] Image fill;
        [SerializeField] Image trail;
        [SerializeField] Image healPreview;
        [SerializeField] TextMeshProUGUI label;
        [SerializeField] CanvasGroup vignette;   // 화면 전체 테두리 이미지 (Raycast Target 끔)

        [Header("값")]
        [SerializeField] float maxHealth = 100f;
        [SerializeField, Tooltip("잔상이 줄어들기 시작할 때까지 대기 (초)")] float trailDelay = 0.45f;
        [SerializeField, Tooltip("연타 중 잔상이 기다릴 수 있는 최대 시간 (초)")] float maxHold = 1.2f;
        [SerializeField, Tooltip("잔상 감소 속도 (최대 체력 대비 비율/초)")] float trailSpeed = 0.55f;
        [SerializeField, Tooltip("회복 채움 속도 (비율/초)")] float healSpeed = 0.6f;
        [SerializeField, Range(0f, 1f)] float lowThreshold = 0.3f;
        [SerializeField, Tooltip("체력 비율(0~1)에 따른 메인 바 색")] Gradient colorByHealth = new();

        float health = 1f;      // 실제 체력 (0~1)
        float shownFill = 1f;   // 화면의 메인 바
        float shownTrail = 1f;  // 화면의 잔상
        float holdTimer;
        float heldTime;     // 이번 잔상이 지금까지 기다린 시간
        float beatPhase;

        public void TakeDamage(float amount)
        {
            float before = health;
            health = Mathf.Clamp01(health - amount / maxHealth);
            if (shownTrail <= shownFill + 0.0001f) heldTime = 0f;   // 잔상이 다 따라잡았으면 새로 시작
            shownFill = health;                                     // 메인 바는 즉시
            shownTrail = Mathf.Max(shownTrail, before);             // 잔상은 맞기 전 위치에 남긴다
            // 연타하면 대기 시간을 다시 채우되, 총 대기는 maxHold 를 넘지 않는다
            holdTimer = Mathf.Min(trailDelay, Mathf.Max(0f, maxHold - heldTime));
        }

        public void Heal(float amount)
        {
            health = Mathf.Clamp01(health + amount / maxHealth);
            shownTrail = Mathf.Min(shownTrail, shownFill);
        }

        void Update()
        {
            float dt = Time.deltaTime;   // 일시정지(timeScale 0) 중에도 움직이려면 Time.unscaledDeltaTime

            // 회복: 메인 바가 미리보기 구간을 천천히 채운다
            if (shownFill < health)
                shownFill = Mathf.MoveTowards(shownFill, health, healSpeed * dt);

            // 잔상: 대기 → 메인 바를 따라 감소
            if (holdTimer > 0f) { holdTimer -= dt; heldTime += dt; }
            else shownTrail = Mathf.MoveTowards(shownTrail, shownFill, trailSpeed * dt);

            // 저체력 맥박: 체력이 낮을수록 1Hz → 2Hz 로 빨라진다
            float lowness = lowThreshold > 0f ? Mathf.Clamp01(1f - shownFill / lowThreshold) : 0f;
            beatPhase += dt * Mathf.Lerp(1f, 2f, lowness) * Mathf.PI * 2f;
            float pulse = 0.75f + 0.25f * Mathf.Sin(beatPhase);
            vignette.alpha = shownFill <= lowThreshold ? (0.35f + 0.65f * lowness) * pulse : 0f;

            Refresh();
        }

        void Refresh()
        {
            fill.fillAmount = shownFill;
            trail.fillAmount = shownTrail;
            healPreview.fillAmount = health;   // Fill 아래에 깔려 있어 늘어날 구간만 보인다
            fill.color = colorByHealth.Evaluate(shownFill);
            label.text = $"{Mathf.RoundToInt(health * maxHealth)} / {maxHealth:0}";
        }
    }
}
