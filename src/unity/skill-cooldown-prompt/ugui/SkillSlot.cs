using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 스킬 슬롯 하나 — 쿨다운 덮개 · 남은 시간 숫자 · 준비 완료 신호 · 사용 불가 이유 · 충전 · 버튼 안내 (UGUI 버전).
    /// 진행도는 '남은 시간'이 아니라 '남은 비율(remainRatio, 1→0)' 로 저장한다.
    /// 그래서 가속 버프가 총 시간만 바꿔도 덮개 위치는 그대로이고, 걷히는 속도만 달라진다.
    /// 터치 배치에서는 슬롯 자체가 버튼이다 — IPointerDownHandler 로 눌린 순간 TryUse()
    /// (Raycast Target 은 바탕 Frame Image 하나만 켠다. 장식 Image 는 모두 끈다).
    /// </summary>
    public class SkillSlot : MonoBehaviour, IPointerDownHandler
    {
        public enum BlockReason { None, Cooldown, Resource, NoCharge }

        [Header("참조 — Clip(RectMask2D) 안")]
        [SerializeField] RectTransform body;            // 눌림·흔들림 대상 (Frame + Clip 의 부모)
        [SerializeField] Image frame;
        [SerializeField] Image icon;
        [SerializeField] Image cooldownMask;            // Filled · Radial 360 · Origin Top · Clockwise 끔
        [SerializeField] Image cooldownMaskV;           // Filled · Vertical · Origin Top
        [SerializeField] Image binaryMask;              // 이분 방식용 단색 덮개 (Image Type Simple)
        [SerializeField] RectTransform readyGlint;      // 기울인 흰 막대

        [Header("참조 — Clip 밖 (잘리면 안 되는 것)")]
        [SerializeField] Image chargeRing;              // Filled · Radial 360 — 남은 횟수가 있을 때의 진행 고리
        [SerializeField] Image readyRing;               // 준비 완료 고리 (Raycast Target 끔)
        [SerializeField] CanvasGroup resourceLock;      // 물방울 + 필요량
        [SerializeField] TextMeshProUGUI costText;
        [SerializeField] TextMeshProUGUI timer;
        [SerializeField] Image[] chargePips;
        [SerializeField] GameObject keyPrompt;          // 키캡 (TextMeshProUGUI 포함)
        [SerializeField] TextMeshProUGUI keyText;
        [SerializeField] GameObject padPrompt;          // 위치형 중립 패드 기호 Image

        [Header("값")]
        [SerializeField] string displayName = "파동";
        [SerializeField, Tooltip("기본 총 쿨다운 (초)")] float baseDuration = 8f;
        [SerializeField, Min(1)] int maxCharges = 1;
        [SerializeField, Tooltip("0 이면 자원 게이트 없음")] float energyCost;
        [SerializeField] InputActionReference useAction;

        [Header("색 — 색만으로 구분하지 않는다 (덮개 / 물방울 / 빈 점 모양과 함께)")]
        [SerializeField] Color frameReady = new(0.32f, 0.9f, 0.82f);
        [SerializeField] Color frameIdle = new(0.55f, 0.61f, 0.68f);
        [SerializeField] Color frameResource = new(1f, 0.71f, 0.28f);
        [SerializeField] Color iconReady = new(0.32f, 0.9f, 0.82f);
        [SerializeField] Color iconCooling = new(0.86f, 0.9f, 0.95f);
        [SerializeField] Color iconGray = new(0.49f, 0.52f, 0.56f);
        [SerializeField] Color pipFull = new(0.32f, 0.9f, 0.82f);
        [SerializeField] Color pipEmpty = new(1f, 1f, 1f, 0.25f);
        [SerializeField] Color denyColor = new(1f, 0.48f, 0.41f);

        public SkillBar Bar { get; set; }
        public float EnergyCost => energyCost;
        public string DisplayName => displayName;

        float remainRatio;
        int charges;
        BlockReason lastReason;
        int lastTimerKey = int.MinValue;   // 숫자는 표시값이 바뀔 때만 다시 쓴다
        Coroutine denyRoutine, cueRoutine;
        Transform denyHot;                 // 흔들리는 동안 키워 둔 이유 표시 — 중간에 끊겨도 원래 크기로 되돌린다
        Vector2 bodyRest;                  // 흔들림의 기준 위치 (Awake 에서 한 번만 저장)
        float pressT;

        float EffectiveDuration => baseDuration * (Bar != null ? Bar.DurationScale : 1f);

        void Awake()
        {
            charges = maxCharges;
            bodyRest = body.anchoredPosition;
            if (resourceLock) resourceLock.alpha = 0f;
            if (costText) costText.SetText("{0:0}", energyCost);
        }

        // 터치 배치: 슬롯을 누르면 사용 (마우스 클릭도 같은 경로)
        public void OnPointerDown(PointerEventData eventData) => TryUse();

        void OnEnable()
        {
            if (useAction != null) { useAction.action.performed += OnUse; useAction.action.Enable(); }
        }

        void OnDisable()
        {
            if (useAction != null) useAction.action.performed -= OnUse;
        }

        void OnUse(InputAction.CallbackContext _) => TryUse();

        /// <summary>못 쓰는 이유 — 이유마다 다른 모양으로 그린다</summary>
        public BlockReason GetBlockReason()
        {
            if (maxCharges > 1) return charges <= 0 ? BlockReason.NoCharge : BlockReason.None;
            if (remainRatio > 0f) return BlockReason.Cooldown;
            if (energyCost > 0f && Bar != null && Bar.Energy < energyCost) return BlockReason.Resource;
            return BlockReason.None;
        }

        public bool TryUse()
        {
            var reason = GetBlockReason();
            if (reason != BlockReason.None)
            {
                // 거부된 입력에도 반드시 반응한다.
                // 연타로 흔들림이 끊기면 위치·크기를 먼저 원래대로 — 그러지 않으면 슬롯이 조금씩 밀려난다
                if (denyRoutine != null)
                {
                    StopCoroutine(denyRoutine);
                    ResetDenyVisual();
                }
                denyRoutine = StartCoroutine(PlayDenied(reason));
                if (Bar != null) Bar.ShowDenied(this, reason, RemainSeconds);
                return false;
            }
            if (maxCharges > 1)
            {
                charges--;
                if (remainRatio <= 0f) remainRatio = 1f;
            }
            else remainRatio = 1f;
            if (energyCost > 0f && Bar != null) Bar.SpendEnergy(energyCost);
            pressT = 0.22f;
            return true;
        }

        public float RemainSeconds => remainRatio * EffectiveDuration;

        void Update()
        {
            float dt = Time.deltaTime;   // 일시정지 중에도 흐르게 하려면 Time.unscaledDeltaTime

            // linear 감소 — 비율과 시간이 어긋나지 않게
            if (remainRatio > 0f)
            {
                remainRatio -= dt / EffectiveDuration;
                if (remainRatio <= 0f)
                {
                    remainRatio = 0f;
                    if (maxCharges > 1)
                    {
                        charges = Mathf.Min(maxCharges, charges + 1);
                        if (charges < maxCharges) remainRatio = 1f;
                    }
                }
            }

            var reason = GetBlockReason();
            if (reason == BlockReason.None && lastReason != BlockReason.None) PlayReadyCue();   // 준비 완료는 한 번만
            lastReason = reason;

            Refresh(reason);

            // 눌림: 0.92배로 살짝 눌렸다가 돌아온다
            if (pressT > 0f)
            {
                pressT -= dt;
                float u = 1f - Mathf.Clamp01(pressT / 0.22f);
                float s = u < 0.36f ? 1f - 0.08f * (u / 0.36f) : 0.92f + 0.08f * ((u - 0.36f) / 0.64f);
                body.localScale = new Vector3(s, s, 1f);
            }
        }

        void Refresh(BlockReason reason)
        {
            bool covered = maxCharges > 1 ? charges <= 0 : remainRatio > 0f;
            float cover = covered ? remainRatio : 0f;
            var style = Bar != null ? Bar.Fill : SkillBar.FillStyle.Radial;

            cooldownMask.enabled = style == SkillBar.FillStyle.Radial && cover > 0f;
            cooldownMask.fillAmount = cover;                 // 1→0: 12시부터 시계 방향으로 걷힌다
            cooldownMaskV.enabled = style == SkillBar.FillStyle.Vertical && cover > 0f;
            cooldownMaskV.fillAmount = cover;                // Origin Top: 위에 붙은 채 줄어 아래부터 드러난다
            binaryMask.enabled = style == SkillBar.FillStyle.Binary && cover > 0f;

            // 충전형: 남은 횟수가 있으면 덮개 대신 테두리 진행 고리
            bool charging = maxCharges > 1 && charges > 0 && charges < maxCharges;
            chargeRing.enabled = charging;
            chargeRing.fillAmount = 1f - remainRatio;
            for (int i = 0; i < chargePips.Length; i++)
            {
                chargePips[i].gameObject.SetActive(maxCharges > 1 && i < maxCharges);
                chargePips[i].color = i < charges ? pipFull : pipEmpty;
            }

            // 이유별 모양: 쿨다운 = 덮개 + 숫자 / 자원 = 탈색 + 물방울 / 충전 0 = 빈 점 + 덮개
            frame.color = reason == BlockReason.None ? frameReady : reason == BlockReason.Resource ? frameResource : frameIdle;
            icon.color = reason == BlockReason.None ? iconReady : reason == BlockReason.Resource ? iconGray : iconCooling;
            resourceLock.alpha = reason == BlockReason.Resource ? 1f : 0f;

            UpdateTimer(covered ? RemainSeconds : 0f);
        }

        void UpdateTimer(float remain)
        {
            // 짧은 쿨다운은 숫자 없이 덮개만. 판정은 '기본' 총 시간으로 —
            // 가속이 적용된 시간으로 비교하면 버프를 받는 순간 쿨다운 도중에 숫자가 사라진다
            bool hide = remain <= 0f || Bar == null || Bar.Number == SkillBar.NumberMode.None
                        || baseDuration < Bar.NumberMinDuration;
            if (hide)
            {
                if (lastTimerKey != int.MinValue) { timer.text = string.Empty; lastTimerKey = int.MinValue; }
                return;
            }
            bool fine = Bar.Number == SkillBar.NumberMode.Smart && remain < 3f;
            // 올림: 0 이 보이는 순간에는 이미 준비 상태다
            int key = fine ? Mathf.CeilToInt(remain * 10f) : Mathf.CeilToInt(remain) * 100;
            if (key == lastTimerKey) return;
            lastTimerKey = key;
            if (fine) timer.SetText("{0:1}", key / 10f);       // TMP 서식: 콜론 뒤 숫자 = 소수 자릿수 (할당 없음)
            else timer.SetText("{0:0}", Mathf.CeilToInt(remain));
            timer.color = fine ? new Color(1f, 0.95f, 0.79f) : Color.white;
        }

        void PlayReadyCue()
        {
            if (Bar == null || Bar.Cue == SkillBar.ReadyCue.None) return;
            if (cueRoutine != null)
            {
                // 중간에 끊긴 팝이 아이콘을 1.08배로 남기지 않게
                StopCoroutine(cueRoutine);
                icon.rectTransform.localScale = Vector3.one;
            }
            cueRoutine = StartCoroutine(ReadyCueRoutine());
        }

        IEnumerator ReadyCueRoutine()
        {
            // 빛줄기: 350ms 동안 Clip 왼쪽 밖 → 오른쪽 밖 (한 번만, 반복하지 않는다)
            float w = ((RectTransform)readyGlint.parent).rect.width;
            bool glint = Bar.Cue == SkillBar.ReadyCue.Glint;
            readyGlint.gameObject.SetActive(glint);
            readyRing.gameObject.SetActive(!glint);
            for (float t = 0f; t < 0.35f; t += Time.deltaTime)
            {
                float k = t / 0.35f;
                float e = 1f - (1f - k) * (1f - k);   // ease-out
                readyGlint.anchoredPosition = new Vector2(Mathf.Lerp(-w, w, e), 0f);
                // 고리: 테두리에서 1.4배로 퍼지며 사라진다
                readyRing.rectTransform.localScale = Vector3.one * Mathf.Lerp(1f, 1.4f, e);
                readyRing.color = new Color(frameReady.r, frameReady.g, frameReady.b, 1f - e);
                // 아이콘 팝 1 → 1.08 → 1 (앞 180ms)
                float pop = t < 0.18f ? 1f + 0.08f * Mathf.Sin(Mathf.PI * t / 0.18f) : 1f;
                icon.rectTransform.localScale = new Vector3(pop, pop, 1f);
                yield return null;
            }
            icon.rectTransform.localScale = Vector3.one;
            readyGlint.gameObject.SetActive(false);
            readyRing.gameObject.SetActive(false);
        }

        IEnumerator PlayDenied(BlockReason reason)
        {
            // 좌우 6px 감쇠 흔들림 240ms + 이유 표시가 한 번 밝아진다.
            // 기준점은 항상 bodyRest — 흔들리는 도중의 위치를 기준으로 잡으면 연타할 때마다 옆으로 밀린다
            denyHot = reason == BlockReason.Cooldown ? timer.transform
                    : reason == BlockReason.Resource ? resourceLock.transform
                    : chargePips.Length > 0 ? chargePips[0].transform.parent : timer.transform;
            for (float t = 0f; t < 0.24f; t += Time.deltaTime)
            {
                float k = 1f - t / 0.24f;
                body.anchoredPosition = bodyRest + new Vector2(Mathf.Sin(t * Mathf.PI * 2f * 14f) * 6f * k, 0f);
                denyHot.localScale = Vector3.one * (1f + 0.2f * k);
                if (reason == BlockReason.NoCharge)
                    foreach (var pip in chargePips) pip.color = Color.Lerp(pipEmpty, denyColor, k);
                yield return null;
            }
            ResetDenyVisual();
            denyRoutine = null;
        }

        void ResetDenyVisual()
        {
            body.anchoredPosition = bodyRest;
            if (denyHot != null) denyHot.localScale = Vector3.one;
            denyHot = null;
        }

        public void SetDevice(InputGlyphSwitcher.GlyphDevice device, string keyLabel)
        {
            keyPrompt.SetActive(device == InputGlyphSwitcher.GlyphDevice.Keyboard);
            padPrompt.SetActive(device == InputGlyphSwitcher.GlyphDevice.Gamepad);
            if (keyText) keyText.text = keyLabel;
        }

        public InputAction UseAction => useAction != null ? useAction.action : null;
    }
}
