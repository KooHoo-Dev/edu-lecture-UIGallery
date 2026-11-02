using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.UIElements;

namespace UIGallery.DamageNumbers
{
    /// <summary>
    /// 데미지 숫자 — UI Toolkit 버전. UGUI 버전과 같은 Spawn API(IDamageNumberSink)라 DamageNumbersDemo 를 그대로 쓴다.
    /// DamageCategory · DamageStackMode · DamageNumberFormat · DamageNumberSettings · IDamageNumberSink 는 ugui 폴더의 것을 함께 쓴다.
    /// 숫자 요소는 ObjectPool 로 재사용하고, 위치(style.left/top)는 생성 때 한 번만,
    /// 움직임(상승 · 밀어 올림)은 style.translate, 팝은 style.scale, 페이드는 style.opacity 로 Update 에서 넣는다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class DamageNumbersUITK : MonoBehaviour, IDamageNumberSink
    {
        const float Fade = 0.25f;
        const float ChainGap = 0.45f, TotalWait = 0.2f, TotalCount = 0.4f, TotalHold = 0.8f;
        static readonly float[] ScatterDeg = { 90f, 150f, 30f, 120f, 60f, 165f, 15f };
        static readonly string[] CatClass = { "dmg--normal", "dmg--crit", "dmg--break", "dmg--heal", "dmg--block" };
        static readonly string[] BadgeText = { "", "치명", "파괴", "", "막힘" };
        static readonly float[] FontScale = { 1f, 1.5f, 1.22f, 0.95f, 0.68f };
        static readonly float[] LifeScale = { 1f, 1.15f, 1.15f, 1.25f, 1f };

        [SerializeField] Camera cam;
        [SerializeField] DamageNumberSettings settings = new();
        [SerializeField] bool showTotal = true;

        /// <summary>풀 단위 — 컨테이너와 자식 Label 두 개 + 애니메이션 상태</summary>
        class Item
        {
            public VisualElement root;
            public Label value, badge;
            public Transform anchor;
            public DamageCategory cat;
            public Vector2 dir, offset;
            public float age, life, pop, push, pushShown, lastUpdate;
            public long amount;
            public int hits;
        }

        VisualElement layer, total;
        Label totalValue, totalHits;
        ObjectPool<Item> pool;
        readonly List<Item> active = new(64);
        readonly Dictionary<Transform, int> scatterIndex = new();

        // 합계
        Transform chainAnchor;
        int chainCount;
        long chainSum;
        float chainLast = -99f, totalT = -1f;
        long totalSum;

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            layer = root.Q<VisualElement>("number-layer");
            total = root.Q<VisualElement>("total-counter");
            totalValue = root.Q<Label>("total-value");
            totalHits = root.Q<Label>("total-hits");
            layer.Clear(); // 혹시 남아 있는 이전 .dmg 요소를 지우고 시작한다
            active.Clear();
            pool = new ObjectPool<Item>(Create,
                actionOnGet: it => it.root.style.display = DisplayStyle.Flex,
                actionOnRelease: it =>
                {
                    // 이전 범주 클래스가 남으면 일반 피해가 치명 색으로 나온다 → 모두 지운다
                    foreach (var c in CatClass) it.root.RemoveFromClassList(c);
                    it.root.RemoveFromClassList("dmg--no-cue");
                    it.root.style.display = DisplayStyle.None;
                },
                actionOnDestroy: it => it.root.RemoveFromHierarchy(),
                collectionCheck: true, defaultCapacity: 32, maxSize: 128);
        }

        void OnDisable()
        {
            // 표시 중이던 숫자를 풀에 돌려준 뒤 풀을 비운다 (actionOnDestroy 가 요소를 계층에서 뗀다).
            // 이렇게 하지 않으면 다시 켤 때 새 풀이 만들어지고, 이전 요소는 멈춘 채 layer 에 남는다.
            foreach (var it in active) pool.Release(it);
            active.Clear();
            pool.Clear();
            chainCount = 0;
            totalT = -1f;
            total?.AddToClassList("total-counter--hidden");
        }

