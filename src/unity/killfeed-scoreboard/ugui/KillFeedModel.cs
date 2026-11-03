// 킬 피드 + 스코어보드 — 화면을 모르는 순수 C# 모델 (MonoBehaviour 아님).
//  MatchState : 선수 기록 · 팀 점수 · 정렬    FeedQueue : 최대 줄 수 · 유지 시간 · 합치기 · 속도 조절
// UGUI · UI Toolkit 두 뷰가 함께 쓴다. 웹 판 model.ts 와 같은 규칙이다.
using System;
using System.Collections.Generic;

namespace UIGallery.KillfeedScoreboard
{
    public enum Team { Orbit, Surface }
    public enum Weapon { Pulse, Scatter, Longshot, Shock, Baton, Boundary }
    public enum SortKey { Score, Takedowns, JoinOrder }
    public enum Involvement { None, Attacker, Victim }

    [Serializable]
    public class PlayerStats
    {
        public string displayName;
        public Team team;
        public ushort netId;          // 네트워크 선수 번호
        public bool isMe;
        public int joinOrder;
        public int takedowns, assists, outs, precisionHits, ping;

        /// <summary>점수 = 제압 100 + 지원 50 + 정밀 타격 25</summary>
        public int Score => takedowns * 100 + assists * 50 + precisionHits * 25;
        public PlayerStats Clone() => (PlayerStats)MemberwiseClone();
    }

    /// <summary>UI 가 쓰는 이벤트 — 선수는 MatchState.players 의 인덱스, -1 = 없음(환경)</summary>
    public struct KillEvent
    {
        public int attacker, victim, assist;
        public Weapon weapon;
        public bool precision;
    }

    public class MatchState
    {
        public readonly List<PlayerStats> players = new();
        readonly List<PlayerStats> seed;
        public int winScore;                 // 팀 제압 수 (개인 점수가 아님)
        readonly int[] bonus = new int[2];   // 경계 밖 이탈로 상대 팀이 얻은 제압 수
        public event Action Changed;

        public MatchState(List<PlayerStats> roster, int winScore)
        {
            seed = roster;
            this.winScore = winScore;
            Reset();
        }

        public void Reset()
        {
            players.Clear();
            foreach (PlayerStats p in seed) players.Add(p.Clone());
            bonus[0] = bonus[1] = 0;
            Changed?.Invoke();
        }

        public int TeamScore(Team t)
        {
            int n = bonus[(int)t];
            foreach (PlayerStats p in players) if (p.team == t) n += p.takedowns;
            return n;
        }

        public int Remaining(Team t) => Math.Max(0, winScore - TeamScore(t));

        public PlayerStats Get(int i) => i >= 0 && i < players.Count ? players[i] : null;

        public void Apply(KillEvent e)
        {
            PlayerStats v = Get(e.victim);
            if (v == null) return;
            v.outs++;
            PlayerStats a = Get(e.attacker);
            if (a != null)
            {
                a.takedowns++;
                if (e.precision) a.precisionHits++;
            }
            else bonus[v.team == Team.Orbit ? 1 : 0]++;
            PlayerStats s = Get(e.assist);
            if (s != null) s.assists++;
            Changed?.Invoke();
        }

        /// <summary>한 팀을 정렬해 into 에 채운다. 점수가 같으면 제압 → 들어온 순서 (동점끼리 매번 자리가 바뀌지 않게)</summary>
        public void Sorted(Team t, SortKey key, List<PlayerStats> into)
        {
            into.Clear();
            foreach (PlayerStats p in players) if (p.team == t) into.Add(p);
            into.Sort((a, b) =>
            {
                int c = key switch
                {
                    SortKey.Score => b.Score.CompareTo(a.Score),
                    SortKey.Takedowns => b.takedowns.CompareTo(a.takedowns),
                    _ => 0,
                };
                if (c == 0 && key != SortKey.JoinOrder) c = b.takedowns.CompareTo(a.takedowns);
                return c != 0 ? c : a.joinOrder.CompareTo(b.joinOrder);
            });
        }
    }

    /// <summary>피드 한 줄 (합치면 victims 가 늘어난다)</summary>
    public class FeedRow
    {
        public int uid;
        public int attacker;
        public readonly List<int> victims = new();
        public Weapon weapon;
        public bool precision;
        public Involvement mine;
        public float life, left;
        public bool leaving;          // 최대 줄 수에 밀려 빨리 사라지는 중
        public float lastAt;
        public int Count => victims.Count;
    }

