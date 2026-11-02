using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 즉시 미리보기 적용기 — 설정 데이터의 Changed 를 구독해 미리보기 장면·자막·HUD·메뉴 글자를 다시 그린다.
    /// 옵션마다 바꾸는 렌더링 수단이 다르다:
    ///   글자 크기 = TMP fontSize 배율 · 자막 배경 = Image 알파 · 색각 = 역할 색 팔레트 교체
    ///   고대비 = 배경 어둡게 + 대상 단색/외곽선 · 카메라 흔들림 = 미리보기 카메라 진폭 · HUD 크기 = localScale
    /// 미리보기 장면은 전용 Camera → RenderTexture → RawImage 로 메뉴 옆에 보여 준다.
    /// </summary>
    public class SettingsPreview : MonoBehaviour
    {
        [SerializeField] SettingsMenu menu;

        [Header("글자 크기 (메뉴·설명·자막 모두 포함!)")]
        [SerializeField] TMP_Text[] scaledTexts;

        [Header("자막")]
        [SerializeField] Image subtitleBackground;
        [SerializeField] TMP_Text subtitleLine;
        [SerializeField] TMP_Text speakerName;
        [SerializeField] GameObject directionArrowLeft;
        [SerializeField] GameObject directionArrowRight;
        [SerializeField] Color[] subtitleColors = { Color.white, new(1f, 0.89f, 0.36f), new(0.65f, 0.9f, 1f) };

        [Header("역할 색 팔레트 (끔 · 적색약 · 녹색약 · 청색약) — 모양(아군 캡슐 · 적 삼각 · 아이템 마름모)은 바꾸지 않는다")]
        [SerializeField] Color[] allyColors = { new(0.27f, 0.71f, 1f), new(0.23f, 0.51f, 1f), new(0.18f, 0.45f, 1f), new(0.09f, 0.77f, 0.7f) };
        [SerializeField] Color[] voice2Colors = { new(0.49f, 0.94f, 0.64f), new(0.66f, 0.86f, 1f), new(0.71f, 0.84f, 1f), new(1f, 0.76f, 0.85f) };   // 두 번째 화자(도윤)
        [SerializeField] Color[] enemyColors = { new(1f, 0.29f, 0.35f), new(0.95f, 0.7f, 0f), new(1f, 0.53f, 0f), new(1f, 0.23f, 0.49f) };
        [SerializeField] Color[] itemColors = { new(1f, 0.82f, 0.25f), new(0.96f, 0.96f, 0.96f), new(1f, 0.94f, 0.6f), Color.white };
        [SerializeField] Graphic[] allyMarkers, enemyMarkers, itemMarkers;       // 월드 위 역할 표식 (항상 역할 색)

        [Header("고대비 (미리보기 장면만)")]
        [SerializeField] CanvasGroup backgroundDim;                              // 장면 위 검은 막. URP 라면 미리보기 전용 Volume(Saturation)으로 대체
        [SerializeField] SpriteRenderer[] allies, enemies, items;                // 실루엣
        [SerializeField] GameObject[] outlines;                                  // 굵은 외곽선 스프라이트
        [SerializeField] Color naturalAlly = new(0.35f, 0.41f, 0.29f), naturalEnemy = new(0.29f, 0.22f, 0.19f), naturalItem = new(0.64f, 0.47f, 0.27f);

        [Header("HUD · 흔들림")]
        [SerializeField] RectTransform hudRoot;
        [SerializeField] GameObject centerDot;
        [SerializeField] Transform previewCamera;
        [SerializeField] Graphic hitFrame;                                      // 흔들림 0 일 때 대신 강조할 테두리

        float[] baseSizes;
        Vector3 cameraHome;
        Coroutine shakeRoutine;
        AccessibilitySettings S => menu.Settings;

        void Start()
        {
            baseSizes = new float[scaledTexts.Length];
            for (int i = 0; i < scaledTexts.Length; i++) baseSizes[i] = scaledTexts[i].fontSize;
            cameraHome = previewCamera.localPosition;
            if (hitFrame) hitFrame.canvasRenderer.SetAlpha(0f);
            S.Changed += Apply;
            Apply(S, null);
        }

        void OnDestroy()
        {
            if (menu && menu.Settings) menu.Settings.Changed -= Apply;
        }

        void Apply(AccessibilitySettings s, AccessibilitySettings.Key? _)
        {
            // 글자 크기: CanvasScaler 가 아니라 fontSize 로. 행 높이는 레이아웃 그룹이 알아서 늘린다
            float k = s.Get(AccessibilitySettings.Key.TextScale) / 100f;
            for (int i = 0; i < scaledTexts.Length; i++) scaledTexts[i].fontSize = baseSizes[i] * k;

            // 자막
            float[] alpha = { 0f, 0.5f, 0.85f };
            var bg = subtitleBackground.color;
            bg.a = alpha[s.Get(AccessibilitySettings.Key.SubtitleBg)];
            subtitleBackground.color = bg;
            subtitleLine.color = subtitleColors[s.Get(AccessibilitySettings.Key.SubtitleColor)];
            bool cues = s.GetBool(AccessibilitySettings.Key.SpeakerCues);
            speakerName.gameObject.SetActive(cues);

            // 역할 색 (화자명 색은 화자마다 다르므로 voice 기준)
            int cb = s.Get(AccessibilitySettings.Key.ColorMode);
            speakerName.color = SpeakerColor(cb);
            foreach (var g in allyMarkers) g.color = allyColors[cb];
            foreach (var g in enemyMarkers) g.color = enemyColors[cb];
            foreach (var g in itemMarkers) g.color = itemColors[cb];

            // 고대비: 1 배경 억제 · 2 역할 단색 · 3 단색 + 외곽선
            int hc = s.Get(AccessibilitySettings.Key.HighContrast);
            backgroundDim.alpha = hc > 0 ? 0.6f : 0f;
            bool roleFill = hc >= 2;
            foreach (var r in allies) r.color = roleFill ? allyColors[cb] : naturalAlly;
            foreach (var r in enemies) r.color = roleFill ? enemyColors[cb] : naturalEnemy;
            foreach (var r in items) r.color = roleFill ? itemColors[cb] : naturalItem;
            foreach (var o in outlines) o.SetActive(hc == 3);

            // HUD
            float[] hudScale = { 0.78f, 1f, 1.38f };
            hudRoot.localScale = Vector3.one * hudScale[s.Get(AccessibilitySettings.Key.HudSize)];
            centerDot.SetActive(s.GetBool(AccessibilitySettings.Key.CenterDot));
        }

        int voice;   // 지금 대사의 화자: 0 하린(아군 색) · 1 도윤(두 번째 화자 색)
        Color SpeakerColor(int cb) => voice == 1 ? voice2Colors[cb] : allyColors[cb];

        /// <summary>대사 한 줄 재생. voice: 0 하린 · 1 도윤, dir: -1 왼쪽 화면 밖, +1 오른쪽, 0 화면 안</summary>
        public void PlayLine(string who, string line, int voice, int dir)
        {
            bool cues = S.GetBool(AccessibilitySettings.Key.SpeakerCues);
            this.voice = voice;
            speakerName.text = who + ":";
            speakerName.color = SpeakerColor(S.Get(AccessibilitySettings.Key.ColorMode));
            subtitleLine.text = line;
            directionArrowLeft.SetActive(cues && dir < 0);
            directionArrowRight.SetActive(cues && dir > 0);
            subtitleLine.canvasRenderer.SetAlpha(0f);
            subtitleLine.CrossFadeAlpha(1f, 0.12f, true);   // 위치 이동 없이 짧은 페이드만
        }

        /// <summary>피격 테스트: 흔들림 값만큼 미리보기 카메라를 흔든다. 0 이면 테두리만 강조</summary>
        public void HitTest()
        {
            int amount = S.Get(AccessibilitySettings.Key.CameraShake);
            if (amount == 0)
            {
                // 연타로 초당 3회를 넘기면 깜빡이지 않고 정지 강조로 바꾼다 (WCAG 2.3.1 번쩍임 제한)
                bool still = S.GetBool(AccessibilitySettings.Key.ReduceMotion) || !RequestFlash();
                hitFrame.canvasRenderer.SetAlpha(1f);
                hitFrame.CrossFadeAlpha(0f, still ? 0f : 0.12f, true);
                if (still) StartCoroutine(HideFrameLater(0.3f));   // 깜빡이지 않고 잠깐 정지 강조
                return;
            }
            if (shakeRoutine != null) StopCoroutine(shakeRoutine);
            shakeRoutine = StartCoroutine(Shake(amount * 0.02f));     // 미리보기 월드 단위 진폭
        }

        readonly System.Collections.Generic.Queue<float> flashStamps = new();

        /// <summary>번쩍임 제한기: 최근 1초 안에 3번 이상이면 false</summary>
        bool RequestFlash()
        {
            float now = Time.unscaledTime;
            while (flashStamps.Count > 0 && now - flashStamps.Peek() > 1f) flashStamps.Dequeue();
            if (flashStamps.Count >= 3) return false;
            flashStamps.Enqueue(now);
            return true;
        }

        IEnumerator HideFrameLater(float seconds)
        {
            hitFrame.canvasRenderer.SetAlpha(1f);
            yield return new WaitForSecondsRealtime(seconds);
            hitFrame.canvasRenderer.SetAlpha(0f);
        }

        IEnumerator Shake(float amplitude)
        {
            const float duration = 0.3f;
            for (float t = 0f; t < duration; t += Time.unscaledDeltaTime)
            {
                float decay = 1f - t / duration;                       // 감쇠 진동
                previewCamera.localPosition = cameraHome + new Vector3(Mathf.Sin(t * 70f), Mathf.Cos(t * 53f) * 0.6f, 0f) * amplitude * decay;
                yield return null;
            }
            previewCamera.localPosition = cameraHome;
        }
    }
}
