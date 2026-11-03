// 구매 확인 창 (UGUI). 문구 · 입력 잠금 · 부족 판정 · 결제 순서는 ShopData.cs 의 PurchaseFlow 가 정하고, 이 창은 그리기와 입력만 맡는다.
// 기본 선택은 취소, ← → 는 취소 ↔ 구매에 가둔다(버튼은 기본 Color Tint 라 선택이 보인다). 닫으면 창을 연 카드로 선택을 돌려준다.
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
        [SerializeField] TextMeshProUGUI title, contents, price, afterBalance, refund, notice, buyLabel;
        [SerializeField] Button cancelButton, buyButton;
        [Tooltip("Image Type = Filled · Horizontal — 잠금 진행")] [SerializeField] Image lockBar;
        [SerializeField] float inputLockSeconds = 0.35f;
        [Tooltip("끄면 '나쁜 예': 구매 후 잔액 줄이 없다")] [SerializeField] bool showAfterBalance = true;

        /// <summary>결정이 모자라 '충전 상품 보기' 를 눌렀다 (창은 이미 닫혔다)</summary>
        public event Action ChargeGuideRequested;

        PurchaseFlow flow;
        CanvasGroup group;
        GameObject opener;
        float pressedAt = -1f;
        int upFrame = -1;

        public bool IsOpen => group.interactable;
        public bool IsPaying => flow.Paying;
        public void SetShowAfterBalance(bool on) => showAfterBalance = on;

        void Awake()
        {
            group = GetComponent<CanvasGroup>();
            flow = new PurchaseFlow(Wallet.Shared) { lockSeconds = inputLockSeconds };
            cancelButton.onClick.AddListener(() => Close());
            buyButton.onClick.AddListener(OnBuy);
            // onClick 은 손을 뗄 때 온다 — 누른 시각은 PointerDown 으로 먼저 받는다
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

        public void Open(Product p)
        {
            bool wasOpen = IsOpen;
            if (!flow.Open(p, Time.unscaledTime)) return;
            if (!wasOpen) opener = EventSystem.current != null ? EventSystem.current.currentSelectedGameObject : null;   // 창을 연 카드
            Fill();
            SetVisible(true);
            Select(cancelButton.gameObject);   // 기본 선택은 취소 — 습관적인 Submit 이 결제가 되지 않게
        }

        /// <summary>창을 닫고 선택을 select(없으면 창을 연 카드)로 돌려준다 — 숨은 버튼에 선택이 남으면 패드로 진열에 못 돌아간다</summary>
        public bool Close(GameObject select = null)
        {
            if (flow.Paying) return false;
            flow.Close();
            if (!IsOpen) return true;
            SetVisible(false);
            Select(select != null ? select : opener);
            return true;
        }

        static void Select(GameObject go)
        {
            if (go != null && go.activeInHierarchy && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(go);
        }

        void Fill()
        {
            title.text = flow.Current.displayName;
            contents.text = flow.Contents;
            price.text = flow.Price;
            afterBalance.gameObject.SetActive(showAfterBalance);
            afterBalance.text = flow.After;
            refund.text = flow.Current.refundText;
            notice.text = flow.Notice;
            notice.gameObject.SetActive(flow.Notice != null);
            buyLabel.text = flow.BuyLabel;
            cancelButton.interactable = buyButton.interactable = !flow.Paying;   // 스토어 확인 중에는 두 번 결제되지 않게
        }

        void Update()
        {
            if (!IsOpen) return;
            lockBar.fillAmount = flow.LockProgress(Time.unscaledTime);
            // 뒤로: Esc · 패드 오른쪽 버튼 (UI/Cancel 액션 하나로 묶어도 된다)
            if ((Keyboard.current?.escapeKey.wasPressedThisFrame ?? false) || (Gamepad.current?.buttonEast.wasPressedThisFrame ?? false)) Close();
        }

        void OnBuy()
        {
            // 마우스 · 터치는 누른 시각, 키보드 · 패드 Submit 은 지금 시각. 누르고 밖으로 끈 기록이 섞이지 않게 손 뗀 프레임만 인정
            float at = pressedAt >= 0f && upFrame == Time.frameCount ? pressedAt : Time.unscaledTime;
            pressedAt = -1f;
            switch (flow.Press(at))
            {
                case PurchaseFlow.Result.NeedCharge:
                    SetVisible(false);
                    ChargeGuideRequested?.Invoke();   // 상점이 충전 목록을 강조하고 선택을 옮긴다
                    break;
                case PurchaseFlow.Result.Pay:
                    StartCoroutine(Pay());
                    break;
            }
        }

        IEnumerator Pay()
        {
            Vector2 from = RectTransformUtility.WorldToScreenPoint(null, icon.position);
            // UnityEngine.Object 는 ?. 가 '파괴됨' 을 못 본다 — != null 로 확인
            Coroutine pay = StartCoroutine(flow.Pay((g, i) => { if (CurrencyBar.Instance != null) CurrencyBar.Instance.Fly(g.currency, g.value, from, i * 0.16f); }));
            Fill();   // '스토어 확인 중…' · 두 버튼 끔
            yield return pay;
            if (flow.Current == null) Close();
            else Fill();   // 멈췄다 — 이유를 창에 남긴다
        }

        void OnDisable()
        {
            // 결제 대기 중 꺼지면 코루틴이 멈춘다 — 상태를 되돌린다 (실제 게임은 다음 접속 때 스토어의 미완료 구매를 받아 지급한다)
            StopAllCoroutines();
            flow?.Abort();
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
