using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 대화창 + 선택지 — UI Toolkit 버전. 데이터는 ugui 폴더의 DialogueData 를 함께 쓴다.
    ///  · 타자기: Label 에는 maxVisibleCharacters 가 없다 → "보이는 부분 + &lt;alpha=#00&gt;남은 부분" 으로 문장 전체를 배치해
    ///    줄바꿈 위치를 처음부터 고정한다 (Substring 만 넣으면 단어가 윗줄·아랫줄을 오간다)
    ///  · 입력 소비 · 입력 잠금 · 기록 중 정지 규칙은 UGUI 버전과 같다
    ///  · schedule 은 Time.timeScale 과 무관하게 돈다. 진행은 Update(unscaledDeltaTime) 한 곳에서만 계산한다
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class DialogueUITK : MonoBehaviour
    {
        enum State { Hidden, Typing, LineComplete, ChoiceOpen, ChoiceConfirmed, Closed }

        [SerializeField] DialogueData data;
        [SerializeField] InputActionReference advance, fastForward, toggleLog, toggleAuto;
        [SerializeField] float typeSpeedCps = 40f;
        [SerializeField] bool autoAdvance;
        [SerializeField, Tooltip("0 = 시간 제한 끔")] float choiceTimerSeconds = 0f;
        [SerializeField, Range(0f, 0.6f)] float inputLockSeconds = 0.3f;
        [SerializeField, Range(80, 160), Tooltip("글자 크기 배율 (%) — USS 에 em 이 없어 fontSize 에 직접 곱한다")] int textScale = 100;
        [SerializeField] bool showFaceIcon = true;

        public bool ForceFastForward { get; set; }

        VisualElement root, choices, timer, timerFill, faceIcon, logBox, panel;
        Label speakerName, speakerRole, body, next;
        Button btnAuto, btnFf, btnLog;
        ScrollView logScroll;
        readonly List<Button> buttons = new();

        State state = State.Hidden;
        int node, chosen = -1, focus, visible;
        string text = "";
        float typeAcc, delay, autoWait, lockLeft, timerLeft, confirmLeft, ffStep, hurryPhase;
        bool logOpen, uiFastForward;
        IVisualElementScheduledItem bob;

        void OnEnable()
        {
            var r = GetComponent<UIDocument>().rootVisualElement;
            root = r.Q("dialogue-root");
            choices = r.Q("choices");
            timer = r.Q("timer");
            timerFill = r.Q("timer-fill");
            faceIcon = r.Q("face-icon");
            logBox = r.Q("log");
            logScroll = r.Q<ScrollView>("log-scroll");
            speakerName = r.Q<Label>("speaker-name");
            speakerRole = r.Q<Label>("speaker-role");
            body = r.Q<Label>("body");
            next = r.Q<Label>("next");
            btnAuto = r.Q<Button>("btn-auto");
            btnFf = r.Q<Button>("btn-ff");
            btnLog = r.Q<Button>("btn-log");

            body.enableRichText = true;
            body.style.fontSize = 36f * textScale / 100f;
            faceIcon.EnableInClassList("dlg-face--hidden", !showFaceIcon);

            // 메서드로 연결해 OnDisable 에서 정확히 해제한다 (람다면 다시 켤 때마다 중복 등록)
            btnAuto.clicked += ToggleAuto;
            btnLog.clicked += ToggleLog;
            btnFf.RegisterCallback<PointerDownEvent>(OnFfDown, TrickleDown.TrickleDown);
            btnFf.RegisterCallback<PointerUpEvent>(OnFfUp);
            panel = r.Q("panel");
            panel.RegisterCallback<ClickEvent>(OnPanelClick);

            foreach (var a in new[] { advance, fastForward, toggleLog, toggleAuto })
                if (a != null) a.action.Enable();

            // ▼ 상하 반복: 350ms 마다 클래스 토글 → USS 전환이 왕복 700ms
            bob = next.schedule.Execute(() => next.ToggleInClassList("dlg-next--down")).Every(350);

            BuildChoiceButtons();
            // UIDocument 가 트리를 막 만든 프레임에는 전환이 안 보이므로 한 프레임 뒤 시작
            root.schedule.Execute(Begin);
        }

        void OnDisable()
        {
            btnAuto.clicked -= ToggleAuto;
            btnLog.clicked -= ToggleLog;
            btnFf.UnregisterCallback<PointerDownEvent>(OnFfDown, TrickleDown.TrickleDown);
            btnFf.UnregisterCallback<PointerUpEvent>(OnFfUp);
            panel.UnregisterCallback<ClickEvent>(OnPanelClick);
            bob?.Pause();
            foreach (var a in new[] { advance, fastForward, toggleLog, toggleAuto })
                if (a != null) a.action.Disable();
            buttons.Clear();
        }

        void BuildChoiceButtons()
        {
            foreach (var b in buttons) b.RemoveFromHierarchy();
            buttons.Clear();
            for (int i = 0; i < data.choices.Length; i++)
            {
                int index = i;
                var b = new Button { focusable = true };
                b.AddToClassList("dlg-choice");
                var frame = new SkewFrame { Skew = 6f, BorderWidth = 2f };   // 틀만 기울고 Label 은 반듯하다
                frame.AddToClassList("dlg-frame");
                b.Add(frame);
                var mark = new Label("▶");
                mark.AddToClassList("dlg-choice__mark");
                var label = new Label { name = "label" };
                label.AddToClassList("dlg-choice__label");
                label.style.fontSize = 30f * textScale / 100f;
                var key = new Label("Enter");
                key.AddToClassList("dlg-choice__key");
                b.Add(mark);
                b.Add(label);
                b.Add(key);
                b.clicked += () => OnChoice(index);
                // 패드·키보드 확정이 clicked 로 들어오는지 버전마다 확인이 필요해 Submit 도 직접 받는다 (중복 호출은 상태 검사로 무시)
                b.RegisterCallback<NavigationSubmitEvent>(_ => OnChoice(index));
                b.RegisterCallback<FocusInEvent>(_ => focus = index);
                b.RegisterCallback<PointerEnterEvent>(_ => b.Focus());          // 마우스 = 포커스
                b.RegisterCallback<NavigationMoveEvent>(evt => OnMove(evt, index));
                choices.Add(b);
                buttons.Add(b);
            }
        }

        /* ───────── 공개 동작 ───────── */

        public void Begin()
        {
            logScroll.Clear();
            chosen = -1;
            choices.AddToClassList("dlg-choices--hidden");
            root.RemoveFromClassList("dlg-root--hidden");
            StartLine(0, 0.22f);
        }

        public void Advance()
        {
            if (logOpen) return;
            if (state == State.Typing) { delay = 0f; Complete(); }      // 첫 입력 = 문장 완성 (등장 연출 중에도)
            else if (state == State.LineComplete) Next();               // 다음 입력 = 다음 줄
            else if (state == State.Closed) Begin();
        }

        public void MoveFocus(int dir)
        {
            if (state != State.ChoiceOpen) return;
            focus = (focus + dir + buttons.Count) % buttons.Count;
            buttons[focus].Focus();
        }

        public void ConfirmFocused() => OnChoice(focus);

        public void ToggleLog()
        {
            logOpen = !logOpen;
            logBox.EnableInClassList("dlg-log--hidden", !logOpen);
            btnLog.EnableInClassList("dlg-ctl--on", logOpen);
            if (logOpen && logScroll.contentContainer.childCount > 0)
            {
                // 레이아웃이 끝난 다음 프레임에 최신 줄로
                var last = logScroll.contentContainer[logScroll.contentContainer.childCount - 1];
                logScroll.schedule.Execute(() => logScroll.ScrollTo(last));
            }
            if (!logOpen && state == State.ChoiceOpen) buttons[focus].Focus();
        }

        public void ToggleAuto()
        {
            autoAdvance = !autoAdvance;
            btnAuto.EnableInClassList("dlg-ctl--on", autoAdvance);
        }

        void OnChoice(int index)
        {
            if (state != State.ChoiceOpen || logOpen) return;
            if (lockLeft > 0f) return;      // 입력 잠금: 선택지가 막 열렸을 때 눌린 확정은 무시
            Confirm(index);
        }

        /* ───────── 상태 전환 ───────── */

        DialogueData.Line LineAt(int n)
        {
            if (n < data.lines.Length) return data.lines[n];
            if (n == data.lines.Length) return data.choices[chosen < 0 ? data.defaultChoice : chosen].reply;
            return data.endLine;
        }

        void StartLine(int n, float startDelay = 0f)
        {
            node = n;
            var line = LineAt(n);
            speakerName.text = line.DisplayName;
            speakerRole.text = line.DisplayRole;
            var face = line.DisplayPortrait;
            faceIcon.style.backgroundImage = face != null ? new StyleBackground(face) : new StyleBackground(StyleKeyword.None);
            text = line.text;
            visible = 0;
            typeAcc = 0f;
            autoWait = 0f;
            ffStep = 0f;
            delay = startDelay;
            state = State.Typing;
            Render();
            next.RemoveFromClassList("dlg-next--show");
            AddLog(line.DisplayName, line.text, false);
            if (typeSpeedCps <= 0f && delay <= 0f) Complete();
        }

        void Complete()
        {
            visible = text.Length;
            Render();
            state = State.LineComplete;
            autoWait = 0f;
            ffStep = 0f;
            next.AddToClassList("dlg-next--show");
        }

        void Next()
        {
            if (node == data.lines.Length - 1) OpenChoices();
            else if (node >= data.lines.Length + 1) Close();
            else StartLine(node + 1);
        }

        void OpenChoices()
        {
            state = State.ChoiceOpen;
            next.RemoveFromClassList("dlg-next--show");
            lockLeft = inputLockSeconds;
            timerLeft = choiceTimerSeconds;
            timer.style.display = choiceTimerSeconds > 0f ? DisplayStyle.Flex : DisplayStyle.None;   // 0 이면 숨김
            for (int i = 0; i < buttons.Count; i++)
            {
                var c = data.choices[i];
                buttons[i].Q<Label>("label").text = c.isAction ? $"( {c.text} )" : c.text;
                buttons[i].RemoveFromClassList("dlg-choice--dim");
                buttons[i].AddToClassList("dlg-choice--enter");
                // 50ms 시차로 --enter 를 떼면 USS 전환이 순서대로 미끄러져 들어온다
                var b = buttons[i];
                b.schedule.Execute(() => b.RemoveFromClassList("dlg-choice--enter")).StartingIn(16 + 50 * i);
            }
            choices.RemoveFromClassList("dlg-choices--hidden");
            choices.AddToClassList("dlg-choices--locked");
            focus = 0;
            // 같은 프레임에 Focus() 하면 아직 패널 배치 전이라 실패할 수 있다 → 한 프레임 뒤
            buttons[0].schedule.Execute(() => buttons[0].Focus());
        }

        void Confirm(int index)
        {
            chosen = index;
            state = State.ChoiceConfirmed;
            confirmLeft = 0.32f;
            for (int i = 0; i < buttons.Count; i++) buttons[i].EnableInClassList("dlg-choice--dim", i != index);
            var c = data.choices[index];
            AddLog("나의 선택", c.isAction ? $"( {c.text} )" : c.text, true);
        }

        void Close()
        {
            state = State.Closed;
            root.AddToClassList("dlg-root--hidden");
        }

        /* ───────── 매 프레임 ───────── */

        void Update()
        {
            if (state == State.Hidden || root == null) return;
            float dt = Time.unscaledDeltaTime;

            if (toggleLog != null && toggleLog.action.WasPressedThisFrame()) { ToggleLog(); return; }
            if (logOpen) return;                                        // 기록 중에는 모두 정지
            if (toggleAuto != null && toggleAuto.action.WasPressedThisFrame()) ToggleAuto();

            bool ff = (ForceFastForward || uiFastForward || (fastForward != null && fastForward.action.IsPressed())) && state != State.ChoiceOpen;
            btnFf.EnableInClassList("dlg-ctl--on", ff);

            if (advance != null && advance.action.WasPressedThisFrame() && state != State.ChoiceOpen)
            {
                Advance();
                return;                                                 // 한 입력 = 한 단계
            }

            switch (state)
            {
                case State.Typing:
                    if (delay > 0f) { delay -= dt; break; }
                    if (ff) { Complete(); break; }
                    typeAcc += dt;
                    float step = 1f / Mathf.Max(1f, typeSpeedCps);
                    int before = visible;
                    while (visible < text.Length && typeAcc >= step)
                    {
                        typeAcc -= step;
                        visible++;
                        char ch = text[visible - 1];
                        if (visible < text.Length && (ch == '.' || ch == ',' || ch == '!' || ch == '?' || ch == '…')) typeAcc -= 0.16f;
                    }
                    if (visible != before) Render();
                    if (visible >= text.Length) Complete();
                    break;

                case State.LineComplete:
                    if (ff) { ffStep += dt; if (ffStep >= 0.09f) Next(); }
                    else if (autoAdvance) { autoWait += dt; if (autoWait >= 1.2f + 0.04f * text.Length) Next(); }
                    break;

                case State.ChoiceOpen:
                    lockLeft = Mathf.Max(0f, lockLeft - dt);
                    choices.EnableInClassList("dlg-choices--locked", lockLeft > 0f);
                    if (choiceTimerSeconds > 0f)
                    {
                        timerLeft -= dt;
                        float ratio = Mathf.Clamp01(timerLeft / choiceTimerSeconds);
                        timerFill.style.scale = new Scale(new Vector2(ratio, 1f));   // width 대신 scale — 레이아웃 재계산 없음
                        hurryPhase += dt;
                        timer.EnableInClassList("dlg-timer--hurry", ratio < 0.3f && Mathf.Repeat(hurryPhase, 1f) < 0.5f);   // 1Hz
                        if (timerLeft <= 0f) Confirm(data.defaultChoice);
                    }
                    break;

                case State.ChoiceConfirmed:
                    confirmLeft -= dt;
                    if (confirmLeft <= 0f)
                    {
                        choices.AddToClassList("dlg-choices--hidden");
                        StartLine(data.lines.Length);
                    }
                    break;
            }
        }

        /// <summary>보이는 부분 + 투명한 남은 부분 — 줄바꿈 위치가 처음부터 고정된다</summary>
        void Render()
        {
            body.text = visible >= text.Length ? text : text.Substring(0, visible) + "<alpha=#00>" + text.Substring(visible);
        }

        void AddLog(string who, string line, bool mine)
        {
            if (mine)
            {
                var m = new Label(line);
                m.AddToClassList("dlg-log__mine");
                logScroll.Add(m);
                return;
            }
            var w = new Label(who);
            w.AddToClassList("dlg-log__who");
            var t = new Label(line);
            t.AddToClassList("dlg-log__text");
            t.style.fontSize = 28f * textScale / 100f;
            logScroll.Add(w);
            logScroll.Add(t);
        }

        void OnMove(NavigationMoveEvent evt, int index)
        {
            // 위·아래 끝에서 반대쪽으로 순환. StopPropagation 만으로는 기본 포커스 이동이 한 번 더 일어나므로 IgnoreEvent 도 부른다
            int to = -1;
            if (evt.direction == NavigationMoveEvent.Direction.Down && index == buttons.Count - 1) to = 0;
            else if (evt.direction == NavigationMoveEvent.Direction.Up && index == 0) to = buttons.Count - 1;
            if (to < 0) return;
            buttons[to].Focus();
            evt.StopPropagation();
            buttons[index].focusController?.IgnoreEvent(evt);
        }

        void OnFfDown(PointerDownEvent e) => uiFastForward = true;
        void OnFfUp(PointerUpEvent e) => uiFastForward = false;

        void OnPanelClick(ClickEvent e)
        {
            if (state != State.ChoiceOpen) Advance();
        }
    }
}
