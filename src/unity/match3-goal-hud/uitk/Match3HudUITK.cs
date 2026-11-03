// 퍼즐 목표 HUD (UI Toolkit 판). 레벨 정의 · 정산(GoalLedger) · 판정(StageState) · IGoalHud 는 UGUI 폴더 LevelDefinition.cs 를 쓴다 (같은 namespace).
//  - 자동 구성: Bind 에서 레벨 정의를 읽어 목표 칸 · 별 마커(left = 임계값 / 최대 점수 %) · 부스터 버튼을 만든다
//  - 비행: 월드 → 패널은 RuntimePanelUtils.CameraTransformWorldToPanel, 도착점은 아이콘의 worldBound. 풀에서 꺼낸 요소를 매 프레임 style.translate 로 베지어를 따라 옮긴다
//  - 안전 영역: Screen.safeArea(원점 왼쪽 아래 · 픽셀)를 y 를 뒤집어 RuntimePanelUtils.ScreenToPanel 로 바꾼 뒤 #safe 의 padding 에 넣는다
//  - 결과 창: display 로 켜고 16ms 뒤 보이기 클래스 + 다시 하기 Focus(). 닫으면 열기 전 포커스로
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.UIElements;

namespace UIGallery.Match3GoalHud
{
    [RequireComponent(typeof(UIDocument))]
    public class Match3HudUITK : MonoBehaviour, IGoalHud
    {
        [Tooltip("보드를 찍는 카메라 (월드 → 패널). 비우면 Camera.main")] [SerializeField] Camera boardCamera;
        [Tooltip("별 마커 그림 (색은 USS tint 로)")] [SerializeField] Sprite starSprite;
        [SerializeField] float flySeconds = 0.65f;
        [Tooltip("호의 높이 (패널 단위)")] [SerializeField] float arcHeight = 140f;
        [Tooltip("끄면 '나쁜 예': 날아가는 아이콘 · 도착 강조 · 이동 경고 없이 숫자만 바뀐다")] [SerializeField] bool feedback = true;

        class GoalView
        {
            public GoalLedger ledger;
            public VisualElement slot, icon;
            public Label count;
            public float pulse;
        }

        class BoosterView
        {
            public Button button;
            public Label name, count;
        }

        class Flight
        {
            public VisualElement el;
            public GoalView goal;
            public Vector2 p0, p1, p2;
            public float start;
        }

        public event Action<int> BoosterPressed;
        public event Action RetryPressed;

        VisualElement root, safe, moves, goalsRow, markers, scoreFill, boostersRow, flyLayer, result;
        Label movesLabel, movesCount, scoreText, stageName, resultTitle, resultDetail;
        Button retry;
        StageState state;
        readonly List<GoalView> goalViews = new();
        readonly List<BoosterView> boosterViews = new();
        readonly List<VisualElement> markerViews = new();
        readonly List<Flight> flights = new();
        ObjectPool<VisualElement> pool;
        float shownScore;
        Focusable opener;
        Vector4 lastPadding = new(-1f, -1f, -1f, -1f);

        public int FlyingCount => flights.Count;

        void OnEnable()
        {
            root = GetComponent<UIDocument>().rootVisualElement;
            safe = root.Q("safe");
            moves = root.Q("moves");
            movesLabel = root.Q<Label>("moves-label");
            movesCount = root.Q<Label>("moves-count");
            stageName = root.Q<Label>("stage-name");
            goalsRow = root.Q("goals");
            scoreText = root.Q<Label>("score-text");
            scoreFill = root.Q("score-fill");
            markers = root.Q("markers");
            boostersRow = root.Q("boosters");
            flyLayer = root.Q("fly-layer");
            result = root.Q("result");
            resultTitle = root.Q<Label>("result-title");
            resultDetail = root.Q<Label>("result-detail");
            retry = root.Q<Button>("retry");
            retry.clicked += OnRetry;
            if (boardCamera == null) boardCamera = Camera.main;
            // UIDocument 를 다시 켜면 요소가 새로 만들어진다 — 풀도 새로
            pool = new ObjectPool<VisualElement>(CreateFlyer, f => flyLayer.Add(f), f => f.RemoveFromHierarchy(), null, true, 24, 96);
            lastPadding = new Vector4(-1f, -1f, -1f, -1f);
            if (state != null)
            {
                state.Changed += Redraw;
                Build();
                Redraw();
            }
        }

