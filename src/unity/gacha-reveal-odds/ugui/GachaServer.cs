// 서버 흉내 — 결과와 천장 상태를 '요청 시점에 한 번에' 정해 응답으로 돌려준다. 클라이언트(연출)는 받은 결과를 보여 주기만 한다.
// 실제 게임이면 이 클래스 자리에 HTTP 요청이 들어가고, 천장 카운터는 서버 DB 에 있다. 여기서는 PlayerPrefs 에 저장한다.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.GachaRevealOdds
{
    public class PullResult
    {
        public readonly List<int> items = new();
        /// <summary>천장(보장형)으로 확정된 칸 번호</summary>
        public readonly List<int> forced = new();
        public int sinceHero;
        public int points;

        public Grade Best(GachaTable table)
        {
            Grade best = Grade.Common;
            foreach (int i in items) if (table.items[i].grade < best) best = table.items[i].grade;
            return best;
        }
    }

    public class GachaServer
    {
        const string SinceHeroKey = "gacha.sinceHero";
        const string PointsKey = "gacha.points";

        readonly System.Random rnd = new();
        readonly bool persistent;
        public int SinceHero { get; private set; }
        public int Points { get; private set; }
        public float latencySeconds = 0.35f;
        /// <summary>정했지만 아직 다 보여 주지 않은 결과 — 연출 중 화면이 꺼졌다 켜지면(재접속) 이것을 다시 받아 이어서 보여 준다.
        /// 실제 게임이면 서버의 '미확인 결과' 기록. 여기서는 메모리에만 둔다</summary>
        public PullResult Unseen { get; private set; }

        /// <param name="persistent">false 면 저장하지 않는 시험용 (시뮬레이션은 진짜 천장 카운터를 건드리지 않는다)</param>
        public GachaServer(bool persistent = true)
        {
            this.persistent = persistent;
            if (!persistent) return;
            SinceHero = PlayerPrefs.GetInt(SinceHeroKey, 0);
            Points = PlayerPrefs.GetInt(PointsKey, 0);
        }

        /// <summary>요청 → (지연) → 응답. 결과는 응답 전에 모두 정해져 있다 — 연출 도중 앱을 껐다 켜도 바뀌지 않는다</summary>
        public IEnumerator Request(GachaTable table, int count, Action<PullResult> done)
        {
            PullResult r = Roll(table, count);
            yield return new WaitForSecondsRealtime(latencySeconds);
            done(r);
        }

        /// <summary>추첨 본체. GachaDemo 의 1,000회 시뮬레이션도 이 함수를 그대로 쓴다</summary>
        public PullResult Roll(GachaTable table, int count)
        {
            var r = new PullResult();
            if (!table.Validate(out string message))
            {
                Debug.LogError($"표시와 추첨이 달라지는 표라 추첨하지 않는다: {message}");
                return r;   // 빈 결과
            }
            for (int k = 0; k < count; k++)
            {
                bool force = table.pityMode == PityMode.Guarantee && SinceHero >= table.pityCount - 1;
                int idx = table.Draw(rnd, force);
                if (force) r.forced.Add(k);
                SinceHero = table.items[idx].grade == Grade.Hero ? 0 : SinceHero + 1;
                Points++;
                r.items.Add(idx);
            }
            r.sinceHero = SinceHero;
            r.points = Points;
            Save();
            if (persistent) Unseen = r;
            return r;
        }

        /// <summary>결과를 끝까지 보여 줬다 (또는 건너뛰었다)</summary>
        public void Acknowledge() => Unseen = null;

        public bool Exchange(GachaTable table)
        {
            if (table.pityMode != PityMode.Exchange || Points < table.pityCount) return false;
            Points -= table.pityCount;
            Save();
            return true;
        }

        void Save()
        {
            if (!persistent) return;
            PlayerPrefs.SetInt(SinceHeroKey, SinceHero);
            PlayerPrefs.SetInt(PointsKey, Points);
        }
    }
}
