using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 테스트용 입력 (UI Toolkit 버전) — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 피격(-15)  2: 강한 피격(-40)  3: 회복(+30)  4: 능력 사용  5: 진공 진입 · 복귀  6: 카메라 한 바퀴
    /// </summary>
    public class DiegeticVitalsUITKDemo : MonoBehaviour
    {
        [SerializeField] DiegeticVitalsUITK vitals;
        [SerializeField] Transform cameraPivot;

        float orbitT = -1f;
        Quaternion orbitStart;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.digit1Key.wasPressedThisFrame) vitals.TakeDamage(15f);
                if (keyboard.digit2Key.wasPressedThisFrame) vitals.TakeDamage(40f);
                if (keyboard.digit3Key.wasPressedThisFrame) vitals.Heal(30f);
                if (keyboard.digit4Key.wasPressedThisFrame) vitals.UseAbility();
                if (keyboard.digit5Key.wasPressedThisFrame) vitals.SetVacuum(!vitals.InVacuum);
                if (keyboard.digit6Key.wasPressedThisFrame && orbitT < 0f && cameraPivot != null)
                {
                    orbitT = 0f;
                    orbitStart = cameraPivot.rotation;
                }
            }

            // 카메라 한 바퀴: 5초, ease-in-out
            if (orbitT >= 0f)
            {
                orbitT += Time.deltaTime / 5f;
                float u = Mathf.Min(orbitT, 1f);
                float eased = u < 0.5f ? 2f * u * u : 1f - Mathf.Pow(-2f * u + 2f, 2f) / 2f;
                cameraPivot.rotation = orbitStart * Quaternion.Euler(0f, 360f * eased, 0f);
                if (orbitT >= 1f) { cameraPivot.rotation = orbitStart; orbitT = -1f; }
            }
        }
    }
}