        Item Create()
        {
            var it = new Item { root = new VisualElement(), badge = new Label(), value = new Label() };
            it.root.AddToClassList("dmg");
            it.badge.AddToClassList("dmg__badge");
            it.value.AddToClassList("dmg__value");
            // picking-mode 는 상속되지 않는다 → 요소마다 Ignore
            it.root.pickingMode = PickingMode.Ignore;
            it.badge.pickingMode = PickingMode.Ignore;
            it.value.pickingMode = PickingMode.Ignore;
            it.root.Add(it.badge);
            it.root.Add(it.value);
            layer.Add(it.root);
            return it;
        }

        public void Spawn(Transform anchor, int amount, DamageCategory cat)
        {
            // 카메라 뒤 판정은 따로: CameraTransformWorldToPanel 은 뒤에 있어도 값을 돌려준다
            if (cam.WorldToScreenPoint(anchor.position).z <= 0f) return;
            Vector2 p = RuntimePanelUtils.CameraTransformWorldToPanel(layer.panel, anchor.position, cam);
            if (cat != DamageCategory.Heal) AddToChain(anchor, amount);

            int ci = (int)cat;
            if (settings.stackMode == DamageStackMode.Merge)
            {
                float window = settings.hitInterval * 1.6f + 0.12f;
                foreach (var a in active)
                    if (a.anchor == anchor && a.cat == cat && a.age < a.life - Fade && settings.Now - a.lastUpdate <= window)
                    {
                        a.amount += amount;
                        a.hits++;
                        a.pop = 0f;
                        a.age = Mathf.Min(a.age, a.life * 0.25f);
                        a.lastUpdate = settings.Now;
                        WriteText(a);
                        return;
                    }
            }

            float fs = settings.baseFontSize * (cat == DamageCategory.Crit ? settings.critScale : FontScale[ci]);
            Vector2 dir = Vector2.up, offset = Vector2.zero;
            if (settings.stackMode == DamageStackMode.Lane || settings.stackMode == DamageStackMode.Merge)
            {
                float h = fs * 1.05f + (settings.shapeCue && BadgeText[ci] != "" ? 36f : 0f) + 6f;
                foreach (var a in active)
                    if (a.anchor == anchor) a.push += h;
            }
            else if (settings.stackMode == DamageStackMode.Scatter)
            {
                scatterIndex.TryGetValue(anchor, out int k);
                scatterIndex[anchor] = k + 1;
                float deg = (ScatterDeg[k % ScatterDeg.Length] + Random.Range(-8f, 8f)) * Mathf.Deg2Rad;
                dir = new Vector2(Mathf.Cos(deg), Mathf.Sin(deg));
                offset = new Vector2(dir.x * 90f, dir.y * 46f);
            }

            Item it = pool.Get();
            it.anchor = anchor;
            it.cat = cat;
            it.amount = amount;
            it.hits = 1;
            it.age = 0f;
            it.pop = 0f;
            it.push = it.pushShown = 0f;
            it.dir = dir;
            it.offset = offset;
            it.life = settings.lifetime * LifeScale[ci];
            it.lastUpdate = settings.Now;

            it.root.AddToClassList(CatClass[ci]);
            it.root.EnableInClassList("dmg--no-cue", !settings.shapeCue);
            it.root.style.left = p.x;  // 위치는 생성 때 한 번만 (매 프레임 바꾸면 레이아웃이 다시 계산된다)
            it.root.style.top = p.y;
            it.value.style.fontSize = fs; // critScale 반영
            it.badge.text = BadgeText[ci];
            it.root.BringToFront();
            WriteText(it);
            Apply(it);
            active.Add(it);
        }

        void WriteText(Item it)
        {
            // Label.text 는 문자열이 필요하다 (UGUI 버전의 char[] 방식보다 할당이 생긴다)
            string plus = settings.shapeCue && it.cat == DamageCategory.Heal ? "+" : "";
            string body = settings.format switch
            {
                DamageNumberFormat.Full => it.amount.ToString(),
                DamageNumberFormat.Short when it.amount >= 1_000_000 => (it.amount / 1_000_000f).ToString("0.0") + "M",
                DamageNumberFormat.Short when it.amount >= 1000 => (it.amount / 1000f).ToString("0.0") + "K",
                _ => it.amount.ToString("N0"),
            };
            it.value.text = it.hits > 1 ? $"{plus}{body} ×{it.hits}" : plus + body;
        }

