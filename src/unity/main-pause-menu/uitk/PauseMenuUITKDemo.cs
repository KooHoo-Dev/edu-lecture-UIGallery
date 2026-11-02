using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 테스트용 입력 (UI Toolkit 버전) — 갤러리의 이벤트 버튼과 같은 숫자키. 대기는 실제 시간.
    /// 1 포커스 아래로 · 2 확인 · 3 옆 카테고리 · 4 뒤로가기 4연타(0.07초 간격) · 6 확인 두 번 연타(0.1초 간격)
    /// (5 '빈 곳 클릭'은 마우스로 메뉴 바깥을 직접 눌러 확인한다)
    /// 메뉴가 닫혀 있으면 첫 입력은 '열기'로 소비된다.
    /// </summary>
    public class PauseMenuUITKDemo : MonoBehaviour
    {
        [SerializeField] PauseMenuUITK menu;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) Send(MenuInput.Down);
            if (kb.digit2Key.wasPressedThisFrame) Send(MenuInput.Submit);
            if (kb.digit3Key.wasPressedThisFrame) Send(MenuInput.NextPage);
            if (kb.digit4Key.wasPressedThisFrame) StartCoroutine(Repeat(MenuInput.Cancel, 4, 0.07f));
            if (kb.digit6Key.wasPressedThisFrame) StartCoroutine(Repeat(MenuInput.Submit, 2, 0.1f));
        }

        void Send(MenuInput input)
        {
            if (Time.timeScale > 0f)   // 일시정지가 아니면 = 메뉴가 닫혀 있음
            {
                menu.Open();
                return;
            }
            menu.Feed(input);
        }

        IEnumerator Repeat(MenuInput input, int count, float gap)
        {
            var wait = new WaitForSecondsRealtime(gap);
            for (int i = 0; i < count; i++)
            {
                menu.Feed(input);   // 닫힌 뒤의 입력은 잠금으로 버려진다 → 다시 열리지 않는다
                yield return wait;
            }
        }
    }
}
