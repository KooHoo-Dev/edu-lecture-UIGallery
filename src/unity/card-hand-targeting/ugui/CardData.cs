using UnityEngine;

namespace UIGallery.CardHandTargeting
{
    public enum CardKind { Attack, Skill }
    public enum CardTarget { Enemy, Self, AllEnemies }

    /// <summary>
    /// 카드 한 장의 데이터 (에셋). Project 창 → Create → UI Gallery → Card.
    /// ScriptableObject 는 클래스 이름과 파일 이름이 같아야 에셋이 스크립트를 찾는다 — 그래서 이 파일은 따로 둔다.
    /// </summary>
    [CreateAssetMenu(menuName = "UI Gallery/Card")]
    public class CardData : ScriptableObject
    {
        public string displayName;
        public int cost = 1;
        public CardKind kind;
        [Tooltip("Enemy = 화살표로 적 하나 · Self = 사용선 위로 끌기 · AllEnemies = 모든 적 (끌기)")]
        public CardTarget target;
        public int damage;
        public int hits = 1;
        public int block;
        public int heal;
        public int energy;
        [Tooltip("약화 턴 수 — 적의 공격이 25% 줄어든다")]
        public int weak;
        [TextArea] public string description;
        public Sprite art;
    }
}
