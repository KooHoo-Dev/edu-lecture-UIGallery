// 곡 시계 — AudioSettings.dspTime 하나로 곡 위치를 계산한다. Time.time · Time.deltaTime 으로 노트를 움직이지 않는다.
// 곡 위치 = (dspTime − 시작 dsp) × 재생 속도. 시작 · 다시 시작은 AudioSource.PlayScheduled 로 미래의 dsp 시각에 정확히 맞춘다.
using System;
using UnityEngine;

namespace UIGallery.RhythmTimingFeedback
{
    [RequireComponent(typeof(AudioSource))]
    public class Conductor : MonoBehaviour
    {
        [SerializeField, Range(40f, 240f)] float bpm = 100f;
        [Tooltip("PlayScheduled 예약 여유(초). 이만큼 뒤에 곡 위치 0 이 된다")]
        [SerializeField] double leadInSeconds = 0.75;
        [Tooltip("연습 배속(느리게만). 노트와 음악이 함께 느려진다 (Time.timeScale 과 다르다)")]
        [SerializeField, Range(0.25f, 1f)] float playbackRate = 1f;

        const double ScheduleMargin = 0.1; // 다시 시작할 때 예약 여유 — 다음 오디오 버퍼보다 넉넉하게

        AudioSource source;
        double startDsp;
        double pausedAt;
        double resumeDsp;
        bool playing;
        int lastBeat = int.MinValue;

        public float Bpm => bpm;
        public double BeatSeconds => 60.0 / bpm;
        public float PlaybackRate => playbackRate;
        public bool IsPlaying => playing;
        /// <summary>맥동(판정선 · 박자 불빛)은 몇 박에 한 번인가 — 2Hz(초당 2번)를 넘지 않게</summary>
        public int PulseBeats => bpm * playbackRate > 120f ? 2 : 1;

        /// <summary>판정용 곡 위치(초). 0 전에는 음수 = 준비 시간. 다시 예약한 소리가 나기 전(resumeDsp 전)에는 멈춘 위치 그대로</summary>
        public double SongPosition
        {
            get
            {
                double dsp = AudioSettings.dspTime;
                return playing && dsp >= resumeDsp ? (dsp - startDsp) * playbackRate : pausedAt;
            }
        }

        /// <summary>그리기용 곡 위치. dspTime 은 오디오 버퍼 단위로 뛰므로 실제 경과 시간으로 예측하고 dspTime 쪽으로 천천히 맞춘다 (뒤로 가지 않는다)</summary>
        public double VisualPosition { get; private set; }

        /// <summary>박자가 바뀔 때마다 (박 번호). 박자 불빛 · 판정선 맥동이 듣는다</summary>
        public event Action<int> Beat;

        void Awake()
        {
            source = GetComponent<AudioSource>();
            source.playOnAwake = false;
        }

        /// <summary>leadInSeconds 뒤의 dsp 시각에 곡을 처음부터 예약 재생한다</summary>
        public void Play(AudioClip clip, bool loop = true)
        {
            source.Stop();
            source.clip = clip;
            source.loop = loop;
            pausedAt = -leadInSeconds * playbackRate;
            playing = false;
            Resume();
        }

        public void Pause()
        {
            if (!playing) return;
            pausedAt = SongPosition;
            playing = false;
            source.Stop();
        }

        /// <summary>
        /// UnPause 는 다음 오디오 버퍼에서 소리가 다시 나 시계와 한 버퍼만큼 어긋날 수 있다.
        /// 그래서 멈춘 곡 위치로 재생 위치를 맞추고 미래의 dsp 시각에 다시 예약한 뒤, 시작 dsp 를 그 시각에 맞춘다.
        /// </summary>
        public void Resume()
        {
            if (playing || !source.clip) return;
            var clip = source.clip;
            double when = AudioSettings.dspTime + ScheduleMargin;
            source.pitch = playbackRate;
            if (pausedAt < 0)
            {
                // 준비 시간(곡 위치 음수) 중이면 0 이 되는 dsp 시각에 처음부터
                source.timeSamples = 0;
                source.PlayScheduled(when - pausedAt / playbackRate);
            }
            else
            {
                double inClip = pausedAt % clip.length;
                source.timeSamples = Mathf.Clamp((int)(inClip * clip.frequency), 0, clip.samples - 1);
                source.PlayScheduled(when);
            }
            startDsp = when - pausedAt / playbackRate;
            resumeDsp = when;
            playing = true;
            lastBeat = int.MinValue;
            VisualPosition = pausedAt;
        }

        /// <summary>연습 배속. 멈췄다가 같은 곡 위치에서 새 속도로 다시 예약한다</summary>
        public void SetPlaybackRate(float rate)
        {
            bool was = playing;
            Pause();
            playbackRate = Mathf.Clamp(rate, 0.25f, 1f);
            if (was) Resume();
        }

        void Update()
        {
            if (!playing)
            {
                VisualPosition = SongPosition;
                return;
            }
            double target = SongPosition;
            double next = VisualPosition + Time.unscaledDeltaTime * playbackRate; // 실제 경과 시간으로 예측 (Time.timeScale 무관)
            next += (target - next) * 0.1; // dspTime 쪽으로 조금씩
            VisualPosition = Math.Abs(target - next) > 0.1 ? target : Math.Max(VisualPosition, next);
            int beat = (int)Math.Floor(target / BeatSeconds);
            if (beat != lastBeat)
            {
                lastBeat = beat;
                Beat?.Invoke(beat);
            }
        }

        void OnDisable() => Pause();
    }
}
