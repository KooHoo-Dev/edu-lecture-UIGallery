// 방향 커맨드 HUD (UI Toolkit) — 입력은 UGUI 폴더의 ComboInput, 판정은 ComboMatcher, 데이터는 ComboCommandSet 을 그대로 쓴다.
// 화살표는 비트맵 없이 ArrowElement(Painter2D)로 그린다. 흔들림은 Update 에서 style.translate 로 (코루틴 없음).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.DirectionalComboInput
{
    [RequireComponent(typeof(UIDocument))]
    public class ComboHudUITK : MonoBehaviour
    {
        [SerializeField] ComboCommandSet commandSet;
        [SerializeField] ComboInput input;
        [SerializeField] float prefixWait = 0.45f;
        [SerializeField] float stepTimeout = 1.5f;
        [SerializeField] bool lenient;
        [SerializeField] ComboHud.MismatchStyle mismatch = ComboHud.MismatchStyle.Dim;

        public event Action<ComboCommand> Activated;

        const int SlotCount = 5;
        const float ShakeSeconds = 0.36f;

        class RowUI
        {
            public VisualElement root;
            public VisualElement wait;
            public Label status;
            public ArrowElement[] arrows;
        }

        ComboMatcher matcher;
        bool[] isPrefix;
        bool[] hasPrefix;
        readonly List<RowUI> rows = new();
        readonly ArrowElement[] slots = new ArrowElement[SlotCount];
        VisualElement panel, strip, list, slotRoot, banner, timerFill;
        Label count, access, timerText, bannerText, note;
        IVisualElementScheduledItem hideJob;
        float shakeT = -1f;
        float bannerUntil = -1f;
        float noteUntil = -1f;
        float wrongUntil = -1f;
        int wrongSlot = -1;
        ComboDir wrongDir;

        void Awake()
        {
            matcher = new ComboMatcher(commandSet.commands);
            int n = commandSet.commands.Count;
            isPrefix = new bool[n];
            hasPrefix = new bool[n];
            for (int i = 0; i < n; i++)
            {
                isPrefix[i] = commandSet.IsPrefixOfAnother(i);
                for (int j = 0; j < n; j++)
                {
                    ComboDir[] other = commandSet.commands[j].sequence;
                    if (j != i && other.Length < commandSet.commands[i].sequence.Length && ComboCommandSet.StartsWith(commandSet.commands[i].sequence, other))
                        hasPrefix[i] = true;
                }
            }
        }

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            panel = root.Q("panel");
            strip = root.Q("strip");
            list = root.Q("list");
            slotRoot = root.Q("slots");
            banner = root.Q("banner");
            timerFill = root.Q("timer-fill");
            count = root.Q<Label>("count");
            access = root.Q<Label>("access");
            timerText = root.Q<Label>("timer-text");
            bannerText = root.Q<Label>("banner-text");
            note = root.Q<Label>("note");
            BuildRows();

            input.Opened += OnOpened;
            input.Closed += OnClosed;
            input.Direction += OnDirection;
            matcher.Fired += OnFired;
            Configure(prefixWait, stepTimeout, lenient);
            if (input.IsOpen) OnOpened();
        }

        void OnDisable()
        {
            input.Opened -= OnOpened;
            input.Closed -= OnClosed;
            input.Direction -= OnDirection;
            matcher.Fired -= OnFired;
            hideJob?.Pause();
            matcher.Clear();
            shakeT = -1f;
            wrongSlot = -1;
            // 화면에 남는 상태를 되돌린다 (UIDocument 가 다시 켜지면 UXML 로 새로 만들지만, 같은 패널을 계속 쓰는 경우를 위해)
            if (strip != null)
            {
                strip.style.translate = StyleKeyword.Null;
                SetOpen(false, instant: true);
                banner.RemoveFromClassList("banner--on");
                note.text = "";
                list.Clear();
                slotRoot.Clear();
            }
            rows.Clear();
        }

        public void Configure(float wait, float timeout, bool isLenient)
        {
            prefixWait = Mathf.Max(0f, wait);
            stepTimeout = Mathf.Max(0f, timeout);
            lenient = isLenient;
            matcher.PrefixWait = prefixWait;
            matcher.StepTimeout = stepTimeout;
            matcher.Lenient = lenient;
            if (access != null) access.text = ComboLabels.Access(input.Mode, stepTimeout, lenient);
        }

        void BuildRows()
        {
            list.Clear();
            rows.Clear();
            foreach (ComboCommand c in commandSet.commands)
            {
                var row = new RowUI { root = Ignore(new VisualElement()), arrows = new ArrowElement[c.sequence.Length] };
                row.root.AddToClassList("row");
                Label name = Ignore(new Label(c.displayName));
                name.AddToClassList("row__name");
                row.root.Add(name);
                VisualElement arrows = Ignore(new VisualElement());
                arrows.AddToClassList("row__arrows");
                for (int k = 0; k < c.sequence.Length; k++)
                {
                    row.arrows[k] = new ArrowElement(false);
                    row.arrows[k].Set(c.sequence[k], ArrowElement.Look.Normal, true);
                    arrows.Add(row.arrows[k]);
                }
                row.root.Add(arrows);
                row.status = Ignore(new Label());
                row.status.AddToClassList("row__status");
                row.root.Add(row.status);
                row.wait = Ignore(new VisualElement());
                row.wait.AddToClassList("row__wait");
                row.root.Add(row.wait);
                list.Add(row.root);
                rows.Add(row);
            }
            slotRoot.Clear();
            for (int k = 0; k < SlotCount; k++)
            {
                slots[k] = new ArrowElement(true);
                slotRoot.Add(slots[k]);
            }
        }

        // pickingMode 는 자식에게 상속되지 않는다 — 만든 요소마다 Ignore
        static T Ignore<T>(T e) where T : VisualElement
        {
            e.pickingMode = PickingMode.Ignore;
            return e;
        }

        void SetOpen(bool open, bool instant = false)
        {
            hideJob?.Pause();
            if (open)
            {
                panel.style.visibility = Visibility.Visible;
                strip.style.visibility = Visibility.Visible;
                panel.AddToClassList("panel--open");
                strip.AddToClassList("strip--open");
                return;
            }
            panel.RemoveFromClassList("panel--open");
            strip.RemoveFromClassList("strip--open");
            if (instant)
            {
                panel.style.visibility = Visibility.Hidden;
                strip.style.visibility = Visibility.Hidden;
                return;
            }
            // opacity 0 도 그려지고(포인터는 Ignore 라 막지 않지만) 비용이 든다 — 페이드가 끝나면 끈다
            hideJob = panel.schedule.Execute(() =>
            {
                if (input.IsOpen) return;
                panel.style.visibility = Visibility.Hidden;
                strip.style.visibility = Visibility.Hidden;
            }).StartingIn(150);
        }

        void OnOpened()
        {
            matcher.Clear();
            wrongSlot = -1;
            access.text = ComboLabels.Access(input.Mode, stepTimeout, lenient);
            SetOpen(true);
            Paint();
        }

        void OnClosed()
        {
            matcher.Close(Time.time);   // 완성해서 기다리던 커맨드는 발동
            wrongSlot = -1;
            SetOpen(false);
        }

        void OnDirection(ComboDir d)
        {
            int slot = matcher.Buffer.Count;
            StepResult r = matcher.Push(d, Time.time);
            if (r == StepResult.Pending) Note($"{commandSet.commands[matcher.Pending].displayName} 완성 — 이어 넣으면 더 긴 커맨드");
            else if (r == StepResult.WrongReset || r == StepResult.WrongKept || r == StepResult.Cooling)
            {
                wrongSlot = slot;
                wrongDir = d;
                wrongUntil = Time.unscaledTime + 0.7f;
                shakeT = 0f;
                if (r == StepResult.Cooling)
                {
                    int c = matcher.CoolingIndex;
                    Note($"{commandSet.commands[c].displayName} — 재사용 대기 {Mathf.CeilToInt(matcher.CooldownLeft(c, Time.time))}초");
                }
                else Note(r == StepResult.WrongKept ? $"{slot + 1}번째 칸이 아니다 — 그 칸만 다시" : $"{slot + 1}번째 칸에서 틀림 — 처음부터");
            }
            Paint();
        }

        void OnFired(int i)
        {
            ComboCommand c = commandSet.commands[i];
            bannerText.text = $"발동 · {c.displayName}";
            banner.AddToClassList("banner--on");   // banner 는 UXML 에 처음부터 있어 바로 붙여도 transition 이 돈다
            bannerUntil = Time.unscaledTime + 2f;
            Activated?.Invoke(c);
        }

        void Note(string text)
        {
            note.text = text;
            noteUntil = Time.unscaledTime + 2f;
        }

        void Update()
        {
            if (shakeT >= 0f)
            {
                shakeT += Time.unscaledDeltaTime;
                float k = 1f - shakeT / ShakeSeconds;
                if (k <= 0f)
                {
                    shakeT = -1f;
                    strip.style.translate = StyleKeyword.Null;
                }
                else strip.style.translate = new Translate(Mathf.Sin(shakeT * 70f) * 18f * k, 0f);
            }
            if (bannerUntil >= 0f && Time.unscaledTime > bannerUntil)
            {
                banner.RemoveFromClassList("banner--on");
                bannerUntil = -1f;
            }
            if (noteUntil >= 0f && Time.unscaledTime > noteUntil)
            {
                note.text = "";
                noteUntil = -1f;
            }
            if (!input.IsOpen) return;
            if (matcher.Tick(Time.time) == StepResult.TimedOut) Note("입력 사이가 너무 길다 — 처음부터");
            Paint();
        }

        void Paint()
        {
            float now = Time.time;
            var buf = matcher.Buffer;
            bool filtering = buf.Count > 0;
            int candidates = 0;
            for (int i = 0; i < rows.Count; i++)
            {
                RowUI row = rows[i];
                ComboCommand c = commandSet.commands[i];
                bool cand = matcher.IsCandidate(i, now);
                bool cooling = !matcher.IsReady(i, now);
                bool pending = matcher.Pending == i;
                bool off = filtering && !cand;
                if (cand) candidates++;
                row.root.EnableInClassList("row--candidate", cand);
                row.root.EnableInClassList("row--mismatch", off && mismatch == ComboHud.MismatchStyle.Dim);
                row.root.EnableInClassList("row--hidden", off && mismatch == ComboHud.MismatchStyle.Hide);
                row.root.EnableInClassList("row--cooling", cooling);
                int lit = cand ? buf.Count : 0;
                for (int k = 0; k < row.arrows.Length; k++)
                {
                    var look = k < lit ? ArrowElement.Look.Lit : cand && !pending && k == lit ? ArrowElement.Look.Next : ArrowElement.Look.Normal;
                    row.arrows[k].Set(c.sequence[k], look, true);
                }
                row.status.text = ComboLabels.Status(c, cooling ? matcher.CooldownLeft(i, now) : 0f, pending, isPrefix[i], hasPrefix[i] && prefixWait <= 0f, prefixWait, out bool warn);
                row.status.EnableInClassList("row__status--warn", warn);
                row.wait.style.width = pending ? 180f * matcher.PendingProgress(now) : 0f;
            }
            count.text = $"남은 후보 {candidates} / {rows.Count}";

            bool showWrong = wrongSlot >= 0 && Time.unscaledTime < wrongUntil;
            for (int k = 0; k < SlotCount; k++)
            {
                if (k < buf.Count) slots[k].Set(buf[k], ArrowElement.Look.Lit, true);
                else if (showWrong && k == wrongSlot) slots[k].Set(wrongDir, ArrowElement.Look.Wrong, true);
                else slots[k].Set(ComboDir.Up, k == buf.Count ? ArrowElement.Look.Next : ArrowElement.Look.Normal, false);
            }
            float left = matcher.TimeLeft01(now);
            timerFill.style.width = Length.Percent(left * 100f);
            timerText.text = ComboLabels.Timer(stepTimeout, left, buf.Count > 0 && matcher.Pending < 0);
        }

        /// <summary>화살표 칸 하나 — 칸 모양은 USS(.arrow 와 수식 클래스), 화살표는 Painter2D 로 그린다</summary>
        class ArrowElement : VisualElement
        {
            public enum Look { Normal, Lit, Next, Wrong }

            static readonly Vector2[] Shape = { new(0, -13), new(12, 0), new(5, 0), new(5, 13), new(-5, 13), new(-5, 0), new(-12, 0) };
            static readonly Color Light = new(0.81f, 0.88f, 0.94f, 1f);
            static readonly Color Dark = new(0.02f, 0.16f, 0.14f, 1f);
            static readonly Color Bad = new(1f, 0.54f, 0.58f, 1f);

            ComboDir dir;
            Look look = (Look)(-1);
            bool glyph;

            public ArrowElement(bool big)
            {
                pickingMode = PickingMode.Ignore;
                AddToClassList("arrow");
                if (big) AddToClassList("arrow--big");
                generateVisualContent += Draw;
            }

            public void Set(ComboDir d, Look l, bool showGlyph)
            {
                if (d == dir && l == look && showGlyph == glyph) return;   // 바뀔 때만 다시 그린다
                dir = d;
                look = l;
                glyph = showGlyph;
                EnableInClassList("arrow--lit", l == Look.Lit);
                EnableInClassList("arrow--next", l == Look.Next);
                EnableInClassList("arrow--wrong", l == Look.Wrong);
                MarkDirtyRepaint();
            }

            void Draw(MeshGenerationContext ctx)
            {
                if (!glyph) return;
                Painter2D p = ctx.painter2D;
                Rect r = contentRect;
                Vector2 c = r.center;
                float s = Mathf.Min(r.width, r.height) / 32f * 0.9f;
                // 패널 좌표는 y 가 아래로 + → 이 회전은 화면에서 시계 방향 (위 0° · 오른쪽 90° · 아래 180° · 왼쪽 270°)
                float a = dir switch { ComboDir.Right => 90f, ComboDir.Down => 180f, ComboDir.Left => 270f, _ => 0f } * Mathf.Deg2Rad;
                float cos = Mathf.Cos(a), sin = Mathf.Sin(a);
                p.fillColor = look == Look.Lit ? Dark : look == Look.Wrong ? Bad : Light;   // 다음 칸은 금색 테두리 + 밝은 화살표
                p.BeginPath();
                for (int i = 0; i < Shape.Length; i++)
                {
                    Vector2 v = Shape[i];
                    var pt = c + new Vector2(v.x * cos - v.y * sin, v.x * sin + v.y * cos) * s;
                    if (i == 0) p.MoveTo(pt);
                    else p.LineTo(pt);
                }
                p.ClosePath();
                p.Fill();
                if (look == Look.Wrong)
                {
                    p.strokeColor = Color.white;
                    p.lineWidth = 3f;
                    float e = 13f * s;
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(-e, -e));
                    p.LineTo(c + new Vector2(e, e));
                    p.MoveTo(c + new Vector2(e, -e));
                    p.LineTo(c + new Vector2(-e, e));
                    p.Stroke();
                }
            }
        }
    }
}
