using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 일시정지 열기 · 닫기 + 타이틀 화면 왕복 (UGUI).
    /// - 열기: Time.timeScale = 0, 액션 맵 Player → UI. 감광막 · 패널 골격은 누른 그 프레임에 켠다 (첫 반응 0ms)
    /// - 닫기: 스택 바닥에서 뒤로 · 메뉴 버튼(Close) · '이어하기'. 닫히면 입력 버퍼를 비우고 0.25초 잠근다
    /// - 일시정지(Player 맵)와 뒤로(UI 맵)는 같은 Esc 라도 맵을 바꿔서 한쪽만 켠다 → 한 입력이 두 곳에서 처리되지 않는다
    /// - 입력 버퍼는 하나만 두고, 타이틀로 가면 버퍼의 대상 스택을 titleStack 으로 바꿔 끼운다
    ///   (타이틀에도 버퍼를 따로 붙이면 Enter 한 번이 두 버퍼에서 두 번 소비된다)
    /// 메뉴 GUI 는 미리 씬에 올려 두고 CanvasGroup 으로만 켠다 (열 때 Instantiate 하면 첫 프레임이 늦다).
    /// </summary>
    public class PauseController : MonoBehaviour
    {
        [SerializeField] InputActionAsset actions;
        [SerializeField] string playerMap = "Player";
        [SerializeField] string uiMap = "UI";
        [SerializeField] InputActionReference pause;   // Player 맵: Esc · 메뉴 버튼
        [SerializeField] InputActionReference close;   // UI 맵: 메뉴 버튼 (어느 깊이에서든 닫기)

        [Header("참조")]
        [SerializeField] CanvasGroup pauseCanvas;      // BackdropDim · Panels · HintBar 를 담은 루트
        [SerializeField] MenuStack stack;
        [SerializeField] MenuInputBuffer buffer;
        [SerializeField] EmblemSpin emblem;

        [Header("타이틀 화면 (선택)")]
        [SerializeField] CanvasGroup titleCanvas;
        [SerializeField] MenuStack titleStack;

        [SerializeField] float closeLockSeconds = 0.25f;

        public bool IsOpen { get; private set; }

        void OnEnable()
        {
            pause.action.performed += OnPause;
            close.action.performed += OnClose;
            stack.BackAtBottom += Close;
            actions.FindActionMap(playerMap).Enable();
            actions.FindActionMap(uiMap).Disable();
            SetCanvas(pauseCanvas, false);
        }

        void OnDisable()
        {
            pause.action.performed -= OnPause;
            close.action.performed -= OnClose;
            stack.BackAtBottom -= Close;
        }

        void OnPause(InputAction.CallbackContext _)
        {
            if (IsOpen || buffer.Locked) return;
            Open();
        }

        void OnClose(InputAction.CallbackContext _)
        {
            if (IsOpen) Close();
        }

        public void Open()
        {
            IsOpen = true;
            Time.timeScale = 0f;
            actions.FindActionMap(playerMap).Disable();
            actions.FindActionMap(uiMap).Enable();
            SetCanvas(pauseCanvas, true);   // 이 프레임에 바로 보인다
            stack.Open();
            if (emblem) emblem.Play();
        }

        /// <summary>'이어하기' 버튼 · 바닥에서 뒤로 · 메뉴 버튼</summary>
        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false;
            stack.CloseAll();
            buffer.ClearAndLock(closeLockSeconds);
            SetCanvas(pauseCanvas, false);
            Time.timeScale = 1f;
            actions.FindActionMap(uiMap).Disable();
            // 같은 프레임의 Esc 가 Player 맵의 Pause 로 다시 들어오지 않게 한 프레임 뒤에 켠다
            StartCoroutine(EnablePlayerNextFrame());
        }

        IEnumerator EnablePlayerNextFrame()
        {
            yield return null;
            if (!IsOpen) actions.FindActionMap(playerMap).Enable();
        }

        /// <summary>확인 창의 '타이틀로' — 일시정지 스택을 닫고 타이틀 스택을 연다</summary>
        public void GoToTitle()
        {
            stack.CloseAll();
            SetCanvas(pauseCanvas, false);
            if (titleCanvas && titleStack)
            {
                SetCanvas(titleCanvas, true);
                titleStack.Open();
                buffer.SetStack(titleStack);   // 같은 버퍼가 이제 타이틀 메뉴를 받는다
            }
        }

        /// <summary>타이틀의 '이어하기' — 게임으로 돌아와 일시정지 메뉴를 다시 연다</summary>
        public void ContinueFromTitle()
        {
            if (titleStack) titleStack.CloseAll();
            if (titleCanvas) SetCanvas(titleCanvas, false);
            buffer.SetStack(stack);
            Open();
        }

        static void SetCanvas(CanvasGroup g, bool on)
        {
            if (!g) return;
            g.alpha = on ? 1f : 0f;
            g.interactable = on;
            g.blocksRaycasts = on;
        }
    }
}
