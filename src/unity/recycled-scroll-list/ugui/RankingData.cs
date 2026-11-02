using System;
using System.Collections.Generic;

namespace UIGallery.RecycledScrollList
{
    /// <summary>랭킹 한 줄의 데이터. 응원(cheered) 같은 상태는 셀이 아니라 여기에 둔다</summary>
    [Serializable]
    public class RankingEntry
    {
        public int id;
        public string name;
        public int squad;
        public int level;
        public int score;
        public int crest;
        public int cheers;
        public bool cheered;
        /// <summary>직전 갱신에서 오른 칸 수 (+ 오름 · − 내림)</summary>
        public int delta;
        public bool me;
    }

    /// <summary>
    /// 시험용 랭킹 데이터 — 외곽 탐사대 시즌 랭킹(잔해 드론 격추 점수). 웹 표본과 같은 규칙으로 만든다.
    /// UI Toolkit 판(RankingListUITK)도 이 파일을 그대로 쓴다.
    /// </summary>
    public static class RankingData
    {
        static readonly string[] Pre = { "새벽", "북풍", "은빛", "붉은", "회색", "푸른", "작은", "고요한", "먼", "늦은", "날쌘", "검은", "맑은", "깊은", "빛나는", "외곽" };
        static readonly string[] Suf = { "매", "늑대", "별", "바람", "등대", "여우", "곰", "파도", "닻", "불꽃", "송골", "렌치", "나침반", "궤도", "안테나", "수리공" };
        public const int CrestKinds = 5;

        public static List<RankingEntry> Generate(int count, int seed = 11)
        {
            var r = new Random(seed);
            var list = new List<RankingEntry>(count);
            for (int i = 0; i < count; i++)
            {
                double k = i / (double)Math.Max(1, count - 1);
                string name = Pre[r.Next(Pre.Length)] + Suf[r.Next(Suf.Length)] + (r.NextDouble() < 0.45 ? r.Next(10, 100).ToString() : "");
                list.Add(new RankingEntry
                {
                    id = i + 1,
                    name = name,
                    squad = 1 + r.Next(9),
                    level = Math.Max(5, (int)Math.Round(70 - k * 55 + (r.NextDouble() - 0.5) * 10)),
                    score = (int)Math.Round(1200 + 96000 * Math.Pow(1 - k, 2.2) + r.NextDouble() * 40),
                    crest = r.Next(CrestKinds),
                    cheers = (int)(r.NextDouble() * r.NextDouble() * 60),
                });
            }
            list.Sort((a, b) => b.score.CompareTo(a.score));
            // 아는 얼굴: 도윤 · 세라, 그리고 나(하린)는 487위 근처
            Name(list, Math.Min(11, count - 1), "도윤", cheered: true);
            Name(list, Math.Min(202, count - 2), "세라");
            int me = Math.Min(count - 1, (int)Math.Round(486 * (count / 1000.0)));
            Name(list, me, "하린");
            if (me >= 0) list[me].me = true;
            if (count > 1) list[1].cheered = true;
            if (count > 4) list[4].cheered = true;
            return list;
        }

        static void Name(List<RankingEntry> list, int index, string name, bool cheered = false)
        {
            if (index < 0 || index >= list.Count) return;
            list[index].name = name;
            list[index].squad = 2;
            list[index].cheered |= cheered;
        }

        /// <summary>순위 변동 — 일부 점수가 오르고 다시 정렬. delta 는 오른 칸 수</summary>
        public static void Reshuffle(List<RankingEntry> list, Random r)
        {
            var before = new Dictionary<int, int>(list.Count);
            for (int i = 0; i < list.Count; i++) before[list[i].id] = i;
            foreach (RankingEntry e in list)
            {
                if (e.me) e.score += 900 + r.Next(600);
                else if (r.NextDouble() < 0.35) e.score += (int)(r.NextDouble() * r.NextDouble() * 9000);
            }
            list.Sort((a, b) => b.score.CompareTo(a.score));
            for (int i = 0; i < list.Count; i++) list[i].delta = before[list[i].id] - i;
        }

        public static int IndexOfMe(List<RankingEntry> list) => list.FindIndex(e => e.me);
    }
}
