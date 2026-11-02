using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DamageNumbers
{
    /// <summary>
    /// 풀에서 재사용하는 숫자 하나 — DamageNumber.prefab 의 루트에 붙인다.
    /// 프리팹: 앵커 (0.5, 0.5) 한 점 · 피벗 (0.5, 0) · CanvasGroup.  자식 Badge(Image) > BadgeText(TMP), Label(TMP).
    /// 팝(0~popDuration) → 상승(easeOutCubic / 회복은 easeOutSine) → 마지막 0.25초 페이드 → onFinished 를 한 번만 호출.
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class DamageNumberView : MonoBehaviour
    {
        const float Fade = 0.25f;

        [SerializeField] TextMeshProUGUI label;
        [SerializeField] Image badge;
        [SerializeField] TextMeshProUGUI badgeText;
        [SerializeField, Tooltip("배지 한 줄 높이 (밀어 올림 간격 계산용)")] float badgeHeight = 36f;

        public Transform Anchor { get; private set; }
        public DamageCategory Category { get; private set; }
        /// <summary>마지막으로 생성·병합된 시각 (병합 판정용)</summary>
        public float LastUpdate { get; private set; }
        public bool Fading => age > life - Fade;

        readonly char[] buffer = new char[24];
        RectTransform rt;
        CanvasGroup group;
        Material defaultMat;  // 프리팹 원래 머티리얼 — 외곽선 머티리얼이 없는 범주는 이것으로 되돌린다
        DamageCategoryStyle style;
        DamageNumberSettings settings;
        Action<DamageNumberView> onFinished;

        Vector2 basePos;      // 앵커의 로컬 좌표 + 시작 오프셋
        Vector2 riseDir;      // 떠오르는 방향 (위 = (0, 1))
        float push, pushShown; // 밀어 올림 목표 · 현재
        float age, life, popT;
        long value;
        int hits;
        bool finished;

        void Awake()
        {
            rt = (RectTransform)transform;
            group = GetComponent<CanvasGroup>();
            group.interactable = false;
            group.blocksRaycasts = false;
            defaultMat = label.fontSharedMaterial;
        }

        /// <summary>이 범주 숫자가 차지할 높이 — 같은 앵커의 이전 숫자를 이만큼 밀어 올린다</summary>
        public static float HeightOf(DamageCategoryStyle s, DamageNumberSettings set, float badgeH)
        {
            float scale = s.category == DamageCategory.Crit ? set.critScale : s.fontScale;
            bool hasBadge = set.shapeCue && !string.IsNullOrEmpty(s.badgeText);
            return set.baseFontSize * scale * 1.05f + (hasBadge ? badgeH : 0f) + 6f;
        }
        public float BadgeHeight => badgeHeight;

        public void Play(Transform anchor, Vector2 localPos, Vector2 offset, Vector2 dir, long amount,
                         DamageCategoryStyle s, DamageNumberSettings set, Action<DamageNumberView> finished)
        {
            Anchor = anchor;
            Category = s.category;
            style = s;
            settings = set;
            onFinished = finished;
            basePos = localPos + offset;
            riseDir = dir;
            push = pushShown = 0f;
            age = 0f;
            popT = 0f;
            life = set.lifetime * s.lifeScale;
            value = amount;
            hits = 1;
            finished = false;
            LastUpdate = set.Now;

            // 범주 스타일 적용 (풀에서 꺼낼 때마다 전부 다시 덮어쓴다 — 이전 범주가 남지 않게)
            float scale = s.category == DamageCategory.Crit ? set.critScale : s.fontScale;
            label.fontSize = set.baseFontSize * scale;
            label.color = s.color;
            // null 인 범주(일반 등)도 반드시 덮어쓴다 — 안 그러면 직전 치명타의 두꺼운 외곽선이 남는다
            label.fontSharedMaterial = s.outlineMaterial != null ? s.outlineMaterial : defaultMat;
            bool showBadge = set.shapeCue && !string.IsNullOrEmpty(s.badgeText);
            badge.gameObject.SetActive(showBadge);
            if (showBadge)
            {
                badge.color = s.color;
                badgeText.SetText(s.badgeText);
            }
            rt.localRotation = Quaternion.Euler(0f, 0f, set.shapeCue ? s.tiltDeg : 0f);
            WriteText();
            Apply();
        }

        /// <summary>병합: 같은 앵커 · 같은 범주가 짧은 간격으로 들어오면 숫자 하나를 키운다</summary>
        public void AddValue(long amount)
        {
            value += amount;
            hits++;
            popT = 0f;                       // 다시 튄다
            age = Mathf.Min(age, life * 0.25f); // 수명 연장
            LastUpdate = settings.Now;
            WriteText();
        }

        /// <summary>새 숫자가 아래에 생기면 그 높이만큼 위로 비켜 준다</summary>
        public void PushUp(float height) => push += height;

        void WriteText()
        {
            bool plus = settings.shapeCue && style.plusPrefix;
            int n = DamageNumberText.Write(buffer, value, settings.format, plus, hits);
            label.SetCharArray(buffer, 0, n); // 문자열 할당 없음
        }

        void Update()
        {
            if (finished) return;
            // 히트스톱(Time.timeScale = 0) 중에도 숫자를 움직이려면 unscaledDeltaTime
            float dt = settings.useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            age += dt;
            popT += dt;
            pushShown = Mathf.Lerp(pushShown, push, 1f - Mathf.Exp(-22f * dt)); // 지수 감쇠로 부드럽게
            Apply();
            if (age >= life)
            {
                finished = true;
                onFinished?.Invoke(this); // 풀 반환은 여기서 단 한 번
            }
        }

        void Apply()
        {
            float k = Mathf.Clamp01(age / life);
            float eased = style.softRise ? Mathf.Sin(k * Mathf.PI * 0.5f) : 1f - Mathf.Pow(1f - k, 3f);
            float rise = settings.floatDistance * eased;
            rt.anchoredPosition = basePos + riseDir * rise + new Vector2(0f, pushShown);

            float s = style.pop.Evaluate(Mathf.Clamp01(popT / Mathf.Max(0.01f, style.popDuration)));
            rt.localScale = new Vector3(s, s, 1f);

            float fadeStart = life - Fade;
            float f = age > fadeStart ? Mathf.Clamp01((age - fadeStart) / Fade) : 0f;
            group.alpha = 1f - f * f; // easeInQuad
        }
    }
}
