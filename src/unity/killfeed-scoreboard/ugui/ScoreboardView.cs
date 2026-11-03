// 스코어보드 (UGUI) — 누르고 있는 동안만 보인다. 열기 · 닫기는 HoldToShow(Input System 의 Hold 상호작용), 보이기는 CanvasGroup.alpha.
// 행은 팀 인원만큼 한 번 만들고 데이터만 바꿔 다시 쓴다(행 재사용). 승리까지 남은 점수를 가장 큰 글자로 둔다.
// 정렬 바꾸기: 보드가 열려 있을 때 E · 패드 오른쪽 어깨. 보는 표라 Selectable 을 두지 않아 방향키 · 패드 탐색과 부딪치지 않는다.
using System;
using System.Collections.Generic;
using System.Globalization;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.KillfeedScoreboard
{
    /// <summary>
    /// 누르고 있는 동안 보이기. 액션 Interactions 에 Hold(duration) 를 둔다.
    ///  started(누름) → 연다 · performed(duration 넘게 누름) → '길게' 로 기억 · canceled(뗌) → 길게였으면 닫는다.
    ///  짧게 눌렀다 뗐으면 tapToggles 일 때 열린 채 고정하고, 다시 짧게 누르면 닫는다 — 계속 누르기 어려운 사람을 위한 토글.
    /// PC 게임이 Tab 을 쓰는 것은 왼손이 WASD 에서 손가락 하나만 뻗어 닿는 큰 키라서다. 패드는 가운데 왼쪽 작은 버튼(<Gamepad>/select).
    /// UGUI · UI Toolkit 두 뷰가 함께 쓴다.
    /// </summary>
    public class HoldToShow : IDisposable
    {
        readonly InputAction action;
        bool heldLong, pinned;
        public bool tapToggles;
        public bool Visible { get; private set; }
        public event Action<bool> VisibleChanged;

        public HoldToShow(bool tapToggles = false, float holdSeconds = 0.25f, string keyboard = "<Keyboard>/tab", string gamepad = "<Gamepad>/select")
        {
            this.tapToggles = tapToggles;
            string hold = $"hold(duration={holdSeconds.ToString(CultureInfo.InvariantCulture)})";
            action = new InputAction("Scoreboard", InputActionType.Button, keyboard, hold);
            action.AddBinding(gamepad);
            action.started += OnStarted;
            action.performed += OnPerformed;
            action.canceled += OnCanceled;
        }

        public void Enable() => action.Enable();

        void OnStarted(InputAction.CallbackContext _)
        {
            heldLong = false;
            Set(true);
        }

        void OnPerformed(InputAction.CallbackContext _) => heldLong = true;

        void OnCanceled(InputAction.CallbackContext _)
        {
            if (heldLong || !tapToggles) Set(false);
            else if (pinned) Set(false);      // 고정된 상태에서 짧게 = 닫기
            pinned = !heldLong && tapToggles && Visible;
        }

        /// <summary>창이 포커스를 잃는 등 뗀 신호가 오지 않을 때를 대비해 밖에서 닫을 수도 있게</summary>
        public void Set(bool v)
        {
            if (!v) pinned = false;
            if (Visible == v) return;
            Visible = v;
            VisibleChanged?.Invoke(v);
        }

        public void Dispose()
        {
            action.started -= OnStarted;
            action.performed -= OnPerformed;
            action.canceled -= OnCanceled;
            action.Dispose();
        }
    }

    public class ScoreboardView : MonoBehaviour
    {
        /// <summary>행 프리팹의 자식 캐시 — 프리팹: Image 바탕 + MeBar(Image) + TMP_Text 6개(이름 · 제압 · 지원 · 이탈 · 점수 · 핑) 순서</summary>
        class Row
        {
            public RectTransform rect;
            public Image back, meBar;
            public TMP_Text name, takedowns, assists, outs, score, ping;
        }

        [SerializeField] MatchEventSource source;
        [SerializeField] CanvasGroup board;
        [SerializeField] RectTransform orbitRows, surfaceRows;
        [SerializeField] RectTransform rowPrefab;
        [Tooltip("승리까지 남은 점수 — 보드에서 가장 큰 글자")]
        [SerializeField] TMP_Text orbitToWin, surfaceToWin;
        [SerializeField] TMP_Text orbitScore, surfaceScore;
        [Tooltip("머리글 5개: 제압 · 지원 · 이탈 · 점수 · 핑")]
        [SerializeField] TMP_Text[] headers = new TMP_Text[5];
        [SerializeField] TMP_Text footText;

        [SerializeField] SortKey sortKey = SortKey.Score;
        [Tooltip("짧게 누르면 열린 채 고정 (토글). 끄면 누르고 있는 동안만")]
        [SerializeField] bool tapToggles;
        [SerializeField] float fadeSeconds = 0.12f;
        [SerializeField] float rowHeight = 40f;

        [Header("색 (모양 · 글자와 함께 쓴다)")]
        [SerializeField] Color orbitColor = new(0.35f, 0.82f, 1f);
        [SerializeField] Color surfaceColor = new(1f, 0.42f, 0.36f);
        [SerializeField] Color rowColor = new(1f, 1f, 1f, 0f);
        [SerializeField] Color altRowColor = new(1f, 1f, 1f, 0.035f);
        [SerializeField] Color meRowColor = new(1f, 0.81f, 0.35f, 0.17f);
        [SerializeField] Color warnColor = new(1f, 0.7f, 0.35f);

        static readonly string[] Labels = { "제압", "지원", "이탈", "점수", "핑" };
        HoldToShow hold;
        InputAction cycleSort;
        readonly List<PlayerStats> sorted = new();
        readonly List<Row> orbitPool = new(), surfacePool = new();
        bool dirty = true;

        void OnEnable()
        {
            hold = new HoldToShow(tapToggles);
            hold.VisibleChanged += OnVisible;
            hold.Enable();
            cycleSort = new InputAction("CycleSort", InputActionType.Button, "<Keyboard>/e");
            cycleSort.AddBinding("<Gamepad>/rightShoulder");
            cycleSort.performed += OnCycleSort;
            cycleSort.Enable();
            board.alpha = 0f;
            board.blocksRaycasts = false;
        }

        void OnDisable()
        {
            hold.VisibleChanged -= OnVisible;
            hold.Dispose();
            cycleSort.performed -= OnCycleSort;
            cycleSort.Dispose();
        }

        // MatchState 는 MatchEventSource.Awake 에서 만들어진다 — 모든 Awake 가 끝난 Start 에서 구독
        void Start() => source.Match.Changed += MarkDirty;

        void OnDestroy()
        {
            if (source != null && source.Match != null) source.Match.Changed -= MarkDirty;
        }

        void OnApplicationFocus(bool focus)
        {
            if (!focus && !hold.tapToggles) hold.Set(false);   // 누른 채 창을 떠나면 뗀 신호가 오지 않는다
        }

        void MarkDirty() => dirty = true;
        void OnVisible(bool visible) => dirty |= visible;

        void OnCycleSort(InputAction.CallbackContext _)
        {
            if (!hold.Visible) return;   // 닫혀 있을 때 E 는 다른 조작(상호작용 등)에 양보
            sortKey = (SortKey)(((int)sortKey + 1) % 3);
            dirty = true;
        }

        void Update()
        {
            board.alpha = Mathf.MoveTowards(board.alpha, hold.Visible ? 1f : 0f, Time.unscaledDeltaTime / Mathf.Max(0.01f, fadeSeconds));
            board.blocksRaycasts = hold.Visible;
            if (hold.Visible && dirty) Redraw();   // 닫혀 있는 동안은 다시 그리지 않는다 — 열 때 한 번
        }

        void Redraw()
        {
            dirty = false;
            MatchState m = source.Match;
            orbitToWin.text = m.Remaining(Team.Orbit).ToString();
            surfaceToWin.text = m.Remaining(Team.Surface).ToString();
            orbitScore.text = $"{m.TeamScore(Team.Orbit)} / {m.winScore}";
            surfaceScore.text = $"{m.TeamScore(Team.Surface)} / {m.winScore}";
            for (int i = 0; i < headers.Length && i < Labels.Length; i++)
            {
                bool on = (i == 0 && sortKey == SortKey.Takedowns) || (i == 3 && sortKey == SortKey.Score);
                headers[i].text = Labels[i];
                headers[i].fontStyle = on ? FontStyles.Bold | FontStyles.Underline : FontStyles.Normal;   // ▼ 같은 기호는 TMP 글꼴에 없을 수 있어 굵게 + 밑줄
                headers[i].color = on ? Color.white : new Color(0.62f, 0.71f, 0.79f);
            }
            if (footText != null)
                footText.text = sortKey switch
                {
                    SortKey.Score => "정렬: 점수 · 같으면 제압 → 들어온 순서 (E 로 바꾸기)",
                    SortKey.Takedowns => "정렬: 제압 · 같으면 들어온 순서 (E 로 바꾸기)",
                    _ => "정렬: 들어온 순서 (E 로 바꾸기)",
                };
            Fill(Team.Orbit, orbitRows, orbitPool, m);
            Fill(Team.Surface, surfaceRows, surfacePool, m);
        }

        void Fill(Team t, RectTransform parent, List<Row> pool, MatchState m)
        {
            m.Sorted(t, sortKey, sorted);
            while (pool.Count < sorted.Count) pool.Add(Make(parent));   // 처음 · 인원이 늘 때만 만든다
            for (int i = 0; i < pool.Count; i++)
            {
                Row r = pool[i];
                bool used = i < sorted.Count;
                r.rect.gameObject.SetActive(used);
                if (!used) continue;
                PlayerStats p = sorted[i];
                r.rect.anchoredPosition = new Vector2(0f, -i * rowHeight);
                r.back.color = p.isMe ? meRowColor : i % 2 == 0 ? rowColor : altRowColor;
                if (r.meBar != null) r.meBar.enabled = p.isMe;
                r.name.text = p.isMe ? $"{p.displayName}  <b>나</b>" : p.displayName;
                r.name.color = t == Team.Orbit ? orbitColor : surfaceColor;
                r.takedowns.text = p.takedowns.ToString();
                r.assists.text = p.assists.ToString();
                r.outs.text = p.outs.ToString();
                r.score.text = p.Score.ToString();
                r.ping.text = p.ping >= 100 ? $"{p.ping}!" : p.ping.ToString();   // 높은 핑은 색 + '!'
                r.ping.color = p.ping >= 100 ? warnColor : Color.white;
                r.takedowns.fontStyle = sortKey == SortKey.Takedowns ? FontStyles.Bold : FontStyles.Normal;
                r.score.fontStyle = sortKey == SortKey.Score ? FontStyles.Bold : FontStyles.Normal;
            }
        }

        Row Make(RectTransform parent)
        {
            RectTransform rt = Instantiate(rowPrefab, parent);
            Image[] images = rt.GetComponentsInChildren<Image>(true);
            TMP_Text[] t = rt.GetComponentsInChildren<TMP_Text>(true);
            return new Row
            {
                rect = rt,
                back = images[0],
                meBar = images.Length > 1 ? images[1] : null,
                name = t[0], takedowns = t[1], assists = t[2], outs = t[3], score = t[4], ping = t[5],
            };
        }
    }
}
