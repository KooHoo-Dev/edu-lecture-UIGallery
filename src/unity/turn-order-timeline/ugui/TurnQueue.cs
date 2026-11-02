// 전투 큐 (모델) — 화면을 모르는 순수 C#. 행동값 = 남은 거리 ÷ 속도 로 다음 N 차례를 계산한다.
// UGUI 판(TimelineView)과 UI Toolkit 판(TurnOrderUITK)이 이 파일을 함께 쓴다. 뷰는 Preview() 결과만 그린다.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.TurnOrderTimeline
{
    public enum UnitRole { Ally, Enemy }

    /// <summary>유닛 하나의 설정 (인스펙터에서 채운다)</summary>
    [Serializable]
    public class UnitSetup
    {
        public string id = "harin";
        public string displayName = "하린";
        public UnitRole role = UnitRole.Ally;
        [Tooltip("속도 — 클수록 자주 행동한다. 행동값 = 10000 ÷ 속도")]
        public float speed = 105f;
    }

    /// <summary>Active = 지금 행동 중 · Extra = 끼어들기(추가 행동) · Turn = 정규 차례</summary>
    public enum EntryKind { Active, Extra, Turn }

    /// <summary>미리보기 한 칸. key 는 같은 차례면 큐가 바뀌어도 같다 — 뷰가 같은 초상을 미끄러뜨리는 근거</summary>
    public readonly struct TurnEntry
    {
        public readonly string key;
        public readonly int unit;
        /// <summary>지금부터 이 차례까지 남은 행동값</summary>
        public readonly float actionValue;
        public readonly EntryKind kind;
        public readonly bool extra;

        public TurnEntry(string key, int unit, float actionValue, EntryKind kind, bool extra)
        {
            this.key = key;
            this.unit = unit;
            this.actionValue = actionValue;
            this.kind = kind;
            this.extra = extra;
        }
    }

    public class TurnQueue
    {
        /// <summary>모두가 달리는 기준 거리</summary>
        public const float Distance = 10000f;

        public class Unit
        {
            public UnitSetup setup;
            public float speed;
            /// <summary>남은 거리 (Distance → 0)</summary>
            public float dist;
            /// <summary>지금까지 시작한 정규 차례 수 — key(id:번호)를 만든다</summary>
            public int turns;
            /// <summary>속도 변화가 남은 차례 수 (0 = 없음)</summary>
            public int modTurns;
            public float modPct;

            public float ActionValue => dist / speed;
            public Unit Clone() => (Unit)MemberwiseClone();
        }

        /// <summary>순서에 영향을 주는 값이 바뀌었다 — 뷰는 이것만 구독한다</summary>
        public event Action Changed;

        public IReadOnlyList<Unit> Units => units;
        public float Elapsed { get; private set; }
        /// <summary>지금 행동 중인 유닛 번호 (없으면 −1)</summary>
        public int ActiveUnit { get; private set; } = -1;
        public bool ActiveIsExtra { get; private set; }
        public string ActiveKey { get; private set; } = "";
        public int ExtraCount => extras.Count;

        readonly List<Unit> units = new();
        readonly List<Unit> sim = new();
        readonly List<(string key, int unit)> extras = new();
        int extraSeq;

        public TurnQueue(IEnumerable<UnitSetup> setups)
        {
            foreach (UnitSetup s in setups) units.Add(new Unit { setup = s });
            Reset();
        }

        public void Reset()
        {
            foreach (Unit u in units)
            {
                u.speed = u.setup.speed;
                u.dist = Distance;
                u.turns = u.modTurns = 0;
                u.modPct = 0f;
            }
            extras.Clear();
            extraSeq = 0;
            Elapsed = 0f;
            Begin();
            Changed?.Invoke();
        }

        /// <summary>다음 행동자를 정한다. 끼어들기가 있으면 시간이 흐르지 않고 먼저</summary>
        void Begin()
        {
            if (extras.Count > 0)
            {
                (string key, int unit) x = extras[0];
                extras.RemoveAt(0);
                ActiveUnit = x.unit;
                ActiveKey = x.key;
                ActiveIsExtra = true;
                return;
            }
            int next = PickNext(units);
            float t = units[next].ActionValue;
            foreach (Unit u in units) u.dist = Mathf.Max(0f, u.dist - u.speed * t);   // 모두에게서 같은 시간이 흐른다
            units[next].dist = 0f;
            Elapsed += t;
            units[next].turns++;
            ActiveUnit = next;
            ActiveKey = $"{units[next].setup.id}:{units[next].turns}";
            ActiveIsExtra = false;
        }

        /// <summary>지금 차례를 끝낸다. 정규 차례면 그 유닛만 거리를 Distance 로 되돌리고 속도 변화를 한 차례 줄인다</summary>
        public void EndTurn()
        {
            if (ActiveUnit >= 0 && !ActiveIsExtra) Finish(units[ActiveUnit]);
            Begin();
            Changed?.Invoke();
        }

        /// <summary>속도 변화 (pct = 0.4 → 40% 빨라짐). 남은 거리는 그대로라 행동값만 바뀌고, 이후 차례 간격도 바뀐다</summary>
        public void SetSpeedMod(int unit, float pct, int turns)
        {
            Unit u = units[unit];
            u.modPct = pct;
            // 지금 행동 중인 유닛이면 이번 차례가 끝날 때 바로 사라지지 않게 한 차례 더 센다
            u.modTurns = turns + (unit == ActiveUnit && !ActiveIsExtra ? 1 : 0);
            u.speed = Mathf.Max(1f, Mathf.Round(u.setup.speed * (1f + pct)));
            Changed?.Invoke();
        }

        /// <summary>행동 앞당김(pct &gt; 0) · 지연(pct &lt; 0). 남은 거리를 기준 거리의 pct 만큼 — 다음 한 차례만 바뀐다</summary>
        public void ShiftAction(int unit, float pct)
        {
            Unit u = units[unit];
            u.dist = Mathf.Clamp(u.dist - Distance * pct, 0f, Distance * 2f);
            Changed?.Invoke();
        }

        /// <summary>끼어들기(추가 행동). 지금 차례가 끝나면 바로 — 정규 차례와 남은 거리는 건드리지 않는다</summary>
        public void AddExtra(int unit)
        {
            extras.Add(($"x{++extraSeq}", unit));
            Changed?.Invoke();
        }

        public bool HasPendingExtra(int unit)
        {
            if (ActiveIsExtra && ActiveUnit == unit) return true;
            foreach ((string key, int u) x in extras)
                if (x.u == unit) return true;
            return false;
        }

        /// <summary>지금 차례 + 앞으로 n 개. 정규 차례는 복사본으로 시간을 흘려 계산한다 (원본을 건드리면 실제 전투가 틀어진다)</summary>
        public void Preview(int n, List<TurnEntry> result)
        {
            result.Clear();
            if (ActiveUnit >= 0) result.Add(new TurnEntry(ActiveKey, ActiveUnit, 0f, EntryKind.Active, ActiveIsExtra));
            foreach ((string key, int unit) x in extras)
            {
                if (result.Count > n) break;
                result.Add(new TurnEntry(x.key, x.unit, 0f, EntryKind.Extra, true));
            }
            sim.Clear();
            foreach (Unit u in units) sim.Add(u.Clone());
            if (ActiveUnit >= 0 && !ActiveIsExtra) Finish(sim[ActiveUnit]);
            float t = 0f;
            while (result.Count <= n)
            {
                int next = PickNext(sim);
                float dt = sim[next].ActionValue;
                foreach (Unit u in sim) u.dist = Mathf.Max(0f, u.dist - u.speed * dt);
                t += dt;
                sim[next].turns++;
                result.Add(new TurnEntry($"{sim[next].setup.id}:{sim[next].turns}", next, t, EntryKind.Turn, false));
                Finish(sim[next]);
            }
        }

        /// <summary>미리보기에서 이 유닛의 다음 정규 차례 순번 (지금 차례 = 0, 없으면 −1)</summary>
        public static int FirstIndex(List<TurnEntry> entries, int unit)
        {
            for (int i = 0; i < entries.Count; i++)
                if (entries[i].unit == unit && entries[i].kind == EntryKind.Turn) return i;
            return -1;
        }

        void Finish(Unit u)
        {
            u.dist = Distance;
            if (u.modTurns > 0 && --u.modTurns == 0)
            {
                u.speed = u.setup.speed;
                u.modPct = 0f;
            }
        }

        /// <summary>행동값이 가장 작은 유닛. 같으면 목록 앞쪽이 먼저</summary>
        static int PickNext(List<Unit> list)
        {
            int best = 0;
            for (int i = 1; i < list.Count; i++)
                if (list[i].ActionValue < list[best].ActionValue - 1e-4f) best = i;
            return best;
        }
    }
}
