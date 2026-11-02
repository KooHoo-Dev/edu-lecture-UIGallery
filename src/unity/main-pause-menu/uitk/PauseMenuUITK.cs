using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.MainPauseMenu
{
    public enum MenuInput { Up, Down, Submit, Cancel, PrevPage, NextPage }

    /// <summary>
    /// 메인 · 일시정지 메뉴 — UI Toolkit 버전.
    /// - 스택: Push(확인) · Back(뒤로 한 칸, 바닥이면 닫기) · Page(맨 위만 옆 카테고리로)
    /// - 내비게이션 이벤트(Move · Submit · Cancel)는 루트에서 TrickleDown 으로 가로채 한 곳(Feed)에서 처리한다
    ///   → 전환 중이면 입력 버퍼에 담았다가 전환이 끝나면 하나씩 적용 (입력 하나 = 한 단계)
    /// - 닫히면 남은 입력을 버리고 0.25초 입력 잠금. 확인 창은 기본 포커스 '취소' + 0.3초 확정 잠금
    /// - 빈 곳 클릭으로 포커스가 사라지면 마지막 항목을 다시 Focus()
    /// - 포커스의 기준은 스택 칸의 focus 값이다 (focusedElement 는 Focus() 가 다음 프레임에 반영되므로 기준으로 쓰지 않는다)
    /// - pauseAction(Esc)과 UI 맵 Cancel(Esc)이 함께 켜져 있으면 연 순간의 Esc 가 Cancel 로도 들어간다
    ///   → 열 때 pauseAction 을 끄고 닫은 다음 프레임에 켠다. 연 프레임의 입력은 버린다 (한 입력은 한 단계만)
    /// 모든 시간은 Time.unscaledTime (일시정지 중 Time.timeScale = 0).
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class PauseMenuUITK : MonoBehaviour
    {
        [SerializeField] InputActionReference pauseAction;   // Esc · 메뉴 버튼 (메뉴가 닫혀 있을 때만)
        [SerializeField] InputActionReference prevPage;      // Q · 왼쪽 숄더
        [SerializeField] InputActionReference nextPage;      // E · 오른쪽 숄더
        [SerializeField] float transitionSeconds = 0.22f;
        [SerializeField] bool rememberFocus = true;
        [SerializeField] float closeLockSeconds = 0.25f;
        [SerializeField] float dialogLockSeconds = 0.3f;

        static readonly string[] Categories = { "panel-equip", "panel-records", "panel-settings" };
        static readonly string[] CategoryItems = { "item-equip", "item-records", "item-settings" };

        class Entry
        {
            public VisualElement panel;
            public int focus;
        }

        VisualElement root, pauseRoot, titleRoot, dialog, emblem, hintPage;
        Label breadcrumb, hintBack;
        readonly Dictionary<VisualElement, List<Button>> items = new();
        readonly Dictionary<VisualElement, int> memory = new();
        readonly List<Entry> stack = new();
        readonly Queue<MenuInput> queue = new();
        VisualElement panelRoot, titlePanel;
        float busyUntil, lockUntil, dialogOpenedAt;
        int openedFrame = -1;
        int dialogFocus;   // 0 = 취소, 1 = 타이틀로
        bool isOpen, onTitle;

        bool Busy => Time.unscaledTime < busyUntil;
        bool DialogOpen => !dialog.ClassListContains("hidden");

        void OnEnable()
        {
            root = GetComponent<UIDocument>().rootVisualElement;
            pauseRoot = root.Q("pause-root");
            titleRoot = root.Q("title-root");
            dialog = root.Q("dialog");
            emblem = root.Q("emblem");
            hintPage = root.Q("hint-page");
            breadcrumb = root.Q<Label>("breadcrumb");
            hintBack = root.Q<Label>("hint-back");
            panelRoot = root.Q("panel-root");
            titlePanel = titleRoot.Q(className: "menu-panel");

            // UIDocument 는 켤 때마다 트리를 새로 만든다 → 목록을 비우고 다시 모은다
            items.Clear();
            memory.Clear();
            stack.Clear();
            foreach (var panel in root.Query(className: "menu-panel").ToList())
                items[panel] = panel.Query<Button>(className: "menu-item").ToList();

            // 마우스 클릭(Button.clicked)은 그대로 쓴다. 키보드·패드의 Submit 은 아래에서 가로챈다
            foreach (var pair in items)
                foreach (var b in pair.Value)
                {
                    var btn = b;
                    btn.clicked += () => OnClicked(btn);
                    btn.RegisterCallback<PointerEnterEvent>(_ =>
                    {
                        if (Busy || !btn.enabledInHierarchy) return;
                        RememberFocus(btn);   // 마우스와 키보드가 같은 포커스 하나를 쓴다
                        btn.Focus();
                    });
                }
            root.Q<Button>("dlg-cancel").clicked += () => Feed(MenuInput.Cancel);
            root.Q<Button>("dlg-ok").clicked += ConfirmTitle;

            root.RegisterCallback<NavigationMoveEvent>(OnNavMove, TrickleDown.TrickleDown);
            root.RegisterCallback<NavigationSubmitEvent>(OnNavSubmit, TrickleDown.TrickleDown);
            root.RegisterCallback<NavigationCancelEvent>(OnNavCancel, TrickleDown.TrickleDown);
            root.RegisterCallback<PointerDownEvent>(OnPointerDown);

            pauseAction.action.performed += OnPause;
            prevPage.action.performed += OnPrev;
            nextPage.action.performed += OnNext;
            foreach (var a in new[] { pauseAction, prevPage, nextPage }) a.action.Enable();
            pauseRoot.EnableInClassList("pause-root--cut", transitionSeconds <= 0f);   // 즉시(컷) 전환
            InputSystem.onActionChange += OnActionChange;
        }

        void OnDisable()
        {
            pauseAction.action.performed -= OnPause;
            prevPage.action.performed -= OnPrev;
            nextPage.action.performed -= OnNext;
            InputSystem.onActionChange -= OnActionChange;
        }

        /* ───── 입력 진입점 ───── */

        void OnPause(InputAction.CallbackContext _)
        {
            if (!isOpen && !onTitle && Time.unscaledTime >= lockUntil) Open();
        }
        void OnPrev(InputAction.CallbackContext _) => Feed(MenuInput.PrevPage);
        void OnNext(InputAction.CallbackContext _) => Feed(MenuInput.NextPage);

        void OnNavMove(NavigationMoveEvent evt)
        {
            if (!isOpen && !onTitle) return;
            // 기본 포커스 이동을 막고 버퍼를 거쳐 직접 옮긴다
            evt.StopPropagation();
            root.focusController?.IgnoreEvent(evt);
            if (evt.direction == NavigationMoveEvent.Direction.Up) Feed(MenuInput.Up);
            else if (evt.direction == NavigationMoveEvent.Direction.Down) Feed(MenuInput.Down);
        }

        void OnNavSubmit(NavigationSubmitEvent evt)
        {
            if (!isOpen && !onTitle) return;
            evt.StopPropagation();   // Button 이 직접 clicked 를 부르지 않게 → 버퍼를 거친다
            Feed(MenuInput.Submit);
        }

        void OnNavCancel(NavigationCancelEvent evt)
        {
            if (!isOpen) return;
            evt.StopPropagation();
            Feed(MenuInput.Cancel);
        }

        /// <summary>입력 하나 — 잠금이면 버림, 전환 중이면 버퍼, 아니면 바로 적용</summary>
        public void Feed(MenuInput input)
        {
            if (Time.unscaledTime < lockUntil) return;
            if (!isOpen && !onTitle) return;
            if (Time.frameCount == openedFrame) return;   // 이 프레임의 입력은 '열기'로 이미 소비됐다
            if (Busy)
            {
                if (queue.Count < 4) queue.Enqueue(input);
                return;
            }
            Apply(input);
        }

        void Update()
        {
            // 전환이 끝났으면 하나만 꺼낸다
            if (!Busy && queue.Count > 0) Apply(queue.Dequeue());
        }

        /* ───── 적용 ───── */

        void Apply(MenuInput input)
        {
            if (onTitle)
            {
                if (input == MenuInput.Up || input == MenuInput.Down) MoveFocus(titlePanel, input == MenuInput.Down ? 1 : -1);
                else if (input == MenuInput.Submit) Activate(CurrentButton(titlePanel));
                return;
            }
            if (DialogOpen)
            {
                var cancel = root.Q<Button>("dlg-cancel");
                var ok = root.Q<Button>("dlg-ok");
                if (input == MenuInput.Up || input == MenuInput.Down)
                {
                    dialogFocus = 1 - dialogFocus;
                    FocusLater(dialogFocus == 1 ? ok : cancel);
                }
                else if (input == MenuInput.Cancel) CloseDialog();
                else if (input == MenuInput.Submit)
                {
                    if (dialogFocus == 1) ConfirmTitle();
                    else CloseDialog();
                }
                return;
            }

            var top = stack[^1];
            switch (input)
            {
                case MenuInput.Up: MoveFocus(top.panel, -1); break;
                case MenuInput.Down: MoveFocus(top.panel, +1); break;
                case MenuInput.Submit: Activate(CurrentButton(top.panel)); break;
                case MenuInput.Cancel: Back(); break;
                case MenuInput.PrevPage: Page(-1); break;
                case MenuInput.NextPage: Page(+1); break;
            }
        }

        void MoveFocus(VisualElement panel, int dir)
        {
            var list = items[panel];
            int cur = Mathf.Max(0, list.IndexOf(CurrentButton(panel)));
            for (int k = 1; k <= list.Count; k++)
            {
                int i = ((cur + dir * k) % list.Count + list.Count) % list.Count;
                if (!list[i].enabledInHierarchy) continue;   // 잠긴 항목은 건너뛴다
                FocusLater(list[i]);
                if (stack.Count > 0 && stack[^1].panel == panel) stack[^1].focus = i;
                memory[panel] = i;
                return;
            }
        }

        /// <summary>지금 포커스 항목 — 스택 칸(또는 기억)의 인덱스가 기준이다.
        /// focusedElement 는 FocusLater 가 다음 프레임에 반영하므로, 같은 프레임의 두 번째 방향 입력이 같은 칸을 계산하게 된다</summary>
        Button CurrentButton(VisualElement panel)
        {
            int i = stack.Count > 0 && stack[^1].panel == panel ? stack[^1].focus
                  : memory.TryGetValue(panel, out var m) ? m : FirstEnabled(panel);
            return items[panel][Mathf.Clamp(i, 0, items[panel].Count - 1)];
        }

        /// <summary>마우스 호버로 바뀐 포커스를 스택 칸에도 적는다</summary>
        void RememberFocus(Button b)
        {
            foreach (var pair in items)
            {
                int i = pair.Value.IndexOf(b);
                if (i < 0) continue;
                memory[pair.Key] = i;
                if (stack.Count > 0 && stack[^1].panel == pair.Key) stack[^1].focus = i;
                return;
            }
        }

        void OnClicked(Button b)
        {
            // Submit 은 가로챘으므로 여기는 마우스 클릭만 온다. 전환 중 클릭은 버린다 (버퍼에 넣으면 누른 것과 다른 항목이 실행될 수 있다)
            if (Busy) return;
            RememberFocus(b);
            Activate(b);
        }

        void Activate(Button b)
        {
            if (b == null || !b.enabledInHierarchy) return;
            switch (b.name)
            {
                case "item-resume": Close(); return;
                case "item-title": OpenDialog(); return;
                case "title-continue": LeaveTitle(); return;
                case "title-new": LeaveTitle(); Close(); return;
            }
            int c = System.Array.IndexOf(CategoryItems, b.name);
            if (c >= 0) Push(root.Q(Categories[c]));
        }

        /* ───── 스택 ───── */

        public void Open()
        {
            isOpen = true;
            openedFrame = Time.frameCount;
            pauseAction.action.Disable();   // 메뉴가 열린 동안 Esc 는 UI 맵 Cancel 만 받는다
            Time.timeScale = 0f;
            pauseRoot.RemoveFromClassList("hidden");   // 누른 프레임에 감광막 · 패널 골격
            stack.Clear();
            stack.Add(new Entry { panel = panelRoot, focus = 0 });
            Layout(transitionSeconds * 0.9f, popping: false);
            FocusLater(items[panelRoot][0]);
            emblem.RemoveFromClassList("emblem--settled");
            emblem.schedule.Execute(() => emblem.AddToClassList("emblem--settled"));   // 한 프레임 뒤 → 트랜지션
        }

        public void Close()
        {
            isOpen = false;
            queue.Clear();                                   // 남은 입력은 버린다
            lockUntil = Time.unscaledTime + closeLockSeconds; // 입력 잠금
            pauseRoot.AddToClassList("hidden");
            dialog.AddToClassList("hidden");
            foreach (var p in items.Keys) if (p != titlePanel) SetSlot(p, "menu-panel--offscreen");
            Time.timeScale = 1f;
            // 같은 프레임의 Esc 가 pauseAction 으로 다시 들어와 메뉴를 열지 않게 한 프레임 뒤에 켠다
            StartCoroutine(EnablePauseNextFrame());
        }

        System.Collections.IEnumerator EnablePauseNextFrame()
        {
            yield return null;
            if (!isOpen && !onTitle) pauseAction.action.Enable();
        }

        void Push(VisualElement panel)
        {
            var top = stack[^1];
            top.focus = Mathf.Max(0, items[top.panel].IndexOf(CurrentButton(top.panel)));
            memory[top.panel] = top.focus;
            int f = rememberFocus && memory.TryGetValue(panel, out var m) ? m : FirstEnabled(panel);
            stack.Add(new Entry { panel = panel, focus = f });
            Layout(transitionSeconds, popping: false);
            FocusLater(items[panel][f]);
        }

        void Back()
        {
            if (stack.Count <= 1)
            {
                Close();
                return;
            }
            var leaving = stack[^1];
            memory[leaving.panel] = leaving.focus;
            stack.RemoveAt(stack.Count - 1);
            SetSlot(leaving.panel, "menu-panel--offscreen");   // 들어온 반대 방향(오른쪽)으로 빠진다
            var top = stack[^1];
            Layout(transitionSeconds * 0.7f, popping: true);
            // 포커스 기억 — 끄면 늘 첫 항목 (나쁜 예)
            if (!rememberFocus) top.focus = FirstEnabled(top.panel);
            FocusLater(items[top.panel][top.focus]);
        }

        void Page(int dir)
        {
            if (stack.Count < 2) return;   // 단축키는 기본 경로(뒤로 → 아래 → 확인)를 줄여 줄 뿐
            var top = stack[^1];
            int i = System.Array.IndexOf(Categories, top.panel.name);
            if (i < 0) return;
            int n = (i + dir + Categories.Length) % Categories.Length;
            var next = root.Q(Categories[n]);
            memory[top.panel] = top.focus;
            SetSlot(top.panel, dir > 0 ? "menu-panel--offscreen-left" : "menu-panel--offscreen");
            stack[^2].focus = items[stack[^2].panel].IndexOf(root.Q<Button>(CategoryItems[n]));
            int f = rememberFocus && memory.TryGetValue(next, out var m) ? m : FirstEnabled(next);
            stack[^1] = new Entry { panel = next, focus = f };
            Layout(transitionSeconds * 0.65f, popping: false);
            FocusLater(items[next][f]);
        }

        /// <summary>깊이에 맞춰 칸마다 클래스를 붙인다. 위치 · 투명도는 USS 트랜지션이 보간한다</summary>
        void Layout(float seconds, bool popping)
        {
            busyUntil = Time.unscaledTime + seconds;
            pauseRoot.EnableInClassList("pause-root--popping", popping);
            int d = stack.Count;
            for (int i = 0; i < d; i++)
            {
                int rel = i - (d - 1);
                string slot = d == 1 ? "menu-panel--left" : rel == 0 ? "menu-panel--right" : rel == -1 ? "menu-panel--left" : "menu-panel--spine";
                SetSlot(stack[i].panel, slot);
                stack[i].panel.EnableInClassList("menu-panel--parent", d > 1 && rel == -1);
                stack[i].panel.SetEnabled(rel == 0);   // 전환 중 이전 패널이 입력을 받지 않게
                // 부모 칸의 '들어온 항목' 표시
                var list = items[stack[i].panel];
                for (int k = 0; k < list.Count; k++) list[k].EnableInClassList("menu-item--trail", rel == -1 && k == stack[i].focus);
            }
            breadcrumb.text = string.Join("  ›  ", stack.Select(e => e.panel.Q<Label>(className: "panel-title").text));
            hintPage.EnableInClassList("hidden", d < 2);
            hintBack.text = d < 2 ? "게임으로" : "뒤로";
        }

        static readonly string[] SlotClasses = { "menu-panel--left", "menu-panel--right", "menu-panel--spine", "menu-panel--offscreen", "menu-panel--offscreen-left" };

        static void SetSlot(VisualElement panel, string slot)
        {
            foreach (var c in SlotClasses) panel.EnableInClassList(c, c == slot);
        }

        int FirstEnabled(VisualElement panel)
        {
            var list = items[panel];
            for (int i = 0; i < list.Count; i++) if (list[i].enabledInHierarchy) return i;
            return 0;
        }

        /// <summary>방금 보이게 만든 요소는 같은 프레임에 Focus() 가 무시될 수 있다 → 다음 프레임</summary>
        void FocusLater(Button b) => b.schedule.Execute(() => b.Focus());

        /* ───── 확인 창 · 타이틀 ───── */

        void OpenDialog()
        {
            dialog.RemoveFromClassList("hidden");
            dialogOpenedAt = Time.unscaledTime;
            dialogFocus = 0;
            busyUntil = Time.unscaledTime + transitionSeconds * 0.8f;
            stack[^1].panel.SetEnabled(false);
            FocusLater(root.Q<Button>("dlg-cancel"));   // 기본 포커스는 안전한 쪽
        }

        void CloseDialog()
        {
            dialog.AddToClassList("hidden");
            stack[^1].panel.SetEnabled(true);
            FocusLater(root.Q<Button>("item-title"));   // 창을 연 항목으로 돌아간다
        }

        void ConfirmTitle()
        {
            if (Time.unscaledTime - dialogOpenedAt < dialogLockSeconds) return;   // 막 열림 — 확정 잠금
            dialog.AddToClassList("hidden");
            pauseRoot.AddToClassList("hidden");
            isOpen = false;
            onTitle = true;
            queue.Clear();
            titleRoot.RemoveFromClassList("hidden");
            memory[titlePanel] = 0;
            openedFrame = Time.frameCount;   // 타이틀의 Submit 이 같은 프레임에 '이어하기'를 누르지 않게
            FocusLater(items[titlePanel][0]);
        }

        void LeaveTitle()
        {
            onTitle = false;
            titleRoot.AddToClassList("hidden");
            Open();   // 게임으로 돌아와 일시정지 메뉴부터
        }

        /* ───── 빈 곳 클릭 · 장치 ───── */

        void OnPointerDown(PointerDownEvent evt)
        {
            if (!isOpen || evt.target is Button) return;
            // 빈 곳을 눌러 포커스가 사라져도 마지막 항목으로 되돌린다
            var panel = DialogOpen ? null : stack[^1].panel;
            if (panel != null) FocusLater(items[panel][stack[^1].focus]);
        }

        void OnActionChange(object obj, InputActionChange change)
        {
            if (change != InputActionChange.ActionPerformed || obj is not InputAction action) return;
            var device = action.activeControl?.device;
            if (device == null || device is Mouse) return;
            bool pad = device is Gamepad;
            pauseRoot.EnableInClassList("device-gamepad", pad);
            titleRoot.EnableInClassList("device-gamepad", pad);
        }
    }
}
