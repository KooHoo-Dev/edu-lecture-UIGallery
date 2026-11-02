using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.PopupQueueStack
{
    /// <summary>
    /// UI Toolkit 판 팝업 관리자 — UGUI 판(PopupManager.cs)과 같은 규칙.
    /// - 레이어: #normal-layer 뒤에 #system-layer (뒤 형제가 위에 그려진다). 창은 자기 레이어 안에서만 BringToFront
    /// - 대기열: priority 순. 일반·시스템 창이 하나라도 열려 있으면 기다리고, 닫힌 뒤 queueGapSeconds 만큼 쉬고 꺼낸다
    /// - 딤: 맨 위 창의 레이어로 옮겨 PlaceBehind(top) → 판 바깥 클릭과 그 아래 전부를 막는다
    /// - 뒤로가기: Input System 의 UI/Cancel 액션 하나 (Esc · 패드 오른쪽 · 안드로이드 뒤로)
    /// - 열림 연출 중 클릭은 무시한다 (연타로 두 번 구매 방지)
    /// 시험: 1 로비 진입(대기열)  2 구매 확인  3 분해 확인  4 연결 끊김(0.5초 뒤 탐사 보상이 대기열로)
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class PopupManagerUITK : MonoBehaviour
    {
        [SerializeField] InputActionReference cancelAction;
        [Tooltip("UI/Submit — '길게 눌러 분해' 에 포커스가 있을 때 누르고 있으면 채워진다 (키보드·패드)")]
        [SerializeField] InputActionReference submitAction;
        [SerializeField] float queueGapSeconds = 0.25f;
        [SerializeField] float transitionSeconds = 0.18f;
        [SerializeField] float holdSeconds = 0.8f;

        class Entry
        {
            public string id;
            public VisualElement el;
            public VisualElement panel;
            /// <summary>열릴 때 포커스를 줄 요소 — 위험한 창은 '취소'</summary>
            public VisualElement firstFocus;
            public bool system;
            public bool closeOnBack;
            public bool closeOnDim;
            public int priority;
            public float openedAt;
            public bool open;
        }

        readonly Dictionary<string, Entry> popups = new();
        readonly List<Entry> normal = new();
        readonly List<Entry> system = new();
        readonly List<Entry> queue = new();
        VisualElement dim;
        VisualElement hold;
        VisualElement holdFill;
        bool holding;
        float holdProgress;
        float pumpAt = -1f;
        float lateRewardAt = -1f;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            dim = root.Q("dim");

            Register(root, "notice", "notice-ok", system: false, back: true, dimClose: false, priority: 1);
            Register(root, "reward", "reward-claim", system: false, back: true, dimClose: false, priority: 2);
            Register(root, "buy", "buy-cancel", system: false, back: true, dimClose: false, priority: 9);
            Register(root, "dismantle", "dismantle-cancel", system: false, back: true, dimClose: false, priority: 9);
            Register(root, "offline", "offline-retry", system: true, back: false, dimClose: false, priority: 0);
            Register(root, "quit", "quit-cancel", system: true, back: true, dimClose: true, priority: 0);

            Bind(root, "notice-ok", "notice", () => Close("notice"));
            Bind(root, "reward-claim", "reward", () => Close("reward"));
            Bind(root, "buy-cancel", "buy", () => Close("buy"));
            Bind(root, "buy-confirm", "buy", () => { Debug.Log("구매 완료"); Close("buy"); });
            Bind(root, "dismantle-cancel", "dismantle", () => Close("dismantle"));
            Bind(root, "offline-retry", "offline", () => Close("offline"));
            Bind(root, "quit-cancel", "quit", () => Close("quit"));
            Bind(root, "quit-confirm", "quit", Application.Quit);

            dim.RegisterCallback<PointerDownEvent>(_ => OnDimClicked());

            // 길게 눌러 확정 — 누르는 동안 포인터를 붙잡아 두면 손가락이 조금 밀려도 취소되지 않는다
            hold = root.Q("hold");
            holdFill = root.Q("hold-fill");
            hold.RegisterCallback<PointerDownEvent>(e =>
            {
                if (!Accepts(popups["dismantle"])) return;
                holding = true;
                hold.CapturePointer(e.pointerId);
            });
            hold.RegisterCallback<PointerUpEvent>(e =>
            {
                holding = false;
                hold.ReleasePointer(e.pointerId);
            });
            hold.RegisterCallback<PointerCaptureOutEvent>(_ => holding = false);

            if (cancelAction != null)
            {
                cancelAction.action.performed += OnCancel;
                cancelAction.action.Enable();
            }
            submitAction?.action.Enable();
        }

        void OnDisable()
        {
            if (cancelAction != null) cancelAction.action.performed -= OnCancel;
        }

        void OnCancel(InputAction.CallbackContext _) => HandleBack();

        void Register(VisualElement root, string id, string firstFocus, bool system, bool back, bool dimClose, int priority)
        {
            VisualElement el = root.Q(id);
            popups[id] = new Entry
            {
                id = id,
                el = el,
                panel = el.Q(className: "popup__panel"),
                firstFocus = el.Q(firstFocus),
                system = system,
                closeOnBack = back,
                closeOnDim = dimClose,
                priority = priority,
            };
        }

        /// <summary>버튼 연결 — 그 창이 열리는 중이거나 닫히는 중이면 클릭을 무시한다 (연타로 두 번 실행 방지)</summary>
        void Bind(VisualElement root, string buttonName, string popupId, System.Action action)
        {
            root.Q<Button>(buttonName).clicked += () =>
            {
                if (Accepts(popups[popupId])) action();
            };
        }

        /// <summary>열려 있고, 열림 연출도 끝났다</summary>
        bool Accepts(Entry p) => p.open && Time.unscaledTime - p.openedAt >= transitionSeconds;

        Entry Top =>
            system.Count > 0 ? system[system.Count - 1] :
            normal.Count > 0 ? normal[normal.Count - 1] : null;

        public void Open(string id)
        {
            Entry p = popups[id];
            if (p.open) return;
            p.open = true;
            p.openedAt = Time.unscaledTime;
            (p.system ? system : normal).Add(p);
            p.el.BringToFront();                              // 자기 레이어 안에서만 맨 앞으로
            p.el.style.display = DisplayStyle.Flex;
            p.el.schedule.Execute(() =>
            {
                p.el.AddToClassList("popup--open");   // 다음 프레임에 붙여야 transition 이 돈다
                p.firstFocus?.Focus();                // 위험한 창은 '취소' 에서 시작
            });
            RefreshDim();
        }

        public void Close(string id)
        {
            Entry p = popups[id];
            if (!p.open) return;
            p.open = false;
            (p.system ? system : normal).Remove(p);
            if (id == "dismantle") holding = false;   // 누른 채 Esc 로 닫아도 나중에 확정되지 않게
            p.el.RemoveFromClassList("popup--open");
            p.el.schedule.Execute(() =>
            {
                if (!p.open) p.el.style.display = DisplayStyle.None;
            }).StartingIn((long)(transitionSeconds * 1000));
            RefreshDim();
            Top?.firstFocus?.Focus();
            pumpAt = Time.unscaledTime + queueGapSeconds;
        }

        public void Enqueue(string id)
        {
            Entry p = popups[id];
            if (p.open || queue.Contains(p)) return;
            int i = queue.FindIndex(q => q.priority > p.priority);
            if (i < 0) queue.Add(p);
            else queue.Insert(i, p);
            Pump();
        }

        void Pump()
        {
            if (queue.Count == 0 || normal.Count > 0 || system.Count > 0) return;
            Entry next = queue[0];
            queue.RemoveAt(0);
            Open(next.id);
        }

        public void HandleBack()
        {
            Entry top = Top;
            if (top == null)
            {
                Open("quit");
                return;
            }
            if (!top.closeOnBack) return;   // 연결 끊김: 버튼으로만 해결 (UGUI 판처럼 흔들기를 넣어도 좋다)
            Close(top.id);
        }

        void OnDimClicked()
        {
            Entry top = Top;
            if (top == null) return;
            if (top.closeOnDim)
            {
                Close(top.id);
                return;
            }
            top.panel.AddToClassList("popup__panel--bump");
            top.panel.schedule.Execute(() => top.panel.RemoveFromClassList("popup__panel--bump")).StartingIn(120);
        }

        void RefreshDim()
        {
            Entry top = Top;
            dim.EnableInClassList("dim--on", top != null);
            if (top == null) return;
            VisualElement layer = top.el.parent;
            if (dim.parent != layer) layer.Add(dim);
            dim.PlaceBehind(top.el);
        }

        void Update()
        {
            if (pumpAt >= 0f && Time.unscaledTime >= pumpAt)
            {
                pumpAt = -1f;
                Pump();
            }
            if (lateRewardAt >= 0f && Time.unscaledTime >= lateRewardAt)
            {
                lateRewardAt = -1f;
                Enqueue("reward");   // 시스템 창이 닫힐 때까지 대기열에서 기다린다
            }

            // 키보드·패드: '길게 눌러 분해' 에 포커스가 있고 Submit 을 누르고 있는 동안
            bool keyHold = submitAction != null && hold.focusController?.focusedElement == hold
                           && submitAction.action.IsPressed() && Accepts(popups["dismantle"]);
            if (holding || keyHold)
            {
                holdProgress += Time.unscaledDeltaTime / Mathf.Max(0.05f, holdSeconds);
                if (holdProgress >= 1f)
                {
                    holding = false;
                    holdProgress = 0f;
                    Debug.Log("분해 확정");
                    Close("dismantle");
                }
            }
            else
            {
                holdProgress = Mathf.Max(0f, holdProgress - Time.unscaledDeltaTime * 4f);   // 중간에 떼면 되감기
            }
            holdFill.style.width = Length.Percent(holdProgress * 100f);

            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) Enqueue("notice");
            if (kb.digit2Key.wasPressedThisFrame) Open("buy");
            if (kb.digit3Key.wasPressedThisFrame) Open("dismantle");
            if (kb.digit4Key.wasPressedThisFrame)
            {
                Open("offline");
                lateRewardAt = Time.unscaledTime + 0.5f;
            }
        }
    }
}
