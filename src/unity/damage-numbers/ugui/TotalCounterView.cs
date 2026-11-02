using TMPro;
using UnityEngine;

namespace UIGallery.DamageNumbers
{
    /// <summary>
    /// 누적 합계 — 같은 대상에 짧은 간격(0.45초)으로 들어온 피해를 묶어 두었다가,
    /// 마지막 히트 후 0.2초 조용하면 2타 이상일 때만 0.4초 카운트업(easeOutQuart) → 0.8초 유지 → 0.25초 페이드.
    /// 계층: TotalCounter (CanvasGroup · 이 스크립트) > Caption "합계" · Value · Hits (TMP)
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class TotalCounterView : MonoBehaviour
    {
        const float ChainGap = 0.45f, Wait = 0.2f, CountTime = 0.4f, Hold = 0.8f, Fade = 0.25f;

        [SerializeField] Camera cam;
        [SerializeField] RectTransform layer;
        [SerializeField] TextMeshProUGUI valueText;
        [SerializeField] TextMeshProUGUI hitsText;
        [SerializeField] DamageNumberFormat format = DamageNumberFormat.Grouped;
        [SerializeField, Tooltip("앵커 기준 표시 위치 (오른쪽 위)")] Vector2 offset = new(150f, 150f);
        [SerializeField] bool showTotal = true;

        enum Phase { Idle, Count, Hold, Fade }

        readonly char[] buffer = new char[24];
        readonly char[] hitsBuffer = new char[8];
        CanvasGroup group;
        RectTransform rt;

        // 모으는 중인 묶음
        Transform chainAnchor;
        int chainCount;
        long chainSum;
        float chainLast = -99f;

        // 보여 주는 중인 합계
        Phase phase;
        float t;
        long shownSum;

        void Awake()
        {
            group = GetComponent<CanvasGroup>();
            rt = (RectTransform)transform;
            group.alpha = 0f;
            group.blocksRaycasts = false;
        }

        public void AddHit(Transform anchor, long value)
        {
            if (chainCount > 0 && chainAnchor == anchor && Time.time - chainLast < ChainGap)
            {
                chainCount++;
                chainSum += value;
            }
            else
            {
                chainAnchor = anchor;
                chainCount = 1;
                chainSum = value;
            }
            chainLast = Time.time;
        }

        void Update()
        {
            float dt = Time.deltaTime;

            if (chainCount > 0 && Time.time - chainLast > Wait)
            {
                if (chainCount >= 2 && showTotal) Show();
                chainCount = 0;
            }

            switch (phase)
            {
                case Phase.Count:
                    t += dt;
                    float k = Mathf.Clamp01(t / CountTime);
                    WriteValue((long)(shownSum * (1f - Mathf.Pow(1f - k, 4f))));
                    if (k >= 1f) { phase = Phase.Hold; t = 0f; }
                    break;
                case Phase.Hold:
                    t += dt;
                    if (t >= Hold) { phase = Phase.Fade; t = 0f; }
                    break;
                case Phase.Fade:
                    t += dt;
                    group.alpha = 1f - Mathf.Clamp01(t / Fade);
                    if (t >= Fade) phase = Phase.Idle;
                    break;
            }
        }

        void Show()
        {
            Vector3 sp = cam.WorldToScreenPoint(chainAnchor.position);
            if (sp.z <= 0f) return;
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, sp, null, out Vector2 local))
                rt.anchoredPosition = local + offset;

            shownSum = chainSum;
            int n = DamageNumberText.Write(hitsBuffer, chainCount, DamageNumberFormat.Full, false, 0);
            hitsBuffer[n++] = '타';
            hitsText.SetCharArray(hitsBuffer, 0, n);
            WriteValue(0);
            group.alpha = 1f;
            phase = Phase.Count;
            t = 0f;
        }

        void WriteValue(long v)
        {
            int n = DamageNumberText.Write(buffer, v, format, false, 0);
            valueText.SetCharArray(buffer, 0, n);
        }
    }
}
