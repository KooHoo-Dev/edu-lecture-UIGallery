using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.HealthBarTrailSample
{
    /// <summary>
    /// 체력 바 + 잔상 + 회복 미리보기 + 저체력 테두리 — UI Toolkit 버전.
    /// UI Toolkit 에는 Filled 이미지 타입이 없으므로 막대 길이를 width 퍼센트로 바꾼다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class HealthBarTrailUITK : MonoBehaviour
    {
        [SerializeField] float maxHealth = 100f;
        [SerializeField] float trailDelay = 0.45f;
        [SerializeField] float maxHold = 1.2f;
        [SerializeField] float trailSpeed = 0.55f;
        [SerializeField] float healSpeed = 0.6f;
        [SerializeField, Range(0f, 1f)] float lowThreshold = 0.3f;
        [SerializeField] Color lowColor = new(0.95f, 0.25f, 0.25f);
        [SerializeField] Color highColor = new(0.31f, 0.86f, 0.43f);

        VisualElement fill, trail, healPreview, vignette;
        Label label;

        float health = 1f, shownFill = 1f, shownTrail = 1f, holdTimer, heldTime, beatPhase;

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            fill = root.Q("fill");
            trail = root.Q("trail");
            healPreview = root.Q("heal-preview");
            vignette = root.Q("vignette");
            label = root.Q<Label>("label");
        }

        public void TakeDamage(float amount)
        {
            float before = health;
            health = Mathf.Clamp01(health - amount / maxHealth);
            if (shownTrail <= shownFill + 0.0001f) heldTime = 0f;
            shownFill = health;
            shownTrail = Mathf.Max(shownTrail, before);
            holdTimer = Mathf.Min(trailDelay, Mathf.Max(0f, maxHold - heldTime));   // 연타 중 총 대기 상한
        }

        public void Heal(float amount)
        {
            health = Mathf.Clamp01(health + amount / maxHealth);
            shownTrail = Mathf.Min(shownTrail, shownFill);
        }

        void Update()
        {
            float dt = Time.deltaTime;

            if (shownFill < health)
                shownFill = Mathf.MoveTowards(shownFill, health, healSpeed * dt);

            if (holdTimer > 0f) { holdTimer -= dt; heldTime += dt; }
            else shownTrail = Mathf.MoveTowards(shownTrail, shownFill, trailSpeed * dt);

            float lowness = lowThreshold > 0f ? Mathf.Clamp01(1f - shownFill / lowThreshold) : 0f;
            beatPhase += dt * Mathf.Lerp(1f, 2f, lowness) * Mathf.PI * 2f;
            float pulse = 0.75f + 0.25f * Mathf.Sin(beatPhase);

            fill.style.width = Length.Percent(shownFill * 100f);
            trail.style.width = Length.Percent(shownTrail * 100f);
            healPreview.style.width = Length.Percent(health * 100f);
            fill.style.backgroundColor = Color.Lerp(lowColor, highColor, Mathf.InverseLerp(0.15f, 0.8f, shownFill));
            vignette.style.opacity = shownFill <= lowThreshold ? (0.35f + 0.65f * lowness) * pulse : 0f;
            label.text = $"{Mathf.RoundToInt(health * maxHealth)} / {maxHealth:0}";
        }
    }
}
