using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.DialogueChoices
{
    /// <summary>
    /// 대화창 + 선택지 — UGUI 버전 (상태 머신 하나).
    ///  · 타자기: 문장 전체를 넣고 maxVisibleCharacters 만 늘린다 (태그·줄바꿈이 깨지지 않음)
    ///  · 입력 소비: 타이핑 중 첫 입력 = 문장 완성, 다음 입력 = 다음 줄. 입력을 처리한 프레임은 거기서 끝낸다
    ///  · 입력 잠금: 선택지가 열린 직후 inputLockSeconds 동안 확정을 무시 → 빨리감기·연타가 선택지를 관통하지 않는다
    ///  · 시간: 대화는 Time.unscaledDeltaTime 으로 흐르고, 기록을 열면 타이핑·자동 진행·제한시간이 모두 멈춘다
    /// </summary>
    public class DialogueView : MonoBehaviour
    {
        public enum State { Hidden, Typing, LineComplete, ChoiceOpen, ChoiceConfirmed, Closed }

        [Header("데이터")]
        [SerializeField] DialogueData data;

        [Header("패널")]
        [SerializeField] CanvasGroup root;              // DialogueRoot
        [SerializeField] RectTransform panel;
        [SerializeField] TMP_Text speakerName;
        [SerializeField] TMP_Text speakerRole;
        [SerializeField] Image faceIcon;                // 이름표 옆 얼굴 (안 쓰면 비워 둔다)
        [SerializeField] Image sidePortrait;            // 큰 측면 초상화 (안 쓰면 비워 둔다)
        [SerializeField] TMP_Text body;
        [SerializeField] GameObject nextIndicator;      // ▼ — 문장이 다 나왔을 때만
        [SerializeField] Image autoProgress;            // Filled — 자동 진행 대기
        [SerializeField] GameObject autoOnMark;
        [SerializeField] GameObject ffOnMark;

        [Header("선택지")]
        [SerializeField] ChoiceButton[] choiceButtons;
        [SerializeField] GameObject timerRoot;
        [SerializeField] Image timerFill;               // Filled Horizontal
        [SerializeField] DialogueLog log;

        [Header("입력 (Dialogue 액션 맵)")]
        [SerializeField] InputActionReference advance;      // Enter · 패드 아래 버튼
        [SerializeField] InputActionReference fastForward;  // F · 패드 왼쪽 버튼 (누르고 있기)
        [SerializeField] InputActionReference toggleLog;    // L · 패드 위 버튼
        [SerializeField] InputActionReference toggleAuto;   // R · 패드 R 숄더

        [Header("값")]
        [SerializeField, Tooltip("초당 글자 수. 0 = 타자기 없이 즉시")] float typeSpeedCps = 40f;
        [SerializeField] bool autoAdvance;
        [SerializeField, Tooltip("선택 제한시간 (초). 0 = 끔")] float choiceTimerSeconds = 0f;
        [SerializeField, Range(0f, 0.6f), Tooltip("선택지가 열린 직후 확정을 무시하는 시간")] float inputLockSeconds = 0.3f;
        [SerializeField] float punctuationPause = 0.16f;
        [SerializeField] float fastForwardInterval = 0.09f;
        [SerializeField] float openTime = 0.22f;
        [SerializeField] float closeTime = 0.16f;

        /// <summary>테스트 입력(데모 스크립트)이 빨리감기를 누르고 있는 것처럼 만들 때</summary>
        public bool ForceFastForward { get; set; }
        public State Current => state;

        State state = State.Hidden;
        int node;              // 0..lines-1 = 공통 줄, lines = 반응, lines+1 = 마지막 줄
        int chosen = -1;
        int focus;
        int visible, total;
        float typeAcc, delay, autoWait, lockLeft, timerLeft, confirmLeft, ffStep;
        GameObject lastSelected;

        void Awake()
        {
            for (int i = 0; i < choiceButtons.Length; i++)
            {
                int index = i;
                choiceButtons[i].Button.onClick.AddListener(() => OnChoice(index));
                choiceButtons[i].Focused += f => focus = f;
            }
            SetChoicesVisible(false);
            root.alpha = 0f;
        }

        void OnEnable()
        {
            foreach (var a in new[] { advance, fastForward, toggleLog, toggleAuto })
                if (a != null) a.action.Enable();
        }

        void OnDisable()
        {
            foreach (var a in new[] { advance, fastForward, toggleLog, toggleAuto })
                if (a != null) a.action.Disable();
        }

        void Start() => Begin();

        /* ───────── 공개 동작 (테스트 입력 · 버튼에서도 부른다) ───────── */

        public void Begin()
        {
            StopAllCoroutines();
            SetChoicesVisible(false);
            log.Clear();
            chosen = -1;
            StartCoroutine(Slide(true));
            StartLine(0, openTime);
        }

        /// <summary>넘기기 입력 하나 — 한 단계만 처리한다 (입력 소비)</summary>
        public void Advance()
        {
            if (log.IsOpen) return;
            switch (state)
            {
                case State.Typing:
                    delay = 0f;                       // 패널이 올라오는 중에 눌러도 입력을 버리지 않는다
                    Complete();                       // 첫 입력 = 문장 완성
                    break;
                case State.LineComplete:
                    Next();                           // 다음 입력 = 다음 줄
                    break;
                case State.Closed:
                    Begin();
                    break;
                // ChoiceOpen 은 버튼(Submit · 클릭) → OnChoice 한 곳에서만 확정한다
            }
        }

        public void MoveFocus(int dir)
        {
            if (state != State.ChoiceOpen) return;
            focus = (focus + dir + choiceButtons.Length) % choiceButtons.Length;
            Select(choiceButtons[focus].gameObject);
        }

        public void ConfirmFocused() => OnChoice(focus);

        /// <summary>[자동] 버튼 · R</summary>
        public void ToggleAuto() => autoAdvance = !autoAdvance;

        /// <summary>[빨리감기] 버튼 — Button 은 '누르고 있기'가 없으므로 EventTrigger 의 PointerDown/PointerUp 에 연결</summary>
        public void FastForwardDown() => ForceFastForward = true;
        public void FastForwardUp() => ForceFastForward = false;

        public void ToggleLog()
        {
            bool open = !log.IsOpen;
            log.SetOpen(open);
            // 닫으면 선택지 포커스를 되돌린다 (기록 안의 스크롤바가 선택을 가져갔을 수 있다)
            if (!open && state == State.ChoiceOpen) Select(choiceButtons[focus].gameObject);
        }

        /// <summary>버튼 클릭 · Submit · 테스트 입력이 모두 여기로 — 확정의 단일 진입점</summary>
        public void OnChoice(int index)
        {
            if (state != State.ChoiceOpen || log.IsOpen) return;
            if (lockLeft > 0f) return;                // 입력 잠금 중: 무시
            Confirm(index);
        }

        /* ───────── 상태 전환 ───────── */

        DialogueData.Line LineAt(int n)
        {
            if (n < data.lines.Length) return data.lines[n];
            if (n == data.lines.Length) return data.choices[chosen < 0 ? data.defaultChoice : chosen].reply;
            return data.endLine;
        }

        void StartLine(int n, float startDelay = 0f)
        {
            node = n;
            var line = LineAt(n);
            speakerName.text = line.DisplayName;
            speakerRole.text = line.DisplayRole;
            if (faceIcon != null) faceIcon.sprite = line.DisplayPortrait;
            if (sidePortrait != null) sidePortrait.sprite = line.DisplayPortrait;

            body.text = line.text;
            body.maxVisibleCharacters = 0;
            body.ForceMeshUpdate();                   // textInfo 를 채운다
            total = body.textInfo.characterCount;     // string.Length 는 리치 텍스트 태그까지 센다 — 쓰지 않는다
            visible = 0;
            typeAcc = 0f;
            autoWait = 0f;
            ffStep = 0f;
            delay = startDelay;
            state = State.Typing;
            nextIndicator.SetActive(false);
            log.AddLine(line.DisplayName, line.DisplayRole, line.DisplayPortrait, line.text);
            if (typeSpeedCps <= 0f && delay <= 0f) Complete();
        }

        void Complete()
        {
            visible = total;
            body.maxVisibleCharacters = total;
            state = State.LineComplete;
            autoWait = 0f;
            ffStep = 0f;
            nextIndicator.SetActive(true);
        }

        void Next()
        {
            if (node == data.lines.Length - 1) OpenChoices();
            else if (node >= data.lines.Length + 1) Close();
            else StartLine(node + 1);
        }

        void OpenChoices()
        {
            state = State.ChoiceOpen;
            nextIndicator.SetActive(false);
            lockLeft = inputLockSeconds;
            timerLeft = choiceTimerSeconds;
            timerRoot.SetActive(choiceTimerSeconds > 0f);      // 0 이면 막대 자체를 숨긴다
            for (int i = 0; i < choiceButtons.Length; i++)
            {
                var c = data.choices[i];
                choiceButtons[i].Setup(i, c.text, c.isAction, choiceTimerSeconds > 0f && i == data.defaultChoice);
            }
            SetChoicesVisible(true);
            StartCoroutine(RevealChoices());
            focus = 0;
            Select(choiceButtons[0].gameObject);               // 열리면 첫 항목에 포커스
        }

        void Confirm(int index)
        {
            chosen = index;
            state = State.ChoiceConfirmed;
            confirmLeft = 0.32f;
            var c = data.choices[index];
            log.AddChoice(c.isAction ? $"( {c.text} )" : c.text);
            // 고른 항목만 남기고 나머지는 먼저 사라진다
            for (int i = 0; i < choiceButtons.Length; i++)
                if (i != index) choiceButtons[i].Group.alpha = 0f;
        }

        void Close()
        {
            state = State.Closed;
            StartCoroutine(Slide(false));
        }

        /* ───────── 매 프레임 ───────── */

        void Update()
        {
            if (state == State.Hidden) return;
            float dt = Time.unscaledDeltaTime;   // 일시정지(timeScale 0) 중에도 대화는 흐른다

            if (toggleLog != null && toggleLog.action.WasPressedThisFrame())
            {
                ToggleLog();
                return;
            }
            if (log.IsOpen) return;              // 기록을 보는 동안 모든 진행이 멈춘다

            if (toggleAuto != null && toggleAuto.action.WasPressedThisFrame()) ToggleAuto();
            bool ff = (ForceFastForward || (fastForward != null && fastForward.action.IsPressed())) && state != State.ChoiceOpen;
            autoOnMark.SetActive(autoAdvance);
            ffOnMark.SetActive(ff);

            if (advance != null && advance.action.WasPressedThisFrame() && state != State.ChoiceOpen)
            {
                Advance();
                return;                          // 같은 프레임에 '완성'과 '다음 줄'이 함께 일어나지 않게
            }

            switch (state)
            {
                case State.Typing:
                    if (delay > 0f) { delay -= dt; break; }
                    if (ff) { Complete(); break; }
                    typeAcc += dt;
                    float step = 1f / Mathf.Max(1f, typeSpeedCps);
                    while (visible < total && typeAcc >= step)
                    {
                        typeAcc -= step;
                        visible++;
                        char ch = body.textInfo.characterInfo[visible - 1].character;
                        if (visible < total && IsPause(ch)) typeAcc -= punctuationPause;   // 말하는 리듬
                    }
                    body.maxVisibleCharacters = visible;
                    if (visible >= total) Complete();
                    break;

                case State.LineComplete:
                    if (ff)
                    {
                        ffStep += dt;
                        if (ffStep >= fastForwardInterval) Next();
                    }
                    else if (autoAdvance)
                    {
                        autoWait += dt;
                        float need = 1.2f + 0.04f * total;   // 문장 길이에 비례한 대기
                        autoProgress.fillAmount = autoWait / need;
                        if (autoWait >= need) Next();
                    }
                    break;

                case State.ChoiceOpen:
                    lockLeft = Mathf.Max(0f, lockLeft - dt);
                    float lockRatio = inputLockSeconds > 0f ? lockLeft / inputLockSeconds : 0f;
                    foreach (var b in choiceButtons) b.SetLock(lockRatio);
                    // 빈 곳을 클릭해 선택이 풀리면 마지막 선택지로 되돌린다 (패드 입력이 먹히지 않는 문제 방지)
                    var es = EventSystem.current;
                    if (es != null && es.currentSelectedGameObject == null && lastSelected != null) es.SetSelectedGameObject(lastSelected);
                    if (choiceTimerSeconds > 0f)
                    {
                        timerLeft -= dt;
                        timerFill.fillAmount = Mathf.Clamp01(timerLeft / choiceTimerSeconds);
                        if (timerLeft <= 0f) Confirm(data.defaultChoice);   // 시간 초과 = 기본 선택 (잠금과 무관)
                    }
                    break;

                case State.ChoiceConfirmed:
                    confirmLeft -= dt;
                    if (confirmLeft <= 0f)
                    {
                        SetChoicesVisible(false);
                        StartLine(data.lines.Length);
                    }
                    break;
            }
            if (state != State.LineComplete || !autoAdvance) autoProgress.fillAmount = 0f;
        }

        static bool IsPause(char c) => c == '.' || c == ',' || c == '!' || c == '?' || c == '…';

        void Select(GameObject go)
        {
            lastSelected = go;
            var es = EventSystem.current;
            if (es == null) return;
            // 지난 회차에 고른 버튼이 아직 '선택됨'으로 남아 있으면 SetSelectedGameObject 가 같은 오브젝트라며
            // 바로 반환해 OnSelect 가 오지 않는다(포커스 연출이 사라짐) → 먼저 비우고 다시 선택한다
            es.SetSelectedGameObject(null);
            es.SetSelectedGameObject(go);
        }

        void SetChoicesVisible(bool on)
        {
            foreach (var b in choiceButtons)
            {
                b.gameObject.SetActive(on);
                b.Group.alpha = on ? 0f : 1f;
            }
            timerRoot.SetActive(on && choiceTimerSeconds > 0f);
            // 꺼진 버튼이 '선택됨'으로 남지 않게 (다음 회차 Select 가 OnSelect 를 다시 받도록)
            if (!on && EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
        }

        /* ───────── 연출 (코루틴, unscaled) ───────── */

        IEnumerator RevealChoices()
        {
            // 항목마다 50ms 시차, 각 180ms ease-out 페이드 — 4개여도 0.33초 안에 끝난다
            // (VerticalLayoutGroup 이 위치를 정하므로 밀어 넣기는 ChoiceButton 의 content 쪽에서)
            float t = 0f;
            while (t < 0.18f + 0.05f * choiceButtons.Length)
            {
                t += Time.unscaledDeltaTime;
                for (int i = 0; i < choiceButtons.Length; i++)
                {
                    float k = Mathf.Clamp01((t - 0.05f * i) / 0.18f);
                    if (state == State.ChoiceOpen) choiceButtons[i].Group.alpha = 1f - (1f - k) * (1f - k);
                }
                yield return null;
            }
        }

        IEnumerator Slide(bool show)
        {
            float dur = show ? openTime : closeTime;
            float from = show ? -60f : 0f, to = show ? 0f : -70f;
            for (float t = 0f; t < dur; t += Time.unscaledDeltaTime)
            {
                float k = t / dur;
                float e = show ? 1f - Mathf.Pow(1f - k, 3f) : k * k;
                panel.anchoredPosition = new Vector2(panel.anchoredPosition.x, Mathf.Lerp(from, to, e));
                root.alpha = show ? e : 1f - e;
                yield return null;
            }
            panel.anchoredPosition = new Vector2(panel.anchoredPosition.x, to);
            root.alpha = show ? 1f : 0f;
        }
    }
}
