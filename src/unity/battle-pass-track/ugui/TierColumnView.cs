// 트랙의 칸 하나(레벨 하나 = 레벨 번호 + 무료 칸 + 프리미엄 칸). PassTrack 이 만들고 위치만 옮기며 다른 레벨에 다시 배정한다.
// 칸은 상태를 들고 있지 않다 — Bind 가 모델의 GetState 결과대로 아이콘 · 글자 · 테두리 · 맥동을 '모두' 켜고 끈다.
// 상태는 색만으로 구분하지 않는다: 상태 아이콘(자물쇠 · 왕관 · 느낌표 · 도는 표시 · 체크) + 글자 + 테두리 스프라이트(점선/실선).
using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.BattlePassTrack
{
    [RequireComponent(typeof(RectTransform))]
    public class TierColumnView : MonoBehaviour
    {
        [Serializable]
        public class SlotRefs
        {
            public Button button;
            public Image frame;
            public Image icon;
            public TextMeshProUGUI nameText;
            public TextMeshProUGUI countText;
            public Image stateIcon;
            public TextMeshProUGUI stateText;
            [Tooltip("받을 수 있음일 때만 켜서 맥동시키는 테두리 빛")]
            public Image glow;
        }

        [SerializeField] TextMeshProUGUI levelText;
        [SerializeField] Image levelPill;
        [SerializeField] SlotRefs free;
        [SerializeField] SlotRefs premium;

        [Header("모양 (TierState 순서: None, Locked, NeedsPremium, Claimable, Claiming, Claimed)")]
        [SerializeField] Sprite[] stateIcons = new Sprite[6];
        [Tooltip("점선 테두리(잠김 · 패스 필요) / 실선 테두리 — 색이 아니라 모양으로도 다르게")]
        [SerializeField] Sprite[] frameSprites = new Sprite[6];
        [SerializeField] Color[] frameColors = new Color[6];
        [Tooltip("RewardKind 순서")]
        [SerializeField] Sprite[] rewardIcons = new Sprite[8];
        [SerializeField] Color reachedPill = new(0.37f, 0.9f, 0.79f);
        [SerializeField] Color lockedPill = new(0.2f, 0.28f, 0.37f);
        [Tooltip("받을 수 있음 맥동 (Hz) — 2Hz 이하")]
        [Range(0.2f, 2f)]
        [SerializeField] float pulseHz = 0.8f;

        static readonly string[] Labels = { "", "잠김", "패스 필요", "받기", "받는 중", "받음" };

        /// <summary>칸을 눌렀다 (레벨, 줄). 리스너는 Awake 에서 한 번만 단다 — Bind 마다 달면 재활용될수록 쌓인다</summary>
        public event Action<int, PassTrackRow> Clicked;

        public int Index { get; internal set; } = -1;
        public int Level => Index + 1;
        RectTransform rect;
        public RectTransform Rect => rect != null ? rect : rect = (RectTransform)transform;

        bool anyClaimable;

        void Awake()
        {
            free.button.onClick.AddListener(() => { if (Index >= 0) Clicked?.Invoke(Level, PassTrackRow.Free); });
            premium.button.onClick.AddListener(() => { if (Index >= 0) Clicked?.Invoke(Level, PassTrackRow.Premium); });
        }

        public void Bind(PassModel model)
        {
            int level = Level;
            levelText.text = level.ToString();
            levelPill.color = level <= model.Level ? reachedPill : lockedPill;
            TierState a = BindSlot(free, model, level, PassTrackRow.Free);
            TierState b = BindSlot(premium, model, level, PassTrackRow.Premium);
            anyClaimable = a == TierState.Claimable || b == TierState.Claimable;
        }

        TierState BindSlot(SlotRefs s, PassModel model, int level, PassTrackRow row)
        {
            Reward? r = model.RewardFor(level, row);
            TierState st = model.GetState(level, row);
            int i = (int)st;
            // 켜기 · 끄기를 모두 설정한다 (재활용 셀에 이전 레벨의 표시가 남지 않게)
            s.icon.enabled = r.HasValue;
            if (r.HasValue) s.icon.sprite = rewardIcons[(int)r.Value.kind];
            s.icon.color = st == TierState.Claimed || st == TierState.Locked || st == TierState.NeedsPremium ? new Color(1f, 1f, 1f, 0.45f) : Color.white;
            s.nameText.text = r.HasValue ? r.Value.name : row == PassTrackRow.Free ? "빈칸" : "";
            s.countText.text = r.HasValue && r.Value.count > 1 ? $"×{r.Value.count:N0}" : "";
            s.stateIcon.enabled = st != TierState.None;
            s.stateIcon.sprite = stateIcons[i];
            s.stateText.text = Labels[i];
            s.frame.sprite = frameSprites[i];
            s.frame.color = frameColors[i];
            s.glow.enabled = st == TierState.Claimable;
            s.button.interactable = st == TierState.Claimable || st == TierState.NeedsPremium || st == TierState.Locked;
            return st;
        }

        void Update()
        {
            if (!anyClaimable) return;
            // 받을 수 있음: 빛의 알파만 천천히 (pulseHz). Time.unscaledTime — 일시정지 메뉴 뒤에서도 같은 박자
            float a = 0.35f + 0.35f * (0.5f - 0.5f * Mathf.Cos(Time.unscaledTime * pulseHz * Mathf.PI * 2f));
            SetGlow(free.glow, a);
            SetGlow(premium.glow, a);
        }

        static void SetGlow(Image g, float a)
        {
            if (!g.enabled) return;
            Color c = g.color;
            c.a = a;
            g.color = c;
        }
    }
}
