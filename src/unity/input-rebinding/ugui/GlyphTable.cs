// 컨트롤 경로 → 글리프 스프라이트 · 한국어 이름 표 (ScriptableObject).
// GetBindingDisplayString 의 out controlPath('buttonSouth', 'dpad/up', 'rightButton')로 찾는다.
// 패드 버튼은 특정 콘솔의 기호 대신 위치(아래 · 오른쪽 …) 그림을 넣는다. 표에 없으면 Input System 의 표시 문자열을 그대로 쓴다.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.InputRebinding
{
    [CreateAssetMenu(menuName = "UI Gallery/Input Rebinding/Glyph Table", fileName = "GlyphTable")]
    public class GlyphTable : ScriptableObject
    {
        [Serializable]
        public class Entry
        {
            [Tooltip("GetBindingDisplayString 의 controlPath. 예: buttonSouth · leftShoulder · dpad/up · rightButton")]
            public string controlPath;
            public Sprite sprite;
            [Tooltip("칸에 쓸 이름. 비우면 Input System 의 표시 문자열")]
            public string label;
        }

        [SerializeField] List<Entry> entries = new()
        {
            new Entry { controlPath = "buttonSouth", label = "아래 버튼" },
            new Entry { controlPath = "buttonEast", label = "오른쪽 버튼" },
            new Entry { controlPath = "buttonWest", label = "왼쪽 버튼" },
            new Entry { controlPath = "buttonNorth", label = "위 버튼" },
            new Entry { controlPath = "leftShoulder", label = "L 숄더" },
            new Entry { controlPath = "rightShoulder", label = "R 숄더" },
            new Entry { controlPath = "dpad/up", label = "방향 패드 위" },
            new Entry { controlPath = "dpad/down", label = "방향 패드 아래" },
            new Entry { controlPath = "dpad/left", label = "방향 패드 왼쪽" },
            new Entry { controlPath = "dpad/right", label = "방향 패드 오른쪽" },
            new Entry { controlPath = "start", label = "메뉴 버튼" },
            new Entry { controlPath = "leftButton", label = "마우스 왼쪽" },
            new Entry { controlPath = "rightButton", label = "마우스 오른쪽" },
            new Entry { controlPath = "middleButton", label = "마우스 휠" },
        };
        [Tooltip("키보드 키 바탕 (글자는 TextMeshPro 로 위에 쓴다)")]
        [SerializeField] Sprite keyCap;

        public Sprite KeyCap => keyCap;

        public Entry Find(string controlPath)
        {
            if (string.IsNullOrEmpty(controlPath)) return null;
            foreach (var e in entries)
                if (string.Equals(e.controlPath, controlPath, StringComparison.OrdinalIgnoreCase)) return e;
            return null;
        }

        /// <summary>
        /// 바인딩 하나를 칸에 쓸 글자 · 글리프로. 키보드는 현재 자판 배열의 키 이름(AZERTY 면 같은 자리라도 다른 글자)이 나온다.
        /// 비운 바인딩(경로 "")은 "비어 있음".
        /// </summary>
        public string Describe(InputAction action, int index, out Sprite sprite)
        {
            sprite = null;
            if (action == null || index < 0) return "고정";
            if (string.IsNullOrEmpty(action.bindings[index].effectivePath)) return "비어 있음";
            string text = action.GetBindingDisplayString(index, out string layout, out string controlPath, InputBinding.DisplayStringOptions.DontIncludeInteractions);
            var e = Find(controlPath);
            if (e != null)
            {
                sprite = e.sprite;
                if (!string.IsNullOrEmpty(e.label)) return e.label;
            }
            else if (!string.IsNullOrEmpty(layout) && InputSystem.IsFirstLayoutBasedOnSecond(layout, "Keyboard")) sprite = keyCap;
            return text;
        }
    }
}
