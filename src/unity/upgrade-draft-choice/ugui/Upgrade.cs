using UnityEngine;

namespace UIGallery.UpgradeDraftChoice
{
    public enum UpgradeKind { Weapon, Passive }
    public enum Rarity { Common, Rare, Epic }

    /// <summary>
    /// 업그레이드 하나 (에셋). Project 창 → Create → UI Gallery → Upgrade.
    /// ScriptableObject 는 클래스 이름과 파일 이름이 같아야 에셋이 스크립트를 찾는다 — 그래서 이 파일은 따로 둔다.
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Upgrade")]
    public class Upgrade : ScriptableObject
    {
        public string displayName;
        public UpgradeKind kind;
        [Tooltip("예: 피해 · 범위 · 드론 수")]
        public string statName;
        [Tooltip("예: % · 기 · 회 (개수 단위면 늘 정수로 오른다)")]
        public string unit;
        [Tooltip("레벨당 기본 증가량 (희귀도가 곱해진다)")]
        public float perLevel = 1f;
        public Sprite icon;
        [Tooltip("개수처럼 정수로만 오르는 수치")]
        public bool integerStep;
    }
}
