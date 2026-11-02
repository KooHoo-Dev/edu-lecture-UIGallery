using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.MainPauseMenu
{
    public enum MenuCommand { Up, Down, Left, Right, Submit, Cancel, PrevPage, NextPage }

    /// <summary>
    /// 메뉴 입력을 한 곳으로 모으는 입력 버퍼 (UGUI · 새 Input System).
    /// - 입력 소비: 입력 하나는 한 단계만 처리한다. 전환 중(MenuStack.IsBusy)에 들어온 입력은 버리지 않고
    ///   큐에 담았다가 전환이 끝난 프레임에 하나씩 꺼내 적용한다 (입력 버퍼)
    /// - 입력 잠금: 메뉴가 닫히면 큐를 비우고 잠시 잠근다 → 연타하던 Esc 가 메뉴를 다시 열지 않는다
    /// - 내비게이션을 이 스크립트가 직접 처리하므로 EventSystem.sendNavigationEvents 는 끈다
    ///   (모듈과 이 스크립트가 같은 입력을 두 번 처리하지 않게). 마우스 클릭·호버는 모듈이 그대로 처리한다.
    /// - 선택이 풀려 있으면(빈 곳 클릭 등) 방향 입력 전에 마지막 항목을 다시 선택한다
    /// - 버퍼는 씬에 **하나만** 둔다. 일시정지 ↔ 타이틀처럼 메뉴가 바뀌면 SetStack 으로 대상 스택만 바꿔 끼운다.
    ///   같은 submit 액션을 구독하는 버퍼가 둘이면 Enter 한 번이 두 번 소비된다 (입력 관통)
    /// </summary>
    public class MenuInputBuffer : MonoBehaviour
    {
        public enum BusyMode { Buffer, Drop }

        [SerializeField] MenuStack stack;

        [Header("UI 액션 맵")]
        [SerializeField] InputActionReference navigate;   // Vector2: 방향키 · 십자키 · 왼쪽 스틱
        [SerializeField] InputActionReference submit;     // Enter · 아래 버튼
        [SerializeField] InputActionReference cancel;     // Esc · 오른쪽 버튼
        [SerializeField] InputActionReference prevPage;   // Q · 왼쪽 숄더
        [SerializeField] InputActionReference nextPage;   // E · 오른쪽 숄더

        [Header("규칙")]
        [SerializeField] BusyMode busyMode = BusyMode.Buffer;
        [SerializeField] int maxQueue = 4;
        [SerializeField, Tooltip("방향을 누르고 있을 때 첫 반복까지 (초)")] float repeatDelay = 0.4f;
        [SerializeField, Tooltip("이후 반복 간격 (초)")] float repeatRate = 0.12f;
        [SerializeField, Tooltip("빈 곳 클릭으로 선택이 풀리면 되살린다 (끄면 나쁜 예)")] bool recoverSelection = true;

        readonly Queue<MenuCommand> queue = new();
        float lockUntil;
        MenuCommand? heldDir;
        float nextRepeat;

        public MenuStack Stack => stack;
        public int QueuedCount => queue.Count;
        public bool Locked => Time.unscaledTime < lockUntil;

        void OnEnable()
        {
            if (EventSystem.current) EventSystem.current.sendNavigationEvents = false;
            submit.action.performed += OnSubmit;
            cancel.action.performed += OnCancel;
            prevPage.action.performed += OnPrev;
            nextPage.action.performed += OnNext;
        }

        void OnDisable()
        {
            submit.action.performed -= OnSubmit;
            cancel.action.performed -= OnCancel;
            prevPage.action.performed -= OnPrev;
            nextPage.action.performed -= OnNext;
        }

        void OnSubmit(InputAction.CallbackContext _) => Feed(MenuCommand.Submit);
        void OnCancel(InputAction.CallbackContext _) => Feed(MenuCommand.Cancel);
        void OnPrev(InputAction.CallbackContext _) => Feed(MenuCommand.PrevPage);
        void OnNext(InputAction.CallbackContext _) => Feed(MenuCommand.NextPage);

        /// <summary>입력을 받을 메뉴 스택을 바꾼다 (일시정지 ↔ 타이틀). 남은 입력은 이전 메뉴 것이므로 버린다</summary>
        public void SetStack(MenuStack next)
        {
            stack = next;
            queue.Clear();
            heldDir = null;
        }

        /// <summary>입력 하나 — 잠금 → 전환 중이면 버퍼(또는 버림) → 아니면 바로 적용</summary>
        public void Feed(MenuCommand cmd)
        {
            if (stack.Depth == 0) return;            // 메뉴가 닫혀 있음
            if (Locked) return;
            // 이 프레임에 막 열린 메뉴 — 같은 프레임의 입력은 '열기'로 이미 소비됐다 (한 입력은 한 단계만)
            if (stack.OpenedFrame == Time.frameCount) return;
            if (stack.IsBusy)
            {
                if (busyMode == BusyMode.Buffer && queue.Count < maxQueue) queue.Enqueue(cmd);
                return;                               // Drop: 버림 (눌렀는데 안 먹는 답답함)
            }
            Execute(cmd);
        }

        /// <summary>메뉴가 닫힐 때 — 남은 입력은 버리고 잠근다</summary>
        public void ClearAndLock(float seconds)
        {
            queue.Clear();
            heldDir = null;
            lockUntil = Time.unscaledTime + seconds;
        }

        void Update()
        {
            if (stack.Depth == 0) return;
            PollDirection();
            // 전환이 끝났으면 버퍼에서 '하나만' 꺼낸다 — 다음 것은 그 결과(새 전환)가 끝난 뒤
            if (!stack.IsBusy && queue.Count > 0) Execute(queue.Dequeue());
        }

        void PollDirection()
        {
            Vector2 v = navigate.action.ReadValue<Vector2>();
            MenuCommand? dir = null;
            if (v.y > 0.5f) dir = MenuCommand.Up;
            else if (v.y < -0.5f) dir = MenuCommand.Down;
            else if (v.x < -0.5f) dir = MenuCommand.Left;
            else if (v.x > 0.5f) dir = MenuCommand.Right;

            if (dir != heldDir)
            {
                heldDir = dir;
                nextRepeat = Time.unscaledTime + repeatDelay;
                if (dir.HasValue) Feed(dir.Value);
            }
            else if (dir.HasValue && Time.unscaledTime >= nextRepeat)
            {
                nextRepeat = Time.unscaledTime + repeatRate;
                Feed(dir.Value);
            }
        }

        void Execute(MenuCommand cmd)
        {
            switch (cmd)
            {
                case MenuCommand.Cancel:
                    stack.Back();   // 확인 창도 스택 한 칸 → 뒤로 = 취소
                    return;
                case MenuCommand.PrevPage:
                    stack.Page(-1);
                    return;
                case MenuCommand.NextPage:
                    stack.Page(+1);
                    return;
            }

            var es = EventSystem.current;
            if (!es) return;
            GameObject sel = es.currentSelectedGameObject;
            if (!sel || !sel.activeInHierarchy)
            {
                if (!recoverSelection) return;        // 나쁜 예: 선택이 없으면 입력이 갈 곳이 없다
                sel = stack.FallbackSelection();
                if (!sel) return;
                es.SetSelectedGameObject(sel);
                if (cmd == MenuCommand.Submit) return; // 되살린 직후의 확정은 소비만 (엉뚱한 실행 방지)
            }

            if (cmd == MenuCommand.Submit)
            {
                ExecuteEvents.Execute(sel, new BaseEventData(es), ExecuteEvents.submitHandler);
                return;
            }
            var data = new AxisEventData(es)
            {
                moveDir = cmd switch
                {
                    MenuCommand.Up => MoveDirection.Up,
                    MenuCommand.Down => MoveDirection.Down,
                    MenuCommand.Left => MoveDirection.Left,
                    _ => MoveDirection.Right,
                },
            };
            data.moveVector = cmd switch
            {
                MenuCommand.Up => Vector2.up,
                MenuCommand.Down => Vector2.down,
                MenuCommand.Left => Vector2.left,
                _ => Vector2.right,
            };
            // Selectable.OnMove 가 Navigation(Vertical + Wrap Around) 설정대로 다음 항목을 Select 한다
            ExecuteEvents.Execute(sel, data, ExecuteEvents.moveHandler);
        }
    }
}
