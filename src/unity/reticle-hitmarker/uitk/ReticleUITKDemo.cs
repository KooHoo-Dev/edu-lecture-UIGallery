using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.ReticleHitmarker
{
    /// <summary>
    /// 테스트용 입력 (UI Toolkit 버전) — 갤러리와 같은 단축키. 새 Input System 사용.
    /// 1: 이동 시작/정지  2: 적 조준 켜기/끄기  3: 연사 6발  4: 일반 적중  5: 약점 적중  6: 처치
    /// 마우스 왼쪽 버튼: 사격만 (퍼짐이 벌어지는 것을 확인)
    /// </summary>
    public class ReticleUITKDemo : MonoBehaviour
    {
        [SerializeField] ReticleUITK reticle;
        [SerializeField] float fireInterval = 0.11f;
        [SerializeField] float burstInterval = 0.09f;

        bool hostile;
        float fireCooldown;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.digit1Key.wasPressedThisFrame) reticle.IsMoving = !reticle.IsMoving;
                if (keyboard.digit2Key.wasPressedThisFrame) { hostile = !hostile; reticle.SetHostile(hostile); }
                if (keyboard.digit3Key.wasPressedThisFrame) StartCoroutine(Burst(6));
                if (keyboard.digit4Key.wasPressedThisFrame) { reticle.Fire(); reticle.PlayHit(false, false); }
                if (keyboard.digit5Key.wasPressedThisFrame) { reticle.Fire(); reticle.PlayHit(true, false); }
                if (keyboard.digit6Key.wasPressedThisFrame) { reticle.Fire(); reticle.PlayHit(false, true); }
            }

            fireCooldown -= Time.deltaTime;
            var mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.isPressed && fireCooldown <= 0f)
            {
                reticle.Fire();
                fireCooldown = fireInterval;
            }
        }

        IEnumerator Burst(int count)
        {
            var wait = new WaitForSeconds(burstInterval);
            for (int i = 0; i < count; i++)
            {
                reticle.Fire();
                if (hostile) reticle.PlayHit(false, false);
                yield return wait;
            }
        }
    }
}
