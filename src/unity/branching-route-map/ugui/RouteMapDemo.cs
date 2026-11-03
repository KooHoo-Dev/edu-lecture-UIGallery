// 시험용 입력 (새 Input System) — 키로 지도를 바꿔 보고, 자동 데모로 한 칸씩 올라간다.
// A: 자동 선택 이동   N: 새 지도(시드 + 1)   R: 같은 시드로 처음부터   H: 범례 강조 순환
// S: 저장(PlayerPrefs)   L: 불러오기   P: 자동 데모 켜기/끄기
// 노드 고르기는 EventSystem(InputSystemUIInputModule)의 Navigate · Submit 이 맡는다 — 이 스크립트는 건드리지 않는다.
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.BranchingRouteMap
{
    public class RouteMapDemo : MonoBehaviour
    {
        [SerializeField] RouteMapView view;
        [SerializeField] bool autoplay = true;
        [SerializeField] float interval = 1.25f;

        float timer;
        int goalWait;

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.aKey.wasPressedThisFrame) view.StepAuto();
                if (kb.nKey.wasPressedThisFrame) view.NewMap();
                if (kb.rKey.wasPressedThisFrame) view.Restart();
                if (kb.hKey.wasPressedThisFrame) view.CycleLegend();
                if (kb.sKey.wasPressedThisFrame) Debug.Log($"저장: {view.Save()}");
                if (kb.lKey.wasPressedThisFrame) Debug.Log(view.Load() ? $"불러옴 — 지문 {view.Map.print}, 길 {view.Path.Count}칸" : "불러오기 실패 (저장 없음 또는 길이 지도와 맞지 않음)");
                if (kb.pKey.wasPressedThisFrame) autoplay = !autoplay;
                if (kb.anyKey.wasPressedThisFrame) timer = -4f;   // 사람이 만지면 자동 데모를 잠시 쉰다
            }
            if (!autoplay || view.Map == null) return;
            timer += Time.unscaledDeltaTime;
            if (timer < interval) return;
            timer = 0f;
            // 목표에 닿으면 두 박자 쉬고 새 지도
            bool atGoal = view.Path.Count > 0 && view.Map.Get(view.Path[view.Path.Count - 1]).kind == NodeKind.Goal;
            if (!atGoal)
            {
                goalWait = 0;
                view.StepAuto();
            }
            else if (++goalWait >= 2) view.NewMap();
        }
    }
}
