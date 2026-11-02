// 배틀패스 모델 (순수 C#, MonoBehaviour 아님) — 보상 표와 칸 상태 머신.
// 칸 상태는 저장하지 않고 '레벨 · 받음 기록 · 요청 중 · 프리미엄 보유' 에서 매번 계산한다.
//   Locked ─(레벨 도달)→ Claimable ─(BeginClaim)→ Claiming ─(CompleteClaim = 서버 확인)→ Claimed
//   프리미엄 줄은 레벨에 도달해도 패스가 없으면 NeedsPremium (잠김의 한 종류)
using System;
using System.Collections.Generic;

namespace UIGallery.BattlePassTrack
{
    public enum PassTrackRow { Free, Premium }
    public enum TierState { None, Locked, NeedsPremium, Claimable, Claiming, Claimed }
    public enum RewardKind { Credit, RepairKit, CoolingCell, CircuitChip, OxygenCan, Outfit, Emote, Frame }

    [Serializable]
    public struct Reward
    {
        public RewardKind kind;
        public string name;
        public int count;
        /// <summary>10 레벨마다 나오는 큰 보상</summary>
        public bool big;

        public Reward(RewardKind kind, string name, int count, bool big = false)
        {
            this.kind = kind;
            this.name = name;
            this.count = count;
            this.big = big;
        }
    }

    public readonly struct TierRef
    {
        public readonly int level;
        public readonly PassTrackRow row;
        public TierRef(int level, PassTrackRow row)
        {
            this.level = level;
            this.row = row;
        }
    }

    public class PassModel
    {
        public const int XpPerLevel = 1000;

        public int LevelCount { get; private set; }
        public int FreeEvery { get; private set; }
        public int Level { get; private set; } = 1;
        /// <summary>지금 레벨 안의 경험치 (0 ~ XpPerLevel)</summary>
        public int Xp { get; private set; }
        public bool PremiumOwned { get; private set; }

        /// <summary>표시가 바뀌어야 할 때 (칸 · 막대 · 개수). 뷰는 이것만 구독한다</summary>
        public event Action Changed;

        readonly HashSet<(int, PassTrackRow)> claimed = new();
        readonly HashSet<(int, PassTrackRow)> claiming = new();

        public PassModel(int levelCount, int freeEvery, bool premiumOwned)
        {
            LevelCount = Math.Max(1, levelCount);
            FreeEvery = Math.Max(1, freeEvery);
            PremiumOwned = premiumOwned;
        }

        /// <summary>level 칸의 보상 (시험용 표). 무료 줄은 FreeEvery 칸마다(사이는 빈칸 = null), 프리미엄 줄은 모든 칸. 실제로는 서버 설정에서 받는다</summary>
        public Reward? RewardFor(int level, PassTrackRow row)
        {
            bool big = level % 10 == 0;
            if (row == PassTrackRow.Free)
            {
                if (level % FreeEvery != 0 && level != 1) return null;
                if (big) return new Reward(RewardKind.Frame, $"Lv {level} 테두리", 1, true);
                return (level * 7 % 4) switch
                {
                    0 => new Reward(RewardKind.Credit, "크레딧", 100 + level % 3 * 50),
                    1 => new Reward(RewardKind.RepairKit, "수리 키트", 2),
                    2 => new Reward(RewardKind.OxygenCan, "산소 캔", 2),
                    _ => new Reward(RewardKind.CircuitChip, "회로 조각", 5),
                };
            }
            if (big) return new Reward(RewardKind.Outfit, $"Lv {level} 외형", 1, true);
            if (level % 5 == 0) return new Reward(RewardKind.Emote, "이모트", 1);
            return (level % 3) switch
            {
                0 => new Reward(RewardKind.CoolingCell, "냉각 셀", 3),
                1 => new Reward(RewardKind.Credit, "크레딧", 300),
                _ => new Reward(RewardKind.CircuitChip, "회로 조각", 12),
            };
        }

        /// <summary>상태 머신 — 저장된 입력에서 칸 상태를 계산한다. 셀(뷰)은 이 결과를 보여 주기만 한다</summary>
        public TierState GetState(int level, PassTrackRow row)
        {
            if (RewardFor(level, row) == null) return TierState.None;
            if (claimed.Contains((level, row))) return TierState.Claimed;
            if (claiming.Contains((level, row))) return TierState.Claiming;
            if (level > Level) return TierState.Locked;
            if (row == PassTrackRow.Premium && !PremiumOwned) return TierState.NeedsPremium;
            return TierState.Claimable;
        }

        /// <summary>경험치 추가. 레벨이 몇 개 올랐는지 돌려준다 (막대 연출은 뷰가 따로)</summary>
        public int AddXp(int amount)
        {
            int before = Level;
            int total = Math.Min((LevelCount - 1) * XpPerLevel, (Level - 1) * XpPerLevel + Xp + amount);
            Level = total / XpPerLevel + 1;
            Xp = Level >= LevelCount ? 0 : total - (Level - 1) * XpPerLevel;
            Changed?.Invoke();
            return Level - before;
        }

