using UnityEngine;
using UnityEngine.InputSystem;

namespace UIGallery.SkillCooldownPrompt
{
    /// <summary>
    /// 테스트용 입력 — 갤러리와 같은 숫자키. 새 Input System 사용.
    /// 1: 기본 스킬(파동)  2: 이동기(도약)  3: 궁극기(폭주) 시도  4: 에너지 +25  5: 쿨다운 가속 버프  6: 입력 장치 바꾸기
    /// (실제 플레이 입력 Q · Shift · E · R / 패드 버튼은 각 SkillSlot 의 useAction 에 연결한다)
    /// </summary>
    public class SkillBarDemo : MonoBehaviour
    {
        [SerializeField] SkillBar bar;
        [SerializeField] InputGlyphSwitcher switcher;

        void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.digit1Key.wasPressedThisFrame) bar.Slot(0).TryUse();
            if (keyboard.digit2Key.wasPressedThisFrame) bar.Slot(1).TryUse();
            if (keyboard.digit3Key.wasPressedThisFrame) bar.Slot(3).TryUse();
            if (keyboard.digit4Key.wasPressedThisFrame) bar.GainEnergy(25f);
            if (keyboard.digit5Key.wasPressedThisFrame) bar.ApplyHaste();
            if (keyboard.digit6Key.wasPressedThisFrame) switcher.Cycle();
        }
    }
}
