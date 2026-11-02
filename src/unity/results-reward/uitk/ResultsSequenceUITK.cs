using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 결과·보상 정산 화면 — UI Toolkit 버전.
    /// 등장 모션(배너 · 패널 · 행 · 레벨 업 · 도장)은 USS transition + 클래스 토글이 맡고,
    /// 숫자 카운트업과 단계 진행(입력 소비)은 코루틴이 맡는다. 단계 규칙은 UGUI 판(ResultsSequence)과 같다.
    ///   · 연출 중 확인 입력 → 현재 단계 즉시 완료 (값 확정 + .results--instant 로 남은 transition 생략)
    ///   · 완료 뒤 확인 입력 → 다음 단계
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class ResultsSequenceUITK : MonoBehaviour
    {
        public enum SkipBehavior { FinishStep, SkipAll, Disabled }

        [SerializeField] InputActionReference submit;   // UI/Submit
        [Range(0f, 2f)] public float countupDuration = 0.9f;
        [Range(0f, 0.8f)] public float stagger = 0.25f;
        public SkipBehavior skipBehavior = SkipBehavior.FinishStep;
        public bool levelUpSpotlight = true;
        public bool rankStamp;
        [Range(0f, 3f), Tooltip("0 이면 자동 진행 끔")] public float autoAdvance = 1f;
        [SerializeField] float inputLock = 0.3f;
        [SerializeField, Tooltip("게임 옵션의 '모션 줄이기'")] bool reduceMotion;

        VisualElement root, banner, party, panel, rows, levelUp;
        Label mission, pageTitle, totalLabel, totalValue, items, rank, levelUpText, hint;
        readonly List<VisualElement> memberFills = new();
        readonly List<Label> memberLevels = new();
        readonly List<Label> memberExps = new();
        readonly List<VisualElement> memberCards = new();
        readonly List<Label> rowValues = new();
        readonly StringBuilder sb = new();
        // 직전에 표시한 값 — 바뀔 때만 Label.text 를 갱신한다 (매 프레임 새 문자열 = GC)
        readonly List<int> shownLevels = new();
        readonly List<long> shownExps = new();
        long shownGain = -1, shownTotal = -1;

        ResultData data;
        bool pendingPress, finishRequested, skipAllRequested;
        float lockUntil;
        Coroutine running;

        void OnEnable()
        {
            // UIDocument 는 활성화될 때마다 트리를 새로 만든다 → 참조를 매번 다시 모은다
            root = GetComponent<UIDocument>().rootVisualElement.Q("root");
            banner = root.Q("banner");
            party = root.Q("party");
            panel = root.Q("panel");
            rows = root.Q("rows");
            levelUp = root.Q("levelup");
            mission = root.Q<Label>("mission");
            pageTitle = root.Q<Label>("page-title");
            totalLabel = root.Q<Label>("total-label");
            totalValue = root.Q<Label>("total-value");
            items = root.Q<Label>("items");
            rank = root.Q<Label>("rank");
            levelUpText = root.Q<Label>("levelup-text");
            hint = root.Q<Label>("hint");
            root.EnableInClassList("results--reduced", reduceMotion);

            if (submit != null)
            {
                submit.action.performed += OnSubmit;   // 람다가 아닌 메서드로 붙여야 OnDisable 에서 뗄 수 있다
                submit.action.Enable();
            }
        }

        void OnDisable()
        {
            if (submit != null) submit.action.performed -= OnSubmit;
        }

        void OnSubmit(InputAction.CallbackContext _) => Press();

        public void Press()
        {
            if (Time.unscaledTime < lockUntil) return;   // 진입 잠금
            pendingPress = true;
        }

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
            BuildView();
            yield return null;   // 첫 프레임에는 transition 이 걸리지 않는다 → 한 프레임 뒤에 클래스를 붙인다

            yield return Step(Banner(), "", noHold: true);   // 배너는 끝나면 바로 정산으로 (대기·확인 입력 없음)
            yield return Step(Page("획득 경험치", "경험치 합계", data.expLines, true), "다음");
            if (levelUpSpotlight && data.HasLevelUp)
            {
                skipAllRequested = false;   // 레벨 업은 결과로 남긴다
                yield return Step(LevelUpIn(), "계속", alwaysWait: true);
                levelUp.RemoveFromClassList("levelup--open");
            }
            yield return Step(Page("획득 크레딧", "크레딧 합계", data.creditLines, false), "다음");
            yield return Step(Items(), "다음");
            if (rankStamp) yield return Step(Rank(), "다음");

            skipAllRequested = false;
            SetHint("닫기");
            yield return new WaitUntil(ConsumePress);
            root.style.opacity = 0f;   // 닫기 (필요하면 .results--closing 클래스 + TransitionEndEvent 로)
            running = null;
        }

        IEnumerator Step(IEnumerator anim, string nextHint, bool alwaysWait = false, bool noHold = false)
        {
            root.RemoveFromClassList("results--instant");
            finishRequested = skipAllRequested;
            if (finishRequested) root.AddToClassList("results--instant");
            SetHint(skipBehavior == SkipBehavior.FinishStep ? "이 단계 완료" : skipBehavior == SkipBehavior.SkipAll ? "모두 건너뛰기" : "");

            while (anim.MoveNext())
            {
                if (!finishRequested && ConsumePress() && skipBehavior != SkipBehavior.Disabled)
                {
                    finishRequested = true;
                    if (skipBehavior == SkipBehavior.SkipAll) skipAllRequested = true;
                    root.AddToClassList("results--instant");   // 진행 중인 transition 을 끝 상태로
                }
                yield return anim.Current;
            }
            if (skipBehavior == SkipBehavior.Disabled) pendingPress = false;

            if (noHold || (skipAllRequested && !alwaysWait)) yield break;
            SetHint(nextHint);
            float waited = 0f;
            while (true)
            {
                if (ConsumePress()) yield break;
                if (!alwaysWait && autoAdvance > 0f && (waited += Time.unscaledDeltaTime) >= autoAdvance) yield break;
                yield return null;
            }
        }

        /* ───────── 단계 ───────── */

        IEnumerator Banner()
        {
            banner.AddToClassList("banner--shown");
            panel.AddToClassList("panel--shown");   // USS 의 transition-delay 450ms 로 배너 뒤에 들어온다
            yield return Wait(0.75f);
        }

        IEnumerator Page(string title, string totalText, RewardLine[] lines, bool drivesExp)
        {
            pageTitle.text = title;
            totalLabel.text = totalText;
            rows.Clear();
            rowValues.Clear();
            var made = new List<VisualElement>();
            for (int i = 0; i < lines.Length; i++)
            {
                var row = new VisualElement();
                row.AddToClassList("row");
                var label = new Label(lines[i].label);
                label.AddToClassList("row__label");
                var sub = new Label(lines[i].sub);
                sub.AddToClassList("row__sub");
                var value = new Label("+0");
                value.AddToClassList("row__value");
                row.Add(label);
                row.Add(sub);
                row.Add(value);
                rows.Add(row);
                rowValues.Add(value);
                made.Add(row);
                // 만든 프레임에 바로 붙이면 transition 이 없다 → 간격만큼(최소 1프레임) 늦게
                var r = row;
                root.schedule.Execute(() => r.AddToClassList("row--shown")).StartingIn((long)(stagger * 1000f * i) + 16);
            }

            float dur = (lines.Length - 1) * stagger + countupDuration;
            float t = 0f;
            long[] shown = new long[lines.Length];
            bool[] landed = new bool[lines.Length];
            SetTotal(0);
            while (t < dur && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                long sum = 0;
                for (int i = 0; i < lines.Length; i++)
                {
                    float local = t - i * stagger;
                    float k = EaseOutExpo(Mathf.Clamp01(local / Mathf.Max(0.0001f, countupDuration)));
                    long v = (long)Math.Round(lines[i].value * (double)k);
                    if (v != shown[i])
                    {
                        shown[i] = v;
                        rowValues[i].text = "+" + v.ToString("N0");   // 값이 바뀔 때만 문자열 생성
                    }
                    if (k >= 1f && !landed[i])
                    {
                        landed[i] = true;
                        made[i].AddToClassList("row--landed");
                        PulseTotal();   // 행 값이 확정될 때마다 합계가 한 번 맥동
                    }
                    sum += v;
                }
                SetTotal(sum);
                if (drivesExp) SetPartyGain(sum);
                yield return null;
            }

            // 최종값 확정 (스킵이든 아니든)
            for (int i = 0; i < lines.Length; i++)
            {
                made[i].AddToClassList("row--shown");
                made[i].AddToClassList("row--landed");
                rowValues[i].text = "+" + lines[i].value.ToString("N0");
            }
            SetTotal(ResultData.Sum(lines));
            if (drivesExp) SetPartyGain(data.ExpTotal);
        }

        void SetTotal(long v)
        {
            if (v == shownTotal) return;
            shownTotal = v;
            totalValue.text = v.ToString("N0");
        }

        void PulseTotal()
        {
            totalValue.AddToClassList("total__value--pulse");   // scale 1 → 1.12 (75ms) → 1 (75ms)
            totalValue.schedule.Execute(() => totalValue.RemoveFromClassList("total__value--pulse")).StartingIn(75);
        }

        IEnumerator LevelUpIn()
        {
            sb.Clear();
            foreach (var m in data.party)
            {
                var (level, _) = ResultData.LevelAfter(m.level, m.exp, data.ExpTotal);
                int ups = level - m.level;
                if (ups <= 0) continue;
                sb.Append(m.name).Append("   Lv ").Append(m.level).Append(" → ").Append(level).Append('\n');
                sb.Append("최대 체력 ").Append(m.hp).Append(" → ").Append(m.hp + 24 * ups).Append("   출력 ").Append(m.power).Append(" → ").Append(m.power + 3 * ups).Append('\n');
                sb.Append("새 기술 · ").Append(m.skill).Append("\n\n");
            }
            levelUpText.text = sb.ToString();
            levelUp.AddToClassList("levelup--open");   // 딤 200ms → 카드 400ms (USS)
            yield return Wait(0.6f);
        }

        IEnumerator Items()
        {
            sb.Clear();
            int n = data.items.Length;
            float t = 0f;
            int shown = 0;
            float dur = (n - 1) * stagger + 0.28f;
            while (t < dur && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                int count = Mathf.Min(n, Mathf.FloorToInt(t / Mathf.Max(0.0001f, stagger)) + 1);
                if (count != shown)
                {
                    shown = count;
                    items.text = ItemsString(count);
                }
                yield return null;
            }
            items.text = ItemsString(n);
        }

        string ItemsString(int count)
        {
            sb.Clear();
            for (int i = 0; i < count; i++)
            {
                var it = data.items[i];
                sb.Append("◆ ").Append(it.name).Append(" ×").Append(it.count).Append(it.isNew ? " (신규)" : "").Append("    ");
            }
            return sb.ToString();
        }

        IEnumerator Rank()
        {
            rank.text = data.rank;
            rank.AddToClassList("rank--stamped");   // 2배 → 1배 (USS)
            yield return Wait(0.55f);
        }

        /* ───────── 도우미 ───────── */

        IEnumerator Wait(float seconds)
        {
            float t = 0f;
            while (t < seconds && !finishRequested)
            {
                t += Time.unscaledDeltaTime;
                yield return null;
            }
        }

        void BuildView()
        {
            // 두 번째 Play 부터: 클래스를 떼는 순간 '숨김 쪽' transition 이 시작되지 않게 즉시 초기 상태로 되돌린다.
            // 다음 프레임 Step() 이 instant 를 떼고 클래스를 붙이므로 등장 transition 은 처음처럼 재생된다
            root.AddToClassList("results--instant");
            root.style.opacity = 1f;
            banner.RemoveFromClassList("banner--shown");
            panel.RemoveFromClassList("panel--shown");
            rank.RemoveFromClassList("rank--stamped");
            levelUp.RemoveFromClassList("levelup--open");
            mission.text = data.mission;
            items.text = "";
            rows.Clear();
            shownTotal = -1;
            SetTotal(0);

            party.Clear();
            memberCards.Clear();
            memberFills.Clear();
            memberLevels.Clear();
            memberExps.Clear();
            shownLevels.Clear();
            shownExps.Clear();
            shownGain = -1;
            foreach (var m in data.party)
            {
                var card = new VisualElement();
                card.AddToClassList("member");
                var head = new VisualElement();
                head.AddToClassList("member__head");
                var name = new Label(m.name);
                name.AddToClassList("member__name");
                var level = new Label();
                level.AddToClassList("member__level");
                head.Add(name);
                head.Add(level);
                var bar = new VisualElement();
                bar.AddToClassList("member__bar");
                var fill = new VisualElement();
                fill.AddToClassList("member__fill");
                bar.Add(fill);
                var exp = new Label();
                exp.AddToClassList("member__exp");
                card.Add(head);
                card.Add(bar);
                card.Add(exp);
                party.Add(card);
                memberCards.Add(card);
                memberFills.Add(fill);
                memberLevels.Add(level);
                memberExps.Add(exp);
                shownLevels.Add(-1);
                shownExps.Add(-1);
            }
            SetPartyGain(0);
        }

        void SetPartyGain(long gain)
        {
            for (int i = 0; i < data.party.Length && i < memberFills.Count; i++)
            {
                var m = data.party[i];
                var (level, exp) = ResultData.LevelAfter(m.level, m.exp, gain);
                long need = ResultData.NeedFor(level);
                memberFills[i].style.width = Length.Percent(100f * exp / need);
                if (level != shownLevels[i])
                {
                    shownLevels[i] = level;
                    memberLevels[i].text = "Lv " + level;
                    memberCards[i].EnableInClassList("member--up", level > m.level);
                }
                if (exp != shownExps[i] || gain != shownGain)
                {
                    shownExps[i] = exp;
                    memberExps[i].text = exp.ToString("N0") + " / " + need.ToString("N0") + (gain > 0 ? "   +" + gain.ToString("N0") : "");
                }
            }
            shownGain = gain;
        }

        void SetHint(string action) => hint.text = string.IsNullOrEmpty(action) ? "" : "확인: " + action;

        static float EaseOutExpo(float t) => t >= 1f ? 1f : 1f - Mathf.Pow(2f, -10f * t);
    }
}
