using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.CardHandTargeting
{
    /// <summary>
    /// UI Toolkit 판 카드 손패 — CardData.cs · EnemyView.cs(IntentKind · EnemyIntent)를 UGUI 폴더에서 그대로 쓴다.
    /// - 카드는 Card.uxml 을 복제, position: absolute. 매 프레임 style.translate · rotate · scale 만 바꾼다 (left/top 은 레이아웃을 다시 계산)
    /// - 판정은 C# 수학: '부채꼴 제자리' + '올린 카드' 의 회전 사각형 안에 포인터가 있는가. 카드 요소는 모두 picking-mode Ignore
    /// - 끌기는 PointerManipulator 하나(HandPointer)로 — PointerDown 에서 CapturePointer, PointerUp 에서 ReleasePointer
    /// - 대상 판정은 panel.Pick(포인터) 로 .enemy 를 찾는다 (카드 · 화살표는 Ignore 라 가로막지 않는다)
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class CardHandUITK : MonoBehaviour
    {
        [Serializable]
        public class EnemySetup
        {
            public string name = "잔해 드론";
            public int maxHp = 32;
            public List<EnemyIntent> pattern = new();
        }

        class Enemy
        {
            public EnemySetup setup;
            public VisualElement el;
            public int hp, block, weak, str, step;
            public bool Alive => hp > 0;
            public EnemyIntent Intent => setup.pattern[step % setup.pattern.Count];
            public int Hit(int w)
            {
                if (Intent.kind != IntentKind.Attack) return 0;
                int b = Intent.value + str;
                return w > 0 ? Mathf.FloorToInt(b * 0.75f) : b;
            }
        }

        class CardItem
        {
            public CardData data;
            public VisualElement el;
            public Vector2 pos;
            public float rot, scale = 1f;
            public Vector2 restPos;
            public float restRot;
        }

        [SerializeField] VisualTreeAsset cardTemplate;
        [Tooltip("의도 아이콘 — 색만이 아니라 모양으로도 구분한다")]
        [SerializeField] Sprite attackIcon, blockIcon, buffIcon;
        [SerializeField] List<CardData> deck = new();
        [SerializeField] List<EnemySetup> enemySetups = new();
        [SerializeField] int handSize = 5;
        [SerializeField] int energyPerTurn = 3;

        [Header("부채꼴 (1920×1080 기준, y 는 아래로 +)")]
        [SerializeField] float fanDeg = 22f;
        [SerializeField] float radius = 2000f;
        [SerializeField] float maxStepDeg = 7f;
        [SerializeField] Vector2 handCenter = new(960f, 925f);
        [SerializeField] float hoverLift = 100f;
        [SerializeField] float neighborPush = 50f;
        [SerializeField] Vector2 aimPos = new(960f, 690f);
        [SerializeField] float playLineY = 640f;

        [Header("키보드 · 패드 (Input System 의 UI 액션)")]
        [SerializeField] InputActionReference navigate;
        [SerializeField] InputActionReference submit;
        [SerializeField] InputActionReference cancel;

        const float W = 200f, H = 280f;

        VisualElement battle, hand, energyBox;
        Label energyText;
        Button endTurn;
        ArrowElement arrow;
        HandPointer pointerInput;
        readonly List<Enemy> enemies = new();
        readonly List<CardItem> cards = new();
        readonly List<CardData> draw = new(), discard = new();
        CardItem hovered, held;
        Vector2 pointer, grab;
        Enemy aimed;
        bool kbHold, busy;
        int energy, kbTarget, lastNav;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            battle = root.Q("battle");
            hand = root.Q("hand");
            energyBox = root.Q("energy");
            energyText = root.Q<Label>("energy-text");
            endTurn = root.Q<Button>("end-turn");
            endTurn.clicked += OnEndTurn;
            endTurn.focusable = false;   // 포커스가 남으면 카드를 쓰려고 누른 Submit 이 턴 종료까지 누른다

            arrow = new ArrowElement();
            battle.Add(arrow);   // 맨 위에 그린다 (picking-mode Ignore)
            pointerInput = new HandPointer(this);
            battle.AddManipulator(pointerInput);

            enemies.Clear();
            for (int i = 0; i < enemySetups.Count; i++)
                enemies.Add(new Enemy { setup = enemySetups[i], el = root.Q($"enemy-{i}"), hp = enemySetups[i].maxHp });

            draw.Clear();
            discard.Clear();
            draw.AddRange(deck);
            Shuffle(draw);
            navigate?.action.Enable();
            submit?.action.Enable();
            cancel?.action.Enable();
            StartTurn();
        }

        void OnDisable()
        {
            // 다시 켜질 때(OnEnable) 화살표 · 조작기 · 카드가 겹쳐 생기지 않게 모두 정리
            if (endTurn != null) endTurn.clicked -= OnEndTurn;
            StopAllCoroutines();
            if (battle != null && pointerInput != null) battle.RemoveManipulator(pointerInput);
            arrow?.RemoveFromHierarchy();
            foreach (CardItem c in cards) c.el.RemoveFromHierarchy();
            cards.Clear();
            held = hovered = null;
            aimed = null;
            kbHold = busy = false;
        }

        /* ───── 부채꼴 ───── */

        /// <summary>a = lerp(−spread/2, +spread/2, i/(n−1)), 위치 = 중심 + (R·sin a, R·(1 − cos a)), 회전 = a (UITK 는 y 가 아래로 +, 회전은 시계가 +)</summary>
        void FanPose(int i, int n, out Vector2 pos, out float rot)
        {
            float spread = n > 1 ? Mathf.Min(fanDeg, maxStepDeg * (n - 1)) : 0f;
            rot = n > 1 ? Mathf.Lerp(-spread / 2f, spread / 2f, i / (float)(n - 1)) : 0f;
            float a = rot * Mathf.Deg2Rad;
            pos = handCenter + new Vector2(radius * Mathf.Sin(a), radius * (1f - Mathf.Cos(a)));
        }

        void Update()
        {
            ReadPad();
            var layout = cards.FindAll(c => c != held);
            int h = hovered != null ? layout.IndexOf(hovered) : -1;
            float k = 1f - Mathf.Exp(-16f * Time.unscaledDeltaTime);
            for (int i = 0; i < layout.Count; i++)
            {
                CardItem c = layout[i];
                FanPose(i, layout.Count, out c.restPos, out c.restRot);
                Vector2 tp = c.restPos;
                float tr = c.restRot, ts = 1f;
                if (i == h)
                {
                    tp = new Vector2(Mathf.Clamp(c.restPos.x, 160f, 1760f), handCenter.y - hoverLift);
                    tr = 0f;
                    ts = 1.25f;
                }
                else if (h >= 0)
                {
                    int d = i - h;
                    tp.x += Mathf.Sign(d) * neighborPush * (Mathf.Abs(d) == 1 ? 1f : Mathf.Abs(d) == 2 ? 0.5f : 0.25f);
                }
                Apply(c, tp, tr, ts, k);
            }
            if (held != null)
            {
                bool aim = held.data.target == CardTarget.Enemy;
                float kh = 1f - Mathf.Exp(-30f * Time.unscaledDeltaTime);
                Apply(held, aim ? aimPos : pointer - grab, 0f, aim ? 1.1f : 1.05f, kh);
                if (aim)
                {
                    Vector2 end = kbHold && aimed != null ? EnemyCenter(aimed) : pointer;
                    arrow.Set(aimPos + new Vector2(0f, -H * 0.55f), end, aimed != null);
                }
            }
            arrow.visible = held != null && held.data.target == CardTarget.Enemy;
        }

        void Apply(CardItem c, Vector2 tp, float tr, float ts, float k)
        {
            c.pos = Vector2.Lerp(c.pos, tp, k);
            c.rot = Mathf.LerpAngle(c.rot, tr, k);
            c.scale = Mathf.Lerp(c.scale, ts, k);
            c.el.style.translate = new Translate(c.pos.x - W / 2f, c.pos.y - H / 2f);
            c.el.style.rotate = new Rotate(Angle.Degrees(c.rot));
            c.el.style.scale = new Scale(Vector2.one * c.scale);
        }

        /* ───── 판정 ───── */

        static bool InCard(Vector2 center, float rotDeg, float scale, Vector2 p)
        {
            // 점을 카드 회전의 반대로 돌려 축 정렬 사각형으로 판정
            Vector2 d = Quaternion.Euler(0f, 0f, -rotDeg) * (p - center);
            return Mathf.Abs(d.x) <= W * scale / 2f && Mathf.Abs(d.y) <= H * scale / 2f;
        }

        /// <summary>올린 카드는 지금 자리로, 나머지는 '제자리' 로 판정 — 움직이는 카드로 판정하면 떨린다. 위에 그려진(오른쪽) 카드부터</summary>
        CardItem CardAt(Vector2 p)
        {
            if (hovered != null && InCard(hovered.pos, hovered.rot, hovered.scale, p)) return hovered;
            for (int i = cards.Count - 1; i >= 0; i--)
                if (cards[i] != held && InCard(cards[i].restPos, cards[i].restRot, 1f, p)) return cards[i];
            return null;
        }

        Enemy EnemyAt(Vector2 local)
        {
            VisualElement picked = battle.panel.Pick(battle.LocalToWorld(local));
            for (VisualElement e = picked; e != null; e = e.parent)
                if (e.ClassListContains("enemy")) return enemies.Find(x => x.el == e && x.Alive);
            return null;
        }

        Vector2 EnemyCenter(Enemy e) => battle.WorldToLocal(e.el.worldBound.center);

        /* ───── 포인터 (HandPointer 가 부른다) ───── */

        void SetHover(CardItem c)
        {
            if (hovered == c) return;
            hovered?.el.RemoveFromClassList("card--focus");
            hovered = c;
            RestoreOrder();   // 앞 카드를 먼저 제자리 순서로 — A → B 로 바로 옮겨 가도 A 가 앞에 남지 않게
            if (c == null) return;
            c.el.AddToClassList("card--focus");
            c.el.BringToFront();   // 그리는 순서만 맨 앞으로 — 배치는 cards 리스트 순서
        }

        void RestoreOrder()
        {
            for (int i = 0; i < cards.Count; i++) hand.Insert(i, cards[i].el);   // 원래 쌓는 순서로
            if (held != null) held.el.BringToFront();
        }

        internal void PointerMove(Vector2 p)
        {
            pointer = p;
            if (held == null && !busy) SetHover(CardAt(p));
            else if (held != null && !kbHold && held.data.target == CardTarget.Enemy) SetAimed(EnemyAt(p));
        }

        internal bool PointerDown(Vector2 p)
        {
            pointer = p;
            if (held != null || busy) return false;
            CardItem c = CardAt(p);
            if (c == null) return false;
            if (c.data.cost > energy)
            {
                Shake(c);   // 집는 순간 거절 — 놓은 뒤에 알리지 않는다
                return false;
            }
            SetHover(null);
            held = c;
            grab = p - c.pos;
            c.el.AddToClassList("card--held");
            c.el.BringToFront();
            return true;
        }

        internal void PointerUp(Vector2 p)
        {
            if (held == null || kbHold) return;
            pointer = p;
            if (held.data.target == CardTarget.Enemy)
            {
                Enemy e = EnemyAt(p);   // 판정은 포인터 위치 — 카드 사각형이 아니다
                if (e != null) Play(held, e);
            }
            else if (p.y < playLineY) Play(held, null);
            Release();
        }

        void SetAimed(Enemy e)
        {
            if (aimed == e) return;
            if (aimed != null)
            {
                aimed.el.RemoveFromClassList("enemy--aimed");
                Refresh(aimed, null);
            }
            aimed = e;
            if (aimed != null)
            {
                aimed.el.AddToClassList("enemy--aimed");
                Refresh(aimed, held?.data);
            }
        }

        void Release()
        {
            held?.el.RemoveFromClassList("card--held");
            held = null;
            kbHold = false;
            SetAimed(null);
            RestoreOrder();
        }

        /* ───── 사용 · 턴 ───── */

        void Play(CardItem c, Enemy target)
        {
            CardData d = c.data;
            energy -= d.cost;
            var list = d.target == CardTarget.AllEnemies ? enemies.FindAll(x => x.Alive) : target != null ? new List<Enemy> { target } : new List<Enemy>();
            foreach (Enemy e in list)
            {
                for (int i = 0; i < Mathf.Max(1, d.hits) && d.damage > 0; i++)
                {
                    int a = Mathf.Min(e.block, d.damage);
                    e.block -= a;
                    e.hp = Mathf.Max(0, e.hp - (d.damage - a));
                }
                e.weak += d.weak;
                Refresh(e, null);
            }
            energy += d.energy;
            discard.Add(d);
            cards.Remove(c);
            c.el.RemoveFromHierarchy();
            if (hovered == c) hovered = null;
            RefreshCards();
        }

        void StartTurn()
        {
            energy = energyPerTurn;
            for (int i = 0; i < handSize; i++) Draw();
            foreach (Enemy e in enemies) Refresh(e, null);
            RefreshCards();
        }

        void Draw()
        {
            if (draw.Count == 0)
            {
                draw.AddRange(discard);
                discard.Clear();
                Shuffle(draw);
            }
            if (draw.Count == 0) return;
            CardData d = draw[^1];
            draw.RemoveAt(draw.Count - 1);
            VisualElement el = cardTemplate.Instantiate().Q("card");
            el.AddToClassList(d.kind == CardKind.Attack ? "card--attack" : "card--skill");
            el.Q<Label>("cost").text = d.cost.ToString();
            el.Q<Label>("name").text = d.displayName;
            el.Q<Label>("type").text = (d.kind == CardKind.Attack ? "공격" : "기술") + " · " + (d.target == CardTarget.Enemy ? "적 하나" : d.target == CardTarget.Self ? "자신" : "모든 적");
            el.Q<Label>("text").text = d.description;
            el.Q("aim").style.display = d.target == CardTarget.Enemy ? DisplayStyle.Flex : DisplayStyle.None;
            if (d.art != null) el.Q("art").style.backgroundImage = new StyleBackground(d.art);
            hand.Add(el);
            cards.Add(new CardItem { data = d, el = el, pos = new Vector2(95f, 1010f), scale = 0.35f });   // 뽑을 더미에서 날아온다
        }

        void OnEndTurn()
        {
            if (!busy) StartCoroutine(EnemyTurn());
        }

        IEnumerator EnemyTurn()
        {
            busy = true;
            Release();
            SetHover(null);
            foreach (CardItem c in cards)
            {
                discard.Add(c.data);
                c.el.RemoveFromHierarchy();
            }
            cards.Clear();
            foreach (Enemy e in enemies)
            {
                if (!e.Alive) continue;
                e.block = 0;
                EnemyIntent it = e.Intent;
                if (it.kind == IntentKind.Block) e.block += it.value;
                else if (it.kind == IntentKind.Buff) e.str += it.value;
                // 공격 피해는 플레이어 쪽 체력 시스템으로 넘긴다 (이 예제는 표시만)
                if (e.weak > 0) e.weak--;
                Refresh(e, null);
                yield return new WaitForSeconds(0.55f);
            }
            foreach (Enemy e in enemies) e.step++;
            busy = false;
            StartTurn();
        }

        /* ───── 표시 ───── */

        void RefreshCards()
        {
            foreach (CardItem c in cards) c.el.EnableInClassList("card--unplayable", c.data.cost > energy);
            energyText.text = $"{energy}/{energyPerTurn}";
            energyBox.EnableInClassList("energy--empty", energy == 0);
        }

        void Refresh(Enemy e, CardData preview)
        {
            e.el.EnableInClassList("enemy--dead", !e.Alive);
            e.el.Q<Label>(className: "enemy__name").text = e.setup.name;
            int loss = 0;
            if (preview != null && preview.damage > 0)
            {
                int block = e.block, hp = e.hp;
                for (int i = 0; i < Mathf.Max(1, preview.hits); i++)
                {
                    int a = Mathf.Min(block, preview.damage);
                    block -= a;
                    hp -= Mathf.Min(hp, preview.damage - a);
                }
                loss = e.hp - hp;
            }
            float max = e.setup.maxHp;
            e.el.Q(className: "hp__loss").style.width = Length.Percent(e.hp / max * 100f);
            e.el.Q(className: "hp__fill").style.width = Length.Percent((e.hp - loss) / max * 100f);
            e.el.Q<Label>(className: "hp__text").text = loss > 0 ? (loss >= e.hp ? "처치" : $"{e.hp}/{e.setup.maxHp}  -{loss}") : $"{e.hp}/{e.setup.maxHp}";

            VisualElement intent = e.el.Q(className: "intent");
            EnemyIntent it = e.Intent;
            intent.EnableInClassList("intent--attack", it.kind == IntentKind.Attack);
            intent.EnableInClassList("intent--block", it.kind == IntentKind.Block);
            intent.EnableInClassList("intent--buff", it.kind == IntentKind.Buff);
            Sprite icon = it.kind == IntentKind.Attack ? attackIcon : it.kind == IntentKind.Block ? blockIcon : buffIcon;
            intent.Q(className: "intent__icon").style.backgroundImage = icon != null ? new StyleBackground(icon) : StyleKeyword.None;
            string hits = it.hits > 1 ? $"×{it.hits}" : "";
            string value = it.kind == IntentKind.Attack
                ? (preview != null && preview.weak > 0 && e.weak == 0 ? $"<s>{e.Hit(e.weak)}</s> {e.Hit(preview.weak)}{hits}" : $"{e.Hit(e.weak)}{hits}")
                : it.kind == IntentKind.Block ? it.value.ToString() : $"+{it.value}";
            intent.Q<Label>(className: "intent__value").text = value;   // Label 은 rich text 가 기본으로 켜져 있다 (<s> 취소선)
            intent.Q<Label>(className: "intent__label").text = it.kind == IntentKind.Attack ? "공격" : it.kind == IntentKind.Block ? "방어" : "강화";
        }

        void Shake(CardItem c)
        {
            // 짧게 좌우로 — schedule 은 실제 시간으로 돈다
            int n = 0;
            c.el.schedule.Execute(() => c.pos.x += (n++ % 2 == 0 ? 1 : -1) * (12f - n * 2f)).Every(35).Until(() => n >= 6);
        }

        /* ───── 키보드 · 패드 ───── */

        void ReadPad()
        {
            if (navigate == null || submit == null || cancel == null || busy) return;
            int nav = Mathf.RoundToInt(navigate.action.ReadValue<Vector2>().x);
            if (nav != 0 && nav != lastNav)
            {
                if (kbHold)
                {
                    var alive = enemies.FindAll(x => x.Alive);
                    if (alive.Count > 0)
                    {
                        kbTarget = (kbTarget + nav + alive.Count) % alive.Count;
                        SetAimed(alive[kbTarget]);
                    }
                }
                else if (held == null && cards.Count > 0)
                {
                    int i = hovered != null ? cards.IndexOf(hovered) : cards.Count / 2 - (nav > 0 ? 1 : 0);
                    SetHover(cards[(i + nav + cards.Count) % cards.Count]);
                }
            }
            lastNav = nav;
            if (cancel.action.WasPressedThisFrame() && held != null) Release();
            if (!submit.action.WasPressedThisFrame()) return;
            if (kbHold && held != null)
            {
                if (aimed != null) Play(held, aimed);
                Release();
            }
            else if (held == null && hovered != null)
            {
                CardItem c = hovered;
                if (c.data.cost > energy) Shake(c);
                else if (c.data.target != CardTarget.Enemy) Play(c, null);
                else
                {
                    SetHover(null);
                    held = c;
                    kbHold = true;
                    c.el.AddToClassList("card--held");
                    c.el.BringToFront();
                    var alive = enemies.FindAll(x => x.Alive);
                    kbTarget = alive.Count / 2;
                    SetAimed(alive.Count > 0 ? alive[kbTarget] : null);
                }
            }
        }

        static void Shuffle(List<CardData> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = UnityEngine.Random.Range(0, i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }

        /// <summary>포인터 입력을 손패로 넘긴다. 끄는 동안은 포인터를 붙잡아(Capture) 화면 밖으로 나가도 놓치지 않는다</summary>
        class HandPointer : PointerManipulator
        {
            readonly CardHandUITK owner;

            public HandPointer(CardHandUITK owner) => this.owner = owner;

            protected override void RegisterCallbacksOnTarget()
            {
                target.RegisterCallback<PointerDownEvent>(OnDown);
                target.RegisterCallback<PointerMoveEvent>(OnMove);
                target.RegisterCallback<PointerUpEvent>(OnUp);
            }

            protected override void UnregisterCallbacksFromTarget()
            {
                target.UnregisterCallback<PointerDownEvent>(OnDown);
                target.UnregisterCallback<PointerMoveEvent>(OnMove);
                target.UnregisterCallback<PointerUpEvent>(OnUp);
            }

            void OnDown(PointerDownEvent e)
            {
                if (e.button != 0) return;
                if (owner.PointerDown(e.localPosition)) target.CapturePointer(e.pointerId);
            }

            void OnMove(PointerMoveEvent e) => owner.PointerMove(e.localPosition);

            void OnUp(PointerUpEvent e)
            {
                if (!target.HasPointerCapture(e.pointerId)) return;
                target.ReleasePointer(e.pointerId);
                owner.PointerUp(e.localPosition);
            }
        }
    }

    /// <summary>
    /// 타겟 화살표 — 2차 베지어 위에 점과 화살촉을 Painter2D 로 그린다. USS 로는 곡선을 그릴 수 없다.
    /// </summary>
    public class ArrowElement : VisualElement
    {
        Vector2 a, b;
        bool onTarget;

        public ArrowElement()
        {
            pickingMode = PickingMode.Ignore;   // 화살표가 포인터 아래 적을 가리지 않게
            style.position = Position.Absolute;
            style.left = 0;
            style.top = 0;
            style.right = 0;
            style.bottom = 0;
            generateVisualContent += Draw;
        }

        public void Set(Vector2 start, Vector2 end, bool target)
        {
            if (a == start && b == end && onTarget == target) return;
            a = start;
            b = end;
            onTarget = target;
            MarkDirtyRepaint();   // 다시 그려 달라고 알린다
        }

        void Draw(MeshGenerationContext ctx)
        {
            Painter2D p = ctx.painter2D;
            p.fillColor = onTarget ? new Color(1f, 0.7f, 0.28f) : new Color(0.81f, 0.89f, 0.96f);
            Vector2 c = new(a.x + (b.x - a.x) * 0.05f, Mathf.Min(a.y, b.y) - 90f);   // y 가 아래로 + 라 '위로 휨' = 더 작은 y
            const int dots = 14;
            for (int i = 0; i < dots; i++)
            {
                float t = 0.04f + 0.86f * i / (dots - 1);
                p.BeginPath();
                p.Arc(Bezier(t, c, out _), 5f + 4f * i / dots, Angle.Degrees(0f), Angle.Degrees(360f));
                p.Fill();
            }
            Vector2 tip = Bezier(1f, c, out Vector2 dir);
            Vector2 n = new(-dir.y, dir.x);
            p.BeginPath();
            p.MoveTo(tip + dir * 14f);
            p.LineTo(tip - dir * 26f + n * 26f);
            p.LineTo(tip - dir * 14f);
            p.LineTo(tip - dir * 26f - n * 26f);
            p.ClosePath();
            p.Fill();
        }

        Vector2 Bezier(float t, Vector2 c, out Vector2 dir)
        {
            float u = 1f - t;
            dir = (2f * u * (c - a) + 2f * t * (b - c)).normalized;
            return u * u * a + 2f * u * t * c + t * t * b;
        }
    }
}
