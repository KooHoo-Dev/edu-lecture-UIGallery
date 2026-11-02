using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 테스트용 입력 — 갤러리의 이벤트 버튼과 같은 숫자키. 새 Input System 사용. 모든 대기는 실제 시간(일시정지 중에도 동작).
    /// 1 포커스 아래로 · 2 확인 · 3 옆 카테고리(Q/E) · 4 뒤로가기 4연타(0.07초 간격)
    /// 5 빈 곳 클릭 흉내(선택 해제) → 0.3초 뒤 아래 · 6 확인 두 번 연타(0.1초 간격, '타이틀로'에 포커스를 두고 눌러 볼 것)
    /// 메뉴가 닫혀 있으면 어느 키든 먼저 일시정지를 연다.
    /// </summary>
    public class MainPauseMenuDemo : MonoBehaviour
    {
        [SerializeField] PauseController pause;
        [SerializeField] MenuInputBuffer buffer;

        void Update()
        {
            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.digit1Key.wasPressedThisFrame) Send(MenuCommand.Down);
            if (kb.digit2Key.wasPressedThisFrame) Send(MenuCommand.Submit);
            if (kb.digit3Key.wasPressedThisFrame) Send(MenuCommand.NextPage);
            if (kb.digit4Key.wasPressedThisFrame) StartCoroutine(Repeat(MenuCommand.Cancel, 4, 0.07f));
            if (kb.digit5Key.wasPressedThisFrame) StartCoroutine(ClickEmptyThenMove());
            if (kb.digit6Key.wasPressedThisFrame) StartCoroutine(Repeat(MenuCommand.Submit, 2, 0.1f));
        }

        void Send(MenuCommand cmd)
        {
            if (!pause.IsOpen)
            {
                pause.Open();   // 입력 하나는 한 단계만 — 이번 입력은 '열기'로 소비
                return;
            }
            buffer.Feed(cmd);
        }

        IEnumerator Repeat(MenuCommand cmd, int count, float gap)
        {
            var wait = new WaitForSecondsRealtime(gap);
            for (int i = 0; i < count; i++)
            {
                // 닫힌 뒤 들어온 입력은 버퍼가 잠금으로 버린다 (다시 열리지 않는지 확인)
                if (pause.IsOpen) buffer.Feed(cmd);
                yield return wait;
            }
        }

        IEnumerator ClickEmptyThenMove()
        {
            if (!pause.IsOpen) pause.Open();
            if (EventSystem.current) EventSystem.current.SetSelectedGameObject(null);
            yield return new WaitForSecondsRealtime(0.3f);
            buffer.Feed(MenuCommand.Down);   // recoverSelection 이 켜져 있으면 마지막 항목으로 되살린 뒤 처리
        }
    }
}
