using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using UnityEngine.UIElements.Experimental;   // 6.3 에서 링크 이벤트는 Experimental 네임스페이스에 있다 (컴파일로 확인)

namespace UIGallery.ContextLoreGlossary
{
    // 맥락 용어집 + 중첩 툴팁 — UI Toolkit 버전 (LoreDatabase · LinkState 는 ugui 폴더의 것을 그대로 쓴다).
    // Label 의 리치 텍스트 <link="id"> 에 Unity 6 링크 이벤트(PointerOverLinkTagEvent · PointerOutLinkTagEvent ·
    // PointerUpLinkTagEvent, 네임스페이스 UnityEngine.UIElements.Experimental)를 달아 키워드를 판정한다.
    // Experimental 이라 다음 버전에서 이름 · 위치가 바뀔 수 있다. 툴팁은 VisualElement 를 풀에서 꺼내 #tooltip-layer 에 쌓는다.
    // 규칙은 UGUI 판 TooltipStack 과 같다: 머무르면 고정 → 안으로 · 고정 안 된 겹은 즉시 닫힘 · 깊이 한도 · 순환 표시 · 뒤집기 → Clamp.
    // 키보드 · 패드: 글(Label)이 포커스를 받고 NavigationMoveEvent 로 ←→ 키워드 · ↓ 고정하고 안으로 · ↑ 바깥으로.
    // 콜백은 OnEnable 에서 달고 OnDisable 에서 뗀다 — 컴포넌트만 껐다 켜면 같은 트리에 두 번 달려 이동이 두 번 처리된다.
    [RequireComponent(typeof(UIDocument))]
    public class LoreGlossaryUITK : MonoBehaviour
    {
        [SerializeField] LoreDatabase db;
        [SerializeField] int scene;
        [SerializeField] int line = 1;

        [Header("툴팁")]
        [SerializeField, Range(1, 4)] int maxDepth = 3;
        [SerializeField, Range(0f, 1.5f)] float lockSeconds = 0.7f;
        [SerializeField] float closeGrace = 0.45f, gap = 14f, edgeMargin = 24f;
        [SerializeField] bool markCycles = true, edgeCorrection = true;

        [Header("용어집")]
        [SerializeField] GlossaryScope scope = GlossaryScope.Scene;
        [SerializeField] bool holdToOpen = true;
        [SerializeField] InputActionReference glossaryAction;   // <Keyboard>/g · <Gamepad>/select
        [SerializeField] InputActionReference nextLineAction;   // 시험용 <Keyboard>/n

        /// 글 하나의 원문(마크업)과 깊이. Label.userData 에 둔다
        class Source
        {
            public string markup;
            public int level;
            public int tip = -1;   // 툴팁 안 글이면 그 툴팁 번호
        }

        class Tip
        {
            public string entry;
            public Label from;
            public int link;
            public bool locked, left;
            public float dwell, grace;
            public VisualElement el, lockFill;
            public Label body, status, note;
            public Rect anchor, placed;
        }

        VisualElement root, layer, glossary;
        Label sceneTitle, dialogue, glossaryTitle, glossaryCount, detailTitle, detailBody;
        ScrollView list;
        readonly List<Tip> stack = new();
        readonly Stack<Tip> pool = new();
        readonly List<Button> rows = new();
        readonly List<LoreEntry> shown = new();

        Label hoverLabel, focusLabel;
        int hoverLink = -1, focusLink = -1;
        int pendingLink = -1;
        bool pendingOpen = true;
        Vector2 pointer;
        int echo = -1;
        float echoUntil;
        bool open, held;
        Focusable opener;
        Label savedLabel;          // 용어집을 열 때의 키보드 위치 (글, 링크 번호) — 닫으면 그 자리로
        int savedLink = -1;
        string lastId;             // 용어집에서 마지막에 고른 항목 (다시 열면 그 줄부터)
        int touchPin = -1;         // 터치 탭으로 붙잡은 겹 — 다른 곳을 탭할 때까지 닫지 않는다
        bool touchDown;            // 지금 누른 포인터가 터치인가
        int pressFrame = -10;      // 포인터를 누른 프레임 — 마우스로 눌러 온 FocusIn 을 가린다

