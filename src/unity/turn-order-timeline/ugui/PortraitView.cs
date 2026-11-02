// 타임라인 칸 하나 (초상 프리팹). 자리 · 크기 · 투명도를 지금 값에서 목표 값으로 보간하고, 바뀐 칸 알림을 잠깐 띄운다.
// 위치는 TimelineView 가 계산해 MoveTo 로 넘긴다 — 이 스크립트는 순서를 모른다.
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.TurnOrderTimeline
{
    [RequireComponent(typeof(CanvasGroup))]
    public class PortraitView : MonoBehaviour
    {
        [Header("부품")]
        [SerializeField] Image frame;
        [SerializeField] Image body;
        [Tooltip("끼어들기 표시 (번개)")]
        [SerializeField] GameObject bolt;
        [Tooltip("지금 행동 중 테두리")]
        [SerializeField] GameObject activeOutline;
        [SerializeField] GameObject badge;
        [SerializeField] Image badgeBack;
        [SerializeField] TextMeshProUGUI badgeText;
        [SerializeField] TextMeshProUGUI nameText;
        [SerializeField] TextMeshProUGUI valueText;

        [Header("모양 — 색만이 아니라 틀 · 실루엣 모양으로도 아군 · 적을 구분한다")]
        [SerializeField] Sprite allyFrame;
        [SerializeField] Sprite enemyFrame;
        [SerializeField] Sprite allyBody;
        [SerializeField] Sprite enemyBody;
        [SerializeField] Color allyColor = new(0.353f, 0.82f, 1f);
        [SerializeField] Color enemyColor = new(1f, 0.416f, 0.361f);
        [SerializeField] Color activeValueColor = new(1f, 0.81f, 0.35f);
        [SerializeField] Color extraValueColor = new(0.77f, 0.61f, 1f);

        public RectTransform Rect { get; private set; }
        public string Key { get; private set; }
        public bool Leaving { get; private set; }
        public Vector2 Target => toPos;
        public float TargetScale => toScale;

        CanvasGroup group;
        Vector2 fromPos, toPos, curPos;
        float fromScale = 1f, toScale = 1f, curScale = 1f;
        float fromAlpha = 1f, toAlpha = 1f, curAlpha = 1f;
        float t, duration;
        float badgeLeft;

        void Awake()
        {
            Rect = (RectTransform)transform;
            group = GetComponent<CanvasGroup>();
            group.blocksRaycasts = false;
        }

        /// <summary>어떤 차례를 그릴지. 풀에서 꺼낼 때마다 다시 부른다</summary>
        public void Bind(TurnEntry e, TurnQueue.Unit unit, bool active, bool showValue)
        {
            Key = e.key;
            Leaving = false;
            bool ally = unit.setup.role == UnitRole.Ally;
            Color c = ally ? allyColor : enemyColor;
            frame.sprite = ally ? allyFrame : enemyFrame;
            frame.color = c;
            body.sprite = ally ? allyBody : enemyBody;
            body.color = c;
            nameText.text = unit.setup.displayName;
            if (bolt != null) bolt.SetActive(e.extra);
            if (activeOutline != null) activeOutline.SetActive(active);
            // 둘째 줄: 지금 차례는 "행동 중", 끼어들기는 "끼어들기", 나머지는 행동값 (숨기면 비운다)
            if (active)
            {
                valueText.text = "행동 중";
                valueText.color = activeValueColor;
            }
            else if (e.extra)
            {
                valueText.text = "끼어들기";
                valueText.color = extraValueColor;
            }
            else
            {
                valueText.text = showValue ? Mathf.RoundToInt(e.actionValue).ToString() : "";
                valueText.color = Color.white;
            }
        }

        /// <summary>지금 자리에서 목표로 seconds 동안 보간. snap 이면 바로</summary>
        public void MoveTo(Vector2 pos, float scale, float alpha, float seconds, bool snap)
        {
            if (snap || seconds <= 0f)
            {
                curPos = fromPos = toPos = pos;
                curScale = fromScale = toScale = scale;
                curAlpha = fromAlpha = toAlpha = alpha;
                t = duration = 0f;
                Apply();
                return;
            }
            fromPos = curPos;
            fromScale = curScale;
            fromAlpha = curAlpha;
            toPos = pos;
            toScale = scale;
            toAlpha = alpha;
            t = 0f;
            duration = seconds;
        }

        /// <summary>새 칸: 목표에서 offset 만큼 떨어진 곳에서 투명하게 시작해 들어온다</summary>
        public void Enter(Vector2 pos, float scale, Vector2 offset, float seconds)
        {
            MoveTo(pos + offset, scale, 0f, 0f, true);
            MoveTo(pos, scale, 1f, seconds, seconds <= 0f);
        }

        /// <summary>끝난 · 밀려난 칸: offset 방향으로 나가며 사라진다. 끝나면 Tick 이 false 를 돌려준다</summary>
        public void Leave(Vector2 offset, float seconds)
        {
            Leaving = true;
            MoveTo(curPos + offset, curScale, 0f, seconds, seconds <= 0f);
        }

        /// <summary>바뀐 칸 알림 ("2칸 앞" · "1칸 뒤" · "추가") — 글자 + 색</summary>
        public void Flag(string text, Color color, float seconds)
        {
            badge.SetActive(true);
            badgeText.text = text;
            badgeBack.color = color;
            badgeLeft = seconds;
        }

        /// <summary>매 프레임 TimelineView 가 부른다. 나가는 칸이 다 사라지면 false</summary>
        public bool Tick(float dt)
        {
            if (badgeLeft > 0f && (badgeLeft -= dt) <= 0f) badge.SetActive(false);
            if (duration <= 0f) return !Leaving;
            t += dt;
            float k = Mathf.Clamp01(t / duration);
            float e = 1f - Mathf.Pow(1f - k, 3f);   // ease-out cubic — 빨리 출발해 부드럽게 멈춘다
            curPos = Vector2.LerpUnclamped(fromPos, toPos, e);
            curScale = Mathf.LerpUnclamped(fromScale, toScale, e);
            curAlpha = Mathf.LerpUnclamped(fromAlpha, toAlpha, e);
            Apply();
            if (k >= 1f) duration = 0f;
            return !(Leaving && k >= 1f);
        }

        public void HideBadge()
        {
            badgeLeft = 0f;
            if (badge != null) badge.SetActive(false);
        }

        void Apply()
        {
            Rect.anchoredPosition = curPos;
            Rect.localScale = new Vector3(curScale, curScale, 1f);
            group.alpha = curAlpha;
        }
    }
}