        void OnDisable()
        {
            if (state != null) state.Changed -= Redraw;
            if (retry != null) retry.clicked -= OnRetry;
            // 날던 것은 버리고 표시값 = 실제값. 열린 결과 창 · 맥동 크기를 되돌린다
            foreach (Flight f in flights) f.el.RemoveFromHierarchy();
            flights.Clear();
            if (state != null) foreach (GoalLedger g in state.goals) g.Settle();
            if (result == null) return;
            result.RemoveFromClassList("result--open");
            result.RemoveFromClassList("result--shown");
            opener = null;
            moves.style.scale = StyleKeyword.Null;
        }

        void OnRetry() => RetryPressed?.Invoke();

        /* ───── 자동 구성 ───── */
        public void Bind(StageState s)
        {
            if (state != null) state.Changed -= Redraw;
            state = s;
            if (!isActiveAndEnabled) return;   // 켜질 때 OnEnable 이 만든다
            state.Changed += Redraw;
            foreach (Flight f in flights) pool.Release(f.el);
            flights.Clear();
            HideResult();
            Build();
            shownScore = s.Score;
            Redraw();
        }

        void Build()
        {
            LevelDefinition level = state.level;
            stageName.text = level.stageName;

            goalsRow.Clear();
            goalViews.Clear();
            foreach (GoalLedger g in state.goals)
            {
                var v = new GoalView { ledger = g, slot = new VisualElement(), icon = new VisualElement(), count = new Label() };
                v.slot.AddToClassList("goal");
                v.icon.AddToClassList("goal__icon");
                v.icon.style.backgroundImage = new StyleBackground(g.def.icon);
                v.count.AddToClassList("goal__count");
                var check = new VisualElement();
                check.AddToClassList("goal__check");
                v.slot.Add(v.icon);
                v.slot.Add(v.count);
                v.slot.Add(check);
                v.slot.Add(Tag("goal__name", g.def.displayName));
                goalsRow.Add(v.slot);
                goalViews.Add(v);
            }

            // 별 마커: left = 임계값 / 최대 점수 (USS translate -50% 로 가운데를 그 자리에)
            markers.Clear();
            markerViews.Clear();
            for (int i = 0; i < level.starThresholds.Length; i++)
            {
                var m = new VisualElement { pickingMode = PickingMode.Ignore };
                m.AddToClassList("marker");
                m.style.left = Length.Percent(level.StarPosition(i) * 100f);
                var star = new VisualElement { pickingMode = PickingMode.Ignore };
                star.AddToClassList("marker__star");
                star.style.backgroundImage = new StyleBackground(starSprite);
                var tick = new VisualElement { pickingMode = PickingMode.Ignore };
                tick.AddToClassList("marker__tick");
                m.Add(star);
                m.Add(tick);
                m.Add(Tag("marker__label", level.starThresholds[i].ToString("N0", CultureInfo.InvariantCulture)));
                markers.Add(m);
                markerViews.Add(m);
            }

            // 부스터: 지울 버튼에 포커스가 있었으면 같은 자리의 새 버튼으로 옮긴다
            int focused = root.focusController?.focusedElement is VisualElement fe && fe.parent == boostersRow ? boostersRow.IndexOf(fe) : -1;
            boostersRow.Clear();
            boosterViews.Clear();
            for (int i = 0; i < level.boosters.Length; i++)
            {
                int index = i;
                LevelDefinition.Booster def = level.boosters[i];
                // 0개여도 끄지 않는다 (SetEnabled(false) 면 포커스를 못 받는다) — 눌리면 상점 안내
                var b = new Button(() => BoosterPressed?.Invoke(index)) { text = "" };
                b.AddToClassList("booster");
                var icon = new VisualElement { pickingMode = PickingMode.Ignore };
                icon.AddToClassList("booster__icon");
                icon.style.backgroundImage = new StyleBackground(def.icon);
                var badge = new VisualElement { pickingMode = PickingMode.Ignore };
                badge.AddToClassList("booster__badge");
                var view = new BoosterView { button = b, name = Tag("booster__name", def.displayName), count = Tag("booster__count", "") };
                badge.Add(view.count);
                badge.Add(Tag("booster__plus", "+"));
                b.Add(icon);
                b.Add(view.name);
                b.Add(Tag("booster__desc", def.description));
                b.Add(badge);
                boostersRow.Add(b);
                boosterViews.Add(view);
            }
            if (focused >= 0 && boosterViews.Count > 0) boosterViews[Mathf.Min(focused, boosterViews.Count - 1)].button.Focus();
        }

