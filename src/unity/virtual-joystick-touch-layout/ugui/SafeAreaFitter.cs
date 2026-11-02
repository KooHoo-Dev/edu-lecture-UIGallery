using UnityEngine;

namespace UIGallery.VirtualJoystickTouchLayout
{
    /// <summary>
    /// HUD 루트를 세이프 에어리어(노치 · 둥근 모서리 · 홈 표시줄을 뺀 영역)에 맞춘다.
    /// Screen.safeArea 는 **픽셀, 왼쪽 아래 원점** → 화면 크기로 나눠 0~1 앵커로 바꾼다.
    /// 배경은 이 오브젝트 밖(Canvas 바로 아래)에 두어 화면 끝까지 칠하고, 누르고 읽는 것만 이 안에 둔다.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public class SafeAreaFitter : MonoBehaviour
    {
        RectTransform rt;
        Rect applied;
        Vector2Int screen;

        void Awake()
        {
            rt = (RectTransform)transform;
            Apply();
        }

        void Update()
        {
            // 회전 · 해상도 변경 · 폴더블 펼침
            if (Screen.safeArea != applied || screen.x != Screen.width || screen.y != Screen.height) Apply();
        }

        void Apply()
        {
            applied = Screen.safeArea;
            screen = new Vector2Int(Screen.width, Screen.height);
            if (screen.x == 0 || screen.y == 0) return;

            Vector2 min = applied.position;
            Vector2 max = applied.position + applied.size;
            min.x /= screen.x;
            min.y /= screen.y;
            max.x /= screen.x;
            max.y /= screen.y;

            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }
    }
}
