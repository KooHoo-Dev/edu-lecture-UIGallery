// UI Toolkit 판 로딩 화면 — 계산은 UGUI 폴더의 LoadingProgress · LoadingSettings · ILoadOperation 을 그대로 쓰고 그리기만 다르다.
// - 바: #bar-fill 의 style.width (Length.Percent). 스피너: style.rotate. 줄무늬: #ribs 의 style.translate 를 왼쪽으로 흘린다
// - 표시기 전환은 .is-hidden (opacity) 클래스로 — 자리를 지켜 글자가 들썩이지 않는다
// - 준비 완료 입력은 InputSystem.onAnyButtonPress + 입력 잠금 (UGUI 판과 같다)
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.UIElements;

namespace UIGallery.LoadingScreen
{
    [RequireComponent(typeof(UIDocument))]
    public class LoadingViewUITK : MonoBehaviour, ILoadingScreen
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

        [Header("움직임")]
        [SerializeField] float spinnerDegPerSecond = 330f;
        [SerializeField] float ribSpacing = 64f, ribSpeed = 80f;
        [SerializeField] int ribCount = 32;
        [SerializeField] float fadeSeconds = 0.45f;

        [Tooltip("켜면 Run 할 때 이 오브젝트의 루트를 DontDestroyOnLoad 로 남긴다 — LoadSceneMode.Single 로 진짜 씬을 불러와도 페이드 · Finished 가 끝까지 돈다")]
        [SerializeField] bool persistAcrossScenes = true;

        [Header("입력 (Input System)")]
        [SerializeField] InputActionReference tipPrev;
        [SerializeField] InputActionReference tipNext;

        public event Action Finished;
        public bool IsRunning => running != null;

        VisualElement loading, tipTimerFill, spinner, bar, barFill, ribs, prompt;
        Label tipIndex, tipText, stageText, spinnerText, percent;
        LoadingProgress progress;
        ILoadOperation op;
        Coroutine running;
        IDisposable anyButton;
        float readyAt = -1f, spinAngle;
        bool pressed, activating;
        int shownPercent = -1;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            loading = root.Q("loading");
            tipIndex = root.Q<Label>("tip-index");
            tipText = root.Q<Label>("tip-text");
            tipTimerFill = root.Q("tip-timer-fill");
            stageText = root.Q<Label>("stage-text");
            spinnerText = root.Q<Label>("spinner-text");
            spinner = root.Q("spinner");
            percent = root.Q<Label>("percent");
            bar = root.Q("bar");
            barFill = root.Q("bar-fill");
            ribs = root.Q("ribs");
            prompt = root.Q("prompt");

            ribs.Clear();
            for (int i = 0; i < ribCount; i++)
            {
                var rib = new VisualElement { pickingMode = PickingMode.Ignore };
                rib.AddToClassList("rib");
                rib.style.left = i * ribSpacing;
                ribs.Add(rib);
            }
            loading.style.opacity = 0f;   // Run 전에는 숨김

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
            loading.style.opacity = 1f;
            loading.pickingMode = PickingMode.Position;
            ShowTip();

            while (!progress.Ready)
            {
                progress.Tick(op.Progress, Time.unscaledDeltaTime);
                Paint();
                yield return null;
            }

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
                yield return new WaitForSecondsRealtime(0.25f);
            }

            activating = true;
            op.AllowActivation();
            while (!op.IsDone)
            {
                Paint();
                yield return null;
            }

            for (float t = 0f; t < fadeSeconds; t += Time.unscaledDeltaTime)
            {
                loading.style.opacity = 1f - t / fadeSeconds;
                yield return null;
            }
            loading.style.opacity = 0f;
            loading.pickingMode = PickingMode.Ignore;
            running = null;
            Finished?.Invoke();
        }

        void Update()
        {
            if (running == null || progress == null) return;
            float dt = Time.unscaledDeltaTime;
            if (progress.TickTip(dt, tips.Length)) ShowTip();
            tipTimerFill.style.width = Length.Percent(progress.TipRemain01 * 100f);
            if (!progress.Ready)
            {
                spinAngle += spinnerDegPerSecond * dt;
                spinner.style.rotate = new Rotate(new Angle(spinAngle % 360f, AngleUnit.Degree));
            }
            ribs.style.translate = new Translate(-Mathf.Repeat(Time.unscaledTime * ribSpeed, ribSpacing), 0);
        }

        void Paint()
        {
            barFill.style.width = Length.Percent(progress.Display * 100f);
            int pct = Mathf.FloorToInt(progress.Display * 100f + 0.0001f);
            if (pct != shownPercent)
            {
                shownPercent = pct;
                percent.text = $"{pct}%";
            }
            bar.EnableInClassList("is-hidden", !progress.ShowBar);
            percent.EnableInClassList("is-hidden", !progress.ShowPercent);
            stageText.EnableInClassList("is-hidden", !progress.ShowStages);
            stageText.EnableInClassList("is-stalled", progress.Stalled);
            stageText.text = activating ? "입장하는 중…" : progress.StageText(op);
            spinner.EnableInClassList("spinner--big", progress.BigSpinner);
            spinnerText.EnableInClassList("is-hidden", !progress.BigSpinner);
            spinnerText.text = activating ? "입장하는 중…" : progress.Ready ? "준비 완료" : progress.Stalled ? "조금 오래 걸리는 중…" : "불러오는 중";
            bool showPrompt = progress.Ready && settings.waitForInput;
            prompt.style.opacity = showPrompt ? 0.75f + 0.25f * Mathf.Cos(Time.unscaledTime * Mathf.PI * 2f) : 0f;   // 1Hz
        }

        void ShowTip()
        {
            if (tips.Length == 0) return;
            tipText.text = tips[progress.Tip];
            tipIndex.text = $"{progress.Tip + 1} / {tips.Length}";
            // 붙였다가 다음 프레임에 떼면 USS transition 으로 밀려 들어온다
            tipText.AddToClassList("is-entering");
            tipText.schedule.Execute(() => tipText.RemoveFromClassList("is-entering")).StartingIn(16);   // 한 프레임 뒤 — 같은 갱신 안에서 떼면 transition 이 보이지 않는다
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
            if (readyAt < 0f || Time.unscaledTime - readyAt < settings.inputLockSeconds) return;   // 입력 잠금
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
