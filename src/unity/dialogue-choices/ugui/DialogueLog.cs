using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 대화 기록 — 지금까지 나온 대사를 화자와 함께 쌓고, 열 때 최신 줄로 스크롤한다.
    /// Content 에는 VerticalLayoutGroup + ContentSizeFitter(Vertical Fit: Preferred Size).
    /// </summary>
    public class DialogueLog : MonoBehaviour
    {
        [SerializeField] CanvasGroup group;          // 기본 숨김 (alpha 0, blocksRaycasts false)
        [SerializeField] ScrollRect scroll;
        [SerializeField] RectTransform content;
        [SerializeField] LogEntry linePrefab;        // 화자 + 본문
        [SerializeField] LogEntry choicePrefab;      // '나의 선택' 줄
        [SerializeField, Tooltip("열기 (초)")] float openTime = 0.25f;

        public bool IsOpen { get; private set; }
        float t;

        public void AddLine(string who, string role, Sprite face, string text)
        {
            var e = Instantiate(linePrefab, content);
            e.Set(who, role, face, text);
        }

        public void AddChoice(string text)
        {
            var e = Instantiate(choicePrefab, content);
            e.Set("나의 선택", "", null, text);
        }

        public void Clear()
        {
            for (int i = content.childCount - 1; i >= 0; i--) Destroy(content.GetChild(i).gameObject);
        }

        public void SetOpen(bool open)
        {
            IsOpen = open;
            group.blocksRaycasts = open;
            group.interactable = open;
            if (open)
            {
                // 레이아웃을 먼저 계산해야 0(맨 아래)이 실제 최신 줄 위치가 된다
                Canvas.ForceUpdateCanvases();
                scroll.verticalNormalizedPosition = 0f;
            }
        }

        void Update()
        {
            t = Mathf.MoveTowards(t, IsOpen ? 1f : 0f, Time.unscaledDeltaTime / openTime);
            float e = 1f - (1f - t) * (1f - t);   // ease-out
            group.alpha = e;
            ((RectTransform)transform).anchoredPosition = new Vector2(0f, -40f * (1f - e));
        }
    }
}