        static Label Tag(string cls, string text)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            return l;
        }

        VisualElement CreateFlyer()
        {
            var f = new VisualElement { pickingMode = PickingMode.Ignore };
            f.AddToClassList("flyer");
            return f;
        }

        /* ───── 깨진 블록 → 목표 ───── */
        public void Fly(BlockType type, Vector3 worldPos, float delay)
        {
            GoalView v = goalViews.Find(g => g.ledger.Type == type);
            if (v == null) return;
            if (!feedback || flySeconds <= 0f || !isActiveAndEnabled || root.panel == null)
            {
                // 나쁜 예(효과 끔) · 0초: 날리지 않고 바로 −1 — 무엇을 모았는지 보이지 않는다
                if (v.ledger.Land() && feedback) v.pulse = 1f;
                DrawGoal(v);
                return;
            }
            Vector2 p0 = flyLayer.WorldToLocal(RuntimePanelUtils.CameraTransformWorldToPanel(root.panel, worldPos, boardCamera));
            Vector2 p2 = flyLayer.WorldToLocal(v.icon.worldBound.center);
            // 조절점: 가운데에서 옆으로 흩고 위로(패널은 y 가 아래로 증가) 올린다
            float side = (flights.Count % 2 == 0 ? -1f : 1f) * (60f + flights.Count * 37 % 120);
            Vector2 p1 = new((p0.x + p2.x) * 0.5f + side, Mathf.Min(p0.y, p2.y) - arcHeight);
            VisualElement el = pool.Get();
            el.style.backgroundImage = new StyleBackground(v.ledger.def.icon);
            el.style.translate = new Translate(p0.x, p0.y);
            el.style.scale = new Scale(Vector2.zero);   // 지연 동안 숨김
            flights.Add(new Flight { el = el, goal = v, p0 = p0, p1 = p1, p2 = p2, start = Time.unscaledTime + delay });
        }

        void Arrive(GoalView v)
        {
            if (!v.ledger.Land()) return;   // 표시값이 실제값을 앞지르지 않는다
            v.pulse = 1f;
            DrawGoal(v);
        }

        /* ───── 그리기 ───── */
        void Redraw()
        {
            if (state == null || movesCount == null) return;
            movesCount.text = state.MovesLeft.ToString(CultureInfo.InvariantCulture);
            foreach (GoalView v in goalViews) DrawGoal(v);
            for (int i = 0; i < boosterViews.Count; i++)
            {
                BoosterView b = boosterViews[i];
                int n = state.boosters[i];
                b.count.text = n.ToString(CultureInfo.InvariantCulture);
                b.name.text = n == 0 ? "충전" : state.level.boosters[i].displayName;
                b.button.EnableInClassList("booster--empty", n == 0);
            }
        }

        static void DrawGoal(GoalView v)
        {
            int shown = v.ledger.Shown;
            v.count.text = shown.ToString(CultureInfo.InvariantCulture);
            v.slot.EnableInClassList("goal--done", shown == 0);
        }

