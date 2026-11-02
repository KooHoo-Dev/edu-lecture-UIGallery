using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 일반 승리  2: 레벨 업 포함 승리  3: 큰 보상 승리  4: 확인 입력 1회  5: 연타하던 중 승리 (0.07초 간격 4회)
    /// </summary>
    public class ResultsDemo : MonoBehaviour
    {
        [SerializeField] ResultsSequence results;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            // wasPressedThisFrame: 누른 '순간'에만 참. isPressed 를 쓰면 누르고 있는 동안 매 프레임 참이 되어 단계를 관통한다
            if (keyboard.digit1Key.wasPressedThisFrame) results.Play(ResultData.Normal());
            if (keyboard.digit2Key.wasPressedThisFrame) results.Play(ResultData.LevelUp());
            if (keyboard.digit3Key.wasPressedThisFrame) results.Play(ResultData.Big());
            if (keyboard.digit4Key.wasPressedThisFrame) results.Press();
            if (keyboard.digit5Key.wasPressedThisFrame) StartCoroutine(MashIntoVictory());
        }

        /// <summary>공격 버튼을 연타하던 중 전투가 끝난 상황 — 진입 잠금이 이 입력들을 버리는지 확인</summary>
        IEnumerator MashIntoVictory()
        {
            results.Play(ResultData.LevelUp());
            var wait = new WaitForSecondsRealtime(0.07f);
            for (int i = 0; i < 4; i++)
            {
                results.Press();
                yield return wait;
            }
        }
    }
}
