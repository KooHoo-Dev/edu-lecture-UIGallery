using UnityEngine;

namespace UIGallery.DamageNumbers
{
    // 데미지 숫자의 범주와 범주별 스타일 표 (ScriptableObject).
    // 범주 다섯 개마다 에셋을 하나씩 만들어 DamageNumberSpawner.styles 에 넣는다.
    // 크기·색·배지·기울기·팝·수명을 한 세트로 묶어 "게임 내내 같은 규칙"을 데이터로 강제한다.

    public enum DamageCategory { Normal, Crit, Break, Heal, Block }

    public enum DamageStackMode { Lane, Scatter, Merge, Overlap }

    public enum DamageNumberFormat { Full, Grouped, Short }

    /// <summary>DamageNumberSpawner 와 UITK 버전이 함께 쓰는 생성 API</summary>
    public interface IDamageNumberSink
    {
        void Spawn(Transform anchor, int value, DamageCategory category);
    }

    [CreateAssetMenu(menuName = "UI Gallery/Damage Category Style", fileName = "DamageStyle_Normal")]
    public class DamageCategoryStyle : ScriptableObject
    {
        public DamageCategory category;

        [Header("크기 · 색")]
        [Tooltip("기본 글자 크기에 곱하는 배율 (치명 1.5, 파괴 1.22, 막힘 0.68 …)")]
        public float fontScale = 1f;
        public Color color = new(0.93f, 0.95f, 0.96f);
        [Tooltip("범주별 외곽선 두께를 담은 TMP Material Preset (치명·파괴는 두껍게)")]
        public Material outlineMaterial;

        [Header("형태 단서")]
        [Tooltip("비워 두면 배지를 숨긴다. 가드 파괴(Break)에는 '치명'을 넣지 않는다")]
        public string badgeText = "";
        [Tooltip("회복 숫자 앞의 '+' 기호")]
        public bool plusPrefix;
        [Tooltip("숫자 기울기 (Z 회전, 도). 치명 -6")]
        public float tiltDeg;

        [Header("움직임")]
        [Tooltip("0~1 구간의 팝 크기 곡선. 예: 0 → 0.6, 0.5 → 1.15, 1 → 1.0")]
        public AnimationCurve pop = new(new Keyframe(0f, 0.6f), new Keyframe(0.5f, 1.15f), new Keyframe(1f, 1f));
        public float popDuration = 0.14f;
        [Tooltip("표시 시간 배율 (회복 1.25 — 느리고 부드럽게)")]
        public float lifeScale = 1f;
        [Tooltip("회복처럼 부드럽게 오를 때 true (easeOutSine), 아니면 easeOutCubic")]
        public bool softRise;
    }
}
