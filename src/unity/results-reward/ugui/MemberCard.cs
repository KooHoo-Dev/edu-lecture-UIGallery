using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 파티원 카드 — 경험치 바가 카운트업과 같은 값으로 차오르고, 가득 차면 0 으로 돌아가 다음 레벨을 채운다.
    /// 레벨이 오르는 순간 '레벨 업' 칩을 켠다 (크게 보여 주는 것은 별도 스포트라이트 단계의 몫).
    /// </summary>
    public class MemberCard : MonoBehaviour
    {
        [SerializeField] TMP_Text nameText;
        [SerializeField] TMP_Text levelText;
        [SerializeField] TMP_Text expText;
        [SerializeField] TMP_Text gainText;
        [SerializeField, Tooltip("Image Type = Filled, Fill Method = Horizontal")] Image expFill;
        [SerializeField] GameObject levelUpChip;

        MemberStart start;
        int shownLevel = -1;
        long shownExp = -1;
        long shownGain = -1;

        public void Setup(MemberStart m)
        {
            start = m;
            nameText.text = m.name;
            shownLevel = -1;
            shownExp = -1;
            shownGain = -1;
            SetGain(0);
        }

        public void SetGain(long gain)
        {
            var (level, exp) = ResultData.LevelAfter(start.level, start.exp, gain);
            long need = ResultData.NeedFor(level);
            expFill.fillAmount = (float)exp / need;
            if (level != shownLevel)
            {
                shownLevel = level;
                levelText.text = level.ToString();
                levelUpChip.SetActive(level > start.level);
            }
            if (exp != shownExp)
            {
                shownExp = exp;
                expText.text = exp.ToString("N0") + " / " + need.ToString("N0");
            }
            if (gain != shownGain)
            {
                shownGain = gain;
                gainText.text = gain > 0 ? "+" + gain.ToString("N0") : "";
            }
        }
    }
}
