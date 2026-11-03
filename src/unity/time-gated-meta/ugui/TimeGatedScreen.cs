// 7일 출석판 + 탐사 연료 화면 (UGUI). 값은 TimeGatedModel 이 '마지막 기록 + 서버 시각' 으로 계산하고 여기서는 그리기만 한다.
// 앱 복귀(OnApplicationPause(false) · OnApplicationFocus(true)) 때 서버 시각을 다시 받고 다시 계산한다.
// 1~6일차는 GridLayoutGroup(4열), 7일차 두 칸짜리는 LayoutElement.ignoreLayout 으로 빼서 직접 둔다 (그리드는 칸 크기가 모두 같다).
// 버튼은 transition = ColorTint, Selected Color 를 Normal 과 다르게 — 키보드 · 패드로 고른 버튼이 보인다.
// interactable = false 는 쓰지 않는다(선택이 풀려 패드로 못 움직인다). 바탕색만 바꾸고 처리 함수가 막는다.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.TimeGatedMeta
{
    /// <summary>출석 칸 하나의 참조 (MonoBehaviour 가 아니라 인스펙터 배열 원소)</summary>
    [Serializable]
    public class DaySlot
    {
        public Image frame;          // 상태 색 — 색만이 아니라 tag 글자 · 도장으로도 구분
        public TMP_Text dayLabel;    // "4일차"
        public TMP_Text tag;         // 받음 · 오늘 · 내일 · +2일
        public TMP_Text reward;      // "냉각 셀 ×3"
        public GameObject stamp;     // 받음 도장 (체크 + 날짜)
        public TMP_Text stampDate;
        public GameObject missed;    // 누적 규칙: 이 칸 앞에서 놓친 날
        public TMP_Text missedText;
    }

    public class TimeGatedScreen : MonoBehaviour
    {
        [Header("규칙")]
        public ClockSource clockSource = ClockSource.Server;
        [Range(0, 23)] public int resetHour = 5;
        public int serverTzHours = 9;
        public int stageCost = 20;
        public EnergyMeter energy = new EnergyMeter { max = 60, intervalMinutes = 6, value = 37 };
        public AttendanceBook attendance = new AttendanceBook();

        [Header("머리")]
        [SerializeField] TMP_Text clockText, ruleChip;   // 서버 시각 · 출석 규칙

        [Header("출석판")]
        [SerializeField] DaySlot[] slots = new DaySlot[7];
        [SerializeField] TMP_Text resetCountdown;
        [SerializeField] TMP_Text brokeBanner;
        [SerializeField] Button claimButton;
        [SerializeField] TMP_Text claimLabel;

        [Header("탐사 연료")]
        [SerializeField] TMP_Text valueText;
        [SerializeField] GameObject overTag;
        [SerializeField] Image fill;                 // Image Type = Filled · Horizontal
        [SerializeField] TMP_Text nextText;
        [SerializeField] TMP_Text fullText;
        [SerializeField] TMP_Text notifyText;
        [SerializeField] Button enterButton;
        [SerializeField] TMP_Text enterLabel;

        [Header("상태 색")]
        [SerializeField] Color claimedColor = new Color(0.08f, 0.13f, 0.19f);
        [SerializeField] Color todayColor = new Color(1f, 0.81f, 0.35f);
        [SerializeField] Color nextColor = new Color(0.37f, 0.9f, 0.79f);
        [SerializeField] Color futureColor = new Color(0.16f, 0.23f, 0.32f);
        [SerializeField] Color offColor = new Color(0.14f, 0.2f, 0.27f);   // 꺼진 버튼 바탕

        /// <summary>시험용 (TimeGatedDemo): 사용자가 바꾼 기기 시계 · 앱을 끈 동안 흐른 시간. clockSource = Device 일 때만 화면에 영향</summary>
        [NonSerialized] public double testSkewDays, testOffsetHours;
        public event Action<string> Message;

        readonly ServerClock clock = new ServerClock();
        Coroutine syncing;
        int lastDay = int.MinValue;
        long lastSecond;
        int todaySlot = -1;
        DateTime? scheduledFull;
        Color claimOn, enterOn;

        DateTime Now => clockSource == ClockSource.Server
            ? clock.UtcNow(Time.realtimeSinceStartupAsDouble)
            : DateTime.UtcNow.AddHours(testOffsetHours).AddDays(testSkewDays);   // 나쁜 예 비교용 — 기기 시계
        bool Ready => clockSource == ClockSource.Device || clock.IsSynced;
        int Today(DateTime now) => ServerClock.DayIndex(now, resetHour, serverTzHours);

        void Awake()
        {
            // 리스너는 한 번만. Refresh 마다 AddListener 하면 한 번 눌러 여러 번 받는다
            claimButton.onClick.AddListener(Claim);
            enterButton.onClick.AddListener(Depart);
            claimOn = claimButton.targetGraphic.color;
            enterOn = enterButton.targetGraphic.color;
        }

        void OnEnable()
        {
            // 처음 실행: 실제로는 서버 저장값(value · lastRegenUtc). 이 예제는 2분 12초 전 회복으로.
            // 동기화 전에도 그리는 Device 기준이 가득(0001년)으로 보이지 않게 여기서 정한다
            if (energy.lastRegenUtc == default) energy.lastRegenUtc = FakeServer.Now.AddSeconds(-132);
            Resync();
        }

        // 켠 채 바탕색만 — 고른 채로 버튼 글자(남은 시간)를 읽는다
        void SetOff(Button b, Color on, bool off) => b.targetGraphic.color = off ? offColor : on;

        void OnDisable()
        {
            if (syncing != null) StopCoroutine(syncing);
            syncing = null;
        }

        /* 앱 복귀: 꺼져 있던 동안 아무것도 세지 않았다. 다시 받은 서버 시각으로 계산하면 그 시간이 저절로 반영된다 */
        void OnApplicationPause(bool paused)
        {
            if (!paused) Resync();
        }

        void OnApplicationFocus(bool focused)
        {
            if (focused) Resync();
        }

        public void Resync()
        {
            if (!isActiveAndEnabled) return;   // 꺼진 동안은 OnEnable 이 다시 부른다
            clock.Invalidate();
            if (syncing != null) StopCoroutine(syncing);
            syncing = StartCoroutine(FakeServer.FetchUtc(utc =>
            {
                syncing = null;
                clock.Sync(utc, Time.realtimeSinceStartupAsDouble);
                lastDay = int.MinValue;
                lastSecond = 0;
            }));
        }

        void Update()
        {
            if (!Ready)
            {
                resetCountdown.text = nextText.text = fullText.text = "동기화 중";
                SetOff(claimButton, claimOn, true);   // 서버 시각을 받기 전에는 판정하지 않는다 (처리 함수가 Ready 로 막는다)
                SetOff(enterButton, enterOn, true);
                return;
            }
            DateTime now = Now;
            int today = Today(now);
            if (today != lastDay)
            {
                attendance.SettleDay(today);   // 날짜가 바뀐 순간에만 규칙 적용 (7칸 완료 → 새 주기, 연속 끊김)
                lastDay = today;
                RefreshBoard(today);
            }
            // 오늘 칸 맥동 0.8Hz (2Hz 이하) — 오늘 받을 것이 있을 때만
            if (todaySlot >= 0)
                slots[todaySlot].frame.transform.localScale = Vector3.one * (1f + 0.03f * Mathf.Sin(Time.unscaledTime * Mathf.PI * 1.6f));
            // 글자는 초가 바뀔 때만 다시 쓴다 (매 프레임 문자열을 만들지 않는다)
            long sec = now.Ticks / TimeSpan.TicksPerSecond;
            if (sec != lastSecond)
            {
                lastSecond = sec;
                RefreshTimers(now, today);
            }
        }

        void RefreshBoard(int today)
        {
            todaySlot = -1;
            bool done = attendance.ClaimedToday(today);
            for (int k = 0; k < slots.Length; k++)
            {
                DaySlot s = slots[k];
                DayReward r = AttendanceBook.Rewards[k];
                SlotState st = attendance.State(k, today);
                int ahead = k - attendance.claimed.Count + (done ? 1 : 0);
                s.dayLabel.text = $"{k + 1}일차";
                s.reward.text = k == 6 ? "수리 키트 ×5 · 크레딧 3,000" : $"{r.name} ×{r.count}";
                s.tag.text = st == SlotState.Claimed ? "받음" : st == SlotState.Today ? "오늘" : st == SlotState.Next ? "내일" : $"+{ahead}일";
                s.frame.color = st == SlotState.Claimed ? claimedColor : st == SlotState.Today ? todayColor : st == SlotState.Next ? nextColor : futureColor;
                s.frame.transform.localScale = Vector3.one;
                s.stamp.SetActive(st == SlotState.Claimed);   // 켜기 · 끄기를 둘 다 — 지난 상태가 남지 않게
                if (st == SlotState.Claimed) s.stampDate.text = ServerClock.DayLabel(attendance.claimed[k], resetHour);
                int missed = attendance.MissedBefore(k, today);
                s.missed.SetActive(missed > 0);
                if (missed > 0) s.missedText.text = $"놓친 날 {missed}";
                if (st == SlotState.Today) todaySlot = k;
            }
            brokeBanner.gameObject.SetActive(attendance.brokeLost > 0);
            if (attendance.brokeLost > 0)
                brokeBanner.text = $"연속 끊김 — {ServerClock.DayLabel(attendance.brokeDay, resetHour)} 를 놓쳐 {attendance.brokeLost}칸을 잃었다 · 1일차부터";
            ruleChip.text = attendance.rule == AttendanceRule.Streak ? "연속 출석 · 놓치면 1일차부터" : "누적 출석 · 놓쳐도 다음 칸으로";
        }

        void RefreshTimers(DateTime now, int today)
        {
            clockText.text = $"서버 {ServerClock.Clock(now, serverTzHours)} (UTC+{serverTzHours})";
            TimeSpan left = ServerClock.NextReset(now, resetHour, serverTzHours) - now;
            resetCountdown.text = ServerClock.Format(left);
            bool done = attendance.ClaimedToday(today);
            claimLabel.text = done ? $"받음 · 다음 보급까지 {ServerClock.Format(left)}" : $"{attendance.claimed.Count + 1}일차 보급 받기";
            SetOff(claimButton, claimOn, done);

            int v = energy.Current(now, out TimeSpan next, out TimeSpan full);
            bool regen = v < energy.max;
            valueText.text = $"{v} / {energy.max}";
            overTag.SetActive(v > energy.max);
            fill.fillAmount = Mathf.Clamp01((float)v / energy.max);
            nextText.text = regen ? ServerClock.Format(next) : v > energy.max ? "정지" : "가득";
            fullText.text = regen ? ServerClock.Format(full) : "—";

            // 부족하면 꺼진 색 + 남은 시간을 버튼 글자에
            bool lack = v < stageCost;
            SetOff(enterButton, enterOn, lack);
            enterLabel.text = lack ? energy.LackLabel(stageCost, now) : $"탐사 출발  −{stageCost}";

            DateTime? fullAt = energy.FullAt(now);
            if (fullAt != scheduledFull)
            {
                scheduledFull = fullAt;
                ScheduleFullNotification(fullAt.HasValue ? fullAt.Value - now : (TimeSpan?)null);
            }
            notifyText.text = fullAt.HasValue ? $"가득 참 알림 · {ServerClock.Format(fullAt.Value - now)} 뒤" : "가득 참 알림 예약 없음";
        }

        /// <summary>연결 지점: 가득 참 로컬 알림 (Mobile Notifications 패키지, 이전 것 취소 후 예약). 기기 시계로 울리니 '남은 시간' 으로 예약한다</summary>
        void ScheduleFullNotification(TimeSpan? delay)
        {
            // 예: 이전 알림 취소 → delay 가 있으면 fireTime = DateTime.Now + delay 로 새로 예약
            if (delay.HasValue) Debug.Log($"[TimeGated] 가득 참 알림 예약: {ServerClock.Format(delay.Value)} 뒤");
            else Debug.Log("[TimeGated] 가득 참 알림 취소 (가득 · 초과)");
        }

        /* ───── 동작 (버튼 · 시험 도구) ───── */

        public void Claim()
        {
            if (!Ready) return;
            DateTime now = Now;
            int today = Today(now);
            // 실제 게임: 서버에 받기 요청 → 서버가 '자기 시각' 으로 같은 판정 → 확정 응답 뒤 반영 (battle-pass-track 의 '받는 중')
            if (!attendance.TryClaim(today, out DayReward r)) return;
            if (r.isFuel) energy.Add(r.count, now);   // 4일차 연료 30 → 최대치를 넘으면 초과 · 회복 정지
            Message?.Invoke($"{attendance.claimed.Count}일차 보급: {r.name} ×{r.count}");
            RefreshBoard(today);
            lastSecond = 0;
        }

        public void Depart()
        {
            if (!Ready) return;
            DateTime now = Now;
            if (!energy.TrySpend(stageCost, now)) { Message?.Invoke(energy.LackLabel(stageCost, now)); return; }
            Message?.Invoke($"탐사 출발 — 연료 −{stageCost}");
            lastSecond = 0;
        }

        public void AddFuel(int amount)
        {
            if (!Ready) return;
            energy.Add(amount, Now);   // 자르지 않는다
            lastSecond = 0;
        }

        /// <summary>시험 도구에서 기기 시계 · 앱 꺼짐을 바꾼 뒤 부른다</summary>
        public void ForceRefresh()
        {
            lastDay = int.MinValue;
            lastSecond = 0;
        }
    }
}
