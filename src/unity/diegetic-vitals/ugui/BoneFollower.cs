using UnityEngine;

namespace UIGallery.DiegeticVitalsSample
{
    /// <summary>
    /// 게이지 앵커가 캐릭터의 본(예: Spine_02)을 따라가게 한다.
    /// 캔버스를 본의 자식으로 바로 넣지 않고, 애니메이션이 적용된 뒤(LateUpdate) 위치를 읽어 떨림을 막는다.
    /// 보이는 면(-forward) 쪽으로 surfaceLift 만큼 띄워 갑옷 메시에 파묻히거나 깜빡이지 않게 한다.
    /// </summary>
    public class BoneFollower : MonoBehaviour
    {
        [SerializeField] Transform bone;
        [SerializeField, Tooltip("본 기준 위치 오프셋 (본 로컬)")] Vector3 localOffset = new(0f, 0f, -0.12f);
        [SerializeField, Tooltip("캔버스 +Z 가 캐릭터 앞쪽을 향하도록 맞추는 회전")] Vector3 rotationOffset = Vector3.zero;
        [SerializeField, Tooltip("표면에서 띄우는 거리 (m)")] float surfaceLift = 0.02f;

        void LateUpdate()
        {
            if (bone == null) return;
            Quaternion rot = bone.rotation * Quaternion.Euler(rotationOffset);
            Vector3 pos = bone.position + bone.TransformDirection(localOffset) + rot * Vector3.back * surfaceLift;
            transform.SetPositionAndRotation(pos, rot);
        }
    }
}
