using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 스킬 바 전체 — 공용 설정(덮개 방식 · 숫자 · 준비 신호), 에너지 바와 궁극기 비용 눈금,
    /// 쿨다운 가속 버프, 거부 안내, 입력 장치별 배치(단축바 ↔ 터치 부채꼴)를 맡는다.
    /// </summary>
    public class SkillBar : MonoBehaviour
    {
        public enum FillStyle { Radial, Vertical, Binary }
        public enum NumberMode { Smart, Seconds, None }
        public enum ReadyCue { Glint, Ring, None }

        [Header("슬롯 (순서: 기본 · 이동기 · 보조 · 궁극기)")]
        [SerializeField] SkillSlot[] slots;
        [SerializeField] string[] keyLabels = { "Q", "Shift", "E", "R" };
        [SerializeField] SkillSlot ultimate;

        [Header("공용 설정")]
        [SerializeField] FillStyle fill = FillStyle.Radial;
        [SerializeField] NumberMode number = NumberMode.Smart;
        [SerializeField, Tooltip("총 쿨다운이 이보다 짧으면 숫자를 숨긴다 (초)")] float numberMinDuration = 3f;
        [SerializeField] ReadyCue cue = ReadyCue.Glint;

        [Header("에너지")]
        [SerializeField] Image energyFill;              // Filled · Horizontal · Origin Left
        [SerializeField] RectTransform costMarker;      // 앵커 x = 비용 / 100
        [SerializeField] Image costMarkerImage;
        [SerializeField] TextMeshProUGUI energyLabel;
        [SerializeField] float energy = 22f;
        [SerializeField] float regenPerSecond = 2.5f;

        [Header("쿨다운 가속 버프")]
        [SerializeField, Range(0.4f, 0.9f), Tooltip("버프 동안 총 시간 × 이 값")] float hasteScale = 0.6f;
        [SerializeField] float hasteSeconds = 6f;
        [SerializeField] GameObject hasteChip;

        [Header("거부 안내")]
        [SerializeField] CanvasGroup toast;
        [SerializeField] TextMeshProUGUI toastText;
        [SerializeField] Image toastIcon;
        [SerializeField] Sprite clockSprite, dropSprite, emptyPipsSprite;

        [Header("배치 (터치 = 우하단 부채꼴)")]
        [SerializeField] RectTransform[] slotRects;
        // 슬롯 중심(Pivot 0.5) 기준. 단축바 = 하단 중앙 앵커, 터치 = 우하단 앵커 (태블릿 가로)
        [SerializeField] Vector2[] barPositions = { new(-360, 195), new(-140, 195), new(80, 195), new(325, 210) };
        [SerializeField] Vector2[] barSizes = { new(180, 180), new(180, 180), new(180, 180), new(210, 210) };
        // 기본·도약·보호막은 모서리에서 610 안쪽(엄지가 편한 곳), 궁극기만 그 바깥(손을 뻗어야 닿는 곳, 약 730)
        [SerializeField] Vector2[] touchPositions = { new(-190, 180), new(-450, 180), new(-374, 364), new(-280, 675) };
        [SerializeField] Vector2[] touchSizes = { new(200, 200), new(140, 140), new(140, 140), new(150, 150) };

        float hasteTimer;
        int lastEnergyShown = -1;
        Coroutine toastRoutine, layoutRoutine;

        public float Energy => energy;
        public float DurationScale => hasteTimer > 0f ? hasteScale : 1f;   // 비율은 그대로, 총 시간만 바뀐다
        public FillStyle Fill => fill;
        public NumberMode Number => number;
        public float NumberMinDuration => numberMinDuration;
        public ReadyCue Cue => cue;

        void Awake()
        {
            foreach (var s in slots) s.Bar = this;
            if (toast) toast.alpha = 0f;
            if (hasteChip) hasteChip.SetActive(false);
            if (ultimate && costMarker)
            {
                float x = ultimate.EnergyCost / 100f;
                costMarker.anchorMin = new Vector2(x, costMarker.anchorMin.y);
                costMarker.anchorMax = new Vector2(x, costMarker.anchorMax.y);
                costMarker.gameObject.SetActive(ultimate.EnergyCost > 0f);
            }
        }

        void Update()
        {
            energy = Mathf.Min(100f, energy + regenPerSecond * Time.deltaTime);
            energyFill.fillAmount = energy / 100f;
            int shown = Mathf.FloorToInt(energy);
            if (shown != lastEnergyShown)
            {
                lastEnergyShown = shown;
                energyLabel.SetText("{0:0}", shown);
            }
            // 자원 부족일 때 에너지 바의 비용 눈금을 강조 — 슬롯의 물방울과 짝
            if (ultimate && costMarkerImage)
                costMarkerImage.color = ultimate.GetBlockReason() == SkillSlot.BlockReason.Resource ? new Color(1f, 0.71f, 0.28f) : new Color(1f, 1f, 1f, 0.55f);

            if (hasteTimer > 0f)
            {
                hasteTimer -= Time.deltaTime;
                if (hasteTimer <= 0f && hasteChip) hasteChip.SetActive(false);
            }
        }

        public void GainEnergy(float amount) => energy = Mathf.Min(100f, energy + amount);
        public void SpendEnergy(float amount) => energy = Mathf.Max(0f, energy - amount);

        /// <summary>슬롯은 남은 '비율'을 저장하므로 배율만 바꾸면 된다 — 덮개가 튀지 않는다</summary>
        public void ApplyHaste()
        {
            hasteTimer = hasteSeconds;
            if (hasteChip) hasteChip.SetActive(true);
        }

        public void ShowDenied(SkillSlot slot, SkillSlot.BlockReason reason, float remainSeconds)
        {
            if (!toast) return;
            string name = slot.DisplayName;
            switch (reason)
            {
                case SkillSlot.BlockReason.Cooldown:
                    toastText.text = $"{name} · 재사용 대기 {remainSeconds:0.0}초";
                    toastIcon.sprite = clockSprite;
                    break;
                case SkillSlot.BlockReason.Resource:
                    toastText.text = $"{name} · 에너지 부족 — {Mathf.CeilToInt(slot.EnergyCost - energy)} 더 필요";
                    toastIcon.sprite = dropSprite;
                    break;
                default:
                    toastText.text = $"{name} · 충전 없음 — 다음 충전 {remainSeconds:0.0}초";
                    toastIcon.sprite = emptyPipsSprite;
                    break;
            }
            if (toastRoutine != null) StopCoroutine(toastRoutine);
            toastRoutine = StartCoroutine(ToastRoutine());
        }

        IEnumerator ToastRoutine()
        {
            toast.alpha = 1f;
            yield return new WaitForSeconds(1.1f);
            for (float t = 0f; t < 0.4f; t += Time.deltaTime)
            {
                toast.alpha = 1f - t / 0.4f;
                yield return null;
            }
            toast.alpha = 0f;
        }

        /// <summary>InputGlyphSwitcher 가 부른다 — 모든 슬롯의 안내를 한꺼번에 바꾸고, 터치면 부채꼴로 옮긴다</summary>
        public void SetDevice(InputGlyphSwitcher.GlyphDevice device)
        {
            for (int i = 0; i < slots.Length; i++)
                slots[i].SetDevice(device, i < keyLabels.Length ? keyLabels[i] : "");
            bool touch = device == InputGlyphSwitcher.GlyphDevice.Touch;
            if (layoutRoutine != null) StopCoroutine(layoutRoutine);
            layoutRoutine = StartCoroutine(MoveSlots(touch ? touchPositions : barPositions, touch ? touchSizes : barSizes, touch));
        }

        IEnumerator MoveSlots(Vector2[] pos, Vector2[] size, bool touch)
        {
            // 앵커: 단축바는 하단 중앙, 터치는 우하단
            var anchor = touch ? new Vector2(1f, 0f) : new Vector2(0.5f, 0f);
            var from = new Vector2[slotRects.Length];
            var fromSize = new Vector2[slotRects.Length];
            for (int i = 0; i < slotRects.Length; i++)
            {
                var r = slotRects[i];
                Vector3 world = r.position;
                r.anchorMin = r.anchorMax = anchor;
                r.position = world;                      // 앵커만 바꾸고 화면 위치는 유지한 뒤 보간
                from[i] = r.anchoredPosition;
                fromSize[i] = r.sizeDelta;
            }
            for (float t = 0f; t < 0.32f; t += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - t / 0.32f, 3f);   // ease-out
                for (int i = 0; i < slotRects.Length; i++)
                {
                    slotRects[i].anchoredPosition = Vector2.Lerp(from[i], pos[i], k);
                    slotRects[i].sizeDelta = Vector2.Lerp(fromSize[i], size[i], k);
                }
                yield return null;
            }
            for (int i = 0; i < slotRects.Length; i++)
            {
                slotRects[i].anchoredPosition = pos[i];
                slotRects[i].sizeDelta = size[i];
            }
        }

        public SkillSlot Slot(int i) => slots[i];
    }
}
