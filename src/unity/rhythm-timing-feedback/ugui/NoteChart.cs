// 채보 — 8마디 × 8분음표 8칸을 반복한다 (웹 표본과 같은 패턴). 숫자 = 레인(0~3), x = 가운데 두 레인 동시.
// 노트는 '곡 시각' 만 가진다. 화면 위치는 그리는 쪽이 곡 위치와의 차이로 계산한다.
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.RhythmTimingFeedback
{
    public readonly struct NoteData
    {
        /// <summary>8분음표 번호 × 4 + 레인 — 곡이 몇 바퀴 돌아도 겹치지 않는다</summary>
        public readonly int Id;
        public readonly double Time;
        public readonly int Lane;

        public NoteData(int id, double time, int lane)
        {
            Id = id;
            Time = time;
            Lane = lane;
        }
    }

    public static class NoteChart
    {
        static readonly string[] Bars = { "0.1.2.3.", "3.2.1.0.", "0.2.1.3.", "1.2.0.23", "0.1.2.3.", "3.1.2.0.", "x...x...", "0.3.12.3" };

        static int MapLane(int lane, int lanes) => lanes >= 4 ? lane : Mathf.Min(lanes - 1, lane * lanes / 4);

        /// <summary>곡 시각 [t0, t1] 사이의 노트를 시간순으로 into 에 담는다 (into 는 먼저 비운다)</summary>
        public static void Between(double t0, double t1, float bpm, int lanes, List<NoteData> into)
        {
            into.Clear();
            double slot = 30.0 / bpm;
            int k0 = Mathf.Max(0, (int)System.Math.Ceiling(t0 / slot - 1e-9));
            int k1 = (int)System.Math.Floor(t1 / slot + 1e-9);
            for (int k = k0; k <= k1; k++)
            {
                char ch = Bars[(k / 8) % Bars.Length][k % 8];
                if (ch == '.') continue;
                if (ch == 'x')
                {
                    Add(k, slot, MapLane(1, lanes), into);
                    int b = MapLane(2, lanes);
                    if (b != MapLane(1, lanes)) Add(k, slot, b, into);
                }
                else Add(k, slot, MapLane(ch - '0', lanes), into);
            }
        }

        static void Add(int k, double slot, int lane, List<NoteData> into) => into.Add(new NoteData(k * 4 + lane, k * slot, lane));
    }
}
