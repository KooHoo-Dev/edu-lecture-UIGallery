using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace UIGallery.SubtitlesSoundCues
{
    /// <summary>
    /// 소리 방향 링 + 효과음 캡션 — 효과음을 재생하는 곳에서 Show(음원 위치, 이름, 위험한가)를 함께 부른다.
    /// - 방향: 듣는 쪽(카메라)의 수평 정면과 음원 방향의 SignedAngle (오른쪽 +). 높이 차이는 버린다
    /// - 링: Filled Radial 360 Image 를 arcDegrees 만큼 채워 그 방향으로 돌린다. 가까울수록 진하게, lifetime 동안 사라진다
    /// - 캡션: [이름] + 8방향 화살표, 최대 maxCaptions 개 (넘치면 오래된 것부터)
    /// 화살표 글자(↑ → …)가 글꼴에 없으면 캡션 프리팹에 회전시킨 화살표 Image 를 쓴다.
    /// </summary>
    public class SoundCueRing : MonoBehaviour
    {
        [Tooltip("보통 메인 카메라")]
        [SerializeField] Transform listener;
        [SerializeField] RectTransform ringRoot;
        [Tooltip("Image · Type Filled · Radial 360 · Fill Origin Top · Clockwise · 고리 모양 스프라이트")]
        [SerializeField] Image cuePrefab;
        [SerializeField] float arcDegrees = 34f;
        [SerializeField] float lifetime = 2.4f;
        [Tooltip("이 거리에서 가장 옅다 (m)")]
        [SerializeField] float maxDistance = 30f;
        [SerializeField] Color dangerColor = new(1f, 0.42f, 0.37f);
        [SerializeField] Color infoColor = new(0.92f, 0.95f, 0.98f);

        [Header("캡션")]
        [SerializeField] RectTransform captionRoot;
        [SerializeField] TextMeshProUGUI captionPrefab;
        [SerializeField] int maxCaptions = 3;
        [SerializeField] float captionSeconds = 2.6f;

        readonly List<TextMeshProUGUI> captions = new();
        readonly List<Image> arcs = new();
        static readonly string[] Arrows = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };

        public void Show(Vector3 worldPos, string label, bool danger)
        {
            Vector3 forward = listener.forward;
            Vector3 to = worldPos - listener.position;
            forward.y = 0f;
            to.y = 0f;
            float deg = Vector3.SignedAngle(forward, to, Vector3.up);   // 앞 = 0°, 오른쪽 +
            float near = 1f - Mathf.Clamp01(to.magnitude / maxDistance);

            StartCoroutine(Arc(deg, near, danger ? dangerColor : infoColor));
            AddCaption(label, deg);
        }

        IEnumerator Arc(float deg, float near, Color color)
        {
            Image img = Instantiate(cuePrefab, ringRoot);
            arcs.Add(img);
            img.fillAmount = arcDegrees / 360f;
            // 위에서 시계 방향으로 arcDegrees 만큼 채운다 → 호의 가운데가 deg 에 오도록 시작점을 돌린다
            img.rectTransform.localEulerAngles = new Vector3(0f, 0f, -(deg - arcDegrees / 2f));
            float startAlpha = Mathf.Lerp(0.45f, 1f, near);
            for (float t = 0f; t < lifetime; t += Time.unscaledDeltaTime)
            {
                float k = t / lifetime;
                color.a = k < 0.55f ? startAlpha : Mathf.Lerp(startAlpha, 0f, (k - 0.55f) / 0.45f);   // 뒤쪽 45% 동안 사라진다
                img.color = color;
                yield return null;
            }
            arcs.Remove(img);
            Destroy(img.gameObject);
        }

        void OnDisable()
        {
            // 꺼지면 코루틴이 멈춰 호와 캡션이 그 자리에 남는다 → 함께 치운다
            StopAllCoroutines();
            foreach (Image a in arcs) if (a != null) Destroy(a.gameObject);
            foreach (TextMeshProUGUI c in captions) if (c != null) Destroy(c.gameObject);
            arcs.Clear();
            captions.Clear();
        }

        void AddCaption(string label, float deg)
        {
            if (captions.Count >= maxCaptions)
            {
                Destroy(captions[0].gameObject);
                captions.RemoveAt(0);
            }
            TextMeshProUGUI c = Instantiate(captionPrefab, captionRoot);
            int i = Mathf.RoundToInt(Mathf.Repeat(deg, 360f) / 45f) % 8;
            c.text = $"{Arrows[i]} [{label}]";
            captions.Add(c);
            StartCoroutine(Expire(c));
        }

        IEnumerator Expire(TextMeshProUGUI c)
        {
            yield return new WaitForSecondsRealtime(captionSeconds);
            if (c == null) yield break;   // 이미 밀려나 지워졌다
            captions.Remove(c);
            Destroy(c.gameObject);
        }
    }
}
