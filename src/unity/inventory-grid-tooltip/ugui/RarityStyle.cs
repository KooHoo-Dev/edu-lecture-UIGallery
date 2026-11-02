using UnityEngine;

namespace UIGallery.InventoryGridTooltip
{
    // 희귀도 표시 에셋 — 단계마다 '색 + 테두리 모양 + 모서리 표식 + 이름'을 한곳에 묶는다.
    // 색만 바꾸고 모양을 빠뜨리는 실수를 막기 위해 둘을 같은 배열 인덱스로 관리한다.
    [CreateAssetMenu(menuName = "Inventory/Rarity Style")]
    public class RarityStyle : ScriptableObject
    {
        [System.Serializable]
        public struct Tier
        {
            public string name;          // 기본 · 개량 · 정예 · 명품 · 유일
            public Color color;
            public Sprite frame;         // 9-슬라이스 테두리: 얇은 선 · 굵은 선 · 모서리 꺾쇠 · 이중선 · 잘린 모서리
            public Sprite cornerMark;    // 빈 네모 · 원 · 삼각 · 마름모 · 별 (기본 단계도 비우지 않는다)
        }

        public Tier[] tiers = new Tier[5];

        public Tier Get(Rarity r) => tiers[(int)r];

        [Header("비교 색 (기호 ▲▼ 와 함께 쓴다)")]
        public Color better = new(0.37f, 0.89f, 0.6f);
        public Color worse = new(1f, 0.48f, 0.48f);
        public Color same = new(0.65f, 0.69f, 0.75f);

        public Color VerdictColor(int verdict) => verdict > 0 ? better : verdict < 0 ? worse : same;
    }
}
