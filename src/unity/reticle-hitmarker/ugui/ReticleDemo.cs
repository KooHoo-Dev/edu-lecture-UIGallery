using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 단축키. 새 Input System 사용.
    /// 1: 이동 시작/정지  2: 적 조준 켜기/끄기  3: 연사 6발  4: 일반 적중  5: 약점 적중  6: 처치
    /// 마우스 왼쪽 버튼: 실제 사격 (누르고 있으면 연사). 약점 콜라이더에는 "WeakPoint" 태그를 붙인다.
    /// 적 루트에 DroneHealth 를 붙이면 마우스 사격도 처치(kill)까지 판정한다.
    /// </summary>
    public class ReticleDemo : MonoBehaviour
    {
        [SerializeField] Camera cam;
        [SerializeField] WeaponSpread weapon;
        [SerializeField] ReticleView reticle;
        [SerializeField] HitmarkerView hitmarker;
        [SerializeField] LayerMask hitMask = ~0;
        [SerializeField] LayerMask enemyMask;
        [SerializeField] float fireInterval = 0.11f;
        [SerializeField] float burstInterval = 0.09f;

        float fireCooldown;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.digit1Key.wasPressedThisFrame) weapon.IsMoving = !weapon.IsMoving;
                if (keyboard.digit2Key.wasPressedThisFrame) reticle.ForceHostile = !reticle.ForceHostile;
                if (keyboard.digit3Key.wasPressedThisFrame) StartCoroutine(Burst(6));
                if (keyboard.digit4Key.wasPressedThisFrame) { weapon.Fire(); hitmarker.Play(HitKind.Hit, false); }
                if (keyboard.digit5Key.wasPressedThisFrame) { weapon.Fire(); hitmarker.Play(HitKind.Crit, false); }
                if (keyboard.digit6Key.wasPressedThisFrame) { weapon.Fire(); hitmarker.Play(HitKind.Hit, true); }
            }

            fireCooldown -= Time.deltaTime;
            var mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.isPressed && fireCooldown <= 0f)
            {
                FireOnce();
                fireCooldown = fireInterval;
            }
        }

        IEnumerator Burst(int count)
        {
            var wait = new WaitForSeconds(burstInterval);
            for (int i = 0; i < count; i++)
            {
                FireOnce();
                yield return wait;
            }
        }

        /// <summary>퍼짐 원 안에서 탄 방향을 뽑아 실제로 쏜다 — 조준점과 같은 값</summary>
        void FireOnce()
        {
            Vector2 offset = weapon.Fire();
            Ray ray = weapon.ShotRay(cam, offset);
            if (!Physics.Raycast(ray, out RaycastHit hit, 200f, hitMask, QueryTriggerInteraction.Collide)) return;
            if ((enemyMask.value & (1 << hit.collider.gameObject.layer)) == 0) return;

            // 처치 판정은 적의 체력 스크립트(DroneHealth)가 맡는다 — 약점 2, 몸통 1 데미지
            bool crit = hit.collider.CompareTag("WeakPoint");
            var health = hit.collider.GetComponentInParent<DroneHealth>();
            bool kill = health != null && health.Apply(crit);
            hitmarker.Play(crit ? HitKind.Crit : HitKind.Hit, kill);
        }
    }
}
