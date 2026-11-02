// UI Toolkit 판 입력 재설정 메뉴 — 로직은 UGUI 폴더의 RebindService · RebindActions · GlyphTable 을 그대로 쓴다.
// · 행은 RebindRow.uxml 을 복제, 칸 Button 의 clicked 에서 대기 시작 (Submit 을 뗄 때까지 기다린 뒤)
// · 상태는 USS 클래스로만: slot--listening · slot--changed · slot--empty · conflict--show
// · 남은 시간 · 길게 누르기 막대는 매 프레임 style.scale 만 바꾼다
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.UIElements;

namespace UIGallery.InputRebinding
{
    [RequireComponent(typeof(UIDocument))]
    public class RebindMenuUITK : MonoBehaviour
    {
        [Serializable]
        public class RowSetup
        {
            public string displayName = "점프";
            [Tooltip("맵/액션 이름. 예: Player/Jump")]
            public string actionPath = "Player/Jump";
            [Tooltip("합성 바인딩의 부분 이름 (Move 의 up …). 버튼 행동이면 비운다")]
            public string compositePart = "";
        }

        class Row
        {
            public RowSetup setup;
            public InputAction action;
            public Button[] slots = new Button[2];
            public int[] index = { -1, -1 };
            public Button reset;
        }

        [Tooltip("비우면 RebindActions.CreateDefault() 로 코드에서 만든다")]
        [SerializeField] InputActionAsset actions;
        [SerializeField] VisualTreeAsset rowTemplate;
        [SerializeField] GlyphTable glyphs;
        [SerializeField] List<RowSetup> rows = new()
        {
            new RowSetup { displayName = "앞으로 이동", actionPath = "Player/Move", compositePart = "up" },
            new RowSetup { displayName = "뒤로 이동", actionPath = "Player/Move", compositePart = "down" },
            new RowSetup { displayName = "왼쪽으로 이동", actionPath = "Player/Move", compositePart = "left" },
            new RowSetup { displayName = "오른쪽으로 이동", actionPath = "Player/Move", compositePart = "right" },
            new RowSetup { displayName = "점프", actionPath = "Player/Jump" },
            new RowSetup { displayName = "달리기", actionPath = "Player/Sprint" },
            new RowSetup { displayName = "웅크리기", actionPath = "Player/Crouch" },
            new RowSetup { displayName = "상호작용", actionPath = "Player/Interact" },
            new RowSetup { displayName = "수리 키트 사용", actionPath = "Player/UseRepairKit" },
            new RowSetup { displayName = "스캐너", actionPath = "Player/Scan" },
        };

        [Header("대기 · 충돌")]
        [Tooltip("키 입력 대기 시간 (초). 0 = 시간 제한 없음")]
        [SerializeField] float timeoutSeconds = 5f;
        [SerializeField] ConflictPolicy conflictPolicy = ConflictPolicy.Swap;
        [Tooltip("충돌 창이 뜬 직후 확정을 막는 시간")]
        [SerializeField] float inputLockSeconds = 0.3f;
        [SerializeField] float holdSeconds = 1f;

        [Header("저장 · 안내")]
        [SerializeField] string prefsKey = "uigallery.rebinds";
        [SerializeField] bool showSaveJson = true;
        [SerializeField] BindingPromptBar.DeviceMode inputDevice = BindingPromptBar.DeviceMode.Auto;
        [SerializeField] string[] promptActions = { "Player/Jump", "Player/Interact", "Player/UseRepairKit", "Player/Scan" };

        RebindService service;
        readonly List<Row> rowViews = new();
        VisualElement root, conflict, timeBar, holdFill, prompts;
        Label listenTitle, listenTime, note, conflictText, device, thKb, thPad;
        Button accept, cancel;
        Foldout json;
        TextField jsonText;
        float conflictOpenedAt, held;
        bool holding, lastWasGamepad, created;
        IDisposable anyButton;

