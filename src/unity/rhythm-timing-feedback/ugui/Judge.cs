// 판정 — 순수 C#. 판정 창은 밀리초(ms)로 정한다. 프레임 수로 정하면 주사율이 바뀔 때 창도 바뀐다.
// GREAT = PERFECT × 2, GOOD = PERFECT × 3. 관대한 판정은 창을 1.5배로 넓히고 MISS 대신 '놓침'(콤보 유지 · 실패 없음).
using System;
using UnityEngine;

namespace UIGallery.RhythmTimingFeedback
{
    public enum Grade { Perfect, Great, Good, Miss, Lost }
    public enum Timing { None, Early, Late }

    [Serializable]
    public class Judge
    {
        [Tooltip("PERFECT 창 ± ms")]
        [SerializeField, Range(20f, 60f)] float perfectMs = 40f;
        [Tooltip("관대한 판정 — 창 1.5배, MISS 대신 놓침, 콤보 · 생명 유지")]
        [SerializeField] bool lenient;

        public bool Lenient => lenient;
        double Scale => lenient ? 1.5 : 1.0;
        public double PerfectSeconds => perfectMs * Scale / 1000.0;
        public double GreatSeconds => PerfectSeconds * 2.0;
        public double GoodSeconds => PerfectSeconds * 3.0;

        /// <summary>오차(초, 음수 = 이르게) → 등급. 창 밖이면 false (판정하지 않는다 = 빈 탭)</summary>
        public bool TryGrade(double error, out Grade grade)
        {
            double a = Math.Abs(error);
            grade = a <= PerfectSeconds ? Grade.Perfect : a <= GreatSeconds ? Grade.Great : Grade.Good;
            return a <= GoodSeconds;
        }

        /// <summary>창을 지나간 노트의 등급</summary>
        public Grade MissGrade => lenient ? Grade.Lost : Grade.Miss;

        public static bool IsHit(Grade g) => g <= Grade.Good;

        /// <summary>EARLY · LATE — PERFECT 는 표시하지 않는다(ms 표시 모드는 예외)</summary>
        public static Timing TimingOf(Grade g, double error, bool includePerfect)
        {
            if (!IsHit(g) || (g == Grade.Perfect && !includePerfect)) return Timing.None;
            return error < 0 ? Timing.Early : Timing.Late;
        }

        public static float Accuracy(Grade g) => g switch { Grade.Perfect => 1f, Grade.Great => 0.7f, Grade.Good => 0.4f, _ => 0f };

        // 화면 표기 (UGUI · UI Toolkit 공용) — 모양 + 글자 + 색을 늘 함께
        public static readonly string[] Glyphs = { "◆", "●", "▲", "✕", "○" };
        public static readonly string[] Labels = { "PERFECT", "GREAT", "GOOD", "MISS", "놓침" };
        public static readonly Color[] Colors =
        {
            new Color(1f, 0.84f, 0.37f), new Color(0.37f, 0.83f, 1f), new Color(0.48f, 0.89f, 0.54f),
            new Color(1f, 0.35f, 0.42f), new Color(0.71f, 0.74f, 0.8f),
        };
        public static string Text(Grade g) => $"{Glyphs[(int)g]} {Labels[(int)g]}";
        public static string Ms(double s) => $"{(s > 0.0005 ? "+" : s < -0.0005 ? "−" : "±")}{Math.Abs(Math.Round(s * 1000))} ms";
    }
}
