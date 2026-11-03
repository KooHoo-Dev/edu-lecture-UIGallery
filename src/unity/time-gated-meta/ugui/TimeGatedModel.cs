// 탐사 연료 · 7일 출석 모델 (순수 C#). 웹 판 model.ts 와 같은 규칙이다.
// 현재값을 매초 더해 저장하지 않고 '마지막 기록 + 지금 시각' 에서 계산한다: 연료 = 마지막 값 + floor(경과 / 간격), 최대치에서 멈춤.
// 시각은 늘 ServerClock.UtcNow 를 넘겨받는다 — 시계를 직접 읽지 않아 기기 시계가 끼어들 틈이 없다.
using System;
using System.Collections.Generic;

namespace UIGallery.TimeGatedMeta
{
    [Serializable]
    public class EnergyMeter
    {
        public int max = 60;
        public double intervalMinutes = 6;
        /// <summary>마지막으로 확정한 값. 보상으로 max 를 넘을 수 있다 (초과 = 회복 정지)</summary>
        public int value;
        /// <summary>마지막 회복 시각 (UTC). value ≥ max 이면 의미 없음</summary>
        public DateTime lastRegenUtc;

        TimeSpan Interval => TimeSpan.FromMinutes(intervalMinutes);

        /// <summary>지금 값과 두 타이머. next · full 은 가득 · 초과면 TimeSpan.Zero</summary>
        public int Current(DateTime nowUtc, out TimeSpan next, out TimeSpan full)
        {
            next = full = TimeSpan.Zero;
            if (value >= max) return value;
            TimeSpan el = nowUtc - lastRegenUtc;
            if (el < TimeSpan.Zero) el = TimeSpan.Zero;                  // 시계가 뒤로 가도 음수 경과는 없다
            long gained = el.Ticks / Interval.Ticks;
            int v = (int)Math.Min(max, value + gained);
            if (v >= max) return v;
            next = Interval - TimeSpan.FromTicks(el.Ticks % Interval.Ticks);
            full = next + TimeSpan.FromTicks(Interval.Ticks * (max - v - 1));
            return v;
        }

        public bool IsOver => value > max;

        /// <summary>계산값을 기록으로 확정. 다음 +1 까지 쌓인 부분 시간은 버리지 않는다</summary>
        public void Settle(DateTime nowUtc)
        {
            if (value >= max) { lastRegenUtc = nowUtc; return; }
            TimeSpan el = nowUtc - lastRegenUtc;
            long gained = el < TimeSpan.Zero ? 0 : el.Ticks / Interval.Ticks;
            if (value + gained >= max) { value = max; lastRegenUtc = nowUtc; return; }
            value += (int)gained;
            lastRegenUtc = lastRegenUtc.AddTicks(Interval.Ticks * gained);
        }

        /// <summary>쓰기. 가득(또는 초과)이던 값이 max 아래로 내려가면 회복 시계는 '지금' 부터</summary>
        public bool TrySpend(int cost, DateTime nowUtc)
        {
            Settle(nowUtc);
            if (value < cost) return false;
            bool wasFull = value >= max;
            value -= cost;
            if (wasFull) lastRegenUtc = nowUtc;
            return true;
        }

        /// <summary>보상. max 에서 자르지 않는다 — 초과분은 남고 그동안 회복이 멈춘다</summary>
        public void Add(int amount, DateTime nowUtc)
        {
            Settle(nowUtc);
            value += amount;
        }

        /// <summary>cost 만큼 모일 때까지. cost &gt; max 면 회복으로는 오지 않는다 → null (보상으로만)</summary>
        public TimeSpan? UntilEnough(int cost, DateTime nowUtc)
        {
            int v = Current(nowUtc, out TimeSpan next, out _);
            if (v >= cost) return TimeSpan.Zero;
            if (cost > max) return null;
            return next + TimeSpan.FromTicks(Interval.Ticks * (cost - v - 1));
        }

