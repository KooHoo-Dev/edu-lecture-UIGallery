// 시험용 입력 (새 Input System 키보드). 에디터에서 몇 시간을 실제로 기다릴 수 없으니 시간을 흉내 낸다.
//   O : 앱 끄고 offlineHours 시간 뒤 켜기 — 가짜 서버 시각을 앞당기고 OnApplicationPause(false) 처럼 다시 동기화
//   M : 이틀 뒤 접속 (하루 놓침 — 연속 규칙이면 끊긴다)
//   C : 기기 시계 +1일 (clockSource = Server 면 아무 일도 없어야 정상, Device 면 출석이 다시 열린다)
//   B : 보급 보상 +30 연료 (최대치 초과)
//   T : 기준 시계 Server ↔ Device 전환 (나쁜 예 비교)
// 실제 기기에서는 앱을 백그라운드로 보냈다가 돌아오거나, 설정에서 시계를 바꿔 같은 것을 확인한다.
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.TimeGatedMeta
{
    public class TimeGatedDemo : MonoBehaviour
    {
        [SerializeField] TimeGatedScreen screen;
        [SerializeField] double offlineHours = 8;

        void OnEnable() => screen.Message += Log;
        void OnDisable() => screen.Message -= Log;

        void Log(string text) => Debug.Log($"[TimeGated] {text}");

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.oKey.wasPressedThisFrame) Offline(offlineHours);
            if (kb.mKey.wasPressedThisFrame) Offline(48);
            if (kb.cKey.wasPressedThisFrame)
            {
                screen.testSkewDays = (screen.testSkewDays + 1) % 4;
                screen.ForceRefresh();
                Log($"기기 시계 +{screen.testSkewDays}일 ({screen.clockSource} 기준)");
            }
            if (kb.bKey.wasPressedThisFrame) screen.AddFuel(30);
            if (kb.tKey.wasPressedThisFrame)
            {
                screen.clockSource = screen.clockSource == ClockSource.Server ? ClockSource.Device : ClockSource.Server;
                screen.ForceRefresh();
                Log($"기준 시계: {screen.clockSource}");
            }
        }

        void Offline(double hours)
        {
            FakeServer.Advance(hours);        // 서버의 실제 시간이 흐른 것
            screen.testOffsetHours += hours;  // 기기 시계도 같이 흐른 것 (Device 기준 비교용)
            screen.Resync();                  // = OnApplicationPause(false)
            Log($"앱 끄고 {hours}시간 뒤 켬 — 서버 시각을 다시 받아 계산");
        }
    }
}
