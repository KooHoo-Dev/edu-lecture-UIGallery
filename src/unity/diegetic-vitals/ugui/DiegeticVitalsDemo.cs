using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 피격(-15)  2: 강한 피격(-40)  3: 회복(+30)  4: 능력 사용(동력 -25)
    /// 5: 진공 구역 진입 · 복귀 (트리거 없이 바로 전환)  6: 카메라 한 바퀴 (CameraPivot 을 5초 동안 360° 회전)
    /// </summary>
    public class DiegeticVitalsDemo : MonoBehaviour
    {
        [SerializeField] DiegeticVitals vitals;
        [SerializeField, Tooltip("캐릭터 위치에 둔 빈 오브젝트. Main Camera 가 자식")] Transform cameraPivot;

        bool orbiting;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.digit1Key.wasPressedThisFrame) vitals.TakeDamage(15f);
            if (keyboard.digit2Key.wasPressedThisFrame) vitals.TakeDamage(40f);
            if (keyboard.digit3Key.wasPressedThisFrame) vitals.Heal(30f);
            if (keyboard.digit4Key.wasPressedThisFrame) vitals.UseAbility();
            if (keyboard.digit5Key.wasPressedThisFrame) vitals.SetVacuum(!vitals.InVacuum);
            if (keyboard.digit6Key.wasPressedThisFrame && !orbiting && cameraPivot != null) StartCoroutine(Orbit(5f));
        }

        IEnumerator Orbit(float duration)
        {
            orbiting = true;
            Quaternion start = cameraPivot.rotation;
            for (float t = 0f; t < duration; t += Time.deltaTime)
            {
                float u = t / duration;
                float eased = u < 0.5f ? 2f * u * u : 1f - Mathf.Pow(-2f * u + 2f, 2f) / 2f;   // ease-in-out
                cameraPivot.rotation = start * Quaternion.Euler(0f, 360f * eased, 0f);
                yield return null;
            }
            cameraPivot.rotation = start;
            orbiting = false;
        }
    }
}
