using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace UIGallery.MainPauseMenu
{
    /// <summary>
    /// 되돌릴 수 없는 일을 묻는 확인 창 (MenuPanel 과 같은 오브젝트, MenuPanel.overlay = true).
    /// - 기본 포커스는 안전한 쪽: MenuPanel.firstSelected = '취소' 버튼
    /// - 입력 잠금: 창이 뜬 직후 0.3초는 확정을 받지 않는다 → 습관적인 두 번째 확인이 진행을 날리지 않는다
    /// - 취소 = 스택에서 한 칸 뒤로 (뒤로가기와 같은 의미)
    /// </summary>
    [RequireComponent(typeof(MenuPanel))]
    public class ConfirmDialog : MonoBehaviour
    {
        [SerializeField] MenuStack stack;
        [SerializeField] Button cancelButton;
        [SerializeField] Button confirmButton;
        [SerializeField] float confirmLockSeconds = 0.3f;
        [Tooltip("확정했을 때 (예: PauseController.GoToTitle)")] public UnityEvent onConfirmed;

        float openedAt;

        void Awake()
        {
            cancelButton.onClick.AddListener(() => stack.Back());
            confirmButton.onClick.AddListener(OnConfirm);
        }

        void OnEnable() => openedAt = Time.unscaledTime;

        void OnConfirm()
        {
            if (Time.unscaledTime - openedAt < confirmLockSeconds) return;   // 막 열림 — 확정 잠금
            onConfirmed.Invoke();
        }
    }
}
