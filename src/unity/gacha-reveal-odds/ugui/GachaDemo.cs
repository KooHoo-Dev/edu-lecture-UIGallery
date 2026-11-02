// 시험용 입력 (새 Input System) — 1: 1회 · 0: 10회 · Enter: 다음 장 · Esc: 건너뛰기 · F9: 1,000회 시뮬레이션(콘솔에 표시 vs 실제).
// 시뮬레이션은 저장하지 않는 별도 GachaServer 로 돌려 진짜 천장 카운터를 건드리지 않는다. 추첨 함수와 표는 같은 것.
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.GachaRevealOdds
{
    public class GachaDemo : MonoBehaviour
    {
        [SerializeField] GachaRevealPanel panel;
        [SerializeField] int simulateCount = 1000;

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) panel.Pull(1, Time.unscaledTime);
            if (kb.digit0Key.wasPressedThisFrame) panel.Pull(10, Time.unscaledTime);
            if (kb.enterKey.wasPressedThisFrame && panel.Busy) panel.Advance();
            if (kb.escapeKey.wasPressedThisFrame && panel.Busy) panel.Skip();
            if (kb.f9Key.wasPressedThisFrame) Simulate();
        }

        void Simulate()
        {
            GachaTable table = panel.Table;
            var sim = new GachaServer(false);
            PullResult r = sim.Roll(table, simulateCount);
            var counts = new int[3];
            foreach (int i in r.items) counts[(int)table.items[i].grade]++;

            var sb = new StringBuilder($"시뮬레이션 {simulateCount}회 — 표시 vs 실제\n");
            for (int g = 0; g < 3; g++)
            {
                // 천장(보장형)이 영웅을 늘린 만큼 나머지 등급이 줄어든다 — 표시도 같은 표에서 계산
                float hero = table.ConsolidatedHeroPercent();
                float rest = (100f - hero) / Mathf.Max(0.0001f, 100f - table.heroRatePct);
                float shown = g == 0 ? hero : table.GradePercent((Grade)g) * rest;
                sb.AppendLine($"{GachaTable.GradeNames[g]}: 표시 {shown:0.00}% · 실제 {100f * counts[g] / simulateCount:0.00}%");
            }
            Debug.Log(sb.ToString());
        }
    }
}
