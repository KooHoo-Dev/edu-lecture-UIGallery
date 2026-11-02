using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace UIGallery.SubtitlesSoundCues
{
    /// <summary>
    /// 자막 대기열 — 대사를 받아 '최대 줄 수' 단위의 장으로 보여 준다.
    /// - Body(TextMeshProUGUI)의 Overflow 를 Page 로 두면 TMP 가 상자 높이에 맞춰 장을 나눠 준다
    ///   (Body 높이 = 한 줄 높이 × 최대 줄 수로 고정 — 레이아웃이 높이를 키우면 늘 한 장이 된다)
    /// - 장마다 (공백 뺀 글자 수 ÷ readingCps)초, 최소 minSeconds
    /// - 화자 이름은 화자가 바뀌거나 relabelGap 초 넘게 쉰 뒤에만 붙인다. 이어지는 장에는 붙이지 않는다
    /// - 자막 시계는 실제 시간으로 흐르되 Time.timeScale 이 0(일시정지)이면 멈춘다
    ///   → 슬로모션 중에도 읽을 시간은 그대로, 메뉴를 연 사이에 대사가 지나가 버리지 않는다
    /// 한국어를 어절 단위로 줄바꿈하려면 TMP Settings 의 Use Modern Hangul Line Breaking Rules 를 켠다.
    /// </summary>
    public class SubtitleSystem : MonoBehaviour
    {
        [Serializable]
        public class Speaker
        {
            public string id;
            public string displayName;
            public Color color = Color.white;
            [Tooltip("무전 · 전화처럼 화면에 없는 목소리")]
            public bool radio;
        }

        [SerializeField] Speaker[] speakers;
        [SerializeField] CanvasGroup box;
        [SerializeField] TextMeshProUGUI speakerText;
        [Tooltip("Overflow = Page · Wrapping 켬")]
        [SerializeField] TextMeshProUGUI body;
        [SerializeField] float readingCps = 13f;
        [SerializeField] float minSeconds = 1.5f;
        [SerializeField] float pageGap = 0.25f;
        [SerializeField] float relabelGap = 4f;

        readonly Queue<(Speaker speaker, string text)> queue = new();
        Speaker lastSpeaker;
        float lastEnd = -999f;
        Coroutine running;

        void Awake() => box.alpha = 0f;

        void OnDisable()
        {
            // 오브젝트가 꺼지면 코루틴이 멈춘다 → running 을 비워 두지 않으면 다시 켠 뒤 자막이 영영 시작되지 않는다
            StopAllCoroutines();
            running = null;
            box.alpha = 0f;
        }

        /// <summary>실제 시간으로 기다리되 일시정지(timeScale 0) 동안은 세지 않는다</summary>
        static IEnumerator Wait(float seconds)
        {
            while (seconds > 0f)
            {
                if (Time.timeScale > 0f) seconds -= Time.unscaledDeltaTime;
                yield return null;
            }
        }

        /// <summary>대사 한 줄을 대기열에 넣는다 (앞 대사가 끝나면 이어서)</summary>
        public void Say(string speakerId, string text)
        {
            Speaker sp = Array.Find(speakers, s => s.id == speakerId);
            queue.Enqueue((sp, text));
            running ??= StartCoroutine(Run());
        }

        IEnumerator Run()
        {
            while (queue.Count > 0)
            {
                (Speaker sp, string text) = queue.Dequeue();
                bool relabel = sp != null && (sp != lastSpeaker || Time.unscaledTime - lastEnd > relabelGap);
                speakerText.gameObject.SetActive(relabel);
                if (relabel)
                    speakerText.text = $"<color=#{ColorUtility.ToHtmlStringRGB(sp.color)}>{sp.displayName}</color>{(sp.radio ? "  [무전]" : "")}";

                body.text = text;
                body.pageToDisplay = 1;
                body.ForceMeshUpdate();
                int pages = Mathf.Max(1, body.textInfo.pageCount);
                box.alpha = 1f;

                for (int page = 1; page <= pages; page++)
                {
                    body.pageToDisplay = page;   // 1부터
                    body.ForceMeshUpdate();
                    yield return Wait(Mathf.Max(minSeconds, VisibleChars(page) / readingCps));
                    if (page < pages)
                    {
                        // 장 사이: 상자를 잠깐 숨겼다가, 이어지는 장은 이름 없이 다시 보인다
                        box.alpha = 0f;
                        yield return Wait(pageGap);
                        speakerText.gameObject.SetActive(false);
                        box.alpha = 1f;
                    }
                }

                lastSpeaker = sp;
                lastEnd = Time.unscaledTime;
                box.alpha = 0f;
                yield return Wait(pageGap);
            }
            running = null;
        }

        /// <summary>그 장에 실제로 보이는 글자 수 (공백 제외)</summary>
        int VisibleChars(int page)
        {
            TMP_TextInfo info = body.textInfo;
            if (page - 1 >= info.pageInfo.Length) return 0;
            TMP_PageInfo pi = info.pageInfo[page - 1];
            int n = 0;
            for (int i = pi.firstCharacterIndex; i <= pi.lastCharacterIndex && i < info.characterCount; i++)
                if (!char.IsWhiteSpace(info.characterInfo[i].character)) n++;
            return n;
        }
    }
}
