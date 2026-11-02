using System;
using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;

namespace UIGallery.PopupQueueStack
{
    /// <summary>
    /// 팝업 하나 — 어느 레이어에 올라가는지, 뒤로가기·바깥 탭으로 닫히는지, 대기열 우선순위, 열림/닫힘 연출.
    /// - 창은 처음에 한 번 만들어 두고 SetActive 로 재사용한다 (매번 Instantiate/Destroy 하지 않는다)
    /// - 연출 중에는 CanvasGroup.interactable = false → 연타로 구매가 두 번 실행되지 않는다
    /// - 연출은 Time.unscaledDeltaTime → 일시정지(timeScale 0) 중에도 창은 움직인다
    /// 여닫기는 직접 하지 말고 PopupManager.Open / Close 를 거친다.
    /// </summary>
    [RequireComponent(typeof(CanvasGroup))]
    public class Popup : MonoBehaviour
    {
        public enum Layer { Normal, System }

        [Header("규칙")]
        public Layer layer = Layer.Normal;
        [Tooltip("뒤로가기(Esc · 안드로이드 뒤로)로 닫을 수 있는가. 연결 끊김처럼 버튼으로만 해결해야 하는 창은 끈다")]
        public bool closeOnBack = true;
        [Tooltip("딤(창 바깥)을 탭하면 닫히는 가벼운 창인가 (이벤트·우편·상점). 구매·분해 확인은 끈다")]
        public bool closeOnDim = false;
        [Tooltip("접속 팝업 대기열 우선순위 (작을수록 먼저)")]
        public int priority = 5;
        [Tooltip("창이 열릴 때 선택할 버튼 — 위험한 창은 '취소'")]
        public GameObject firstSelected;

        [Header("연출")]
        [SerializeField] float transitionSeconds = 0.18f;
        [Tooltip("튕김·흔들기를 줄 패널 (창 루트 아래의 실제 판)")]
        [SerializeField] RectTransform panel;

        /// <summary>닫힘 연출까지 끝났을 때</summary>
        public event Action<Popup> Closed;
        public bool IsOpen { get; private set; }

        CanvasGroup group;
        Coroutine anim;
        Coroutine feedback;

        void Awake()
        {
            group = GetComponent<CanvasGroup>();
            group.alpha = 0f;                              // 첫 열림도 0 에서 페이드인 (Show 안에서 Awake 가 불려도)
            if (!IsOpen) gameObject.SetActive(false);      // 씬에 켜진 채 두었어도 처음엔 닫힌 상태로
        }

        public void Show()
        {
            IsOpen = true;                 // SetActive(true) 에서 Awake 가 불려도 다시 꺼지지 않게 먼저 표시
            gameObject.SetActive(true);
            Play(true);
            if (firstSelected != null && EventSystem.current != null)
                EventSystem.current.SetSelectedGameObject(firstSelected);
        }

        public void Hide()
        {
            if (!IsOpen) return;
            IsOpen = false;
            Play(false);
        }

        void Play(bool open)
        {
            if (anim != null) StopCoroutine(anim);
            anim = StartCoroutine(Animate(open));
        }

        IEnumerator Animate(bool open)
        {
            group.interactable = false;
            float from = group.alpha, to = open ? 1f : 0f;
            for (float t = 0f; t < transitionSeconds; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / transitionSeconds, 3f);   // easeOutCubic
                float v = Mathf.Lerp(from, to, k);
                group.alpha = v;
                transform.localScale = Vector3.one * Mathf.Lerp(0.92f, 1f, v);
                yield return null;
            }
            group.alpha = to;
            transform.localScale = Vector3.one;
            anim = null;
            if (open)
            {
                group.interactable = true;
            }
            else
            {
                gameObject.SetActive(false);
                Closed?.Invoke(this);
            }
        }

        /// <summary>바깥 탭으로는 닫히지 않는다는 피드백 — 살짝 커졌다 돌아온다</summary>
        public void Bump() => PlayFeedback(BumpRoutine());

        /// <summary>뒤로가기로 닫을 수 없다는 피드백 — 좌우로 흔든다</summary>
        public void Shake() => PlayFeedback(ShakeRoutine());

        void PlayFeedback(IEnumerator routine)
        {
            if (panel == null || !isActiveAndEnabled) return;
            if (feedback != null) StopCoroutine(feedback);
            panel.localScale = Vector3.one;
            panel.anchoredPosition = Vector2.zero;
            feedback = StartCoroutine(routine);
        }

        IEnumerator BumpRoutine()
        {
            const float dur = 0.32f;
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)
            {
                panel.localScale = Vector3.one * (1f + 0.035f * Mathf.Sin(t / dur * Mathf.PI));
                yield return null;
            }
            panel.localScale = Vector3.one;
            feedback = null;
        }

        IEnumerator ShakeRoutine()
        {
            const float dur = 0.45f;
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)
            {
                float decay = 1f - t / dur;
                panel.anchoredPosition = new Vector2(Mathf.Sin(t * 60f) * 16f * decay, 0f);
                yield return null;
            }
            panel.anchoredPosition = Vector2.zero;
            feedback = null;
        }
    }
}