        void OnEnable()
        {
            if (actions == null)
            {
                actions = RebindActions.CreateDefault();
                created = true;
            }
            actions.FindActionMap("Player", true).Enable();
            service = new RebindService(actions, prefsKey) { TimeoutSeconds = timeoutSeconds, Policy = conflictPolicy };
            service.Load();

            root = GetComponent<UIDocument>().rootVisualElement;
            var list = root.Q("rows");
            listenTitle = root.Q<Label>("listen-title");
            listenTime = root.Q<Label>("listen-time");
            timeBar = root.Q("time-bar");
            note = root.Q<Label>("note");
            conflict = root.Q("conflict");
            conflictText = root.Q<Label>("conflict-text");
            accept = root.Q<Button>("accept");
            cancel = root.Q<Button>("cancel");
            json = root.Q<Foldout>("json");
            jsonText = root.Q<TextField>("json-text");
            jsonText.multiline = true;
            jsonText.isReadOnly = true;
            device = root.Q<Label>("device");
            thKb = root.Q<Label>("th-kb");
            thPad = root.Q<Label>("th-pad");
            prompts = root.Q("prompts");
            holdFill = root.Q("reset-fill");

            list.Clear();
            rowViews.Clear();
            foreach (var setup in rows) rowViews.Add(BuildRow(list, setup));

            accept.clicked += () => Answer(true);
            cancel.clicked += () => Answer(false);
            var hold = root.Q("reset-all");
            // 대기 · 충돌 창 중에는 받지 않는다 — 대기에서 마우스 왼쪽을 바인딩한 클릭이 그대로 전체 복원으로 이어지지 않게
            hold.RegisterCallback<PointerDownEvent>(_ => holding = !service.IsListening && service.Pending == null);
            hold.RegisterCallback<PointerUpEvent>(_ => holding = false);
            hold.RegisterCallback<PointerLeaveEvent>(_ => holding = false);
            hold.RegisterCallback<KeyDownEvent>(e => holding |= e.keyCode == KeyCode.Return);
            hold.RegisterCallback<KeyUpEvent>(e => holding &= e.keyCode != KeyCode.Return);

            service.Changed += Refresh;
            service.Finished += OnFinished;
            anyButton = InputSystem.onAnyButtonPress.Call(c =>
            {
                lastWasGamepad = c.device is Gamepad;
                RefreshPrompts();
            });
            Note("칸을 고르면 새 입력을 기다린다 · Esc 취소");
            Refresh();
        }

        void OnDisable()
        {
            // 대기 중(또는 Submit 을 떼길 기다리는 중)에 꺼져도 맵이 꺼진 채 남지 않게 — 코루틴을 멈추고 먼저 취소
            StopAllCoroutines();
            anyButton?.Dispose();
            if (service != null)
            {
                service.Cancel();
                service.Changed -= Refresh;
                service.Finished -= OnFinished;
                service.Dispose();
            }
            if (created && actions != null)
            {
                Destroy(actions);
                actions = null;
                created = false;
            }
        }

        Row BuildRow(VisualElement list, RowSetup setup)
        {
            var el = rowTemplate.Instantiate();
            list.Add(el);
            var row = new Row { setup = setup, action = actions.FindAction(setup.actionPath, true), reset = el.Q<Button>("reset") };
            el.Q<Label>("label").text = setup.displayName;
            string[] names = { "kb", "pad" };
            string[] groups = { RebindService.KeyboardGroup, RebindService.GamepadGroup };
            for (int c = 0; c < 2; c++)
            {
                var slot = el.Q<Button>(names[c]);
                slot.Add(new VisualElement { name = "glyph", pickingMode = PickingMode.Ignore });
                slot.Add(new Label("바뀜") { name = "mark", pickingMode = PickingMode.Ignore });
                slot.Add(new VisualElement { name = "time", pickingMode = PickingMode.Ignore });
                slot.Q("glyph").AddToClassList("slot__glyph");
                slot.Q("mark").AddToClassList("slot__mark");
                slot.Q("time").AddToClassList("slot__time");
                row.slots[c] = slot;
                row.index[c] = RebindService.IndexFor(row.action, groups[c], setup.compositePart);
                int index = row.index[c];
                if (index < 0)
                {
                    slot.SetEnabled(false);
                    slot.AddToClassList("slot--locked");
                }
                else slot.clicked += () => StartCoroutine(BeginAfterRelease(row, index));
            }
            row.reset.clicked += () =>
            {
                foreach (int i in row.index)
                    if (i >= 0 && RebindService.IsChanged(row.action, i)) service.ResetBinding(row.action, i);
            };
            return row;
        }