        /// <summary>프리미엄 보유를 바꾼다 (시연용 토글). 켜면 지난 레벨의 프리미엄 칸도 Claimable 이 된다 — 계산이라 소급이 저절로 된다</summary>
        public void SetPremium(bool owned)
        {
            if (PremiumOwned == owned) return;
            PremiumOwned = owned;
            Changed?.Invoke();
        }

        /// <summary>지금 받을 수 있는 칸 전부 (모두 받기 대상), 왼쪽부터</summary>
        public void Claimables(List<TierRef> into)
        {
            into.Clear();
            for (int l = 1; l <= Math.Min(Level, LevelCount); l++)
            {
                if (GetState(l, PassTrackRow.Free) == TierState.Claimable) into.Add(new TierRef(l, PassTrackRow.Free));
                if (GetState(l, PassTrackRow.Premium) == TierState.Claimable) into.Add(new TierRef(l, PassTrackRow.Premium));
            }
        }

        /// <summary>받기 요청을 보냈다 — Claiming 으로 바꿔 같은 칸을 다시 보내지 않는다. 받을 수 없는 칸이면 false</summary>
        public bool BeginClaim(TierRef t)
        {
            if (GetState(t.level, t.row) != TierState.Claimable) return false;
            claiming.Add((t.level, t.row));
            Changed?.Invoke();
            return true;
        }

        /// <summary>서버가 확인했다 — Claimed 로 확정. ok = false(서버 거절)면 Claimable 로 되돌린다</summary>
        public void CompleteClaim(IReadOnlyList<TierRef> list, bool ok)
        {
            foreach (TierRef t in list)
            {
                claiming.Remove((t.level, t.row));
                if (ok) claimed.Add((t.level, t.row));
            }
            Changed?.Invoke();
        }

        /// <summary>받은 칸 목록 → 같은 종류끼리 묶은 요약 줄 ("크레딧 ×600"). 큰 보상은 따로 (결과 창 공용)</summary>
        public List<string> Summarize(IReadOnlyList<TierRef> got)
        {
            var sum = new Dictionary<string, (string name, int count)>();
            foreach (TierRef t in got)
            {
                Reward? r = RewardFor(t.level, t.row);
                if (!r.HasValue) continue;
                string key = r.Value.big ? r.Value.name : r.Value.kind.ToString();
                sum[key] = sum.TryGetValue(key, out var cur) ? (cur.name, cur.count + r.Value.count) : (r.Value.name, r.Value.count);
            }
            var lines = new List<string>();
            foreach (var kv in sum) lines.Add(kv.Value.count > 1 ? $"{kv.Value.name} ×{kv.Value.count:N0}" : kv.Value.name);
            return lines;
        }

        /// <summary>마지막 레벨까지 남은 경험치</summary>
        public int XpToEnd => Math.Max(0, (LevelCount - 1) * XpPerLevel - ((Level - 1) * XpPerLevel + Xp));

        /// <summary>정직한 안내(추정): 하루 dailyXp 씩 daysLeft 일 더 얻으면 시즌 끝에 몇 레벨인가</summary>
        public int ProjectedLevel(int dailyXp, double daysLeft) =>
            Math.Min(LevelCount, (int)(((Level - 1) * XpPerLevel + Xp + dailyXp * Math.Max(0, daysLeft)) / XpPerLevel) + 1);

        /// <summary>안내 문구 — 남은 경험치 · 걸리는 날 · 시즌 끝 예상 레벨 · 받지 않은 보상 수 (UGUI 판 BattlePassDemo 가 쓴다)</summary>
        public string HonestSummary(int dailyXp, double daysLeft, int unclaimed)
        {
            int need = XpToEnd;
            int proj = ProjectedLevel(dailyXp, daysLeft);
            string verdict = proj >= LevelCount ? $"이 속도면 시즌 안에 Lv {LevelCount} 까지" : $"이 속도면 시즌 끝에 Lv {proj} 쯤 — {LevelCount - proj}칸 남음";
            return $"끝까지 남은 경험치 {need:N0} XP\n" +
                   $"하루 {dailyXp:N0} XP 면 약 {need / (double)Math.Max(1, dailyXp):0.0}일 · 시즌 남은 {daysLeft:0.0}일\n" +
                   $"{verdict}\n받지 않은 보상 {unclaimed}개 · 추정";
        }

        /// <summary>시작 상태: 지정 레벨 · 경험치, upTo 레벨까지 받음</summary>
        public void Restore(int level, int xp, int claimedUpTo)
        {
            Level = Math.Clamp(level, 1, LevelCount);
            Xp = xp;
            claimed.Clear();
            claiming.Clear();
            for (int l = 1; l <= claimedUpTo; l++)
            {
                claimed.Add((l, PassTrackRow.Free));
                if (PremiumOwned) claimed.Add((l, PassTrackRow.Premium));
            }
            Changed?.Invoke();
        }
    }
}