        void OnEnable()
        {
            // UIDocument 를 다시 켜면 트리가 새로 만들어진다 → 참조와 목록을 다시 모은다
            root = GetComponent<UIDocument>().rootVisualElement;
            layer = root.Q("tooltip-layer");
            glossary = root.Q("glossary");
            sceneTitle = root.Q<Label>("scene-title");
            dialogue = root.Q<Label>("dialogue-text");
            glossaryTitle = root.Q<Label>("glossary-title");
            glossaryCount = root.Q<Label>("glossary-count");
            detailTitle = root.Q<Label>("detail-title");
            detailBody = root.Q<Label>("detail-body");
            list = root.Q<ScrollView>("glossary-list");
            stack.Clear();
            pool.Clear();
            rows.Clear();
            shown.Clear();
            list.Clear();   // 컴포넌트만 껐다 켜면 트리가 그대로라 지난 행이 남아 있다
            hoverLabel = focusLabel = savedLabel = null;
            hoverLink = focusLink = pendingLink = echo = touchPin = -1;
            open = held = false;

            layer.pickingMode = PickingMode.Ignore;   // 레이어 자신만 통과. 자식 툴팁은 포인터를 받는다 (pickingMode 는 상속되지 않는다)
            root.RegisterCallback<PointerMoveEvent>(OnRootMove, TrickleDown.TrickleDown);
            root.RegisterCallback<PointerDownEvent>(OnRootDown, TrickleDown.TrickleDown);
            glossary.RegisterCallback<NavigationCancelEvent>(OnGlossaryCancel);
            dialogue.userData = new Source { level = 0 };
            Hook(dialogue);

            if (glossaryAction != null) glossaryAction.action.Enable();
            if (nextLineAction != null) nextLineAction.action.Enable();
            scene = Mathf.Clamp(scene, 0, Mathf.Max(0, db.scenes.Count - 1));
            line = Mathf.Clamp(line, 0, Mathf.Max(0, db.scenes[scene].lines.Count - 1));
            SetGlossary(false, false);
            RenderScene();
        }

        void OnDisable()
        {
            if (root == null) return;
            // 단 콜백을 뗀다 — 남기면 다시 켤 때 두 번 달린다
            root.UnregisterCallback<PointerMoveEvent>(OnRootMove, TrickleDown.TrickleDown);
            root.UnregisterCallback<PointerDownEvent>(OnRootDown, TrickleDown.TrickleDown);
            glossary.UnregisterCallback<NavigationCancelEvent>(OnGlossaryCancel);
            Unhook(dialogue);
            SetGlossary(false, false);
            Truncate(0);
        }

        void OnApplicationFocus(bool focus)
        {
            if (!focus && open && held) SetGlossary(false, false);   // 누른 채 창을 떠나면 뗀 신호가 오지 않는다
        }

        void OnRootMove(PointerMoveEvent e) => pointer = e.position;

        void OnRootDown(PointerDownEvent e)
        {
            pressFrame = Time.frameCount;
            touchDown = e.pointerType == UnityEngine.UIElements.PointerType.touch;
            if (!touchDown || touchPin < 0) return;
            // 터치로 붙잡은 툴팁은 바깥(툴팁 · 대사 밖)을 탭하면 모두 닫는다
            Vector2 p = e.position;
            bool inside = dialogue.worldBound.Contains(p);
            foreach (var t in stack) inside |= t.el.worldBound.Contains(p);
            if (!inside) Truncate(0);
        }

        void OnGlossaryCancel(NavigationCancelEvent e)
        {
            if (!open || held) return;
            SetGlossary(false, true);
            e.StopPropagation();
        }

        // ───────── 글 · 링크 이벤트 ─────────

        void Hook(Label l)
        {
            l.enableRichText = true;
            l.focusable = true;
            l.RegisterCallback<PointerOverLinkTagEvent>(OnLinkOver);
            l.RegisterCallback<PointerOutLinkTagEvent>(OnLinkOut);
            l.RegisterCallback<PointerUpLinkTagEvent>(OnLinkUp);
            l.RegisterCallback<FocusInEvent>(OnTextFocusIn);
            l.RegisterCallback<FocusOutEvent>(OnTextFocusOut);
            l.RegisterCallback<NavigationMoveEvent>(OnTextMove);
            l.RegisterCallback<NavigationSubmitEvent>(OnTextSubmit);
            l.RegisterCallback<NavigationCancelEvent>(OnTextCancel);
        }

