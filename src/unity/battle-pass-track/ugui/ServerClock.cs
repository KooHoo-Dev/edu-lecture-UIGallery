// 서버 시각 (순수 C#) — 기기 시계(DateTime.Now · UtcNow)를 믿지 않는다.
// 접속할 때 서버가 준 UTC 시각을 한 번 받아 두고, 그 뒤로는 되돌아가지 않는 시계(단조 시계)로 흐른 시간만 더한다.
//   서버 시각 = 받은 서버 시각 + (지금 단조 시계 − 받은 순간의 단조 시계)
// 단조 시계는 Unity 에서 Time.realtimeSinceStartupAsDouble — 사용자가 기기 시계를 바꿔도, timeScale 이 0 이어도 흘러간다.
// 실제 게임에서는 로그인 응답 · 주기적인 핑으로 서버 시각을 다시 받아 오차를 줄인다 (이 예제는 서버 없이 시작 시각만 넣는다).
using System;
using System.Globalization;

namespace UIGallery.BattlePassTrack
{
    public enum ClockSource { Server, Device }

    public class ServerClock
    {
        DateTime syncedUtc;
        double syncedAt;
        bool synced;

        public bool IsSynced => synced;

        /// <summary>서버가 알려 준 UTC 시각과 그 순간의 단조 시계(초)를 기록한다</summary>
        public void Sync(DateTime serverUtc, double monotonicNow)
        {
            syncedUtc = DateTime.SpecifyKind(serverUtc, DateTimeKind.Utc);
            syncedAt = monotonicNow;
            synced = true;
        }

        /// <summary>
        /// 앱이 백그라운드 · 잠자기에서 돌아왔을 때 부른다. 그동안 단조 시계가 흘렀는지는 플랫폼마다 달라서
        /// 서버 시각을 다시 받을 때까지 '동기화 중' 으로 둔다 (OnApplicationPause(false))
        /// </summary>
        public void Invalidate() => synced = false;

        /// <summary>지금 서버 시각 (UTC). 동기화 전에는 의미가 없으니 IsSynced 를 먼저 본다</summary>
        public DateTime UtcNow(double monotonicNow) => syncedUtc.AddSeconds(monotonicNow - syncedAt);

        /// <summary>
        /// 남은 시간. source = Device 는 비교용 나쁜 예 — 기기 시계를 하루 앞당기면 하루가 줄어든다
        /// </summary>
        public bool TryRemaining(DateTime endUtc, double monotonicNow, ClockSource source, out TimeSpan left)
        {
            left = TimeSpan.Zero;
            if (source == ClockSource.Server && !synced) return false;   // 기기 시계로 슬쩍 대신하지 않는다 → 화면에 '동기화 중'
            DateTime now = source == ClockSource.Server ? UtcNow(monotonicNow) : DateTime.UtcNow;
            left = endUtc - now;
            if (left < TimeSpan.Zero) left = TimeSpan.Zero;
            return true;
        }

        /// <summary>"2026-11-02T05:47:27Z" 같은 UTC 문자열 (서버 응답 · 원격 설정 값). 실패하면 false — 기기 시계로 대신하지 않는다</summary>
        public static bool TryParseUtc(string s, out DateTime utc) =>
            DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out utc);

        /// <summary>"6일 04:12:33" / 하루 안쪽은 "04:12:33"</summary>
        public static string Format(TimeSpan t) =>
            t.Days > 0 ? $"{t.Days}일 {t.Hours:00}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Hours:00}:{t.Minutes:00}:{t.Seconds:00}";
    }
}
