// 스킬트리 데이터 + 규칙 (순수 C#, MonoBehaviour 아님) — 웹 판 tree.ts 와 같은 표(TSV)를 읽는다.
// 엑셀 · 구글 시트에서 한 줄에 노드 하나로 짠 표를 탭 구분 텍스트로 저장해 TextAsset 으로 넣거나, 아래 DefaultTsv 를 쓴다.
// 선행 검사 · 습득 · 되돌리기 · 전체 초기화(환불)는 화면 코드와 분리해 여기에만 둔다 — UGUI · UI Toolkit 판이 함께 쓴다.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace UIGallery.SkillTree
{
    public enum NodeState { Locked, Available, Acquired, Maxed }
    public enum LearnResult { Ok, Max, Prereq, Points }
    public enum RefundResult { Ok, NotLearned, Needed, ResetOnly }

    [Serializable]
    public class SkillNode
    {
        public string id, name, branch, icon, effect;
        public int max, cost;
        public float col, row;
        public string[] req, values;

        /// <summary>rank 단계의 효과 문장 ("이동 속도 +{v}%" → "이동 속도 +8%"). rank 0 이면 1단계 수치</summary>
        public string Effect(int rank) => effect.Replace("{v}", values[Math.Clamp(rank, 1, values.Length) - 1]);
    }

    public class SkillTreeData
    {
        // 열: id · 이름 · 갈래 · 최대 단계 · 선행(쉼표, 없으면 -) · 단계당 비용 · 열(x) · 줄(y) · 아이콘 · 효과({v} 자리) · 단계별 수치(/)
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

        public readonly List<SkillNode> nodes = new();
        readonly Dictionary<string, SkillNode> byId = new();

        public SkillNode Get(string id) => byId[id];
        public bool Has(string id) => id != null && byId.ContainsKey(id);

        /// <summary>표 → 노드. 머리 줄 · 빈 줄 · # 주석은 건너뛴다. 없는 선행 id 는 예외 (표를 잘못 붙여 넣은 경우)</summary>
        public static SkillTreeData Parse(string tsv)
        {
            var data = new SkillTreeData();
            var inv = CultureInfo.InvariantCulture;   // 쉼표 소수점 지역 설정에서도 2.5 를 읽게
            foreach (string raw in tsv.Split('\n'))
            {
                string line = raw.TrimEnd('\r');
                if (line.Trim().Length == 0 || line.StartsWith("#") || line.StartsWith("id\t")) continue;
                string[] c = line.Split('\t');
                if (c.Length < 11) throw new FormatException($"스킬트리 표: 열이 11개가 아니다 — {line}");
                var n = new SkillNode
                {
                    id = c[0].Trim(),
                    name = c[1],
                    branch = c[2],
                    max = int.Parse(c[3], inv),
                    req = c[4] == "-" ? Array.Empty<string>() : c[4].Split(','),
                    cost = int.Parse(c[5], inv),
                    col = float.Parse(c[6], inv),
                    row = float.Parse(c[7], inv),
                    icon = c[8],
                    effect = c[9],
                    values = c[10].Split('/'),
                };
                data.nodes.Add(n);
                data.byId[n.id] = n;
            }
            foreach (SkillNode n in data.nodes)
                foreach (string r in n.req)
                    if (!data.byId.ContainsKey(r)) throw new FormatException($"스킬트리 표: {n.id} 의 선행 {r} 가 없다");
            return data;
        }
    }

    /// <summary>
    /// 습득 상태(노드별 단계)와 규칙. 화면은 여기에 묻고 결과를 그리기만 한다 — 키보드 · 패드 · 마우스 · 자동 데모가 같은 판정을 쓴다.
    /// </summary>
    public class SkillProgress
    {
        public readonly SkillTreeData tree;
        public int total;
        /// <summary>true 면 한 단계씩 되돌리기 없이 전체 초기화만</summary>
        public bool resetOnly;
        readonly Dictionary<string, int> ranks = new();
        readonly List<string> history = new();   // 습득 순서 (마지막 습득 되돌리기용)

        public event Action Changed;

        public SkillProgress(SkillTreeData tree, int total)
        {
            this.tree = tree;
            this.total = total;
        }

        public int Rank(string id) => ranks.TryGetValue(id, out int k) ? k : 0;
        public int Left => total - Spent;
        public string LastLearned => history.Count > 0 ? history[^1] : null;

        public int Spent
        {
            get
            {
                int sum = 0;
                foreach (SkillNode n in tree.nodes) sum += Rank(n.id) * n.cost;
                return sum;
            }
        }

        /// <summary>선행 조건: 선행 노드가 모두 1단계 이상</summary>
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

        /// <summary>최대 → 선행 → 포인트 순서로 본다 (플레이어가 먼저 풀어야 할 이유부터). missing 에 빠진 선행 id</summary>
        public LearnResult CheckLearn(string id, List<string> missing = null)
        {
            SkillNode n = tree.Get(id);
            missing?.Clear();
            if (Rank(id) >= n.max) return LearnResult.Max;
            bool met = true;
            foreach (string r in n.req)
                if (Rank(r) == 0)
                {
                    met = false;
                    missing?.Add(r);
                }
            if (!met) return LearnResult.Prereq;
            return Left < n.cost ? LearnResult.Points : LearnResult.Ok;
        }

        /// <summary>마지막 1단계를 빼면 이 노드를 선행으로 쓰는 습득 노드가 고아가 된다 — by 에 그 노드들</summary>
        public RefundResult CheckRefund(string id, List<string> by = null)
        {
            by?.Clear();
            if (resetOnly) return RefundResult.ResetOnly;
            int k = Rank(id);
            if (k == 0) return RefundResult.NotLearned;
            if (k > 1) return RefundResult.Ok;
            bool needed = false;
            foreach (SkillNode n in tree.nodes)
                if (Rank(n.id) > 0 && Array.IndexOf(n.req, id) >= 0)
                {
                    needed = true;
                    by?.Add(n.id);
                }
            return needed ? RefundResult.Needed : RefundResult.Ok;
        }

        public LearnResult Learn(string id, List<string> missing = null)
        {
            LearnResult r = CheckLearn(id, missing);
            if (r != LearnResult.Ok) return r;
            ranks[id] = Rank(id) + 1;
            history.Add(id);
            Changed?.Invoke();
            return r;
        }

        public RefundResult Refund(string id, List<string> by = null)
        {
            RefundResult r = CheckRefund(id, by);
            if (r != RefundResult.Ok) return r;
            int k = Rank(id) - 1;
            if (k > 0) ranks[id] = k;
            else ranks.Remove(id);
            int i = history.LastIndexOf(id);
            if (i >= 0) history.RemoveAt(i);
            Changed?.Invoke();
            return r;
        }

        /// <summary>전체 초기화 — 돌려받은 포인트(= 쓴 포인트 전부)를 돌려준다</summary>
        public int ResetAll()
        {
            int back = Spent;
            ranks.Clear();
            history.Clear();
            Changed?.Invoke();
            return back;
        }

        /* ───── 문구 — 두 화면(UGUI · UI Toolkit)이 같은 문장을 쓰게 여기에 ───── */

        static readonly string[] StateNames = { "잠김", "습득 가능", "습득", "최대" };

        string Names(List<string> ids)
        {
            var parts = new List<string>();
            foreach (string id in ids) parts.Add(tree.Get(id).name);
            return string.Join(" · ", parts);
        }

        public string LearnMessage(string id, LearnResult r, List<string> missing)
        {
            SkillNode n = tree.Get(id);
            return r switch
            {
                LearnResult.Ok => $"{n.name} {Rank(id)}/{n.max} 습득 — {n.Effect(Rank(id))} · 포인트 −{n.cost}",
                LearnResult.Prereq => $"잠김 — 먼저 {Names(missing)} 습득",
                LearnResult.Points => $"포인트 부족 — {n.cost} 필요, 남은 {Left}",
                _ => $"{n.name} 은 이미 최대 단계",
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

        /// <summary>툴팁 본문: 지금 효과 · 다음 단계 수치와 비용 · 필요한 선행(✓ ✗). TMP · UI Toolkit Label 의 리치 텍스트</summary>
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

        /// <summary>노드 아래 짧은 글: 단계("1/3") · 다음 수치</summary>
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

        /// <summary>지금 살 수 있는 노드 하나 (자동 데모 · 시험 입력용). 없으면 null</summary>
        public string FirstLearnable()
        {
            foreach (SkillNode n in tree.nodes)
                if (CheckLearn(n.id) == LearnResult.Ok) return n.id;
            return null;
        }

        /// <summary>첫 화면용 시작 상태 (웹 판과 같게: 기본 훈련 1 · 지형 주파 3 · 지표 스캔 1 · 응급 수리 1)</summary>
        public void SetRanks(params (string id, int rank)[] list)
        {
            ranks.Clear();
            history.Clear();
            foreach ((string id, int k) in list)
            {
                ranks[id] = k;
                for (int i = 0; i < k; i++) history.Add(id);
            }
            Changed?.Invoke();
        }
    }
}
