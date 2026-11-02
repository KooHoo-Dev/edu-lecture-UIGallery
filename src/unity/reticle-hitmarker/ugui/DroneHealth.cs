using UnityEngine;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 잔해 드론의 간단한 체력 — 일반 적중 1, 약점 적중 2 데미지. 0 이 되면 처치.
    /// ReticleDemo 가 Apply() 의 반환값(처치 여부)을 HitmarkerView.Play(kind, kill) 의 kill 로 넘긴다.
    /// 이미 쓰러진 드론은 더 맞지 않는다 (처치 표시가 두 번 뜨지 않게).
    /// </summary>
    public class DroneHealth : MonoBehaviour
    {
        [SerializeField] int maxHp = 4;
        [SerializeField] int weakPointDamage = 2;

        public int Hp { get; private set; }
        public bool IsDead => Hp <= 0;

        void OnEnable() => Hp = maxHp;

        /// <summary>데미지를 주고, 이번 적중으로 쓰러졌으면 true</summary>
        public bool Apply(bool weakPoint)
        {
            if (IsDead) return false;
            Hp = Mathf.Max(0, Hp - (weakPoint ? weakPointDamage : 1));
            if (!IsDead) return false;

            // 쓰러짐 연출 · 재등장은 게임 쪽 코드가 맡는다. 여기서는 간단히 끈다
            gameObject.SetActive(false);
            return true;
        }
    }
}
