using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.InventoryGridTooltip
{
    // 능력치 한 줄: 이름 · 막대(현재 값 + 장착품 눈금) · 값 · 차이(▲ +28 / ▼ +1.6).
    // 차이는 '기호 + 부호 있는 숫자 + 색' 세 겹으로 쓴다 — 색만으로 좋고 나쁨을 전달하지 않는다.
    public class StatRowView : MonoBehaviour
    {
        [SerializeField] TMP_Text label;
        [SerializeField] Image fill;          // Filled · Horizontal
        [SerializeField] RectTransform baseTick; // 장착품 값 위치 (막대 RectTransform 의 자식, 앵커 x 로 이동)
        [SerializeField] TMP_Text value;
        [SerializeField] TMP_Text delta;

        public void Set(StatKey key, float v, float? baseValue, RarityStyle style)
        {
            label.text = StatInfo.HigherIsBetter(key) ? StatInfo.Label(key) : $"{StatInfo.Label(key)} <size=80%>↓좋음</size>";
            fill.fillAmount = Mathf.Clamp01(v / StatInfo.Max(key));
            value.text = StatInfo.Format(key, v) + (key == StatKey.Weight ? "<size=70%>kg</size>" : "");

            bool compare = baseValue.HasValue;
            baseTick.gameObject.SetActive(compare);
            delta.gameObject.SetActive(compare);
            if (!compare) return;

            float b = baseValue.Value;
            float t = Mathf.Clamp01(b / StatInfo.Max(key));
            baseTick.anchorMin = new Vector2(t, 0f);
            baseTick.anchorMax = new Vector2(t, 1f);
            baseTick.anchoredPosition = Vector2.zero;

            float diff = v - b;
            int verdict = StatInfo.Verdict(key, diff);
            // 화살표 = 좋고 나쁨, 숫자 부호 = 실제 증감. 무게가 1.6 늘면 '▼ +1.6'
            string arrow = verdict > 0 ? "▲" : verdict < 0 ? "▼" : "＝";
            string num = verdict == 0 ? "같음" : (diff > 0 ? "+" : "−") + StatInfo.Format(key, Mathf.Abs(diff));
            delta.text = $"{arrow} {num}";
            delta.color = style.VerdictColor(verdict);
        }
    }
}
