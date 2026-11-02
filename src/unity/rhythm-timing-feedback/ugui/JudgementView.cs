// 판정 문구 — 등급(모양 + 글자 + 색), EARLY 는 문구 위 · LATE 는 문구 아래, 콤보, 오차 막대(최근 16개 눈금 풀).
// RhythmGame.Judged 이벤트만 듣는다. 문구는 나타날 때 0.12초 동안 1.3배 → 1배, 0.7초 뒤 0.25초에 걸쳐 사라진다.
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.RhythmTimingFeedback
{
    public enum TimingDisplay { Label, Ms, Off }

    public class JudgementView : MonoBehaviour
    {
        [SerializeField] RhythmGame game;
        [Tooltip("Early · Word · Late · Combo 만 담은 자식. 사라지는 것은 이것뿐 — 오차 막대 · 정확도 · 생명은 남는다")]
        [SerializeField] CanvasGroup popup;
        [SerializeField] TMP_Text word;
        [Tooltip("문구 위 — 이르게")]
        [SerializeField] TMP_Text earlyText;
        [Tooltip("문구 아래 — 늦게")]
        [SerializeField] TMP_Text lateText;
        [SerializeField] TMP_Text comboText;
        [SerializeField] TimingDisplay timingDisplay = TimingDisplay.Label;

        [Header("오차 막대 (가운데 = 정확, 왼쪽 = 이르게)")]
        [SerializeField] RectTransform meter;
        [SerializeField] Image tickPrefab;
        [SerializeField] float meterHalfWidth = 280f;
        [SerializeField] RectTransform meanMarker;

        [Header("점수 (정확도 · 생명)")]
        [SerializeField] TMP_Text accuracyText;
        [SerializeField] Image lifeFill;
        [SerializeField] TMP_Text lifeText;


        readonly List<Image> ticks = new List<Image>();
        readonly Queue<double> recent = new Queue<double>();
        int next;
        float age = 99f;

        void Awake()
        {
            for (int i = 0; i < 16; i++)
            {
                var t = Instantiate(tickPrefab, meter);
                t.gameObject.SetActive(false);
                ticks.Add(t);
            }
            popup.alpha = 0f;
        }

        void OnEnable() => game.Judged += Show;
        void OnDisable() => game.Judged -= Show;

        void Show(NoteData note, Grade g, double error)
        {
            int gi = (int)g;
            word.text = Judge.Text(g);
            word.color = Judge.Colors[gi];
            var timing = Judge.TimingOf(g, error, timingDisplay == TimingDisplay.Ms);
            if (timingDisplay == TimingDisplay.Off) timing = Timing.None;
            string ms = Judge.Ms(error);
            earlyText.text = "▲ " + (timingDisplay == TimingDisplay.Ms ? ms : "EARLY");
            lateText.text = "▼ " + (timingDisplay == TimingDisplay.Ms ? ms : "LATE");
            earlyText.enabled = timing == Timing.Early;
            lateText.enabled = timing == Timing.Late;
            comboText.text = game.Combo >= 2 ? $"{game.Combo}\nCOMBO" : "";
            age = 0f;
            if (Judge.IsHit(g)) AddTick(error, Judge.Colors[gi]);
            accuracyText.text = $"정확도 {game.AccuracyPercent:0.0}%";
            bool lenient = game.Judge.Lenient;
            lifeFill.fillAmount = lenient ? 1f : game.Life / 100f; // Image Type = Filled
            lifeText.text = lenient ? "실패 없음 · 놓침 " + game.CountOf(Grade.Lost) : $"생명 {Mathf.RoundToInt(game.Life)}%";
        }

        void AddTick(double error, Color c)
        {
            double good = game.Judge.GoodSeconds;
            var t = ticks[next];
            next = (next + 1) % ticks.Count;
            t.gameObject.SetActive(true);
            t.transform.SetAsLastSibling(); // 최근 눈금이 위에
            t.rectTransform.anchoredPosition = new Vector2((float)(Mathf.Clamp((float)(error / good), -1f, 1f) * meterHalfWidth), 0);
            t.color = Color.Lerp(c, Color.white, 0.6f);
            recent.Enqueue(error);
            if (recent.Count > ticks.Count) recent.Dequeue();
            double sum = 0;
            foreach (double e in recent) sum += e;
            if (meanMarker) meanMarker.anchoredPosition = new Vector2((float)(Mathf.Clamp((float)(sum / recent.Count / good), -1f, 1f) * meterHalfWidth), meanMarker.anchoredPosition.y);
        }

        void Update()
        {
            age += Time.deltaTime;
            popup.alpha = age < 0.7f ? 1f : Mathf.Clamp01(1f - (age - 0.7f) / 0.25f);
            word.rectTransform.localScale = Vector3.one * (1f + 0.3f * Mathf.Clamp01(1f - age / 0.12f));
            // 오래된 눈금일수록 흐리게
            for (int i = 0; i < ticks.Count; i++)
            {
                int k = (next - 1 - i + ticks.Count) % ticks.Count;
                var c = ticks[k].color;
                c.a = Mathf.Max(0.2f, 1f - i / (float)ticks.Count);
                ticks[k].color = c;
            }
        }
    }
}
