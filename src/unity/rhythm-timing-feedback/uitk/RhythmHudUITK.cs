// 박자 표시 · 판정 피드백 — UI Toolkit 판. 판정 · 채보 · 측정은 UGUI 폴더의 RhythmGame · Judge · NoteChart · TapCalibration 을 그대로 쓴다.
// 노트는 풀로 만든 VisualElement 의 style.translate 만 매 프레임 바꾼다 (위치 = 곡 위치에서 계산, USS transition 금지).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.RhythmTimingFeedback
{
    [RequireComponent(typeof(UIDocument))]
    public class RhythmHudUITK : MonoBehaviour
    {
        [SerializeField] RhythmGame game;
        [SerializeField] float approachMs = 1300f;
        [SerializeField] TimingDisplay timingDisplay = TimingDisplay.Label;
        [SerializeField] bool showWindows = true;

        const float LaneWidth = 150f, Travel = 680f, JudgeTop = 700f, MeterHalf = 280f;

        VisualElement judgeLine, band, feedback, ruler, lifeFill;
        VisualElement[] bands, beats;
        Label word, early, late, combo, offset, calibStatus, accuracy, counts, lifeText;
        Button startButton, applyButton;
        readonly List<VisualElement> notePool = new List<VisualElement>();
        readonly List<VisualElement> tickPool = new List<VisualElement>();
        readonly List<NoteData> visible = new List<NoteData>();
        readonly TapCalibration calib = new TapCalibration();
        int nextTick;
        float age = 99f;

        static VisualElement Make(string cls, VisualElement parent)
        {
            var e = new VisualElement { pickingMode = PickingMode.Ignore };
            e.AddToClassList(cls);
            parent.Add(e);
            return e;
        }

        void OnEnable()
        {
            // UIDocument 를 다시 켜면 트리가 새로 만들어진다 — 풀도 매번 새로 채운다
            var root = GetComponent<UIDocument>().rootVisualElement;
            judgeLine = root.Q("judge-line");
            band = root.Q("band");
            bands = new[] { root.Q("band-perfect"), root.Q("band-great"), root.Q("band-good") };
            beats = new[] { root.Q("beat-0"), root.Q("beat-1"), root.Q("beat-2"), root.Q("beat-3") };
            feedback = root.Q("feedback");
            word = root.Q<Label>("word");
            early = root.Q<Label>("early");
            late = root.Q<Label>("late");
            combo = root.Q<Label>("combo");
            ruler = root.Q("ruler");
            offset = root.Q<Label>("offset");
            calibStatus = root.Q<Label>("calib-status");
            accuracy = root.Q<Label>("accuracy");
            counts = root.Q<Label>("counts");
            lifeFill = root.Q("life-fill");
            lifeText = root.Q<Label>("life-text");
            startButton = root.Q<Button>("calib-start");
            applyButton = root.Q<Button>("calib-apply");

            var highway = root.Q("highway");
            highway.style.width = game.LaneCount * LaneWidth;
            highway.style.left = 960 - game.LaneCount * LaneWidth / 2f;
            var lanes = root.Q("lanes");
            lanes.Clear();
            for (int i = 0; i < game.LaneCount; i++) Make("lane", lanes);
            var notes = root.Q("notes");
            var ticks = root.Q("meter-ticks");
            notes.Clear(); // 컴포넌트만 껐다 켜면 트리가 그대로라 예전 요소가 남는다
            ticks.Clear();
            ruler.Clear();
            notePool.Clear();
            for (int i = 0; i < 40; i++) notePool.Add(Make("note", notes));
            tickPool.Clear();
            for (int i = 0; i < 16; i++) tickPool.Add(Make("tick", ticks));
            foreach (var e in notePool) e.style.display = DisplayStyle.None;
            foreach (var e in tickPool) e.style.display = DisplayStyle.None;

            startButton.clicked += BeginCalibration;
            applyButton.clicked += ApplyCalibration;
            game.Judged += OnJudged;
            game.CalibrationTap += OnCalibrationTap;
            game.Conductor.Beat += OnBeat;
            RefreshCalibration();
        }

        void OnDisable()
        {
            startButton.clicked -= BeginCalibration;
            applyButton.clicked -= ApplyCalibration;
            game.Judged -= OnJudged;
            game.CalibrationTap -= OnCalibrationTap;
            game.Conductor.Beat -= OnBeat;
            if (game.Calibrating) game.Calibrating = false;
        }

        void OnBeat(int beat)
        {
            // 칸마다 4박에 한 번 켜진다. 빠른 곡(PulseBeats = 2)은 짝수 박에만 바꿔 깜빡임을 줄인다
            if (beat % game.Conductor.PulseBeats != 0) return;
            for (int i = 0; i < 4; i++) beats[i].EnableInClassList("lamp__beat--on", i == ((beat % 4) + 4) % 4);
        }

        void OnJudged(NoteData note, Grade g, double error)
        {
            word.text = Judge.Text(g);
            word.style.color = Judge.Colors[(int)g];
            bool ms = timingDisplay == TimingDisplay.Ms;
            var timing = timingDisplay == TimingDisplay.Off ? Timing.None : Judge.TimingOf(g, error, ms);
            early.text = "▲ " + (ms ? Judge.Ms(error) : "EARLY");
            late.text = "▼ " + (ms ? Judge.Ms(error) : "LATE");
            early.EnableInClassList("feedback__timing--on", timing == Timing.Early);
            late.EnableInClassList("feedback__timing--on", timing == Timing.Late);
            combo.text = game.Combo >= 2 ? $"{game.Combo}\nCOMBO" : "";
            age = 0f;
            if (Judge.IsHit(g))
            {
                var t = tickPool[nextTick];
                nextTick = (nextTick + 1) % tickPool.Count;
                t.style.display = DisplayStyle.Flex;
                t.BringToFront();
                t.style.translate = new Translate(Mathf.Clamp((float)(error / game.Judge.GoodSeconds), -1f, 1f) * MeterHalf, 0);
            }
            accuracy.text = $"정확도 {game.AccuracyPercent:0.0}%";
            counts.text = $"◆ {game.CountOf(Grade.Perfect)}  ● {game.CountOf(Grade.Great)}  ▲ {game.CountOf(Grade.Good)}  ✕ {game.CountOf(Grade.Miss)}  ○ {game.CountOf(Grade.Lost)}";
            bool lenient = game.Judge.Lenient;
            lifeFill.style.scale = new Scale(new Vector3(lenient ? 1f : game.Life / 100f, 1f, 1f));
            lifeText.text = lenient ? "관대한 판정 — 실패 없음 · 놓침만 기록" : $"생명 {Mathf.RoundToInt(game.Life)}%";
        }

        void BeginCalibration()
        {
            var c = game.Conductor;
            calib.Begin(Mathf.CeilToInt((float)(c.SongPosition / c.BeatSeconds)) + 1);
            ruler.Clear();
            game.Calibrating = true;
            RefreshCalibration();
        }

        void OnCalibrationTap(double songTime)
        {
            if (!(calib.Add(songTime, game.Conductor.BeatSeconds) is double error)) return;
            Make("ruler__tick", ruler).style.left = Length.Percent(50f + Mathf.Clamp((float)error / 0.2f, -1f, 1f) * 50f);
            if (calib.Done) game.Calibrating = false;
            RefreshCalibration();
        }

        void ApplyCalibration()
        {
            if (!calib.Done) return;
            game.SetInputOffset(calib.Mean);
            RefreshCalibration();
        }

        void RefreshCalibration()
        {
            offset.text = Judge.Ms(game.InputOffsetSeconds);
            applyButton.SetEnabled(calib.Done);
            calibStatus.text = calib.Done
                ? $"평균 {Judge.Ms(calib.Mean)} · 흩어짐 ±{Mathf.RoundToInt((float)calib.Spread * 1000)} ms · 제외 {calib.Rejected}"
                : game.Calibrating ? $"{calib.Taps.Count} / {calib.Needed} — 박자에 맞춰 누른다" : "박자에 맞춰 8번 눌러 평균 오차를 잰다";
        }

        void LateUpdate()
        {
            var conductor = game.Conductor;
            double pos = conductor.VisualPosition, approach = approachMs / 1000.0;
            int lanes = game.LaneCount, used = 0;
            if (!game.Calibrating)
            {
                NoteChart.Between(System.Math.Max(pos - 0.35, game.ChartFrom), pos + approach, conductor.Bpm, lanes, visible);
                foreach (var n in visible)
                {
                    bool has = game.TryGetState(n.Id, out var g);
                    if ((has && Judge.IsHit(g)) || used >= notePool.Count) continue;
                    var el = notePool[used++];
                    el.style.display = DisplayStyle.Flex;
                    el.EnableInClassList("note--inner", n.Lane > 0 && n.Lane < lanes - 1);
                    el.EnableInClassList("note--miss", has);
                    el.style.translate = new Translate(n.Lane * LaneWidth + 10f, JudgeTop - (float)((n.Time - pos) / approach) * Travel - 15f);
                }
            }
            for (int i = used; i < notePool.Count; i++) notePool[i].style.display = DisplayStyle.None;

            // 판정선 맥동 (PulseBeats 박에 한 번 — 2Hz 이하) · 판정 창 띠 (오프셋만큼 아래로)
            double ph = pos / (conductor.BeatSeconds * conductor.PulseBeats);
            judgeLine.style.opacity = 0.65f + 0.35f * Mathf.Max(0f, 1f - (float)(ph - System.Math.Floor(ph)) * 4f);
            band.style.display = showWindows ? DisplayStyle.Flex : DisplayStyle.None;
            band.style.translate = new Translate(0, (float)(game.InputOffsetSeconds / approach) * Travel);
            double[] w = { game.Judge.PerfectSeconds, game.Judge.GreatSeconds, game.Judge.GoodSeconds };
            for (int i = 0; i < 3; i++)
            {
                float h = (float)(w[i] * 2 / approach) * Travel;
                bands[i].style.height = h;
                bands[i].style.top = -h / 2f;
            }

            // 판정 문구: 0.12초 동안 1.3배 → 1배, 0.7초 뒤 0.25초에 걸쳐 사라짐
            age += Time.deltaTime;
            feedback.style.opacity = age < 0.7f ? 1f : Mathf.Clamp01(1f - (age - 0.7f) / 0.25f);
            float s = 1f + 0.3f * Mathf.Clamp01(1f - age / 0.12f);
            word.style.scale = new Scale(new Vector3(s, s, 1f));
        }
    }
}
