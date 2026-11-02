using System;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 결과·보상 정산에 넘기는 데이터 — 전투 쪽에서 만들어 ResultsSequence.Play(data) 로 넘긴다.
    /// UGUI 판과 UI Toolkit 판이 함께 쓴다.
    /// </summary>
    [Serializable]
    public struct RewardLine
    {
        public string label;   // 예: "잔해 드론 처치"
        public string sub;     // 예: "×7 · 기당 120"  (왜 이만큼 받았는지)
        public long value;

        public RewardLine(string label, string sub, long value)
        {
            this.label = label;
            this.sub = sub;
            this.value = value;
        }
    }

    [Serializable]
    public struct ItemLine
    {
        public string name;
        public int count;
        public bool isNew;

        public ItemLine(string name, int count, bool isNew = false)
        {
            this.name = name;
            this.count = count;
            this.isNew = isNew;
        }
    }

    [Serializable]
    public struct MemberStart
    {
        public string name;
        public int level;
        public long exp;
        public int hp;
        public int power;
        public string skill;

        public MemberStart(string name, int level, long exp, int hp, int power, string skill)
        {
            this.name = name;
            this.level = level;
            this.exp = exp;
            this.hp = hp;
            this.power = power;
            this.skill = skill;
        }
    }

    [Serializable]
    public class ResultData
    {
        public string mission;
        public RewardLine[] expLines;
        public RewardLine[] creditLines;
        public ItemLine[] items;
        public MemberStart[] party;
        public string rank;   // "S" · "A" · "B"

        public long ExpTotal => Sum(expLines);
        public long CreditTotal => Sum(creditLines);

        public static long Sum(RewardLine[] lines)
        {
            long s = 0;
            foreach (var l in lines) s += l.value;
            return s;
        }

        /// <summary>다음 레벨까지 필요한 경험치</summary>
        public static long NeedFor(int level) => 600 + level * 120;

        /// <summary>경험치 gain 을 더한 뒤의 레벨 — 바가 가득 차면 0 으로 돌아가 다음 레벨을 채운다</summary>
        public static (int level, long exp) LevelAfter(int level, long exp, long gain)
        {
            long e = exp + gain;
            while (e >= NeedFor(level))
            {
                e -= NeedFor(level);
                level++;
            }
            return (level, e);
        }

        public bool HasLevelUp
        {
            get
            {
                foreach (var m in party)
                    if (LevelAfter(m.level, m.exp, ExpTotal).level > m.level) return true;
                return false;
            }
        }

        /* ───── 시험용 결과 3종 (갤러리의 이벤트 1~3 과 같은 값) ───── */

        static MemberStart[] Party() => new[]
        {
            new MemberStart("하린", 11, 1200, 412, 58, "신호탄 연사"),
            new MemberStart("도윤", 9, 0, 380, 44, "응급 용접"),
            new MemberStart("세라", 10, 100, 340, 52, "광역 교란파"),
        };

        public static ResultData Normal() => new ResultData
        {
            mission = "북쪽 통신탑 복구",
            expLines = new[]
            {
                new RewardLine("잔해 드론 처치", "×4 · 기당 80", 320),
                new RewardLine("목표 달성", "통신탑 전원 연결", 240),
                new RewardLine("무피해 보너스", "피격 0회", 80),
            },
            creditLines = new[]
            {
                new RewardLine("기본 보상", "작전 완료", 600),
                new RewardLine("처치 보너스", "×4 · 기당 40", 160),
                new RewardLine("남은 시간 보너스", "남은 시간 1:30", 90),
                new RewardLine("저축 이자", "보유 1,240의 5%", 62),
            },
            items = new[] { new ItemLine("회로 조각", 3), new ItemLine("수리 키트", 1), new ItemLine("냉각 셀", 1) },
            party = Party(),
            rank = "B",
        };

        public static ResultData LevelUp() => new ResultData
        {
            mission = "정비 기지 동력 복구",
            expLines = new[]
            {
                new RewardLine("잔해 드론 처치", "×7 · 기당 120", 840),
                new RewardLine("목표 달성", "동력로 재가동", 600),
                new RewardLine("무피해 보너스", "피격 0회", 210),
            },
            creditLines = new[]
            {
                new RewardLine("기본 보상", "작전 완료", 1200),
                new RewardLine("처치 보너스", "×7 · 기당 40", 280),
                new RewardLine("남은 시간 보너스", "남은 시간 2:30", 150),
                new RewardLine("저축 이자", "보유 2,480의 5%", 124),
            },
            items = new[] { new ItemLine("수리 키트", 2), new ItemLine("냉각 셀", 3), new ItemLine("회로 조각", 5), new ItemLine("산소 캔", 1, true) },
            party = Party(),
            rank = "A",
        };

        public static ResultData Big() => new ResultData
        {
            mission = "궤도 정비 기지 방어",
            expLines = new[]
            {
                new RewardLine("대형 잔해 드론 격파", "×2 · 기당 1,200", 2400),
                new RewardLine("목표 달성", "방어선 유지", 1600),
                new RewardLine("연속 처치 보너스", "최대 12연속", 800),
            },
            creditLines = new[]
            {
                new RewardLine("기본 보상", "대형 작전 완료", 8000),
                new RewardLine("처치 보너스", "×12 · 기당 200", 2400),
                new RewardLine("남은 시간 보너스", "남은 시간 4:10", 1250),
                new RewardLine("저축 이자", "보유 20,000의 5%", 1000),
            },
            items = new[] { new ItemLine("회로 조각", 12), new ItemLine("냉각 셀", 6), new ItemLine("수리 키트", 4), new ItemLine("산소 캔", 3) },
            party = Party(),
            rank = "S",
        };
    }
}