        IEnumerator BeginAfterRelease(Row row, int index)
        {
            if (service.IsListening || service.Pending != null) yield break;
            // 포커스를 빼서 새 키로 누른 Enter 가 Button 을 다시 누르지 않게
            root.focusController?.focusedElement?.Blur();
            yield return new WaitUntil(() => !SubmitHeld());
            service.TimeoutSeconds = timeoutSeconds;
            service.Policy = conflictPolicy;
            service.Start(row.action, index);
            listenTitle.text = $"키 입력 대기 · {row.setup.displayName}";
            Note(timeoutSeconds > 0f ? "새 입력을 누르세요 · Esc 취소 · 시간이 지나면 그대로" : "새 입력을 누르세요 · 시간 제한 없음 · Esc 취소");
        }

        static bool SubmitHeld()
        {
            var k = Keyboard.current;
            var g = Gamepad.current;
            var m = Mouse.current;
            return (k != null && (k.enterKey.isPressed || k.spaceKey.isPressed)) || (g != null && g.buttonSouth.isPressed) || (m != null && m.leftButton.isPressed);
        }

        void OnFinished(RebindReport r)
        {
            string name = NameOf(r.action);
            string other = NameOf(r.other);
            string key = string.IsNullOrEmpty(r.path) ? "" : InputControlPath.ToHumanReadableString(r.path, InputControlPath.HumanReadableStringOptions.OmitDevice);
            switch (r.result)
            {
                case RebindResult.Completed: Note($"✓ {name} ← {key}"); break;
                case RebindResult.Unchanged: Note($"바뀐 것 없음 — {name}: 이미 {key}"); break;
                case RebindResult.Canceled: Note($"취소 — 바뀐 것 없음 ({name})"); break;
                case RebindResult.TimedOut: Note($"⏱ 시간 초과 — 바뀐 것 없음 ({name})"); break;
                case RebindResult.Rejected: Note($"✕ {key} — 이미 '{other}'에 쓰는 입력. 다른 입력을 누르세요"); break;
                case RebindResult.Conflict:
                    var p = service.Pending;
                    string old = InputControlPath.ToHumanReadableString(p.oldPath, InputControlPath.HumanReadableStringOptions.OmitDevice);
                    conflictText.text = $"{key} — 지금 '{other}'에 쓰고 있다.";
                    accept.text = conflictPolicy == ConflictPolicy.Unbind ? $"바꾸고 '{other}' 비우기" : $"맞바꾸기 · {other} ← {old}";
                    cancel.text = $"취소 · 그대로 {old}";
                    conflict.AddToClassList("conflict--show");
                    conflictOpenedAt = Time.unscaledTime;
                    accept.SetEnabled(false); // 입력 잠금 — Update 에서 풀어 준다
                    cancel.Focus();
                    Note($"⚠ {key} — 이미 '{other}'에 쓰는 입력");
                    break;
            }
        }

        void Answer(bool ok)
        {
            conflict.RemoveFromClassList("conflict--show");
            service.ResolvePending(ok);
            if (!ok) Note("취소 — 바뀐 것 없음");
        }

        string NameOf(InputAction action)
        {
            if (action == null) return "";
            foreach (var r in rowViews)
                if (r.action == action) return r.setup.displayName;
            return action.name;
        }

        void Note(string text) => note.text = text;

