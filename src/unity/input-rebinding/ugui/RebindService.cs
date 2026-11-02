// 키 재설정의 로직 (UI 없음) — UGUI 판(RebindMenu)과 UI Toolkit 판(RebindMenuUITK)이 같이 쓴다.
// · 대기: PerformInteractiveRebinding + 열(키보드 · 패드) 거르기 + Esc 취소 + 시간 제한
// · 충돌: OnApplyBinding 으로 덮어쓰기를 직접 하며, 같은 액션 맵에 같은 경로가 있으면 멈추고 묻는다
// · 저장: 바뀔 때마다 SaveBindingOverridesAsJson → PlayerPrefs, 시작할 때 LoadBindingOverridesFromJson
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace UIGallery.InputRebinding
{
    public enum ConflictPolicy
    {
        /// <summary>맞바꿀지 묻는다 — 상대 행동이 내 옛 키를 받는다</summary>
        Swap,
        /// <summary>상대 행동을 비울지 묻는다 — 상대는 키 없음</summary>
        Unbind,
        /// <summary>거절하고 다른 키를 계속 기다린다</summary>
        Reject,
    }

    public enum RebindResult { Completed, Canceled, TimedOut, Conflict, Rejected, Unchanged }

    /// <summary>대기 하나의 결과 (UI 가 문구를 만든다)</summary>
    public struct RebindReport
    {
        public RebindResult result;
        public InputAction action;
        public int bindingIndex;
        /// <summary>새로 누른 입력의 경로 (Completed · Conflict · Rejected · Unchanged)</summary>
        public string path;
        /// <summary>그 입력을 이미 쓰던 행동 (Conflict · Rejected)</summary>
        public InputAction other;
    }

    /// <summary>충돌로 멈춘 바꾸기 — ResolvePending(true/false) 로 끝낸다</summary>
    public class PendingConflict
    {
        public InputAction action;
        public int index;
        public string newPath;
        public string oldPath;
        public InputAction other;
        public int otherIndex;
    }

    public class RebindService : IDisposable
    {
        public const string KeyboardGroup = "Keyboard&Mouse";
        public const string GamepadGroup = "Gamepad";

        /// <summary>
        /// 운영체제 · 플랫폼이 먼저 가져가는 입력 — 아예 후보에서 뺀다 (패드 보기 버튼 포함).
        /// 트리거 · 스틱 누르기는 ButtonControl 이라 이 판에서는 받는다 (웹 표본은 글리프가 없어 받지 않는다).
        /// </summary>
        static readonly string[] Excluded =
        {
            "<Keyboard>/leftMeta", "<Keyboard>/rightMeta", "<Keyboard>/contextMenu", "<Keyboard>/printScreen",
            "<Pointer>/position", "<Pointer>/delta", "<Mouse>/scroll", "<Gamepad>/select",
        };

        readonly InputActionAsset asset;
        readonly string prefsKey;
        InputActionRebindingExtensions.RebindingOperation operation;
        float startedAt;
        bool mapWasEnabled;
        /// <summary>대기 · 충돌 창 동안 꺼 둔 맵. 결정이 끝나야 다시 켠다</summary>
        InputActionMap disabledMap;
        RebindReport report;

        public float TimeoutSeconds { get; set; } = 5f;
        public ConflictPolicy Policy { get; set; } = ConflictPolicy.Swap;
        public InputActionAsset Asset => asset;
        public bool IsListening => operation != null;
        public InputAction ListeningAction { get; private set; }
        public int ListeningIndex { get; private set; } = -1;
        public PendingConflict Pending { get; private set; }

        /// <summary>대기 남은 시간 (초). 시간 제한이 없으면 0</summary>
        public float TimeLeft => IsListening && TimeoutSeconds > 0f ? Mathf.Max(0f, TimeoutSeconds - (Time.realtimeSinceStartup - startedAt)) : 0f;

        /// <summary>바인딩 · 대기 상태가 바뀌었다 (UI 를 다시 그린다)</summary>
        public event Action Changed;
        /// <summary>대기 하나가 끝났다</summary>
        public event Action<RebindReport> Finished;

        public RebindService(InputActionAsset asset, string prefsKey)
        {
            this.asset = asset;
            this.prefsKey = prefsKey;
        }

        /* ───── 대기 ───── */

        public void Start(InputAction action, int bindingIndex)
        {
            if (action == null || bindingIndex < 0) return;
            Cancel();
            Pending = null;
            bool pad = InputBinding.MaskByGroup(GamepadGroup).Matches(action.bindings[bindingIndex]);

            // 켜진 액션은 바꿀 수 없다 (InvalidOperationException). 맵 전체를 꺼서 대기 중 누른 키로 다른 행동이 나가지 않게 한다
            if (disabledMap == null)
            {
                mapWasEnabled = action.actionMap.enabled;
                disabledMap = action.actionMap;
            }
            action.actionMap.Disable();

            ListeningAction = action;
            ListeningIndex = bindingIndex;
            startedAt = Time.realtimeSinceStartup;
            report = new RebindReport { action = action, bindingIndex = bindingIndex };

            // 주의: OnPotentialMatch 를 주면 완료를 그 콜백에 맡긴 것이 된다. 지금은 OnMatchWaitForAnother 의 기다림이 끝나며 완료된다 —
            // 이 줄을 지우면 대기가 영원히 끝나지 않는다 (지우려면 콜백에서 op.Complete() 를 부른다)
            var op = action.PerformInteractiveRebinding(bindingIndex)
                .WithExpectedControlType<ButtonControl>()
                .WithCancelingThrough("<Keyboard>/escape")
                .OnMatchWaitForAnother(0.1f)
                .OnPotentialMatch(OnPotentialMatch)
                .OnApplyBinding(OnApplyBinding)
                .OnComplete(OnComplete)
                .OnCancel(OnCancel);
            if (TimeoutSeconds > 0f) op.WithTimeout(TimeoutSeconds);
            // 열 거르기: 키보드 칸은 키보드 · 마우스만, 패드 칸은 패드만 (여러 번 부르면 '또는')
            if (pad) op.WithControlsHavingToMatchPath("<Gamepad>");
            // 키보드 칸에도 패드 메뉴 버튼을 넣는다 — 거르기 경로 검사가 후보보다 먼저라, 없으면 OnPotentialMatch 까지 오지 못해
            // 패드만 쓰는 사람이 취소할 수 없다 (시간 제한 0 이면 갇힌다). OnPotentialMatch 가 바인딩하지 않고 취소한다
            else op.WithControlsHavingToMatchPath("<Keyboard>").WithControlsHavingToMatchPath("<Mouse>").WithControlsHavingToMatchPath("<Gamepad>/start");
            foreach (var path in Excluded) op.WithControlsExcluding(path);

            operation = op;
            op.Start();
            Changed?.Invoke();
        }

        public void Cancel()
        {
            operation?.Cancel();
        }

        // WithCancelingThrough 는 경로 하나만 기억한다 — 패드 메뉴 버튼은 여기서 두 번째 취소 경로로 처리
        void OnPotentialMatch(InputActionRebindingExtensions.RebindingOperation op)
        {
            var c = op.selectedControl;
            if (c != null && c.device is Gamepad g && c == g.startButton) op.Cancel();
        }

        // 이 콜백을 주면 기본 덮어쓰기가 일어나지 않는다 — 충돌을 먼저 보고 직접 적용한다
        void OnApplyBinding(InputActionRebindingExtensions.RebindingOperation op, string path)
        {
            var action = ListeningAction;
            int index = ListeningIndex;
            string oldPath = action.bindings[index].effectivePath;
            report.path = path;
            if (SamePath(oldPath, path))
            {
                report.result = RebindResult.Unchanged;
                return;
            }
            if (FindConflict(action, index, path, out var other, out int otherIndex))
            {
                report.other = other;
                if (Policy == ConflictPolicy.Reject)
                {
                    report.result = RebindResult.Rejected;
                    return;
                }
                Pending = new PendingConflict { action = action, index = index, newPath = path, oldPath = oldPath, other = other, otherIndex = otherIndex };
                report.result = RebindResult.Conflict;
                return;
            }
            action.ApplyBindingOverride(index, path);
            report.result = RebindResult.Completed;
        }

        void OnComplete(InputActionRebindingExtensions.RebindingOperation op)
        {
            var r = report;
            // 충돌 창이 떠 있는 동안은 맵을 꺼 둔다 — 창에서 누른 Esc 가 Player/Menu 까지 열지 않게
            CleanUp(keepMapDisabled: r.result == RebindResult.Conflict);
            if (r.result == RebindResult.Completed) Save();
            Finished?.Invoke(r);
            // 거절: 이유를 알린 뒤 같은 칸에서 다시 기다린다
            if (r.result == RebindResult.Rejected) Start(r.action, r.bindingIndex);
            Changed?.Invoke();
        }

        void OnCancel(InputActionRebindingExtensions.RebindingOperation op)
        {
            var r = report;
            bool timedOut = TimeoutSeconds > 0f && Time.realtimeSinceStartup - startedAt >= TimeoutSeconds - 0.05f;
            r.result = timedOut ? RebindResult.TimedOut : RebindResult.Canceled;
            CleanUp();
            Finished?.Invoke(r);
            Changed?.Invoke();
        }

        void CleanUp(bool keepMapDisabled = false)
        {
            operation?.Dispose(); // 끝나면 꼭 Dispose — 안 하면 메모리가 샌다
            operation = null;
            ListeningAction = null;
            ListeningIndex = -1;
            if (!keepMapDisabled) RestoreMap();
        }

        void RestoreMap()
        {
            if (disabledMap != null && mapWasEnabled) disabledMap.Enable();
            disabledMap = null;
        }

        /// <summary>충돌 창의 답. true = 맞바꾸기(또는 상대 비우기), false = 취소</summary>
        public void ResolvePending(bool accept)
        {
            var p = Pending;
            Pending = null;
            if (p != null && accept)
            {
                p.action.ApplyBindingOverride(p.index, p.newPath);
                // 비우기는 빈 경로("") — 어떤 컨트롤에도 묶이지 않고, 저장 JSON 에는 path "" 로 남는다
                p.other.ApplyBindingOverride(p.otherIndex, Policy == ConflictPolicy.Unbind ? "" : p.oldPath);
                Save();
            }
            RestoreMap();
            Changed?.Invoke();
        }

        /* ───── 충돌 검사 ───── */

        /// <summary>
        /// 같은 액션 맵에서 이 경로를 이미 쓰는 다른 바인딩 (UI 맵의 Submit 같은 것은 보지 않는다).
        /// 같은 경로만 본다 — '&lt;Gamepad&gt;/leftStick' 과 '&lt;Gamepad&gt;/leftStick/up' 처럼 겹치는 경로는 놓친다.
        /// 스틱 · 합성까지 바꾸게 하려면 InputControlPath.Matches 등으로 포함 관계를 본다.
        /// </summary>
        public static bool FindConflict(InputAction action, int index, string path, out InputAction other, out int otherIndex)
        {
            other = null;
            otherIndex = -1;
            if (string.IsNullOrEmpty(path)) return false;
            foreach (var a in action.actionMap.actions)
            {
                var bindings = a.bindings;
                for (int i = 0; i < bindings.Count; i++)
                {
                    if (a == action && i == index) continue;
                    if (bindings[i].isComposite) continue;
                    if (!SamePath(bindings[i].effectivePath, path)) continue;
                    other = a;
                    otherIndex = i;
                    return true;
                }
            }
            return false;
        }

        static bool SamePath(string a, string b) => string.Equals(a ?? "", b ?? "", StringComparison.OrdinalIgnoreCase);

        /* ───── 복원 · 저장 ───── */

        /// <summary>기본값과 다른가 (같은 값으로 덮어쓴 것은 바뀌지 않은 것으로 본다)</summary>
        public static bool IsChanged(InputAction action, int index)
        {
            var b = action.bindings[index];
            return b.overridePath != null && !SamePath(b.overridePath, b.path);
        }

        /// <summary>행 하나 복원. 되돌린 기본 키를 다른 바인딩이 쓰고 있으면 그것도 기본값으로 (기본값끼리는 겹치지 않는다)</summary>
        public void ResetBinding(InputAction action, int index)
        {
            var queue = new Queue<(InputAction action, int index)>();
            queue.Enqueue((action, index));
            int guard = 0;
            while (queue.Count > 0 && guard++ < 64)
            {
                var (a, i) = queue.Dequeue();
                a.RemoveBindingOverride(i);
                if (FindConflict(a, i, a.bindings[i].effectivePath, out var other, out int otherIndex)) queue.Enqueue((other, otherIndex));
            }
            Save();
            Changed?.Invoke();
        }

        public void ResetAll()
        {
            Cancel();
            Pending = null;
            RestoreMap();
            asset.RemoveAllBindingOverrides();
            PlayerPrefs.DeleteKey(prefsKey);
            Changed?.Invoke();
        }

        /// <summary>바뀐 것만 담은 JSON (action · id · path · interactions · processors)</summary>
        public string Json => asset.SaveBindingOverridesAsJson();

        public void Save() => PlayerPrefs.SetString(prefsKey, Json);

        public void Load()
        {
            var json = PlayerPrefs.GetString(prefsKey, "");
            if (!string.IsNullOrEmpty(json)) asset.LoadBindingOverridesFromJson(json);
        }

        /* ───── 찾기 ───── */

        /// <summary>액션에서 그룹(Keyboard&amp;Mouse · Gamepad)과 합성 부분 이름(up …)이 맞는 바인딩 번호. 없으면 -1 (= 고정 칸)</summary>
        public static int IndexFor(InputAction action, string group, string compositePart)
        {
            var mask = InputBinding.MaskByGroup(group);
            var bindings = action.bindings;
            for (int i = 0; i < bindings.Count; i++)
            {
                var b = bindings[i];
                if (b.isComposite || !mask.Matches(b)) continue;
                bool part = !string.IsNullOrEmpty(compositePart);
                if (part != b.isPartOfComposite) continue;
                if (part && !string.Equals(b.name, compositePart, StringComparison.OrdinalIgnoreCase)) continue;
                return i;
            }
            return -1;
        }

        /// <summary>대기 중에 파괴돼도 맵이 꺼진 채 남지 않게 — 먼저 취소(OnCancel → 정리 · Finished)한다</summary>
        public void Dispose()
        {
            Cancel();
            Pending = null;
            operation?.Dispose();
            operation = null;
            RestoreMap();
        }
    }
}
