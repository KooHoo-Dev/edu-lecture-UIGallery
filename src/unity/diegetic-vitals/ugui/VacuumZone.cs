using UnityEngine;
using UnityEngine.Events;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 진공 구역 트리거. 플레이어가 들어오고 나갈 때 onVacuumChanged(bool) 을 보낸다.
    /// 인스펙터에서 DiegeticVitals.SetVacuum (또는 UITK 버전의 SetVacuum) 에 연결한다.
    /// 트리거가 호출되려면 Player 쪽에 Rigidbody 또는 CharacterController 가 있어야 한다.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class VacuumZone : MonoBehaviour
    {
        [SerializeField] string playerTag = "Player";
        public UnityEvent<bool> onVacuumChanged = new();

        void Reset() => GetComponent<Collider>().isTrigger = true;

        void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag(playerTag)) onVacuumChanged.Invoke(true);
        }

        void OnTriggerExit(Collider other)
        {
            if (other.CompareTag(playerTag)) onVacuumChanged.Invoke(false);
        }
    }
}
