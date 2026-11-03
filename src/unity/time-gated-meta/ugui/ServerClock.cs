// 서버 시각 + 하루 경계 (순수 C#) — 기기 시계(DateTime.Now · UtcNow)를 믿지 않는다.
//   서버 시각 = 접속 때 받은 서버 UTC + (지금 단조 시계 − 받은 순간의 단조 시계)
// 단조 시계는 Time.realtimeSinceStartupAsDouble — 사용자가 기기 시계를 바꿔도 따라가지 않는다.
// battle-pass-track 의 ServerClock 과 같은 방식이다 (표본끼리 파일을 공유하지 않아 이 표본 안에 다시 둔다).
using System;
using System.Collections;
using UnityEngine;

namespace UIGallery.TimeGatedMeta
{
    public enum ClockSource { Server, Device }

    public class ServerClock
    {
        DateTime syncedUtc;
        double syncedAt;

        public bool IsSynced { get; private set; }

        public void Sync(DateTime serverUtc, double monotonicNow)
        {
            syncedUtc = DateTime.SpecifyKind(serverUtc, DateTimeKind.Utc);
            syncedAt = monotonicNow;
            IsSynced = true;
        }

        /// <summary>앱이 백그라운드에서 돌아오면 부른다. 그동안 단조 시계가 흘렀는지 플랫폼마다 달라 다시 받을 때까지 '동기화 중'</summary>
        public void Invalidate() => IsSynced = false;

        public DateTime UtcNow(double monotonicNow) => syncedUtc.AddSeconds(monotonicNow - syncedAt);

        /* ───── 하루 경계: 서버 지역 시간(tzHours)의 초기화 시각(resetHour). 자정이 아니다 ───── */

        /// <summary>하루 번호. 11/03 04:59 와 11/03 05:00 은 resetHour 5 에서 다른 날이다</summary>
        public static int DayIndex(DateTime utc, int resetHour, int tzHours = 9) =>
            (int)Math.Floor((utc.AddHours(tzHours - resetHour) - DateTime.UnixEpoch).TotalDays);

        public static DateTime NextReset(DateTime utc, int resetHour, int tzHours = 9) =>
            DateTime.UnixEpoch.AddDays(DayIndex(utc, resetHour, tzHours) + 1).AddHours(resetHour - tzHours);

        // 날짜 글자는 문화권과 무관하게 직접 만든다 (ToString("M/d") 는 ko-KR 에서 "11-3")
        /// <summary>하루 번호 → "11/3"</summary>
        public static string DayLabel(int day, int resetHour)
        {
            DateTime d = DateTime.UnixEpoch.AddDays(day).AddHours(resetHour);
            return $"{d.Month}/{d.Day}";
        }

        /// <summary>서버 지역 시각 "11.03 13:47:27"</summary>
        public static string Clock(DateTime utc, int tz)
        {
            DateTime d = utc.AddHours(tz);
            return $"{d.Month:00}.{d.Day:00} {d.Hour:00}:{d.Minute:00}:{d.Second:00}";
        }

        /// <summary>"04:12" · "1:23:00" · "1일 02:00:00"</summary>
        public static string Format(TimeSpan t)
        {
            if (t < TimeSpan.Zero) t = TimeSpan.Zero;
            t = TimeSpan.FromSeconds(Math.Ceiling(t.TotalSeconds));
            if (t.Days > 0) return $"{t.Days}일 {t.Hours:00}:{t.Minutes:00}:{t.Seconds:00}";
            return t.Hours > 0 ? $"{t.Hours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes:00}:{t.Seconds:00}";
        }
    }

    /// <summary>
    /// 가짜 서버 (실제로는 로그인 · 핑 응답의 서버 UTC). 처음 읽은 시각에서 단조 시계로만 흘러 기기 시계를 바꿔도 따라가지 않는다.
    /// Advance = '앱 끄고 n시간 뒤 켜기' 시험용 — 서버 시각만 앞당긴다.
    /// </summary>
    public static class FakeServer
    {
        static DateTime baseUtc;
        static double baseAt = -1;
        static double advancedHours;

        public static void Advance(double hours) => advancedHours += hours;

        public static DateTime Now
        {
            get
            {
                if (baseAt < 0)
                {
                    baseUtc = DateTime.UtcNow;
                    baseAt = Time.realtimeSinceStartupAsDouble;
                }
                return baseUtc.AddSeconds(Time.realtimeSinceStartupAsDouble - baseAt).AddHours(advancedHours);
            }
        }

        /// <summary>서버에 시각을 묻는다 (지연 흉내). 응답이 오면 onUtc(서버 UTC)</summary>
        public static IEnumerator FetchUtc(Action<DateTime> onUtc, float delaySeconds = 0.3f)
        {
            yield return new WaitForSecondsRealtime(delaySeconds);
            onUtc(Now);
        }
    }
}
