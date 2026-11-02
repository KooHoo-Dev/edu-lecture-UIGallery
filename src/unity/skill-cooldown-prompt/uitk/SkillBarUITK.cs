using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 스킬 쿨다운 + 버튼 안내 — UI Toolkit 버전.
    /// 진행도는 '남은 비율'로 저장한다 (가속 버프는 총 시간 배율만 바꾼다 → 덮개가 튀지 않는다).
    /// 못 쓰는 이유는 슬롯 클래스로 나눈다: .slot--cooling(덮개+숫자) · .slot--no-energy(탈색+물방울) · .slot--empty(빈 점+덮개).
    /// 아래쪽 테스트 입력: 갤러리와 같은 숫자키 1~6.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class SkillBarUITK : MonoBehaviour
    {
        public enum FillStyle { Radial, Vertical, Binary }
        public enum Device { Keyboard, Gamepad, Touch }

        [Serializable]
        class Slot
        {
            public string elementName = "slot-primary";
            public string displayName = "파동";
            public float baseDuration = 8f;
            [Min(1)] public int maxCharges = 1;
            public float energyCost;

            [NonSerialized] public VisualElement root, vmask, pipsRoot;
            [NonSerialized] public RadialCooldown radial;
            [NonSerialized] public Label timer;
            [NonSerialized] public float ratio;          // 남은 비율 1 → 0
            [NonSerialized] public int charges;
            [NonSerialized] public string state = "";
            [NonSerialized] public string lastText;
            [NonSerialized] public float denyT;
            [NonSerialized] public Vector2 denyDir;
        }

        [SerializeField] Slot[] slots =
        {
            new() { elementName = "slot-primary", displayName = "파동", baseDuration = 8f },
            new() { elementName = "slot-dash", displayName = "도약", baseDuration = 2.5f, maxCharges = 2 },
            new() { elementName = "slot-utility", displayName = "보호막", baseDuration = 12f },
            new() { elementName = "slot-ult", displayName = "폭주", baseDuration = 5f, energyCost = 40f },
        };
        [SerializeField] FillStyle fill = FillStyle.Radial;
        [SerializeField] bool smartNumbers = true;
        [SerializeField, Tooltip("총 쿨다운이 이보다 짧으면 숫자를 숨긴다 (초)")] float numberMinDuration = 3f;
        [SerializeField] float energy = 22f;
        [SerializeField] float regenPerSecond = 2.5f;
        [SerializeField, Range(0.4f, 0.9f)] float hasteScale = 0.6f;
        [SerializeField] float hasteSeconds = 6f;
        [SerializeField] PlayerInput playerInput;    // 선택: 연결하면 마지막 입력 장치를 따라간다

        VisualElement hud, energyFill, costMarker, hasteChip;
        Label energyLabel, toast;
        float hasteTimer, toastTimer, lastSwitch = -10f;
        int lastEnergyShown = -1;   // 에너지 숫자는 정수값이 바뀔 때만 다시 쓴다
        Device device = Device.Keyboard;

        float Scale => hasteTimer > 0f ? hasteScale : 1f;
        float Duration(Slot s) => s.baseDuration * Scale;

        void OnEnable()
        {
            // UIDocument 는 켜질 때마다 트리를 새로 만든다 → 요소를 다시 찾는다
            hud = GetComponent<UIDocument>().rootVisualElement.Q("hud");
            energyFill = hud.Q("energy-fill");
            costMarker = hud.Q("cost-marker");
            hasteChip = hud.Q("haste-chip");
            energyLabel = hud.Q<Label>("energy-label");
            toast = hud.Q<Label>("toast");

            foreach (var s in slots)
            {
                s.root = hud.Q(s.elementName);
                s.radial = s.root.Q<RadialCooldown>();
                s.vmask = s.root.Q(className: "slot__vmask");
                s.timer = s.root.Q<Label>(className: "slot__timer");
                s.pipsRoot = s.root.Q(className: "slot__pips");
                s.charges = s.maxCharges;
                s.lastText = null;
                s.state = "";
                var cost = s.root.Q<Label>(className: "slot__cost");
                if (cost != null) cost.text = s.energyCost.ToString("0");
                // 슬롯을 누르면 사용 (터치 배치에서는 슬롯 자체가 버튼)
                var captured = s;
                s.root.RegisterCallback<PointerDownEvent>(_ => TryUse(captured));
            }

            var ult = slots[slots.Length - 1];
            costMarker.style.left = Length.Percent(ult.energyCost);
            costMarker.style.display = ult.energyCost > 0f ? DisplayStyle.Flex : DisplayStyle.None;
            hud.EnableInClassList("fill-vertical", fill == FillStyle.Vertical);
            hud.EnableInClassList("fill-binary", fill == FillStyle.Binary);
            ApplyDevice(device);

            if (playerInput) playerInput.onControlsChanged += OnControlsChanged;
        }

        void OnDisable()
        {
            if (playerInput) playerInput.onControlsChanged -= OnControlsChanged;
        }

        void OnControlsChanged(PlayerInput input)
        {
            var d = input.currentControlScheme == "Gamepad" ? Device.Gamepad : input.currentControlScheme == "Touch" ? Device.Touch : Device.Keyboard;
            if (Time.unscaledTime - lastSwitch < 0.25f) return;   // 디바운스 (강사 확인: 놓친 전환은 다음 입력에서 다시 들어온다)
            ApplyDevice(d);
        }

        /// <summary>루트 클래스 하나로 모든 슬롯의 안내 · 배치가 한꺼번에 바뀐다</summary>
        void ApplyDevice(Device d)
        {
            device = d;
            lastSwitch = Time.unscaledTime;
            hud.EnableInClassList("device-keyboard", d == Device.Keyboard);
            hud.EnableInClassList("device-gamepad", d == Device.Gamepad);
            hud.EnableInClassList("device-touch", d == Device.Touch);
        }

        string BlockReason(Slot s)
        {
            if (s.maxCharges > 1) return s.charges <= 0 ? "empty" : "";
            if (s.ratio > 0f) return "cooldown";
            if (s.energyCost > 0f && energy < s.energyCost) return "energy";
            return "";
        }

        bool TryUse(Slot s)
        {
            string reason = BlockReason(s);
            if (reason != "")
            {
                // 거부된 입력에도 반응: 흔들림 + 이유 표시 강조 + 같은 기호의 안내
                s.denyT = 0.24f;
                s.root.AddToClassList("slot--hot-" + reason);
                float remain = s.ratio * Duration(s);
                toast.text = reason == "cooldown" ? $"{s.displayName} · 재사용 대기 {remain:0.0}초"
                           : reason == "energy" ? $"{s.displayName} · 에너지 부족 — {Mathf.CeilToInt(s.energyCost - energy)} 더 필요"
                           : $"{s.displayName} · 충전 없음 — 다음 충전 {remain:0.0}초";
                toast.EnableInClassList("toast--energy", reason == "energy");
                toast.EnableInClassList("toast--empty", reason == "empty");
                toast.RemoveFromClassList("hidden");
                toastTimer = 1.5f;
                return false;
            }
            if (s.maxCharges > 1)
            {
                s.charges--;
                if (s.ratio <= 0f) s.ratio = 1f;
            }
            else s.ratio = 1f;
            if (s.energyCost > 0f) energy = Mathf.Max(0f, energy - s.energyCost);
            return true;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            energy = Mathf.Min(100f, energy + regenPerSecond * dt);
            energyFill.style.width = Length.Percent(energy);
            int shown = Mathf.FloorToInt(energy);
            if (shown != lastEnergyShown)
            {
                lastEnergyShown = shown;
                energyLabel.text = $"에너지 {shown}";   // 매 프레임 문자열을 만들지 않는다
            }

            if (hasteTimer > 0f && (hasteTimer -= dt) <= 0f) hasteChip.AddToClassList("hidden");
            if (toastTimer > 0f && (toastTimer -= dt) <= 0f) toast.AddToClassList("hidden");

            foreach (var s in slots) UpdateSlot(s, dt);
            costMarker.EnableInClassList("energy__cost--hot", BlockReason(slots[slots.Length - 1]) == "energy");

            TestInput();
        }

        void UpdateSlot(Slot s, float dt)
        {
            // linear 감소
            if (s.ratio > 0f)
            {
                s.ratio -= dt / Duration(s);
                if (s.ratio <= 0f)
                {
                    s.ratio = 0f;
                    if (s.maxCharges > 1)
                    {
                        s.charges = Mathf.Min(s.maxCharges, s.charges + 1);
                        if (s.charges < s.maxCharges) s.ratio = 1f;
                    }
                }
            }

            string reason = BlockReason(s);
            string state = reason == "" ? "ready" : reason == "cooldown" ? "cooling" : reason == "energy" ? "no-energy" : "empty";
            if (state != s.state)
            {
                bool becameReady = state == "ready" && s.state != "" && s.state != "ready";
                foreach (var c in new[] { "ready", "cooling", "no-energy", "empty" })
                    s.root.EnableInClassList("slot--" + c, c == state);
                s.state = state;
                if (becameReady) PlayReadyCue(s);   // 준비 완료는 한 번만
            }

            bool covered = s.maxCharges > 1 ? s.charges <= 0 : s.ratio > 0f;
            float cover = covered ? s.ratio : 0f;
            s.radial.progress = cover;                                   // 바뀔 때만 MarkDirtyRepaint
            s.vmask.style.height = Length.Percent(cover * 100f);          // 위에 붙은 채 줄어든다

            // 충전 점
            int i = 0;
            foreach (var pip in s.pipsRoot.Children())
            {
                pip.style.display = s.maxCharges > 1 && i < s.maxCharges ? DisplayStyle.Flex : DisplayStyle.None;
                pip.EnableInClassList("pip--empty", i >= s.charges);
                i++;
            }

            // 숫자: 바뀔 때만 text 를 다시 쓴다 (3초 미만 0.1초 단위, 그 위는 올림 정수).
            // 숨김 판정은 '기본' 총 시간 — 가속으로 짧아진 시간으로 비교하면 버프 순간 숫자가 사라진다
            float remain = covered ? s.ratio * Duration(s) : 0f;
            string text = remain <= 0f || s.baseDuration < numberMinDuration ? ""
                        : smartNumbers && remain < 3f ? (Mathf.Ceil(remain * 10f) / 10f).ToString("0.0")
                        : Mathf.CeilToInt(remain).ToString();
            if (text != s.lastText)
            {
                s.lastText = text;
                s.timer.text = text;
                s.timer.EnableInClassList("slot__timer--final", smartNumbers && remain > 0f && remain < 3f);
            }

            // 거부 흔들림 (좌우 6px, 240ms 감쇠)
            if (s.denyT > 0f)
            {
                s.denyT -= dt;
                float k = Mathf.Max(0f, s.denyT / 0.24f);
                float x = Mathf.Sin((0.24f - s.denyT) * Mathf.PI * 2f * 14f) * 6f * k;
                s.root.style.translate = new Translate(x, 0);
                if (s.denyT <= 0f)
                {
                    s.root.style.translate = new Translate(0, 0);
                    foreach (var r in new[] { "cooldown", "energy", "empty" }) s.root.RemoveFromClassList("slot--hot-" + r);
                }
            }
        }

        void PlayReadyCue(Slot s)
        {
            // display: none 이었던 요소를 켜는 같은 프레임에 클래스를 붙이면 transition 이 돌지 않는다 → 한 프레임 뒤
            s.root.schedule.Execute(() =>
            {
                s.root.AddToClassList("slot--glint");
                s.root.AddToClassList("slot--pop");
            }).StartingIn(16);
            s.root.schedule.Execute(() => s.root.RemoveFromClassList("slot--pop")).StartingIn(16 + 90);
            s.root.schedule.Execute(() => s.root.RemoveFromClassList("slot--glint")).StartingIn(16 + 400);
        }

        public void GainEnergy(float amount) => energy = Mathf.Min(100f, energy + amount);

        public void ApplyHaste()
        {
            hasteTimer = hasteSeconds;
            hasteChip.text = $"쿨다운 가속 · 총 시간 ×{hasteScale:0.##}";
            hasteChip.RemoveFromClassList("hidden");
        }

        /* ───── 테스트 입력: 갤러리와 같은 숫자키 ───── */
        void TestInput()
        {
            var k = Keyboard.current;
            if (k == null) return;
            if (k.digit1Key.wasPressedThisFrame) TryUse(slots[0]);
            if (k.digit2Key.wasPressedThisFrame) TryUse(slots[1]);
            if (k.digit3Key.wasPressedThisFrame) TryUse(slots[3]);
            if (k.digit4Key.wasPressedThisFrame) GainEnergy(25f);
            if (k.digit5Key.wasPressedThisFrame) ApplyHaste();
            if (k.digit6Key.wasPressedThisFrame) ApplyDevice((Device)(((int)device + 1) % 3));
            // 실제 플레이 키 (데모용 직접 읽기 — 실제 게임은 InputAction 으로)
            if (k.qKey.wasPressedThisFrame) TryUse(slots[0]);
            if (k.leftShiftKey.wasPressedThisFrame) TryUse(slots[1]);
            if (k.eKey.wasPressedThisFrame) TryUse(slots[2]);
            if (k.rKey.wasPressedThisFrame) TryUse(slots[3]);
        }
    }
}
