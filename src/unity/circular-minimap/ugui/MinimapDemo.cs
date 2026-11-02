using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.CircularMinimapSample
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 단축키. 새 Input System 사용.
    /// 1: 카메라 오른쪽 90°  2: 먼 목표 지정  3: 축척 단계(0.7→1.2→2.5)  4: 잔해 드론 감지  5: 목표 도착
    /// Q/E: 왼쪽·오른쪽 90°   ↑/↓ 또는 마우스 휠: 축척   M: 회전형 ↔ 북쪽 고정
    /// </summary>
    public class MinimapDemo : MonoBehaviour
    {
        [SerializeField] CircularMinimap minimap;
        [SerializeField] Transform player;
        [SerializeField] Transform cameraRig;
        [Tooltip("돌아가며 주요 목표가 될 지점들 (0 번이 처음 목표)")]
        [SerializeField] Transform[] objectives;
        [SerializeField] Transform drone;
        [SerializeField] float droneDistance = 52f;

        int active;

        void Start()
        {
            if (objectives.Length > 0) minimap.SetPrimaryTarget(objectives[0]);
        }

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.digit1Key.wasPressedThisFrame || kb.eKey.wasPressedThisFrame) Turn(90f);
            if (kb.qKey.wasPressedThisFrame) Turn(-90f);
            if (kb.digit2Key.wasPressedThisFrame) FarObjective();
            if (kb.digit3Key.wasPressedThisFrame) minimap.StepZoom();
            if (kb.digit4Key.wasPressedThisFrame) PingDrone();
            if (kb.digit5Key.wasPressedThisFrame) Arrive();
            if (kb.upArrowKey.wasPressedThisFrame) minimap.AddZoom(0.3f);
            if (kb.downArrowKey.wasPressedThisFrame) minimap.AddZoom(-0.3f);
            if (kb.mKey.wasPressedThisFrame) minimap.ToggleOrientation();

            var mouse = Mouse.current;
            if (mouse != null)
            {
                float wheel = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(wheel) > 0.01f) minimap.AddZoom(wheel > 0f ? 0.2f : -0.2f);
            }
        }

        // 카메라 리그를 돌린다 — 미니맵은 스스로 스무딩해 따라간다
        void Turn(float deg) => cameraRig.Rotate(0f, deg, 0f, Space.World);

        void FarObjective()
        {
            int best = active;
            float bestD = -1f;
            for (int i = 0; i < objectives.Length; i++)
            {
                float d = Vector3.Distance(player.position, objectives[i].position);
                if (i != active && d > bestD) { best = i; bestD = d; }
            }
            SetActive(best);
        }

        void PingDrone()
        {
            // 카메라 기준 오른쪽 뒤 — 화면에는 안 보이고 미니맵에만 잡히는 자리
            Vector3 dir = Quaternion.Euler(0f, cameraRig.eulerAngles.y + 128f, 0f) * Vector3.forward;
            drone.position = player.position + dir * droneDistance;
            minimap.Ping(drone);
        }

        void Arrive()
        {
            if (objectives.Length == 0) return;
            Vector3 goal = objectives[active].position;
            player.position = new Vector3(goal.x, player.position.y, goal.z);
            SetActive((active + 1) % objectives.Length);
        }

        void SetActive(int i)
        {
            active = i;
            minimap.SetPrimaryTarget(objectives[i]);
        }
    }
}