        void Unhook(Label l)
        {
            l.UnregisterCallback<PointerOverLinkTagEvent>(OnLinkOver);
            l.UnregisterCallback<PointerOutLinkTagEvent>(OnLinkOut);
            l.UnregisterCallback<PointerUpLinkTagEvent>(OnLinkUp);
            l.UnregisterCallback<FocusInEvent>(OnTextFocusIn);
            l.UnregisterCallback<FocusOutEvent>(OnTextFocusOut);
            l.UnregisterCallback<NavigationMoveEvent>(OnTextMove);
            l.UnregisterCallback<NavigationSubmitEvent>(OnTextSubmit);
            l.UnregisterCallback<NavigationCancelEvent>(OnTextCancel);
        }

        static Rect PointAnchor(Vector2 p) => new(p.x - 6f, p.y - 22f, 12f, 30f);

        void OnLinkOver(PointerOverLinkTagEvent e)
        {
            var l = (Label)e.currentTarget;
            hoverLabel = l;
            hoverLink = IndexOf(l, e.linkID);
            Open(l, hoverLink, e.linkID, PointAnchor(e.position));
        }

        void OnLinkOut(PointerOutLinkTagEvent e)
        {
            var l = (Label)e.currentTarget;
            if (hoverLabel == l) { hoverLabel = null; hoverLink = -1; }
            echo = -1;
            PruneUnlocked();
        }

        void OnLinkUp(PointerUpLinkTagEvent e)
        {
            var l = (Label)e.currentTarget;
            int k = IndexOf(l, e.linkID);
            Open(l, k, e.linkID, PointAnchor(e.position));
            int lv = Src(l).level;
            if (lv >= stack.Count || stack[lv].from != l || stack[lv].link != k) return;
            Lock(lv);                            // 누르면(터치 포함) 바로 고정
            touchPin = touchDown ? lv : -1;      // 터치는 손을 떼면 포인터가 나간다 — 다른 곳을 탭할 때까지 붙잡는다
        }

        void OnTextFocusIn(FocusInEvent e)
        {
            var l = (Label)e.currentTarget;
            var prev = focusLabel;
            bool byPointer = pendingLink < 0 && Time.frameCount - pressFrame <= 1;   // 마우스 · 터치로 눌러 온 포커스 — 0번 키워드를 열지 않는다
            focusLabel = l;
            focusLink = pendingLink >= 0 ? pendingLink : byPointer ? -1 : 0;
            bool openNow = pendingOpen && !byPointer;
            pendingLink = -1;
            pendingOpen = true;
            if (prev != null && prev != l) Render(prev);
            Render(l);
            if (openNow) OpenFocused();
        }

        void OnTextFocusOut(FocusOutEvent e)
        {
            var l = (Label)e.currentTarget;
            if (focusLabel != l || open) return;   // 용어집이 열린 동안은 키보드 위치를 그대로 둔다 (닫으면 돌아온다)
            if (e.relatedTarget is Label next && next.userData is Source) return;   // 다른 글로 옮기는 중 — 그쪽 FocusIn 이 처리
            focusLabel = null;
            focusLink = -1;
            Render(l);
            PruneUnlocked();
        }

        void OnTextMove(NavigationMoveEvent e) => Move((Label)e.currentTarget, e);

        void OnTextSubmit(NavigationSubmitEvent e)
        {
            Descend((Label)e.currentTarget);
            e.StopPropagation();
        }

        void OnTextCancel(NavigationCancelEvent e)
        {
            CloseTop();
            e.StopPropagation();
        }

        static Source Src(Label l) => (Source)l.userData;

        int IndexOf(Label l, string id) => LoreDatabase.LinksOf(Src(l).markup).IndexOf(id);

        void Render(Label l)
        {
            var src = Src(l);
            int lv = src.level;
            l.text = db.ToRichText(src.markup,
                id => lv == 0 ? LinkState.Link : lv >= maxDepth ? LinkState.Flat : markCycles && InStack(id, lv - 1) ? LinkState.Cycle : LinkState.Link,
                l == focusLabel ? focusLink : -1);
        }

        Rect LabelAnchor(Label l) => new(l.worldBound.x + 12f, l.worldBound.y, 60f, 34f);   // 키보드: 링크 사각형을 공개 API 로 얻을 수 없어 글 머리에 붙인다

