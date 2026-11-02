using System.Collections;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.InputSystem;

namespace UIGallery.DamageNumbers
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 일반 타격  2: 치명타  3: 가드 파괴  4: 5연타  5: 아군 회복  6: 방어막에 막힘
    /// target 에는 DamageNumberSpawner(UGUI) 또는 DamageNumbersUITK 를 넣는다 (둘 다 IDamageNumberSink).
    /// </summary>
    public class DamageNumbersDemo : MonoBehaviour
    {
        [SerializeField, Tooltip("IDamageNumberSink 를 구현한 컴포넌트")] MonoBehaviour target;
        [SerializeField] Transform bossAnchor;
        [SerializeField] Transform shieldDroneAnchor;
        [SerializeField] Transform allyAnchor;
        [SerializeField, Tooltip("다단 히트 간격 (초)")] float hitInterval = 0.12f;
        [SerializeField, Tooltip("가드 바 깨짐 연출을 재생할 곳 (Animator.SetTrigger 등)")] UnityEvent onGuardBreak;

        IDamageNumberSink sink;

        void Awake()
        {
            sink = target as IDamageNumberSink;
            if (sink == null) Debug.LogWarning("target 에 IDamageNumberSink 를 구현한 컴포넌트를 넣으세요.", this);
        }

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null || sink == null) return;

            if (kb.digit1Key.wasPressedThisFrame) sink.Spawn(bossAnchor, Random.Range(1180, 1420), DamageCategory.Normal);
            if (kb.digit2Key.wasPressedThisFrame) sink.Spawn(bossAnchor, Random.Range(3300, 3820), DamageCategory.Crit);
            if (kb.digit3Key.wasPressedThisFrame) StartCoroutine(GuardBreak());
            if (kb.digit4Key.wasPressedThisFrame) StartCoroutine(MultiHit());
            if (kb.digit5Key.wasPressedThisFrame) sink.Spawn(allyAnchor, Random.Range(1480, 1620), DamageCategory.Heal);
            if (kb.digit6Key.wasPressedThisFrame) sink.Spawn(shieldDroneAnchor, Random.Range(60, 120), DamageCategory.Block);
        }

        // 원인 → 결과: 가드 바가 먼저 깨지고(약 0.22초) 0.08초 뒤 숫자
        IEnumerator GuardBreak()
        {
            onGuardBreak?.Invoke();
            yield return new WaitForSeconds(0.3f);
            sink.Spawn(bossAnchor, Random.Range(5240, 5600), DamageCategory.Break);
        }

        IEnumerator MultiHit()
        {
            var wait = new WaitForSeconds(hitInterval);
            for (int i = 0; i < 5; i++)
            {
                bool crit = i == 3; // 연타 안에서도 위계가 보이게 네 번째는 치명
                sink.Spawn(bossAnchor, crit ? Random.Range(2050, 2270) : Random.Range(780, 940), crit ? DamageCategory.Crit : DamageCategory.Normal);
                yield return wait;
            }
        }
    }
}
