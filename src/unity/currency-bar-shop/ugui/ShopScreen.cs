// 상점 화면 — 상품표로 진열 카드를 만들고, 카드 · 재화 바의 + 버튼 · 확인 창을 잇는다.
// 재화 바(CurrencyBar)는 씬이 바뀌어도 남으므로, 이 화면이 사라질 때 바의 이벤트 구독을 꼭 해제한다.
// 시험용 키 (새 Input System): F1 결정 +500 (날아오는 것 없이 바로 카운트업) · F2 피드백 · 구매 후 잔액 끄기/켜기 (나쁜 예 비교)
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.CurrencyBarShop
{
    public class ShopScreen : MonoBehaviour
    {
        [SerializeField] ShopItemCard bundleCardPrefab, packCardPrefab;
        [SerializeField] RectTransform bundleGrid, packList;
        [SerializeField] PurchaseConfirmPanel confirm;
        [Tooltip("충전 상품 목록 강조 테두리 (평소 꺼 둠)")] [SerializeField] Graphic packHighlight;

        readonly List<Product> catalog = Catalog.Default();
        readonly List<ShopItemCard> cards = new();
        Product energyRefill;
        ShopItemCard firstPack;
        bool feedback = true;

        void Start()
        {
            foreach (Product p in catalog)
            {
                if (p.id == "energy")
                {
                    energyRefill = p;   // 진열하지 않고 재화 바의 + 로만 연다
                    continue;
                }
                ShopItemCard card = Instantiate(p.IsCashPack ? packCardPrefab : bundleCardPrefab, p.IsCashPack ? packList : bundleGrid);
                card.Bind(p);
                card.Clicked += OnCardClicked;
                cards.Add(card);
                if (p.IsCashPack && firstPack == null) firstPack = card;
            }
            packHighlight.enabled = false;
            confirm.ChargeGuideRequested += OnChargeGuide;
            if (CurrencyBar.Instance != null) CurrencyBar.Instance.PlusPressed += OnPlus;
            if (cards.Count > 0) EventSystem.current?.SetSelectedGameObject(cards[0].gameObject);
        }

        void OnDestroy()
        {
            if (CurrencyBar.Instance != null) CurrencyBar.Instance.PlusPressed -= OnPlus;   // 바는 남고 상점만 사라진다
            if (confirm != null) confirm.ChargeGuideRequested -= OnChargeGuide;
        }

        void OnCardClicked(Product p) => confirm.Open(p, Wallet.Shared);

        void OnPlus(Currency c)
        {
            if (c == Currency.Energy) confirm.Open(energyRefill, Wallet.Shared);
            else OnChargeGuide(0);   // 결정 + 는 결제 창을 바로 열지 않고 충전 상품 목록으로
        }

        void OnChargeGuide(int shortBy)
        {
            StopAllCoroutines();
            StartCoroutine(Highlight());
            if (firstPack != null) EventSystem.current?.SetSelectedGameObject(firstPack.gameObject);
        }

        IEnumerator Highlight()
        {
            packHighlight.enabled = true;
            for (float t = 0f; t < 3f; t += Time.unscaledDeltaTime)
            {
                // 0.6초 왕복 (2Hz 이하)
                Color c = packHighlight.color;
                c.a = 0.45f + 0.45f * Mathf.PingPong(t / 0.6f, 1f);
                packHighlight.color = c;
                yield return null;
            }
            packHighlight.enabled = false;
        }

        void Update()
        {
            Keyboard k = Keyboard.current;
            if (k == null) return;
            if (k.f1Key.wasPressedThisFrame) Wallet.Shared.Add(Currency.Gem, 500);
            if (k.f2Key.wasPressedThisFrame)
            {
                feedback = !feedback;
                CurrencyBar.Instance?.SetFeedback(feedback);
                confirm.SetShowAfterBalance(feedback);
                Debug.Log(feedback ? "피드백 · 구매 후 잔액 켬" : "나쁜 예: 피드백 · 구매 후 잔액 끔");
            }
        }
    }
}