        void OpenFocused()
        {
            if (focusLabel == null || focusLink < 0) return;
            var ids = LoreDatabase.LinksOf(Src(focusLabel).markup);
            if (focusLink < ids.Count) Open(focusLabel, focusLink, ids[focusLink], LabelAnchor(focusLabel));
        }

        // ───────── 스택 ─────────

        void Open(Label from, int link, string id, Rect anchorPanel)
        {
            int level = Src(from).level;
            if (level >= maxDepth || stack.Count < level || link < 0) return;
            int dup = -1;
            for (int i = 0; i < level; i++) if (stack[i].entry == id) dup = i;
            if (markCycles && dup >= 0) { echo = dup; echoUntil = Time.unscaledTime + 1.6f; return; }
            if (stack.Count > level && stack[level].from == from && stack[level].link == link) return;
            var e = db.Get(id);
            if (e == null) return;
            Truncate(level);
            var t = Rent();
            t.entry = id;
            t.from = from;
            t.link = link;
            t.locked = lockSeconds <= 0f;
            t.dwell = t.grace = 0f;
            t.anchor = layer.WorldToLocal(anchorPanel);
            stack.Add(t);
            string hex = LoreDatabase.KindHex(e.kind);
            t.el.Q<Label>("title").text = $"<color={hex}>{LoreDatabase.KindGlyph(e.kind)} {e.displayName}</color>  <size=70%><color=#9FB4C9>{LoreDatabase.KindLabel(e.kind)} · {e.role}</color></size>";
            Src(t.body).markup = e.body;
            Src(t.body).level = level + 1;
            Src(t.body).tip = level;
            Render(t.body);
            t.el.Q<Label>("depth").text = $"깊이 {level + 1}/{maxDepth}{(level + 1 >= maxDepth ? " · 한도" : "")}";
            layer.Add(t.el);
            // 진입 transition: 스타일이 한 번 계산된 뒤 클래스를 바꾼다 (지연 없는 Execute 는 계산 전에 돌 수 있다)
            t.el.schedule.Execute(() => t.el.AddToClassList("tip--in")).StartingIn(16);
            Place(stack.Count - 1);
        }

        void Lock(int level)
        {
            if (level >= stack.Count) return;
            stack[level].locked = true;
            stack[level].dwell = 1f;
        }

        void Truncate(int n)
        {
            while (stack.Count > n)
            {
                var top = stack[stack.Count - 1];
                if (focusLabel == top.body) { focusLabel = null; focusLink = -1; }
                if (hoverLabel == top.body) { hoverLabel = null; hoverLink = -1; }
                top.el.RemoveFromClassList("tip--in");
                top.el.RemoveFromClassList("tip--locked");
                top.el.RemoveFromClassList("tip--echo");
                top.el.RemoveFromHierarchy();   // 숨기는 대신 떼어 낸다 — 남겨 두면 opacity 0 이어도 포인터를 받는다
                pool.Push(top);
                stack.RemoveAt(stack.Count - 1);
            }
            if (echo >= n) echo = -1;
            touchPin = Mathf.Min(touchPin, n - 1);
        }

        bool InStack(string id, int upTo)
        {
            for (int i = 0; i <= upTo && i < stack.Count; i++) if (stack[i].entry == id) return true;
            return false;
        }

        int HeldBy(Label l, int link)
        {
            if (l == null) return -1;
            int lv = Src(l).level;
            return stack.Count > lv && stack[lv].from == l && stack[lv].link == link ? lv : lv - 1;
        }

        int Held()
        {
            int h = Mathf.Max(HeldBy(hoverLabel, hoverLink), HeldBy(focusLabel, focusLink), touchPin);
            for (int i = 0; i < stack.Count; i++) if (stack[i].el.worldBound.Contains(pointer)) h = Mathf.Max(h, i);
            return h;
        }

        void PruneUnlocked()
        {
            if (open) return;   // 용어집이 열린 동안은 스택을 그대로 둔다
            int h = Held(), n = stack.Count;
            while (n - 1 > h && n > 0 && !stack[n - 1].locked) n--;
            Truncate(n);
        }

