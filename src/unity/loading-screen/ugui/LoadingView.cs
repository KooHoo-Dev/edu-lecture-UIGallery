// UGUI 로딩 화면 — Run(로딩 작업) 하나로 진행 바 · 퍼센트 · 스피너 · 단계 문구 · 팁 순환 · '아무 키나 눌러 계속' 을 맡는다.
// 계산은 LoadingProgress 가 하고, 이 스크립트는 그리기와 입력만 한다. 시간은 모두 unscaled (로딩 중 timeScale = 0 이어도 돈다).
using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.UI;

namespace UIGallery.LoadingScreen
{
    public class LoadingView : MonoBehaviour, ILoadingScreen
    {
        [SerializeField] LoadingSettings settings = new();
        [SerializeField, TextArea]
        string[] tips =
        {
            "수리 키트는 전투가 끝난 뒤에 쓰면 2초 더 빨리 끝난다.",
            "잔해 드론은 등 뒤의 냉각구가 약점이다. 옆으로 돌아 들어가자.",
            "세라에게 통신탑 위치를 물으면 지도에 표시해 준다.",
            "냉각 셀 3개를 모으면 도윤의 정비소에서 회로 조각으로 바꿀 수 있다.",
            "산소 캔은 지표 탐사 구역에서만 줄어든다. 기지 안에서는 안심.",
            "하린의 탐사 기록은 기지 터미널에서 다시 읽을 수 있다.",
        };

        [Header("화면")]
        [SerializeField] CanvasGroup screen;
        [SerializeField] TextMeshProUGUI tipIndex, tipText, stageText, percentText, spinnerText;
        [SerializeField] Image tipTimer;   // Filled Horizontal — 다음 팁까지
        [SerializeField] CanvasGroup bar;
        [Tooltip("Simple Image + RectMask2D. 왼쪽 고정, anchorMax.x 로 폭을 바꾼다 (Filled 의 fillAmount 는 자식 줄무늬를 자르지 않는다)")]
        [SerializeField] RectTransform barFill;
        [SerializeField] RectTransform ribs;   // 줄무늬 Image 여러 개를 담은 RectTransform (Fill 의 RectMask2D 안 — 채워진 부분에서만 보인다)
        [SerializeField] RectTransform spinner;
        [SerializeField] CanvasGroup prompt;

        [Header("움직임")]
        [SerializeField] float spinnerDegPerSecond = 330f;
        [SerializeField] float bigSpinnerScale = 1.8f;
        [Tooltip("줄무늬 간격(px)과 흐르는 속도(px/초). 진행 방향의 반대(왼쪽)로 흐르면 더 빠르게 느껴진다")]
        [SerializeField] float ribSpacing = 64f, ribSpeed = 80f;
        [SerializeField] float fadeSeconds = 0.45f;
        [Tooltip("표시기(바)가 나타나고 사라지는 시간")]
        [SerializeField] float indicatorFadeSeconds = 0.3f;

        [Tooltip("켜면 Run 할 때 이 오브젝트의 루트를 DontDestroyOnLoad 로 남긴다 — LoadSceneMode.Single 로 진짜 씬을 불러와도 페이드 · Finished 가 끝까지 돈다")]
        [SerializeField] bool persistAcrossScenes = true;

        [Header("입력 (Input System)")]
        [SerializeField] InputActionReference tipPrev;
        [SerializeField] InputActionReference tipNext;

        /// <summary>로딩 화면이 다 걷혔다</summary>
        public event Action Finished;
        public bool IsRunning => running != null;

        LoadingProgress progress;
        ILoadOperation op;
        Coroutine running;
        IDisposable anyButton;
        float readyAt = -1f;
        bool pressed, activating;
        int shownPercent = -1;

        void OnEnable()
        {
            if (tipPrev != null)
            {
                tipPrev.action.Enable();
                tipPrev.action.performed += OnTipPrev;
            }
            if (tipNext != null)
            {
                tipNext.action.Enable();
                tipNext.action.performed += OnTipNext;
            }
        }

        void OnDisable()
        {
            if (tipPrev != null) tipPrev.action.performed -= OnTipPrev;
            if (tipNext != null) tipNext.action.performed -= OnTipNext;
            anyButton?.Dispose();
            anyButton = null;
            // 오브젝트가 꺼지면 코루틴도 멈추지만, 컴포넌트만 꺼지면 계속 돈다 — 직접 멈춰야 다시 Run 할 때 루프가 둘이 되지 않는다
            if (running != null) StopCoroutine(running);
            running = null;
        }

        public void Run(ILoadOperation operation)
        {
            // 씬이 바뀌어도 로딩 화면이 사라지지 않게 (부모가 있으면 루트째 남긴다)
            if (persistAcrossScenes) DontDestroyOnLoad(transform.root.gameObject);
            if (running != null) StopCoroutine(running);
            anyButton?.Dispose();
            anyButton = null;
            running = StartCoroutine(Routine(operation));
        }

