using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.CardHandTargeting
{
    /// <summary>
    /// 손패 — 부채꼴 배치 · 호버 · 끌기 · 대상 판정 · 키보드/패드.
    /// - LayoutGroup 없이 카드 i 의 자세를 원호 공식으로 직접 계산한다 (FanPose)
    /// - 그리는 순서(SetAsLastSibling)와 배치 순서(cards 리스트)를 따로 둔다
    /// - 대상 판정은 포인터 위치로 RaycastAll → EnemyView. 끄는 카드는 blocksRaycasts = false
    /// Canvas 는 Screen Space - Overlay 를 가정한다 (Camera 모드면 화면 ↔ 좌표 변환에 카메라를 넘긴다).
    /// </summary>
    public class HandView : MonoBehaviour
    {
        [Serializable]
        public struct Pose
        {
            public Vector2 pos;
            public float rot;
            public float scale;
        }

        [Header("부채꼴")]
        [Tooltip("양 끝 카드 사이의 전체 각도")]
        [SerializeField] float fanDeg = 22f;
        [Tooltip("원의 중심은 손패 아래 이만큼 — 클수록 평평하고 넓다")]
        [SerializeField] float radius = 2000f;
        [Tooltip("장수가 적을 때 카드 사이 최대 각도")]
        [SerializeField] float maxStepDeg = 7f;
        [SerializeField] float hoverLift = 100f;
        [SerializeField] float hoverScale = 1.25f;
        [SerializeField] float neighborPush = 50f;
        [SerializeField] float followLambda = 16f;
        [SerializeField] float heldLambda = 30f;

        [Header("사용")]
        [Tooltip("대상 카드를 세우는 자리 (Hand 기준 좌표)")]
        [SerializeField] Vector2 aimPos = new(0f, 235f);
        [Tooltip("대상 없는 카드는 포인터가 이 높이(Hand 기준)보다 위에서 놓여야 쓴다")]
        [SerializeField] float playLineY = 285f;
        [SerializeField] int energyPerTurn = 3;

        [Header("참조")]
        [SerializeField] CardView cardPrefab;
        [SerializeField] TargetArrow arrow;
        [SerializeField] List<EnemyView> enemies = new();
        [SerializeField] TextMeshProUGUI energyText;
        [SerializeField] GameObject playLine;

        [Header("키보드 · 패드 (Input System 의 UI 액션)")]
        [SerializeField] InputActionReference navigate;
        [SerializeField] InputActionReference submit;
        [SerializeField] InputActionReference cancel;

        /// <summary>카드를 썼다 (대상 없으면 null) — 방어 · 회복 같은 플레이어 쪽 효과는 여기서 처리</summary>
        public event Action<CardData, EnemyView> Played;
        public int Energy { get; private set; }

        readonly List<CardView> cards = new();
        readonly List<RaycastResult> hits = new();
        readonly List<CardView> layout = new();
        RectTransform rect;
        CardView hovered, held;
        Vector2 grabOffset, pointerLocal;
        EnemyView aimed;
        bool kbHold;
        int kbTarget, lastNav;

        void Awake()
        {
            rect = (RectTransform)transform;
            Energy = energyPerTurn;
            if (arrow != null) arrow.Hide();
            if (playLine != null) playLine.SetActive(false);
        }

        void OnEnable()
        {
            navigate?.action.Enable();
            submit?.action.Enable();
            cancel?.action.Enable();
        }

        public void StartTurn()
        {
            Energy = energyPerTurn;
            RefreshPlayable();
        }

        public void AddCard(CardData data, Vector2 spawnLocal)
        {
            CardView card = Instantiate(cardPrefab, rect);
            card.Init(this, data, new Pose { pos = spawnLocal, rot = 0f, scale = 0.35f });
            cards.Add(card);
            RefreshPlayable();
        }

        /// <summary>
        /// 부채꼴: a = lerp(−spread/2, +spread/2, i/(n−1)), spread = min(fanDeg, maxStepDeg × (n−1))
        /// 위치 = (R·sin a, −R·(1 − cos a)), 회전 = −a (UGUI 는 y 가 위로 +, 회전은 반시계가 + 라 오른쪽 카드가 시계 방향으로 기울게 부호를 뒤집는다)
        /// </summary>
        public Pose FanPose(int i, int n)
        {
            float spread = n > 1 ? Mathf.Min(fanDeg, maxStepDeg * (n - 1)) : 0f;
            float deg = n > 1 ? Mathf.Lerp(-spread / 2f, spread / 2f, i / (float)(n - 1)) : 0f;
            float a = deg * Mathf.Deg2Rad;
            return new Pose { pos = new Vector2(radius * Mathf.Sin(a), -radius * (1f - Mathf.Cos(a))), rot = -deg, scale = 1f };
        }

        void LateUpdate()
        {
            layout.Clear();
            foreach (CardView c in cards)
                if (c != held) layout.Add(c);
            int n = layout.Count;
            int h = hovered != null ? layout.IndexOf(hovered) : -1;
            for (int i = 0; i < n; i++)
            {
                Pose rest = FanPose(i, n);
                layout[i].PlaceRoot(rest);
                Pose t = rest;
                if (i == h)
                {
                    // 들어 올려 똑바로 세우고 키운다 — 그리는 순서는 SetHover 에서 맨 앞으로
                    t = new Pose { pos = new Vector2(rest.pos.x, hoverLift), rot = 0f, scale = hoverScale };
                }
                else if (h >= 0)
                {
                    int d = i - h;
                    float f = Mathf.Abs(d) == 1 ? 1f : Mathf.Abs(d) == 2 ? 0.5f : 0.25f;
                    t.pos.x += Mathf.Sign(d) * neighborPush * f;
                }
                layout[i].Follow(t, followLambda);
            }

            if (held != null)
            {
                bool aim = held.Data.target == CardTarget.Enemy;
                Pose t = aim ? new Pose { pos = aimPos, rot = 0f, scale = 1.1f } : new Pose { pos = pointerLocal - grabOffset, rot = 0f, scale = 1.05f };
                held.Follow(t, heldLambda);
                if (aim) DrawArrow();
            }
        }

        /* ───── 호버 ───── */

        public void SetHover(CardView card)
        {
            if (held != null || kbHold) return;
            if (hovered != null && hovered != card) ClearHover(hovered);
            hovered = card;
            card.SetHovered(true);
            card.transform.SetAsLastSibling();   // 그리는 순서만 맨 앞으로 (배치는 cards 리스트 순서)
        }

        public void ClearHover(CardView card)
        {
            if (hovered != card || held == card) return;
            card.SetHovered(false);
            card.transform.SetSiblingIndex(cards.IndexOf(card));   // 원래 순서로 — 안 그러면 쌓는 순서가 뒤섞인다
            hovered = null;
        }

        /* ───── 끌기 ───── */

        public void BeginDrag(CardView card, PointerEventData e)
        {
            if (held != null) return;
            if (card.Data.cost > Energy)
            {
                card.Shake();            // 집는 순간 거절 — 놓은 뒤에 알리지 않는다
                e.pointerDrag = null;    // 이번 끌기를 취소
                return;
            }
            held = card;
            card.Group.blocksRaycasts = false;   // 끄는 카드가 아래 적을 가리지 않게
            card.transform.SetAsLastSibling();
            UpdatePointer(e);
            grabOffset = pointerLocal - card.VisualPose.pos;
            if (playLine != null) playLine.SetActive(card.Data.target != CardTarget.Enemy);
        }

        public void Drag(CardView card, PointerEventData e)
        {
            if (held != card) return;
            UpdatePointer(e);
            if (card.Data.target == CardTarget.Enemy) SetAimed(EnemyAt(e));
        }

        public void EndDrag(CardView card, PointerEventData e)
        {
            if (held != card) return;
            UpdatePointer(e);
            if (card.Data.target == CardTarget.Enemy)
            {
                EnemyView target = EnemyAt(e);   // 판정은 포인터 위치 — 카드 사각형이 아니다
                if (target != null) Play(card, target);
            }
            else if (pointerLocal.y > playLineY) Play(card, null);
            Release();
        }

        void UpdatePointer(PointerEventData e) =>
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rect, e.position, e.pressEventCamera, out pointerLocal);

        EnemyView EnemyAt(PointerEventData e)
        {
            hits.Clear();
            EventSystem.current.RaycastAll(e, hits);
            foreach (RaycastResult r in hits)
            {
                EnemyView en = r.gameObject.GetComponentInParent<EnemyView>();
                if (en != null && en.Alive) return en;
            }
            return null;
        }

        void SetAimed(EnemyView target)
        {
            if (aimed == target) return;
            if (aimed != null) aimed.SetPreview(null);
            aimed = target;
            if (aimed != null) aimed.SetPreview(held != null ? held.Data : null);   // 깎일 체력 · 약화 미리보기
        }

        void DrawArrow()
        {
            Vector2 start = RectTransformUtility.WorldToScreenPoint(null, rect.TransformPoint(aimPos + new Vector2(0f, 150f)));
            Vector2 end = kbHold && aimed != null
                ? RectTransformUtility.WorldToScreenPoint(null, aimed.ArrowAnchor.position)
                : RectTransformUtility.WorldToScreenPoint(null, rect.TransformPoint(pointerLocal));
            arrow.Draw(start, end, aimed != null);
        }

        void Release()
        {
            if (held != null && hovered == held)
            {
                // 끄는 동안 온 PointerExit 는 무시했으니 여기서 호버를 푼다 — 안 그러면 취소한 카드가 들린 채 남는다
                held.SetHovered(false);
                hovered = null;
            }
            if (held != null)
            {
                held.Group.blocksRaycasts = true;
                held.transform.SetSiblingIndex(Mathf.Max(0, cards.IndexOf(held)));
            }
            held = null;
            kbHold = false;
            SetAimed(null);
            arrow.Hide();
            if (playLine != null) playLine.SetActive(false);
        }

        /* ───── 사용 ───── */

        void Play(CardView card, EnemyView target)
        {
            CardData c = card.Data;
            Energy -= c.cost;
            if (c.target == CardTarget.Enemy && target != null) target.TakeCard(c);
            else if (c.target == CardTarget.AllEnemies)
                foreach (EnemyView en in enemies)
                    if (en.Alive) en.TakeCard(c);
            Energy += c.energy;
            Played?.Invoke(c, target);
            if (hovered == card) hovered = null;
            if (held == card) held = null;
            cards.Remove(card);
            Destroy(card.gameObject);   // 실제 게임이라면 버린 더미로 날아가는 연출 뒤에 지운다
            RefreshPlayable();
        }

        /// <summary>턴 종료: 손패를 모두 버린다 (버린 더미에 넣을 데이터를 돌려준다)</summary>
        public List<CardData> DiscardAll()
        {
            Release();
            List<CardData> list = cards.ConvertAll(c => c.Data);
            foreach (CardView c in cards) Destroy(c.gameObject);
            cards.Clear();
            hovered = null;
            return list;
        }

        void RefreshPlayable()
        {
            foreach (CardView c in cards) c.SetPlayable(c.Data.cost <= Energy);
            if (energyText != null) energyText.text = $"{Energy}/{energyPerTurn}";
        }

        /* ───── 키보드 · 패드 ───── */

        void Update()
        {
            if (navigate == null || submit == null || cancel == null) return;
            int nav = Mathf.RoundToInt(navigate.action.ReadValue<Vector2>().x);
            if (nav != 0 && nav != lastNav) Step(nav);   // 눌렀을 때 한 번만 (누르고 있어도 한 칸)
            lastNav = nav;
            if (submit.action.WasPressedThisFrame()) Submit();
            if (cancel.action.WasPressedThisFrame() && held != null) Release();
        }

        List<EnemyView> Alive() => enemies.FindAll(en => en.Alive);

        void Step(int dir)
        {
            if (kbHold)
            {
                List<EnemyView> alive = Alive();
                if (alive.Count == 0) return;
                kbTarget = (kbTarget + dir + alive.Count) % alive.Count;
                SetAimed(alive[kbTarget]);
                return;
            }
            if (held != null || cards.Count == 0) return;
            int i = hovered != null ? cards.IndexOf(hovered) : cards.Count / 2 - (dir > 0 ? 1 : 0);
            SetHover(cards[(i + dir + cards.Count) % cards.Count]);
        }

        void Submit()
        {
            if (kbHold && held != null)
            {
                if (aimed != null) Play(held, aimed);
                Release();
                return;
            }
            if (held != null || hovered == null) return;
            CardView card = hovered;
            if (card.Data.cost > Energy)
            {
                card.Shake();
                return;
            }
            if (card.Data.target != CardTarget.Enemy)
            {
                Play(card, null);
                return;
            }
            // 대상 카드: 집어서 화살표를 띄우고, 좌우로 대상을 고른다
            ClearHover(card);
            held = card;
            kbHold = true;
            card.Group.blocksRaycasts = false;
            card.transform.SetAsLastSibling();
            List<EnemyView> alive = Alive();
            kbTarget = alive.Count / 2;
            SetAimed(alive.Count > 0 ? alive[kbTarget] : null);
        }
    }
}
