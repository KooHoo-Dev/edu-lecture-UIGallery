// 레벨 정의(ScriptableObject)와 HUD · 보드가 함께 쓰는 순수 C# 상태. UGUI · UI Toolkit 두 판이 그대로 쓴다 (같은 namespace).
//  - LevelDefinition : 이동 수 · 목표(종류 · 개수 · 아이콘) · 별 임계값 · 부스터. HUD 는 이것만 보고 칸을 만든다 (자동 구성)
//  - GoalLedger      : 목표 하나의 정산. 실제값(collected)은 깨진 순간, 표시값(landed)은 아이콘이 도착한 순간 바뀐다
//  - StageState      : 남은 이동 · 점수 · 부스터 · 판정. 마지막 연쇄와 비행이 끝날 때까지 판정(이동 0 의 실패 포함)을 미룬다
//  - IGoalHud        : 보드(게임) 쪽이 HUD 에 알리는 통로 (GoalHud · Match3HudUITK 가 구현)
using System;
using UnityEngine;

namespace UIGallery.Match3GoalHud
{
    public enum BlockType { CoolantCell, CircuitChip, OxygenCan, RepairKit }

    public enum StageResult { None, Clear, Fail }

    [CreateAssetMenu(menuName = "UI Gallery/Match3 Goal HUD/Level", fileName = "Level")]
    public class LevelDefinition : ScriptableObject
    {
        [Serializable]
        public class Goal
        {
            public BlockType type;
            [Min(1)] public int count = 12;
            public string displayName = "냉각 셀";
            [Tooltip("색만이 아니라 모양으로도 구분되는 아이콘 (보드의 블록과 같은 그림)")] public Sprite icon;
        }

        [Serializable]
        public class Booster
        {
            public string displayName = "폭발 충전";
            public string description = "커서 둘레 3×3";
            public Sprite icon;
            [Min(0)] public int startCount = 2;
        }

        public string stageName = "정비 구역 07";
        [Min(1)] public int moves = 12;
        [Tooltip("남은 이동이 이 값 이하면 경고 (색 · 글자 · 맥동). 0 이면 경고 없음")] [Min(0)] public int warnAtMoves = 5;
        public Goal[] goals = Array.Empty<Goal>();
        [Min(1)] public int maxScore = 5000;
        [Tooltip("별 1 · 2 · 3 의 점수. 바 위 마커 위치 = 임계값 / maxScore (등간격이 아니다)")] public int[] starThresholds = { 1000, 2500, 4000 };
        public Booster[] boosters = Array.Empty<Booster>();

        /// <summary>별 i 의 바 위 위치 (0~1)</summary>
        public float StarPosition(int i) => Mathf.Clamp01((float)starThresholds[i] / maxScore);

        public int StarsFor(int score)
        {
            int n = 0;
            foreach (int t in starThresholds) if (score >= t) n++;
            return n;
        }

        void OnValidate()
        {
            // 임계값은 오름차순 · 최대 점수 안 — 마커가 거꾸로 서거나 바 밖으로 나가지 않게
            if (starThresholds == null) return;
            Array.Sort(starThresholds);
            for (int i = 0; i < starThresholds.Length; i++) starThresholds[i] = Mathf.Clamp(starThresholds[i], 0, maxScore);
        }
    }

    /// <summary>목표 하나의 정산. 판정은 Remaining(실제값), 화면은 Shown(표시값). 언제나 Shown ≥ Remaining</summary>
    public class GoalLedger
    {
        public readonly LevelDefinition.Goal def;
        int collected, landed;

        public GoalLedger(LevelDefinition.Goal def) => this.def = def;

        public BlockType Type => def.type;
        public int Remaining => Mathf.Max(0, def.count - collected);
        public int Shown => Mathf.Max(0, def.count - landed);
        public int InFlight => collected - landed;
        public bool Done => Remaining == 0;

        /// <summary>같은 종류 n 개가 깨졌다. 목표로 날아갈 개수(남은 만큼까지)를 돌려준다 — 넘친 것은 날리지 않아 음수가 생기지 않는다</summary>
        public int Collect(int n)
        {
            int k = Mathf.Min(n, Remaining);
            collected += k;
            return k;
        }

        /// <summary>아이콘 하나 도착. 표시값이 실제값을 앞지르지 않는다</summary>
        public bool Land()
        {
            if (landed >= collected) return false;
            landed++;
            return true;
        }

        /// <summary>날아오는 것을 기다리지 않고 표시값 = 실제값 (다시 시작 · HUD 꺼짐 · 효과 끔)</summary>
        public void Settle() => landed = collected;
    }

    /// <summary>한 판의 상태. 보드가 쓰고 HUD 가 읽는다</summary>
    public class StageState
    {
        public readonly LevelDefinition level;
        public readonly GoalLedger[] goals;
        public readonly int[] boosters;
        /// <summary>끄면 '나쁜 예': 이동 0 이 되는 순간 실패 — 그 이동이 일으킨 연쇄가 목표를 채워도 늦다</summary>
        public bool deferFailUntilSettled = true;

