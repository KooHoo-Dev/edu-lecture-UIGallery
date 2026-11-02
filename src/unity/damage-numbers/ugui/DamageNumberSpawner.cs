using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool;

namespace UIGallery.DamageNumbers
{
    /// <summary>숫자 공통 설정 — 갤러리의 조절 값과 같은 이름</summary>
    [Serializable]
    public class DamageNumberSettings
    {
        [Tooltip("기본 글자 크기 (1920×1080 기준)")] public float baseFontSize = 50f;
        [Range(1f, 2f)] public float critScale = 1.5f;
        public DamageStackMode stackMode = DamageStackMode.Lane;
        [Tooltip("다단 히트 간격 (초) — 병합 판정 창도 이 값을 따른다")] public float hitInterval = 0.12f;
        [Tooltip("상승 거리 (px)")] public float floatDistance = 50f;
        [Tooltip("표시 시간 (초)")] public float lifetime = 0.9f;
        [Tooltip("배지 · '+' · 기울기")] public bool shapeCue = true;
        public DamageNumberFormat format = DamageNumberFormat.Grouped;
        public bool useUnscaledTime;

        public float Now => useUnscaledTime ? Time.unscaledTime : Time.time;
    }

    /// <summary>
    /// 데미지 숫자 생성기 — 월드 앵커 → 화면 좌표 변환, 오브젝트 풀, 겹침 방지(밀어 올림 · 흩뿌리기 · 병합), 합계 연결.
    /// Canvas_Numbers 는 Screen Space - Overlay 이고 HUD 와 다른 Canvas 다 (숫자가 움직여도 HUD 를 다시 배칭하지 않게).
    /// </summary>
    public class DamageNumberSpawner : MonoBehaviour, IDamageNumberSink
    {
        // 흩뿌리기 방향 순서 (도, 90 = 바로 위). 완전 무작위면 연속 두 개가 같은 곳에 겹치기 쉬워 번갈아 쓴다
        static readonly float[] ScatterDeg = { 90f, 150f, 30f, 120f, 60f, 165f, 15f };

        [Header("참조")]
        [SerializeField] Camera cam;
        [SerializeField] RectTransform numberLayer;
        [SerializeField] DamageNumberView prefab;
        [SerializeField] TotalCounterView totalCounter;
        [SerializeField, Tooltip("Normal · Crit · Break · Heal · Block 다섯 개")] DamageCategoryStyle[] styles;

        [Header("설정")]
        [SerializeField] DamageNumberSettings settings = new();
        [SerializeField] int poolDefault = 32;
        [SerializeField] int poolMax = 128;

        ObjectPool<DamageNumberView> pool;
        readonly List<DamageNumberView> active = new(64);
        readonly Dictionary<Transform, int> scatterIndex = new();

        public DamageNumberSettings Settings => settings;
        public int ActiveCount => active.Count;

        void Awake()
        {
            pool = new ObjectPool<DamageNumberView>(
                createFunc: () => Instantiate(prefab, numberLayer),
                actionOnGet: v => v.gameObject.SetActive(true),
                actionOnRelease: v => v.gameObject.SetActive(false),
                actionOnDestroy: v => Destroy(v.gameObject),
                collectionCheck: true,   // 같은 객체를 두 번 반환하면 오류로 알려 준다
                defaultCapacity: poolDefault,
                maxSize: poolMax);

            // 미리 데워 두기: 첫 전투에서 한꺼번에 Instantiate 하지 않게
            var warm = new List<DamageNumberView>(poolDefault);
            for (int i = 0; i < poolDefault; i++) warm.Add(pool.Get());
            foreach (var v in warm) pool.Release(v);
        }

        public void Spawn(Transform anchor, int value, DamageCategory category)
        {
            // 1) 월드 → 화면. z <= 0 이면 카메라 뒤 → 좌표가 뒤집히므로 띄우지 않는다
            Vector3 sp = cam.WorldToScreenPoint(anchor.position);
            if (sp.z <= 0f) return;

            // 2) 화면 → NumberLayer 로컬 좌표 (Overlay 이므로 카메라 인자는 null)
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(numberLayer, sp, null, out Vector2 local)) return;

            DamageCategoryStyle style = StyleOf(category);
            if (category != DamageCategory.Heal && totalCounter != null) totalCounter.AddHit(anchor, value);

            // 3) 병합: 같은 앵커 · 같은 범주가 판정 창 안에 있으면 그 숫자에 더한다
            if (settings.stackMode == DamageStackMode.Merge)
            {
                float window = settings.hitInterval * 1.6f + 0.12f;
                for (int i = active.Count - 1; i >= 0; i--)
                {
                    var a = active[i];
                    if (a.Anchor == anchor && a.Category == category && !a.Fading && settings.Now - a.LastUpdate <= window)
                    {
                        a.AddValue(value);
                        return;
                    }
                }
            }

            // 4) 풀에서 꺼내고 겹침 방지 배치
            Vector2 offset = Vector2.zero;
            Vector2 dir = Vector2.up;
            if (settings.stackMode == DamageStackMode.Lane || settings.stackMode == DamageStackMode.Merge)
            {
                float h = DamageNumberView.HeightOf(style, settings, prefab.BadgeHeight);
                foreach (var a in active)
                    if (a.Anchor == anchor) a.PushUp(h); // 살아 있는 이전 숫자를 새 숫자 높이만큼 위로
            }
            else if (settings.stackMode == DamageStackMode.Scatter)
            {
                scatterIndex.TryGetValue(anchor, out int k);
                scatterIndex[anchor] = k + 1;
                float deg = ScatterDeg[k % ScatterDeg.Length] + UnityEngine.Random.Range(-8f, 8f);
                dir = new Vector2(Mathf.Cos(deg * Mathf.Deg2Rad), Mathf.Sin(deg * Mathf.Deg2Rad));
                offset = new Vector2(dir.x * 90f, dir.y * 46f);
            }

            DamageNumberView view = pool.Get();
            view.transform.SetAsLastSibling(); // 최근 숫자가 위에 그려지게
            view.Play(anchor, local, offset, dir, value, style, settings, Release);
            active.Add(view);
        }

        void Release(DamageNumberView v)
        {
            active.Remove(v);
            pool.Release(v);
        }

        DamageCategoryStyle StyleOf(DamageCategory c)
        {
            foreach (var s in styles)
                if (s != null && s.category == c) return s;
            return styles[0];
        }
    }
}
