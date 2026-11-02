// 시험용 — RebindMenu 에 액션 에셋이 없으면 코드로 만들어 넣고, 누른 입력이 어느 행동을 일으켰는지 띄운다 ('시험해 보기').
// 같은 프레임에 두 행동이 나가면 함께 적는다 — 충돌을 허용했을 때 '한 키에 두 행동' 이 눈에 보이게.
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.InputRebinding
{
    [DefaultExecutionOrder(-100)] // RebindMenu.Start 보다 먼저 에셋을 넣는다
    public class RebindDemo : MonoBehaviour
    {
        [SerializeField] RebindMenu menu;
        [SerializeField] TextMeshProUGUI testText;

        InputActionAsset asset;
        bool created;
        readonly List<string> fired = new();
        int firedFrame = -1;

        void Awake()
        {
            if (menu.Actions == null)
            {
                menu.Actions = RebindActions.CreateDefault();
                created = true;
            }
            asset = menu.Actions;
            var map = asset.FindActionMap("Player", true);
            foreach (var a in map.actions) a.performed += OnPerformed;
            map.Enable();
        }

        void OnDestroy()
        {
            if (asset == null) return;
            foreach (var a in asset.FindActionMap("Player", true).actions) a.performed -= OnPerformed;
            if (created) Destroy(asset);
        }

        void OnPerformed(InputAction.CallbackContext ctx)
        {
            if (ctx.action.type == InputActionType.Value) return; // 이동은 계속 들어오므로 제외
            if (Time.frameCount != firedFrame)
            {
                fired.Clear();
                firedFrame = Time.frameCount;
            }
            fired.Add(ctx.action.name);
            if (testText == null) return;
            string warn = fired.Count > 1 ? $"  ⚠ 한 입력에 행동 {fired.Count}개" : "";
            testText.text = $"{ctx.control.displayName} → {string.Join(" + ", fired)}{warn}";
        }
    }
}
