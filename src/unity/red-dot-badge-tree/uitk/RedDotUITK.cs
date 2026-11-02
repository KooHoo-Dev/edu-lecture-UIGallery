using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.RedDotBadgeTree
{
    /// <summary>
    /// UI Toolkit 판 레드닷 배지 — 데이터는 UGUI 판의 RedDotTree.cs(순수 C#)를 그대로 쓴다.
    /// - 요소 이름 → 트리 경로 표(Bindings)로 배지를 노드에 연결하고, 노드의 Changed 를 구독한다
    /// - 켜짐: .red-dot--on, 숫자: .red-dot--count (+ Label 글자)
    /// - 보상 행은 C# 이 '받지 않은 우편 목록' 에서 만든다 → 창(UIDocument)을 껐다 켜서 트리가 새로 만들어져도 행이 돌아온다
    /// - '받기' → Remove(path) → 탭·메뉴 배지가 자동으로 다시 그려진다. 공지 탭을 열면 소식 잎을 끈다
    /// 시험: 1 새 우편 · 4 일일 임무 모두 받기 · 5 하루 지남
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class RedDotUITK : MonoBehaviour
    {
        [SerializeField] bool showCount = true;
        [SerializeField] int cap = 99;

        static readonly (string element, string path)[] Bindings =
        {
            ("nav-mail", "mail"),
            ("nav-mission", "mission"),
            ("nav-shop", "shop"),
            ("tab-reward", "mail/reward"),
            ("tab-notice", "mail/notice"),
        };

        readonly List<(RedDotTree.Node node, Action<int> handler)> subscriptions = new();
        /// <summary>받지 않은 우편 (데이터) — 화면의 행은 여기서 다시 만든다</summary>
        readonly List<(string path, string title)> pendingMail = new();
        ScrollView list;
        Button noticeTab;
        int mailNo;
        bool seeded;

        static RedDotTree Tree => RedDotTree.Instance;

        void OnEnable()
        {
            VisualElement root = GetComponent<UIDocument>().rootVisualElement;
            list = root.Q<ScrollView>("list");

            foreach ((string element, string path) in Bindings)
            {
                VisualElement dot = root.Q(element).Q(className: "red-dot");
                Label label = dot.Q<Label>();
                RedDotTree.Node node = Tree.Get(path);
                Action<int> handler = count => Apply(dot, label, count);
                node.Changed += handler;
                subscriptions.Add((node, handler));
                Apply(dot, label, node.Count);
            }

            noticeTab = root.Q<Button>("tab-notice");
            noticeTab.clicked += OnNoticeTab;

            if (!seeded)
            {
                seeded = true;
                AddMail();
                AddMail();
                Tree.SetLeaf("mail/notice/maintenance", true);
                NextDay();
            }
            foreach ((string path, string title) in pendingMail) AddRow(path, title);
        }

        void OnDisable()
        {
            // 풀지 않으면 사라진 요소를 계속 갱신하고, 다시 켤 때마다 구독이 쌓인다
            foreach ((RedDotTree.Node node, Action<int> handler) in subscriptions) node.Changed -= handler;
            subscriptions.Clear();
            if (noticeTab != null) noticeTab.clicked -= OnNoticeTab;
        }

        static void OnNoticeTab() => Tree.ClearChildren("mail/notice");   // 소식은 보면 꺼진다

        static void NextDay()
        {
            Tree.SetLeaf("mission/daily/drone", true);
            Tree.SetLeaf("mission/daily/explore", true);
        }

        void Apply(VisualElement dot, Label label, int count)
        {
            dot.EnableInClassList("red-dot--on", count > 0);
            dot.EnableInClassList("red-dot--count", showCount && count > 0);
            label.text = count > cap ? $"{cap}+" : count.ToString();
        }

        void AddMail()
        {
            string path = $"mail/reward/item-{++mailNo}";
            string title = $"탐사 보상 #{mailNo}";
            pendingMail.Add((path, title));
            Tree.SetLeaf(path, true);
            if (isActiveAndEnabled) AddRow(path, title);
        }

        void AddRow(string path, string title)
        {
            var row = new VisualElement();
            row.AddToClassList("row");
            var label = new Label(title);
            label.AddToClassList("row__label");
            var claim = new Button { text = "받기" };
            claim.AddToClassList("row__claim");
            claim.clicked += () =>
            {
                pendingMail.RemoveAll(m => m.path == path);
                Tree.Remove(path);   // 할 일은 받아야 꺼진다 — 부모 개수는 트리가 맞춘다
                row.RemoveFromHierarchy();
            };
            row.Add(label);
            row.Add(claim);
            list.Add(row);
        }

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) AddMail();
            if (kb.digit4Key.wasPressedThisFrame) Tree.ClearChildren("mission/daily");
            if (kb.digit5Key.wasPressedThisFrame) NextDay();
        }
    }
}