        void Tick(float dt)
        {
            int h = Held();
            for (int i = 0; i < stack.Count; i++)
            {
                var t = stack[i];
                if (!t.locked && i <= h && (t.dwell += dt / Mathf.Max(0.0001f, lockSeconds)) >= 1f) Lock(i);
                if (i <= h) t.grace = 0f;
            }
            int cut = stack.Count;
            for (int i = stack.Count - 1; i > h; i--)
            {
                var t = stack[i];
                if (!t.locked) { cut = i; continue; }
                if ((t.grace += dt) >= closeGrace) cut = i;
            }
            Truncate(cut);
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            HandleGlossaryInput();
            if (!open) Tick(dt);   // 용어집이 열린 동안은 머무름 · 닫힘 유예를 멈춘다 (닫으면 그 자리로)
            if (echo >= 0 && Time.unscaledTime >= echoUntil) echo = -1;
            bool beat = Mathf.Repeat(Time.unscaledTime * 1.25f, 1f) < 0.5f;   // 순환 강조 맥동 1.25Hz (웹 · UGUI 와 같게, USS border-color transition)
            for (int i = 0; i < stack.Count; i++)
            {
                var t = stack[i];
                t.lockFill.style.width = Length.Percent((t.locked ? 1f : Mathf.Clamp01(t.dwell)) * 100f);
                t.el.EnableInClassList("tip--locked", t.locked);
                t.el.EnableInClassList("tip--echo", i == echo && beat);
                t.status.text = t.locked ? "고정됨 · 안으로 들어갈 수 있다" : "머무르면 고정";
            }
        }

        // ───────── 툴팁 요소 ─────────

        Tip Rent()
        {
            if (pool.Count > 0) return pool.Pop();
            var t = new Tip { el = new VisualElement() };
            t.el.AddToClassList("tip");
            t.note = new Label { name = "note", pickingMode = PickingMode.Ignore };
            t.note.AddToClassList("tip__note");
            var title = new Label { name = "title", enableRichText = true, pickingMode = PickingMode.Ignore };
            title.AddToClassList("tip__title");
            t.body = new Label { name = "body", userData = new Source() };
            t.body.AddToClassList("tip__body");
            Hook(t.body);
            var foot = new VisualElement { pickingMode = PickingMode.Ignore };
            foot.AddToClassList("tip__foot");
            var bar = new VisualElement { pickingMode = PickingMode.Ignore };
            bar.AddToClassList("tip__lock");
            t.lockFill = new VisualElement { pickingMode = PickingMode.Ignore };
            t.lockFill.AddToClassList("tip__lock-fill");
            bar.Add(t.lockFill);
            t.status = new Label { name = "status", pickingMode = PickingMode.Ignore };
            t.status.AddToClassList("tip__status");
            var depth = new Label { name = "depth", pickingMode = PickingMode.Ignore };
            depth.AddToClassList("tip__depth");
            foot.Add(bar);
            foot.Add(t.status);
            foot.Add(depth);
            t.el.Add(t.note);
            t.el.Add(title);
            t.el.Add(t.body);
            t.el.Add(foot);
            // 크기가 정해지면(내용이 바뀔 때마다) 다시 놓는다
            t.el.RegisterCallback<GeometryChangedEvent>(_ => { int i = stack.IndexOf(t); if (i >= 0) Place(i); });
            return t;
        }

