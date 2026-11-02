using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.InventoryGridTooltip
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 오른쪽 끝 칸 포커스(가장자리 보정)  2: 선택한 아이템 장착  3: 새 아이템 획득  4: 정렬 기준 바꾸기  5: 희귀도 필터
    /// 칸 이동·장착(Submit)은 EventSystem 의 InputSystemUIInputModule 이 방향키·패드로 처리한다.
    /// </summary>
    public class InventoryDemo : MonoBehaviour
    {
        [SerializeField] InventoryScreen screen;
        [SerializeField] InventoryItem[] lootPool;
        int lootIndex;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.digit1Key.wasPressedThisFrame) screen.FocusEdgeSlot();
            if (keyboard.digit2Key.wasPressedThisFrame) screen.EquipFocused();
            if (keyboard.digit3Key.wasPressedThisFrame && lootPool.Length > 0)
                screen.AddLoot(Instantiate(lootPool[lootIndex++ % lootPool.Length]));   // 같은 에셋을 여러 번 넣어도 서로 다른 아이템이 되게 복제
            if (keyboard.digit4Key.wasPressedThisFrame || keyboard.qKey.wasPressedThisFrame) screen.CycleSort();
            if (keyboard.digit5Key.wasPressedThisFrame || keyboard.fKey.wasPressedThisFrame) screen.ToggleRarityFilter();
        }
    }
}
