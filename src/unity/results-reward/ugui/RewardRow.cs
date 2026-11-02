using TMPro;
using UnityEngine;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 보상 행 하나 (라벨 + 이유 + 값). VerticalLayoutGroup 의 슬롯(LayoutElement) 안에 두고,
    /// 등장 모션은 슬롯이 아니라 이 오브젝트(content)만 움직인다 — 레이아웃이 위치를 되돌리지 않게.
    /// </summary>
    public class RewardRow : MonoBehaviour
    {
        [SerializeField] RectTransform content;
        [SerializeField] CanvasGroup group;
        [SerializeField] TMP_Text label;
        [SerializeField] TMP_Text sub;
        [SerializeField, Tooltip("오른쪽 정렬 + 고정폭 숫자(<mspace>) 권장")] TMP_Text value;
        [SerializeField] float slideDistance = 48f;

        Vector2 home;
        bool homeSaved;
        long shown = -1;

        public void Setup(RewardLine line)
        {
            if (!homeSaved)
            {
                home = content.anchoredPosition;
                homeSaved = true;
            }
            label.text = line.label;
            sub.text = line.sub;
            shown = -1;
            SetValue(0);
            Show(0f);
        }

        /// <summary>등장 진행률 0~1 → 오른쪽에서 밀려 들어오며 페이드 (easeOutCubic)</summary>
        public void Show(float t)
        {
            t = Mathf.Clamp01(t);
            float e = 1f - Mathf.Pow(1f - t, 3f);
            group.alpha = t;
            content.anchoredPosition = home + new Vector2((1f - e) * slideDistance, 0f);
        }

        /// <summary>표시값이 바뀔 때만 문자열을 만든다 (매 프레임 GC 방지)</summary>
        public void SetValue(long v)
        {
            if (v == shown) return;
            shown = v;
            value.text = "+" + v.ToString("N0");
        }
    }
}
