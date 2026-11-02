using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.ResultsReward
{
    /// <summary>
    /// UI Toolkit 판 테스트 입력 — 갤러리와 같은 숫자키.
    /// 1: 일반 승리  2: 레벨 업 포함 승리  3: 큰 보상 승리  4: 확인 입력 1회  5: 연타하던 중 승리
    /// </summary>
    public class ResultsUITKDemo : MonoBehaviour
    {
        [SerializeField] ResultsSequenceUITK results;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;
            if (keyboard.digit1Key.wasPressedThisFrame) results.Play(ResultData.Normal());
            if (keyboard.digit2Key.wasPressedThisFrame) results.Play(ResultData.LevelUp());
            if (keyboard.digit3Key.wasPressedThisFrame) results.Play(ResultData.Big());
            if (keyboard.digit4Key.wasPressedThisFrame) results.Press();
            if (keyboard.digit5Key.wasPressedThisFrame) StartCoroutine(MashIntoVictory());
        }

        IEnumerator MashIntoVictory()
        {
            results.Play(ResultData.LevelUp());
            var wait = new WaitForSecondsRealtime(0.07f);
            for (int i = 0; i < 4; i++)
            {
                results.Press();   // 진입 잠금(0.3초) 안이라 모두 버려져야 한다
                yield return wait;
            }
        }
    }
}
