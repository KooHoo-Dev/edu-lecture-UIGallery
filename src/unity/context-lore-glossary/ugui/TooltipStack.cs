using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.ContextLoreGlossary
{
    // 중첩 툴팁 스택. 규칙:
    //   ① 키워드에 올리면(또는 키보드로 고르면) 그 깊이의 툴팁을 열고 더 깊은 것은 닫는다
    //   ② 머무는 동안 잠금 링이 차고(lockSeconds), 다 차면 고정 → 그때부터 포인터가 툴팁 안으로 들어갈 수 있다
    //   ③ 고정 안 된 툴팁은 포인터가 떠나는 즉시, 고정된 툴팁은 closeGrace 동안 기다렸다가 닫는다
    //   ④ 깊이 한도(maxDepth)의 마지막 겹 안 키워드는 링크가 아니다. 이미 위에 열린 항목(순환)은 ↑ 로 표시하고 그 툴팁을 짚는다
    //   ⑤ 위치: 크기 확정(ForceRebuildLayoutImmediate) → 1겹은 키워드 위, 하위 겹은 부모 오른쪽 → 넘치면 뒤집기 → 화면 안으로 Clamp
    // 툴팁은 프리팹 하나를 풀에서 꺼내 쓴다. 코루틴을 쓰지 않고 Update 에서 값으로 처리한다 (꺼질 때 멈춘 상태가 남지 않게).
    public class TooltipStack : MonoBehaviour
    {
        [SerializeField] LoreDatabase db;
        [SerializeField] Canvas canvas;
        [SerializeField] RectTransform layer;          // TooltipLayer — 전체 화면 stretch, 피벗 (0.5, 0.5)
        [SerializeField] RectTransform panelPrefab;    // TooltipPanel 프리팹 (하이어라키는 meta 의 Unity 탭 참고)
        [SerializeField] KeywordText dialogue;         // level 0 글

        [Header("규칙")]
        [SerializeField, Range(1, 4)] int maxDepth = 3;
        [SerializeField, Range(0f, 1.5f)] float lockSeconds = 0.7f;
        [SerializeField] float closeGrace = 0.45f;
        [SerializeField] bool markCycles = true;
        [SerializeField] bool edgeCorrection = true;
        [Tooltip("끄면 나쁜 예: 잠금이 없어 하위 키워드에 갈 수 없다")]
        [SerializeField] bool lockEnabled = true;
        [SerializeField] float gap = 14f, margin = 24f, fadeTime = 0.14f;

        [Header("입력 (UI 액션 맵의 Navigate · Submit · Cancel)")]
        [SerializeField] InputActionReference navigate;
        [SerializeField] InputActionReference submit;
        [SerializeField] InputActionReference cancel;

        [Header("색")]
        [SerializeField] Color idleFrame = new(1f, 1f, 1f, 0.18f);
        [SerializeField] Color lockedFrame = new(1f, 0.88f, 0.4f, 1f);

        /// 용어집이 열려 있는 동안 켜진다(Block) — 방향키가 두 곳에서 동시에 처리되지 않게, 스택은 멈춰 둔다
        bool inputBlocked;
        KeywordText savedText;     // 용어집을 열 때의 키보드 위치 (글, 링크 번호)
        int savedLink = -1;
        int touchPin = -1;         // 터치 탭으로 붙잡은 겹 — 손을 떼면 UI 모듈이 exit 를 보내도 다른 곳을 탭할 때까지 닫지 않는다

        class Panel
        {
            public RectTransform rect;
            public CanvasGroup group;
            public Image frame, ring;
            public TMP_Text title, status, depth, note;
            public KeywordText body;
        }

        class Layer
        {
            public string entry;
            public KeywordText from;   // 이 툴팁을 연 글
            public int link;           // 그 글의 몇 번째 링크
            public bool locked;
            public bool left;          // 부모 왼쪽에 놓였나 (다음 겹이 같은 방향으로 이어 간다)
            public float dwell, grace;
            public Panel panel;
            public Rect placed;
        }

        readonly List<Layer> stack = new();
        readonly Stack<Panel> pool = new();
        KeywordText hoverText, focusText;
        int hoverLink = -1, focusLink = -1;
        int echo = -1;
        float echoUntil;

        public int Depth => stack.Count;
        public bool HasKeyboardFocus => focusText != null;
        Camera Cam => canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;

        void OnEnable()
        {
            // UI 입력 모듈과 같은 액션이면 이미 켜져 있다. 끄는 것은 그쪽에 맡긴다
            if (navigate != null) navigate.action.Enable();
            if (submit != null) submit.action.Enable();
            if (cancel != null) cancel.action.Enable();
        }

        void OnDisable()
        {
            // 꺼질 때 화면에 남는 상태(열린 툴팁 · 포커스 테두리 · 강조)를 모두 되돌린다
            Truncate(0);
            if (focusText != null) focusText.ShowFocus(-1);
            focusText = hoverText = null;
            focusLink = hoverLink = -1;
            echo = touchPin = -1;
            inputBlocked = false;
            savedText = null;
        }

        /// LoreSceneView 가 용어집을 열고 닫을 때 부른다. 여는 동안 머무름 · 닫힘 유예를 멈추고, 닫으면 키보드 위치로 돌아온다
        public void Block(bool on)
        {
            if (on == inputBlocked) return;
            inputBlocked = on;
            if (on)
            {
                savedText = focusText;
                savedLink = focusLink;
                return;
            }
            var t = savedText;
            savedText = null;
            // 다른 버튼으로 선택을 돌려준 경우(일시정지 메뉴에서 열었을 때)는 그쪽을 둔다
            bool free = EventSystem.current == null || EventSystem.current.currentSelectedGameObject == null;
            if (free && t != null && t.isActiveAndEnabled && savedLink >= 0 && savedLink < t.LinkCount) SetFocus(t, savedLink, false);
            else if (!free) ReleaseFocus();
        }

        // ───────── KeywordText 가 부른다 ─────────

        public void KeywordEnter(KeywordText src, int link, string id)
        {
            hoverText = src;
            hoverLink = link;
            Open(src.level, src, link, id);
        }

        public void KeywordExit(KeywordText src)
        {
            if (hoverText == src) { hoverText = null; hoverLink = -1; }
            echo = -1;
            PruneUnlocked();
        }

        public void KeywordClick(KeywordText src, int link, string id, bool touch)
        {
            hoverText = src;
            hoverLink = link;
            Open(src.level, src, link, id);
            if (stack.Count <= src.level || stack[src.level].from != src || stack[src.level].link != link) return;
            Lock(src.level);                        // 누르면 바로 고정
            touchPin = touch ? src.level : -1;      // 터치는 다른 곳을 탭할 때까지 붙잡는다 (웹과 같다)
        }

        // ───────── 스택 ─────────

        void Open(int level, KeywordText src, int link, string id)
        {
            if (level >= maxDepth || stack.Count < level || string.IsNullOrEmpty(id)) return;
            int dup = -1;
            for (int i = 0; i < level; i++) if (stack[i].entry == id) dup = i;
            if (markCycles && dup >= 0)
            {
                echo = dup;                          // 순환: 새로 쌓지 않고 이미 열린 툴팁을 짚는다
                echoUntil = Time.unscaledTime + 1.6f;
                return;
            }
            if (stack.Count > level && stack[level].from == src && stack[level].link == link) return;
            var e = db.Get(id);
            if (e == null) return;
            Truncate(level);
            var layer = new Layer { entry = id, from = src, link = link, locked = lockEnabled && lockSeconds <= 0f, panel = Rent() };
            stack.Add(layer);
            Fill(layer, e, level);
            Place(level);
        }

        void Lock(int level)
        {
            if (!lockEnabled || level >= stack.Count) return;
            stack[level].locked = true;
            stack[level].dwell = 1f;
        }

        public void CloseAll() => Truncate(0);

        void Truncate(int n)
        {
            while (stack.Count > n)
            {
                var top = stack[stack.Count - 1];
                if (focusText == top.panel.body) { focusText = null; focusLink = -1; }
                if (hoverText == top.panel.body) { hoverText = null; hoverLink = -1; }
                Return(top.panel);
                stack.RemoveAt(stack.Count - 1);
            }
            if (echo >= n) echo = -1;
            touchPin = Mathf.Min(touchPin, n - 1);
        }

        /// 포인터 · 포커스 · 터치 탭이 붙잡고 있는 가장 깊은 겹 (-1 = 없음)
        int Held()
        {
            int h = Mathf.Max(HeldBy(hoverText, hoverLink), HeldBy(focusText, focusLink), touchPin);
            if (Pointer.current != null)
            {
                Vector2 pos = Pointer.current.position.ReadValue();
                for (int i = 0; i < stack.Count; i++)
                    if (RectTransformUtility.RectangleContainsScreenPoint(stack[i].panel.rect, pos, Cam)) h = Mathf.Max(h, i);
            }
            return h;
        }

        int HeldBy(KeywordText t, int link)
        {
            if (t == null) return -1;
            int L = t.level;
            return stack.Count > L && stack[L].from == t && stack[L].link == link ? L : L - 1;
        }

        void PruneUnlocked()
        {
            if (inputBlocked) return;   // 용어집이 열린 동안은 그대로 둔다
            int h = Held();
            int n = stack.Count;
            while (n - 1 > h && n > 0 && !stack[n - 1].locked) n--;
            Truncate(n);
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;   // 일시정지 메뉴(timeScale 0)에서도 툴팁은 움직인다
            if (!inputBlocked)
            {
                HandleKeys();
                HandleTouch();
                Tick(dt);   // 용어집이 열린 동안은 머무름 · 닫힘 유예를 멈춘다 (닫으면 그 자리로)
            }
            if (echo >= 0 && Time.unscaledTime >= echoUntil) echo = -1;
            for (int i = 0; i < stack.Count; i++) Paint(i, dt);
        }

        /// 터치로 붙잡은 툴팁은 툴팁 · 대사 키워드 밖을 탭하면 모두 닫는다
        void HandleTouch()
        {
            var ts = Touchscreen.current;
            if (touchPin < 0 || ts == null || !ts.primaryTouch.press.wasPressedThisFrame) return;
            Vector2 pos = ts.primaryTouch.position.ReadValue();
            if (dialogue.LinkAt(pos) >= 0) return;
            foreach (var L in stack) if (RectTransformUtility.RectangleContainsScreenPoint(L.panel.rect, pos, Cam)) return;
            Truncate(0);
        }

        void Tick(float dt)
        {
            int h = Held();
            for (int i = 0; i < stack.Count; i++)
            {
                var L = stack[i];
                if (!L.locked && lockEnabled && i <= h)
                {
                    L.dwell += dt / Mathf.Max(0.0001f, lockSeconds);
                    if (L.dwell >= 1f) Lock(i);
                }
                if (i <= h) L.grace = 0f;
            }
            int cut = stack.Count;
            for (int i = stack.Count - 1; i > h; i--)
            {
                var L = stack[i];
                if (!L.locked) { cut = i; continue; }
                L.grace += dt;
                if (L.grace >= closeGrace) cut = i;
            }
            Truncate(cut);
        }

        void Paint(int i, float dt)
        {
            var L = stack[i];
            var p = L.panel;
            p.group.alpha = Mathf.MoveTowards(p.group.alpha, 1f, dt / Mathf.Max(0.01f, fadeTime));
            p.ring.fillAmount = L.locked ? 1f : Mathf.Clamp01(L.dwell);
            p.ring.enabled = lockEnabled;
            Color frame = L.locked ? lockedFrame : idleFrame;
            if (i == echo) frame = Color.Lerp(frame, lockedFrame, 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * Mathf.PI * 2.5f));   // 1.25Hz 맥동 (웹 · UI Toolkit 과 같게)
            p.frame.color = frame;   // Frame(루트 Image) 색만 바꾼다 — 어두운 판은 자식 Background 가 2px 안쪽에 그린다
            p.status.text = !lockEnabled ? "잠금 없음" : L.locked ? "고정됨 · 안으로 들어갈 수 있다" : "머무르면 고정";
        }

        // ───────── 툴팁 하나 ─────────

        Panel Rent()
        {
            if (pool.Count > 0)
            {
                var reused = pool.Pop();
                reused.rect.gameObject.SetActive(true);
                reused.rect.SetAsLastSibling();   // 깊은 겹이 위에 그려지게
                reused.group.alpha = 0f;
                return reused;
            }
            var r = Instantiate(panelPrefab, layer);
            r.pivot = Vector2.zero;
            r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f);   // anchoredPosition = 레이어 로컬 좌표
            // 루트 Image = Frame(테두리 색). 그 안 2px 에 어두운 Background(Image)가 있어야 고정됐을 때 노란 판이 되지 않는다
            if (r.Find("Background") == null) Debug.LogWarning("TooltipPanel 에 Background(Image, 2px 안쪽)가 없다 — 고정되면 툴팁 전체가 테두리 색으로 칠해진다", r);
            var p = new Panel
            {
                rect = r,
                group = r.GetComponent<CanvasGroup>(),
                frame = r.GetComponent<Image>(),
                title = r.Find("Title").GetComponent<TMP_Text>(),
                body = r.Find("Body").GetComponent<KeywordText>(),
                ring = r.Find("Footer/LockRing").GetComponent<Image>(),
                status = r.Find("Footer/Status").GetComponent<TMP_Text>(),
                depth = r.Find("Footer/Depth").GetComponent<TMP_Text>(),
                note = r.Find("Note").GetComponent<TMP_Text>(),
            };
            p.group.alpha = 0f;
            p.ring.type = Image.Type.Filled;
            p.ring.fillMethod = Image.FillMethod.Radial360;
            return p;
        }

        void Return(Panel p)
        {
            p.body.ShowFocus(-1);
            p.rect.gameObject.SetActive(false);
            pool.Push(p);
        }

        void Fill(Layer L, LoreEntry e, int level)
        {
            var p = L.panel;
            string hex = LoreDatabase.KindHex(e.kind);
            p.title.text = $"<color={hex}>{LoreDatabase.KindGlyph(e.kind)} {e.displayName}</color>   <size=70%><color=#9FB4C9>{LoreDatabase.KindLabel(e.kind)} · {e.role}</color></size>";
            p.body.level = level + 1;
            p.body.stack = this;
            p.body.SetText(db.ToRichText(e.body, id =>
                level + 1 >= maxDepth ? LinkState.Flat :
                markCycles && InStack(id, level) ? LinkState.Cycle : LinkState.Link));
            bool last = level + 1 >= maxDepth;
            p.depth.text = $"깊이 {level + 1}/{maxDepth}{(last ? " · 한도" : "")}";
            p.ring.fillAmount = 0f;
            // 내용을 바꾼 뒤 크기를 확정해야 배치가 맞다 (ContentSizeFitter 는 다음 레이아웃 패스에서야 크기를 정한다)
            LayoutRebuilder.ForceRebuildLayoutImmediate(p.rect);
        }

        bool InStack(string id, int upTo)
        {
            for (int i = 0; i <= upTo && i < stack.Count; i++) if (stack[i].entry == id) return true;
            return false;
        }

        void Place(int i)
        {
            var L = stack[i];
            var p = L.panel;
            Vector2 size = p.rect.rect.size;
            Rect a = L.from.LinkRectIn(layer, L.link);
            Rect b = layer.rect;
            float xMin = b.xMin + margin, xMax = b.xMax - margin, yMin = b.yMin + margin, yMax = b.yMax - margin;
            float x, y;
            string note = "";
            if (i == 0)
            {
                // 1겹: 키워드 위 가운데 (UGUI 는 y 가 위로 증가 → 툴팁 아래 변 = 키워드 윗변 + gap)
                x = a.center.x - size.x * 0.5f;
                y = a.yMax + gap;
                if (edgeCorrection && y + size.y > yMax && a.yMin - gap - size.y >= yMin)
                {
                    y = a.yMin - gap - size.y;
                    note = "위 공간 부족 → 아래로";
                }
            }
            else
            {
                // 하위 겹: 부모 툴팁 옆, 윗변을 키워드 줄 근처에 — 단 부모 아래 변보다 내려가지 않게 (대사를 덮지 않는다)
                Rect parent = stack[i - 1].placed;
                // 셋째 겹부터는 부모가 놓인 방향으로 이어 가고 되돌아 뒤집지 않는다 (되돌아가면 첫 겹을 통째로 덮는다 — 모자라면 Clamp 만)
                bool left = i > 1 && edgeCorrection && stack[i - 1].left;
                float toRight = parent.xMax + gap, toLeft = parent.xMin - gap - size.x;
                x = left ? toLeft : toRight;
                y = Mathf.Max(a.yMax + 28f - size.y, parent.yMin);
                if (edgeCorrection && i == 1)
                {
                    bool fits = left ? x >= xMin : x + size.x <= xMax;
                    bool otherFits = left ? toRight + size.x <= xMax : toLeft >= xMin;
                    if (!fits && otherFits)
                    {
                        left = !left;
                        x = left ? toLeft : toRight;
                        note = left ? "오른쪽 공간 부족 → 왼쪽으로" : "왼쪽 공간 부족 → 오른쪽으로";
                    }
                }
                L.left = left;
            }
            if (edgeCorrection)
            {
                float cx = Mathf.Clamp(x, xMin, xMax - size.x);
                bool stacked = false;
                if (i > 1 && cx != x)
                {
                    // 옆자리가 모자라면 부모 위 → 부모 반대쪽 → 부모 아래 중 앞 겹들과 겹치지 않는 첫 자리 (없으면 부모만 피하는 자리).
                    // 부모 안의 여는 키워드를 덮으면 키워드가 가려져 exit → 닫힘 → 다시 열림이 반복된다. 모두 안 되면 여는 키워드 줄만 피한다 (y 는 위로 증가)
                    var pl = stack[i - 1];
                    Rect par = pl.placed, area = Rect.MinMaxRect(xMin, yMin, xMax, yMax);
                    bool lf = L.left;
                    var cands = new (float x, float y, string note, bool left)[]
                    {
                        (cx, par.yMax + gap + (pl.panel.note.gameObject.activeSelf ? 40f : 0f), "옆 공간 부족 → 부모 위로", lf),
                        (lf ? par.xMax + gap : par.xMin - gap - size.x, y, lf ? "왼쪽 공간 부족 → 오른쪽으로" : "오른쪽 공간 부족 → 왼쪽으로", !lf),
                        (cx, par.yMin - gap - size.y, "옆 공간 부족 → 부모 아래로", lf),
                    };
                    int pick = -1;
                    for (int pass = 0; pass < 2 && pick < 0; pass++)
                        for (int c = 0; c < cands.Length && pick < 0; c++)
                            if (Clear(new Rect(cands[c].x, cands[c].y, size.x, size.y), area, pass == 0 ? 0 : i - 1, i)) pick = c;
                    stacked = pick >= 0;
                    if (stacked)
                    {
                        (x, y, note, L.left) = cands[pick];
                        cx = x;
                    }
                    else y = a.yMax + gap + size.y <= yMax ? a.yMax + gap : a.yMin - gap - size.y;
                }
                float cy = Mathf.Clamp(y, yMin, yMax - size.y);
                if (!stacked && (cx != x || cy != y)) note = note.Length > 0 ? note + " · 화면 안으로 고정" : "화면 안으로 고정";
                x = cx;
                y = cy;
            }
            p.rect.anchoredPosition = new Vector2(x, y);
            L.placed = new Rect(x, y, size.x, size.y);
            p.note.text = note;
            p.note.gameObject.SetActive(note.Length > 0);   // Note 는 LayoutElement.ignoreLayout — 켜고 꺼도 툴팁 크기가 바뀌지 않는다
        }

        /// r 이 area 안에 있고 앞 겹(from..upTo-1)과 겹치지 않는가
        bool Clear(Rect r, Rect area, int from, int upTo)
        {
            if (r.xMin < area.xMin || r.xMax > area.xMax || r.yMin < area.yMin || r.yMax > area.yMax) return false;
            for (int k = from; k < upTo; k++) if (stack[k].placed.Overlaps(r)) return false;
            return true;
        }

        // ───────── 키보드 · 패드 ─────────
        // ←→ 같은 글 안 키워드 · ↓/Submit 고정하고 안으로 · ↑ 바깥 글로 · Cancel 맨 위 겹 닫기.
        // 키워드는 Selectable 이 아니므로 EventSystem 선택을 비워 두어 방향키가 두 번 처리되지 않게 한다.

        void HandleKeys()
        {
            bool nav = navigate != null && navigate.action.WasPressedThisFrame();
            if (focusText == null)
            {
                // 아무것도 선택되지 않은 상태에서 방향키 → 대사의 첫 키워드부터
                if (nav && EventSystem.current != null && EventSystem.current.currentSelectedGameObject == null && dialogue.LinkCount > 0)
                    SetFocus(dialogue, 0, true);
                return;
            }
            if (nav)
            {
                Vector2 v = navigate.action.ReadValue<Vector2>();
                if (Mathf.Abs(v.x) > Mathf.Abs(v.y)) SetFocus(focusText, Mathf.Clamp(focusLink + (v.x > 0 ? 1 : -1), 0, focusText.LinkCount - 1), true);
                else if (v.y < 0) Descend();
                else Ascend();
            }
            else if (submit != null && submit.action.WasPressedThisFrame()) Descend();
            else if (cancel != null && cancel.action.WasPressedThisFrame()) CloseTop();
        }

        void SetFocus(KeywordText t, int link, bool open)
        {
            if (focusText != null && focusText != t) focusText.ShowFocus(-1);
            focusText = t;
            focusLink = link;
            if (t == null) return;
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            t.ShowFocus(link);
            if (open && link >= 0) Open(t.level, t, link, t.LinkId(link));
        }

        public void ReleaseFocus()
        {
            if (focusText != null) focusText.ShowFocus(-1);
            focusText = null;
            focusLink = -1;
            PruneUnlocked();
        }

        void Descend()
        {
            int L = focusText.level;
            string id = focusText.LinkId(focusLink);
            if (markCycles && InStack(id, L - 1)) { Open(L, focusText, focusLink, id); return; }   // 순환은 짚기만
            if (stack.Count <= L || stack[L].from != focusText || stack[L].link != focusLink) Open(L, focusText, focusLink, id);
            if (!lockEnabled || stack.Count <= L) return;
            Lock(L);
            var child = stack[L].panel.body;
            if (L + 1 < maxDepth && child.LinkCount > 0) SetFocus(child, 0, true);
        }

        void Ascend()
        {
            int L = focusText.level;
            if (L == 0 || stack.Count < L) return;
            var parent = stack[L - 1];
            Truncate(L);
            SetFocus(parent.from, parent.link, false);
        }

        void CloseTop()
        {
            if (stack.Count == 0) { ReleaseFocus(); return; }
            var top = stack[stack.Count - 1];
            Truncate(stack.Count - 1);
            SetFocus(top.from, top.link, false);
        }
    }
}