        void Place(int i)
        {
            var t = stack[i];
            float w = t.el.resolvedStyle.width, h = t.el.resolvedStyle.height;
            if (float.IsNaN(w) || float.IsNaN(h) || w <= 0f) return;   // 아직 레이아웃 전 → GeometryChangedEvent 에서 다시
            Rect a = t.anchor, b = layer.layout;
            float x, y;
            string note = "";
            if (i == 0)
            {
                x = a.center.x - w * 0.5f;
                y = a.yMin - gap - h;   // UI Toolkit 은 y 가 아래로 증가
                if (edgeCorrection && y < edgeMargin && a.yMax + gap + h <= b.height - edgeMargin) { y = a.yMax + gap; note = "위 공간 부족 → 아래로"; }
            }
            else
            {
                // 하위 겹: 부모 옆, 키워드 줄 높이 — 부모 아래 변보다 내려가지 않게.
                // 뒤집기는 둘째 겹만. 셋째 겹부터는 부모 방향으로 이어 가고 모자라면 Clamp (되돌아가면 첫 겹을 덮는다)
                Rect parent = stack[i - 1].placed;
                bool left = i > 1 && edgeCorrection && stack[i - 1].left;
                float toRight = parent.xMax + gap, toLeft = parent.xMin - gap - w;
                x = left ? toLeft : toRight;
                y = Mathf.Min(a.yMin - 28f, parent.yMax - h);
                if (edgeCorrection && i == 1 && !(left ? x >= edgeMargin : x + w <= b.width - edgeMargin) && (left ? toRight + w <= b.width - edgeMargin : toLeft >= edgeMargin))
                {
                    left = !left;
                    x = left ? toLeft : toRight;
                    note = left ? "오른쪽 공간 부족 → 왼쪽으로" : "왼쪽 공간 부족 → 오른쪽으로";
                }
                t.left = left;
            }
            if (edgeCorrection)
            {
                float cx = Mathf.Clamp(x, edgeMargin, b.width - edgeMargin - w);
                bool stacked = false;
                if (i > 1 && cx != x)
                {
                    // 옆자리가 모자라면 부모 위 → 부모 반대쪽 → 부모 아래 중 앞 겹들과 겹치지 않는 첫 자리 (없으면 부모만 피하는 자리).
                    // 부모 안의 여는 키워드를 덮으면 키워드가 가려져 나감 → 닫힘 → 다시 열림이 반복된다. 모두 안 되면 여는 키워드 줄만 피한다
                    var pt = stack[i - 1];
                    Rect par = pt.placed, area = Rect.MinMaxRect(edgeMargin, edgeMargin, b.width - edgeMargin, b.height - edgeMargin);
                    bool lf = t.left;
                    var cands = new (float x, float y, string note, bool left)[]
                    {
                        (cx, par.yMin - gap - h - (pt.note.ClassListContains("hidden") ? 0f : 40f), "옆 공간 부족 → 부모 위로", lf),
                        (lf ? par.xMax + gap : par.xMin - gap - w, y, lf ? "왼쪽 공간 부족 → 오른쪽으로" : "오른쪽 공간 부족 → 왼쪽으로", !lf),
                        (cx, par.yMax + gap, "옆 공간 부족 → 부모 아래로", lf),
                    };
                    int pick = -1;
                    for (int pass = 0; pass < 2 && pick < 0; pass++)
                        for (int c = 0; c < cands.Length && pick < 0; c++)
                            if (Clear(new Rect(cands[c].x, cands[c].y, w, h), area, pass == 0 ? 0 : i - 1, i)) pick = c;
                    stacked = pick >= 0;
                    if (stacked)
                    {
                        (x, y, note, t.left) = cands[pick];
                        cx = x;
                    }
                    else y = a.yMin - gap - h >= edgeMargin ? a.yMin - gap - h : a.yMax + gap;
                }
                float cy = Mathf.Clamp(y, edgeMargin, b.height - edgeMargin - h);
                if (!stacked && (cx != x || cy != y)) note = note.Length > 0 ? note + " · 화면 안으로 고정" : "화면 안으로 고정";
                x = cx;
                y = cy;
            }
            t.el.style.left = x;
            t.el.style.top = y;
            t.placed = new Rect(x, y, w, h);
            t.note.text = note;
            t.note.EnableInClassList("hidden", note.Length == 0);
            // 하위 겹은 부모 위치를 따라가므로 이어서 다시 놓는다
            if (i + 1 < stack.Count) Place(i + 1);
        }

        /// r 이 area 안에 있고 앞 겹(from..upTo-1)과 겹치지 않는가
        bool Clear(Rect r, Rect area, int from, int upTo)
        {
            if (r.xMin < area.xMin || r.xMax > area.xMax || r.yMin < area.yMin || r.yMax > area.yMax) return false;
            for (int k = from; k < upTo; k++) if (stack[k].placed.Overlaps(r)) return false;
            return true;
        }

        // ───────── 키보드 · 패드 ─────────

        void Move(Label l, NavigationMoveEvent e)
        {
            int n = LoreDatabase.LinksOf(Src(l).markup).Count;
            switch (e.direction)
            {
                case NavigationMoveEvent.Direction.Left:
                case NavigationMoveEvent.Direction.Right:
                    if (n == 0) return;
                    focusLink = Mathf.Clamp(focusLink + (e.direction == NavigationMoveEvent.Direction.Right ? 1 : -1), 0, n - 1);
                    Render(l);
                    OpenFocused();
                    break;
                case NavigationMoveEvent.Direction.Down:
                    Descend(l);
                    break;
                case NavigationMoveEvent.Direction.Up:
                    Ascend(l);
                    break;
                default:
                    return;
            }
            // 직접 처리한 이동은 전파를 멈추고 기본 포커스 이동도 막는다 (Unity 6.3 은 둘 다 해야 한 칸만 움직인다)
            e.StopPropagation();
            l.focusController?.IgnoreEvent(e);
        }

