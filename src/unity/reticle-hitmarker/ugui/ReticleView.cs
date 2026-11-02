using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 조준점 표시 — WeaponSpread.CurrentSpread 를 '읽기만' 해서 네 팔의 간격을 맞추고,
    /// 적 조준 여부에 따라 색을 60ms 동안 바꾸고, 모양도 함께 바꾼다(중심 점 → 마름모, 팔 5 → 7px).
    /// 적이 붉은 실루엣이면 붉은 조준점은 색만으로는 잘 안 보이므로 색만으로 상태를 전달하지 않는다.
    /// 팔 Image 의 pivot 을 중심 쪽 끝(위 팔 (0.5, 0), 아래 (0.5, 1), 왼쪽 (1, 0.5), 오른쪽 (0, 0.5))으로 두면
    /// anchoredPosition 이 곧 '중심에서의 간격'이 된다.
    /// </summary>
    public class ReticleView : MonoBehaviour
    {
        [SerializeField] WeaponSpread weapon;

        [Header("팔 (RectTransform)")]
        [SerializeField] RectTransform armTop;
        [SerializeField] RectTransform armBottom;
        [SerializeField] RectTransform armLeft;
        [SerializeField] RectTransform armRight;

        [Header("색")]
        [Tooltip("중심 점 + 네 팔 Image")]
        [SerializeField] Graphic[] tinted;
        [SerializeField] Color normalColor = new(0.96f, 0.97f, 0.98f);
        [SerializeField] Color hostileColor = new(1f, 0.353f, 0.31f);
        [SerializeField] float colorFadeMs = 60f;

        [Header("적 조준 모양 (색과 함께 바뀐다)")]
        [SerializeField] RectTransform centerDot;
        [SerializeField] float armThickness = 5f;
        [SerializeField] float hostileArmThickness = 7f;
        [SerializeField] float hostileDotScale = 1.3f;

        bool hostile;
        float hostileBlend;

        /// <summary>TargetProbe 가 매 프레임 알려 준다</summary>
        public void SetHostile(bool on) => hostile = on;

        /// <summary>테스트용: 레이캐스트와 무관하게 적 조준 색을 켠다</summary>
        public bool ForceHostile { get; set; }

        // 무기의 Update 가 끝난 뒤 읽도록 LateUpdate
        void LateUpdate()
        {
            float s = weapon.CurrentSpread;
            armTop.anchoredPosition = new Vector2(0f, s);
            armBottom.anchoredPosition = new Vector2(0f, -s);
            armLeft.anchoredPosition = new Vector2(-s, 0f);
            armRight.anchoredPosition = new Vector2(s, 0f);

            // 일시정지 중에도 색은 반응하도록 unscaled
            bool on = hostile || ForceHostile;
            hostileBlend = Mathf.MoveTowards(hostileBlend, on ? 1f : 0f, Time.unscaledDeltaTime / (colorFadeMs / 1000f));
            Color c = Color.Lerp(normalColor, hostileColor, hostileBlend);
            foreach (var g in tinted) g.color = c;

            // 모양: 점은 0 → 45° 회전(마름모) + 살짝 확대, 팔은 굵어진다
            centerDot.localRotation = Quaternion.Euler(0f, 0f, 45f * hostileBlend);
            centerDot.localScale = Vector3.one * Mathf.Lerp(1f, hostileDotScale, hostileBlend);
            float th = Mathf.Lerp(armThickness, hostileArmThickness, hostileBlend);
            SetThickness(armTop, th, vertical: true);
            SetThickness(armBottom, th, vertical: true);
            SetThickness(armLeft, th, vertical: false);
            SetThickness(armRight, th, vertical: false);
        }

        static void SetThickness(RectTransform arm, float th, bool vertical)
        {
            Vector2 size = arm.sizeDelta;
            if (vertical) size.x = th; else size.y = th;
            arm.sizeDelta = size;
        }
    }
}
