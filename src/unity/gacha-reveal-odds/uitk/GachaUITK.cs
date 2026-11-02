// UI Toolkit 판 뽑기 화면 — GachaTable · GachaServer 는 UGUI 폴더 것을 그대로 쓴다 (같은 namespace).
// - 확률표: ListView 하나. bindItem 이 table.ItemPercent(i) 를 그대로 읽는다 (손으로 적은 숫자 없음)
// - 흐름: 요청 → 응답(결과 확정) → .beam--on 예고 → 카드 생성 → 한 장씩 뒤집기(scale X 1 → 0 → 1) → 결과 + 입력 잠금
// - 뒤집기: USS 에 rotateY 가 없어 .card--squash(scale 0 1) transition 으로 흉내 내고, 가운데에서 .card--flipped 를 붙인다
// (교환형 천장의 교환 버튼은 UGUI 판 GachaRevealPanel.cs 에 있다)
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.GachaRevealOdds
{
    [RequireComponent(typeof(UIDocument))]
    public class GachaUITK : MonoBehaviour
    {
        [SerializeField] GachaTable table;
        [SerializeField] float teaseSeconds = 0.9f;
        [SerializeField] float dealSeconds = 0.45f;
        [SerializeField] float flipSeconds = 0.42f;
        [SerializeField] float heroHoldSeconds = 0.7f;
        [SerializeField] float inputLockSeconds = 0.4f;

        static readonly string[] GradeClass = { "hero", "rare", "common" };

        VisualElement beam, beamMark, cardsRoot, flash, tap, lockFill, pityFill;
        Label beamLabel, pityLabel, serverLog, pityRule;
        Button skipButton, pull1, pull10;
        ListView odds;
        /// <summary>확률표 줄: -1 − g = 등급 g 머리줄, 0 이상 = 항목 번호</summary>
        readonly List<int> rows = new();
        readonly List<VisualElement> cards = new();
        GachaServer server;
        Coroutine running;
        bool skip, advance;
        float unlockAt = -1f, pressedAt = -1f;
        int upFrame = -1;

        void OnEnable()
        {
            server ??= new GachaServer();
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            beam = root.Q("beam");
            beamMark = root.Q("beam-mark");
            beamLabel = root.Q<Label>("beam-label");
            cardsRoot = root.Q("cards");
            flash = root.Q("flash");
            tap = root.Q("tap");
            skipButton = root.Q<Button>("skip");
            pull1 = root.Q<Button>("pull-1");
            pull10 = root.Q<Button>("pull-10");
            lockFill = root.Q("lock-fill");
            pityLabel = root.Q<Label>("pity-label");
            pityFill = root.Q("pity-fill");
            serverLog = root.Q<Label>("server-log");
            pityRule = root.Q<Label>("pity-rule");
            odds = root.Q<ListView>("odds");

            pull1.clicked += OnPull1;
            pull10.clicked += OnPull10;
            // clicked 는 손을 뗄 때 온다 — 누른 시각은 TrickleDown 으로 먼저 받아 둔다
            pull1.RegisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            pull10.RegisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            pull1.RegisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            pull10.RegisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            skipButton.clicked += Skip;
            tap.RegisterCallback<PointerDownEvent>(OnTap);

            BuildOdds();
            UpdatePity(server.SinceHero, server.Points);
            SetBusy(false);
            // 연출 도중 꺼졌다 켜졌다(재접속) — 서버가 이미 정한 결과를 다시 받아 보여 준다. 새로 뽑지 않는다
            if (server.Unseen != null) running = StartCoroutine(Reveal(server.Unseen, "재접속 — 확인하지 않은 결과를 다시 받음"));
        }

        void OnDisable()
        {
            // 연출 중에 꺼지면 코루틴을 멈추고 결과 상태로 정리한다 (다시 켰을 때 반쯤 뒤집힌 카드 · 꺼지지 않은 탭 판이 남지 않게)
            StopAllCoroutines();
            running = null;
            if (pull1 == null) return;
            foreach (VisualElement card in cards)
            {
                card.RemoveFromClassList("card--squash");
                card.AddToClassList("card--flipped");
            }
            beam.RemoveFromClassList("beam--on");
            flash.style.opacity = 0f;
            SetBusy(false);
            pull1.clicked -= OnPull1;
            pull10.clicked -= OnPull10;
            pull1.UnregisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            pull10.UnregisterCallback<PointerDownEvent>(OnPress, TrickleDown.TrickleDown);
            pull1.UnregisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            pull10.UnregisterCallback<PointerUpEvent>(OnRelease, TrickleDown.TrickleDown);
            skipButton.clicked -= Skip;
            tap.UnregisterCallback<PointerDownEvent>(OnTap);
        }

        public void Skip() => skip = true;
        void OnTap(PointerDownEvent e) => advance = true;
        void OnPress(PointerDownEvent e) => pressedAt = Time.unscaledTime;
        void OnRelease(PointerUpEvent e) => upFrame = Time.frameCount;
        void OnPull1() => Pull(1);
        void OnPull10() => Pull(10);

        void Pull(int count)
        {
            // 마우스 · 터치는 누른 시각, 키보드 · 패드(Submit)는 지금 시각으로 판정.
            // clicked 는 손을 뗀 그 프레임에 온다 — 누르고 밖으로 끌어 클릭이 안 된 기록은 프레임으로 가린다
            float at = pressedAt >= 0f && upFrame == Time.frameCount ? pressedAt : Time.unscaledTime;
            pressedAt = -1f;
            if (running != null || at < unlockAt) return;
            running = StartCoroutine(PullRoutine(count));
        }

        /* ───── 확률표 (ListView) ───── */
        void BuildOdds()
        {
            rows.Clear();
            for (int g = 0; g < 3; g++)
            {
                rows.Add(-1 - g);
                for (int i = 0; i < table.items.Count; i++) if ((int)table.items[i].grade == g) rows.Add(i);
            }
            odds.fixedItemHeight = 32;
            odds.selectionType = SelectionType.None;
            odds.makeItem = () =>
            {
                var row = new VisualElement();
                row.AddToClassList("odds-row");
                row.Add(new Label { name = "label" });
                row.Add(new Label { name = "value" });
                return row;
            };
            odds.bindItem = (e, k) =>
            {
                int r = rows[k];
                bool header = r < 0;
                int g = header ? -1 - r : (int)table.items[r].grade;
                string value = header ? $"{table.GradePercent((Grade)g):0.00}%" : $"{table.ItemPercent(r):0.000}%";
                if (header && g == 0 && table.pityMode == PityMode.Guarantee) value += $"  (천장 포함 {table.ConsolidatedHeroPercent():0.00}%)";
                e.Q<Label>("label").text = header ? GachaTable.GradeNames[g] : table.items[r].displayName;
                e.Q<Label>("value").text = value;
                // 재활용되는 줄이라 이전 클래스를 매번 지우고 다시 붙인다
                e.EnableInClassList("odds-row--header", header);
                for (int c = 0; c < 3; c++) e.EnableInClassList("odds-row--" + GradeClass[c], header && c == g);
            };
            odds.itemsSource = rows;
            odds.Rebuild();
            pityRule.text = "천장 — " + table.PityRuleText();
        }

        /* ───── 연출 ───── */
        IEnumerator PullRoutine(int count)
        {
            SetBusy(true);
            skip = advance = false;
            serverLog.text = $"→ 요청 {count}회 …";
            ShowBeam(-1, "서버 응답 대기…");

            PullResult result = null;
            yield return server.Request(table, count, r => result = r);   // 결과 · 천장이 여기서 확정
            if (result.items.Count == 0)
            {
                serverLog.text = "← 응답 거절: 표 검사 실패 (콘솔 참고)";
                beam.RemoveFromClassList("beam--on");
                SetBusy(false);
                running = null;
                yield break;
            }
            yield return Reveal(result, $"← 응답: 결과 {count}개 확정 (내용은 공개 뒤에)");
        }

        IEnumerator Reveal(PullResult result, string log)
        {
            SetBusy(true);
            skip = advance = false;
            serverLog.text = log;
            Grade best = result.Best(table);
            ShowBeam((int)best, GachaTable.GradeNames[(int)best] + " 신호");
            yield return Wait(teaseSeconds);
            beam.RemoveFromClassList("beam--on");

            cardsRoot.Clear();
            cards.Clear();
            for (int i = 0; i < result.items.Count; i++) cards.Add(MakeCard(result.items[i], result.forced.Contains(i)));
            yield return Wait(dealSeconds);

            // 공개 간격 = flipSeconds (뒤집기 시간 포함). 뒤집기는 간격의 80%(최대 0.42초)를 반씩 나눠 접고 편다
            float half = Mathf.Min(flipSeconds * 0.8f, 0.42f) * 0.5f;
            foreach (VisualElement card in cards)
            {
                if (skip) break;
                advance = false;
                card.style.transitionDuration = new List<TimeValue> { new(half, TimeUnit.Second) };
                card.AddToClassList("card--squash");
                yield return new WaitForSecondsRealtime(half);
                card.AddToClassList("card--flipped");
                card.RemoveFromClassList("card--squash");
                bool hero = card.ClassListContains("card--hero");
                if (hero && RequestFlash()) StartCoroutine(Flash());
                yield return Wait(flipSeconds - half + (hero ? heroHoldSeconds : 0f));   // 펴는 절반은 이 대기 동안 transition 으로 진행
            }
            foreach (VisualElement card in cards)
            {
                card.RemoveFromClassList("card--squash");
                card.AddToClassList("card--flipped");   // 건너뛰기: 남은 장 즉시
            }

            server.Acknowledge();
            serverLog.text = $"← 결과 {result.items.Count}개{(result.forced.Count > 0 ? " · 천장 발동" : "")}";
            UpdatePity(result.sinceHero, result.points);
            unlockAt = Time.unscaledTime + inputLockSeconds;
            SetBusy(false);
            running = null;
            while (Time.unscaledTime < unlockAt)
            {
                lockFill.style.width = Length.Percent(100f * (1f - (unlockAt - Time.unscaledTime) / inputLockSeconds));
                yield return null;
            }
            lockFill.style.width = Length.Percent(100f);
        }

        IEnumerator Wait(float seconds)
        {
            for (float t = 0f; t < seconds && !skip && !advance; t += Time.unscaledDeltaTime) yield return null;
            advance = false;
        }

        IEnumerator Flash()
        {
            for (float t = 0f; t < 0.3f; t += Time.unscaledDeltaTime)
            {
                flash.style.opacity = 1f - t / 0.3f;
                yield return null;
            }
            flash.style.opacity = 0f;
        }

        static readonly Queue<float> flashTimes = new();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => flashTimes.Clear();   // 도메인 리로드를 꺼도 이전 실행 값이 남지 않게

        /// <summary>번쩍임 제한 — 1초에 3번까지 (WCAG 2.3.1)</summary>
        static bool RequestFlash()
        {
            float now = Time.unscaledTime;
            while (flashTimes.Count > 0 && now - flashTimes.Peek() > 1f) flashTimes.Dequeue();
            if (flashTimes.Count >= 3) return false;
            flashTimes.Enqueue(now);
            return true;
        }

        VisualElement MakeCard(int itemIndex, bool forced)
        {
            GachaItem it = table.items[itemIndex];
            int g = (int)it.grade;
            var card = new VisualElement();
            card.AddToClassList("card");
            card.AddToClassList("card--" + GradeClass[g]);

            var back = new VisualElement();
            back.AddToClassList("card__back");
            back.Add(MakeMark(g));
            back.Add(new Label(GachaTable.GradeNames[g]));   // 뒷면 = 등급 예고 (색 + 모양 + 글자)
            card.Add(back);

            var face = new VisualElement();
            face.AddToClassList("card__face");
            face.Add(new Label(GachaTable.GradeNames[g]));
            face.Add(MakeMark(g));
            var name = new Label(it.displayName);
            name.AddToClassList("card__name");
            face.Add(name);
            if (forced)
            {
                var tag = new Label("천장 확정");
                tag.AddToClassList("card__forced");
                face.Add(tag);
            }
            card.Add(face);
            cardsRoot.Add(card);
            return card;
        }

        static VisualElement MakeMark(int grade)
        {
            var mark = new VisualElement();
            mark.AddToClassList("mark");
            mark.AddToClassList("mark--" + GradeClass[grade]);
            var inner = new VisualElement();
            inner.AddToClassList("mark__inner");
            mark.Add(inner);
            return mark;
        }

        void ShowBeam(int grade, string label)
        {
            beam.AddToClassList("beam--on");
            beamMark.Clear();
            if (grade >= 0) beamMark.Add(MakeMark(grade));
            beamLabel.text = label;
        }

        void UpdatePity(int sinceHero, int points)
        {
            bool guarantee = table.pityMode == PityMode.Guarantee;
            int remain = Mathf.Max(1, table.pityCount - sinceHero);
            pityLabel.text = guarantee
                ? (remain <= 1 ? "다음 1회 영웅 확정" : $"영웅 확정까지 {remain}회")
                : $"교환 포인트 {points} / {table.pityCount}";
            pityFill.style.width = Length.Percent(100f * Mathf.Clamp01((float)(guarantee ? sinceHero : points) / table.pityCount));
        }

        void SetBusy(bool busy)
        {
            pull1.SetEnabled(!busy);
            pull10.SetEnabled(!busy);
            tap.EnableInClassList("tap--on", busy);
            skipButton.EnableInClassList("skip--on", busy);
        }
    }
}
