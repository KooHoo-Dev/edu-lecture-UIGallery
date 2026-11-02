// 시험용 — 외부 소리 파일 없이 8마디 곡(킥 · 하이햇 · 노트 음)을 AudioClip.Create 로 합성해 Conductor 로 예약 재생한다.
// 키: R 처음부터 · P 일시정지 · 1 / 2 연습 배속 0.5× / 1×. 생명이 0 이 되면 처음부터.
// autoPlay: 음악을 듣고 deviceLatencyMs 만큼 늦게 친다 (보정 시험용 모형 — 탭 테스트로 재서 적용하면 판정이 가운데로).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.RhythmTimingFeedback
{
    public class RhythmDemo : MonoBehaviour
    {
        [SerializeField] Conductor conductor;
        [SerializeField] RhythmGame game;
        [SerializeField] bool autoPlay;
        [SerializeField] float deviceLatencyMs;

        readonly List<NoteData> buffer = new List<NoteData>();
        double botCursor;
        int botBeat;
        bool failed, botCalibrating;
        AudioClip clip;
        float clipBpm;
        int clipLanes;

        // 판정 도중(RhythmGame.Update 안)에 처음부터 하지 않고 다음 프레임으로 미룬다
        void OnFailed() => failed = true;
        void OnEnable() => game.Failed += OnFailed;
        void OnDisable() => game.Failed -= OnFailed;
        void Start() => Restart();
        void OnDestroy() => Destroy(clip);

        void Restart()
        {
            game.ResetRun();
            // 같은 BPM · 레인 수면 만든 곡을 다시 쓴다 (새로 만들면 수 MB 씩 쌓인다)
            if (!clip || clipBpm != conductor.Bpm || clipLanes != game.LaneCount)
            {
                Destroy(clip);
                clip = BuildClip(clipBpm = conductor.Bpm, clipLanes = game.LaneCount);
            }
            conductor.Play(clip);
            botCursor = 0;
            botBeat = 0;
        }

        void Update()
        {
            var kb = Keyboard.current;
            if (failed)
            {
                failed = false;
                Restart();
            }
            if (kb != null)
            {
                if (kb.rKey.wasPressedThisFrame) Restart();
                if (kb.pKey.wasPressedThisFrame)
                {
                    if (conductor.IsPlaying) conductor.Pause();
                    else conductor.Resume();
                }
                if (kb.digit1Key.wasPressedThisFrame) conductor.SetPlaybackRate(0.5f);
                if (kb.digit2Key.wasPressedThisFrame) conductor.SetPlaybackRate(1f);
            }
            if (!autoPlay || !conductor.IsPlaying) return;
            double pos = conductor.SongPosition, lat = deviceLatencyMs / 1000.0, beat = conductor.BeatSeconds;
            if (game.Calibrating)
            {
                // 측정을 시작한 순간 첫 박을 한 번만 정하고(CalibrationPanel 과 같은 식), 지난 박마다 한 번씩 누른다
                if (!botCalibrating) botBeat = Mathf.CeilToInt((float)(pos / beat)) + 1;
                botCalibrating = true;
                while (botBeat * beat + lat <= pos) game.Press(0, botBeat++ * beat + lat);
                botCursor = pos;
                return;
            }
            botCalibrating = false;
            if (pos - lat > botCursor)
            {
                NoteChart.Between(botCursor + 1e-6, pos - lat, conductor.Bpm, game.LaneCount, buffer);
                foreach (var n in buffer) game.Press(n.Lane, n.Time + lat);
                botCursor = pos - lat;
            }
        }

        /// <summary>8마디 한 바퀴 — 박마다 킥(마디 첫 박 강하게), 반박마다 하이햇, 노트 시각마다 레인 음</summary>
        static AudioClip BuildClip(float bpm, int lanes)
        {
            const int rate = 44100;
            double half = 30.0 / bpm;
            var data = new float[(int)System.Math.Round(half * 64 * rate)];
            for (int k = 0; k < 64; k++)
            {
                float amp = k % 8 == 0 ? 0.9f : 0.6f;
                if (k % 2 == 0) Tone(data, k * half, 0.18, t => Mathf.Sin(2 * Mathf.PI * (150f - 600f * t) * t) * amp);
                else Tone(data, k * half, 0.05, _ => (Random.value * 2 - 1) * 0.12f);
            }
            float[] pitch = { 392f, 440f, 523.25f, 587.33f };
            NoteChart.Between(0, half * 64 - 0.001, bpm, lanes, buffer2);
            foreach (var n in buffer2) Tone(data, n.Time, 0.25, t => (Mathf.PingPong(t * pitch[n.Lane] * 4f, 2f) - 1f) * 0.22f);
            var clip = AudioClip.Create("RhythmLoop", data.Length, 1, rate, false);
            clip.SetData(data, 0);
            return clip;

            void Tone(float[] d, double at, double dur, System.Func<float, float> wave)
            {
                int start = (int)(at * rate);
                for (int i = 0; i < dur * rate && start + i < d.Length; i++)
                {
                    float t = i / (float)rate;
                    d[start + i] += wave(t) * Mathf.Exp(-t / (float)(dur * 0.3)); // 짧게 사라지는 소리
                }
            }
        }

        static readonly List<NoteData> buffer2 = new List<NoteData>();
    }
}
