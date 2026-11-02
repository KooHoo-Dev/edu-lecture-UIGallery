using System.Collections;
using UnityEngine;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 회전 엠블럼 — 메뉴가 열릴 때 짧게 돌다 멈추는 장식 (Image 의 Raycast Target 은 끈다).
    /// 입력과 상관없는 별도 레이어라 연출이 길어도 메뉴 조작을 막지 않는다. unscaled 시간으로 돈다.
    /// </summary>
    public class EmblemSpin : MonoBehaviour
    {
        [SerializeField] float seconds = 0.36f;
        [SerializeField] float startAngle = -260f;

        Coroutine routine;

        public void Play()
        {
            if (routine != null) StopCoroutine(routine);
            routine = StartCoroutine(Spin());
        }

        IEnumerator Spin()
        {
            for (float t = 0f; t < seconds; t += Time.unscaledDeltaTime)
            {
                float k = EaseOutBack(t / seconds);
                transform.localRotation = Quaternion.Euler(0f, 0f, Mathf.LerpUnclamped(startAngle, 0f, k));
                transform.localScale = Vector3.one * Mathf.LerpUnclamped(0.5f, 1f, k);
                yield return null;
            }
            transform.localRotation = Quaternion.identity;
            transform.localScale = Vector3.one;
            routine = null;
        }

        static float EaseOutBack(float x)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(x - 1f, 3f) + c1 * Mathf.Pow(x - 1f, 2f);
        }
    }
}
