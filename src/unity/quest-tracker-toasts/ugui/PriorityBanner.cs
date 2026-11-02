using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 우선 배너 — 임무 완료처럼 최상위 알림만 쓰는 별도 채널 (일반 토스트 큐와 분리).
    /// 배너가 떠 있는 동안 ToastStackView.Frozen = true 로 일반 토스트의 남은 시간이 줄지 않게 한다.
    /// 배너끼리는 겹치지 않게 자기만의 작은 대기열을 가진다.
    /// 시간: 들어오기 0.25초(ease-out) · 전체 2.5초 · 나가기 0.3초(ease-in). Time.deltaTime 기반이라 일시정지 중 멈춘다.
    /// </summary>
    public class PriorityBanner : MonoBehaviour
    {
        [SerializeField] CanvasGroup group;
        [SerializeField] RectTransform panel;
        [SerializeField] TextMeshProUGUI eyebrow;
        [SerializeField] TextMeshProUGUI title;
        [SerializeField] TextMeshProUGUI sub;
        [SerializeField] ToastStackView toasts;
        [SerializeField] float totalSeconds = 2.5f;
        [SerializeField] float inSeconds = 0.25f;
        [SerializeField] float outSeconds = 0.3f;
        [SerializeField] float dropDistance = 28f;

        readonly Queue<(string eyebrow, string title, string sub)> waiting = new();
        Vector2 home;
        bool showing;

        void Awake()
        {
            home = panel.anchoredPosition;
            group.alpha = 0f;
            group.blocksRaycasts = false;
            group.interactable = false;
        }

        public void Show(string eyebrowText, string titleText, string subText)
        {
            waiting.Enqueue((eyebrowText, titleText, subText));
            if (!showing) StartCoroutine(Run());
        }

        IEnumerator Run()
        {
            showing = true;
            while (waiting.Count > 0)
            {
                var b = waiting.Dequeue();
                eyebrow.text = b.eyebrow;
                title.text = b.title;
                sub.text = b.sub;
                if (toasts != null) toasts.Frozen = true;

                float t = 0f;
                while (t < totalSeconds)
                {
                    t += Time.deltaTime;
                    float a;
                    if (t < inSeconds)
                    {
                        float k = 1f - Mathf.Pow(1f - t / inSeconds, 3f);
                        a = k;
                        panel.anchoredPosition = home + new Vector2(0f, dropDistance * (1f - k));
                    }
                    else if (t > totalSeconds - outSeconds)
                    {
                        float k = Mathf.Clamp01((t - (totalSeconds - outSeconds)) / outSeconds);
                        a = 1f - k * k;
                        panel.anchoredPosition = home + new Vector2(0f, dropDistance * 0.6f * k);
                    }
                    else
                    {
                        a = 1f;
                        panel.anchoredPosition = home;
                    }
                    group.alpha = a;
                    yield return null;
                }
                group.alpha = 0f;
                if (toasts != null) toasts.Frozen = false;
            }
            showing = false;
        }
    }
}
