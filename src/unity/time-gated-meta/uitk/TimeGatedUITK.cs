// 출석판 + 탐사 연료 (UI Toolkit). 모델(EnergyMeter · AttendanceBook)과 시계(ServerClock · FakeServer)는 UGUI 폴더 것을 그대로 쓴다.
// 출석 칸 7개를 #days 에 만들어 flex-wrap 그리드로 두고, 상태는 USS 수식 클래스(slot--claimed · today · next · future)만 켜고 끈다.
// 칸은 보기만 하는 요소라 focusable = false — 포커스는 버튼 두 개만 받아 기본 탐색을 그대로 쓴다.
using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.TimeGatedMeta
{
    [RequireComponent(typeof(UIDocument))]
    public class TimeGatedUITK : MonoBehaviour
    {
        public ClockSource clockSource = ClockSource.Server;
        [Range(0, 23)] public int resetHour = 5;
        public int serverTzHours = 9;
        public int stageCost = 20;
        public EnergyMeter energy = new EnergyMeter { max = 60, intervalMinutes = 6, value = 37 };
        public AttendanceBook attendance = new AttendanceBook();

        static readonly string[] StateClass = { "slot--claimed", "slot--today", "slot--next", "slot--future" };

        readonly ServerClock clock = new ServerClock();
        VisualElement root;
        Label clockLabel, rule, resetLabel, reset, broke, value, max, next, full, notify;
        VisualElement fill;
        Button claim, enter;
        readonly VisualElement[] slots = new VisualElement[7];
        IVisualElementScheduledItem tick, pulse, syncing;
        int lastDay = int.MinValue;
        int todaySlot = -1;

        DateTime Now => clockSource == ClockSource.Server ? clock.UtcNow(Time.realtimeSinceStartupAsDouble) : DateTime.UtcNow;
        bool Ready => clockSource == ClockSource.Device || clock.IsSynced;

        void OnEnable()
        {
            root = GetComponent<UIDocument>().rootVisualElement.Q("root");
            clockLabel = root.Q<Label>("clock");
            rule = root.Q<Label>("rule");
            resetLabel = root.Q<Label>("reset-label");
            reset = root.Q<Label>("reset");
            broke = root.Q<Label>("broke");
            value = root.Q<Label>("fuel-value");
            max = root.Q<Label>("fuel-max");
            next = root.Q<Label>("next");
            full = root.Q<Label>("full");
            notify = root.Q<Label>("notify");
            fill = root.Q("fuel-fill");
            claim = root.Q<Button>("claim");
            enter = root.Q<Button>("enter");
            BuildSlots(root.Q("days"));

            claim.clicked += OnClaim;
            enter.clicked += OnEnter;
            // 처음 실행: 2분 12초 전 회복으로 (실제로는 서버 저장값). 동기화 전 Device 기준도 맞게 여기서
            if (energy.lastRegenUtc == default) energy.lastRegenUtc = FakeServer.Now.AddSeconds(-132);
            // 글자는 1초에 4번. 맥동 0.8Hz — 클래스를 켜고 끄면 USS transition 이 잇는다
            tick = root.schedule.Execute(Refresh).Every(250);
            pulse = root.schedule.Execute(() =>
            {
                if (todaySlot >= 0) slots[todaySlot].ToggleInClassList("slot--pulse");
            }).Every(625);
            Resync();
        }

        void OnDisable()
        {
            claim.clicked -= OnClaim;
            enter.clicked -= OnEnter;
            tick?.Pause();
            pulse?.Pause();
            syncing?.Pause();
        }

        /* 앱 복귀 때 서버 시각을 다시 받는다 — 꺼져 있던 시간은 다시 계산하면 저절로 반영된다 */
        void OnApplicationPause(bool paused)
        {
            if (!paused && isActiveAndEnabled) Resync();
        }

        void OnApplicationFocus(bool focused)
        {
            if (focused && isActiveAndEnabled) Resync();
        }

        void Resync()
        {
            clock.Invalidate();
            root.AddToClassList("tg--sync");
            syncing?.Pause();
            // 가짜 서버 지연 300ms. 실제로는 UnityWebRequest 응답의 서버 시각
            syncing = root.schedule.Execute(() =>
            {
                DateTime utc = FakeServer.Now;
                clock.Sync(utc, Time.realtimeSinceStartupAsDouble);
                root.RemoveFromClassList("tg--sync");
                lastDay = int.MinValue;
                Refresh();
            }).StartingIn(300);
        }

        void BuildSlots(VisualElement days)
        {
            days.Clear();
            for (int k = 0; k < slots.Length; k++)
            {
                var slot = new VisualElement { focusable = false, pickingMode = PickingMode.Ignore };
                slot.AddToClassList("slot");
                if (k == 6) slot.AddToClassList("slot--big");
                DayReward r = AttendanceBook.Rewards[k];
                slot.Add(MakeLabel("slot__day", $"{k + 1}일차"));
                slot.Add(MakeLabel("slot__tag", ""));
                slot.Add(MakeLabel("slot__name", r.name));
                slot.Add(MakeLabel("slot__count", k == 6 ? "수리 키트 ×5 · 크레딧 3,000" : $"×{r.count}"));
                slot.Add(MakeLabel("slot__stamp", "받음"));
                slot.Add(MakeLabel("slot__missed", ""));
                days.Add(slot);
                slots[k] = slot;
            }
        }

        static Label MakeLabel(string cls, string text)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            return l;
        }

        void Refresh()
        {
            if (!Ready)
            {
                reset.text = next.text = full.text = "동기화 중";
                claim.SetEnabled(false);
                enter.SetEnabled(false);
                return;
            }
            DateTime now = Now;
            int today = ServerClock.DayIndex(now, resetHour, serverTzHours);
            if (today != lastDay)
            {
                attendance.SettleDay(today);
                lastDay = today;
                RefreshBoard(today);
            }

            clockLabel.text = $"서버 {ServerClock.Clock(now, serverTzHours)} (UTC+{serverTzHours})";
            TimeSpan left = ServerClock.NextReset(now, resetHour, serverTzHours) - now;
            reset.text = ServerClock.Format(left);
            bool done = attendance.ClaimedToday(today);
            claim.text = done ? $"받음 · 다음 보급까지 {ServerClock.Format(left)}" : $"{attendance.claimed.Count + 1}일차 보급 받기";
            claim.SetEnabled(!done);

            int v = energy.Current(now, out TimeSpan nx, out TimeSpan fl);
            bool regen = v < energy.max;
            value.text = v.ToString();
            max.text = $"/ {energy.max}";
            fill.style.width = Length.Percent(Mathf.Clamp01((float)v / energy.max) * 100f);
            root.EnableInClassList("tg--over", v > energy.max);
            root.EnableInClassList("tg--full", v == energy.max);
            next.text = regen ? ServerClock.Format(nx) : v > energy.max ? "정지" : "가득";
            full.text = regen ? ServerClock.Format(fl) : "—";
            notify.text = regen ? $"가득 참 알림 · {ServerClock.Format(fl)} 뒤" : "가득 참 알림 예약 없음";

            bool lack = v < stageCost;
            enter.SetEnabled(!lack);
            enter.text = lack ? energy.LackLabel(stageCost, now) : $"탐사 출발  −{stageCost}";
        }

        void RefreshBoard(int today)
        {
            rule.text = attendance.rule == AttendanceRule.Streak ? "연속 출석 · 놓치면 1일차부터" : "누적 출석 · 놓쳐도 다음 칸으로";
            resetLabel.text = $"다음 초기화 (매일 {resetHour:00}:00)";
            bool done = attendance.ClaimedToday(today);
            todaySlot = -1;
            for (int k = 0; k < slots.Length; k++)
            {
                VisualElement s = slots[k];
                SlotState st = attendance.State(k, today);
                for (int i = 0; i < StateClass.Length; i++) s.EnableInClassList(StateClass[i], i == (int)st);   // 켜기 · 끄기를 한 번에
                s.RemoveFromClassList("slot--pulse");
                int ahead = k - attendance.claimed.Count + (done ? 1 : 0);
                s.Q<Label>(className: "slot__tag").text = st == SlotState.Claimed ? "받음" : st == SlotState.Today ? "오늘" : st == SlotState.Next ? "내일" : $"+{ahead}일";
                if (st == SlotState.Claimed) s.Q<Label>(className: "slot__stamp").text = $"받음\n{ServerClock.DayLabel(attendance.claimed[k], resetHour)}";
                int missed = attendance.MissedBefore(k, today);
                Label m = s.Q<Label>(className: "slot__missed");
                m.EnableInClassList("slot__missed--show", missed > 0);
                m.text = $"놓친 날 {missed}";
                if (st == SlotState.Today) todaySlot = k;
            }
            broke.EnableInClassList("broke--show", attendance.brokeLost > 0);
            broke.text = attendance.brokeLost > 0 ? $"연속 끊김 — {ServerClock.DayLabel(attendance.brokeDay, resetHour)} 를 놓쳐 {attendance.brokeLost}칸을 잃었다 · 1일차부터" : "";
        }

        void OnClaim()
        {
            if (!Ready) return;
            DateTime now = Now;
            int today = ServerClock.DayIndex(now, resetHour, serverTzHours);
            if (!attendance.TryClaim(today, out DayReward r)) return;
            if (r.isFuel) energy.Add(r.count, now);   // 자르지 않는다 → 초과 · 회복 정지
            RefreshBoard(today);
            Refresh();
        }

        void OnEnter()
        {
            if (!Ready || !energy.TrySpend(stageCost, Now)) return;
            Refresh();
        }
    }
}
