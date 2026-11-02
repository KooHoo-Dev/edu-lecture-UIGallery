using System;
using System.Collections;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 결과·보상 정산 화면 — UGUI 버전.
    /// 단계(배너 → 정산 → 레벨 업 → 물자 → 등급 → 완료)를 코루틴으로 하나씩 진행한다.
    ///
    /// 입력 소비 규칙: 확인 입력 하나는 한 단계만 처리한다.
    ///   · 연출 중 입력  → 현재 단계를 즉시 완료 (값은 정확한 최종값으로 확정)
    ///   · 완료 뒤 입력  → 다음 단계
    ///   · 진입 직후 inputLock 동안 들어온 입력은 버린다 (전투 중 연타 방지)
    /// 시간은 모두 Time.unscaledDeltaTime — 결과 화면에서 Time.timeScale = 0 이어도 동작한다.
    /// </summary>
    public class ResultsSequence : MonoBehaviour
    {
        public enum TallyMode { CategoryPages, LedgerLines }
        public enum SkipBehavior { FinishStep, SkipAll, Disabled }
        public enum CountEasing { Linear, EaseOutCubic, EaseOutExpo }

        [Header("입력 (UI/Submit)")]
        [SerializeField] InputActionReference submit;

        [Header("참조")]
        [SerializeField] CanvasGroup root;
        [SerializeField] RectTransform banner;
        [SerializeField] CanvasGroup bannerGroup;
        [SerializeField] TMP_Text missionText;
        [SerializeField] RectTransform panel;
        [SerializeField] CanvasGroup panelGroup;
        [SerializeField] TMP_Text pageTitle;
        [SerializeField, Tooltip("슬롯 안의 행 — 최대 4개")] RewardRow[] rows;
        [SerializeField] TMP_Text totalLabel;
        [SerializeField] TMP_Text totalValue;
        [SerializeField, Tooltip("하린 · 도윤 · 세라 순서")] MemberCard[] members;
        [SerializeField] TMP_Text itemsText;
        [SerializeField] CanvasGroup levelUpGroup;
        [SerializeField] RectTransform levelUpCard;
        [SerializeField] TMP_Text levelUpText;
        [SerializeField] CanvasGroup rankGroup;
        [SerializeField] TMP_Text rankText;
        [SerializeField] TMP_Text promptHint;

        [Header("연출")]
        public TallyMode tallyMode = TallyMode.CategoryPages;
        [Range(0f, 2f), Tooltip("값 하나가 0 → 목표까지 걸리는 시간. 값의 크기와 무관하게 고정")]
        public float countupDuration = 0.9f;
        [Range(0f, 0.8f), Tooltip("행 등장 간격 (초)")]
        public float stagger = 0.25f;
        public CountEasing easing = CountEasing.EaseOutExpo;
        public SkipBehavior skipBehavior = SkipBehavior.FinishStep;
        public bool levelUpSpotlight = true;
        public bool rankStamp;
        [Range(0f, 3f), Tooltip("완료된 단계가 다음 단계로 저절로 넘어가기까지 (초). 0 이면 끔 — 입력을 기다린다")]
        public float autoAdvance = 1f;
        [SerializeField, Tooltip("진입 직후 입력을 버리는 시간 (초)")] float inputLock = 0.3f;

        const float BannerIn = 0.45f;
        const float PanelIn = 0.3f;
        const float RowIn = 0.2f;
        const float DimIn = 0.2f;
        const float CardIn = 0.4f;
        const float StampIn = 0.35f;
        const float CloseOut = 0.25f;

        public event Action OnResultsClosed;

        ResultData data;
        bool pendingPress;        // 아직 쓰지 않은 확인 입력 (여러 번 와도 1개)
        bool finishRequested;     // 현재 단계를 즉시 끝내라
        bool skipAllRequested;    // 다음 '반드시 볼 단계'까지 모두 끝내라
        float lockUntil;
        Coroutine running;
        Vector2 bannerHome, panelHome;
        readonly StringBuilder sb = new();
        long shownTotal = -1;     // 직전에 표시한 합계 — 바뀔 때만 문자열을 만든다

        void Awake()
        {
            bannerHome = banner.anchoredPosition;
            panelHome = panel.anchoredPosition;
            root.alpha = 0f;
        }

        void OnEnable()
        {
            if (submit == null) return;
            submit.action.performed += OnSubmit;
            submit.action.Enable();
        }

        void OnDisable()
        {
            if (submit != null) submit.action.performed -= OnSubmit;
        }

        void OnSubmit(InputAction.CallbackContext _) => Press();

        /// <summary>확인 입력 — Input System 이벤트, 화면 버튼, 테스트 스크립트가 모두 이 한 곳으로 들어온다</summary>
        public void Press()
        {
            if (Time.unscaledTime < lockUntil) return;   // 진입 잠금: 전투 중 연타는 기록하지 않고 버린다
            pendingPress = true;
        }

        /// <summary>입력을 꺼내 쓰면 플래그가 내려간다 → 한 입력이 두 단계를 넘기는 '관통'이 생기지 않는다</summary>
        bool ConsumePress()
        {
            if (!pendingPress) return false;
            pendingPress = false;
            return true;
        }

        public void Play(ResultData result)
        {
            data = result;
            if (running != null) StopCoroutine(running);
            running = StartCoroutine(Sequence());
        }

        IEnumerator Sequence()
        {
            pendingPress = false;
            skipAllRequested = false;
            lockUntil = Time.unscaledTime + inputLock;
            ResetView();

            yield return Step(Banner(), "", noHold: true);   // 배너는 끝나면 바로 정산으로 (대기·확인 입력 없음)

            bool showLevelUp = levelUpSpotlight && data.HasLevelUp;
            if (tallyMode == TallyMode.CategoryPages)
            {
                yield return Step(Page("획득 경험치", "경험치 합계", data.expLines, expFromRows: true), showLevelUp ? "다음 · 레벨 업" : "다음 · 크레딧");
                if (showLevelUp) yield return LevelUpStep();
                yield return Step(Page("획득 크레딧", "크레딧 합계", data.creditLines, expFromRows: false), "다음 · 물자");
            }
            else
            {
                // 원장형: 크레딧 행이 한 줄씩 붙는 동안 파티 경험치는 같은 시간에 함께 오른다
                yield return Step(Page("정산 원장", "크레딧 합계", data.creditLines, expFromRows: false, expParallel: true), showLevelUp ? "다음 · 레벨 업" : "다음 · 물자");
                if (showLevelUp) yield return LevelUpStep();
            }
            yield return Step(Items(), rankStamp ? "다음 · 등급" : "다음 · 완료");
            if (rankStamp) yield return Step(Rank(), "다음 · 완료");

            // 완료: 자동으로 닫지 않는다 — 입력을 기다림
            skipAllRequested = false;
            SetHint("닫기");
            yield return new WaitUntil(ConsumePress);
            yield return Close();
            running = null;
        }

        /// <summary>
        /// 단계 하나 = ① 연출(입력이 오면 즉시 완료) → ② 완료 상태에서 다음 입력 또는 자동 진행 대기.
        /// 연출 코루틴은 yield return null 만 쓰고, finishRequested 를 보면 바로 끝 상태로 간다.
        /// noHold: ② 를 건너뛴다 (배너처럼 끝나면 곧바로 다음 단계가 이어지는 연출)
        /// </summary>
        IEnumerator Step(IEnumerator anim, string nextHint, bool alwaysWait = false, bool noHold = false)
        {
            finishRequested = skipAllRequested;
            SetHint(skipBehavior == SkipBehavior.FinishStep ? "이 단계 완료" : skipBehavior == SkipBehavior.SkipAll ? "모두 건너뛰기" : "");

            // ① 연출 — anim 을 한 프레임씩 직접 돌리며 입력을 확인한다
            while (anim.MoveNext())
            {
                if (!finishRequested && ConsumePress() && skipBehavior != SkipBehavior.Disabled)
                {
                    finishRequested = true;                                         // 이 입력은 '현재 단계 완료'에 쓰였다
                    if (skipBehavior == SkipBehavior.SkipAll) skipAllRequested = true;
                }
                yield return anim.Current;
            }
            if (skipBehavior == SkipBehavior.Disabled) pendingPress = false;          // 스킵 불가: 연출 중 입력은 버린다

            // ② 완료 — 모두 건너뛰기 중이면 바로 다음 단계로
            if (noHold || (skipAllRequested && !alwaysWait)) yield break;
            SetHint(nextHint);
            float waited = 0f;
            while (true)
            {
                if (ConsumePress()) yield break;                                    // 이 입력은 '다음 단계로'에 쓰였다
                if (!alwaysWait && autoAdvance > 0f)
                {
                    waited += Time.unscaledDeltaTime;
                    if (waited >= autoAdvance) yield break;                         // 시간 제한은 0 으로 끌 수 있다
                }
                yield return null;
            }
        }

        /* ───────── 단계별 연출 ───────── */

        IEnumerator Banner()
        {
            float t = 0f;
            while (t < BannerIn + PanelIn && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                ApplyBanner(t);
                yield return null;
            }
            ApplyBanner(BannerIn + PanelIn);
        }

        void ApplyBanner(float t)
        {
            float b = Mathf.Clamp01(t / BannerIn);
            banner.localScale = Vector3.one * (1.6f - 0.6f * EaseOutBack(b));
            bannerGroup.alpha = Mathf.Clamp01(b * 4f);
            float p = Mathf.Clamp01((t - BannerIn) / PanelIn);
            panel.anchoredPosition = panelHome + new Vector2((1f - EaseOutCubic(p)) * 140f, 0f);
            panelGroup.alpha = p;
        }

        IEnumerator Page(string title, string total, RewardLine[] lines, bool expFromRows, bool expParallel = false)
        {
            pageTitle.text = title;
            totalLabel.text = total;
            for (int i = 0; i < rows.Length; i++)
            {
                bool used = i < lines.Length;
                rows[i].gameObject.SetActive(used);
                if (used) rows[i].Setup(lines[i]);
            }
            SetTotal(0);
            long expTotal = data.ExpTotal;
            float dur = (lines.Length - 1) * stagger + countupDuration;
            float t = 0f;
            while (t < dur && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                long sum = 0;
                for (int i = 0; i < lines.Length; i++)
                {
                    float local = t - i * stagger;
                    rows[i].Show(local / RowIn);
                    // 고정 시간 카운트업: 값이 50 이든 50,000 이든 countupDuration 안에 끝난다
                    float k = Ease(Mathf.Clamp01(local / Mathf.Max(0.0001f, countupDuration)));
                    long v = (long)Math.Round(lines[i].value * (double)k);   // 큰 값은 double 로 (float 정밀도 한계)
                    rows[i].SetValue(v);
                    sum += v;
                }
                SetTotal(sum);
                if (expFromRows) SetPartyGain(sum);
                else if (expParallel) SetPartyGain((long)Math.Round(expTotal * (double)Ease(Mathf.Clamp01(t / Mathf.Max(0.0001f, dur)))));
                yield return null;
            }
            // 최종값 확정 — 스킵이든 아니든 같은 함수로 끝낸다 (중간값에서 멈추는 실수 방지)
            for (int i = 0; i < lines.Length; i++)
            {
                rows[i].Show(1f);
                rows[i].SetValue(lines[i].value);
            }
            SetTotal(ResultData.Sum(lines));
            if (expFromRows || expParallel) SetPartyGain(expTotal);
        }

        void SetTotal(long v)
        {
            if (v == shownTotal) return;
            shownTotal = v;
            totalValue.text = v.ToString("N0");
        }

        IEnumerator LevelUpStep()
        {
            skipAllRequested = false;   // 레벨 업은 '결과'로 남긴다 — 모두 건너뛰기도 여기서 멈춘다
            sb.Clear();
            foreach (var m in data.party)
            {
                var (level, _) = ResultData.LevelAfter(m.level, m.exp, data.ExpTotal);
                int ups = level - m.level;
                if (ups <= 0) continue;
                sb.Append("<size=120%>").Append(m.name).Append("</size>  Lv ").Append(m.level).Append(" → <b>").Append(level).Append("</b>\n");
                sb.Append("최대 체력 ").Append(m.hp).Append(" → ").Append(m.hp + 24 * ups);
                sb.Append("   출력 ").Append(m.power).Append(" → ").Append(m.power + 3 * ups).Append('\n');
                sb.Append("새 기술 · ").Append(m.skill).Append("\n\n");
            }
            levelUpText.text = sb.ToString();
            yield return Step(LevelUpIn(), "계속", alwaysWait: true);   // 자동 진행 없음 — 입력으로만 닫힌다
            levelUpGroup.alpha = 0f;
        }

        IEnumerator LevelUpIn()
        {
            float t = 0f;
            while (t < DimIn + CardIn && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                ApplyLevelUp(t);
                yield return null;
            }
            ApplyLevelUp(DimIn + CardIn);
        }

        void ApplyLevelUp(float t)
        {
            levelUpGroup.alpha = Mathf.Clamp01(t / DimIn);
            float a = Mathf.Clamp01((t - DimIn) / CardIn);
            levelUpCard.localScale = Vector3.one * (0.6f + 0.4f * EaseOutBack(a));
        }

        IEnumerator Items()
        {
            int n = data.items.Length;
            float dur = (n - 1) * stagger + 0.28f;
            float t = 0f;
            int shown = -1;
            while (t < dur && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                int count = Mathf.Min(n, Mathf.FloorToInt(t / Mathf.Max(0.0001f, stagger)) + 1);
                if (count != shown)
                {
                    shown = count;
                    itemsText.text = ItemsString(count);
                }
                yield return null;
            }
            itemsText.text = ItemsString(n);
        }

        string ItemsString(int count)
        {
            sb.Clear();
            for (int i = 0; i < count; i++)
            {
                var it = data.items[i];
                sb.Append("◆ ").Append(it.name).Append(" ×").Append(it.count);
                if (it.isNew) sb.Append(" <color=#36D6C3>신규</color>");
                sb.Append("    ");
            }
            return sb.ToString();
        }

        IEnumerator Rank()
        {
            rankText.text = data.rank;
            float t = 0f;
            while (t < StampIn + 0.2f && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                ApplyRank(t);
                yield return null;
            }
            ApplyRank(StampIn + 0.2f);
        }

        void ApplyRank(float t)
        {
            float p = Mathf.Clamp01(t / StampIn);
            float pulse = t > StampIn ? Mathf.Sin(Mathf.PI * Mathf.Clamp01((t - StampIn) / 0.2f)) * 0.08f : 0f;
            rankGroup.alpha = Mathf.Clamp01(p * 3f);
            rankGroup.transform.localScale = Vector3.one * (2f - p * p + pulse);   // 2배 → 1배로 가속하며 '찍힘'
        }

        IEnumerator Close()
        {
            SetHint("");
            float t = 0f;
            while (t < CloseOut)
            {
                t += Time.unscaledDeltaTime;
                float p = Mathf.Clamp01(t / CloseOut);
                root.alpha = 1f - p;
                root.transform.localPosition = new Vector3(0f, -60f * p * p, 0f);
                yield return null;
            }
            root.alpha = 0f;
            root.blocksRaycasts = false;
            OnResultsClosed?.Invoke();
        }

        /* ───────── 도우미 ───────── */

        void ResetView()
        {
            root.alpha = 1f;
            root.blocksRaycasts = true;
            root.transform.localPosition = Vector3.zero;
            missionText.text = data.mission;
            banner.anchoredPosition = bannerHome;
            ApplyBanner(0f);
            for (int i = 0; i < members.Length && i < data.party.Length; i++) members[i].Setup(data.party[i]);
            foreach (var r in rows) r.gameObject.SetActive(false);
            shownTotal = -1;
            SetTotal(0);
            itemsText.text = "";
            levelUpGroup.alpha = 0f;
            rankGroup.alpha = 0f;
        }

        void SetPartyGain(long gain)
        {
            foreach (var m in members) m.SetGain(gain);
        }

        void SetHint(string action) => promptHint.text = string.IsNullOrEmpty(action) ? "" : "확인: " + action;

        float Ease(float t) => easing switch
        {
            CountEasing.Linear => t,
            CountEasing.EaseOutCubic => EaseOutCubic(t),
            _ => t >= 1f ? 1f : 1f - Mathf.Pow(2f, -10f * t),
        };

        static float EaseOutCubic(float t) => 1f - Mathf.Pow(1f - t, 3f);

        static float EaseOutBack(float t)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
        }
    }
}