        void Update()
        {
            ApplySafeArea();
            if (state == null) return;
            float now = Time.unscaledTime;
            float dt = Time.unscaledDeltaTime;

            for (int i = flights.Count - 1; i >= 0; i--)
            {
                Flight f = flights[i];
                float k = (now - f.start) / flySeconds;
                if (k < 0f) continue;
                if (k >= 1f)
                {
                    flights.RemoveAt(i);
                    pool.Release(f.el);
                    Arrive(f.goal);
                    continue;
                }
                float e = k * k * (3f - 2f * k);
                float u = 1f - e;
                Vector2 p = u * u * f.p0 + 2f * u * e * f.p1 + e * e * f.p2;
                f.el.style.translate = new Translate(p.x, p.y);
                f.el.style.scale = new Scale(Vector2.one * (1.25f - 0.45f * e));
            }

            // 남은 이동 경고: 색(USS) · 글자 · 맥동 (1.2Hz, 2수 이하 2Hz)
            int left = state.MovesLeft;
            int warnAt = state.level.warnAtMoves;
            bool warn = feedback && warnAt > 0 && left <= warnAt && state.Result == StageResult.None;
            moves.EnableInClassList("moves--warn", warn);
            movesLabel.text = left == 0 && !state.Settled && state.Result == StageResult.None ? "연쇄 처리 중" : warn ? "이동 부족!" : "남은 이동";
            float hz = left <= 2 ? 2f : 1.2f;
            float s = warn ? 1f + 0.05f * (0.5f - 0.5f * Mathf.Cos(now * hz * 2f * Mathf.PI)) : 1f;
            moves.style.scale = new Scale(new Vector2(s, s));

            foreach (GoalView v in goalViews)
            {
                v.pulse = Mathf.Max(0f, v.pulse - dt * 5f);
                v.icon.style.scale = new Scale(Vector2.one * (1f + 0.22f * v.pulse));
            }

            shownScore = feedback ? Mathf.Lerp(shownScore, state.Score, 1f - Mathf.Exp(-8f * dt)) : state.Score;
            if (Mathf.Abs(shownScore - state.Score) < 1f) shownScore = state.Score;
            scoreText.text = "점수 " + Mathf.RoundToInt(shownScore).ToString("N0", CultureInfo.InvariantCulture);
            scoreFill.style.width = Length.Percent(100f * Mathf.Clamp01(shownScore / state.level.maxScore));
            for (int i = 0; i < markerViews.Count; i++) markerViews[i].EnableInClassList("marker--on", shownScore >= state.level.starThresholds[i]);
        }

        void ApplySafeArea()
        {
            if (root?.panel == null || Screen.width <= 0 || Screen.height <= 0) return;
            Rect sa = Screen.safeArea;
            // Screen 좌표는 원점이 왼쪽 아래, 패널은 왼쪽 위 — y 를 뒤집어 넘긴다
            Vector2 topLeft = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(sa.xMin, Screen.height - sa.yMax));
            Vector2 bottomRight = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(sa.xMax, Screen.height - sa.yMin));
            Vector2 size = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(Screen.width, Screen.height));
            var padding = new Vector4(topLeft.x, topLeft.y, size.x - bottomRight.x, size.y - bottomRight.y);
            if (padding == lastPadding) return;   // 바뀔 때만 (Panel Settings 스케일이 바뀌어도 다시 계산된다)
            lastPadding = padding;
            safe.style.paddingLeft = padding.x;
            safe.style.paddingTop = padding.y;
            safe.style.paddingRight = padding.z;
            safe.style.paddingBottom = padding.w;
        }

        /* ───── 결과 창 ───── */
        public void ShowResult(StageResult r)
        {
            if (r == StageResult.None)
            {
                HideResult();
                return;
            }
            bool clear = r == StageResult.Clear;
            var left = new List<string>();
            foreach (GoalLedger g in state.goals) if (!g.Done) left.Add($"{g.def.displayName} {g.Remaining}");
            resultTitle.text = clear ? $"{state.level.stageName} 완료" : "이동을 모두 썼다";
            resultDetail.text = clear
                ? $"점수 {state.Score.ToString("N0", CultureInfo.InvariantCulture)} · 별 {state.level.StarsFor(state.Score)}개"
                : (state.JudgedEarly ? "이동 0 즉시 판정 — 연쇄가 아직 끝나지 않았다\n" : "") + "남은 목표: " + string.Join(" · ", left);
            result.EnableInClassList("result--clear", clear);
            if (result.ClassListContains("result--open")) return;
            opener = root.focusController?.focusedElement;
            result.AddToClassList("result--open");
            // 막 display 를 켠 요소는 스타일 계산 전이다 — 16ms 뒤에 보이기 클래스(transition)와 포커스
            result.schedule.Execute(() =>
            {
                if (!result.ClassListContains("result--open")) return;
                result.AddToClassList("result--shown");
                retry.Focus();
            }).StartingIn(16);
        }

        void HideResult()
        {
            if (result == null || !result.ClassListContains("result--open")) return;
            result.RemoveFromClassList("result--open");
            result.RemoveFromClassList("result--shown");
            // 숨은 버튼에 포커스가 남으면 다음 Submit 이 사라진 창을 누른다 — 연 곳으로 돌려준다
            if (opener is VisualElement ve && ve.panel != null) ve.Focus();
            else retry.Blur();
            opener = null;
        }
    }
}
