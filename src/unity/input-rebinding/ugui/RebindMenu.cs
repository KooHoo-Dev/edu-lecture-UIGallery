// 입력 재설정 메뉴 (UGUI) — 행(RebindRow) · 상태 패널 · 충돌 창 · 저장 JSON 을 RebindService 에 묶는다.
// 칸을 누르면 Submit 키를 뗄 때까지 기다렸다가 대기를 시작한다 (Input System 도 시작 때 눌려 있던 키는 후보로 잡지 않지만, 키 반복 · 다시 누름까지 깔끔하게).
// 대기 동안 EventSystem 의 Navigate · Submit 을 꺼서, 새 키로 누른 Enter 가 버튼을 다시 누르지 않게 한다.
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.InputRebinding
{
    public class RebindMenu : MonoBehaviour
    {
        [Tooltip("재설정할 액션 에셋 — 프로젝트 기본 InputSystem_Actions 를 끌어 놓아도 된다. 비우면 RebindDemo 가 코드로 만든다")]
        [SerializeField] InputActionAsset actions;
        [SerializeField] List<RebindRow> rows = new();
        [SerializeField] GlyphTable glyphs;

        [Header("대기 · 충돌")]
        [Tooltip("키 입력 대기 시간 (초). 0 = 시간 제한 없음 (Esc 로만 취소)")]
        [SerializeField] float timeoutSeconds = 5f;
        [SerializeField] ConflictPolicy conflictPolicy = ConflictPolicy.Swap;

        [Header("저장")]
        [SerializeField] string prefsKey = "uigallery.rebinds";
        [SerializeField] bool showSaveJson = true;
        [SerializeField] TextMeshProUGUI jsonText;

        [Header("표시")]
        [SerializeField] TextMeshProUGUI statusTitle;
        [SerializeField] TextMeshProUGUI timeText;
        [SerializeField] Image timeFill;
        [SerializeField] TextMeshProUGUI noteText;
        [SerializeField] ConflictPanel conflictPanel;
        [SerializeField] HoldButton resetAllButton;

        public RebindService Service { get; private set; }
        public InputActionAsset Actions
        {
            get => actions;
            set => actions = value;
        }

        void Start()
        {
            Service = new RebindService(actions, prefsKey) { TimeoutSeconds = timeoutSeconds, Policy = conflictPolicy };
            Service.Load();
            foreach (var row in rows) row.Init(this, actions);
            Service.Changed += RefreshAll;
            Service.Finished += OnFinished;
            conflictPanel.Answered += Service.ResolvePending;
            if (resetAllButton != null)
                resetAllButton.Completed += () =>
                {
                    Service.ResetAll();
                    Note("전체 기본값 — 저장도 지웠다");
                };
            Note("칸을 고르면 새 입력을 기다린다 · Esc 취소");
            RefreshAll();
        }

        // 대기 중(또는 Submit 을 떼길 기다리는 중)에 꺼져도 맵 · EventSystem 이 꺼진 채 남지 않게
        void OnDisable()
        {
            StopAllCoroutines();
            Service?.Cancel();
            SetNavigation(true);
        }

        void OnDestroy()
        {
            Service?.Dispose();
        }

        public void BeginRebind(RebindRow row, int index)
        {
            if (index < 0 || Service.IsListening || Service.Pending != null) return;
            StopAllCoroutines(); // 이전 클릭이 아직 Submit 을 떼길 기다리는 중이면 그것은 버린다
            StartCoroutine(BeginAfterRelease(row, index));
        }

        IEnumerator BeginAfterRelease(RebindRow row, int index)
        {
            SetNavigation(false);
            // 대기를 시작한 Submit(Enter · Space · 패드 아래 · 마우스 왼쪽)을 뗄 때까지 기다린다
            yield return new WaitUntil(() => !SubmitHeld());
            Service.TimeoutSeconds = timeoutSeconds;
            Service.Policy = conflictPolicy;
            Service.Start(row.Action, index);
            if (statusTitle != null) statusTitle.text = $"키 입력 대기 · {row.DisplayName}";
            Note(timeoutSeconds > 0f ? "새 입력을 누르세요 · Esc 취소 · 시간이 지나면 그대로" : "새 입력을 누르세요 · 시간 제한 없음 · Esc 취소");
        }

        static bool SubmitHeld()
        {
            var k = Keyboard.current;
            var g = Gamepad.current;
            var m = Mouse.current;
            return (k != null && (k.enterKey.isPressed || k.spaceKey.isPressed)) || (g != null && g.buttonSouth.isPressed) || (m != null && m.leftButton.isPressed);
        }

        static void SetNavigation(bool on)
        {
            if (EventSystem.current != null) EventSystem.current.sendNavigationEvents = on;
        }

        void OnFinished(RebindReport r)
        {
            string name = NameOf(r.action);
            string other = NameOf(r.other);
            string key = string.IsNullOrEmpty(r.path) ? "" : InputControlPath.ToHumanReadableString(r.path, InputControlPath.HumanReadableStringOptions.OmitDevice);
            switch (r.result)
            {
                case RebindResult.Completed:
                    Note($"✓ {name} ← {key}");
                    break;
                case RebindResult.Unchanged:
                    Note($"바뀐 것 없음 — {name}: 이미 {key}");
                    break;
                case RebindResult.Canceled:
                    Note($"취소 — 바뀐 것 없음 ({name})");
                    break;
                case RebindResult.TimedOut:
                    Note($"⏱ 시간 초과 — 바뀐 것 없음 ({name})");
                    break;
                case RebindResult.Rejected:
                    Note($"✕ {key} — 이미 '{other}'에 쓰는 입력. 다른 입력을 누르세요");
                    return; // 서비스가 같은 칸에서 다시 기다린다
                case RebindResult.Conflict:
                    var p = Service.Pending;
                    string old = InputControlPath.ToHumanReadableString(p.oldPath, InputControlPath.HumanReadableStringOptions.OmitDevice);
                    string accept = conflictPolicy == ConflictPolicy.Unbind ? $"바꾸고 '{other}' 비우기" : $"맞바꾸기 · {other} ← {old}";
                    SetNavigation(true);
                    conflictPanel.Show($"{key} — 지금 '{other}'에 쓰고 있다.", accept, $"취소 · 그대로 {old}");
                    Note($"⚠ {key} — 이미 '{other}'에 쓰는 입력");
                    return;
            }
            SetNavigation(true);
        }

        /// <summary>행동의 화면 이름 (행에 적은 이름, 없으면 액션 이름)</summary>
        string NameOf(InputAction action)
        {
            if (action == null) return "";
            foreach (var row in rows)
                if (row.Action == action) return row.DisplayName;
            return action.name;
        }

        void Note(string text)
        {
            if (noteText != null) noteText.text = text;
        }

        void RefreshAll()
        {
            foreach (var row in rows) row.Refresh(Service, glyphs);
            if (!Service.IsListening && statusTitle != null) statusTitle.text = Service.Pending != null ? "확인 필요" : "바꿀 칸을 고르세요";
            if (jsonText != null)
            {
                jsonText.gameObject.SetActive(showSaveJson);
                if (showSaveJson) jsonText.text = Service.Json;
            }
        }

        void Update()
        {
            if (Service == null) return;
            bool timed = Service.IsListening && Service.TimeoutSeconds > 0f;
            if (timeFill != null)
            {
                timeFill.enabled = timed;
                if (timed) timeFill.fillAmount = Service.TimeLeft / Service.TimeoutSeconds;
            }
            if (timeText != null) timeText.text = timed ? $"{Service.TimeLeft:0.0}초" : Service.IsListening ? "시간 제한 없음" : "";
            foreach (var row in rows) row.Tick(Service);
            // 대기 · 충돌 창 중에는 전체 복원 길게 누르기를 받지 않는다 (대기에서 마우스 왼쪽을 바인딩한 클릭이 이어져 복원되지 않게)
            if (resetAllButton != null) resetAllButton.Blocked = Service.IsListening || Service.Pending != null;
        }
    }
}