        public int MovesLeft { get; private set; }
        public int Score { get; private set; }
        public StageResult Result { get; private set; }
        /// <summary>판정이 연쇄가 끝나기 전에 났다 (즉시 판정)</summary>
        public bool JudgedEarly { get; private set; }
        /// <summary>진행 중인 이동 · 부스터 처리(연쇄 포함). 0 이어야 판정한다</summary>
        int resolving;

        /// <summary>이동 · 점수 · 부스터 · 결과가 바뀌었다 (글자만 다시 그리면 된다)</summary>
        public event Action Changed;

        public StageState(LevelDefinition level)
        {
            this.level = level;
            goals = new GoalLedger[level.goals.Length];
            for (int i = 0; i < goals.Length; i++) goals[i] = new GoalLedger(level.goals[i]);
            boosters = new int[level.boosters.Length];
            for (int i = 0; i < boosters.Length; i++) boosters[i] = level.boosters[i].startCount;
            MovesLeft = level.moves;
        }

        public bool Settled => resolving == 0;
        /// <summary>이동 · 부스터를 쓸 수 있는가. 목표를 다 채운 뒤 비행을 기다리는 동안은 쓰지 않는다 (판정만 남았다)</summary>
        public bool CanAct => Result == StageResult.None && Settled && !AllGoalsDone;

        public bool AllGoalsDone
        {
            get
            {
                foreach (GoalLedger g in goals) if (!g.Done) return false;
                return true;
            }
        }

        public GoalLedger Find(BlockType type)
        {
            foreach (GoalLedger g in goals) if (g.Type == type) return g;
            return null;
        }

        /// <summary>묶음을 눌렀다: 이동 −1, 처리 시작. 처리가 끝나면 EndResolve</summary>
        public bool TryBeginMove()
        {
            if (!CanAct || MovesLeft <= 0) return false;
            MovesLeft--;
            resolving++;
            // 나쁜 규칙: 연쇄를 기다리지 않는다
            if (!deferFailUntilSettled && MovesLeft == 0 && !AllGoalsDone)
            {
                Result = StageResult.Fail;
                JudgedEarly = true;
            }
            Changed?.Invoke();
            return true;
        }

        /// <summary>부스터: 이동을 쓰지 않는다. 0개면 false (상점 안내는 부르는 쪽이)</summary>
        public bool TryBeginBooster(int index)
        {
            if (!CanAct || index < 0 || index >= boosters.Length || boosters[index] <= 0) return false;
            boosters[index]--;
            resolving++;
            Changed?.Invoke();
            return true;
        }

        public void EndResolve()
        {
            resolving = Mathf.Max(0, resolving - 1);
            Changed?.Invoke();
        }

        /// <summary>보드가 꺼져 처리 코루틴이 멈췄을 때 — 판정이 영원히 미뤄지지 않게</summary>
        public void AbortResolve() => resolving = 0;

        public void AddScore(int points)
        {
            Score += points;
            Changed?.Invoke();
        }

        /// <summary>시험용: 이동 수를 바로 바꾼다 (마지막 이동 시연)</summary>
        public void SetMovesForTest(int moves)
        {
            MovesLeft = Mathf.Max(0, moves);
            Changed?.Invoke();
        }

        /// <summary>판정. 연쇄가 다 끝나고(Settled) 날아오는 아이콘이 다 도착했을 때만 결과를 낸다 (flying = HUD 가 세는 비행 중 수).
        /// 성공 · 실패 모두 — 실패만 먼저 내면 창 위로 아이콘이 날고 "남은 목표" 와 HUD 숫자가 잠깐 어긋난다</summary>
        public StageResult Judge(int flying)
        {
            if (Result != StageResult.None || !Settled || flying > 0) return Result;
            if (AllGoalsDone) Result = StageResult.Clear;
            else if (MovesLeft == 0) Result = StageResult.Fail;
            if (Result != StageResult.None) Changed?.Invoke();
            return Result;
        }
    }

    /// <summary>보드 → HUD. 실제값(GoalLedger.Collect)은 보드가 먼저 줄이고, HUD 는 날려서 표시값을 따라가게 한다</summary>
    public interface IGoalHud
    {
        /// <summary>레벨 정의로 칸을 만들고 이 판의 상태를 그린다 (다시 시작할 때마다)</summary>
        void Bind(StageState state);
        /// <summary>목표 블록 하나가 월드 위치에서 깨졌다 — 목표 아이콘으로 날린다</summary>
        void Fly(BlockType type, Vector3 worldPos, float delay);
        int FlyingCount { get; }
        void ShowResult(StageResult result);
        /// <summary>부스터 버튼 (0개일 때도 온다 — 상점 안내)</summary>
        event Action<int> BoosterPressed;
        event Action RetryPressed;
    }
}
