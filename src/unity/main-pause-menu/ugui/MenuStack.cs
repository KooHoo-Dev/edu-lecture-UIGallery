using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 메뉴 스택 (UGUI) — Push(확인) · Back(뒤로 한 칸) · Page(맨 위만 옆 카테고리로 교체).
    /// - Push 할 때 지금 선택을 스택 칸에 저장하고, Back 할 때 복원한다 (포커스 기억)
    /// - 공간 지도: 깊이 1 은 루트가 왼쪽, 깊이 2 이상은 [부모 = 왼쪽, 맨 위 = 오른쪽], 그보다 아래 칸은 왼쪽 끝 세로 띠
    /// - 전환 중(IsBusy)에는 이전 패널의 상호작용을 끄고, 입력은 MenuInputBuffer 가 버퍼에 담는다
    /// - 전환 길이: push = transitionMs, pop = 70%, 열기 = 90%, 페이지 = 65%
    /// </summary>
    public class MenuStack : MonoBehaviour
    {
        [SerializeField] MenuPanel root;

        [Header("Q/E 페이지 전환 — 루트의 버튼과 같은 순서")]
        [SerializeField] MenuPanel[] categories;
        [SerializeField] Selectable[] categoryButtons;

        [Header("배치 (anchoredPosition.x)")]
        [SerializeField] float leftX = 100f;
        [SerializeField] float rightX = 760f;
        [SerializeField] float spineX = -496f;
        [SerializeField] float slideDistance = 180f;

        [Header("전환")]
        [SerializeField, Range(0f, 600f)] float transitionMs = 220f;
        [SerializeField] bool rememberFocus = true;

        class Entry
        {
            public MenuPanel panel;
            public GameObject lastSelected;
        }

        readonly List<Entry> stack = new();
        readonly Dictionary<MenuPanel, GameObject> memory = new();
        Coroutine layoutRoutine;
        float busyUntil;

        public bool IsBusy => Time.unscaledTime < busyUntil;
        /// <summary>마지막으로 Open() 한 프레임 — 같은 프레임의 입력을 버퍼가 버리는 데 쓴다</summary>
        public int OpenedFrame { get; private set; } = -1;
        public int Depth => stack.Count;
        public MenuPanel Top => stack.Count > 0 ? stack[^1].panel : null;
        public bool TopIsOverlay => Top && Top.overlay;
        public string Path
        {
            get
            {
                var names = new List<string>();
                foreach (var e in stack) names.Add(e.panel.title);
                return string.Join("  ›  ", names);
            }
        }

        /// <summary>스택이 바뀔 때마다 (브레드크럼 · 안내 바 갱신용)</summary>
        public event Action<MenuStack> Changed;
        /// <summary>스택 바닥에서 뒤로 — PauseController 가 메뉴를 닫는다</summary>
        public event Action BackAtBottom;

        /* ───── 스택 조작 ───── */

        public void Open()
        {
            OpenedFrame = Time.frameCount;
            foreach (var e in stack) e.panel.gameObject.SetActive(false);
            stack.Clear();
            root.gameObject.SetActive(true);
            root.SetInteractable(true);
            stack.Add(new Entry { panel = root });
            Relayout(transitionMs * 0.9f, snap: true);
            root.PlayStagger();
            SelectNextFrame(root.firstSelected ? root.firstSelected.gameObject : null);
        }

        public void CloseAll()
        {
            foreach (var e in stack) e.panel.gameObject.SetActive(false);
            stack.Clear();
            busyUntil = 0f;
            Changed?.Invoke(this);
        }

        public void Push(MenuPanel panel)
        {
            if (IsBusy || !panel) return;
            var cur = stack[^1];
            cur.lastSelected = CurrentSelection();
            memory[cur.panel] = cur.lastSelected;
            cur.panel.SetInteractable(false);

            panel.gameObject.SetActive(true);
            panel.SetInteractable(true);
            stack.Add(new Entry { panel = panel });
            if (!panel.overlay)
            {
                // 오른쪽 바깥에서 밀려 들어온다
                panel.Rect.anchoredPosition = new Vector2(rightX + slideDistance, panel.Rect.anchoredPosition.y);
                panel.Group.alpha = 0f;
            }
            else panel.Group.alpha = 1f;
            Relayout(transitionMs, snap: false);
            panel.PlayStagger();

            GameObject target = panel.firstSelected ? panel.firstSelected.gameObject : null;
            if (rememberFocus && !panel.overlay && memory.TryGetValue(panel, out var m) && m) target = m;
            SelectNextFrame(target);
        }

        /// <summary>뒤로 — 어느 깊이에서든 한 칸만. 바닥이면 BackAtBottom</summary>
        public void Back()
        {
            if (IsBusy) return;
            if (stack.Count <= 1)
            {
                BackAtBottom?.Invoke();
                return;
            }
            var leaving = stack[^1];
            stack.RemoveAt(stack.Count - 1);
            memory[leaving.panel] = CurrentSelection();
            leaving.panel.SetInteractable(false);
            StartCoroutine(Leave(leaving.panel, transitionMs * 0.7f, +1));

            var top = stack[^1];
            top.panel.SetInteractable(true);
            Relayout(transitionMs * 0.7f, snap: false);
            // 포커스 기억: 들어가기 전 항목으로. 끄면 늘 첫 항목 (나쁜 예)
            var target = rememberFocus && top.lastSelected ? top.lastSelected : (top.panel.firstSelected ? top.panel.firstSelected.gameObject : null);
            SelectNextFrame(target);
        }

        /// <summary>숙련자 단축키 — 깊이는 그대로, 맨 위 패널만 옆 카테고리로</summary>
        public void Page(int dir)
        {
            if (IsBusy || stack.Count < 2 || TopIsOverlay) return;
            int i = Array.IndexOf(categories, Top);
            if (i < 0 || categories.Length < 2) return;
            int n = (i + dir + categories.Length) % categories.Length;
            var next = categories[n];

            var old = stack[^1];
            memory[old.panel] = CurrentSelection();
            old.panel.SetInteractable(false);
            StartCoroutine(Leave(old.panel, transitionMs * 0.65f, -dir));

            // 부모의 선택도 옆 카테고리 버튼으로 — 뒤로 가면 거기에 포커스
            if (categoryButtons != null && n < categoryButtons.Length) stack[^2].lastSelected = categoryButtons[n].gameObject;

            next.gameObject.SetActive(true);
            next.SetInteractable(true);
            next.Rect.anchoredPosition = new Vector2(rightX + slideDistance * dir, next.Rect.anchoredPosition.y);
            next.Group.alpha = 0f;
            stack[^1] = new Entry { panel = next };
            Relayout(transitionMs * 0.65f, snap: false);
            next.PlayStagger();

            GameObject target = next.firstSelected ? next.firstSelected.gameObject : null;
            if (rememberFocus && memory.TryGetValue(next, out var m) && m) target = m;
            SelectNextFrame(target);
        }

        /* ───── 배치 ───── */

        /// <summary>깊이에 맞춰 각 칸의 목표 위치 · 투명도를 정하고 unscaled 시간으로 보간한다</summary>
        void Relayout(float ms, bool snap)
        {
            busyUntil = Time.unscaledTime + ms / 1000f;
            Changed?.Invoke(this);
            if (layoutRoutine != null) StopCoroutine(layoutRoutine);
            layoutRoutine = StartCoroutine(LayoutRoutine(ms / 1000f, snap));
        }

        IEnumerator LayoutRoutine(float seconds, bool snap)
        {
            // 겹쳐 뜨는 패널(확인 창)은 슬롯 계산에서 뺀다
            var slots = new List<MenuPanel>();
            foreach (var e in stack) if (!e.panel.overlay) slots.Add(e.panel);
            int d = slots.Count;
            var from = new Vector2[d];
            var to = new Vector2[d];
            var a0 = new float[d];
            var a1 = new float[d];
            for (int i = 0; i < d; i++)
            {
                var p = slots[i];
                int rel = i - (d - 1);   // 0 = 맨 위
                float x = d == 1 ? leftX : rel == 0 ? rightX : rel == -1 ? leftX : spineX;
                float a = rel == 0 || d == 1 ? 1f : rel == -1 ? 0.55f : rel == -2 ? 0.6f : 0f;
                from[i] = p.Rect.anchoredPosition;
                to[i] = new Vector2(x, from[i].y);
                a0[i] = p.Group.alpha;
                a1[i] = a;
            }
            float t = snap ? seconds : 0f;
            do
            {
                t += Time.unscaledDeltaTime;
                float k = seconds <= 0f ? 1f : Mathf.Clamp01(t / seconds);
                float e = 1f - Mathf.Pow(1f - k, 3f);   // easeOutCubic
                for (int i = 0; i < d; i++)
                {
                    slots[i].Rect.anchoredPosition = Vector2.LerpUnclamped(from[i], to[i], snap ? 1f : e);
                    slots[i].Group.alpha = Mathf.Lerp(a0[i], a1[i], snap ? 1f : e);
                }
                if (k >= 1f) break;
                yield return null;
            } while (true);
            layoutRoutine = null;
        }

        /// <summary>빠지는 패널 — 들어온 반대 방향으로 (easeInCubic)</summary>
        IEnumerator Leave(MenuPanel panel, float ms, int dir)
        {
            if (panel.overlay)
            {
                panel.gameObject.SetActive(false);
                yield break;
            }
            var start = panel.Rect.anchoredPosition;
            var end = new Vector2(start.x + slideDistance * dir, start.y);
            float a = panel.Group.alpha;
            float seconds = ms / 1000f;
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime)
            {
                float k = t / seconds;
                float e = k * k * k;
                panel.Rect.anchoredPosition = Vector2.LerpUnclamped(start, end, e);
                panel.Group.alpha = Mathf.Lerp(a, 0f, e);
                yield return null;
            }
            // 그 사이 다시 스택에 올라왔으면 끄지 않는다
            foreach (var e in stack) if (e.panel == panel) yield break;
            panel.gameObject.SetActive(false);
        }

        /* ───── 선택 ───── */

        static GameObject CurrentSelection() => EventSystem.current ? EventSystem.current.currentSelectedGameObject : null;

        /// <summary>SetActive 직후 같은 프레임에 선택하면 하이라이트가 안 보일 수 있다 → 한 프레임 뒤</summary>
        void SelectNextFrame(GameObject go)
        {
            if (go) StartCoroutine(SelectRoutine(go));
        }

        IEnumerator SelectRoutine(GameObject go)
        {
            yield return null;
            if (EventSystem.current && go && go.activeInHierarchy) EventSystem.current.SetSelectedGameObject(go);
        }

        /// <summary>선택이 풀렸을 때(빈 곳 클릭 등) 되돌릴 항목 — 맨 위 패널의 기억 또는 첫 항목</summary>
        public GameObject FallbackSelection()
        {
            if (stack.Count == 0) return null;
            var top = stack[^1];
            if (memory.TryGetValue(top.panel, out var m) && m && m.activeInHierarchy) return m;
            return top.panel.firstSelected ? top.panel.firstSelected.gameObject : null;
        }

        /// <summary>MenuItemView 가 선택될 때 알려 준다 (빈 곳 클릭 뒤 복원용 기억)</summary>
        public void Remember(MenuPanel panel, GameObject item) => memory[panel] = item;
    }
}
