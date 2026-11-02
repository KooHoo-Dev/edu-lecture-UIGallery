// 입력 오프셋 보정 (탭 테스트) — 박자에 맞춰 8번 누르게 하고 박과의 평균 오차(튀는 탭 제외)를 잰 뒤, '적용' 하면 판정 시각에서 그만큼 뺀다.
// 측정 계산은 TapCalibration(순수 C#)이라 UI Toolkit 판도 그대로 쓴다.
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.RhythmTimingFeedback
{
    /// <summary>
    /// 탭을 '다음에 올 박' 에 차례로 붙여 오차를 모은다. 가장 가까운 박으로 반올림하지 않는다 —
    /// 지연이 반 박을 넘으면(120 BPM 에서 250ms) 부호가 뒤집혀 평균이 망가진다. 박 하나에 탭 하나.
    /// 다 모이면 중앙값 ± 3 × MAD(최소 20ms) 밖의 탭을 빼고 평균 · 흩어짐을 낸다.
    /// </summary>
    public class TapCalibration
    {
        const double MaxLate = 0.45, MaxEarly = 0.25;
        readonly List<double> taps = new List<double>();
        int next;
        public int Needed { get; }
        public IReadOnlyList<double> Taps => taps;
        public bool Done => taps.Count >= Needed;
        public double Mean { get; private set; }
        public double Spread { get; private set; }
        public int Rejected { get; private set; }

        public TapCalibration(int needed = 8) => Needed = needed;

        /// <summary>firstBeat = 첫 탭을 붙일 박 번호 (보통 지금 다음 박 + 1)</summary>
        public void Begin(int firstBeat)
        {
            taps.Clear();
            next = firstBeat;
            Mean = Spread = 0;
            Rejected = 0;
        }

        /// <summary>songTime = 눌린 순간의 곡 시각. 붙인 탭의 오차(초)를 돌려준다. 버리면 null</summary>
        public double? Add(double songTime, double beat)
        {
            if (Done) return null;
            double err = songTime - next * beat;
            while (err > MaxLate)
            {
                next++; // 박을 건너뛰었다
                err -= beat;
            }
            if (err < -MaxEarly) return null; // 너무 이르다 (같은 박을 두 번 누름 등)
            taps.Add(err);
            next++;
            if (Done) Finish();
            return err;
        }

        void Finish()
        {
            var sorted = new List<double>(taps);
            sorted.Sort();
            double med = sorted[sorted.Count / 2];
            var dev = sorted.ConvertAll(x => Math.Abs(x - med));
            dev.Sort();
            double limit = 3 * Math.Max(0.02, dev[dev.Count / 2]);
            var kept = taps.FindAll(x => Math.Abs(x - med) <= limit);
            double sum = 0, v = 0;
            foreach (double x in kept) sum += x;
            Mean = sum / kept.Count;
            foreach (double x in kept) v += (x - Mean) * (x - Mean);
            Spread = Math.Sqrt(v / kept.Count);
            Rejected = taps.Count - kept.Count;
        }
    }

    public class CalibrationPanel : MonoBehaviour
    {
        [SerializeField] RhythmGame game;
        [SerializeField] TMP_Text offsetText;
        [SerializeField] TMP_Text statusText;
        [SerializeField] Button startButton;
        [SerializeField] Button applyButton;
        [Tooltip("−200 ~ +200 ms 눈금자. 탭마다 눈금 하나")]
        [SerializeField] RectTransform ruler;
        [SerializeField] Image tickPrefab;
        [SerializeField] int tapCount = 8;

        TapCalibration calib;
        readonly List<Image> ticks = new List<Image>();

        void Awake() => calib = new TapCalibration(tapCount);

        void OnEnable()
        {
            startButton.onClick.AddListener(Begin);
            applyButton.onClick.AddListener(Apply);
            game.CalibrationTap += OnTap;
            Refresh();
        }

        void OnDisable()
        {
            startButton.onClick.RemoveListener(Begin);
            applyButton.onClick.RemoveListener(Apply);
            game.CalibrationTap -= OnTap;
            if (game.Calibrating) game.Calibrating = false; // 패널을 닫으면 측정도 끝 — 노트가 멈춘 채로 남지 않게
        }

        public void Begin()
        {
            var c = game.Conductor;
            calib.Begin(Mathf.CeilToInt((float)(c.SongPosition / c.BeatSeconds)) + 1);
            foreach (var t in ticks) Destroy(t.gameObject);
            ticks.Clear();
            game.Calibrating = true;
            Refresh();
        }

        void OnTap(double songTime)
        {
            if (!(calib.Add(songTime, game.Conductor.BeatSeconds) is double error)) return;
            var t = Instantiate(tickPrefab, ruler);
            t.rectTransform.anchoredPosition = new Vector2(Mathf.Clamp((float)error / 0.2f, -1f, 1f) * ruler.rect.width * 0.5f, 0);
            ticks.Add(t);
            if (calib.Done) game.Calibrating = false;
            Refresh();
        }

        public void Apply()
        {
            if (!calib.Done) return;
            game.SetInputOffset(calib.Mean);
            Refresh();
        }

        void Refresh()
        {
            offsetText.text = Judge.Ms(game.InputOffsetSeconds);
            applyButton.interactable = calib.Done;
            statusText.text = calib.Done
                ? $"평균 {Judge.Ms(calib.Mean)} · 흩어짐 ±{Math.Round(calib.Spread * 1000)} ms · 제외 {calib.Rejected}"
                : game.Calibrating
                    ? $"{calib.Taps.Count} / {calib.Needed} — 박자 불빛(소리)에 맞춰 누른다"
                    : $"박자에 맞춰 {calib.Needed}번 눌러 평균 오차를 잰다";
        }
    }
}
