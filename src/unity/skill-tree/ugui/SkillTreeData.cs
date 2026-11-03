// 스킬트리 데이터 + 규칙 (순수 C#) — 웹 판 tree.ts 와 같은 표(TSV)를 읽는다. UGUI · UI Toolkit 판이 함께 쓴다.
// 선행 검사 · 습득 · 되돌리기 · 전체 초기화(환불) · 문구 · 팬 · 줌 계산을 화면 코드와 분리해 여기에만 둔다.
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace UIGallery.SkillTree
{
    public enum NodeState { Locked, Available, Acquired, Maxed }
    public enum LearnResult { Ok, Max, Prereq, Points }
    public enum RefundResult { Ok, NotLearned, Needed, ResetOnly }
    /// <summary>연결선: 먼 길 · 반쯤 열림 · 지금 살 수 있음 · 습득 · 빠진 선행 (웹 tree 와 같은 다섯 가지)</summary>
    public enum EdgeState { Locked, Half, Open, Done, Need }

    [Serializable]
    public class SkillNode
    {
        public string id, name, branch, icon, effect;
        public int max, cost;
        public float col, row;
        public string[] req, values;

        public string Effect(int rank) => effect.Replace("{v}", values[Math.Clamp(rank, 1, values.Length) - 1]);
    }

    public class SkillTreeData
    {
        // 열: id · 이름 · 갈래 · 최대 · 선행(쉼표, 없으면 -) · 비용 · 열(x) · 줄(y) · 아이콘 · 효과({v}) · 단계별 수치(/)
        public const string DefaultTsv =
            "id\tname\tbranch\tmax\treq\tcost\tcol\trow\ticon\teffect\tvalues\n" +
            "base\t기본 훈련\tcore\t1\t-\t1\t4\t0\tbadge\t산소 용량 +{v}\t10\n" +
            "stride\t지형 주파\tharin\t3\tbase\t1\t1\t1\tboot\t이동 속도 +{v}%\t4/8/12\n" +
            "scan\t지표 스캔\tharin\t2\tstride\t1\t0\t2\tscan\t스캔 반경 +{v}m\t5/10\n" +
            "o2\t산소 절약\tharin\t3\tstride\t1\t2\t2\ttank\t산소 소모 −{v}%\t5/10/15\n" +
            "cache\t보급 상자 탐지\tharin\t1\tscan,o2\t1\t1\t3\tcrate\t지도에 상자 {v}곳 표시\t3\n" +
            "relay\t중계 안테나\tsera\t2\tbase\t1\t4\t1\tantenna\t통신 거리 +{v}m\t50/100\n" +
            "ping\t위치 핑\tsera\t3\trelay\t1\t3\t2\tping\t핑 표시 +{v}초\t2/4/6\n" +
            "decode\t신호 해독\tsera\t2\trelay\t1\t5\t2\twave\t해독 속도 +{v}%\t15/30\n" +
            "uplink\t궤도 업링크\tsera\t1\tping,decode\t2\t4\t3\torbit\t기지 직통 {v}회\t1\n" +
            "repair\t응급 수리\tdoyun\t3\tbase\t1\t7\t1\twrench\t수리량 +{v}\t10/20/30\n" +
            "coolant\t냉각 순환\tdoyun\t2\trepair\t1\t6\t2\tcell\t냉각 셀 +{v}초\t5/10\n" +
            "plating\t보강 장갑\tdoyun\t3\trepair\t1\t8\t2\tshield\t받는 피해 −{v}%\t4/8/12\n" +
            "drone\t정비 드론\tdoyun\t1\tcoolant,plating\t2\t7\t3\tdrone\t{v}초마다 자동 수리\t8\n" +
            "joint\t합동 탐사\tcore\t1\tcache,uplink\t3\t2.5\t4\tstar\t세 갈래 효과 +{v}%\t10\n";

        /// <summary>기본 표일 때만 쓰는 첫 화면 기록 (표를 바꾸면 빈 트리 · 첫 노드 선택)</summary>
        public static readonly string[] DemoStart = { "base", "stride", "stride", "stride", "scan", "repair" };

        public readonly List<SkillNode> nodes = new();
        readonly Dictionary<string, SkillNode> byId = new();
        public Vector2 extent;   // 가장 큰 열 · 줄

        public SkillNode Get(string id) => byId[id];
        public bool Has(string id) => id != null && byId.ContainsKey(id);
        public string FirstId(bool demo) => demo && Has("scan") ? "scan" : nodes[0].id;

        /// <summary>머리 줄 · 빈 줄 · # 주석은 건너뛰고 칸마다 Trim (엑셀의 "scan, o2"). 없는 선행 id 는 예외</summary>
        public static SkillTreeData Parse(string tsv)
        {
            var data = new SkillTreeData();
            var inv = CultureInfo.InvariantCulture;   // 쉼표 소수점 지역에서도 2.5
            foreach (string raw in tsv.Split('\n'))
            {
                string line = raw.TrimEnd('\r');
                if (line.Trim().Length == 0 || line.StartsWith("#") || line.StartsWith("id\t")) continue;
                string[] c = Array.ConvertAll(line.Split('\t'), s => s.Trim());
                if (c.Length < 11) throw new FormatException($"스킬트리 표: 열이 11개가 아니다 — {line}");
                var n = new SkillNode
                {
                    id = c[0],
                    name = c[1],
                    branch = c[2],
                    max = int.Parse(c[3], inv),
                    req = c[4] == "-" ? Array.Empty<string>() : Array.ConvertAll(c[4].Split(','), s => s.Trim()),
                    cost = int.Parse(c[5], inv),
                    col = float.Parse(c[6], inv),
                    row = float.Parse(c[7], inv),
                    icon = c[8],
                    effect = c[9],
                    values = c[10].Split('/'),
                };
                data.nodes.Add(n);
                data.byId[n.id] = n;
                data.extent = Vector2.Max(data.extent, new Vector2(n.col, n.row));
            }
            if (data.nodes.Count == 0) throw new FormatException("스킬트리 표: 노드가 없다");
            foreach (SkillNode n in data.nodes)
                foreach (string r in n.req)
                    if (!data.byId.ContainsKey(r)) throw new FormatException($"스킬트리 표: {n.id} 의 선행 {r} 가 없다");
            return data;
        }
    }

    /// <summary>팬 · 줌 계산 (UGUI · UI Toolkit 공용). 좌표는 창 왼쪽 위 기준, y 아래로 +</summary>
    public static class TreeMath
    {
        /// <summary>정보 단계 0 멀리 · 1 중간 · 2 가까이</summary>
        public static int Level(float z, float far, float near) => z < far ? 0 : z < near ? 1 : 2;
        public static readonly string[] LevelNames = { "멀리 · 아이콘 + 표식", "중간 · + 단계", "가까이 · + 이름 · 수치" };

        /// <summary>창 점 pivot 아래의 트리 지점이 제자리에 남도록 배율 z → nz 일 때의 이동량</summary>
        public static Vector2 ZoomPan(Vector2 pan, float z, float nz, Vector2 pivot) => pivot - (pivot - pan) / z * nz;

        /// <summary>트리 한쪽 끝이 창 가운데까지만 가게 (웹 panRange)</summary>
        public static Vector2 Clamp(Vector2 pan, float z, Vector2 size, Vector2 view) => new(Range(pan.x, z * size.x, view.x), Range(pan.y, z * size.y, view.y));

        static float Range(float x, float span, float view) => Mathf.Clamp(x, Mathf.Min(view / 2f - span, view / 2f), Mathf.Max(view / 2f - span, view / 2f));

        public static Vector2 Center(float z, Vector2 size, Vector2 view) => (view - size * z) / 2f;

        /// <summary>점 p 를 창 가장자리 m 안쪽으로 들이는 이동량 (EnsureVisible)</summary>
        public static Vector2 Inside(Vector2 p, Vector2 view, float m = 150f) => new(In(p.x, view.x, m), In(p.y, view.y, m));

        static float In(float v, float view, float m) => v < m ? m - v : v > view - m ? view - m - v : 0f;

        /// <summary>툴팁 왼쪽 위: 노드(중심 c, 반지름 r) 오른쪽 → 넘치면 왼쪽 → 창 안으로 고정</summary>
        public static Vector2 Beside(Vector2 c, float r, Vector2 size, Vector2 view)
        {
            float x = c.x + r + 18f;
            if (x + size.x > view.x - 8f) x = c.x - r - 18f - size.x;
            return new(Mathf.Clamp(x, 8f, Mathf.Max(8f, view.x - size.x - 8f)), Mathf.Clamp(c.y - size.y / 2f, 8f, Mathf.Max(8f, view.y - size.y - 8f)));
        }

        public static Color BranchColor(string branch) => branch switch
        {
            "harin" => new Color(0.37f, 0.9f, 0.79f),
            "sera" => new Color(0.56f, 0.72f, 1f),
            "doyun" => new Color(1f, 0.7f, 0.36f),
            _ => new Color(0.91f, 0.93f, 0.96f),
        };
    }

    /// <summary>습득 상태와 규칙. 키보드 · 패드 · 마우스 · 자동 데모가 같은 판정을 쓴다</summary>
    public class SkillProgress
    {
        public readonly SkillTreeData tree;
        public int total;
        public bool resetOnly;   // true 면 전체 초기화만
        readonly Dictionary<string, int> ranks = new();
        readonly List<string> history = new();   // 습득 순서
        readonly List<string> need = new();      // 마지막 습득 시도(NeedFor)의 빠진 선행
        public string NeedFor { get; private set; }

        public event Action Changed;

        public SkillProgress(SkillTreeData tree, int total)
        {
            this.tree = tree;
            this.total = total;
        }

        public int Rank(string id) => ranks.TryGetValue(id, out int k) ? k : 0;
        public int Left => total - Spent;

        public int Spent
        {
            get
            {
                int sum = 0;
                foreach (SkillNode n in tree.nodes) sum += Rank(n.id) * n.cost;
                return sum;
            }
        }

        public bool PrereqMet(SkillNode n)
        {
            foreach (string r in n.req)
                if (Rank(r) == 0) return false;
            return true;
        }

        public NodeState StateOf(SkillNode n)
        {
            int k = Rank(n.id);
            if (k >= n.max) return NodeState.Maxed;
            if (k > 0) return NodeState.Acquired;
            return PrereqMet(n) ? NodeState.Available : NodeState.Locked;
        }

        /// <summary>최대 → 선행 → 포인트 순서 (먼저 풀어야 할 이유부터). missing 에 빠진 선행</summary>
        public LearnResult CheckLearn(string id, List<string> missing = null)
        {
            missing?.Clear();
            if (!tree.Has(id) || Rank(id) >= tree.Get(id).max) return LearnResult.Max;
            SkillNode n = tree.Get(id);
            foreach (string r in n.req)
                if (Rank(r) == 0) missing?.Add(r);
            if (!PrereqMet(n)) return LearnResult.Prereq;
            return Left < n.cost ? LearnResult.Points : LearnResult.Ok;
        }

        /// <summary>마지막 1단계를 빼면 이 노드를 선행으로 쓰는 습득 노드가 고아가 된다 — by 에 그 노드들</summary>
        public RefundResult CheckRefund(string id, List<string> by = null)
        {
            by?.Clear();
            if (resetOnly) return RefundResult.ResetOnly;
            int k = Rank(id), hit = 0;
            if (k == 0) return RefundResult.NotLearned;
            if (k == 1)
                foreach (SkillNode n in tree.nodes)
                    if (Rank(n.id) > 0 && Array.IndexOf(n.req, id) >= 0)
                    {
                        hit++;
                        by?.Add(n.id);
                    }
            return hit > 0 ? RefundResult.Needed : RefundResult.Ok;
        }

        void Add(string id)
        {
            ranks[id] = Rank(id) + 1;
            history.Add(id);
        }

        /// <summary>선행이 빠졌으면 NeedFor · need 에 기억해 연결선을 빨갛게 그리게 한다</summary>
        public LearnResult Learn(string id)
        {
            LearnResult r = CheckLearn(id, need);
            bool had = NeedFor != null;
            NeedFor = r == LearnResult.Prereq ? id : null;
            if (r == LearnResult.Ok) Add(id);
            if (r == LearnResult.Ok || NeedFor != null || had) Changed?.Invoke();
            return r;
        }

        public RefundResult Refund(string id, List<string> by = null)
        {
            RefundResult r = CheckRefund(id, by);
            if (r != RefundResult.Ok) return r;
            history.RemoveAt(history.LastIndexOf(id));
            if (--ranks[id] == 0) ranks.Remove(id);
            NeedFor = null;
            Changed?.Invoke();
            return r;
        }

        /// <summary>전체 초기화 — 돌려받은 포인트(= 쓴 포인트 전부)</summary>
        public int ResetAll()
        {
            int back = Spent;
            Replay(Array.Empty<string>());
            return back;
        }

        /// <summary>시작 상태: 기록을 습득 규칙대로 다시 쌓는다. 표에 없는 id · 규칙에 걸리는 단계는 건너뛴다</summary>
        public void Replay(IEnumerable<string> ids)
        {
            ranks.Clear();
            history.Clear();
            foreach (string id in ids)
                if (CheckLearn(id) == LearnResult.Ok) Add(id);
            NeedFor = null;
            Changed?.Invoke();
        }

        public void ClearNeed()
        {
            if (NeedFor == null) return;
            NeedFor = null;
            Changed?.Invoke();
        }

        public EdgeState EdgeOf(SkillNode a, SkillNode b)
        {
            bool from = Rank(a.id) > 0;
            if (from && Rank(b.id) > 0) return EdgeState.Done;
            if (NeedFor == b.id && need.Contains(a.id)) return EdgeState.Need;
            if (from && CheckLearn(b.id) == LearnResult.Ok) return EdgeState.Open;
            return from ? EdgeState.Half : EdgeState.Locked;
        }

        /* ───── 문구 — 두 화면이 같은 문장을 쓰게 ───── */

        static readonly string[] StateNames = { "잠김", "습득 가능", "습득", "최대" };

        string Names(List<string> ids) => string.Join(" · ", ids.ConvertAll(id => tree.Get(id).name));

        public string LearnMessage(string id, LearnResult r)
        {
            if (!tree.Has(id)) return "";
            SkillNode n = tree.Get(id);
            return r switch
            {
                LearnResult.Ok => $"{n.name} {Rank(id)}/{n.max} 습득 — {n.Effect(Rank(id))} · 포인트 −{n.cost}",
                LearnResult.Prereq => $"잠김 — 먼저 {Names(need)} 습득",
                LearnResult.Points => $"포인트 부족 — {n.cost} 필요, 남은 {Left}",
                _ => $"이미 최대 단계 — {n.name} {n.max}/{n.max}",
            };
        }

        public string RefundMessage(string id, RefundResult r, List<string> by) => r switch
        {
            RefundResult.Ok => $"{tree.Get(id).name} 되돌림 — 포인트 +{tree.Get(id).cost}",
            RefundResult.Needed => $"되돌릴 수 없다 — {Names(by)} 이(가) 이 노드를 선행으로 쓴다",
            RefundResult.ResetOnly => "이 규칙은 한 단계씩 되돌릴 수 없다 — 전체 초기화만",
            _ => "아직 습득하지 않은 노드",
        };

        public string TooltipTitle(string id)
        {
            SkillNode n = tree.Get(id);
            return $"{n.name}  <size=80%>{StateNames[(int)StateOf(n)]} {Rank(id)}/{n.max}</size>";
        }

        /// <summary>지금 효과 · 다음 단계 수치와 비용 · 필요한 선행(✓ ✗). 리치 텍스트</summary>
        public string TooltipBody(string id)
        {
            SkillNode n = tree.Get(id);
            int k = Rank(id);
            string text = (k > 0 ? $"현재 {n.Effect(k)}" : "아직 습득하지 않음") + "\n" +
                          (k < n.max ? $"다음 단계 <b>{n.Effect(k + 1)}</b> · 비용 {n.cost}" : "최대 단계");
            if (n.req.Length == 0) return text;
            text += n.req.Length > 1 ? "\n필요한 선행 (모두)  " : "\n필요한 선행  ";
            foreach (string r in n.req)
                text += (Rank(r) > 0 ? "<color=#7be3a7>✓ " : "<color=#ff8a99>✗ ") + tree.Get(r).name + "</color>  ";
            return text;
        }

        public string RankLabel(SkillNode n)
        {
            NodeState s = StateOf(n);
            return s == NodeState.Locked ? "잠김" : s == NodeState.Maxed ? $"최대 {n.max}/{n.max}" : $"{Rank(n.id)}/{n.max}";
        }

        public string NextLabel(SkillNode n)
        {
            NodeState s = StateOf(n);
            return s == NodeState.Maxed ? n.Effect(n.max) : s == NodeState.Locked ? "선행 필요" : $"→ {n.Effect(Rank(n.id) + 1)}";
        }

        /// <summary>지금 살 수 있는 노드 하나 (자동 데모 · 시험 입력). 없으면 null</summary>
        public string FirstLearnable()
        {
            foreach (SkillNode n in tree.nodes)
                if (CheckLearn(n.id) == LearnResult.Ok) return n.id;
            return null;
        }
    }
}