        /// <summary>부족할 때 버튼 글자</summary>
        public string LackLabel(int cost, DateTime nowUtc)
        {
            TimeSpan? w = UntilEnough(cost, nowUtc);
            return w.HasValue ? $"연료 부족 · {cost}까지 {ServerClock.Format(w.Value)}" : $"비용 {cost} > 최대 {max} · 보상으로만";
        }

        /// <summary>가득 찰 시각 (로컬 알림 예약용). 가득 · 초과면 null</summary>
        public DateTime? FullAt(DateTime nowUtc)
        {
            Current(nowUtc, out TimeSpan next, out TimeSpan full);
            return next == TimeSpan.Zero ? (DateTime?)null : nowUtc + full;
        }
    }

    public enum AttendanceRule { Cumulative, Streak }
    public enum SlotState { Claimed, Today, Next, Future }

    public struct DayReward
    {
        public string name;
        public int count;
        public bool isFuel;
        public DayReward(string name, int count, bool isFuel = false) { this.name = name; this.count = count; this.isFuel = isFuel; }
    }

    [Serializable]
    public class AttendanceBook
    {
        public static readonly DayReward[] Rewards =
        {
            new DayReward("크레딧", 500), new DayReward("산소 캔", 2), new DayReward("냉각 셀", 3), new DayReward("탐사 연료", 30, true),
            new DayReward("수리 키트", 2), new DayReward("회로 조각", 10), new DayReward("정비 보급 상자", 1),
        };

        public AttendanceRule rule = AttendanceRule.Cumulative;
        /// <summary>이번 주기에 받은 날의 하루 번호 (칸 1, 2, 3 … 순서). 서버에 저장하는 것은 이것뿐이다</summary>
        public List<int> claimed = new List<int>();
        /// <summary>연속 규칙에서 끊겼을 때 잃은 칸 수 (0 = 없음)와 놓친 첫날</summary>
        public int brokeLost;
        public int brokeDay;

        int Last => claimed.Count > 0 ? claimed[claimed.Count - 1] : int.MinValue;

        /// <summary>오늘 받았나. 기기 시계를 되돌려 '오늘' 이 마지막 기록보다 앞서도 받은 것으로 본다</summary>
        public bool ClaimedToday(int today) => claimed.Count > 0 && Last >= today;

        /// <summary>날짜가 바뀐 뒤 부른다: 7칸을 다 채웠으면 새 주기, 연속 규칙에서 하루라도 비면 처음부터</summary>
        public void SettleDay(int today)
        {
            if (claimed.Count == 0 || ClaimedToday(today)) return;
            if (claimed.Count >= 7) { claimed.Clear(); brokeLost = 0; return; }
            if (rule == AttendanceRule.Streak && Last < today - 1)
            {
                brokeLost = claimed.Count;
                brokeDay = Last + 1;
                claimed.Clear();
            }
        }

        public SlotState State(int k, int today)
        {
            if (k < claimed.Count) return SlotState.Claimed;
            if (k == claimed.Count) return ClaimedToday(today) ? SlotState.Next : SlotState.Today;
            return SlotState.Future;
        }

        /// <summary>칸 k 앞에서 놓친 날 수 (누적 규칙에서 칸 사이에 표시)</summary>
        public int MissedBefore(int k, int today)
        {
            if (rule != AttendanceRule.Cumulative || k == 0 || k > claimed.Count) return 0;
            int cur = k < claimed.Count ? claimed[k] : ClaimedToday(today) ? claimed[k - 1] + 1 : today;
            return Math.Max(0, cur - claimed[k - 1] - 1);
        }

        /// <summary>오늘 칸을 받는다. 실제 게임에서는 서버가 같은 판정을 다시 하고 확정한다</summary>
        public bool TryClaim(int today, out DayReward reward)
        {
            reward = default;
            SettleDay(today);
            if (ClaimedToday(today) || claimed.Count >= 7) return false;
            reward = Rewards[claimed.Count];
            claimed.Add(today);
            brokeLost = 0;
            return true;
        }
    }
}
