using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.TutorialSpotlightSample
{
    /// <summary>
    /// UI Toolkit 판 튜토리얼 스포트라이트 — UGUI 판(TutorialSpotlight.cs)과 같은 규칙.
    /// - 구멍 바깥 네 장(.block)이 어둡게 칠하고 입력을 막는다. 구멍 자리에는 아무것도 없어 진짜 버튼이 눌린다
    /// - 매 프레임 대상의 worldBound 를 튜토리얼 레이어 좌표로 바꿔 구멍을 따라가게 한다
    /// - 대상이 ScrollView 안이면 단계를 시작할 때 ScrollTo
    /// - 입력이 idleHintSeconds 동안 없거나 바깥을 누르면 '누르는 점' 힌트
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class TutorialSpotlightUITK : MonoBehaviour
    {
        public enum Side { Top, Bottom, Left, Right }

        [Serializable]
        public class Step
        {
            public string targetId;
            public string title;
            [TextArea] public string body;
            public Side prefer = Side.Top;
        }

        [SerializeField]
        List<Step> steps = new()
        {
            new Step { targetId = "tab-mail", title = "우편함 열기", body = "먼저 우편함에서 정비 지원금을 받아 보세요" },
            new Step { targetId = "mail-claim", title = "보상 받기", body = "모두 받기를 누르면 우편이 한 번에 들어옵니다", prefer = Side.Left },
            new Step { targetId = "tab-shop", title = "상점 열기", body = "이번엔 상점에서 출격 준비물을 삽니다" },
            new Step { targetId = "item-cell", title = "준비물 사기", body = "첫 출격에는 냉각 셀이 꼭 필요합니다", prefer = Side.Left },
            new Step { targetId = "sortie", title = "첫 출격", body = "준비 끝! 출격을 눌러 첫 탐사를 시작하세요" },
        };

        [SerializeField] float padding = 14f;
        [SerializeField] float moveSeconds = 0.28f;
        [SerializeField] float idleHintSeconds = 4f;
        [SerializeField] float tipGap = 28f;

        VisualElement tutorial, ring, hand, tip, mailDrawer, shop;
        /// <summary>콜백을 등록한 트리 — 컴포넌트를 껐다 켜도 같은 트리면 다시 등록하지 않는다 (한 번 클릭에 Next 두 번 방지)</summary>
        VisualElement boundRoot;
        VisualElement blockTop, blockBottom, blockLeft, blockRight;
        Label tipTitle, tipBody, tipProgress;

        int index = -1;
        VisualElement target;
        Rect hole;
        bool holeInit;
        float idle;
        bool hintOn;

        bool Running => index >= 0 && index < steps.Count;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            bool bound = root == boundRoot;
            boundRoot = root;
            tutorial = root.Q("tutorial");
            ring = root.Q("ring");
            hand = root.Q("hand");
            tip = root.Q("tip");
            blockTop = root.Q("block-top");
            blockBottom = root.Q("block-bottom");
            blockLeft = root.Q("block-left");
            blockRight = root.Q("block-right");
            tipTitle = root.Q<Label>("tip-title");
            tipBody = root.Q<Label>("tip-body");
            tipProgress = root.Q<Label>("tip-progress");
            mailDrawer = root.Q("mail-drawer");
            shop = root.Q("shop");

            if (!bound) Bind(root);

            index = -1;
            holeInit = false;
            tutorial.style.display = DisplayStyle.Flex;
            Next();
        }

        void Bind(VisualElement root)
        {
            // 버튼 본래 기능 — 튜토리얼이 없어도 똑같이 동작한다
            root.Q<Button>("tab-mail").clicked += () => mailDrawer.ToggleInClassList("drawer--open");
            root.Q<Button>("mail-claim").clicked += () => mailDrawer.RemoveFromClassList("drawer--open");
            root.Q<Button>("tab-shop").clicked += () => shop.ToggleInClassList("shop--open");
            root.Q<Button>("item-cell").clicked += () => shop.RemoveFromClassList("shop--open");
            root.Q<Button>("sortie").clicked += () => Debug.Log("출격!");

            // 튜토리얼: 대상 버튼이 눌리면 (본래 기능 다음에) 지금 단계의 대상인지 확인
            foreach (Step s in steps)
            {
                string id = s.targetId;
                root.Q<Button>(id).clicked += () =>
                {
                    if (Running && steps[index].targetId == id) Next();
                };
            }

            foreach (VisualElement b in new[] { blockTop, blockBottom, blockLeft, blockRight })
                b.RegisterCallback<PointerDownEvent>(_ => hintOn = true);   // 바깥을 눌렀다 = 헤매는 중 → 바로 힌트

            // 어떤 입력이든 들어오면 유휴 시간을 0 으로 (TrickleDown: 버튼보다 먼저 받는다)
            root.RegisterCallback<PointerDownEvent>(_ => idle = 0f, TrickleDown.TrickleDown);
            root.Q<Button>("skip").clicked += Finish;   // 실제 게임에서는 한 번 더 묻고 '다시 보기' 위치를 알려 준다
        }

        void Next()
        {
            index++;
            if (!Running)
            {
                Finish();
                return;
            }
            Step step = steps[index];
            target = tutorial.panel.visualTree.Q(step.targetId);
            tipTitle.text = step.title;
            tipBody.text = step.body;
            tipProgress.text = $"{index + 1} / {steps.Count}";
            idle = 0f;
            hintOn = false;
            target?.Focus();
            // 레이아웃이 끝난 다음 프레임에 스크롤 (닫혀 있던 상점이 막 열린 경우)
            ScrollView scroll = target?.GetFirstAncestorOfType<ScrollView>();
            if (scroll != null) tutorial.schedule.Execute(() => scroll.ScrollTo(target));
        }

        void Finish()
        {
            index = steps.Count;
            tutorial.style.display = DisplayStyle.None;
        }

        void Update()
        {
            if (!Running || target == null) return;
            float w = tutorial.layout.width;
            float h = tutorial.layout.height;
            if (float.IsNaN(w) || w <= 0f) return;   // 첫 레이아웃 전

            // 1) 대상의 현재 위치(패널 좌표) → 튜토리얼 레이어 좌표 → 구멍
            Rect goal = Padded(tutorial.WorldToLocal(target.worldBound), out bool round);
            if (!holeInit || moveSeconds <= 0f)
            {
                hole = goal;
                holeInit = true;
            }
            else
            {
                float k = 1f - Mathf.Exp(-4.6f / moveSeconds * Time.unscaledDeltaTime);
                hole = new Rect(Vector2.Lerp(hole.position, goal.position, k), Vector2.Lerp(hole.size, goal.size, k));
            }

            // 2) 바깥 네 장 + 테두리 (UI Toolkit 좌표는 왼쪽 위 원점)
            Set(blockTop, 0f, 0f, w, hole.yMin);
            Set(blockBottom, 0f, hole.yMax, w, h - hole.yMax);
            Set(blockLeft, 0f, hole.yMin, hole.xMin, hole.height);
            Set(blockRight, hole.xMax, hole.yMin, w - hole.xMax, hole.height);
            Set(ring, hole.x, hole.y, hole.width, hole.height);
            float radius = round ? hole.width / 2f : 22f;
            ring.style.borderTopLeftRadius = radius;
            ring.style.borderTopRightRadius = radius;
            ring.style.borderBottomLeftRadius = radius;
            ring.style.borderBottomRightRadius = radius;

            // 3) 유휴 힌트 — 포인터는 TrickleDown 콜백이, 키보드는 여기서 0 으로
            if (Keyboard.current != null && Keyboard.current.anyKey.wasPressedThisFrame) idle = 0f;
            idle += Time.unscaledDeltaTime;
            if (idleHintSeconds > 0f && idle >= idleHintSeconds) hintOn = true;
            hand.EnableInClassList("hand--on", hintOn);
            float bob = Mathf.Abs(Mathf.Sin(Time.unscaledTime * Mathf.PI * 0.9f)) * 18f;
            hand.style.left = hole.center.x + bob;
            hand.style.top = hole.center.y + bob;

            // 4) 말풍선
            PlaceTip(w, h);
        }

        Rect Padded(Rect r, out bool round)
        {
            float ratio = r.width / Mathf.Max(1f, r.height);
            round = ratio > 0.7f && ratio < 1.45f;
            if (round)
            {
                float d = Mathf.Max(r.width, r.height) + padding * 2f;
                return new Rect(r.center.x - d / 2f, r.center.y - d / 2f, d, d);
            }
            return new Rect(r.x - padding, r.y - padding, r.width + padding * 2f, r.height + padding * 2f);
        }

        static void Set(VisualElement e, float x, float y, float w, float h)
        {
            e.style.left = x;
            e.style.top = y;
            e.style.width = Mathf.Max(0f, w);
            e.style.height = Mathf.Max(0f, h);
        }

        void PlaceTip(float areaW, float areaH)
        {
            Vector2 size = tip.layout.size;
            if (float.IsNaN(size.x)) return;
            Side side = steps[index].prefer;
            Vector2 p = TipPos(side, size);
            if (!Fits(side, p, size, areaW, areaH))
            {
                Side alt = side switch { Side.Top => Side.Bottom, Side.Bottom => Side.Top, Side.Left => Side.Right, _ => Side.Left };
                Vector2 q = TipPos(alt, size);
                if (Fits(alt, q, size, areaW, areaH)) p = q;
            }
            tip.style.left = Mathf.Clamp(p.x, 0f, areaW - size.x);
            tip.style.top = Mathf.Clamp(p.y, 0f, areaH - size.y);
        }

        // y 가 아래로 커지는 좌표계: '위' 는 hole.yMin 보다 위
        Vector2 TipPos(Side s, Vector2 size) => s switch
        {
            Side.Top => new Vector2(hole.center.x - size.x / 2f, hole.yMin - tipGap - size.y),
            Side.Bottom => new Vector2(hole.center.x - size.x / 2f, hole.yMax + tipGap),
            Side.Left => new Vector2(hole.xMin - tipGap - size.x, hole.center.y - size.y / 2f),
            _ => new Vector2(hole.xMax + tipGap, hole.center.y - size.y / 2f),
        };

        static bool Fits(Side s, Vector2 p, Vector2 size, float w, float h) =>
            s is Side.Top or Side.Bottom ? p.y >= 0f && p.y + size.y <= h : p.x >= 0f && p.x + size.x <= w;
    }
}