        void Refresh()
        {
            foreach (var row in rowViews)
            {
                bool any = false;
                for (int c = 0; c < 2; c++)
                {
                    var slot = row.slots[c];
                    int i = row.index[c];
                    if (i < 0)
                    {
                        slot.text = "왼쪽 스틱 (고정)";
                        continue;
                    }
                    bool listening = service.IsListening && service.ListeningAction == row.action && service.ListeningIndex == i;
                    bool changed = RebindService.IsChanged(row.action, i);
                    bool empty = string.IsNullOrEmpty(row.action.bindings[i].effectivePath);
                    any |= changed;
                    Sprite sprite = null;
                    string text = glyphs != null ? glyphs.Describe(row.action, i, out sprite) : row.action.GetBindingDisplayString(i);
                    slot.text = listening ? "키를 누르세요…" : text;
                    slot.Q("glyph").style.backgroundImage = sprite != null ? new StyleBackground(sprite) : new StyleBackground(StyleKeyword.None);
                    slot.EnableInClassList("slot--listening", listening);
                    slot.EnableInClassList("slot--changed", changed && !listening);
                    slot.EnableInClassList("slot--empty", empty && !listening);
                }
                row.reset.SetEnabled(any);
            }
            if (!service.IsListening) listenTitle.text = service.Pending != null ? "확인 필요" : "바꿀 칸을 고르세요";
            json.style.display = showSaveJson ? DisplayStyle.Flex : DisplayStyle.None;
            if (showSaveJson) jsonText.value = service.Json;
            RefreshPrompts();
        }

        void RefreshPrompts()
        {
            bool pad = inputDevice == BindingPromptBar.DeviceMode.Gamepad || (inputDevice == BindingPromptBar.DeviceMode.Auto && lastWasGamepad);
            device.text = pad ? "마지막 입력 · 게임패드" : "마지막 입력 · 키보드 · 마우스";
            thKb.EnableInClassList("th--now", !pad);
            thPad.EnableInClassList("th--now", pad);
            prompts.Clear();
            string group = pad ? RebindService.GamepadGroup : RebindService.KeyboardGroup;
            foreach (var path in promptActions)
            {
                var action = actions.FindAction(path);
                if (action == null) continue;
                int i = RebindService.IndexFor(action, group, null);
                Sprite sprite = null;
                string key = i < 0 ? "—" : glyphs != null ? glyphs.Describe(action, i, out sprite) : action.GetBindingDisplayString(i);
                bool empty = i >= 0 && string.IsNullOrEmpty(action.bindings[i].effectivePath);
                var item = new VisualElement();
                item.AddToClassList("prompt");
                var glyph = new VisualElement();
                glyph.AddToClassList("prompt__glyph");
                if (sprite != null) glyph.style.backgroundImage = new StyleBackground(sprite);
                else glyph.style.display = DisplayStyle.None;
                var keyLabel = new Label(empty ? "키 없음" : key);
                keyLabel.AddToClassList("prompt__key");
                keyLabel.EnableInClassList("prompt__key--empty", empty);
                item.Add(glyph);
                item.Add(keyLabel);
                item.Add(new Label(NameOf(action)));
                prompts.Add(item);
            }
        }

        void Update()
        {
            if (service == null) return;
            // 남은 시간
            bool timed = service.IsListening && service.TimeoutSeconds > 0f;
            float k = timed ? service.TimeLeft / service.TimeoutSeconds : 0f;
            timeBar.style.scale = new Scale(new Vector3(k, 1f, 1f));
            listenTime.text = timed ? $"{service.TimeLeft:0.0}초" : service.IsListening ? "제한 없음" : "";
            foreach (var row in rowViews)
                foreach (var slot in row.slots)
                    if (slot.ClassListContains("slot--listening")) slot.Q("time").style.scale = new Scale(new Vector3(k, 1f, 1f));

            // 충돌 창 입력 잠금 · 취소 키
            if (conflict.ClassListContains("conflict--show"))
            {
                if (!accept.enabledSelf && Time.unscaledTime - conflictOpenedAt >= inputLockSeconds)
                {
                    accept.SetEnabled(true);
                    accept.Focus();
                }
                if ((Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame) || (Gamepad.current != null && Gamepad.current.buttonEast.wasPressedThisFrame)) Answer(false);
            }

            // 전체 복원 (길게 누르기)
            if (service.IsListening || service.Pending != null) holding = false;
            held = holding ? held + Time.unscaledDeltaTime : 0f;
            if (held >= holdSeconds)
            {
                held = 0f;
                holding = false;
                service.ResetAll();
                Note("↺ 전체 기본값 — 저장도 지웠다");
            }
            holdFill.style.scale = new Scale(new Vector3(held / holdSeconds, 1f, 1f));
        }
    }
}