        IEnumerator Routine(ILoadOperation operation)
        {
            op = operation;
            progress = new LoadingProgress(settings);
            pressed = activating = false;
            readyAt = -1f;
            shownPercent = -1;
            screen.alpha = 1f;
            screen.blocksRaycasts = true;
            bar.alpha = 0f;
            ShowTip();

            // 1) 불러오기 + 표시 진행률이 100% 가 될 때까지
            while (!progress.Ready)
            {
                progress.Tick(op.Progress, Time.unscaledDeltaTime);
                Paint();
                yield return null;
            }

            // 2) 준비 완료 — 기다리는 설정이면 아무 키나 (입력 잠금 뒤)
            readyAt = Time.unscaledTime;
            if (settings.waitForInput)
            {
                anyButton = InputSystem.onAnyButtonPress.Call(OnAnyButton);
                while (!pressed)
                {
                    Paint();
                    yield return null;
                }
                anyButton.Dispose();
                anyButton = null;
            }
            else
            {
                Paint();
                yield return new WaitForSecondsRealtime(0.25f);   // 100% 를 잠깐 보여 준다
            }

            // 3) 활성화 (0.9 → 1 · 새 씬의 Awake / Start)
            activating = true;
            op.AllowActivation();
            while (!op.IsDone)
            {
                Paint();
                yield return null;
            }

            // 4) 걷기
            for (float t = 0f; t < fadeSeconds; t += Time.unscaledDeltaTime)
            {
                screen.alpha = 1f - t / fadeSeconds;
                yield return null;
            }
            screen.alpha = 0f;
            screen.blocksRaycasts = false;
            running = null;
            Finished?.Invoke();
        }

        void Update()
        {
            if (running == null || progress == null) return;
            float dt = Time.unscaledDeltaTime;
            if (progress.TickTip(dt, tips.Length)) ShowTip();
            tipTimer.fillAmount = progress.TipRemain01;
            // 스피너 · 줄무늬는 실제 값이 멈춘 동안에도 돈다 — "멈춘 게 아니다" 라는 신호
            if (!progress.Ready) spinner.Rotate(0f, 0f, -spinnerDegPerSecond * dt);
            Vector2 p = ribs.anchoredPosition;
            p.x = -Mathf.Repeat(Time.unscaledTime * ribSpeed, ribSpacing);
            ribs.anchoredPosition = p;
        }

        void Paint()
        {
            Vector2 max = barFill.anchorMax;
            max.x = progress.Display;   // 왼쪽(anchorMin.x = 0)은 고정, 오른쪽 끝만 늘린다
            barFill.anchorMax = max;
            int pct = Mathf.FloorToInt(progress.Display * 100f + 0.0001f);
            if (pct != shownPercent)
            {
                shownPercent = pct;
                percentText.text = $"{pct}%";
            }
            bar.alpha = Mathf.MoveTowards(bar.alpha, progress.ShowBar ? 1f : 0f, Time.unscaledDeltaTime / Mathf.Max(0.01f, indicatorFadeSeconds));
            percentText.enabled = progress.ShowPercent;
            stageText.enabled = progress.ShowStages;
            stageText.text = activating ? "입장하는 중…" : progress.StageText(op);
            spinner.localScale = Vector3.one * (progress.BigSpinner ? bigSpinnerScale : 1f);
            spinnerText.enabled = progress.BigSpinner;
            spinnerText.text = activating ? "입장하는 중…" : progress.Ready ? "준비 완료" : progress.Stalled ? "조금 오래 걸리는 중…" : "불러오는 중";
            bool showPrompt = progress.Ready && settings.waitForInput;
            // 1Hz 숨쉬기 (맥동은 2Hz 이하)
            prompt.alpha = showPrompt ? 0.75f + 0.25f * Mathf.Cos(Time.unscaledTime * Mathf.PI * 2f) : 0f;
        }

        void ShowTip()
        {
            if (tips.Length == 0) return;
            tipText.text = tips[progress.Tip];
            tipIndex.text = $"{progress.Tip + 1} / {tips.Length}";
        }

        void OnTipPrev(InputAction.CallbackContext _) => FlipTip(-1);
        void OnTipNext(InputAction.CallbackContext _) => FlipTip(1);

        void FlipTip(int dir)
        {
            if (running == null || progress == null) return;
            progress.Flip(dir, tips.Length);
            ShowTip();
        }

        void OnAnyButton(InputControl control)
        {
            // 입력 잠금: 준비 완료 직후 0.4초 안에 누른 것은 버린다 (로딩 중 연타가 바로 넘기지 않게)
            if (readyAt < 0f || Time.unscaledTime - readyAt < settings.inputLockSeconds) return;
            // 팁 넘기기 키는 '계속' 으로 치지 않는다
            if (Uses(tipPrev, control) || Uses(tipNext, control)) return;
            pressed = true;
        }

        static bool Uses(InputActionReference r, InputControl control)
        {
            if (r == null) return false;
            foreach (InputControl c in r.action.controls)
                if (c == control) return true;
            return false;
        }
    }
}
