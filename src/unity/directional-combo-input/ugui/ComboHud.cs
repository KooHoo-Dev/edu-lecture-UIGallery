// 방향 커맨드 HUD (UGUI) — ComboInput 의 방향을 ComboMatcher 에 넘기고, 결과로 목록 · 넣은 방향 띠 · 제한 시간 · 알림을 그린다.
// 틀리면 띠를 흔들고(코루틴 하나), 완성하면 배너를 띄운다. 연출은 실제 시간(unscaled), 판정 · 재사용 대기는 게임 시간.
using System;
using System.Collections;
using System.Globalization;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DirectionalComboInput
{
    public class ComboHud : MonoBehaviour
    {
        public enum MismatchStyle { Dim, Hide }

        [SerializeField] ComboCommandSet commandSet;
        [SerializeField] ComboInput input;

        [Header("목록")]
        [Tooltip("Panel 과 Strip 을 함께 감싼 그룹 — 열린 동안만 보인다")]
        [SerializeField] CanvasGroup openGroup;
        [SerializeField] RectTransform list;
        [SerializeField] ComboRow rowPrefab;
        [SerializeField] TextMeshProUGUI countText;
        [SerializeField] TextMeshProUGUI accessText;

        [Header("넣은 방향")]
        [SerializeField] RectTransform strip;
        [SerializeField] Image[] slots;
        [SerializeField] Image[] slotGlyphs;
        [SerializeField] Image timerFill;
        [SerializeField] TextMeshProUGUI timerText;

        [Header("알림")]
        [SerializeField] CanvasGroup banner;
        [SerializeField] TextMeshProUGUI bannerText;
        [SerializeField] TextMeshProUGUI noteText;

        [Header("판정 · 접근성")]
        [Tooltip("다른 커맨드의 앞부분인 커맨드를 완성했을 때 기다리는 시간 (0 = 즉시 발동)")]
        [SerializeField] float prefixWait = 0.45f;
        [Tooltip("입력 사이 제한 시간 (0 = 끔)")]
        [SerializeField] float stepTimeout = 1.5f;
        [Tooltip("관대한 모드: 틀린 칸만 다시")]
        [SerializeField] bool lenient;
        [SerializeField] MismatchStyle mismatch = MismatchStyle.Dim;
        [SerializeField] float fadeSeconds = 0.14f;

        [Header("색")]
        [SerializeField] Color slotEmpty = new(1f, 1f, 1f, 0.15f);
        [SerializeField] Color slotLit = new(0.37f, 0.9f, 0.79f, 1f);
        [SerializeField] Color slotWrong = new(1f, 0.54f, 0.58f, 1f);
        [SerializeField] Color glyphDark = new(0.02f, 0.16f, 0.14f, 1f);

        /// <summary>커맨드 발동 — 게임 쪽(투하 · 드론 소환)이 듣는다</summary>
        public event Action<ComboCommand> Activated;

        ComboMatcher matcher;
        ComboRow[] rows;
        bool[] isPrefix;
        bool[] hasPrefix;
        Vector2 stripHome;
        Coroutine shakeRoutine;
        float bannerUntil = -1f;
        float noteUntil = -1f;
        int wrongSlot = -1;
        ComboDir wrongDir;
        float wrongUntil = -1f;

        void Awake()
        {
            matcher = new ComboMatcher(commandSet.commands);
            int n = commandSet.commands.Count;
            rows = new ComboRow[n];
            isPrefix = new bool[n];
            hasPrefix = new bool[n];
            for (int i = 0; i < n; i++)
            {
                rows[i] = Instantiate(rowPrefab, list);
                rows[i].Bind(commandSet.commands[i]);
                isPrefix[i] = commandSet.IsPrefixOfAnother(i);
                for (int j = 0; j < n; j++)
                {
                    ComboDir[] other = commandSet.commands[j].sequence;
                    if (j != i && other.Length < commandSet.commands[i].sequence.Length && ComboCommandSet.StartsWith(commandSet.commands[i].sequence, other))
                        hasPrefix[i] = true;
                }
            }
            stripHome = strip.anchoredPosition;
            Configure(prefixWait, stepTimeout, lenient);
        }

        /// <summary>설정 화면에서 바꾼다. 값이 바뀌어도 남은 상태는 다음 Tick 에서 맞춰진다 (기다림을 0 으로 줄이면 바로 발동)</summary>
        public void Configure(float wait, float timeout, bool isLenient)
        {
            prefixWait = Mathf.Max(0f, wait);
            stepTimeout = Mathf.Max(0f, timeout);
            lenient = isLenient;
            matcher.PrefixWait = prefixWait;
            matcher.StepTimeout = stepTimeout;
            matcher.Lenient = lenient;
            accessText.text = ComboLabels.Access(input.Mode, stepTimeout, lenient);
            if (input.IsOpen) Paint();
        }

        void OnEnable()
        {
            input.Opened += OnOpened;
            input.Closed += OnClosed;
            input.Direction += OnDirection;
            matcher.Fired += OnFired;
            openGroup.alpha = input.IsOpen ? 1f : 0f;
            openGroup.blocksRaycasts = false;   // 보기만 하는 HUD — 아래 화면의 클릭을 막지 않는다
            openGroup.interactable = false;
            banner.alpha = 0f;
        }

        void OnDisable()
        {
            input.Opened -= OnOpened;
            input.Closed -= OnClosed;
            input.Direction -= OnDirection;
            matcher.Fired -= OnFired;
            // 코루틴은 enabled = false 로 멈추지 않는다 — 직접 멈추고 화면에 남은 상태(흔들린 위치 · 배너 · 알림)를 되돌린다
            if (shakeRoutine != null) StopCoroutine(shakeRoutine);
            shakeRoutine = null;
            strip.anchoredPosition = stripHome;
            matcher.Clear();
            wrongSlot = -1;
            openGroup.alpha = 0f;
            banner.alpha = 0f;
            noteText.text = "";
        }

        void OnOpened()
        {
            matcher.Clear();
            wrongSlot = -1;
            accessText.text = ComboLabels.Access(input.Mode, stepTimeout, lenient);
            Paint();
        }

        void OnClosed()
        {
            matcher.Close(Time.time);   // 완성해서 기다리던 커맨드는 발동
            wrongSlot = -1;
        }

        void OnDirection(ComboDir d)
        {
            int slot = matcher.Buffer.Count;
            StepResult r = matcher.Push(d, Time.time);
            switch (r)
            {
                case StepResult.Pending:
                    Note($"{commandSet.commands[matcher.Pending].displayName} 완성 — 이어 넣으면 더 긴 커맨드");
                    break;
                case StepResult.WrongReset:
                case StepResult.WrongKept:
                case StepResult.Cooling:
                    wrongSlot = slot;
                    wrongDir = d;
                    wrongUntil = Time.unscaledTime + 0.7f;
                    Shake();
                    if (r == StepResult.Cooling)
                    {
                        int c = matcher.CoolingIndex;
                        Note($"{commandSet.commands[c].displayName} — 재사용 대기 {Mathf.CeilToInt(matcher.CooldownLeft(c, Time.time))}초");
                    }
                    else Note(r == StepResult.WrongKept ? $"{slot + 1}번째 칸이 아니다 — 그 칸만 다시" : $"{slot + 1}번째 칸에서 틀림 — 처음부터");
                    break;
            }
            Paint();
        }

        void OnFired(int i)
        {
            ComboCommand c = commandSet.commands[i];
            bannerText.text = $"발동 · {c.displayName}";
            bannerUntil = Time.unscaledTime + 2f;
            banner.transform.localScale = Vector3.one * 1.08f;   // 튐 — Update 에서 1 로 돌아온다
            Activated?.Invoke(c);
        }

        void Note(string text)
        {
            noteText.text = text;
            noteUntil = Time.unscaledTime + 2f;
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            float step = dt / Mathf.Max(0.01f, fadeSeconds);
            openGroup.alpha = Mathf.MoveTowards(openGroup.alpha, input.IsOpen ? 1f : 0f, step);
            banner.alpha = Mathf.MoveTowards(banner.alpha, Time.unscaledTime < bannerUntil ? 1f : 0f, step * 0.5f);
            banner.transform.localScale = Vector3.MoveTowards(banner.transform.localScale, Vector3.one, dt * 0.5f);
            if (noteUntil >= 0f && Time.unscaledTime > noteUntil)
            {
                noteText.text = "";
                noteUntil = -1f;
            }
            if (!input.IsOpen) return;
            if (matcher.Tick(Time.time) == StepResult.TimedOut) Note("입력 사이가 너무 길다 — 처음부터");
            Paint();
        }

        void Paint()
        {
            float now = Time.time;
            var buf = matcher.Buffer;
            bool filtering = buf.Count > 0;
            int candidates = 0;
            for (int i = 0; i < rows.Length; i++)
            {
                ComboCommand c = commandSet.commands[i];
                bool cand = matcher.IsCandidate(i, now);
                bool cooling = !matcher.IsReady(i, now);
                bool pending = matcher.Pending == i;
                if (cand) candidates++;
                rows[i].gameObject.SetActive(!(mismatch == MismatchStyle.Hide && filtering && !cand));   // 숨기기: 레이아웃이 남은 후보를 위로 모은다
                var st = new ComboRow.State
                {
                    lit = cand ? buf.Count : 0,
                    candidate = cand,
                    pending = pending,
                    cooling = cooling,
                    mismatch = filtering && !cand,
                    cooldown01 = cooling ? matcher.CooldownLeft(i, now) / Mathf.Max(0.01f, c.cooldown) : 0f,
                    wait01 = pending ? matcher.PendingProgress(now) : 0f,
                };
                st.status = ComboLabels.Status(c, cooling ? matcher.CooldownLeft(i, now) : 0f, pending, isPrefix[i], hasPrefix[i] && prefixWait <= 0f, prefixWait, out st.warn);
                rows[i].Paint(st);
            }
            countText.text = $"남은 후보 {candidates} / {rows.Length}";

            bool showWrong = wrongSlot >= 0 && Time.unscaledTime < wrongUntil;
            for (int k = 0; k < slots.Length; k++)
            {
                bool lit = k < buf.Count;
                bool wrong = !lit && showWrong && k == wrongSlot;
                slots[k].color = lit ? slotLit : wrong ? slotWrong : slotEmpty;
                slotGlyphs[k].enabled = lit || wrong;
                if (lit || wrong)
                {
                    slotGlyphs[k].rectTransform.localEulerAngles = new Vector3(0f, 0f, ComboRow.Angle(lit ? buf[k] : wrongDir));
                    slotGlyphs[k].color = lit ? glyphDark : Color.white;
                }
            }
            float left = matcher.TimeLeft01(now);
            timerFill.fillAmount = left;
            timerText.text = ComboLabels.Timer(stepTimeout, left, buf.Count > 0 && matcher.Pending < 0);
        }

        void Shake()
        {
            if (!isActiveAndEnabled) return;   // 꺼진 동안에는 코루틴을 새로 시작하지 않는다
            if (shakeRoutine != null) StopCoroutine(shakeRoutine);
            shakeRoutine = StartCoroutine(ShakeStrip());
        }

        IEnumerator ShakeStrip()
        {
            const float duration = 0.36f;
            for (float t = 0f; t < duration; t += Time.unscaledDeltaTime)
            {
                float k = 1f - t / duration;
                strip.anchoredPosition = stripHome + new Vector2(Mathf.Sin(t * 70f) * 18f * k, 0f);
                yield return null;
            }
            strip.anchoredPosition = stripHome;
            shakeRoutine = null;
        }
    }

    /// <summary>화면 문구 — UGUI · UI Toolkit 이 같은 글을 쓴다. 숫자는 문화권과 무관하게 (소수점이 쉼표가 되지 않게)</summary>
    public static class ComboLabels
    {
        static string F1(float v) => v.ToString("0.0", CultureInfo.InvariantCulture);
        static string Sec(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);   // 설정값 0.75 는 0.8 로 반올림하지 않는다

        public static string Status(ComboCommand c, float cooldownLeft, bool pending, bool isPrefix, bool shadowed, float prefixWait, out bool warn)
        {
            warn = false;
            if (cooldownLeft > 0f) return $"재사용 대기 {Mathf.CeilToInt(cooldownLeft)}초";
            if (pending) return "완성 · 기다리는 중";
            if (isPrefix) return prefixWait > 0f ? $"접두사 · {Sec(prefixWait)}초 대기" : "접두사 · 즉시 발동";
            if (shadowed)
            {
                warn = true;
                return "가려짐 — 짧은 쪽이 먼저";
            }
            return $"재사용 {Mathf.RoundToInt(c.cooldown)}초";
        }

        public static string Timer(float stepTimeout, float left01, bool running) =>
            stepTimeout <= 0f ? "제한 시간 끔" : running ? $"{F1(left01 * stepTimeout)}초 남음" : $"입력 사이 {Sec(stepTimeout)}초";

        public static string Access(ComboInput.OpenMode mode, float stepTimeout, bool lenient) =>
            $"{(mode == ComboInput.OpenMode.Hold ? "누르고 있기" : "눌러 켜기 · 끄기")}  ·  {(stepTimeout > 0f ? $"입력 사이 {Sec(stepTimeout)}초" : "제한 시간 없음")}  ·  {(lenient ? "틀린 칸만 다시" : "틀리면 처음부터")}";
    }
}
