using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.HealthBarTrailSample
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 단축키. 새 Input System 사용.
    /// 1: 피격  2: 강한 피격  3: 연속 타격(5 × 4, 0.12초 간격)  4: 회복
    /// </summary>
    public class HealthBarDemo : MonoBehaviour
    {
        [SerializeField] HealthBarTrail bar;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.digit1Key.wasPressedThisFrame) bar.TakeDamage(9f);
            if (keyboard.digit2Key.wasPressedThisFrame) bar.TakeDamage(28f);
            if (keyboard.digit3Key.wasPressedThisFrame) StartCoroutine(Combo());
            if (keyboard.digit4Key.wasPressedThisFrame) bar.Heal(30f);
        }

        IEnumerator Combo()
        {
            var wait = new WaitForSeconds(0.12f);
            for (int i = 0; i < 4; i++)
            {
                bar.TakeDamage(5f);
                yield return wait;
            }
        }
    }
}
