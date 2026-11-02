using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 세계 안 체력 표시 — UI Toolkit 버전.
    /// VitalsBack.uxml 은 RenderTexture 패널(PanelSettings_RT)에 그려 등판 Quad 에 붙이고,
    /// FallbackHud.uxml 은 화면 패널에 그린다. 등판이 가려지면(80° 초과) 미니 게이지를 띄우고 65° 미만 + 1초 후 끈다.
    /// </summary>
    public class DiegeticVitalsUITK : MonoBehaviour
    {
        [Header("참조")]
        [SerializeField] UIDocument backDocument;       // PanelSettings_RT
        [SerializeField] UIDocument fallbackDocument;   // PanelSettings_Screen
        [SerializeField, Tooltip("RT 를 그리는 등판 Quad (기본 Quad 의 보이는 면 법선 = -forward)")] Transform backQuad;
        [SerializeField] Renderer backQuadRenderer;
        [SerializeField] Camera viewCamera;

        [Header("값")]
        [SerializeField, Range(3, 12)] int segmentCount = 10;
        [SerializeField] float maxHealth = 100f;
        [SerializeField] bool patternForDanger = true;
        [SerializeField] bool conditionalO2 = true;
        [SerializeField, Range(0f, 3f)] float emissiveScale = 1.6f;
        [SerializeField] bool angleFallback = true;
        [SerializeField, Range(0f, 3f)] float pulseHz = 1.5f;
        [SerializeField] Color okColor = new(0.24f, 0.96f, 0.78f);
        [SerializeField] Color warnColor = new(1f, 0.7f, 0.22f);
        [SerializeField] Color dangerColor = new(1f, 0.27f, 0.27f);

        public bool InVacuum { get; private set; }

        readonly List<VitalsCell> cells = new();
        readonly List<VitalsCell> miniCells = new();
        readonly List<float> lit = new(), delay = new(), flashT = new();
        readonly List<bool> on = new();
        VisualElement o2, miniGauge, miniEnergyFill;
        Label o2Value;
        EnergyArcElement arc;
        MaterialPropertyBlock mpb;
        static readonly int IntensityId = Shader.PropertyToID("_Intensity");

        float health = 70f, energy = 80f, shownEnergy = 0.8f, o2Amount = 100f, rechargeDelay, holdTimer;
        bool hidden;
        int shownO2 = -1;

        void OnEnable()
        {
            // rootVisualElement 는 UIDocument 가 활성화된 뒤에만 유효 → Awake 가 아니라 OnEnable
            if (viewCamera == null) viewCamera = Camera.main;
            mpb ??= new MaterialPropertyBlock();
            var root = backDocument.rootVisualElement;
            var spine = root.Q("spine-gauge");
            o2 = root.Q("o2");
            o2Value = root.Q<Label>("o2-value");
            arc = root.Q<EnergyArcElement>("energy-arc");
            var fb = fallbackDocument.rootVisualElement;
            miniGauge = fb.Q("mini-gauge");
            miniEnergyFill = fb.Q("mini-energy-fill");
            var miniRow = fb.Q("mini-cells");

            spine.Clear();
            miniRow.Clear();
            cells.Clear(); miniCells.Clear(); lit.Clear(); delay.Clear(); flashT.Clear(); on.Clear();
            int count = OnCount(health);
            for (int i = 0; i < segmentCount; i++)
            {
                var c = new VitalsCell();
                spine.Add(c);   // .spine 은 column-reverse → 0번이 맨 아래
                cells.Add(c);
                var m = new VitalsCell();
                miniRow.Add(m);
                miniCells.Add(m);
                on.Add(i < count);
                lit.Add(i < count ? 1f : 0f);
                delay.Add(0f);
                flashT.Add(1f);
            }
        }

        int OnCount(float hp) => hp <= 0f ? 0 : Mathf.CeilToInt(hp / maxHealth * segmentCount - 0.0001f);

        public void TakeDamage(float amount) => SetHealth(health - amount);
        public void Heal(float amount) => SetHealth(health + amount);
        public void SetVacuum(bool value) => InVacuum = value;

        public void UseAbility()
        {
            if (energy < 25f) return;
            energy -= 25f;
            rechargeDelay = 2f;
        }

        void SetHealth(float value)
        {
            int before = OnCount(health);
            health = Mathf.Clamp(value, 0f, maxHealth);
            int after = OnCount(health);
            for (int i = before - 1, k = 0; i >= after; i--, k++) { on[i] = false; delay[i] = k * 0.04f; flashT[i] = 0f; lit[i] = 1f; }
            int added = after - before;
            for (int i = before, k = 0; i < after; i++, k++) { on[i] = true; delay[i] = k * 0.45f / added; flashT[i] = 1f; }
        }

        void Update()
        {
            if (cells.Count == 0) return;
            float dt = Time.deltaTime;
            float ratio = health / maxHealth;
            bool danger = ratio < 0.25f;
            float hz = Mathf.Min(pulseHz, 3f);
            float pulse = hz > 0f ? 0.5f + 0.5f * Mathf.Cos(Time.time * 2f * Mathf.PI * hz) : 1f;
            float crit = danger ? 0.35f + 0.65f * pulse : 1f;
            Color tier = ratio >= 0.6f ? okColor : ratio >= 0.25f ? warnColor : dangerColor;
            int count = OnCount(health);
            float frac = Mathf.Clamp01(ratio * segmentCount - (count - 1));

            for (int i = 0; i < cells.Count; i++)
            {
                if (delay[i] > 0f) delay[i] -= dt;
                else if (on[i]) lit[i] = Mathf.Min(1f, lit[i] + dt / 0.15f);
                else if (flashT[i] < 0.06f) flashT[i] += dt;
                else lit[i] = Mathf.Max(0f, lit[i] - dt / 0.22f);

                float level = on[i] ? lit[i] : lit[i] * lit[i];
                if (on[i] && i == count - 1) level *= 0.45f + 0.55f * frac;
                if (on[i]) level *= crit;
                bool flash = !on[i] && delay[i] <= 0f && flashT[i] < 0.06f;
                Color col = flash ? Color.white : tier;
                // 밝기는 opacity 로만 — 다시 그리기는 색이 바뀔 때만 일어난다
                cells[i].CellColor = col;
                cells[i].style.opacity = Mathf.Max(0.08f, level);
                cells[i].Hatched = patternForDanger && danger && on[i];
                miniCells[i].CellColor = col;
                miniCells[i].style.opacity = Mathf.Max(0.08f, level);
            }

            // 동력
            if (rechargeDelay > 0f) rechargeDelay -= dt;
            else energy = Mathf.Min(100f, energy + 9f * dt);
            shownEnergy = Mathf.Lerp(shownEnergy, energy / 100f, 1f - Mathf.Exp(-9f * dt));
            arc.fill = shownEnergy;
            miniEnergyFill.style.width = Length.Percent(energy);

            // 산소: 클래스를 넣고 빼면 USS transition 이 등장(0.3초)·퇴장(0.2초)을 맡는다
            o2Amount = InVacuum ? Mathf.Max(0f, o2Amount - 2.4f * dt) : Mathf.Min(100f, o2Amount + 30f * dt);
            o2.EnableInClassList("o2--hidden", conditionalO2 && !InVacuum && o2Amount >= 99.5f);
            o2.EnableInClassList("o2--low", o2Amount < 20f);
            int value = Mathf.CeilToInt(o2Amount - 0.0001f);
            if (value != shownO2)
            {
                shownO2 = value;
                o2Value.text = value.ToString();   // 정수가 바뀔 때만 문자열 생성
            }

            // 발광 강도: RT 를 그리는 Quad 머티리얼에 곱한다
            if (backQuadRenderer != null)
            {
                backQuadRenderer.GetPropertyBlock(mpb);
                mpb.SetFloat(IntensityId, emissiveScale <= 0.01f ? 0.3f : emissiveScale);
                backQuadRenderer.SetPropertyBlock(mpb);
            }

            // 등판 가시성 (기본 Quad 의 보이는 면 법선 = -forward)
            Vector3 normal = -backQuad.forward; normal.y = 0f;
            Vector3 toCam = viewCamera.transform.position - backQuad.position; toCam.y = 0f;
            float angle = Mathf.Acos(Mathf.Clamp(Vector3.Dot(normal.normalized, toCam.normalized), -1f, 1f)) * Mathf.Rad2Deg;
            holdTimer = Mathf.Max(0f, holdTimer - dt);
            if (!hidden && angle > 80f) { hidden = true; holdTimer = 1f; }
            else if (hidden && angle < 65f && holdTimer <= 0f) hidden = false;
            miniGauge.EnableInClassList("mini--hidden", !(angleFallback && hidden));
        }
    }
}
