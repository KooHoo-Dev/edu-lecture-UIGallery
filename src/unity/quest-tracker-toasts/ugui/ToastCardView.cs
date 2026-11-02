using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.QuestTrackerToasts
{
    /// <summary>
    /// 토스트 카드 1장 (ToastSlot 프리팹에 붙인다) — 두 단계 구조:
    ///   ToastSlot (이 컴포넌트 + LayoutElement)   ← 레이아웃 담당: preferredHeight 를 0 ↔ 카드 높이로 보간해 접기/펼치기
    ///   └─ Card (RectTransform + CanvasGroup)     ← 연출 담당: anchoredPosition 슬라이드, alpha 페이드
    /// LayoutGroup 의 직계 자식(슬롯)은 위치를 직접 움직이면 다음 레이아웃 계산 때 덮어써지므로, 슬라이드는 안쪽 Card 만 움직인다.
    /// 연출 시간은 Time.unscaledDeltaTime — 일시정지 메뉴 중에도 들고 나는 연출 자체는 끝까지 재생된다.
    /// </summary>
    public class ToastCardView : MonoBehaviour
    {
        [Header("참조")]
        [SerializeField] LayoutElement slot;
        [SerializeField] RectTransform card;
        [SerializeField] CanvasGroup group;
        [SerializeField] Image stripe;              // 등급 띠 (LayoutElement.preferredWidth 로 굵기)
        [SerializeField] LayoutElement stripeLayout;
        [SerializeField] TextMeshProUGUI numeral;   // Ⅰ~Ⅳ
        [SerializeField] Image icon;
        [SerializeField] TextMeshProUGUI message;
        [SerializeField] TextMeshProUGUI countBadge;
        [SerializeField] Image timerFill;           // Image Type = Filled, Horizontal (흰 단색 스프라이트 지정)

        [Header("크기 · 시간 (갤러리와 같은 값)")]
        [SerializeField] float cardHeight = 66f;
        [SerializeField] float slotHeight = 76f;    // 카드 + 간격
        [SerializeField] float enterSeconds = 0.22f;
        [SerializeField] float collapseSeconds = 0.2f;
        [SerializeField] float exitSeconds = 0.18f;
        [SerializeField] float slideDistance = 24f;

        static readonly string[] Numerals = { "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ" };
        static readonly float[] StripeWidths = { 4f, 6f, 9f, 12f };   // 색만으로 구분하지 않도록 굵기도 다르게

        public Toast Toast { get; private set; }
        Coroutine running, bumping;
        float enteredFromX = -1f;   // 들어온 쪽 — 선점으로 밀려날 때 같은 쪽(화면 바깥)으로 내보낸다

        public void Bind(Toast t, Color rarityColor, Sprite iconSprite)
        {
            Toast = t;
            int r = (int)t.req.rarity;
            stripe.color = rarityColor;
            stripeLayout.preferredWidth = StripeWidths[r];
            numeral.text = Numerals[r];
            numeral.color = rarityColor;
            icon.sprite = iconSprite;
            icon.color = rarityColor;
            message.text = t.req.label;
            timerFill.color = rarityColor;
            SetCount(t);
            SetTimer(1f);
        }

        public void SetCount(Toast t)
        {
            bool show = t.req.plusUnit || t.amount > 1;
            countBadge.gameObject.SetActive(show);
            if (show) countBadge.text = t.req.plusUnit ? $"+{t.amount}" : $"×{t.amount}";
        }

        /// <summary>남은 표시 시간 막대. 값이 바뀐 만큼만 fillAmount 를 쓴다 (메시 재생성 없음)</summary>
        public void SetTimer(float remaining01) => timerFill.fillAmount = remaining01;

        /// <param name="fromX">왼쪽 스택이면 -1, 오른쪽이면 +1, 아래 가운데면 0 (아래에서 위로)</param>
        public void PlayEnter(float fromX)
        {
            enteredFromX = fromX;
            if (running != null) StopCoroutine(running);
            running = StartCoroutine(Enter(fromX));
        }

        public void PlayExit(bool preempted, Action done)
        {
            if (running != null) StopCoroutine(running);
            running = StartCoroutine(Exit(preempted, done));
        }

        public void Bump()
        {
            SetCount(Toast);
            if (bumping != null) StopCoroutine(bumping);
            bumping = StartCoroutine(BumpRoutine());
        }

        IEnumerator Enter(float fromX)
        {
            Vector2 from = fromX == 0f ? new Vector2(0f, -slideDistance * 0.8f) : new Vector2(fromX * slideDistance, 0f);
            slot.preferredHeight = 0f;
            group.alpha = 0f;
            card.anchoredPosition = from;
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / enterSeconds)
            {
                float k = 1f - Mathf.Pow(1f - t, 3f);                                    // ease-out-cubic
                slot.preferredHeight = Mathf.Lerp(0f, slotHeight, Mathf.Min(1f, t * enterSeconds / collapseSeconds));
                card.anchoredPosition = Vector2.LerpUnclamped(from, Vector2.zero, k);
                group.alpha = k;
                yield return null;
            }
            slot.preferredHeight = slotHeight;
            card.anchoredPosition = Vector2.zero;
            group.alpha = 1f;
            running = null;
        }

        IEnumerator Exit(bool preempted, Action done)
        {
            float h0 = slot.preferredHeight;
            Vector2 p0 = card.anchoredPosition;
            // 선점으로 밀려날 때는 들어온 쪽(화면 가장자리 바깥)으로 빠진다. 아래 가운데 스택(0)은 제자리에서 접힌다 (갤러리와 같다)
            Vector2 p1 = preempted ? p0 + new Vector2(enteredFromX * slideDistance * 2f, 0f) : p0;
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / exitSeconds)
            {
                float k = t * t * t;                                                       // ease-in-cubic
                slot.preferredHeight = Mathf.Lerp(h0, 0f, k);
                group.alpha = 1f - k;
                card.anchoredPosition = Vector2.Lerp(p0, p1, k);
                yield return null;
            }
            slot.preferredHeight = 0f;
            group.alpha = 0f;
            running = null;
            done?.Invoke();
        }

        IEnumerator BumpRoutine()
        {
            var tr = countBadge.rectTransform;
            const float half = 0.08f;
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / half) { tr.localScale = Vector3.one * Mathf.Lerp(1f, 1.15f, t); yield return null; }
            for (float t = 0f; t < 1f; t += Time.unscaledDeltaTime / half) { tr.localScale = Vector3.one * Mathf.Lerp(1.15f, 1f, t); yield return null; }
            tr.localScale = Vector3.one;
            bumping = null;
        }

        void OnValidate()
        {
            if (cardHeight > slotHeight) slotHeight = cardHeight;
        }
    }
}
