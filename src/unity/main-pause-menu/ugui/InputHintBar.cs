using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 하단 입력 안내 바 + 위치 표시(브레드크럼).
    /// - 마지막으로 입력이 들어온 장치(키보드 · 게임패드)를 감지해 글리프 묶음을 바꾼다 (0.12초 크로스페이드)
    /// - 글리프 자리는 레이아웃에서 폭을 고정해 두어 문구가 옆으로 튀지 않게 한다
    /// - 장치가 바뀌었는데 선택이 비어 있으면 마지막 항목을 다시 선택한다 (마우스 → 패드 먹통 방지)
    /// - 하위 메뉴(깊이 2 이상)에서만 '옆 카테고리' 안내를 켠다
    /// </summary>
    public class InputHintBar : MonoBehaviour
    {
        [SerializeField] MenuStack stack;
        [SerializeField] CanvasGroup keyboardHints;
        [SerializeField] CanvasGroup gamepadHints;
        [SerializeField] GameObject[] pageHints;     // 두 묶음 각각의 '옆 카테고리' 항목
        [SerializeField] TMP_Text breadcrumb;
        [SerializeField] float fadeSeconds = 0.12f;

        bool usingGamepad;
        Coroutine fade;

        void OnEnable()
        {
            InputSystem.onActionChange += OnActionChange;
            stack.Changed += OnStackChanged;
            Apply(instant: true);
            OnStackChanged(stack);
        }

        void OnDisable()
        {
            InputSystem.onActionChange -= OnActionChange;
            stack.Changed -= OnStackChanged;
        }

        void OnActionChange(object obj, InputActionChange change)
        {
            if (change != InputActionChange.ActionPerformed || obj is not InputAction action) return;
            var device = action.activeControl?.device;
            if (device == null || device is Mouse) return;   // 마우스는 안내를 바꾸지 않는다
            bool pad = device is Gamepad;
            if (pad == usingGamepad) return;
            usingGamepad = pad;
            Apply(instant: false);

            // 선택이 풀려 있으면 되살린다
            var es = EventSystem.current;
            if (es && !es.currentSelectedGameObject)
            {
                var go = stack.FallbackSelection();
                if (go) es.SetSelectedGameObject(go);
            }
        }

        void OnStackChanged(MenuStack s)
        {
            foreach (var h in pageHints) if (h) h.SetActive(s.Depth >= 2 && !s.TopIsOverlay);
            if (breadcrumb) breadcrumb.text = s.Path;
        }

        void Apply(bool instant)
        {
            if (fade != null) StopCoroutine(fade);
            if (instant || !isActiveAndEnabled)
            {
                keyboardHints.alpha = usingGamepad ? 0f : 1f;
                gamepadHints.alpha = usingGamepad ? 1f : 0f;
                return;
            }
            fade = StartCoroutine(Fade());
        }

        IEnumerator Fade()
        {
            float k0 = keyboardHints.alpha;
            float g0 = gamepadHints.alpha;
            float k1 = usingGamepad ? 0f : 1f;
            float g1 = usingGamepad ? 1f : 0f;
            for (float t = 0f; t < fadeSeconds; t += Time.unscaledDeltaTime)
            {
                float k = t / fadeSeconds;
                keyboardHints.alpha = Mathf.Lerp(k0, k1, k);
                gamepadHints.alpha = Mathf.Lerp(g0, g1, k);
                yield return null;
            }
            keyboardHints.alpha = k1;
            gamepadHints.alpha = g1;
        }
    }
}
