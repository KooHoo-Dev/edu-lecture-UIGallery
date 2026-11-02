// 노트 그리기 — 매 프레임 '지금 보일 노트' 를 채보에서 다시 계산하고, 위치 = (노트 시각 − 곡 위치) ÷ 보이는 시간 × 레인 길이.
// 흔한 실수인 transform.position += speed * Time.deltaTime 을 쓰지 않는다: 프레임이 끊기거나 Time.timeScale 이 바뀌면 음악과 어긋난다.
// 판정선 맥동(박자)과 판정 창 디버그 띠도 여기서 그린다. 마디선 · 박자 불빛은 같은 방법으로 늘리면 된다.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.RhythmTimingFeedback
{
    public class NoteSpawner : MonoBehaviour
    {
        [SerializeField] RhythmGame game;
        [SerializeField] NoteView notePrefab;
        [Tooltip("노트들의 부모. 피벗 = 판정선 가운데")]
        [SerializeField] RectTransform notesRoot;
        [Tooltip("노트가 맨 위에서 판정선까지 오는 시간")]
        [SerializeField] float approachMs = 1300f;
        [SerializeField] float laneWidth = 150f;
        [Tooltip("맨 위 ~ 판정선 거리(px)")]
        [SerializeField] float travel = 680f;
        [SerializeField] int poolSize = 40;

        [Header("판정선 · 판정 창 띠")]
        [SerializeField] CanvasGroup judgeLineGlow;
        [SerializeField] bool showWindows = true;
        [Tooltip("판정 창 띠 (perfect · great · good 순). 높이 = 창 × 2 ÷ 보이는 시간 × travel")]
        [SerializeField] RectTransform[] windowBands = new RectTransform[3];

        readonly List<NoteView> pool = new List<NoteView>();
        readonly List<NoteData> visible = new List<NoteData>();

        void Awake()
        {
            for (int i = 0; i < poolSize; i++)
            {
                var v = Instantiate(notePrefab, notesRoot);
                v.Hide();
                pool.Add(v);
            }
        }

        void LateUpdate()
        {
            var conductor = game.Conductor;
            double pos = conductor.VisualPosition;
            double approach = approachMs / 1000.0;
            int lanes = game.LaneCount;
            int used = 0;
            if (!game.Calibrating)
            {
                NoteChart.Between(System.Math.Max(pos - 0.35, game.ChartFrom), pos + approach, conductor.Bpm, lanes, visible);
                foreach (var n in visible)
                {
                    bool has = game.TryGetState(n.Id, out var g);
                    if (has && Judge.IsHit(g)) continue; // 친 노트는 사라진다
                    if (used >= pool.Count) break;
                    float x = (n.Lane - (lanes - 1) * 0.5f) * laneWidth;
                    float y = (float)((n.Time - pos) / approach) * travel; // 판정선 = 0, 위가 +
                    pool[used++].Place(new Vector2(x, y), n.Lane > 0 && n.Lane < lanes - 1, has);
                }
            }
            for (int i = used; i < pool.Count; i++) pool[i].Hide();

            // 판정선 맥동 — PulseBeats 박에 한 번(빠른 곡은 두 박에 한 번), 앞 1/4 동안 밝다 → 늘 2Hz 이하
            if (judgeLineGlow)
            {
                double ph = pos / (conductor.BeatSeconds * conductor.PulseBeats);
                ph -= System.Math.Floor(ph);
                judgeLineGlow.alpha = Mathf.Max(0f, 1f - (float)ph * 4f);
            }
            // 판정 창 띠 — 오프셋만큼 판정 중심이 아래(늦게)로
            var j = game.Judge;
            double[] w = { j.PerfectSeconds, j.GreatSeconds, j.GoodSeconds };
            for (int i = 0; i < windowBands.Length && i < 3; i++)
            {
                var band = windowBands[i];
                if (!band) continue;
                band.gameObject.SetActive(showWindows);
                band.sizeDelta = new Vector2(band.sizeDelta.x, (float)(w[i] * 2 / approach) * travel);
                band.anchoredPosition = new Vector2(0, -(float)(game.InputOffsetSeconds / approach) * travel);
            }
        }
    }
}
