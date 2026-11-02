// 시험용 전투 진행 — 키보드로 다음 턴 · 속도 버프 · 둔화 · 행동 앞당김 · 끼어들기 · 처음부터.
// 실제 게임의 전투 관리자 자리다. 이벤트 전후 미리보기를 key 로 비교해 "몇 칸 움직였는지" 를 뷰에 알리고, 이유를 한 줄로 쓴다.
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.TurnOrderTimeline
{
    public class TurnOrderDemo : MonoBehaviour
    {
        [SerializeField] TimelineView timeline;
        [Tooltip("무슨 일이 생겼는지 한 줄")]
        [SerializeField] TextMeshProUGUI captionText;
        [SerializeField] float captionSeconds = 3.2f;

        [SerializeField]
        List<UnitSetup> units = new()
        {
            new UnitSetup { id = "harin", displayName = "하린", role = UnitRole.Ally, speed = 105f },
            new UnitSetup { id = "doyun", displayName = "도윤", role = UnitRole.Ally, speed = 96f },
            new UnitSetup { id = "sera", displayName = "세라", role = UnitRole.Ally, speed = 160f },
            new UnitSetup { id = "droneA", displayName = "잔해 드론 A", role = UnitRole.Enemy, speed = 88f },
            new UnitSetup { id = "droneB", displayName = "잔해 드론 B", role = UnitRole.Enemy, speed = 132f },
        };

        [Header("효과 크기")]
        [SerializeField] float hastePct = 0.4f;
        [SerializeField] float slowPct = 0.3f;
        [SerializeField] float advancePct = 0.5f;
        [SerializeField] int modTurns = 2;

        [Header("바뀐 칸 알림 색 (글자와 함께 쓴다)")]
        [SerializeField] Color upColor = new(0.37f, 0.9f, 0.63f);
        [SerializeField] Color downColor = new(1f, 0.62f, 0.54f);
        [SerializeField] Color newColor = new(0.77f, 0.61f, 1f);

        TurnQueue queue;
        readonly List<TurnEntry> before = new();
        readonly List<TurnEntry> after = new();
        float captionLeft;

        public TurnQueue Queue => queue;

        void Start()
        {
            queue = new TurnQueue(units);
            timeline.Bind(queue);
            Caption($"{Name(queue.ActiveUnit)} 차례 — Enter 다음 턴 · 1 버프 · 2 둔화 · 3 앞당김 · 4 끼어들기 · R 처음부터");
        }

        void Update()
        {
            Keyboard k = Keyboard.current;
            if (k != null)
            {
                if (k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame) NextTurn();
                else if (k.digit1Key.wasPressedThisFrame) Haste();
                else if (k.digit2Key.wasPressedThisFrame) Slow();
                else if (k.digit3Key.wasPressedThisFrame) Advance();
                else if (k.digit4Key.wasPressedThisFrame) Interrupt();
                else if (k.rKey.wasPressedThisFrame) ResetBattle();
            }
            if (captionLeft > 0f && (captionLeft -= Time.deltaTime) <= 0f && captionText != null) captionText.text = "";
        }

        public void NextTurn()
        {
            string ended = Name(queue.ActiveUnit);
            queue.EndTurn();
            Caption($"{ended} 행동 끝 → {Name(queue.ActiveUnit)}{(queue.ActiveIsExtra ? " 끼어들기" : "")} 차례");
        }

        public void Haste()
        {
            int u = LatestAlly();
            Snapshot();
            queue.SetSpeedMod(u, hastePct, modTurns);
            Report(u, $"{Name(u)} 속도 +{hastePct * 100f:0}% ({units[u].speed:0} → {queue.Units[u].speed:0}) · {modTurns}턴");
        }

        public void Slow()
        {
            int u = EarliestEnemy();
            Snapshot();
            queue.SetSpeedMod(u, -slowPct, modTurns);
            Report(u, $"{Name(u)} 둔화 −{slowPct * 100f:0}% ({units[u].speed:0} → {queue.Units[u].speed:0}) · {modTurns}턴");
        }

        public void Advance()
        {
            int u = LatestAlly();
            Snapshot();
            queue.ShiftAction(u, advancePct);
            Report(u, $"{Name(u)} 행동 {advancePct * 100f:0}% 앞당김 — 다음 한 번만");
        }

        public void Interrupt()
        {
            int who = -1;
            foreach (string id in new[] { "harin", "sera", "doyun" })
            {
                int i = units.FindIndex(x => x.id == id);
                if (i >= 0 && !queue.HasPendingExtra(i)) { who = i; break; }
            }
            if (who < 0 || queue.ExtraCount >= 2)
            {
                Caption("끼어들기는 두 개까지 — 먼저 다음 턴을 진행");
                return;
            }
            Snapshot();
            queue.AddExtra(who);
            queue.Preview(timeline.PreviewCount, after);
            foreach (TurnEntry e in after)
                if (e.kind == EntryKind.Extra && !Contains(before, e.key)) timeline.Flag(e.key, "새로", newColor);
            Caption($"{Name(who)} 끼어들기 (추가 행동) — 지금 차례가 끝나면 바로. 정규 차례는 그대로");
        }

        public void ResetBattle()
        {
            queue.Reset();
            Caption("전투 처음부터 — 모두 같은 거리(10000)에서 출발");
        }

        /* ───── 바뀐 칸 알림 ───── */

        void Snapshot() => queue.Preview(timeline.PreviewCount, before);

        /// <summary>전후 미리보기를 key 로 비교해 대상 유닛 칸마다 "n칸 앞 · n칸 뒤 · 추가" 를 띄운다</summary>
        void Report(int unit, string text)
        {
            queue.Preview(timeline.PreviewCount, after);
            int bi = TurnQueue.FirstIndex(before, unit), ai = TurnQueue.FirstIndex(after, unit);
            if (bi > 0 && ai > 0 && bi != ai) text += $" — 다음 차례 {bi}번째 → {ai}번째";
            else if (bi > 0 && ai == bi) text += $" — 순서는 그대로, 행동값 {before[bi].actionValue:0} → {after[ai].actionValue:0}";
            for (int i = 0; i < after.Count; i++)
            {
                TurnEntry e = after[i];
                if (e.unit != unit || e.kind != EntryKind.Turn) continue;
                int was = IndexOf(before, e.key);
                if (was < 0) timeline.Flag(e.key, "추가", newColor);
                else if (was > i) timeline.Flag(e.key, $"{was - i}칸 앞", upColor);
                else if (was < i) timeline.Flag(e.key, $"{i - was}칸 뒤", downColor);
            }
            Caption(text);
        }

        /// <summary>다음 정규 차례가 가장 늦은 아군 (지금 행동 중인 유닛은 뺀다)</summary>
        int LatestAlly()
        {
            queue.Preview(timeline.PreviewCount, before);
            int best = -1, bestIdx = -2;
            for (int u = 0; u < units.Count; u++)
            {
                if (units[u].role != UnitRole.Ally || u == queue.ActiveUnit) continue;
                int i = TurnQueue.FirstIndex(before, u);
                if (i < 0) i = int.MaxValue;   // 미리보기 밖 = 가장 늦다
                if (i > bestIdx) { best = u; bestIdx = i; }
            }
            return best < 0 ? 0 : best;
        }

        int EarliestEnemy()
        {
            queue.Preview(timeline.PreviewCount, before);
            int best = -1, bestIdx = int.MaxValue;
            for (int u = 0; u < units.Count; u++)
            {
                if (units[u].role != UnitRole.Enemy || u == queue.ActiveUnit) continue;
                int i = TurnQueue.FirstIndex(before, u);
                if (i >= 0 && i < bestIdx) { best = u; bestIdx = i; }
            }
            return best < 0 ? units.FindIndex(x => x.role == UnitRole.Enemy) : best;
        }

        static int IndexOf(List<TurnEntry> list, string key)
        {
            for (int i = 0; i < list.Count; i++)
                if (list[i].key == key) return i;
            return -1;
        }

        static bool Contains(List<TurnEntry> list, string key) => IndexOf(list, key) >= 0;

        string Name(int u) => u >= 0 && u < units.Count ? units[u].displayName : "";

        void Caption(string text)
        {
            if (captionText == null) return;
            captionText.text = text;
            captionLeft = captionSeconds;
        }
    }
}
