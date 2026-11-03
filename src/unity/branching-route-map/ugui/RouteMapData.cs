// 분기 경로 맵 — 지도 데이터와 생성기 (순수 C#, MonoBehaviour 아님). UGUI · UI Toolkit 두 판이 함께 쓴다.
// 웹 판 map.ts 와 한 줄씩 같은 알고리즘이다. 난수 호출 순서까지 같아서 같은 시드면 같은 지도(같은 지문)가 나온다.
using System;
using System.Collections.Generic;

namespace UIGallery.BranchingRouteMap
{
    /// <summary>순서가 지문 계산에 들어간다 — 웹 판 KINDS 배열과 같은 순서</summary>
    public enum NodeKind { Fight, Elite, Rest, Shop, Loot, Signal, Goal }

    public enum MapMix { Balanced, Danger, Supply, Unknown }

    /// <summary>
    /// mulberry32 — 상태 32비트 하나짜리 작은 시드 난수기. UnityEngine.Random 은 전역 상태라
    /// 다른 코드가 한 번만 불러도 지도가 바뀐다. 지도 전용 난수기를 따로 둔다.
    /// </summary>
    public class Mulberry32
    {
        uint state;

        public Mulberry32(int seed) => state = unchecked((uint)seed);

        /// <summary>0 이상 1 미만. JS 의 Math.imul · &gt;&gt;&gt; 와 같은 비트 연산 (uint 곱셈은 2^32 로 감긴다)</summary>
        public double Next()
        {
            unchecked
            {
                state += 0x6D2B79F5u;
                uint t = state;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        public int Range(int n) => (int)Math.Floor(Next() * n);
    }

    [Serializable]
    public class MapNode
    {
        public int id, floor, col;
        public NodeKind kind;
        public List<int> next = new();
        public List<int> prev = new();
        /// <summary>배치 흔들림 −0.5~0.5 (같은 난수기에서 뽑는다)</summary>
        public float jx, jy;
    }

    [Serializable]
    public class RouteMapData
    {
        /// <summary>종류 비율 — Fight, Elite, Rest, Shop, Loot, Signal (Loot 는 중간 층에만 고정 배정)</summary>
        static readonly int[][] Weights =
        {
            new[] { 45, 10, 12, 8, 0, 22 },   // Balanced
            new[] { 38, 30, 6, 5, 0, 18 },    // Danger
            new[] { 34, 4, 18, 22, 0, 18 },   // Supply
            new[] { 24, 8, 10, 6, 0, 52 },    // Unknown
        };
        public const int EliteFrom = 4;   // 0~3층에는 강적 없음

        public int seed, floors, cols, paths;
        public MapMix mix;
        public List<MapNode> nodes = new();
        public int goalId;
        public string print;

        [NonSerialized] Dictionary<int, MapNode> byId;

        public MapNode Get(int id)
        {
            if (byId == null)
            {
                byId = new Dictionary<int, MapNode>();
                foreach (MapNode n in nodes) byId[n.id] = n;
            }
            return byId.TryGetValue(id, out MapNode m) ? m : null;
        }

        public static string MixName(MapMix m) => m.ToString().ToLowerInvariant();   // 저장 JSON 의 "balanced" 등

        public static RouteMapData Generate(int seed, int floors, int cols, int paths, MapMix mix, bool preventCross = true)
        {
            var rng = new Mulberry32(seed);
            int F = floors, C = cols;
            var edge = new HashSet<int>[F, C];
            var used = new bool[F, C];
            for (int f = 0; f < F; f++)
                for (int c = 0; c < C; c++) edge[f, c] = new HashSet<int>();

            // (1) 경로 긋기: 시작 열에서 한 층씩 위로, 이웃 열(−1 · 0 · +1)로만
            int firstStart = -1;
            var cands = new List<int>(3);
            for (int p = 0; p < paths; p++)
            {
                int c = rng.Range(C);
                if (p == 1 && C > 1 && c == firstStart) c = (c + 1 + rng.Range(C - 1)) % C;   // 처음 두 경로는 다른 열에서
                if (p == 0) firstStart = c;
                used[0, c] = true;
                for (int f = 0; f < F - 1; f++)
                {
                    cands.Clear();
                    for (int d = -1; d <= 1; d++)
                    {
                        int n = c + d;
                        if (n < 0 || n >= C) continue;
                        // 교차 검사: 오른쪽 위로 가려는데 오른쪽 노드가 왼쪽 위로 내려온 간선이 있으면 X 자로 엇갈린다
                        if (preventCross && ((d == 1 && edge[f, c + 1].Contains(c)) || (d == -1 && edge[f, c - 1].Contains(c)))) continue;
                        cands.Add(n);
                    }
                    int next = cands[rng.Range(cands.Count)];   // 곧장 위(d = 0)는 교차하지 않아 후보가 비지 않는다
                    edge[f, c].Add(next);
                    used[f + 1, next] = true;
                    c = next;
                }
            }

            // 노드 목록: 층 오름차순, 열 오름차순
            var map = new RouteMapData { seed = seed, floors = F, cols = C, paths = paths, mix = mix, goalId = F * C };
            for (int f = 0; f < F; f++)
                for (int c = 0; c < C; c++)
                {
                    if (!used[f, c]) continue;
                    var node = new MapNode { id = f * C + c, floor = f, col = c, kind = NodeKind.Fight };
                    if (f == F - 1) node.next.Add(map.goalId);
                    else
                    {
                        var cs = new List<int>(edge[f, c]);
                        cs.Sort();
                        foreach (int n in cs) node.next.Add((f + 1) * C + n);
                    }
                    map.nodes.Add(node);
                }
            map.nodes.Add(new MapNode { id = map.goalId, floor = F, col = (C - 1) / 2, kind = NodeKind.Goal });
            foreach (MapNode n in map.nodes)
                foreach (int m in n.next) map.Get(m).prev.Add(n.id);

            // (2) 종류 배정: 고정 층 + 비율에서 제약에 걸리는 종류를 뺀 가중 추첨 (노드마다 난수 1회)
            int mid = F / 2;
            foreach (MapNode n in map.nodes)
            {
                if (n.kind == NodeKind.Goal) continue;
                if (n.floor == 0) n.kind = NodeKind.Fight;
                else if (n.floor == F - 1) n.kind = NodeKind.Rest;   // 최종 목표 바로 앞은 정비 보장
                else if (n.floor == mid) n.kind = NodeKind.Loot;     // 중간 층은 회수
                else
                {
                    var w = (int[])Weights[(int)mix].Clone();
                    if (n.floor < EliteFrom) w[(int)NodeKind.Elite] = 0;
                    if (n.floor == F - 2) w[(int)NodeKind.Rest] = 0;   // 다음 층이 정비라 연달아 나오지 않게
                    foreach (int pid in n.prev)
                    {
                        NodeKind pk = map.Get(pid).kind;
                        if (pk == NodeKind.Elite || pk == NodeKind.Rest || pk == NodeKind.Shop) w[(int)pk] = 0;   // 같은 경로에서 연달아 금지
                    }
                    int sum = 0;
                    foreach (int x in w) sum += x;
                    double r = rng.Next() * sum;
                    int k = 0;
                    for (; k < w.Length - 1; k++)
                    {
                        if (r < w[k]) break;
                        r -= w[k];
                    }
                    n.kind = sum > 0 ? (NodeKind)k : NodeKind.Fight;
                }
            }

            // (3) 배치 흔들림
            foreach (MapNode n in map.nodes)
            {
                if (n.kind == NodeKind.Goal) continue;
                n.jx = (float)(rng.Next() - 0.5);
                n.jy = (float)(rng.Next() - 0.5);
            }

            map.print = Fingerprint(map);
            return map;
        }

        /// <summary>FNV-1a 32비트 — 웹 판 화면의 '지문' 과 같은 값이 나오면 두 구현이 같은 지도를 만든 것</summary>
        static string Fingerprint(RouteMapData m)
        {
            uint h = 2166136261u;
            void Mix(int v)
            {
                unchecked
                {
                    h ^= (uint)v;
                    h *= 16777619u;
                }
            }
            Mix(m.floors);
            Mix(m.cols);
            Mix(m.paths);
            foreach (MapNode n in m.nodes)
            {
                Mix(n.id);
                Mix((int)n.kind);
                foreach (int x in n.next) Mix(x);
                Mix(-1);
            }
            return h.ToString("X8");
        }

        /// <summary>지금 갈 수 있는 노드 — 출발 전이면 0층 전부, 아니면 현재 노드의 다음</summary>
        public List<int> Reachable(List<int> path)
        {
            if (path.Count == 0) return nodes.FindAll(n => n.floor == 0).ConvertAll(n => n.id);
            return Get(path[^1]).next;
        }

        /// <summary>불러온 길이 이 지도에서 실제로 이어지는가 (지문이 같아도 길은 따로 검사한다)</summary>
        public bool ValidPath(List<int> path)
        {
            for (int i = 0; i < path.Count; i++)
            {
                MapNode n = Get(path[i]);
                if (n == null) return false;
                if (i == 0 ? n.floor != 0 : !Get(path[i - 1]).next.Contains(n.id)) return false;
            }
            return true;
        }
    }

    /// <summary>저장 형식 — 지도는 저장하지 않는다. 생성 입력과 지나온 길만. 웹 판 JSON 과 필드 순서까지 같다</summary>
    [Serializable]
    public class RunSave
    {
        public int seed;
        public int floors;
        public int cols;
        public int paths;
        public string mix;
        public int at;
        public List<int> path = new();
    }
}