        void Descend(Label l)
        {
            if (focusLabel != l || focusLink < 0) return;
            int lv = Src(l).level;
            var ids = LoreDatabase.LinksOf(Src(l).markup);
            if (focusLink >= ids.Count) return;
            string id = ids[focusLink];
            if (markCycles && InStack(id, lv - 1)) { Open(l, focusLink, id, LabelAnchor(l)); return; }   // 순환은 짚기만
            if (stack.Count <= lv || stack[lv].from != l || stack[lv].link != focusLink) Open(l, focusLink, id, LabelAnchor(l));
            if (stack.Count <= lv) return;
            Lock(lv);
            var child = stack[lv].body;
            if (lv + 1 < maxDepth && LoreDatabase.LinksOf(Src(child).markup).Count > 0) FocusText(child, 0, true);
        }

        void Ascend(Label l)
        {
            int lv = Src(l).level;
            if (lv == 0 || stack.Count < lv) return;
            var parent = stack[lv - 1];
            Truncate(lv);
            FocusText(parent.from, parent.link, false);
        }

        void CloseTop()
        {
            if (stack.Count == 0) return;
            var top = stack[stack.Count - 1];
            Truncate(stack.Count - 1);
            FocusText(top.from, top.link, false);
        }

        void FocusText(Label l, int link, bool openTip)
        {
            if (focusLabel == l)
            {
                focusLink = link;   // 이미 포커스가 있으면 FocusIn 이 다시 오지 않는다 — 직접 반영
                Render(l);
                if (openTip) OpenFocused();
                return;
            }
            pendingLink = link;
            pendingOpen = openTip;
            // 막 붙인 툴팁 글은 아직 배치 전이라 같은 프레임의 Focus() 가 실패할 수 있다 → 한 프레임 미룬다
            l.schedule.Execute(() =>
            {
                if (l.panel != null) l.Focus();
                else pendingLink = -1;
            });
        }

        // ───────── 장면 · 용어집 ─────────

        public void NextLine()
        {
            if (line < db.scenes[scene].lines.Count - 1) line++;
            else { scene = (scene + 1) % db.scenes.Count; line = 0; }
            RenderScene();
        }

        void RenderScene()
        {
            Truncate(0);
            var sc = db.scenes[scene];
            var place = db.Get(sc.place);
            sceneTitle.text = $"장면 {scene + 1}/{db.scenes.Count} · {sc.title}  <size=70%>{(place != null ? place.displayName : "")} · 대사 {line + 1}/{sc.lines.Count}</size>";
            var markup = new System.Text.StringBuilder();
            for (int l = 0; l <= line && l < sc.lines.Count; l++)
            {
                var who = db.Get(sc.lines[l].speaker);
                markup.Append(l == line ? "" : "<alpha=#99>").Append($"<b><color=#7FD3FF>{(who != null ? who.displayName : sc.lines[l].speaker)}</color></b>  ").Append(sc.lines[l].text).Append("<alpha=#FF>");
                if (l < line) markup.Append('\n');
            }
            Src(dialogue).markup = markup.ToString();
            if (focusLabel == dialogue) focusLink = 0;
            Render(dialogue);
            if (open) BuildList();
        }

        void HandleGlossaryInput()
        {
            var g = glossaryAction != null ? glossaryAction.action : null;
            if (g != null && g.WasPressedThisFrame())
            {
                if (open && !held) SetGlossary(false, true);
                else if (!open) { held = holdToOpen; SetGlossary(true, false); }
            }
            if (g != null && g.WasReleasedThisFrame() && open && held) SetGlossary(false, false);
            if (!open && nextLineAction != null && nextLineAction.action.WasPressedThisFrame()) NextLine();
        }

        /// 일시정지 메뉴에서 부른다 — 포커스를 마지막에 고른 항목(처음엔 첫 항목)으로 옮긴다
        public void OpenPaused()
        {
            held = false;
            SetGlossary(true, false);
        }

