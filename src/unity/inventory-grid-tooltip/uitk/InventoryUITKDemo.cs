using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.InventoryGridTooltip
{
    /// <summary>
    /// UI Toolkit 버전 테스트 입력 — 갤러리와 같은 숫자키 (새 Input System).
    /// 1: 오른쪽 끝 칸 포커스  2: 선택한 아이템 장착  3: 새 아이템 획득  4 또는 Q: 정렬  5 또는 F: 희귀도 필터
    /// 칸 이동·장착은 패널이 방향키·패드의 Navigation 이벤트로 받는다.
    /// </summary>
    public class InventoryUITKDemo : MonoBehaviour
    {
        [SerializeField] InventoryUITK inventory;
        [SerializeField] InventoryItem[] lootPool;
        int lootIndex;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.digit1Key.wasPressedThisFrame) inventory.FocusEdgeSlot();
            if (keyboard.digit2Key.wasPressedThisFrame) inventory.EquipFocused();
            if (keyboard.digit3Key.wasPressedThisFrame && lootPool.Length > 0)
                inventory.AddLoot(Instantiate(lootPool[lootIndex++ % lootPool.Length]));
            if (keyboard.digit4Key.wasPressedThisFrame || keyboard.qKey.wasPressedThisFrame) inventory.CycleSort();
            if (keyboard.digit5Key.wasPressedThisFrame || keyboard.fKey.wasPressedThisFrame) inventory.ToggleRarityFilter();
        }
    }
}
