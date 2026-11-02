using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.UpgradeDraftChoice
{
    /// <summary>
    /// 카드 한 장. 루트는 LayoutGroup 이 자리를 정하므로, 등장 연출은 자식 Content 를 움직인다
    /// (루트를 움직이면 레이아웃이 다시 계산될 때 되돌려진다). 연출은 실제 시간 — timeScale 0 에서도 돈다.
    /// 누른 시각을 기억해 두면 패널이 입력 잠금을 '누른 순간' 으로 판정한다.
    /// </summary>
    public class UpgradeCardView : MonoBehaviour, IPointerDownHandler
    {
        float pressedAt = -1f;

        public void OnPointerDown(PointerEventData e) => pressedAt = Time.unscaledTime;

        /// <summary>마지막으로 누른 시각을 꺼낸다 (없으면 -1 — 키보드 · 패드 Submit)</summary>
        public float TakePressTime()
        {
            float t = pressedAt;
            pressedAt = -1f;
            return t;
        }

        [SerializeField] Button button;
        [SerializeField] RectTransform content;
        [SerializeField] CanvasGroup group;
        [SerializeField] Image frame;
        [Tooltip("일반 · 희귀 · 영웅 순서 — 색만으로 구분하지 않게 모양(원 · 마름모 · 별)도 다르게")]
        [SerializeField] Sprite[] rarityShapes = new Sprite[3];
        [SerializeField] Color[] rarityColors = { new(0.72f, 0.78f, 0.85f), new(0.44f, 0.71f, 1f), new(1f, 0.7f, 0.28f) };
        [SerializeField] Image rarityShape;
        [SerializeField] TextMeshProUGUI rarityText;
        [SerializeField] TextMeshProUGUI kindText;
        [SerializeField] Image icon;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI levelText;
        [SerializeField] TextMeshProUGUI diffText;

        static readonly string[] RarityNames = { "일반", "희귀", "영웅" };

        public Button Button => button;
        public UpgradeDraft.Offer Offer { get; private set; }

        public void Bind(UpgradeDraft.Offer o, UpgradeDraft.Build build)
        {
            Offer = o;
            pressedAt = -1f;
            int r = (int)o.rarity;
            frame.color = rarityColors[r];
            rarityShape.sprite = rarityShapes[r];
            rarityShape.color = rarityColors[r];
            rarityText.text = RarityNames[r];
            rarityText.color = rarityColors[r];
            kindText.text = o.upgrade.kind == UpgradeKind.Weapon ? "무기" : "보조";
            icon.sprite = o.upgrade.icon;
            nameText.text = o.upgrade.displayName;
            levelText.text = o.level < 0 ? "보상" : o.level == 0 ? "NEW" : $"Lv {o.level} → {Mathf.Min(UpgradeDraft.MaxLevel, o.level + 1)}";
            diffText.text = UpgradeDraft.DiffText(o, build);
            content.localScale = Vector3.one;
        }

        public void PlayIn(float delay)
        {
            StopAllCoroutines();
            StartCoroutine(In(delay));
        }

        IEnumerator In(float delay)
        {
            group.alpha = 0f;
            content.anchoredPosition = new Vector2(0f, -40f);
            yield return new WaitForSecondsRealtime(delay);
            const float dur = 0.24f;
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / dur, 3f);   // easeOutCubic
                group.alpha = k;
                content.anchoredPosition = new Vector2(0f, Mathf.Lerp(-40f, 0f, k));
                yield return null;
            }
            group.alpha = 1f;
            content.anchoredPosition = Vector2.zero;
        }

        /// <summary>고른 카드는 커지고, 나머지는 흐려진다</summary>
        public void SetPicked(bool picked)
        {
            StopAllCoroutines();
            content.anchoredPosition = Vector2.zero;
            content.localScale = Vector3.one * (picked ? 1.06f : 1f);
            group.alpha = picked ? 1f : 0.25f;
        }
    }
}
