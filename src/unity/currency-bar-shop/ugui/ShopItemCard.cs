// 진열 카드 하나 — 이름 · 받는 것 · 가격(원화 환산 또는 100개당 가격) · 할인(실제 판매가 대비) · 한정 기간 남은 시간.
// Button.transition = None 으로 두고 선택 표시(테두리)를 ISelectHandler · IDeselectHandler 로 직접 그린다 — 안 그리면 패드 · 키보드로 고른 카드가 보이지 않는다.
// 마우스를 올리면 그 카드를 선택해 마우스와 패드가 같은 표시 하나를 쓴다.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.CurrencyBarShop
{
    [RequireComponent(typeof(Button))]
    public class ShopItemCard : MonoBehaviour, ISelectHandler, IDeselectHandler, IPointerEnterHandler
    {
        [SerializeField] TextMeshProUGUI nameLabel, givesLabel, priceLabel, subPriceLabel, saleTag, limitTag;
        [Tooltip("선택 테두리 (평소 꺼 둠)")] [SerializeField] GameObject selectedFrame;

        public event Action<Product> Clicked;
        public Product Product { get; private set; }

        Button button;
        DateTimeOffset ends;
        long lastSecond = -1;

        void Awake()
        {
            button = GetComponent<Button>();
            button.transition = Selectable.Transition.None;
            button.onClick.AddListener(() => Clicked?.Invoke(Product));
            selectedFrame.SetActive(false);
        }

        public void Bind(Product p)
        {
            Product = p;
            nameLabel.text = p.displayName;
            givesLabel.text = Pricing.Contents(p).Replace(" · ", "\n");
            if (p.IsCashPack)
            {
                priceLabel.text = Pricing.Won(p.priceKrw);
                subPriceLabel.text = $"100개당 {Pricing.Won(Mathf.RoundToInt(p.priceKrw * 100f / Mathf.Max(1, p.GemsGiven)))}";
            }
            else
            {
                priceLabel.text = $"결정 {p.priceGem:N0}";
                subPriceLabel.text = $"약 {Pricing.Won(Pricing.GemToKrw(p.priceGem))}";   // 재화 단위 뒤에 실제 가격을 숨기지 않는다
            }
            // 할인율은 실제로 팔던 가격과 비교한다
            saleTag.gameObject.SetActive(p.wasGem > p.priceGem);
            if (p.wasGem > p.priceGem) saleTag.text = $"−{Mathf.RoundToInt((1f - (float)p.priceGem / p.wasGem) * 100f)}% · 지난주 {p.wasGem:N0}";
            limitTag.gameObject.SetActive(p.endsUnix > 0);
            if (p.endsUnix > 0) ends = DateTimeOffset.FromUnixTimeSeconds(p.endsUnix);
            lastSecond = -1;
        }

        void Update()
        {
            if (Product == null || Product.endsUnix <= 0) return;
            // 실제 게임은 접속 때 받은 서버 시각 + 흐른 시간으로 센다 (기기 시계를 믿지 않는다)
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (now == lastSecond) return;
            lastSecond = now;
            limitTag.text = "남은 " + Pricing.Remain(ends - DateTimeOffset.UtcNow);
        }

        public void OnSelect(BaseEventData e) => selectedFrame.SetActive(true);
        public void OnDeselect(BaseEventData e) => selectedFrame.SetActive(false);

        public void OnPointerEnter(PointerEventData e)
        {
            if (button.interactable) EventSystem.current?.SetSelectedGameObject(gameObject);
        }
    }
}
