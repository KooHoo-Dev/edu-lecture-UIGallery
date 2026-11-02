using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.ReticleHitmarker
{
    public enum HitKind { Hit, Crit }

    /// <summary>
    /// 적중 표시(X) — 일반 적중 &lt; 약점 적중 &lt; 처치를 모양 · 크기 · 지속 시간으로 구분한다.
    /// 등장(튐) → 유지 → 사라짐. 새 적중이 오면 진행 중인 코루틴을 멈추고 처음부터 다시 시작한다.
    /// 시간은 unscaled — 일시정지 · 히트스톱 중에도 끝까지 사라진다.
    /// </summary>
    public class HitmarkerView : MonoBehaviour
    {
        [Header("X 선 4개 (pivot (0, 0.5), Z 회전 45 · 135 · 225 · 315)")]
        [SerializeField] RectTransform lines;
        [SerializeField] CanvasGroup linesGroup;
        [SerializeField] Image[] lineImages;
        [SerializeField] float gap = 16f;

        [Header("처치 원")]
        [SerializeField] Image killRing;

        [Header("모양")]
        [SerializeField] bool critShapeDistinct = true;
        [SerializeField] Vector2 hitLineSize = new(24f, 5f);
        [SerializeField] Vector2 critLineSize = new(38f, 9f);
        [SerializeField] Color hitColor = Color.white;
        [SerializeField] Color critColor = new(1f, 0.824f, 0.247f);

        [Header("시간 (ms)")]
        [SerializeField] float holdMs = 120f;

        Coroutine lineRoutine;
        Coroutine ringRoutine;

        void Awake()
        {
            // 각 선을 회전 방향으로 gap 만큼 밀어 중심을 비운다
            foreach (var img in lineImages)
            {
                var rt = img.rectTransform;
                float a = rt.localEulerAngles.z * Mathf.Deg2Rad;
                rt.anchoredPosition = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * gap;
            }
            linesGroup.alpha = 0f;
            killRing.color = new Color(1f, 1f, 1f, 0f);
        }

        public void Play(HitKind kind, bool kill)
        {
            bool crit = kind == HitKind.Crit;
            Vector2 size = crit && critShapeDistinct ? critLineSize : hitLineSize;
            Color color = crit ? critColor : hitColor;
            foreach (var img in lineImages)
            {
                img.rectTransform.sizeDelta = size;
                img.color = color;
            }

            // 위계: 튐 크기 · 유지 시간 · 사라짐 시간을 단계적으로 키운다
            float from = crit ? 1.5f : 1.3f;
            float pop = crit ? 0.06f : 0.04f;
            float hold = holdMs / 1000f * (kill ? 1.8f : crit ? 1.4f : 1f);
            float fade = crit || kill ? 0.16f : 0.12f;

            if (lineRoutine != null) StopCoroutine(lineRoutine);
            lineRoutine = StartCoroutine(PlayLines(from, pop, hold, fade));

            if (kill)
            {
                if (ringRoutine != null) StopCoroutine(ringRoutine);
                ringRoutine = StartCoroutine(PlayRing(crit ? critColor : hitColor));
            }
        }

        IEnumerator PlayLines(float from, float pop, float hold, float fade)
        {
            linesGroup.alpha = 1f;
            for (float t = 0f; t < pop; t += Time.unscaledDeltaTime)
            {
                lines.localScale = Vector3.one * Mathf.LerpUnclamped(from, 1f, EaseOutBack(t / pop));
                yield return null;
            }
            lines.localScale = Vector3.one;

            yield return new WaitForSecondsRealtime(hold);

            for (float t = 0f; t < fade; t += Time.unscaledDeltaTime)
            {
                float k = t / fade;
                linesGroup.alpha = 1f - k * k; // easeInQuad
                yield return null;
            }
            linesGroup.alpha = 0f;
            lineRoutine = null;
        }

        // 처치 원: 0.32초 동안 반지름 1배 → 2배로 퍼지며 사라진다
        IEnumerator PlayRing(Color color)
        {
            const float duration = 0.32f;
            var rt = killRing.rectTransform;
            for (float t = 0f; t < duration; t += Time.unscaledDeltaTime)
            {
                float k = EaseOutCubic(t / duration);
                rt.localScale = Vector3.one * (1f + k);
                killRing.color = new Color(color.r, color.g, color.b, 1f - k);
                yield return null;
            }
            killRing.color = new Color(color.r, color.g, color.b, 0f);
            ringRoutine = null;
        }

        static float EaseOutBack(float t)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
        }

        static float EaseOutCubic(float t) => 1f - Mathf.Pow(1f - t, 3f);
    }
}