        void Update()
        {
            float dt = settings.useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            for (int i = active.Count - 1; i >= 0; i--)
            {
                Item it = active[i];
                it.age += dt;
                it.pop += dt;
                it.pushShown = Mathf.Lerp(it.pushShown, it.push, 1f - Mathf.Exp(-22f * dt));
                if (it.age >= it.life)
                {
                    active.RemoveAt(i);
                    pool.Release(it); // 한 번만 반환
                    continue;
                }
                Apply(it);
            }
            UpdateTotal(dt);
        }

        void Apply(Item it)
        {
            float k = Mathf.Clamp01(it.age / it.life);
            float eased = it.cat == DamageCategory.Heal ? Mathf.Sin(k * Mathf.PI * 0.5f) : 1f - Mathf.Pow(1f - k, 3f);
            Vector2 d = it.offset + it.dir * (settings.floatDistance * eased) + new Vector2(0f, it.pushShown);
            // 패널 좌표는 y 가 아래로 + 이므로 위쪽 이동은 음수
            it.root.style.translate = new Translate(new Length(d.x, LengthUnit.Pixel), new Length(-d.y, LengthUnit.Pixel));

            bool strong = it.cat == DamageCategory.Crit || it.cat == DamageCategory.Break;
            float popDur = strong ? 0.18f : 0.14f;
            float s = PopCurve(Mathf.Clamp01(it.pop / popDur), strong ? 0.5f : 0.6f, strong ? 1.3f : 1.15f);
            it.root.style.scale = new Scale(new Vector3(s, s, 1f));

            float fadeStart = it.life - Fade;
            float f = it.age > fadeStart ? Mathf.Clamp01((it.age - fadeStart) / Fade) : 0f;
            it.root.style.opacity = 1f - f * f;
        }

        static float PopCurve(float t, float from, float peak)
        {
            if (t >= 1f) return 1f;
            if (t < 0.5f) return Mathf.Lerp(from, peak, 1f - Mathf.Pow(1f - t / 0.5f, 3f));
            return Mathf.Lerp(peak, 1f, Mathf.SmoothStep(0f, 1f, (t - 0.5f) / 0.5f));
        }

        /* ───── 합계 ───── */
        void AddToChain(Transform anchor, long amount)
        {
            if (chainCount > 0 && chainAnchor == anchor && Time.time - chainLast < ChainGap) { chainCount++; chainSum += amount; }
            else { chainAnchor = anchor; chainCount = 1; chainSum = amount; }
            chainLast = Time.time;
        }

        void UpdateTotal(float dt)
        {
            if (chainCount > 0 && Time.time - chainLast > TotalWait)
            {
                if (chainCount >= 2 && showTotal && cam.WorldToScreenPoint(chainAnchor.position).z > 0f)
                {
                    Vector2 p = RuntimePanelUtils.CameraTransformWorldToPanel(total.panel, chainAnchor.position, cam);
                    total.style.left = p.x + 150f;
                    total.style.top = p.y - 150f;
                    totalHits.text = $"{chainCount}타";
                    totalSum = chainSum;
                    totalT = 0f;
                    total.RemoveFromClassList("total-counter--hidden");
                }
                chainCount = 0;
            }
            if (totalT < 0f) return;
            totalT += dt;
            float k = Mathf.Clamp01(totalT / TotalCount);
            totalValue.text = ((long)(totalSum * (1f - Mathf.Pow(1f - k, 4f)))).ToString("N0"); // easeOutQuart
            if (totalT >= TotalCount + TotalHold)
            {
                total.AddToClassList("total-counter--hidden"); // USS transition 으로 0.25초 페이드
                totalT = -1f;
            }
        }
    }
}
