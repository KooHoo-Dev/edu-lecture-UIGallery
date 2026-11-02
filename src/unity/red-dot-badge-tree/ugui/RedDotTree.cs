using System;
using System.Collections.Generic;
using UnityEngine;

namespace UIGallery.RedDotBadgeTree
{
    /// <summary>
    /// 레드닷 트리 — UI 와 무관한 순수 C# 데이터. (UGUI · UI Toolkit 판이 같은 클래스를 함께 쓴다)
    /// - 노드는 경로 키로 만든다: "mail" / "mail/reward" / "mail/reward/item-12"
    /// - 점 데이터는 노드 자신의 leafOn 하나뿐. Count = (자신이 켜졌으면 1) + 자식 Count 합 — 이 불변식이 늘 유지된다
    ///   → 부모 개수를 따로 저장·수정하는 코드가 없으므로 부모와 자식이 어긋날 수 없다
    /// - 잎이 켜지고 꺼질 때 +1 / −1 을 조상에게만 전한다 → 노드가 수천 개여도 경로 길이(3~4)만큼만 일한다
    /// - Count 가 바뀐 노드마다 Changed 이벤트 → 배지 UI 가 구독한다 (옵저버 패턴)
    /// </summary>
    public class RedDotTree
    {
        public static RedDotTree Instance { get; private set; } = new RedDotTree();

        // 'Enter Play Mode Options' 로 도메인 리로드를 끄면 static 이 지난 플레이의 값을 들고 있다 → 시작할 때 새로 만든다
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Instance = new RedDotTree();

        public class Node
        {
            public readonly string Path;
            public Node Parent { get; internal set; }
            public readonly List<Node> Children = new();
            /// <summary>자신(켜졌으면 1) + 자식 Count 합</summary>
            public int Count { get; internal set; }
            /// <summary>Count 가 바뀔 때 (새 Count)</summary>
            public event Action<int> Changed;
            internal bool leafOn;

            internal Node(string path, Node parent)
            {
                Path = path;
                Parent = parent;
            }

            internal void Raise() => Changed?.Invoke(Count);
        }

        readonly Dictionary<string, Node> nodes = new();
        public Node Root { get; } = new Node("", null);

        /// <summary>경로의 노드 (없으면 부모까지 만들어 둔다 — 배지가 데이터보다 먼저 구독해도 된다)</summary>
        public Node Get(string path)
        {
            if (string.IsNullOrEmpty(path)) return Root;
            if (nodes.TryGetValue(path, out Node n)) return n;
            int slash = path.LastIndexOf('/');
            Node parent = slash < 0 ? Root : Get(path.Substring(0, slash));
            n = new Node(path, parent);
            parent.Children.Add(n);
            nodes[path] = n;
            return n;
        }

        /// <summary>노드 자신의 점을 켜고 끈다. 보상은 받았을 때 false</summary>
        public void SetLeaf(string path, bool on)
        {
            Node n = Get(path);
            if (n.leafOn == on) return;
            n.leafOn = on;
            Propagate(n, on ? 1 : -1);
        }

        /// <summary>경로 아래 점을 모두 끈다. 예: 공지 탭을 열었을 때 ClearChildren("mail/notice")</summary>
        public void ClearChildren(string path)
        {
            var lit = new List<Node>();
            Collect(Get(path), lit);
            foreach (Node n in lit) SetLeaf(n.Path, false);
        }

        /// <summary>받은 우편처럼 다시 쓰지 않을 노드를 트리에서 뺀다 (점을 끈 뒤 떼어 낸다)</summary>
        public void Remove(string path)
        {
            if (!nodes.TryGetValue(path, out Node n)) return;
            ClearChildren(path);
            n.Parent.Children.Remove(n);
            Forget(n);
        }

        void Forget(Node n)
        {
            nodes.Remove(n.Path);
            foreach (Node c in n.Children) Forget(c);
        }

        static void Collect(Node n, List<Node> lit)
        {
            if (n.leafOn) lit.Add(n);
            foreach (Node c in n.Children) Collect(c, lit);
        }

        /// <summary>자신과 조상의 Count 에 d 를 더하고 알린다</summary>
        static void Propagate(Node n, int d)
        {
            for (Node cur = n; cur != null; cur = cur.Parent)
            {
                cur.Count += d;
                cur.Raise();
            }
        }
    }
}
