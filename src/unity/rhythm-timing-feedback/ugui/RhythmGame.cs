// 리듬 판정 진행 — 레인 입력(새 Input System)을 '눌린 순간의 곡 시각' 으로 바꿔 판정하고, 콤보 · 정확도 · 생명을 센다.
// 그리는 일은 하지 않는다. 화면(UGUI 의 JudgementView · NoteSpawner, UI Toolkit 의 RhythmHudUITK)은 Judged 이벤트를 듣는다.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.RhythmTimingFeedback
{
    public class RhythmGame : MonoBehaviour
    {
        [SerializeField] Conductor conductor;
        [SerializeField] Judge judge = new Judge();
        [Tooltip("레인마다 액션 하나 (예: D F J K). 2~4개")]
        [SerializeField] InputActionReference[] laneActions;
        [SerializeField, Range(2, 4)] int laneCount = 4;
        [Tooltip("탭 테스트로 잰 평균 입력 지연. 판정 시각에서 뺀다")]
        [SerializeField] float inputOffsetMs;
        [SerializeField] int missLife = 10;

        readonly Dictionary<int, Grade> judged = new Dictionary<int, Grade>();
        readonly List<NoteData> buffer = new List<NoteData>();
        readonly Action<InputAction.CallbackContext>[] handlers = new Action<InputAction.CallbackContext>[4];
        double missCursor = -1;

        public Conductor Conductor => conductor;
        public Judge Judge => judge;
        public int LaneCount => laneCount;
        public int Combo { get; private set; }
        public int MaxCombo { get; private set; }
        public float Life { get; private set; } = 100f;
        public float AccuracyPercent => count == 0 ? 100f : score / count * 100f;
        public double InputOffsetSeconds => inputOffsetMs / 1000.0;
        /// <summary>
        /// 탭 테스트 중이면 노트 대신 박자와의 오차를 CalibrationTap 으로 보낸다.
        /// 끝나면 2초 뒤 노트부터 다시 — 테스트 동안 지나간 노트를 한꺼번에 MISS 로 치지 않게.
        /// </summary>
        public bool Calibrating
        {
            get => calibrating;
            set
            {
                calibrating = value;
                if (value) return;
                ChartFrom = conductor.SongPosition + 2.0;
                missCursor = Math.Max(missCursor, ChartFrom - 0.001);
            }
        }
        /// <summary>이 곡 시각 전의 노트는 쓰지 않는다 (그리기 · 판정 모두)</summary>
        public double ChartFrom { get; private set; }
        bool calibrating;

        /// <summary>노트, 등급, 오차(초, 음수 = 이르게)</summary>
        public event Action<NoteData, Grade, double> Judged;
        /// <summary>탭 테스트 중의 입력 (눌린 순간의 곡 시각) — 박에 붙이는 일은 TapCalibration 이 한다</summary>
        public event Action<double> CalibrationTap;
        public event Action Failed;

        float score;
        int count;
        readonly int[] counts = new int[5];
        public int CountOf(Grade g) => counts[(int)g];

        void OnEnable()
        {
            for (int i = 0; i < laneActions.Length && i < handlers.Length; i++)
            {
                int lane = i;
                handlers[i] = ctx => Press(lane, EventSongTime(ctx.time));
                laneActions[i].action.performed += handlers[i];
                laneActions[i].action.Enable();
            }
        }

        void OnDisable()
        {
            for (int i = 0; i < laneActions.Length && i < handlers.Length; i++)
            {
                if (handlers[i] == null) continue;
                laneActions[i].action.performed -= handlers[i];
                laneActions[i].action.Disable();
                handlers[i] = null;
            }
        }

        /// <summary>
        /// 입력 이벤트 시각(Time.realtimeSinceStartup 기준) → 곡 시각. 처리한 프레임이 아니라 이벤트 시각으로 판정한다.
        /// 한계: 이벤트 시각이 실제로 얼마나 정확한지는 플랫폼마다 다르고(메시지를 처리할 때 찍히기도 한다),
        /// 콜백 순간의 dspTime 은 최대 한 버퍼 묵은 값이라 조금 이르게 치우칠 수 있다 — 이런 고정 치우침은 탭 테스트 오프셋이 함께 흡수한다.
        /// </summary>
        double EventSongTime(double eventTime)
        {
            double ago = Math.Max(0, Time.realtimeSinceStartupAsDouble - eventTime);
            return conductor.SongPosition - ago * conductor.PlaybackRate;
        }

        public void SetInputOffset(double seconds) => inputOffsetMs = (float)(seconds * 1000.0);

        public bool TryGetState(int noteId, out Grade grade) => judged.TryGetValue(noteId, out grade);

        /// <summary>레인 입력 하나. songTime = 눌린 순간의 곡 시각</summary>
        public void Press(int lane, double songTime)
        {
            if (lane >= laneCount || !conductor.IsPlaying) return; // 일시정지 중의 입력은 판정하지 않는다
            if (Calibrating)
            {
                CalibrationTap?.Invoke(songTime);
                return;
            }
            double t = songTime - InputOffsetSeconds;
            NoteChart.Between(t - judge.GoodSeconds, t + judge.GoodSeconds, conductor.Bpm, laneCount, buffer);
            int best = -1;
            for (int i = 0; i < buffer.Count; i++)
            {
                var n = buffer[i];
                if (n.Lane != lane || n.Time < ChartFrom || judged.ContainsKey(n.Id)) continue;
                if (best < 0 || Math.Abs(n.Time - t) < Math.Abs(buffer[best].Time - t)) best = i;
            }
            if (best < 0) return; // 창 밖 = 빈 탭
            var note = buffer[best];
            double error = t - note.Time;
            if (judge.TryGrade(error, out var g)) Record(note, g, error);
        }

        void Update()
        {
            if (!conductor.IsPlaying || Calibrating) return;
            // 창을 지나간 노트 = MISS (관대한 판정: 놓침)
            double limit = conductor.SongPosition - InputOffsetSeconds - judge.GoodSeconds;
            if (limit <= missCursor) return;
            NoteChart.Between(missCursor + 1e-6, limit, conductor.Bpm, laneCount, buffer);
            foreach (var n in buffer)
                if (n.Time >= ChartFrom && !judged.ContainsKey(n.Id)) Record(n, judge.MissGrade, 0);
            missCursor = limit;
            if (judged.Count > 400) Prune(limit - 4);
        }

        void Record(NoteData note, Grade g, double error)
        {
            judged[note.Id] = g;
            counts[(int)g]++;
            count++;
            score += Judge.Accuracy(g);
            if (Judge.IsHit(g))
            {
                Combo++;
                MaxCombo = Math.Max(MaxCombo, Combo);
                Life = Mathf.Min(100f, Life + (g == Grade.Perfect ? 2 : g == Grade.Great ? 1 : 0));
            }
            else if (g == Grade.Miss)
            {
                Combo = 0;
                Life -= missLife;
                if (Life <= 0)
                {
                    Life = 0;
                    Failed?.Invoke();
                }
            }
            // Grade.Lost(놓침): 기록만 — 콤보 · 생명 그대로
            Judged?.Invoke(note, g, error);
        }

        void Prune(double before)
        {
            var old = new List<int>();
            foreach (var kv in judged)
                if (kv.Key / 4 * (30.0 / conductor.Bpm) < before) old.Add(kv.Key);
            foreach (int id in old) judged.Remove(id);
        }

        /// <summary>처음부터 — 오프셋은 설정이라 그대로</summary>
        public void ResetRun()
        {
            judged.Clear();
            missCursor = -1;
            ChartFrom = 0;
            calibrating = false;
            Combo = MaxCombo = count = 0;
            System.Array.Clear(counts, 0, counts.Length);
            score = 0;
            Life = 100f;
        }
    }
}