        void SetGlossary(bool on, bool restore)
        {
            var fc = glossary.focusController;
            if (on && !open)
            {
                opener = held ? null : fc?.focusedElement;
                savedLabel = focusLabel;   // 키보드 위치 (글, 링크 번호) — 툴팁 스택도 닫지 않고 멈춰 둔다
                savedLink = focusLink;
            }
            open = on;
            glossary.EnableInClassList("glossary--open", on);
            // opacity 만 0 으로 두면 포인터를 받는다 — visibility(상속됨)로 끈다
            glossary.style.visibility = on ? Visibility.Visible : Visibility.Hidden;
            if (!on)
            {
                bool back = restore && opener is VisualElement ve && ve.panel != null;
                if (back)
                {
                    if (opener == savedLabel) { focusLink = pendingLink = savedLink; pendingOpen = false; }   // 고르던 키워드로 돌아온다
                    ((VisualElement)opener).Focus();
                }
                else if (fc?.focusedElement is VisualElement f && glossary.Contains(f)) f.Blur();
                if (focusLabel != null && fc?.focusedElement != focusLabel && !(back && opener == focusLabel))
                {
                    var l = focusLabel;   // 포커스가 글로 돌아오지 않았다 — 키보드 위치를 푼다
                    focusLabel = null;
                    focusLink = -1;
                    Render(l);
                    PruneUnlocked();
                }
                opener = null;
                savedLabel = null;
                return;
            }
            int k = BuildList();
            if (held || rows.Count == 0) return;
            var row = rows[k];
            row.schedule.Execute(() => row.Focus());   // 막 보이게 한 요소는 한 프레임 뒤에 Focus() (같은 프레임이면 실패할 수 있다)
        }

        /// 목록을 다시 그리고 보여 줄 행 번호(마지막에 고른 항목, 없으면 0)를 돌려준다
        int BuildList()
        {
            shown.Clear();
            shown.AddRange(db.Query(scope, scene, line));
            glossaryTitle.text = scope switch
            {
                GlossaryScope.Scene => $"지금 장면 — {db.scenes[scene].title}",
                GlossaryScope.Seen => "지금까지 나온 항목",
                _ => "전체 사전 (아직 안 나온 항목 포함)",
            };
            glossaryCount.text = $"{shown.Count} / {db.entries.Count}";
            while (rows.Count < shown.Count)
            {
                int index = rows.Count;
                var b = new Button { focusable = true };
                b.AddToClassList("glossary__row");
                b.RegisterCallback<FocusInEvent>(_ => { if (index < shown.Count) ShowDetail(shown[index]); });
                b.clicked += () => { if (index < shown.Count) ShowDetail(shown[index]); };
                list.Add(b);
                rows.Add(b);
            }
            for (int i = 0; i < rows.Count; i++)
            {
                bool on = i < shown.Count;
                rows[i].style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
                if (!on) continue;
                var e = shown[i];
                rows[i].text = $"<color={LoreDatabase.KindHex(e.kind)}>{LoreDatabase.KindGlyph(e.kind)} <b>{e.displayName}</b></color>  <size=80%>{LoreDatabase.KindLabel(e.kind)} · {e.role}</size>{(db.IsFresh(e.id, scene, line) ? "  <b><color=#FFE066>새</color></b>" : "")}";
            }
            int k = Mathf.Max(0, shown.FindIndex(e => e.id == lastId));
            if (shown.Count > 0) ShowDetail(shown[k]);
            return k;
        }

        void ShowDetail(LoreEntry e)
        {
            lastId = e.id;
            detailTitle.text = $"<color={LoreDatabase.KindHex(e.kind)}>{LoreDatabase.KindGlyph(e.kind)} {e.displayName}</color>";
            var (s, l) = db.FirstSeen(e.id);
            bool seen = s >= 0 && (s < scene || (s == scene && l <= line));
            detailBody.text = db.ToRichText(e.body, _ => LinkState.Flat).Replace("…", "")
                + (seen ? $"\n\n<size=80%>처음 나온 곳 · 장면 {s + 1} {db.scenes[s].title} · {l + 1}번째 대사</size>" : "\n\n<size=80%>아직 이야기에 나오지 않았다 — 스포일러</size>");
        }
    }
}
