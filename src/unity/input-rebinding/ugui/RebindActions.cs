// 시험용 액션 에셋을 코드로 만든다 — 이동(WASD 합성 + 왼쪽 스틱) · 점프 · 달리기 · 웅크리기 · 상호작용 · 수리 키트 · 스캐너.
// 프로젝트 기본 InputSystem_Actions 를 쓸 때는 이 파일이 필요 없다 (RebindMenu.actions 에 그 에셋을 끌어 놓는다).
// 바인딩 id 를 고정하는 이유: LoadBindingOverridesFromJson 은 저장된 id 로 바인딩을 찾는다.
// 실행할 때마다 id 가 새로 생기면 저장한 재설정을 다음 실행에서 불러오지 못한다 (에셋 파일은 id 가 파일에 저장돼 괜찮다).
using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.InputRebinding
{
    public static class RebindActions
    {
        const string K = RebindService.KeyboardGroup;
        const string G = RebindService.GamepadGroup;

        public static InputActionAsset CreateDefault()
        {
            var asset = ScriptableObject.CreateInstance<InputActionAsset>();
            asset.name = "RebindDemoActions";
            asset.AddControlScheme(K).WithRequiredDevice("<Keyboard>").WithOptionalDevice("<Mouse>");
            asset.AddControlScheme(G).WithRequiredDevice("<Gamepad>");

            var map = asset.AddActionMap("Player");
            int n = 1;

            // 이동: 키보드는 2D 합성(부분마다 따로 바꿀 수 있다), 패드는 왼쪽 스틱 하나(바꾸지 않는다)
            var move = map.AddAction("Move", InputActionType.Value, expectedControlLayout: "Vector2");
            move.AddBinding(new InputBinding { name = "WASD", path = "2DVector", isComposite = true, id = Id(n++) });
            Part(move, "up", "<Keyboard>/w", n++);
            Part(move, "down", "<Keyboard>/s", n++);
            Part(move, "left", "<Keyboard>/a", n++);
            Part(move, "right", "<Keyboard>/d", n++);
            move.AddBinding(new InputBinding { path = "<Gamepad>/leftStick", groups = G, id = Id(n++) });

            Button(map, "Jump", "<Keyboard>/space", "<Gamepad>/buttonSouth", ref n);
            Button(map, "Sprint", "<Keyboard>/leftShift", "<Gamepad>/leftShoulder", ref n);
            Button(map, "Crouch", "<Keyboard>/c", "<Gamepad>/buttonEast", ref n);
            Button(map, "Interact", "<Keyboard>/e", "<Gamepad>/buttonWest", ref n);
            Button(map, "UseRepairKit", "<Keyboard>/q", "<Gamepad>/buttonNorth", ref n);
            Button(map, "Scan", "<Mouse>/rightButton", "<Gamepad>/rightShoulder", ref n);
            // 메뉴 열기 — 재설정 목록에 넣지 않는 고정 행동 (Esc · 패드 메뉴 버튼은 늘 빠져나오는 길)
            Button(map, "Menu", "<Keyboard>/escape", "<Gamepad>/start", ref n);
            return asset;
        }

        static void Part(InputAction action, string part, string path, int n)
        {
            action.AddBinding(new InputBinding { name = part, path = path, groups = K, isPartOfComposite = true, id = Id(n) });
        }

        static void Button(InputActionMap map, string name, string key, string pad, ref int n)
        {
            var a = map.AddAction(name, InputActionType.Button);
            a.AddBinding(new InputBinding { path = key, groups = K, id = Id(n++) });
            a.AddBinding(new InputBinding { path = pad, groups = G, id = Id(n++) });
        }

        /// <summary>실행마다 같은 id — 저장한 JSON 을 다시 불러올 수 있게</summary>
        static Guid Id(int n) => new Guid(0x1d0b0000 + n, 0x7e5a, 0x4c1d, 0x9a, 0x51, 0, 0, 0, 0, 0, (byte)n);
    }
}
