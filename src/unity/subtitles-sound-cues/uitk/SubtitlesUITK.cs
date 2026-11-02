using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.SubtitlesSoundCues
{
    /// <summary>
    /// UI Toolkit 판 자막 + 효과음 캡션 + 소리 방향 링.
    /// - 장 나누기는 글자 수로: 한 줄 글자 수 ≈ 상자 너비 ÷ (글자 크기 × 1.02), 장 용량 = 그 × 최대 줄 수.
    ///   띄어쓰기 단위로 채우고, 장이 60% 이상 찼으면 문장 끝(. ? !)에서 끊는다
    /// - 장마다 (공백 뺀 글자 수 ÷ readingCps)초, 최소 1.5초. 이름은 화자가 바뀔 때만
    /// - 링은 Painter2D 호. 소리마다 남은 시간으로 투명도를 정해 매 프레임 다시 그린다
    /// 사용: Say("세라", "…", 색, radio: true) · Sound(방향°, "폭발음", true)
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class SubtitlesUITK : MonoBehaviour
    {
        public enum Size { Small, Medium, Large, Xl }

        [SerializeField] Size size = Size.Medium;
        [Range(1, 3)] [SerializeField] int maxLines = 2;
        [SerializeField] float readingCps = 13f;
        [SerializeField] float boxWidth = 1160f;

        static readonly float[] FontPx = { 28f, 36f, 46f, 58f };
        static readonly string[] SizeClass = { "size-small", "size-medium", "size-large", "size-xl" };

        VisualElement root, sub, captions;
        Label speakerLabel, bodyLabel;
        SoundRingElement ring;
        readonly Queue<(string name, string text, Color color, bool radio)> queue = new();
        string lastWho;
        float lastEnd = -999f;
        Coroutine running;

        void OnEnable()
        {
            VisualElement doc = GetComponent<UIDocument>().rootVisualElement;
            root = doc.Q("subtitle-root");
            sub = doc.Q("sub");
            captions = doc.Q("captions");
            speakerLabel = doc.Q<Label>("speaker");
            bodyLabel = doc.Q<Label>("body");
            ring = new SoundRingElement();
            doc.Q("ring").Add(ring);
            ApplySize();
        }

        void OnDisable()
        {
            ring?.RemoveFromHierarchy();
            // enabled = false 로는 코루틴이 멈추지 않는다 — 직접 멈춰야 다시 켤 때 두 개가 되지 않는다
            if (running != null) StopCoroutine(running);
            running = null;
            sub?.RemoveFromClassList("sub--on");
        }

        public void ApplySize()
        {
            foreach (string c in SizeClass) root.RemoveFromClassList(c);
            root.AddToClassList(SizeClass[(int)size]);
        }

        /// <summary>name 은 화면에 보일 이름, radio 면 [무전] 을 붙인다</summary>
        public void Say(string name, string text, Color color, bool radio = false)
        {
            queue.Enqueue((name, text, color, radio));
            running ??= StartCoroutine(Run());
        }

        IEnumerator Run()
        {
            while (queue.Count > 0)
            {
                (string who, string text, Color color, bool radio) = queue.Dequeue();
                bool relabel = who != lastWho || Time.unscaledTime - lastEnd > 4f;
                int perLine = Mathf.Max(8, Mathf.FloorToInt(boxWidth / (FontPx[(int)size] * 1.02f)));
                List<string> pages = Chunk(text, perLine * maxLines);
                for (int i = 0; i < pages.Count; i++)
                {
                    speakerLabel.style.display = relabel && i == 0 ? DisplayStyle.Flex : DisplayStyle.None;
                    speakerLabel.text = radio ? $"{who}  [무전]" : who;
                    speakerLabel.style.color = color;
                    bodyLabel.text = (i > 0 ? "…" : "") + pages[i] + (i < pages.Count - 1 ? " …" : "");
                    sub.AddToClassList("sub--on");
                    yield return Wait(Mathf.Max(1.5f, pages[i].Replace(" ", "").Length / readingCps));
                    sub.RemoveFromClassList("sub--on");
                    yield return Wait(0.25f);
                }
                lastWho = who;
                lastEnd = Time.unscaledTime;
            }
            running = null;
        }

        /// <summary>실제 시간으로 기다리되 일시정지(timeScale 0) 동안은 세지 않는다</summary>
        static IEnumerator Wait(float seconds)
        {
            while (seconds > 0f)
            {
                if (Time.timeScale > 0f) seconds -= Time.unscaledDeltaTime;
                yield return null;
            }
        }

        static readonly string[] Arrows = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };

        static List<string> Chunk(string text, int capacity)
        {
            var outList = new List<string>();
            string cur = "";
            foreach (string w in text.Split(' '))
            {
                string next = cur.Length > 0 ? cur + " " + w : w;
                if (next.Length > capacity && cur.Length > 0)
                {
                    outList.Add(cur);
                    cur = w;
                    continue;
                }
                cur = next;
                char last = w.Length > 0 ? w[w.Length - 1] : ' ';
                if ((last == '.' || last == '?' || last == '!') && cur.Length >= capacity * 0.6f)
                {
                    outList.Add(cur);
                    cur = "";
                }
            }
            if (cur.Length > 0) outList.Add(cur);
            return outList;
        }

        /// <summary>효과음: 방향(앞 = 0°, 오른쪽 +) · 캡션 이름 · 위험한가</summary>
        public void Sound(float deg, string label, bool danger)
        {
            ring.Add(deg, danger);
            int dir = Mathf.RoundToInt(Mathf.Repeat(deg, 360f) / 45f) % 8;
            var caption = new Label($"{Arrows[dir]} [{label}]");   // 화살표 = 소리가 난 쪽
            caption.AddToClassList("caption");
            if (danger) caption.AddToClassList("caption--danger");
            captions.Add(caption);
            while (captions.childCount > 3) captions.RemoveAt(0);   // 최대 3개
            caption.schedule.Execute(() => caption.RemoveFromHierarchy()).StartingIn(2600);
        }

        void Update() => ring?.Tick(Time.unscaledDeltaTime);

        class SoundRingElement : VisualElement
        {
            const float Radius = 230f;
            const float Arc = 34f;
            const float Life = 2.4f;
            readonly List<(float deg, bool danger, float age)> cues = new();

            public SoundRingElement()
            {
                pickingMode = PickingMode.Ignore;
                style.position = Position.Absolute;
                style.left = 0;
                style.top = 0;
                style.right = 0;
                style.bottom = 0;
                generateVisualContent += Draw;
            }

            public void Add(float deg, bool danger) => cues.Add((deg, danger, 0f));

            public void Tick(float dt)
            {
                if (cues.Count == 0) return;
                for (int i = cues.Count - 1; i >= 0; i--)
                {
                    var c = cues[i];
                    c.age += dt;
                    if (c.age >= Life) cues.RemoveAt(i);
                    else cues[i] = c;
                }
                MarkDirtyRepaint();
            }

            void Draw(MeshGenerationContext ctx)
            {
                Painter2D p = ctx.painter2D;
                Vector2 center = contentRect.center;
                p.lineWidth = 18f;
                p.lineCap = LineCap.Round;
                foreach (var c in cues)
                {
                    float k = c.age / Life;
                    float alpha = k < 0.55f ? 1f : 1f - (k - 0.55f) / 0.45f;
                    Color col = c.danger ? new Color(1f, 0.42f, 0.37f, alpha) : new Color(0.92f, 0.95f, 0.98f, alpha);
                    p.strokeColor = col;
                    p.BeginPath();
                    // 앞(위) = 0° 기준 → Painter2D(오른쪽 = 0°, 시계 +)로 바꾸려고 90° 를 뺀다
                    p.Arc(center, Radius, Angle.Degrees(c.deg - Arc / 2f - 90f), Angle.Degrees(c.deg + Arc / 2f - 90f));
                    p.Stroke();
                }
            }
        }
    }
}
