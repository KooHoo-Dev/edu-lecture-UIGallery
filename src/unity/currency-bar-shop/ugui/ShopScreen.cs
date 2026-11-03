// 상점 화면 — 상품표로 진열 카드를 만들고 카드 · 재화 바의 + · 확인 창을 잇는다. 바는 씬이 바뀌어도 남으므로 사라질 때 구독을 푼다.
// 시험용 키: F1 결정 +500 (날아오는 것 없이 카운트업) · F2 피드백 · 구매 후 잔액 끄기/켜기 (나쁜 예 비교)
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
        Product energyRefill;
        GameObject firstCard, firstPack;
        Coroutine highlight;
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
                card.Clicked += confirm.Open;
                if (p.IsCashPack && firstPack == null) firstPack = card.gameObject;
                if (!p.IsCashPack && firstCard == null) firstCard = card.gameObject;
            }
            packHighlight.enabled = false;
            confirm.ChargeGuideRequested += ShowPacks;
            // 바(DontDestroyOnLoad)가 먼저 깨어나 있도록 Start 에서 구독하고 OnDestroy 에서 푼다
            if (CurrencyBar.Instance != null) CurrencyBar.Instance.PlusPressed += OnPlus;
            if (firstCard != null) EventSystem.current?.SetSelectedGameObject(firstCard);
        }

        void OnDestroy()
        {
            if (CurrencyBar.Instance != null) CurrencyBar.Instance.PlusPressed -= OnPlus;   // 바는 남고 상점만 사라진다
            if (confirm != null) confirm.ChargeGuideRequested -= ShowPacks;
        }

        void OnPlus(Currency c)
        {
            if (confirm.IsPaying) return;
            if (c == Currency.Energy) confirm.Open(energyRefill);
            else if (confirm.Close(firstPack)) ShowPacks();   // 결정 + 는 결제 창을 열지 않는다 — 열린 창을 먼저 닫고 충전 목록으로
        }

        void ShowPacks()
        {
            if (highlight != null) StopCoroutine(highlight);
            highlight = StartCoroutine(Highlight());
            if (firstPack != null) EventSystem.current?.SetSelectedGameObject(firstPack);
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
                if (CurrencyBar.Instance != null) CurrencyBar.Instance.SetFeedback(feedback);
                confirm.SetShowAfterBalance(feedback);
            }
        }
    }
}
