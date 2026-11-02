// UI Toolkit 판 턴 순서 타임라인 — 모델(TurnQueue · UnitSetup · TurnEntry · SpacingMode · BarSide)은 UGUI 폴더 것을 그대로 쓴다.
// 칸은 Portrait.uxml 을 복제해 position: absolute 로 두고, 매 프레임 style.translate · style.scale 만 바꿔 보간한다.
// 키보드: Enter 다음 턴 · 1 버프 · 2 둔화 · 3 앞당김 · 4 끼어들기 · R 처음부터 (시험용 입력이 이 스크립트에 함께 있다)
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.TurnOrderTimeline
{
    [RequireComponent(typeof(UIDocument))]
    public class TurnOrderUITK : MonoBehaviour
    {
        class Slot
        {
            public VisualElement el;
            public Label name, value, badge;
            public Vector2 from, to, cur;
            public float fromS = 1f, toS = 1f, curS = 1f;
            public float fromA = 1f, toA = 1f, curA = 1f;
            public float t, dur, badgeLeft;
            public bool leaving;
        }

        [SerializeField] VisualTreeAsset portraitTemplate;
        [SerializeField]
        List<UnitSetup> units = new()
        {
            new UnitSetup { id = "harin", displayName = "하린", role = UnitRole.Ally, speed = 105f },
            new UnitSetup { id = "doyun", displayName = "도윤", role = UnitRole.Ally, speed = 96f },
            new UnitSetup { id = "sera", displayName = "세라", role = UnitRole.Ally, speed = 160f },
            new UnitSetup { id = "droneA", displayName = "잔해 드론 A", role = UnitRole.Enemy, speed = 88f },
            new UnitSetup { id = "droneB", displayName = "잔해 드론 B", role = UnitRole.Enemy, speed = 132f },
        };

        [Header("조절 값")]
        [SerializeField] int previewCount = 8;
        [SerializeField] bool showActionValue = true;
        [Tooltip("순서가 바뀔 때 새 자리로 미끄러지는 시간(초). 0 이면 순간이동")]
        [SerializeField] float slideSeconds = 0.35f;
        [SerializeField] SpacingMode spacingMode = SpacingMode.Slots;
        [SerializeField] BarSide barSide = BarSide.Left;

        [Header("배치 (#timeline 왼쪽 위 기준, y 는 아래로 +)")]
        [SerializeField] Vector2 activePosLeft = new(20f, 16f);
        [SerializeField] Vector2 activePosTop = new(20f, 14f);
        [SerializeField] float startLeft = 172f;
        [SerializeField] float startTop = 226f;
        [SerializeField] float pitchLeft = 84f;
        [SerializeField] float pitchTop = 150f;
        [SerializeField] float minGapLeft = 70f;
        [SerializeField] float minGapTop = 112f;
        [SerializeField] float spanLeft = 760f;
        [SerializeField] float spanTop = 1500f;
        [SerializeField] float activeScale = 1.35f;
        [SerializeField] float enterOffset = 90f;

        [Header("효과 크기")]
        [SerializeField] float hastePct = 0.4f;
        [SerializeField] float slowPct = 0.3f;
        [SerializeField] float advancePct = 0.5f;
        [SerializeField] int modTurns = 2;
        [SerializeField] float badgeSeconds = 2.2f;
        [SerializeField] float captionSeconds = 3.2f;
        [SerializeField] Color upColor = new(0.37f, 0.9f, 0.63f);
        [SerializeField] Color downColor = new(1f, 0.62f, 0.54f);
        [SerializeField] Color newColor = new(0.77f, 0.61f, 1f);

        TurnQueue queue;
        VisualElement timeline;
        Label caption;
        float captionLeft;
        string lastActiveKey = "";
        readonly Dictionary<string, Slot> slots = new();
        readonly List<Slot> leaving = new();
        readonly List<TurnEntry> entries = new();
        readonly List<TurnEntry> before = new();
        readonly HashSet<string> seen = new();
        readonly List<string> gone = new();

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            timeline = root.Q("timeline");
            caption = root.Q<Label>("caption");
            queue = new TurnQueue(units);
            queue.Changed += Rebuild;
            Rebuild(true);
        }

        void OnDisable()
        {
            if (queue != null) queue.Changed -= Rebuild;
            foreach (Slot s in slots.Values) s.el.RemoveFromHierarchy();
            foreach (Slot s in leaving) s.el.RemoveFromHierarchy();
            slots.Clear();
            leaving.Clear();
        }

        void Rebuild() => Rebuild(false);

        // 플레이 중에 인스펙터 값(바 위치 · 간격 · 칸 수)을 바꾸면 바로 다시 배치 — UGUI 판과 같다
        void OnValidate()
        {
            if (Application.isPlaying && queue != null && timeline != null) Rebuild(false);
        }

        void Rebuild(bool snap)
        {
            bool left = barSide == BarSide.Left;
            timeline.EnableInClassList("timeline--left", left);
            timeline.EnableInClassList("timeline--top", !left);
            timeline.EnableInClassList("timeline--time", spacingMode == SpacingMode.Time);
            caption.EnableInClassList("caption--top", !left);

            queue.Preview(previewCount, entries);
            float lastAv = Mathf.Max(1f, entries[entries.Count - 1].actionValue);
            float dur = snap ? 0f : slideSeconds;
            seen.Clear();
            for (int i = 0; i < entries.Count; i++)
            {
                TurnEntry e = entries[i];
                seen.Add(e.key);
                Vector2 pos = SlotPosition(i, e.actionValue, entries.Count - 1, lastAv);
                float scale = i == 0 ? activeScale : 1f;
                if (!slots.TryGetValue(e.key, out Slot s))
                {
                    s = CreateSlot();
                    Vector2 off = e.kind == EntryKind.Extra ? (left ? new Vector2(-enterOffset, 0f) : new Vector2(0f, -enterOffset)) : (left ? new Vector2(0f, enterOffset) : new Vector2(enterOffset, 0f));
                    s.cur = pos + off;
                    s.curS = scale;
                    s.curA = 0f;
                    slots.Add(e.key, s);
                    MoveTo(s, pos, scale, 1f, dur);
                }
                else if (s.to != pos || !Mathf.Approximately(s.toS, scale)) MoveTo(s, pos, scale, 1f, dur);   // 같은 key = 같은 요소 → 지금 자리에서 새 자리로
                Fill(s, e, i == 0);
                s.el.BringToFront();
            }
            gone.Clear();
            foreach (KeyValuePair<string, Slot> kv in slots)
                if (!seen.Contains(kv.Key)) gone.Add(kv.Key);
            foreach (string key in gone)
            {
                Slot s = slots[key];
                slots.Remove(key);
                bool done = key == lastActiveKey;
                Vector2 off = left ? new Vector2(0f, done ? -enterOffset : enterOffset) : new Vector2(done ? -enterOffset : enterOffset, 0f);
                s.leaving = true;
                MoveTo(s, s.cur + off, s.curS, 0f, dur);
                leaving.Add(s);
            }
            lastActiveKey = entries[0].key;
        }

        Slot CreateSlot()
        {
            // TemplateContainer 째 넣으면 flex 흐름에 들어가 아래로 쌓인다 — .portrait 만 꺼내 넣는다
            // (스타일은 조상인 TurnOrder.uxml 의 TurnOrder.uss 가 그대로 맞는다)
            VisualElement el = portraitTemplate.Instantiate().Q("portrait");
            timeline.Add(el);
            return new Slot
            {
                el = el,
                name = el.Q<Label>(className: "portrait__name"),
                value = el.Q<Label>(className: "portrait__value"),
                badge = el.Q<Label>(className: "portrait__badge"),
            };
        }

        void Fill(Slot s, TurnEntry e, bool active)
        {
            TurnQueue.Unit u = queue.Units[e.unit];
            bool ally = u.setup.role == UnitRole.Ally;
            s.el.EnableInClassList("portrait--ally", ally);
            s.el.EnableInClassList("portrait--enemy", !ally);
            s.el.EnableInClassList("portrait--active", active);
            s.el.EnableInClassList("portrait--extra", e.extra);
            s.name.text = u.setup.displayName;
            s.value.text = active ? "행동 중" : e.extra ? "끼어들기" : showActionValue ? Mathf.RoundToInt(e.actionValue).ToString() : "";
        }

        /// <summary>칸 i 의 자리. Slots = i × 간격, Time = i × 최소 간격 + 행동값 × k</summary>
        Vector2 SlotPosition(int i, float actionValue, int n, float lastAv)
        {
            bool left = barSide == BarSide.Left;
            if (i == 0) return left ? activePosLeft : activePosTop;
            int j = i - 1;
            float along;
            if (spacingMode == SpacingMode.Time)
            {
                float min = left ? minGapLeft : minGapTop;
                float span = left ? spanLeft : spanTop;
                along = j * min + actionValue * (Mathf.Max(0f, span - (n - 1) * min) / lastAv);
            }
            else along = j * (left ? pitchLeft : pitchTop);
            return left ? new Vector2(activePosLeft.x, startLeft + along) : new Vector2(startTop + along, activePosTop.y + 12f);
        }

        static void MoveTo(Slot s, Vector2 pos, float scale, float alpha, float seconds)
        {
            s.from = s.cur;
            s.fromS = s.curS;
            s.fromA = s.curA;
            s.to = pos;
            s.toS = scale;
            s.toA = alpha;
            s.t = 0f;
            s.dur = seconds;
            if (seconds <= 0f) Step(s, 0f);
        }

        /// <summary>보간 한 프레임. 나가는 칸이 다 사라지면 false</summary>
        static bool Step(Slot s, float dt)
        {
            s.t += dt;
            float k = s.dur > 0f ? Mathf.Clamp01(s.t / s.dur) : 1f;
            float e = 1f - Mathf.Pow(1f - k, 3f);   // ease-out cubic
            s.cur = Vector2.LerpUnclamped(s.from, s.to, e);
            s.curS = Mathf.LerpUnclamped(s.fromS, s.toS, e);
            s.curA = Mathf.LerpUnclamped(s.fromA, s.toA, e);
            // left/top 대신 translate · scale — 레이아웃을 다시 계산하지 않는다
            s.el.style.translate = new Translate(s.cur.x, s.cur.y);
            s.el.style.scale = new Scale(new Vector2(s.curS, s.curS));
            s.el.style.opacity = s.curA;
            if (s.badgeLeft > 0f && (s.badgeLeft -= dt) <= 0f) s.badge.RemoveFromClassList("portrait__badge--on");
            return !(s.leaving && k >= 1f);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            foreach (Slot s in slots.Values)
            {
                // 다 움직인 칸은 스타일을 다시 쓰지 않는다 (알림 시간만 센다)
                if (s.t >= s.dur && s.badgeLeft <= 0f) continue;
                Step(s, dt);
            }
            for (int i = leaving.Count - 1; i >= 0; i--)
            {
                if (Step(leaving[i], dt)) continue;
                leaving[i].el.RemoveFromHierarchy();
                leaving.RemoveAt(i);
            }
            if (captionLeft > 0f && (captionLeft -= dt) <= 0f) caption.RemoveFromClassList("caption--on");
            ReadInput();
        }

        /* ───── 시험용 입력 · 이벤트 ───── */

        void ReadInput()
        {
            Keyboard k = Keyboard.current;
            if (k == null) return;
            if (k.enterKey.wasPressedThisFrame)
            {
                string ended = Name(queue.ActiveUnit);
                queue.EndTurn();
                Caption($"{ended} 행동 끝 → {Name(queue.ActiveUnit)}{(queue.ActiveIsExtra ? " 끼어들기" : "")} 차례");
            }
            else if (k.digit1Key.wasPressedThisFrame) ChangeSpeed(Pick(UnitRole.Ally, latest: true), hastePct);
            else if (k.digit2Key.wasPressedThisFrame) ChangeSpeed(Pick(UnitRole.Enemy, latest: false), -slowPct);
            else if (k.digit3Key.wasPressedThisFrame)
            {
                int u = Pick(UnitRole.Ally, latest: true);
                queue.Preview(previewCount, before);
                queue.ShiftAction(u, advancePct);
                Report(u, $"{Name(u)} 행동 {advancePct * 100f:0}% 앞당김 — 다음 한 번만");
            }
            else if (k.digit4Key.wasPressedThisFrame)
            {
                // 웹 · UGUI 판과 같은 순서: 하린 → 세라 → 도윤
                int who = -1;
                foreach (string id in new[] { "harin", "sera", "doyun" })
                {
                    int i = units.FindIndex(x => x.id == id);
                    if (i >= 0 && !queue.HasPendingExtra(i)) { who = i; break; }
                }
                if (who < 0 || queue.ExtraCount >= 2) Caption("끼어들기는 두 개까지 — 먼저 다음 턴을 진행");
                else
                {
                    queue.Preview(previewCount, before);
                    queue.AddExtra(who);   // Changed → Rebuild 가 entries 를 새로 채운다
                    foreach (TurnEntry e in entries)
                        if (e.kind == EntryKind.Extra && before.FindIndex(b => b.key == e.key) < 0 && slots.TryGetValue(e.key, out Slot s)) Flag(s, "새로", newColor);
                    Caption($"{Name(who)} 끼어들기 (추가 행동) — 지금 차례가 끝나면 바로");
                }
            }
            else if (k.rKey.wasPressedThisFrame)
            {
                queue.Reset();
                Caption("전투 처음부터 — 모두 같은 거리(10000)에서 출발");
            }
        }

        void ChangeSpeed(int u, float pct)
        {
            queue.Preview(previewCount, before);
            queue.SetSpeedMod(u, pct, modTurns);
            string what = pct > 0f ? $"속도 +{pct * 100f:0}%" : $"둔화 −{-pct * 100f:0}%";
            Report(u, $"{Name(u)} {what} ({units[u].speed:0} → {queue.Units[u].speed:0}) · {modTurns}턴");
        }

        /// <summary>전후 미리보기를 key 로 비교해 대상 유닛 칸마다 "n칸 앞 · n칸 뒤 · 추가"</summary>
        void Report(int unit, string text)
        {
            int bi = TurnQueue.FirstIndex(before, unit), ai = TurnQueue.FirstIndex(entries, unit);
            if (bi > 0 && ai > 0 && bi != ai) text += $" — 다음 차례 {bi}번째 → {ai}번째";
            else if (bi > 0 && ai == bi) text += $" — 순서는 그대로, 행동값 {before[bi].actionValue:0} → {entries[ai].actionValue:0}";
            for (int i = 0; i < entries.Count; i++)
            {
                TurnEntry e = entries[i];
                if (e.unit != unit || e.kind != EntryKind.Turn || !slots.TryGetValue(e.key, out Slot s)) continue;
                int was = before.FindIndex(b => b.key == e.key);
                if (was < 0) Flag(s, "추가", newColor);
                else if (was > i) Flag(s, $"{was - i}칸 앞", upColor);
                else if (was < i) Flag(s, $"{i - was}칸 뒤", downColor);
            }
            Caption(text);
        }

        /// <summary>latest = 다음 차례가 가장 늦은 유닛, 아니면 가장 이른 유닛 (지금 행동 중인 유닛은 뺀다)</summary>
        int Pick(UnitRole role, bool latest)
        {
            queue.Preview(previewCount, before);
            int best = -1, bestIdx = latest ? -2 : int.MaxValue;
            for (int u = 0; u < units.Count; u++)
            {
                if (units[u].role != role || u == queue.ActiveUnit) continue;
                int i = TurnQueue.FirstIndex(before, u);
                if (i < 0) i = int.MaxValue;
                if (latest ? i > bestIdx : i < bestIdx) { best = u; bestIdx = i; }
            }
            return best < 0 ? units.FindIndex(x => x.role == role) : best;
        }

        void Flag(Slot s, string text, Color color)
        {
            s.badge.text = text;
            s.badge.style.backgroundColor = color;
            s.badge.AddToClassList("portrait__badge--on");
            s.badgeLeft = badgeSeconds;
        }

        void Caption(string text)
        {
            caption.text = text;
            caption.AddToClassList("caption--on");
            captionLeft = captionSeconds;
        }

        string Name(int u) => u >= 0 && u < units.Count ? units[u].displayName : "";
    }
}
