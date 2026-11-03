// 방향 커맨드 판정 (순수 C#, 화면을 모른다) — 입력 버퍼 · 접두사 매칭 · 접두사 커맨드 기다림 · 입력 사이 제한 시간 · 재사용 대기.
// DirectionQuantizer: Vector2(키보드 합성 8방향 · 스틱) → 4방향 하나. 한 번 누르면 한 칸.
// ComboLabels(화면 문구) · MismatchStyle 도 여기 둔다 — UI Toolkit 판이 TMPro 를 쓰는 UGUI 화면 파일(ComboHud · ComboRow)에 묶이지 않게.
using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace UIGallery.DirectionalComboInput
{
    /// <summary>맞지 않는 후보: 흐리게(자리 유지) · 숨기기(남은 후보가 위로)</summary>
    public enum MismatchStyle { Dim, Hide }

    public enum StepResult
    {
        /// <summary>후보가 남았다 (아직 완성 아님)</summary>
        Progress,
        /// <summary>완성했지만 더 긴 후보가 있어 PrefixWait 동안 기다린다</summary>
        Pending,
        /// <summary>발동 (Fired 이벤트도 온다)</summary>
        Fired,
        /// <summary>틀림 — 버퍼를 비웠다</summary>
        WrongReset,
        /// <summary>틀림 — 관대한 모드라 맞게 넣은 칸은 그대로</summary>
        WrongKept,
        /// <summary>맞는 커맨드가 재사용 대기 중 (CoolingIndex)</summary>
        Cooling,
        /// <summary>입력 사이가 너무 길어 처음부터</summary>
        TimedOut,
        None,
    }

    public class ComboMatcher
    {
        readonly IReadOnlyList<ComboCommand> commands;
        readonly List<ComboDir> buffer = new();
        readonly List<ComboDir> scratch = new();
        readonly float[] readyAt;
        float lastInputAt;
        float pendingAt;

        /// <summary>다른 커맨드의 접두사인 커맨드를 완성했을 때 기다리는 시간. 0 = 완성 즉시 발동 (긴 쪽은 닿을 수 없다)</summary>
        public float PrefixWait = 0.45f;
        /// <summary>입력 사이 제한 시간. 0 = 끔</summary>
        public float StepTimeout = 1.5f;
        /// <summary>관대한 모드: 틀린 입력은 버리고 그 칸만 다시 받는다</summary>
        public bool Lenient;

        public event Action<int> Fired;

        public IReadOnlyList<ComboDir> Buffer => buffer;
        public int Pending { get; private set; } = -1;
        public int CoolingIndex { get; private set; } = -1;
        /// <summary>마지막으로 틀린 칸 (0부터). 기다리던 커맨드가 먼저 발동했으면 새 시퀀스의 칸 — Push 뒤에 읽는다</summary>
        public int WrongSlot { get; private set; } = -1;
        public int Count => commands.Count;

        public ComboMatcher(IReadOnlyList<ComboCommand> commands)
        {
            this.commands = commands;
            readyAt = new float[commands.Count];
        }

        public bool IsReady(int i, float now) => now >= readyAt[i];
        public float CooldownLeft(int i, float now) => Mathf.Max(0f, readyAt[i] - now);
        public bool Matches(int i, IReadOnlyList<ComboDir> buf) => ComboCommandSet.StartsWith(commands[i].sequence, buf);
        /// <summary>지금 버퍼로 남은 후보 (재사용 대기 중인 것은 뺀다)</summary>
        public bool IsCandidate(int i, float now) => IsReady(i, now) && Matches(i, buffer);

        /// <summary>기다림 게이지 0~1</summary>
        public float PendingProgress(float now) => Pending < 0 || PrefixWait <= 0f ? 0f : Mathf.Clamp01((now - pendingAt) / PrefixWait);

        /// <summary>제한 시간 남은 비율 1 → 0 (버퍼가 비었거나 꺼져 있으면 1)</summary>
        public float TimeLeft01(float now) =>
            StepTimeout <= 0f || buffer.Count == 0 || Pending >= 0 ? 1f : Mathf.Clamp01(1f - (now - lastInputAt) / StepTimeout);

        public void Clear()
        {
            buffer.Clear();
            Pending = -1;
        }

        public void ResetCooldowns() => Array.Clear(readyAt, 0, readyAt.Length);

        void Fire(int i, float now)
        {
            readyAt[i] = now + commands[i].cooldown;
            Clear();
            Fired?.Invoke(i);
        }

        /// <summary>방향 하나를 넣는다. 결과에 맞춰 화면을 고친다</summary>
        public StepResult Push(ComboDir d, float now)
        {
            scratch.Clear();
            scratch.AddRange(buffer);
            scratch.Add(d);
            bool any = false;
            for (int i = 0; i < commands.Count; i++)
                if (IsReady(i, now) && Matches(i, scratch)) { any = true; break; }

            if (!any)
            {
                if (Pending >= 0)
                {
                    // 기다리던 커맨드를 이어 갈 수 없는 입력: 그 커맨드를 발동하고, 이 입력은 새 시퀀스의 첫 칸으로 (입력 버퍼)
                    Fire(Pending, now);
                    return Push(d, now);
                }
                WrongSlot = buffer.Count;
                CoolingIndex = -1;
                for (int i = 0; i < commands.Count; i++)
                    if (!IsReady(i, now) && Matches(i, scratch)) CoolingIndex = i;
                if (Lenient && buffer.Count > 0)
                {
                    lastInputAt = now;   // 그 칸만 다시 — 제한 시간도 다시 채운다
                    return CoolingIndex >= 0 ? StepResult.Cooling : StepResult.WrongKept;
                }
                Clear();
                return CoolingIndex >= 0 ? StepResult.Cooling : StepResult.WrongReset;
            }

            buffer.Add(d);
            lastInputAt = now;
            Pending = -1;
            int exact = -1;
            bool longer = false;
            for (int i = 0; i < commands.Count; i++)
            {
                if (!IsCandidate(i, now)) continue;
                if (commands[i].sequence.Length == buffer.Count) exact = i;
                else longer = true;
            }
            if (exact < 0) return StepResult.Progress;
            if (longer && PrefixWait > 0f)
            {
                Pending = exact;
                pendingAt = now;
                return StepResult.Pending;
            }
            Fire(exact, now);
            return StepResult.Fired;
        }

        /// <summary>매 프레임: 기다림이 끝나면 발동, 입력 사이가 너무 길면 처음부터</summary>
        public StepResult Tick(float now)
        {
            if (Pending >= 0)
            {
                if (now - pendingAt < PrefixWait) return StepResult.None;
                Fire(Pending, now);
                return StepResult.Fired;
            }
            if (buffer.Count > 0 && StepTimeout > 0f && now - lastInputAt >= StepTimeout)
            {
                Clear();
                return StepResult.TimedOut;
            }
            return StepResult.None;
        }

        /// <summary>목록을 닫을 때. fire = 떼기 · 토글 닫기('더 넣지 않겠다')면 완성해서 기다리던 커맨드를 발동, 취소 · 포커스 잃음 · 꺼짐이면 버린다</summary>
        public void Close(float now, bool fire)
        {
            if (fire && Pending >= 0) Fire(Pending, now);
            Clear();
        }
    }

    /// <summary>
    /// Vector2 → 4방향. 2D Vector 합성(Digital Normalized)은 8방향을 주므로 대각선을 4방향으로 줄인다.
    /// - 세기가 release 아래: 중립 (다음 입력을 받을 준비). 중립에서는 press 를 넘어야 눌림 — 그 사이(히스테리시스)에서 스틱이 떨려도 두 번 들어가지 않는다
    /// - 한 축이 뚜렷함: 중립에서 왔거나, 스틱을 돌려 다른 축으로 왔으면 그 방향
    /// - 대각선: 한 축에서 왔으면 '새로 더해진 축' (↓ 를 누른 채 → 를 누르는 키보드 겹침)
    /// - 대각선에서 한 축으로 돌아오는 것은 새 입력이 아니다 → 한 번 누르면 한 칸
    /// </summary>
    public class DirectionQuantizer
    {
        ComboDir? last;
        bool wasDiagonal;
        bool engaged;
        bool waitNeutral;

        /// <summary>두 축 차이 ÷ 세기가 이보다 작으면 대각선</summary>
        public float diagonalBand = 0.2f;

        /// <param name="untilNeutral">true 면 한 번 중립으로 돌아올 때까지 받지 않는다 (열기 전부터 눌려 있던 이동 키가 첫 칸으로 들어가지 않게)</param>
        public void Reset(bool untilNeutral = false)
        {
            last = null;
            wasDiagonal = false;
            engaged = false;
            waitNeutral = untilNeutral;
        }

        /// <param name="press">중립에서 이 세기를 넘으면 눌림</param>
        /// <param name="release">눌린 뒤 이 세기 아래로 내려와야 중립 (press 보다 작게)</param>
        public bool Feed(Vector2 v, float press, float release, out ComboDir dir)
        {
            dir = default;
            float mag = v.magnitude;
            if (mag < release)
            {
                Reset();
                return false;
            }
            if (!engaged && mag < press) return false;
            engaged = true;
            if (waitNeutral) return false;
            float ax = Mathf.Abs(v.x), ay = Mathf.Abs(v.y);
            bool diagonal = Mathf.Abs(ax - ay) / mag < diagonalBand;
            ComboDir? emit = null;
            if (diagonal)
            {
                // 처음부터 대각선(두 키를 같은 프레임에)이면 어느 쪽인지 모른다 — 한 축이 떨어질 때까지 기다린다
                if (!wasDiagonal && last.HasValue) emit = IsVertical(last.Value) ? Horizontal(v.x) : Vertical(v.y);
            }
            else
            {
                ComboDir d = ax > ay ? Horizontal(v.x) : Vertical(v.y);
                if (!last.HasValue || (!wasDiagonal && d != last.Value)) emit = d;
                else if (wasDiagonal) last = d;   // 대각선에서 돌아옴: 기준만 바꾼다
            }
            wasDiagonal = diagonal;
            if (!emit.HasValue) return false;
            last = emit;
            dir = emit.Value;
            return true;
        }

        static bool IsVertical(ComboDir d) => d == ComboDir.Up || d == ComboDir.Down;
        static ComboDir Horizontal(float x) => x > 0f ? ComboDir.Right : ComboDir.Left;
        static ComboDir Vertical(float y) => y > 0f ? ComboDir.Up : ComboDir.Down;   // Input System 은 y 가 위로 +
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
