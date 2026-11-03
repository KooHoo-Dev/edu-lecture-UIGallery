// 구매 확인 창 — 가격(원화 환산) · 구매 후 잔액 · 청약철회 가능 여부 · 부족할 때 충전 안내. 기본 선택은 취소.
// - 구매 버튼: 창이 뜬 뒤 inputLockSeconds 동안 '누른 시각' 기준으로 막는다 (onClick 은 손을 뗄 때 오므로 누른 시각을 EventTrigger 로 먼저 받는다)
// - 스토어 확인 중에는 두 버튼을 꺼서 두 번 결제되지 않게 한다. 부족하면 이 창에서 결제하지 않고 충전 상품 목록으로 보낸다
// - ← → 는 취소 ↔ 구매만 오가도록 명시적 내비게이션으로 가둔다. 버튼은 기본 Color Tint 전환이라 선택이 보인다
using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.CurrencyBarShop
{
    [RequireComponent(typeof(CanvasGroup))]
    public class PurchaseConfirmPanel : MonoBehaviour
    {
        [SerializeField] RectTransform icon;
        [SerializeField] TextMeshProUGUI title, contents, price, afterBalance, refund, shortBox, buyLabel;
        [SerializeField] Button cancelButton, buyButton;
        [Tooltip("Image Type = Filled · Horizontal — 잠금 진행")] [SerializeField] Image lockBar;
        [SerializeField] float inputLockSeconds = 0.35f;
        [Tooltip("끄면 '나쁜 예': 구매 후 잔액 줄이 없다")] [SerializeField] bool showAfterBalance = true;

        /// <summary>결정이 모자라 '충전 상품 보기' 를 눌렀다 (부족한 양)</summary>
        public event Action<int> ChargeGuideRequested;

        readonly MockStore store = new();
        CanvasGroup group;
        Product current;
        Wallet wallet;
        float unlockAt = -1f, pressedAt = -1f;
        int upFrame = -1;
        bool paying;

        public bool IsOpen => current != null;
        public void SetShowAfterBalance(bool on) => showAfterBalance = on;

        void Awake()
        {
            group = GetComponent<CanvasGroup>();
            cancelButton.onClick.AddListener(Close);
            buyButton.onClick.AddListener(OnBuy);
            var trigger = buyButton.gameObject.AddComponent<EventTrigger>();
            AddEntry(trigger, EventTriggerType.PointerDown, _ => pressedAt = Time.unscaledTime);
            AddEntry(trigger, EventTriggerType.PointerUp, _ => upFrame = Time.frameCount);
            // 포커스를 창 안에 가둔다: 취소 → 오른쪽 = 구매, 구매 → 왼쪽 = 취소, 위 · 아래는 없음
            cancelButton.navigation = new Navigation { mode = Navigation.Mode.Explicit, selectOnRight = buyButton };
            buyButton.navigation = new Navigation { mode = Navigation.Mode.Explicit, selectOnLeft = cancelButton };
            SetVisible(false);
        }

        static void AddEntry(EventTrigger t, EventTriggerType type, UnityEngine.Events.UnityAction<BaseEventData> action)
        {
            var e = new EventTrigger.Entry { eventID = type };
            e.callback.AddListener(action);
            t.triggers.Add(e);
        }

        public void Open(Product p, Wallet w)
        {
            if (paying) return;
            current = p;
            wallet = w;
            int gem = w[Currency.Gem];
            int shortBy = w.ShortOf(p);
            title.text = p.displayName;
            contents.text = Pricing.Contents(p);
            price.text = p.IsCashPack
                ? $"{Pricing.Won(p.priceKrw)}  <size=80%>모의 결제</size>"
                : $"결정 {p.priceGem:N0}  <size=80%>약 {Pricing.Won(Pricing.GemToKrw(p.priceGem))}</size>";
            afterBalance.gameObject.SetActive(showAfterBalance);
            afterBalance.text = shortBy > 0
                ? $"결정 {gem:N0} → <color=#FF6B6B>{shortBy:N0}개 부족</color>"
                : $"결정 {gem:N0} → {(p.IsCashPack ? gem + p.GemsGiven : gem - p.priceGem):N0}";
            refund.text = p.refundText;
            refund.color = p.refundable ? new Color(0.49f, 0.95f, 0.77f) : new Color(1f, 0.7f, 0.42f);
            shortBox.gameObject.SetActive(shortBy > 0);
            shortBox.text = $"결정이 {shortBy:N0}개 모자란다. 충전 상품을 직접 고른 뒤 다시 산다 — 이 창에서 결제하지 않는다.";
            buyLabel.text = shortBy > 0 ? "충전 상품 보기" : p.IsCashPack ? $"{Pricing.Won(p.priceKrw)} 결제" : "구매";
            unlockAt = Time.unscaledTime + inputLockSeconds;
            SetVisible(true);
            EventSystem.current?.SetSelectedGameObject(cancelButton.gameObject);   // 기본 선택은 취소 — 습관적인 Submit 이 결제가 되지 않게
        }

        public void Close()
        {
            if (paying || current == null) return;
            current = null;
            SetVisible(false);
        }

        void Update()
        {
            if (current == null) return;
            lockBar.fillAmount = inputLockSeconds <= 0f ? 1f : Mathf.Clamp01(1f - (unlockAt - Time.unscaledTime) / inputLockSeconds);
            // 뒤로: Esc · 패드 오른쪽 버튼 (UI/Cancel 액션 하나로 묶어도 된다)
            bool back = (Keyboard.current?.escapeKey.wasPressedThisFrame ?? false) || (Gamepad.current?.buttonEast.wasPressedThisFrame ?? false);
            if (back) Close();
        }

        void OnBuy()
        {
            // 마우스 · 터치는 누른 시각, 키보드 · 패드 Submit 은 지금 시각. 누르고 밖으로 끈 기록이 섞이지 않게 손 뗀 프레임만 인정
            float at = pressedAt >= 0f && upFrame == Time.frameCount ? pressedAt : Time.unscaledTime;
            pressedAt = -1f;
            if (current == null || paying || at < unlockAt) return;
            int shortBy = wallet.ShortOf(current);
            if (shortBy > 0)
            {
                Close();
                ChargeGuideRequested?.Invoke(shortBy);
                return;
            }
            StartCoroutine(Pay(current));
        }

        IEnumerator Pay(Product p)
        {
            paying = true;
            cancelButton.interactable = buyButton.interactable = false;
            buyLabel.text = "스토어 확인 중…";
            Vector2 from = RectTransformUtility.WorldToScreenPoint(null, icon.position);
            bool ok = false;
            yield return store.Purchase(p, r => ok = r);
            paying = false;
            cancelButton.interactable = buyButton.interactable = true;
            if (!ok)
            {
                buyLabel.text = "다시 시도";
                yield break;
            }
            if (!p.IsCashPack) wallet.TrySpend(Currency.Gem, p.priceGem);
            for (int i = 0; i < p.gives.Count; i++)
            {
                Amount g = p.gives[i];
                CurrencyBar.Instance?.Fly(g.currency, g.value, from, i * 0.16f);   // 지갑보다 먼저
                wallet.Add(g.currency, g.value);
            }
            Close();
        }

        void OnDisable()
        {
            // 결제 대기 중 꺼지면 코루틴이 멈춘다 — 실제 게임은 다음 접속 때 스토어의 미완료 구매를 받아 지급한다
            paying = false;
            if (cancelButton != null) cancelButton.interactable = buyButton.interactable = true;
        }

        void SetVisible(bool on)
        {
            group.alpha = on ? 1f : 0f;
            group.interactable = on;
            group.blocksRaycasts = on;   // 열린 동안 Dim 이 뒤 진열을 막는다
        }
    }
}
