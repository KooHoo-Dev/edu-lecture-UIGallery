using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.CraftingRecipePanel
{
    // 시험용 입력. CraftingStation 오브젝트에 붙인다. G 재료 획득 · U 새 레시피 해금 · R 창 닫았다 열기.
    // 고르기 · 제작은 EventSystem 의 Navigate · Submit, 탭 Q · E 는 창이 처리한다.
    public class CraftingDemo : MonoBehaviour
    {
        [SerializeField] CraftingStation station;
        [SerializeField] GameObject window;   // CraftingPanel 또는 CraftingUITK 가 붙은 창
        [SerializeField] float closedSeconds = 0.5f;
        static readonly (string id, int n)[] Gathers = { ("circuit", 3), ("coolcell", 3), ("oxygen", 2), ("repair", 2) };
        int gatherIndex;

        void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.gKey.wasPressedThisFrame)
            {
                (string id, int n) = Gathers[gatherIndex++ % Gathers.Length];
                station.Gather(id, n);
            }
            if (kb.uKey.wasPressedThisFrame) station.UnlockNext();
            if (kb.rKey.wasPressedThisFrame && window.activeSelf) StartCoroutine(Reopen());
        }

        IEnumerator Reopen()
        {
            window.SetActive(false);   // → OnDisable: 보기 상태 저장
            yield return new WaitForSeconds(closedSeconds);
            window.SetActive(true);    // → OnEnable: 복원
        }
    }
}
