// 시험용 — PassModel(상태 머신) · PassTrack(가로 재활용) · ClaimResultPopup(입력 잠금) · ServerClock(서버 시각)을 묶는다.
// 실제 서버 없이 '받기 요청 → serverDelayMs 뒤 확인' 을 코루틴으로 흉내 낸다. 확인 전에는 칸이 Claiming 이라 다시 보내지 않는다.
// 키(새 Input System): Enter(submitAction) 첫 칸 받기 · 결과 창이면 확인 · X 경험치 +700 · L +3,200 · C 모두 받기 · P 프리미엄(시연) · Home 현재 레벨로
// 카운트다운 비교: clockSource 를 Device 로 두고 운영체제 시계를 하루 앞당겨 보면 남은 시간이 하루 준다. Server 면 그대로.
using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.BattlePassTrack
{
    public class BattlePassDemo : MonoBehaviour
    {
        [SerializeField] PassTrack track;
        [SerializeField] ClaimResultPopup popup;
        [SerializeField] TextMeshProUGUI levelText, xpText, countdownText, clocksText, honestText, claimAllCount;
        [SerializeField] Image xpFill;
        [SerializeField] Button claimAllButton, premiumButton, toNowButton;
        [Tooltip("이 예제 전용 액션 (Enter · 패드 아래 버튼). UI/Submit 을 넣지 않는다 — EventSystem 도 같은 입력을 처리해 한 번에 두 번 불린다. context.time(누른 시각)을 결과 창 잠금에 넘긴다")]
        [SerializeField] InputActionReference submitAction;

        [Header("패스")]
        [Range(30, 100)] [SerializeField] int levelCount = 50;
        [Range(1, 3)] [SerializeField] int freeEvery = 2;
        [Tooltip("시연용 토글 — 결제 흐름은 흉내 내지 않는다")]
        [SerializeField] bool premiumOwned;
        [SerializeField] ClockSource clockSource = ClockSource.Server;
        [Tooltip("정직한 안내의 가정값: 하루에 얻는 경험치")]
        [SerializeField] int dailyXp = 1500;
        [Tooltip("서버 확인까지 걸리는 시간 흉내 (ms)")]
        [SerializeField] float serverDelayMs = 350f;

        [Header("서버가 준 시각 (실제로는 로그인 응답에서 받는다)")]
        [SerializeField] string serverNowUtc = "2026-11-02T05:47:27Z";
        [SerializeField] string seasonEndUtc = "2026-11-08T10:00:00Z";

        PassModel model;
        readonly ServerClock clock = new();
        DateTime seasonEnd;
        readonly List<TierRef> scratch = new();
        readonly List<List<TierRef>> inFlight = new();
        readonly HashSet<TierColumnView> hooked = new();
        float nextClockText;
        bool actionWasEnabled;
        System.Diagnostics.Stopwatch serverSim;
        DateTime serverSimStart;

        void Start()
        {
            model = new PassModel(levelCount, freeEvery, premiumOwned);
            model.Restore(23, 640, 17);
            model.Changed += OnModelChanged;
            // 접속할 때 한 번: 서버 시각 + 그 순간의 단조 시계. 읽지 못하면 동기화하지 않는다 ('동기화 중')
            if (ServerClock.TryParseUtc(serverNowUtc, out DateTime now))
            {
                clock.Sync(now, Time.realtimeSinceStartupAsDouble);
                serverSimStart = now;
                serverSim = System.Diagnostics.Stopwatch.StartNew();
            }
            if (!ServerClock.TryParseUtc(seasonEndUtc, out seasonEnd)) seasonEnd = DateTime.MaxValue;

            track.BindColumn = OnBindColumn;
            track.SetCount(model.LevelCount);
            claimAllButton.onClick.AddListener(ClaimAll);
            premiumButton.onClick.AddListener(() => model.SetPremium(!model.PremiumOwned));
            toNowButton.onClick.AddListener(OpenTrack);
            OpenTrack();
            OnModelChanged();
        }

        void OnEnable()
        {
            if (model != null)
            {
                model.Changed += OnModelChanged;   // 다시 켤 때 (처음에는 Start 가 단다)
                OnModelChanged();
                if (serverSim != null && !clock.IsSynced) StartCoroutine(Resync());   // 꺼질 때 멈춘 재동기화를 다시
            }
            if (submitAction == null) return;
            submitAction.action.performed += OnSubmit;
            actionWasEnabled = submitAction.action.enabled;   // 남이 켜 둔 액션이면 끌 때 그대로 둔다
            submitAction.action.Enable();
        }

        /// <summary>
        /// 백그라운드 · 잠자기에서 돌아왔다 — 그동안 단조 시계가 흘렀는지는 플랫폼마다 달라 서버 시각을 다시 받는다.
        /// 이 예제는 서버가 없어 Stopwatch 로 서버를 흉내 낸다 (실제로는 로그인 · 핑 응답의 서버 시각)
        /// </summary>
        void OnApplicationPause(bool paused)
        {
            if (paused || serverSim == null || !isActiveAndEnabled) return;
            clock.Invalidate();
            StartCoroutine(Resync());
        }

        IEnumerator Resync()
        {
            yield return new WaitForSecondsRealtime(serverDelayMs / 1000f);
            clock.Sync(serverSimStart + serverSim.Elapsed, Time.realtimeSinceStartupAsDouble);
        }

        void OnDisable()
        {
            if (submitAction != null)
            {
                submitAction.action.performed -= OnSubmit;
                if (!actionWasEnabled) submitAction.action.Disable();
            }
            // 확인을 기다리던 요청: 코루틴을 멈추고 칸을 받을 수 있음으로 되돌린다 (다시 열 때 서버 상태로 맞춘다).
            // 구독부터 풀어 꺼지는 중인 UI 를 건드리지 않게 한다
            StopAllCoroutines();
            if (model == null) return;
            model.Changed -= OnModelChanged;
            foreach (List<TierRef> list in inFlight) model.CompleteClaim(list, false);
            inFlight.Clear();
        }

        void OpenTrack()
        {
            track.SnapTo(model.Level);   // 트랙은 늘 지금 레벨로 연다 (Lv 1 부터 열지 않는다)
        }

        void OnBindColumn(TierColumnView view, int index)
        {
            if (hooked.Add(view)) view.Clicked += (level, row) => Claim(new TierRef(level, row));   // 처음 나온 칸에 한 번만
            view.Bind(model);
        }

        void OnModelChanged()
        {
            track.RefreshVisible();
            levelText.text = model.Level.ToString();
            bool max = model.Level >= model.LevelCount;
            xpFill.fillAmount = max ? 1f : model.Xp / (float)PassModel.XpPerLevel;
            xpText.text = max ? "최고 레벨" : $"{model.Xp:N0} / {PassModel.XpPerLevel:N0} XP";
            model.Claimables(scratch);
            claimAllCount.text = scratch.Count.ToString();
            claimAllButton.interactable = scratch.Count > 0;
        }

        public void Claim(TierRef t)
        {
            if (popup.IsOpen) return;
            if (!model.BeginClaim(t)) return;   // Claiming · Claimed · 잠김이면 보내지 않는다
            StartCoroutine(Request(new List<TierRef> { t }));
        }

        public void ClaimAll()
        {
            if (popup.IsOpen) return;
            model.Claimables(scratch);
            if (scratch.Count == 0) return;
            var list = new List<TierRef>(scratch);
            foreach (TierRef t in list) model.BeginClaim(t);   // 한 요청으로 모아 보낸다
            StartCoroutine(Request(list));
        }

        IEnumerator Request(List<TierRef> list)
        {
            inFlight.Add(list);
            yield return new WaitForSecondsRealtime(serverDelayMs / 1000f);
            inFlight.Remove(list);
            model.CompleteClaim(list, true);   // 실제로는 서버 응답의 결과(ok · 지급 목록)로
            popup.Show(model, list);
        }

        void OnSubmit(InputAction.CallbackContext ctx)
        {
            // UI 에 선택된 것(버튼 등)이 있으면 EventSystem 의 Submit 이 처리한다 — 같은 Enter 를 두 번 쓰지 않는다
            if (EventSystem.current != null && EventSystem.current.currentSelectedGameObject != null) return;
            if (popup.IsOpen) popup.Confirm(ctx.time);   // 누른 시각으로 잠금 판정
            else
            {
                model.Claimables(scratch);
                if (scratch.Count > 0) Claim(scratch[0]);
            }
        }

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb != null && !popup.IsOpen)
            {
                if (kb.xKey.wasPressedThisFrame) model.AddXp(700);
                if (kb.lKey.wasPressedThisFrame) model.AddXp(3200);
                if (kb.cKey.wasPressedThisFrame) ClaimAll();
                if (kb.pKey.wasPressedThisFrame) model.SetPremium(!model.PremiumOwned);
                if (kb.homeKey.wasPressedThisFrame) OpenTrack();
            }
            if (Time.unscaledTime >= nextClockText)
            {
                nextClockText = Time.unscaledTime + 0.25f;
                UpdateClockTexts();
            }
        }

        void UpdateClockTexts()
        {
            double mono = Time.realtimeSinceStartupAsDouble;
            if (!clock.TryRemaining(seasonEnd, mono, clockSource, out TimeSpan left))
            {
                countdownText.text = "동기화 중";   // 서버 시각을 모르면 숫자를 지어내지 않는다
                return;
            }
            countdownText.text = left > TimeSpan.Zero ? ServerClock.Format(left) : "시즌 종료";
            clocksText.text = $"서버 {clock.UtcNow(mono):MM.dd HH:mm:ss} UTC · 기기 {DateTime.Now:MM.dd HH:mm:ss}{(clockSource == ClockSource.Device ? " (기기 시계 기준)" : "")}";

            // 정직한 남은 양 (추정): 끝까지 남은 경험치 · 걸리는 날 · 시즌 끝 예상 레벨 · 받지 않은 보상
            model.Claimables(scratch);
            honestText.text = model.HonestSummary(dailyXp, left.TotalDays, scratch.Count);
        }
    }
}
