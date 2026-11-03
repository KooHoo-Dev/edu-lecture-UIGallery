// 피드 한 줄 (프리팹). 고정 열: 나 | 가해자(오른쪽 정렬) | 무기 | 피해자(왼쪽 정렬) | 합친 수 — 칸 너비는 프리팹에서 고정한다.
// 투명도는 루트 CanvasGroup 하나로 (자식마다 CrossFadeAlpha 하지 않는다). KillFeedView 가 풀에서 꺼내 Bind 하고 돌려받는다.
// 아이콘은 Image. TMP 글자 안에 넣으려면 비트맵 아틀라스로 TMP Sprite Asset 을 만들어야 해서 이 예제는 쓰지 않는다.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.KillfeedScoreboard
{
    /// <summary>무기 스프라이트 · 팀 표식 · 팀 색 — 팀은 색과 모양(캡슐 · 삼각)을 함께 쓴다</summary>
    [Serializable]
    public class FeedTheme
    {
        [Tooltip("Weapon enum 순서: 펄스 소총 · 산탄 방출기 · 정밀 조준총 · 충격 수류탄 · 진압봉 · 경계 밖")]
        public Sprite[] weaponSprites = new Sprite[6];
        public Sprite orbitMark, surfaceMark;
        public Color orbitColor = new(0.35f, 0.82f, 1f), surfaceColor = new(1f, 0.42f, 0.36f);
        [Tooltip("밝은 바탕(내가 제압한 줄)에서 쓸 진한 팀 색")]
        public Color orbitOnLight = new(0.03f, 0.4f, 0.56f), surfaceOnLight = new(0.7f, 0.16f, 0.12f);

        public Sprite Mark(Team t) => t == Team.Orbit ? orbitMark : surfaceMark;
        public Color TeamColor(Team t, bool onLight) => t == Team.Orbit ? (onLight ? orbitOnLight : orbitColor) : (onLight ? surfaceOnLight : surfaceColor);
        public Sprite WeaponSprite(Weapon w) => (int)w < weaponSprites.Length ? weaponSprites[(int)w] : null;
    }

    [RequireComponent(typeof(CanvasGroup))]
    public class FeedRowView : MonoBehaviour
    {
        [SerializeField] Image background;
        [SerializeField] GameObject victimFrame;     // 내가 이탈한 줄의 테두리 (Sliced Image)
        [SerializeField] GameObject meTag;           // "나" — 색만이 아니라 글자로도
        [SerializeField] TMP_Text attackerText;
        [SerializeField] Image attackerMark;
        [SerializeField] Image weaponIcon;
        [SerializeField] GameObject precisionMark;
        [SerializeField] Image victimMark;
        [SerializeField] TMP_Text victimText;
        [SerializeField] TMP_Text extraText;         // "+2"
        [SerializeField] RectTransform multiBadge;   // "×3"
        [SerializeField] TMP_Text multiText;

        [Header("바탕색")]
        [SerializeField] Color normalBack = new(0.04f, 0.07f, 0.11f, 0.82f);
        [SerializeField] Color mineAttackerBack = new(0.93f, 0.96f, 0.98f, 0.95f);
        [SerializeField] Color mineVictimBack = new(0.24f, 0.08f, 0.09f, 0.94f);

        const float SlideSeconds = 0.16f, EnterSeconds = 0.18f, EnterOffset = 80f;

        public CanvasGroup Group { get; private set; }
        public FeedRow Row { get; private set; }
        RectTransform rect;
        float fromY, targetY, slideT = 1f, enterT = 1f;

        void Awake()
        {
            rect = (RectTransform)transform;
            Group = GetComponent<CanvasGroup>();
            Group.blocksRaycasts = false;   // 피드는 누르는 것이 아니다 — 아래 화면 클릭을 막지 않게
            Group.interactable = false;
        }

        public void Bind(FeedRow row, MatchState match, int me, FeedTheme theme)
        {
            Row = row;
            Refresh(match, me, theme);
        }

        public void Refresh(MatchState match, int me, FeedTheme theme)
        {
            bool light = Row.mine == Involvement.Attacker;
            background.color = light ? mineAttackerBack : Row.mine == Involvement.Victim ? mineVictimBack : normalBack;
            victimFrame.SetActive(Row.mine == Involvement.Victim);
            meTag.SetActive(Row.mine != Involvement.None);

            PlayerStats a = match.Get(Row.attacker);
            attackerText.gameObject.SetActive(a != null);
            attackerMark.gameObject.SetActive(a != null);
            if (a != null) Paint(attackerText, attackerMark, a, theme, light);

            // 합친 줄은 첫 피해자 + "+n" — 내가 그 안에 있으면 내 이름을 보인다
            PlayerStats v = match.Get(Row.victims.Contains(me) ? me : Row.victims[0]);
            if (v != null) Paint(victimText, victimMark, v, theme, light);

            weaponIcon.sprite = theme.WeaponSprite(Row.weapon);
            weaponIcon.color = light ? new Color(0.06f, 0.08f, 0.11f) : Color.white;
            precisionMark.SetActive(Row.precision);
            int extra = Row.Count - 1;
            extraText.gameObject.SetActive(extra > 0);
            extraText.text = $"+{extra}";
            multiBadge.gameObject.SetActive(extra > 0);
            multiText.text = $"×{Row.Count}";
        }

        static void Paint(TMP_Text label, Image mark, PlayerStats p, FeedTheme theme, bool light)
        {
            label.text = p.displayName;
            label.color = theme.TeamColor(p.team, light);
            mark.sprite = theme.Mark(p.team);
            mark.color = label.color;
        }

        /// <summary>목표 y. instant 면 바로, 아니면 지금 자리에서 0.16초 동안 미끄러진다</summary>
        public void Place(float y, bool instant)
        {
            if (instant) fromY = targetY = y;
            else if (!Mathf.Approximately(targetY, y))
            {
                fromY = rect.anchoredPosition.y;
                targetY = y;
                slideT = 0f;
            }
        }

        public void Enter() => enterT = 0f;
        public void Punch() => multiBadge.localScale = Vector3.one * 1.7f;

        void Update()
        {
            float dt = Time.deltaTime;
            slideT = Mathf.Min(1f, slideT + dt / SlideSeconds);
            enterT = Mathf.Min(1f, enterT + dt / EnterSeconds);
            float e = 1f - Mathf.Pow(1f - slideT, 3f);
            float x = EnterOffset * Mathf.Pow(1f - enterT, 3f);   // 오른쪽에서 들어온다 (ease-out cubic)
            rect.anchoredPosition = new Vector2(x, Mathf.Lerp(fromY, targetY, e));
            if (multiBadge.gameObject.activeSelf) multiBadge.localScale = Vector3.one * Mathf.Lerp(multiBadge.localScale.x, 1f, 1f - Mathf.Exp(-16f * dt));
        }
    }
}
