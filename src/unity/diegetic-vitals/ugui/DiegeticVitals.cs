using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 세계 안 체력 표시 — UGUI(World Space Canvas) 버전.
    /// 체력(세로 칸) · 동력(반원 호) · 산소(조건부 숫자)를 캐릭터 등판 캔버스에 그리고,
    /// 등판이 카메라에서 가려지면 화면 가장자리 미니 게이지(MiniGauge)를 띄운다.
    ///
    /// 하이어라키 (VitalsCanvas 는 Scale 0.001, 앞면 법선 = -forward)
    ///   VitalsCanvas
    ///   ├─ SpineGauge (VerticalLayoutGroup, Reverse Arrangement) ← Cell 프리팹을 segmentCount 개 생성
    ///   ├─ EnergyArc  (Image: Filled · Radial180 · Origin Top · Clockwise 끔)
    ///   │    아래 반원(∪) 스프라이트 — 원의 중심이 위 변에 있으므로 Origin 은 Top.
    ///   │    Clockwise 를 끄면(반시계) 왼쪽 → 아래 → 오른쪽 순으로 찬다 (Awake 에서 코드로도 맞춘다)
    ///   ├─ EnergyEmpty (Image, 점선 윤곽)
    ///   └─ O2Readout (CanvasGroup) ─ O2Glyph (Image), O2Value (TextMeshProUGUI)
    /// </summary>
    public class DiegeticVitals : MonoBehaviour
    {
        public enum HpColorScheme { Gradient, Pattern, Mono }

        [Header("참조 — 세계 안 (World Space)")]
        [SerializeField] Camera viewCamera;
        [SerializeField] RectTransform vitalsCanvas;
        [SerializeField] RectTransform spineGauge;
        [SerializeField, Tooltip("칸 하나. 자식 0번에 사선 무늬(Hatch) Image")] Image cellPrefab;
        [SerializeField] Image energyArc;
        [SerializeField] Image energyEmpty;
        [SerializeField] CanvasGroup o2Readout;
        [SerializeField] Image o2Glyph;
        [SerializeField] TextMeshProUGUI o2Value;
        [SerializeField, Tooltip("UI 호환 발광 머티리얼 (_Intensity 프로퍼티)")] Material emissiveMaterial;
        [SerializeField, Tooltip("피격 순간 몸체 플래시 (URP Lit: Emission 켜 둘 것)")] Renderer suitRenderer;

        [Header("참조 — 화면 (Screen Space)")]
        [SerializeField] CanvasGroup miniGauge;
        [SerializeField] RectTransform miniCells;
        [SerializeField] Image miniCellPrefab;

        [Header("값")]
        [SerializeField, Range(3, 12)] int segmentCount = 10;
        [SerializeField] float maxHealth = 100f;
        [SerializeField] HpColorScheme colorScheme = HpColorScheme.Gradient;
        [SerializeField, Tooltip("민트·앰버·적색 키 3개 (Gradient 모드)")] Gradient healthGradient = new();
        [SerializeField] Color okColor = new(0.24f, 0.96f, 0.78f);
        [SerializeField] Color warnColor = new(1f, 0.7f, 0.22f);
        [SerializeField] Color dangerColor = new(1f, 0.27f, 0.27f);
        [SerializeField] Color monoColor = new(0.78f, 0.93f, 1f);
        [SerializeField] bool conditionalO2 = true;
        [SerializeField, Range(0f, 3f)] float emissiveScale = 1.6f;
        [SerializeField] bool angleFallback = true;
        [SerializeField, Range(0f, 3f), Tooltip("치명 맥동. 2Hz 이하 권장, 3Hz 상한")] float pulseHz = 1.5f;
        [SerializeField] float showAngle = 80f;
        [SerializeField] float hideAngle = 65f;
        [SerializeField] float minHold = 1f;

        public bool InVacuum { get; private set; }

        float health = 70f, energy = 80f, shownEnergy = 0.8f, o2 = 100f, rechargeDelay, flashTimer, holdTimer;
        bool hidden;
        int shownO2 = -1;

        // 칸별 연출 상태 (웹 갤러리와 같은 규칙)
        class Cell { public Image image, hatch, mini; public bool on; public float lit, delay, flashT = 1f; }
        readonly List<Cell> cells = new();
        Material matInstance;
        MaterialPropertyBlock mpb;
        static readonly int IntensityId = Shader.PropertyToID("_Intensity");
        static readonly int EmissionId = Shader.PropertyToID("_EmissionColor");

        void Reset()
        {
            // 기본 3색: 적색(0) → 앰버(0.3) → 민트(0.6 이상)
            healthGradient.SetKeys(
                new[] { new GradientColorKey(dangerColor, 0.2f), new GradientColorKey(warnColor, 0.4f), new GradientColorKey(okColor, 0.65f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 1f) });
        }

        void Awake()
        {
            if (viewCamera == null) viewCamera = Camera.main;
            matInstance = new Material(emissiveMaterial);
            mpb = new MaterialPropertyBlock();
            // 동력 호: Origin 은 '원의 중심이 있는 변'. ∪ 모양은 중심이 위 변이라 Top, 왼쪽→아래→오른쪽 = 반시계
            energyArc.type = Image.Type.Filled;
            energyArc.fillMethod = Image.FillMethod.Radial180;
            energyArc.fillOrigin = (int)Image.Origin180.Top;
            energyArc.fillClockwise = false;
            BuildCells();
            SetCellsInstant();
        }

        void OnDestroy()
        {
            if (matInstance != null) Destroy(matInstance);
        }

        void BuildCells()
        {
            for (int i = 0; i < segmentCount; i++)
            {
                var img = Instantiate(cellPrefab, spineGauge);
                img.material = matInstance;
                var hatch = img.transform.GetChild(0).GetComponent<Image>();
                var mini = Instantiate(miniCellPrefab, miniCells);
                cells.Add(new Cell { image = img, hatch = hatch, mini = mini });
            }
            energyArc.material = matInstance;
            // 레이아웃을 한 번 잡은 뒤 끈다 — 매 프레임 레이아웃 재계산 방지
            LayoutRebuilder.ForceRebuildLayoutImmediate(spineGauge);
            if (spineGauge.TryGetComponent(out LayoutGroup group)) group.enabled = false;
        }

        int OnCount(float hp) => hp <= 0f ? 0 : Mathf.CeilToInt(hp / maxHealth * segmentCount - 0.0001f);

        void SetCellsInstant()
        {
            int on = OnCount(health);
            for (int i = 0; i < cells.Count; i++)
            {
                var c = cells[i];
                c.on = i < on;
                c.lit = c.on ? 1f : 0f;
                c.delay = 0f;
                c.flashT = 1f;
            }
        }

        // ───── 외부 API ─────
        public void TakeDamage(float amount)
        {
            SetHealth(health - amount);
            if (FlashLimiter.Request()) flashTimer = 0.12f;
        }

        public void Heal(float amount) => SetHealth(health + amount);

        public void UseAbility()
        {
            if (energy < 25f) return;
            energy -= 25f;
            rechargeDelay = 2f;
        }

        /// <summary>VacuumZone 의 onVacuumChanged 이벤트에 연결한다</summary>
        public void SetVacuum(bool value) => InVacuum = value;

        void SetHealth(float value)
        {
            int before = OnCount(health);
            health = Mathf.Clamp(value, 0f, maxHealth);
            int after = OnCount(health);
            // 꺼질 칸: 위에서부터 0.04초 간격 → 흰색 0.06초 → 0.22초 페이드
            for (int i = before - 1, k = 0; i >= after; i--, k++)
            {
                var c = cells[i];
                c.on = false; c.delay = k * 0.04f; c.flashT = 0f; c.lit = 1f;
            }
            // 켜질 칸: 아래부터 차례로, 전체 약 0.6초
            int added = after - before;
            for (int i = before, k = 0; i < after; i++, k++)
            {
                var c = cells[i];
                c.on = true; c.delay = k * 0.45f / added; c.flashT = 1f;
            }
        }

        // ───── 매 프레임 ─────
        void Update()
        {
            float dt = Time.deltaTime;
            float ratio = health / maxHealth;
            bool danger = ratio < 0.25f;
            float hz = Mathf.Min(pulseHz, 3f);
            float pulse = hz > 0f ? 0.5f + 0.5f * Mathf.Cos(Time.time * 2f * Mathf.PI * hz) : 1f;
            float crit = danger ? 0.35f + 0.65f * pulse : 1f;   // 100% ↔ 35%, 완전히 꺼지지 않게
            // 넓은 영역(슈트 전체 발광)의 반복 맥동은 2Hz 로 묶는다 — 칸 밝기만 pulseHz 를 그대로 따른다
            float wideHz = Mathf.Min(hz, 2f);
            float widePulse = wideHz > 0f ? 0.5f + 0.5f * Mathf.Cos(Time.time * 2f * Mathf.PI * wideHz) : 1f;

            UpdateCells(dt, ratio, danger, crit);
            UpdateEnergy(dt);
            UpdateO2(dt, hz > 0f ? pulse : 1f);
            UpdateVisibility(dt);

            // 자체발광 강도: 0 이면 조명을 받는 재질처럼 어둡게
            matInstance.SetFloat(IntensityId, emissiveScale <= 0.01f ? 0.3f : emissiveScale);

            if (suitRenderer != null)
            {
                flashTimer = Mathf.Max(0f, flashTimer - dt);
                suitRenderer.GetPropertyBlock(mpb);
                mpb.SetColor(EmissionId, new Color(1f, 0.15f, 0.15f) * (flashTimer / 0.12f) + dangerColor * (danger ? 0.25f * widePulse : 0f));
                suitRenderer.SetPropertyBlock(mpb);
            }
        }

        void UpdateCells(float dt, float ratio, bool danger, float crit)
        {
            Color tier = TierColor(ratio);
            int on = OnCount(health);
            float frac = Mathf.Clamp01(ratio * segmentCount - (on - 1));
            for (int i = 0; i < cells.Count; i++)
            {
                var c = cells[i];
                if (c.delay > 0f) c.delay -= dt;
                else if (c.on) c.lit = Mathf.Min(1f, c.lit + dt / 0.15f);
                else if (c.flashT < 0.06f) c.flashT += dt;
                else c.lit = Mathf.Max(0f, c.lit - dt / 0.22f);

                float level = c.on ? c.lit : c.lit * c.lit;          // 꺼질 때 ease-out
                if (c.on && i == on - 1) level *= 0.45f + 0.55f * frac; // 맨 위 칸은 남은 비율만큼
                if (c.on) level *= crit;
                bool flash = !c.on && c.delay <= 0f && c.flashT < 0.06f;
                Color col = flash ? Color.white : tier;
                col.a = level;
                c.image.color = col;
                c.mini.color = col;
                c.hatch.enabled = colorScheme == HpColorScheme.Pattern && danger && level > 0.05f;
            }
        }

        Color TierColor(float t)
        {
            switch (colorScheme)
            {
                case HpColorScheme.Mono: return monoColor;
                case HpColorScheme.Pattern: return t >= 0.6f ? okColor : t >= 0.25f ? warnColor : dangerColor;
                default: return healthGradient.Evaluate(t);
            }
        }

        void UpdateEnergy(float dt)
        {
            if (rechargeDelay > 0f) rechargeDelay -= dt;
            else energy = Mathf.Min(100f, energy + 9f * dt);
            // 0.4초 정도에 따라붙는 지수 감쇠
            shownEnergy = Mathf.Lerp(shownEnergy, energy / 100f, 1f - Mathf.Exp(-9f * dt));
            energyArc.fillAmount = shownEnergy;
            var dash = energyEmpty.color;
            dash.a = energy < 1f ? 0.95f : 0.28f;   // 바닥나면 점선 윤곽만 또렷하게
            energyEmpty.color = dash;
        }

        void UpdateO2(float dt, float blink)
        {
            o2 = InVacuum ? Mathf.Max(0f, o2 - 2.4f * dt) : Mathf.Min(100f, o2 + 30f * dt);
            bool want = !conditionalO2 || InVacuum || o2 < 99.5f;
            // 등장 0.3초, 퇴장 0.2초 + 스케일 0.9 → 1
            o2Readout.alpha = Mathf.MoveTowards(o2Readout.alpha, want ? 1f : 0f, dt / (want ? 0.3f : 0.2f));
            o2Readout.transform.localScale = Vector3.one * (0.9f + 0.1f * o2Readout.alpha);

            int value = Mathf.CeilToInt(o2 - 0.0001f);
            if (value != shownO2)
            {
                shownO2 = value;
                o2Value.SetText("{0}", value);   // 문자열 할당 없이 숫자만 갱신
            }
            bool low = o2 < 20f;
            o2Value.color = low ? dangerColor : Color.white;
            var g = low ? dangerColor : okColor;
            g.a = low ? 0.3f + 0.7f * blink : 1f;
            o2Glyph.color = g;
        }

        void UpdateVisibility(float dt)
        {
            // UGUI 캔버스의 '보이는 면' 법선은 -forward. 수평 성분만 비교한다
            Vector3 normal = -vitalsCanvas.forward;
            normal.y = 0f;
            Vector3 toCam = viewCamera.transform.position - vitalsCanvas.position;
            toCam.y = 0f;
            float facing = Vector3.Dot(normal.normalized, toCam.normalized);
            float angle = Mathf.Acos(Mathf.Clamp(facing, -1f, 1f)) * Mathf.Rad2Deg;

            holdTimer = Mathf.Max(0f, holdTimer - dt);
            if (!hidden && angle > showAngle) { hidden = true; holdTimer = minHold; }
            else if (hidden && angle < hideAngle && holdTimer <= 0f) hidden = false;   // 히스테리시스 + 최소 유지

            float target = angleFallback && hidden ? 1f : 0f;
            miniGauge.alpha = Mathf.MoveTowards(miniGauge.alpha, target, dt / 0.25f);
        }

        /// <summary>번쩍임 제한기 — 초당 3회 이하 (WCAG 2.3.1)</summary>
        static class FlashLimiter
        {
            static readonly Queue<float> stamps = new();
            public static bool Request()
            {
                float now = Time.unscaledTime;
                while (stamps.Count > 0 && now - stamps.Peek() > 1f) stamps.Dequeue();
                if (stamps.Count >= 3) return false;
                stamps.Enqueue(now);
                return true;
            }
        }
    }
}
