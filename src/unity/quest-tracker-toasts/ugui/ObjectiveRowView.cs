using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 목표 행 1줄 (ObjectiveRow 프리팹). 진행이 바뀌면 '이 행만' 짧게 알린다:
    ///   숫자 교체 → 진행 바 fillAmount 보간(0.4초, ease-out) → 배경 하이라이트 페이드(0.6초)
    /// 완료되면 체크를 채우고 행을 흐리게(alpha 0.55) 한다 — 색만이 아니라 체크 모양 + 흐림으로도 구분.
    /// </summary>
    public class ObjectiveRowView : MonoBehaviour
    {
        [SerializeField] CanvasGroup rowGroup;
        [SerializeField] Image highlight;              // 행 배경 (평소 alpha 0)
        [SerializeField] Image check;
        [SerializeField] Sprite checkOff, checkOn;
        [SerializeField] TextMeshProUGUI label;
        [SerializeField] TextMeshProUGUI count;
        [SerializeField] Image progressFill;           // Image Type = Filled, Horizontal (흰 단색 스프라이트)
        [SerializeField] GameObject progressBar;       // max == 1 인 목표는 바를 숨긴다
        [SerializeField] Color highlightColor = new(1f, 0.75f, 0.35f, 0.42f);
        [SerializeField] float fillSeconds = 0.4f;
        [SerializeField] float highlightSeconds = 0.6f;
        [SerializeField, Tooltip("끄면 숫자만 바뀐다 (나쁜 예 비교용)")] bool progressFlash = true;

        public string Id { get; private set; }
        public string Feed { get; private set; }
        public int Current { get; private set; }
        public int Max { get; private set; }
        public bool Done => Current >= Max;

        Coroutine fillRoutine, flashRoutine;

        public void Init(string id, string feed, string text, int cur, int max)
        {
            Id = id;
            Feed = feed;
            label.text = text;
            Max = max;
            progressBar.SetActive(max > 1);
            highlight.color = Color.clear;
            Apply(cur, false);
        }

        public void Apply(int cur, bool animate)
        {
            int before = Current;
            Current = Mathf.Clamp(cur, 0, Max);
            // 텍스트는 값이 실제로 바뀔 때만 쓴다 (TMP 메시 재생성 최소화)
            count.text = Max > 1 ? $"<b>{Current}</b>/{Max}" : (Done ? "완료" : "");
            check.sprite = Done ? checkOn : checkOff;
            rowGroup.alpha = Done ? 0.55f : 1f;

            float target = Max > 0 ? (float)Current / Max : 0f;
            if (!animate || !progressFlash)
            {
                progressFill.fillAmount = target;
                return;
            }
            if (fillRoutine != null) StopCoroutine(fillRoutine);
            fillRoutine = StartCoroutine(Fill(progressFill.fillAmount, target));
            if (Current != before)
            {
                if (flashRoutine != null) StopCoroutine(flashRoutine);
                flashRoutine = StartCoroutine(Flash());
            }
        }

        IEnumerator Fill(float from, float to)
        {
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / fillSeconds)
            {
                progressFill.fillAmount = Mathf.Lerp(from, to, 1f - Mathf.Pow(1f - t, 3f));
                yield return null;
            }
            progressFill.fillAmount = to;
            fillRoutine = null;
        }

        IEnumerator Flash()
        {
            // 밝게 켠 뒤 원래 대비로 돌아온다 (반복 맥동 없음)
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / highlightSeconds)
            {
                float k = t < 0.2f ? 1f : 1f - Mathf.SmoothStep(0f, 1f, (t - 0.2f) / 0.8f);
                highlight.color = new Color(highlightColor.r, highlightColor.g, highlightColor.b, highlightColor.a * k);
                yield return null;
            }
            highlight.color = Color.clear;
            flashRoutine = null;
        }
    }
}
