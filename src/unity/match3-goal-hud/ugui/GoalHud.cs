// 퍼즐 목표 HUD (UGUI). LevelDefinition 을 읽어 목표 칸 · 별 마커 · 부스터 버튼을 만들고(자동 구성), StageState 를 그린다.
//  - 남은 이동: warnAtMoves 이하면 색 · 글자 · 맥동 (1.2Hz, 2수 이하 2Hz — 2Hz 를 넘기지 않는다)
//  - 목표: 표시값(GoalLedger.Shown)은 GoalFlyer 의 아이콘이 도착할 때 준다. 0 이면 숫자 대신 체크
//  - 별: 마커를 바 위 '임계값 / 최대 점수' 위치에 앵커로 세운다 — 해상도가 바뀌어도 같은 비율 자리
//  - 안전 영역: Screen.safeArea 를 SafeArea 의 앵커로 (노치 · 홈 표시줄 피하기). 노치 뒤까지 칠할 띠만 SafeArea 밖에 둔다
//  - 결과 창: 연 시각을 적어 두고 retryLockSeconds 안에 누른 다시 하기는 버린다 (입력 잠금). 꺼졌다 켜지면 난 결과를 다시 연다
//  - 다시 시작(Bind): 옛 칸으로 가던 비행을 GoalFlyer.CancelAll() 로 콜백 없이 거둔 뒤 칸을 다시 만든다
// 프리팹 자식 이름: GoalSlot(Icon · Count · Check) · StarMarker(Star · Label) · BoosterButton(Icon · Name · Badge/Count · Plus)
using System;
using System.Collections.Generic;
using System.Globalization;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.Match3GoalHud
{
    public class GoalHud : MonoBehaviour, IGoalHud
    {
        [Header("안전 영역")]
        [SerializeField] RectTransform safeArea;
        [Header("남은 이동")]
        [SerializeField] Image movesBackground;
        [Tooltip("맥동으로 키우는 부분 (Moves 의 자식)")] [SerializeField] RectTransform movesPulse;
        [SerializeField] TextMeshProUGUI movesCount, movesLabel;
        [SerializeField] Color movesNormal = new(0.06f, 0.09f, 0.19f), movesWarn = new(0.35f, 0.14f, 0.06f);
        [Header("목표")]
        [SerializeField] RectTransform goalRow;
        [SerializeField] RectTransform goalSlotPrefab;
        [Header("점수 · 별")]
        [SerializeField] TextMeshProUGUI scoreText;
        [Tooltip("Image Type = Filled · Horizontal")] [SerializeField] Image scoreFill;
        [Tooltip("바와 같은 폭 · 같은 자리 (마커를 앵커로 세운다)")] [SerializeField] RectTransform markerLayer;
        [SerializeField] RectTransform starMarkerPrefab;
        [SerializeField] Color starOff = new(0.15f, 0.2f, 0.3f), starOn = new(1f, 0.8f, 0.3f);
        [Header("부스터")]
        [SerializeField] RectTransform boosterRow;
        [SerializeField] Button boosterPrefab;
        [Header("결과")]
        [SerializeField] CanvasGroup resultPanel;
        [SerializeField] TextMeshProUGUI resultTitle, resultDetail;
        [SerializeField] Button retryButton;
        [Tooltip("결과 창이 뜬 뒤 이 시간 안에 누른 다시 하기는 버린다 (입력 잠금 — 마지막 연쇄 중 연타한 Submit 이 바로 다시 시작하지 않게)")]
        [SerializeField] float retryLockSeconds = 0.3f;
        [Header("비행")]
        [SerializeField] GoalFlyer flyer;
        [Tooltip("끄면 '나쁜 예': 날아가는 아이콘 · 도착 강조 · 이동 경고 없이 숫자만 바뀐다")] [SerializeField] bool feedback = true;

        class GoalView
        {
            public GoalLedger ledger;
            public RectTransform icon;
            public TextMeshProUGUI count;
            public GameObject check;
            public float pulse;
        }

        class BoosterView
        {
            public TextMeshProUGUI name, count;
            public GameObject plus;
        }

        class StarView
        {
            public Image star;
            public bool on;
            public float pop;
        }

        public event Action<int> BoosterPressed;
        public event Action RetryPressed;

        StageState state;
        readonly List<GoalView> goalViews = new();
        readonly List<BoosterView> boosterViews = new();
        readonly List<StarView> starViews = new();
        float shownScore;
        GameObject resultOpener;
        float resultOpenedAt, retryPressedAt = -1f;
        Rect lastSafe;
        Vector2Int lastScreen;

        public int FlyingCount => flyer != null ? flyer.ActiveCount : 0;

        void Awake()
        {
            // 포인터는 누른 순간을 적어 둔다 (onClick 은 뗄 때 온다). EventTrigger 는 Button 과 함께 PointerDown 을 받는다
            var trigger = retryButton.gameObject.AddComponent<EventTrigger>();
            var down = new EventTrigger.Entry { eventID = EventTriggerType.PointerDown };
            down.callback.AddListener(_ => retryPressedAt = Time.unscaledTime);
            trigger.triggers.Add(down);
            retryButton.onClick.AddListener(OnRetry);
        }

        void OnRetry()
        {
            // 입력 잠금: 창을 연 시각과 누른 시각을 비교한다. 키보드 · 패드 Submit 은 누른 프레임에 바로 오니 지금 시각
            float pressedAt = retryPressedAt >= 0f ? retryPressedAt : Time.unscaledTime;
            retryPressedAt = -1f;
            if (pressedAt - resultOpenedAt < retryLockSeconds) return;
            RetryPressed?.Invoke();
        }

        void OnEnable()
        {
            if (state != null) state.Changed += Redraw;
            lastScreen = Vector2Int.zero;   // 다시 켜지면 안전 영역을 다시 맞춘다
            // 꺼질 때 결과 창을 닫았다 — 결과가 이미 났으면 다시 연다 (보드는 같은 결과를 두 번 알리지 않는다)
            if (state != null && state.Result != StageResult.None) ShowResult(state.Result);
        }

        void OnDisable()
        {
            if (state != null) state.Changed -= Redraw;
            // 화면에 남는 상태를 되돌린다: 표시값 = 실제값, 맥동 · 강조 크기, 열린 결과 창
            if (state != null) foreach (GoalLedger g in state.goals) g.Settle();
            foreach (GoalView v in goalViews)
            {
                v.pulse = 0f;
                v.icon.localScale = Vector3.one;
            }
            if (movesPulse != null) movesPulse.localScale = Vector3.one;
            SetResultVisible(false);
            Redraw();
        }

        /* ───── 자동 구성 ───── */
        public void Bind(StageState s)
        {
            if (state != null) state.Changed -= Redraw;
            state = s;
            if (isActiveAndEnabled) state.Changed += Redraw;
            LevelDefinition level = s.level;

            // 옛 목표 칸으로 가던 비행을 콜백 없이 거둔다 — 남겨 두면 도착할 때 지워진 TMP 를 건드린다 (MissingReferenceException)
            if (flyer != null) flyer.CancelAll();

            // 결과 창을 먼저 닫아 선택을 연 곳으로 돌린다. 그게 지울 부스터 버튼이면 같은 자리의 새 버튼으로 옮긴다
            SetResultVisible(false);
            EventSystem es = EventSystem.current;
            GameObject selected = es != null ? es.currentSelectedGameObject : null;
            int selectedBooster = selected != null && selected.transform.parent == boosterRow ? selected.transform.GetSiblingIndex() : -1;
            var newBoosters = new List<Button>();

            Clear(goalRow);
            goalViews.Clear();
            foreach (GoalLedger g in s.goals)
            {
                RectTransform slot = Instantiate(goalSlotPrefab, goalRow);
                var icon = (RectTransform)slot.Find("Icon");
                icon.GetComponent<Image>().sprite = g.def.icon;
                goalViews.Add(new GoalView
                {
                    ledger = g,
                    icon = icon,
                    count = slot.Find("Count").GetComponent<TextMeshProUGUI>(),
                    check = slot.Find("Check").gameObject,
                });
            }

            // 별 마커: 앵커 x = 임계값 / 최대 점수. 픽셀로 하려면 markerLayer.rect.width × 비율
            Clear(markerLayer);
            starViews.Clear();
            for (int i = 0; i < level.starThresholds.Length; i++)
            {
                RectTransform m = Instantiate(starMarkerPrefab, markerLayer);
                float x = level.StarPosition(i);
                m.anchorMin = new Vector2(x, 0f);
                m.anchorMax = new Vector2(x, 1f);
                m.pivot = new Vector2(0.5f, 0.5f);
                // 세로로 늘린 앵커에서 sizeDelta.y 는 '부모보다 얼마나 큰가' — 프리팹 높이가 남으면 바보다 커진다
                m.sizeDelta = new Vector2(m.sizeDelta.x, 0f);
                m.anchoredPosition = Vector2.zero;
                m.Find("Label").GetComponent<TextMeshProUGUI>().text = level.starThresholds[i].ToString("N0", CultureInfo.InvariantCulture);
                starViews.Add(new StarView { star = m.Find("Star").GetComponent<Image>() });
            }

            Clear(boosterRow);
            boosterViews.Clear();
            for (int i = 0; i < level.boosters.Length; i++)
            {
                int index = i;
                Button b = Instantiate(boosterPrefab, boosterRow);
                // 0개여도 끄지 않는다 (interactable = false 면 선택이 빠져 패드로 못 움직인다) — 눌리면 상점 안내
                b.onClick.AddListener(() => BoosterPressed?.Invoke(index));
                b.transform.Find("Icon").GetComponent<Image>().sprite = level.boosters[i].icon;
                boosterViews.Add(new BoosterView
                {
                    name = b.transform.Find("Name").GetComponent<TextMeshProUGUI>(),
                    count = b.transform.Find("Badge/Count").GetComponent<TextMeshProUGUI>(),
                    plus = b.transform.Find("Badge/Plus").gameObject,
                });
                newBoosters.Add(b);
            }
            // Destroy 는 프레임 끝에 일어난다 — 지워질 버튼을 고른 채 두면 패드 선택이 사라진다
            if (selectedBooster >= 0 && newBoosters.Count > 0)
                es.SetSelectedGameObject(newBoosters[Mathf.Min(selectedBooster, newBoosters.Count - 1)].gameObject);

            shownScore = s.Score;
            Redraw();
        }

        static void Clear(RectTransform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--) Destroy(parent.GetChild(i).gameObject);
        }

        /* ───── 깨진 블록 → 목표 ───── */
        public void Fly(BlockType type, Vector3 worldPos, float delay)
        {
            GoalView v = goalViews.Find(g => g.ledger.Type == type);
            if (v == null) return;
            if (!feedback)
            {
                // 나쁜 예: 날리지 않고 숫자만 — 무엇을 모았는지 보이지 않는다
                v.ledger.Settle();
                DrawGoal(v);
                return;
            }
            flyer.Fly(v.ledger.def.icon, worldPos, v.icon, delay, () => Arrive(v));
        }

        void Arrive(GoalView v)
        {
            if (!v.ledger.Land()) return;
            v.pulse = 1f;
            DrawGoal(v);
        }

        /* ───── 그리기 ───── */
        void Redraw()
        {
            if (state == null) return;
            movesCount.text = state.MovesLeft.ToString(CultureInfo.InvariantCulture);
            foreach (GoalView v in goalViews) DrawGoal(v);
            for (int i = 0; i < boosterViews.Count; i++)
            {
                BoosterView b = boosterViews[i];
                int n = state.boosters[i];
                // 0개 = 구매 유도: 숫자 대신 +, 이름 대신 "충전" (색만이 아니라 글자 · 모양도 바뀐다)
                b.count.gameObject.SetActive(n > 0);
                b.count.text = n.ToString(CultureInfo.InvariantCulture);
                b.plus.SetActive(n == 0);
                b.name.text = n == 0 ? "충전" : state.level.boosters[i].displayName;
            }
        }

        static void DrawGoal(GoalView v)
        {
            int shown = v.ledger.Shown;
            v.count.text = shown.ToString(CultureInfo.InvariantCulture);
            v.count.gameObject.SetActive(shown > 0);
            v.check.SetActive(shown == 0);
        }

        void Update()
        {
            ApplySafeArea();
            if (state == null) return;
            float dt = Time.unscaledDeltaTime;

            // 남은 이동 경고: 색 · 글자 · 맥동
            int moves = state.MovesLeft;
            int warnAt = state.level.warnAtMoves;
            bool warn = feedback && warnAt > 0 && moves <= warnAt && state.Result == StageResult.None;
            movesBackground.color = warn ? movesWarn : movesNormal;
            movesLabel.text = moves == 0 && !state.Settled && state.Result == StageResult.None ? "연쇄 처리 중" : warn ? "이동 부족!" : "남은 이동";
            float hz = moves <= 2 ? 2f : 1.2f;
            movesPulse.localScale = Vector3.one * (warn ? 1f + 0.05f * (0.5f - 0.5f * Mathf.Cos(Time.unscaledTime * hz * 2f * Mathf.PI)) : 1f);

            // 목표 도착 강조
            foreach (GoalView v in goalViews)
            {
                v.pulse = Mathf.Max(0f, v.pulse - dt * 5f);
                v.icon.localScale = Vector3.one * (1f + 0.22f * v.pulse);
            }

            // 점수 바 · 별 (바가 마커를 지나면 켜지고 잠깐 커진다)
            shownScore = feedback ? Mathf.Lerp(shownScore, state.Score, 1f - Mathf.Exp(-8f * dt)) : state.Score;
            if (Mathf.Abs(shownScore - state.Score) < 1f) shownScore = state.Score;
            scoreText.text = Mathf.RoundToInt(shownScore).ToString("N0", CultureInfo.InvariantCulture);
            scoreFill.fillAmount = Mathf.Clamp01(shownScore / state.level.maxScore);
            for (int i = 0; i < starViews.Count; i++)
            {
                StarView s = starViews[i];
                bool on = shownScore >= state.level.starThresholds[i];
                if (on && !s.on && feedback) s.pop = 1f;
                s.on = on;
                s.pop = Mathf.Max(0f, s.pop - dt * 2.5f);
                s.star.color = on ? starOn : starOff;
                s.star.rectTransform.localScale = Vector3.one * (1f + 0.45f * Mathf.Sin(s.pop * Mathf.PI));
            }
        }

        void ApplySafeArea()
        {
            Rect sa = Screen.safeArea;
            var screen = new Vector2Int(Screen.width, Screen.height);
            if (screen.x <= 0 || screen.y <= 0 || (sa == lastSafe && screen == lastScreen)) return;
            lastSafe = sa;
            lastScreen = screen;
            // safeArea 는 픽셀 · 원점 왼쪽 아래 — 화면 크기로 나누면 앵커(0~1)
            safeArea.anchorMin = new Vector2(sa.xMin / screen.x, sa.yMin / screen.y);
            safeArea.anchorMax = new Vector2(sa.xMax / screen.x, sa.yMax / screen.y);
            safeArea.offsetMin = Vector2.zero;
            safeArea.offsetMax = Vector2.zero;
        }

        /* ───── 결과 창 ───── */
        public void ShowResult(StageResult result)
        {
            if (result == StageResult.None)
            {
                SetResultVisible(false);
                return;
            }
            bool clear = result == StageResult.Clear;
            int stars = state.level.StarsFor(state.Score);
            resultTitle.text = clear ? $"{state.level.stageName} 완료" : "이동을 모두 썼다";
            var left = new List<string>();
            foreach (GoalLedger g in state.goals) if (!g.Done) left.Add($"{g.def.displayName} {g.Remaining}");
            resultDetail.text = clear
                ? $"점수 {state.Score.ToString("N0", CultureInfo.InvariantCulture)} · 별 {stars}개"
                : (state.JudgedEarly ? "이동 0 즉시 판정 — 연쇄가 아직 끝나지 않았다\n" : "") + "남은 목표: " + string.Join(" · ", left);
            SetResultVisible(true);
        }

        void SetResultVisible(bool on)
        {
            if (resultPanel == null) return;
            bool wasOn = resultPanel.interactable;
            resultPanel.alpha = on ? 1f : 0f;
            resultPanel.interactable = on;
            resultPanel.blocksRaycasts = on;
            if (on && !wasOn)
            {
                resultOpenedAt = Time.unscaledTime;   // 입력 잠금 시작
                retryPressedAt = -1f;
            }
            EventSystem es = EventSystem.current;
            if (es == null || on == wasOn) return;
            if (on)
            {
                // 창을 열면 기본 버튼으로, 닫으면 연 곳으로 — 안 그러면 다음 Submit 이 뒤의 버튼을 누른다
                resultOpener = es.currentSelectedGameObject;
                es.SetSelectedGameObject(retryButton.gameObject);
            }
            else
            {
                GameObject back = resultOpener != null && resultOpener.activeInHierarchy ? resultOpener : null;
                es.SetSelectedGameObject(back);
                resultOpener = null;
            }
        }
    }
}