    public class FeedQueue
    {
        public int maxRows = 5;
        public float displaySeconds = 5f;
        public float mergeWindow = 1.5f;      // 같은 가해자 · 같은 무기를 한 줄로 합치는 시간 창. 0 = 합치지 않음
        public float paceSeconds = 0.22f;     // 새 줄 사이 기본 간격 (대기가 길면 0.08초까지). 0 = 받는 즉시
        public float mineLifeScale = 1.5f;
        public const float ExitSeconds = 0.22f, FadeSeconds = 0.45f;

        public readonly List<FeedRow> rows = new();      // 보이는 줄, 오래된 것이 앞(맨 위)
        public readonly List<FeedRow> pending = new();   // 간격을 기다리는 줄
        public int merged, pushedOut;
        public event Action<FeedRow> RowShown, RowMerged, RowRemoved;

        float now, gap;
        int uid;

        public void Push(KillEvent e, int me)
        {
            Involvement mine = e.attacker == me ? Involvement.Attacker : e.victim == me ? Involvement.Victim : Involvement.None;
            if (mergeWindow > 0f && e.attacker >= 0 && TryMerge(e, mine != Involvement.None)) return;
            float life = displaySeconds * (mine != Involvement.None ? mineLifeScale : 1f);
            var row = new FeedRow { uid = ++uid, attacker = e.attacker, weapon = e.weapon, precision = e.precision, mine = mine, life = life, left = life, lastAt = now };
            row.victims.Add(e.victim);
            if (paceSeconds > 0f && (pending.Count > 0 || gap > 0f)) pending.Add(row);
            else Show(row);
        }

        bool TryMerge(KillEvent e, bool mine)
        {
            FeedRow t = Find(pending, e, mine) ?? Find(rows, e, mine);
            if (t == null) return false;
            t.victims.Add(e.victim);
            t.precision |= e.precision;
            t.lastAt = now;
            t.life = t.left = displaySeconds * (t.mine != Involvement.None ? mineLifeScale : 1f);
            merged++;
            if (rows.Contains(t)) RowMerged?.Invoke(t);
            return true;
        }

        // 내 소식은 남의 줄에 합치지 않는다
        FeedRow Find(List<FeedRow> list, KillEvent e, bool mine)
        {
            foreach (FeedRow r in list)
                if (!r.leaving && r.attacker == e.attacker && r.weapon == e.weapon && (!mine || r.mine != Involvement.None) && now - r.lastAt <= mergeWindow) return r;
            return null;
        }

        void Show(FeedRow r)
        {
            rows.Add(r);
            // 대기가 길수록 간격을 줄인다 (최소 0.08초)
            gap = paceSeconds > 0f ? Math.Max(0.08f, paceSeconds - 0.03f * pending.Count) : 0f;
            RowShown?.Invoke(r);
            Cap();
        }

        // 넘치면 내 줄이 아닌 줄을 lastAt 이 오래된 순으로. 모두 내 줄일 때만 내 줄을
        void Cap()
        {
            int live = 0;
            foreach (FeedRow r in rows) if (!r.leaving) live++;
            for (; live > maxRows; live--)
            {
                FeedRow pick = null;
                foreach (FeedRow r in rows)
                    if (!r.leaving && (pick == null || Before(r, pick))) pick = r;
                pick.leaving = true;
                pick.left = Math.Min(pick.left, ExitSeconds);
                pushedOut++;
            }
        }

        static bool Before(FeedRow a, FeedRow b) => (a.mine == 0) != (b.mine == 0) ? a.mine == 0 : a.lastAt < b.lastAt;

        public void Tick(float dt)
        {
            now += dt;
            if (gap > 0f) gap -= dt;
            if (gap <= 0f && pending.Count > 0)
            {
                FeedRow r = pending[0];
                pending.RemoveAt(0);
                Show(r);
            }
            for (int i = rows.Count - 1; i >= 0; i--)
            {
                rows[i].left -= dt;
                if (rows[i].left > 0f) continue;
                FeedRow gone = rows[i];
                rows.RemoveAt(i);
                RowRemoved?.Invoke(gone);
            }
        }

        /// <summary>CanvasGroup.alpha 에 그대로 넣는 값 — 밀려난 줄은 0.22초, 수명이 다한 줄은 마지막 0.45초 동안 흐려진다</summary>
        public float Alpha(FeedRow r) => Math.Clamp(r.leaving ? r.left / ExitSeconds : r.left / FadeSeconds, 0f, 1f);

        public void Clear()
        {
            foreach (FeedRow r in rows) RowRemoved?.Invoke(r);
            rows.Clear();
            pending.Clear();
            merged = pushedOut = 0;
        }
    }
}
