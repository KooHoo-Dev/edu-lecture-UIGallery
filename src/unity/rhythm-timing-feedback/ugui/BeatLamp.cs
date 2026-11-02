// 박자 불빛 — Conductor.Beat 를 듣고 지금 박의 칸만 켠다 (첫 박 칸은 동그라미 모양으로 따로 그려 둔다).
// 한 박에 한 번 바뀐다. 빠른 곡(Conductor.PulseBeats = 2, 120 BPM 초과)은 짝수 박에만 바꿔 바뀜을 2Hz 이하로 줄인다.
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.RhythmTimingFeedback
{
    public class BeatLamp : MonoBehaviour
    {
        [SerializeField] Conductor conductor;
        [SerializeField] Image[] cells = new Image[4];
        [SerializeField] Color onColor = new Color(1f, 0.84f, 0.37f);
        [SerializeField] Color offColor = new Color(1f, 1f, 1f, 0.15f);

        void OnEnable() => conductor.Beat += OnBeat;
        void OnDisable() => conductor.Beat -= OnBeat;

        void OnBeat(int beat)
        {
            if (beat % conductor.PulseBeats != 0) return;
            int cur = ((beat % cells.Length) + cells.Length) % cells.Length;
            for (int i = 0; i < cells.Length; i++) cells[i].color = i == cur ? onColor : offColor;
        }
    }
}
