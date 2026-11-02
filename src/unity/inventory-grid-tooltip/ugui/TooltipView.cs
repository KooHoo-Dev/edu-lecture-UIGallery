using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.InventoryGridTooltip
{
    // 비교 툴팁. 순서가 핵심이다:
    //   ① 내용 채우기 → ② ForceRebuildLayoutImmediate 로 크기 확정 → ③ 칸 오른쪽에 두기
    //   → ④ 넘치면 왼쪽으로 뒤집기 → ⑤ 그래도 넘치면 레이어 안으로 Clamp → ⑥ 알파·크기만 페이드 (위치는 애니메이션하지 않는다)
    // 이 오브젝트의 CanvasGroup.blocksRaycasts 는 꺼 둔다. 켜져 있으면 커서가 툴팁에 걸려 깜빡인다.
    [RequireComponent(typeof(CanvasGroup))]
    public class TooltipView : MonoBehaviour
    {
        [SerializeField] Canvas canvas;
        [SerializeField] RectTransform layer;        // TooltipLayer — 전체 화면 stretch, 피벗 (0.5, 0.5)
        [SerializeField] RarityStyle style;

        [Header("내용")]
        [SerializeField] Image headerBand;
        [SerializeField] Image headerMark;
        [SerializeField] TMP_Text rarityName;
        [SerializeField] TMP_Text kind;
        [SerializeField] GameObject equippedBadge;
        [SerializeField] TMP_Text itemName;
        [SerializeField] TMP_Text vsLine;
        [SerializeField] TMP_Text score;
        [SerializeField] TMP_Text scoreDelta;
        [SerializeField] GameObject compareBlock;
        [SerializeField] StatRowView[] rows = new StatRowView[4];
        [SerializeField] TMP_Text description;

        [Header("배치")]
        [SerializeField] float gap = 16f;
        [SerializeField] float margin = 24f;
        [SerializeField] bool edgeCorrection = true;
        [SerializeField] float fadeTime = 0.12f;

        RectTransform rect;
        CanvasGroup group;
        Coroutine fade;
        readonly Vector3[] corners = new Vector3[4];

        void Awake()
        {
            rect = (RectTransform)transform;
            group = GetComponent<CanvasGroup>();
            group.blocksRaycasts = false;     // 입력을 받지 않는다 (깜빡임 루프 방지)
            group.interactable = false;
            group.alpha = 0f;
            // 피벗 왼쪽 아래, 앵커 레이어 가운데 → anchoredPosition = 레이어 로컬 좌표
            rect.pivot = Vector2.zero;
            rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
        }

        public bool IsOpen => group.alpha > 0f;

        /// <param name="equipped">같은 부위 장착품. null 이면 비교 블록 생략</param>
        public void Show(InventoryItem item, InventoryItem equipped, RectTransform anchor, bool isEquippedItem)
        {
            // ① 내용
            var tier = style.Get(item.rarity);
            headerBand.color = new Color(tier.color.r, tier.color.g, tier.color.b, 0.28f);
            headerMark.sprite = tier.cornerMark;
            headerMark.enabled = tier.cornerMark != null;
            headerMark.color = tier.color;
            rarityName.text = tier.name;                   // 희귀도는 글자로도 쓴다
            rarityName.color = tier.color;
            kind.text = SlotName(item.slot) + (item.IsEquipment ? " · 장비" : "");
            equippedBadge.SetActive(isEquippedItem);
            itemName.text = item.quantity > 0 ? $"{item.displayName} <size=75%>×{item.quantity}</size>" : item.displayName;
            description.text = item.description;

            bool compare = item.IsEquipment && equipped != null && !isEquippedItem;
            vsLine.gameObject.SetActive(compare);
            if (compare) vsLine.text = $"장착 중인 <b>{equipped.displayName}</b> 대비";

            score.gameObject.SetActive(item.IsEquipment);
            score.text = item.Score.ToString();
            scoreDelta.gameObject.SetActive(compare);
            if (compare)
            {
                int d = item.Score - equipped.Score;
                int verdict = d > 0 ? 1 : d < 0 ? -1 : 0;
                scoreDelta.text = verdict == 0 ? "＝ 같음" : $"{(verdict > 0 ? "▲" : "▼")} {(d > 0 ? "+" : "−")}{Mathf.Abs(d)}";
                scoreDelta.color = style.VerdictColor(verdict);
            }

            compareBlock.SetActive(item.IsEquipment);
            if (item.IsEquipment)
                for (int i = 0; i < rows.Length; i++)
                {
                    var key = StatInfo.All[i];
                    rows[i].Set(key, item.stats.Get(key), compare ? equipped.stats.Get(key) : (float?)null, style);
                }

            // ② 크기 확정 — ContentSizeFitter 는 다음 레이아웃 패스에서야 크기를 정하므로 강제로 다시 계산
            LayoutRebuilder.ForceRebuildLayoutImmediate(rect);

            // ③~⑤ 위치
            Place(anchor);

            // ⑥ 나타나기 (이미 떠 있으면 내용·위치만 바꾼다 → 이웃 칸으로 옮길 때 깜빡이지 않는다)
            if (!IsOpen) StartFade(1f);
        }

        public void Hide()
        {
            if (IsOpen) StartFade(0f);
        }

        void Place(RectTransform anchor)
        {
            Camera cam = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
            Rect a = RectInLayer(anchor, cam);
            Vector2 size = rect.rect.size;
            Rect b = layer.rect;
            float xMin = b.xMin + margin, xMax = b.xMax - margin, yMin = b.yMin + margin, yMax = b.yMax - margin;

            // 칸 오른쪽, 윗변 맞춤 (UGUI 는 y 가 위로 증가 → 툴팁 아래 변 = 칸 윗변 - 높이)
            float x = a.xMax + gap;
            float y = a.yMax - size.y;
            if (edgeCorrection)
            {
                if (x + size.x > xMax)
                {
                    float flipped = a.xMin - gap - size.x;     // 넘치면 왼쪽으로 뒤집기
                    if (flipped >= xMin) x = flipped;
                }
                x = Mathf.Clamp(x, xMin, xMax - size.x);       // 그래도 넘치면 고정
                y = Mathf.Clamp(y, yMin, yMax - size.y);
            }
            rect.anchoredPosition = new Vector2(x, y);
        }

        /// 칸의 네 모서리 → 화면 좌표 → 툴팁 레이어 로컬 좌표
        Rect RectInLayer(RectTransform target, Camera cam)
        {
            target.GetWorldCorners(corners);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, RectTransformUtility.WorldToScreenPoint(cam, corners[0]), cam, out Vector2 min);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, RectTransformUtility.WorldToScreenPoint(cam, corners[2]), cam, out Vector2 max);
            return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
        }

        void StartFade(float to)
        {
            if (fade != null) StopCoroutine(fade);
            fade = StartCoroutine(Fade(to));
        }

        IEnumerator Fade(float to)
        {
            float from = group.alpha;
            float dur = to > from ? fadeTime : fadeTime * 0.66f;   // 사라질 때가 더 짧다
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)  // 일시정지 메뉴에서도 움직이도록 unscaled
            {
                float k = t / dur;
                group.alpha = Mathf.Lerp(from, to, k);
                rect.localScale = Vector3.one * Mathf.Lerp(0.96f, 1f, to > from ? k : 1f - k);
                yield return null;
            }
            group.alpha = to;
            rect.localScale = Vector3.one;
        }

        static string SlotName(EquipSlot s) => s switch
        {
            EquipSlot.Head => "머리",
            EquipSlot.Body => "몸",
            EquipSlot.Hand => "손",
            EquipSlot.Power => "동력",
            _ => "소모품",
        };
    }
}
