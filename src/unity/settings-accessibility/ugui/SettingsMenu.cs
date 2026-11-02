using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 설정·접근성 메뉴 컨트롤러 (UGUI).
    /// - 카테고리 탭(이전/다음 탭 액션), 탭 배지(변경 개수), 변경 표시 점
    /// - 유형별 프리셋 적용 → 바뀐 행 순차 강조 (모션 줄이기면 동시 정지 강조) → 상태 라벨
    /// - 기본값 복원 확인 창 (현재 탭만 / 전체 / 취소, 기본 포커스 = 취소)
    /// - 고대비 빠른 전환 (메뉴 밖에서도 동작), 입력 장치별 하단 안내
    /// 일시정지 메뉴이므로 모든 연출은 unscaled 시간(WaitForSecondsRealtime)으로 돈다.
    /// </summary>
    public class SettingsMenu : MonoBehaviour
    {
        [Header("데이터")]
        [SerializeField] AccessibilitySettings settingsAsset;
        [SerializeField] AccessibilitySettings defaults;
        [SerializeField] AccessibilityPreset[] presets;          // 시각 · 청각 · 운동 · 멀미 완화

        [Header("탭 (Tab 순서와 같게)")]
        [SerializeField] Button[] tabButtons;
        [SerializeField] TMP_Text[] tabBadges;
        [SerializeField] GameObject[] tabPages;                  // 탭마다 옵션 행 부모
        [SerializeField] Graphic tabUnderline;

        [Header("목록")]
        [SerializeField] OptionRow[] rows;
        [SerializeField] TMP_Text presetStateLabel;
        [SerializeField] TMP_Text descriptionTitle;
        [SerializeField] TMP_Text descriptionBody;

        [Header("복원 확인 창")]
        [SerializeField] CanvasGroup resetDialog;
        [SerializeField] Button dlgTabOnly, dlgAll, dlgCancel;

        [Header("하단 안내 (장치별 그룹)")]
        [SerializeField] GameObject hintsGamepad, hintsKeyboard, hintsTouch;

        [Header("입력 (Input System)")]
        [SerializeField] InputActionReference prevTab;          // 패드 L 숄더 / 키보드 Q
        [SerializeField] InputActionReference nextTab;          // 패드 R 숄더 / 키보드 E
        [SerializeField] InputActionReference resetAction;      // 패드 왼쪽 얼굴 버튼 / 키보드 R
        [SerializeField] InputActionReference quickContrast;    // 패드 위쪽 얼굴 버튼 길게 / 키보드 C

        public AccessibilitySettings Settings { get; private set; }
        public AccessibilitySettings Defaults => defaults;

        int tab;
        AccessibilityPreset activePreset;
        bool modified;
        bool applyingPreset;
        int lastContrast = 3;
        Coroutine flashRoutine;

        void Awake()
        {
            // 에셋에 런타임 값을 쓰면 에디터에서 파일이 바뀌어 버린다 → 복사본 사용
            Settings = Instantiate(settingsAsset);
            foreach (var row in rows)
            {
                row.Bind(Settings);
                var r = row;
                row.Selector.Selected += _ => ShowDescription(r);
            }
            for (int i = 0; i < tabButtons.Length; i++)
            {
                int t = i;
                tabButtons[i].onClick.AddListener(() => SelectTab(t));
            }
            dlgTabOnly.onClick.AddListener(() => ConfirmReset(false));
            dlgAll.onClick.AddListener(() => ConfirmReset(true));
            dlgCancel.onClick.AddListener(CloseReset);
            SetDialog(false);
        }

        void OnEnable()
        {
            Settings.Changed += OnChanged;
            prevTab.action.performed += OnPrevTab;
            nextTab.action.performed += OnNextTab;
            resetAction.action.performed += OnReset;
            quickContrast.action.performed += OnQuick;
            foreach (var a in new[] { prevTab, nextTab, resetAction, quickContrast }) a.action.Enable();
            InputSystem.onActionChange += OnActionChange;
            Settings.NotifyAll();
            SelectTab(tab);
        }

        void Start()
        {
            // 첫 프레임에는 실행 순서에 따라 EventSystem.current 가 아직 없을 수 있다 → Start 에서 한 번 더 선택
            SelectTab(tab);
        }

        void OnDisable()
        {
            Settings.Changed -= OnChanged;
            prevTab.action.performed -= OnPrevTab;
            nextTab.action.performed -= OnNextTab;
            resetAction.action.performed -= OnReset;
            quickContrast.action.performed -= OnQuick;
            InputSystem.onActionChange -= OnActionChange;
        }

        /* ───── 설정 데이터 → 메뉴 표시 ───── */

        void OnChanged(AccessibilitySettings s, AccessibilitySettings.Key? key)
        {
            // 프리셋 적용 중이 아닌데 값이 바뀌었다 = 플레이어가 직접 고침
            if (key.HasValue && !applyingPreset && activePreset != null) modified = true;

            foreach (var row in rows) row.Sync(defaults);

            var counts = new int[tabBadges.Length];
            foreach (var k in AccessibilitySettings.AllKeys)
                if (s.Get(k) != defaults.Get(k)) counts[(int)AccessibilitySettings.TabOf(k)]++;
            for (int i = 0; i < tabBadges.Length; i++)
            {
                tabBadges[i].text = counts[i].ToString();
                tabBadges[i].transform.parent.gameObject.SetActive(counts[i] > 0);
            }
            RefreshStateLabel();
        }

        void RefreshStateLabel()
        {
            bool isDefault = true;
            foreach (var k in AccessibilitySettings.AllKeys)
                if (Settings.Get(k) != defaults.Get(k)) { isDefault = false; break; }

            if (activePreset != null)
                presetStateLabel.text = modified ? $"{activePreset.displayName} 프리셋 · 수정됨" : $"{activePreset.displayName} 프리셋";
            else
                presetStateLabel.text = isDefault ? "기본" : "사용자 지정";
        }

        void ShowDescription(OptionRow row)
        {
            descriptionTitle.text = row.Label;
            descriptionBody.text = row.description;
        }

        /* ───── 탭 ───── */

        public void SelectTab(int index)
        {
            tab = (index + tabPages.Length) % tabPages.Length;
            for (int i = 0; i < tabPages.Length; i++) tabPages[i].SetActive(i == tab);
            if (tabUnderline) tabUnderline.rectTransform.position = tabButtons[tab].transform.position;

            // 탭을 넘기면 그 탭의 첫 행에 포커스 (패드 사용자가 길을 잃지 않게)
            // EventSystem.current 는 EventSystem 의 OnEnable 에서 정해지므로, 그 전이면 선택만 건너뛴다 (Start 에서 다시 부름)
            foreach (var row in rows)
                if ((int)AccessibilitySettings.TabOf(row.key) == tab)
                {
                    if (EventSystem.current) EventSystem.current.SetSelectedGameObject(row.Selector.gameObject);
                    ShowDescription(row);
                    break;
                }
        }

        void OnPrevTab(InputAction.CallbackContext _) { if (!DialogOpen) SelectTab(tab - 1); }
        void OnNextTab(InputAction.CallbackContext _) { if (!DialogOpen) SelectTab(tab + 1); }

        /* ───── 프리셋 ───── */

        public void ApplyPreset(int index)
        {
            var preset = presets[index];
            applyingPreset = true;
            var changed = preset.Apply(Settings);
            applyingPreset = false;
            activePreset = preset;
            modified = false;
            RefreshStateLabel();

            if (flashRoutine != null) StopCoroutine(flashRoutine);
            flashRoutine = StartCoroutine(FlashRows(changed));
        }

        IEnumerator FlashRows(List<AccessibilitySettings.Key> keys)
        {
            var targets = new List<CanvasGroup>();
            foreach (var row in rows)
                if (row.Flash && keys.Contains(row.key)) targets.Add(row.Flash);

            if (Settings.GetBool(AccessibilitySettings.Key.ReduceMotion))
            {
                // 모션 줄이기: 움직임 없이 모두 동시에 강조했다가 지운다
                foreach (var cg in targets) cg.alpha = 1f;
                yield return new WaitForSecondsRealtime(0.9f);
                foreach (var cg in targets) cg.alpha = 0f;
                yield break;
            }
            for (int i = 0; i < targets.Count; i++)
            {
                StartCoroutine(FlashOne(targets[i]));
                yield return new WaitForSecondsRealtime(0.04f);   // 다음 행은 40ms 뒤
            }
        }

        static IEnumerator FlashOne(CanvasGroup cg)
        {
            const float duration = 0.24f;
            for (float t = 0f; t < duration; t += Time.unscaledDeltaTime)
            {
                float k = t / duration;
                cg.alpha = k < 0.3f ? k / 0.3f : 1f - (k - 0.3f) / 0.7f;
                yield return null;
            }
            cg.alpha = 0f;
        }

        /* ───── 고대비 빠른 전환 (메뉴 밖에서도) ───── */

        void OnQuick(InputAction.CallbackContext _) => ToggleQuickContrast();

        public void ToggleQuickContrast()
        {
            const AccessibilitySettings.Key k = AccessibilitySettings.Key.HighContrast;
            int now = Settings.Get(k);
            if (now != 0) { lastContrast = now; Settings.Set(k, 0); }
            else Settings.Set(k, lastContrast);
        }

        /* ───── 기본값 복원 ───── */

        bool DialogOpen => resetDialog.interactable;

        void OnReset(InputAction.CallbackContext _) { if (!DialogOpen) OpenReset(); }

        public void OpenReset()
        {
            SetDialog(true);
            // 실수로 눌러도 아무것도 사라지지 않게 기본 포커스는 '취소'
            if (EventSystem.current) EventSystem.current.SetSelectedGameObject(dlgCancel.gameObject);
            if (!Settings.GetBool(AccessibilitySettings.Key.ReduceMotion)) StartCoroutine(PopIn(resetDialog.transform));
        }

        void ConfirmReset(bool all)
        {
            foreach (var k in AccessibilitySettings.AllKeys)
                if (all || (int)AccessibilitySettings.TabOf(k) == tab)
                    Settings.Set(k, defaults.Get(k), notify: false);
            if (all) { activePreset = null; modified = false; }
            else if (activePreset != null) modified = true;
            Settings.NotifyAll();
            CloseReset();
        }

        void CloseReset()
        {
            SetDialog(false);
            SelectTab(tab);
        }

        void SetDialog(bool open)
        {
            resetDialog.alpha = open ? 1f : 0f;
            resetDialog.interactable = open;
            resetDialog.blocksRaycasts = open;
        }

        static IEnumerator PopIn(Transform t)
        {
            const float duration = 0.18f;
            for (float e = 0f; e < duration; e += Time.unscaledDeltaTime)
            {
                float k = 1f - Mathf.Pow(1f - e / duration, 3f);   // ease-out
                t.localScale = Vector3.one * Mathf.Lerp(0.96f, 1f, k);
                yield return null;
            }
            t.localScale = Vector3.one;
        }

        /* ───── 입력 장치 감지 → 하단 안내 교체 ───── */

        void OnActionChange(object obj, InputActionChange change)
        {
            if (change != InputActionChange.ActionPerformed || obj is not InputAction action) return;
            var device = action.activeControl?.device;
            if (device is Gamepad) ShowHints(hintsGamepad);
            else if (device is Keyboard || device is Mouse) ShowHints(hintsKeyboard);
            else if (device is Touchscreen) ShowHints(hintsTouch);
        }

        void ShowHints(GameObject group)
        {
            hintsGamepad.SetActive(group == hintsGamepad);
            hintsKeyboard.SetActive(group == hintsKeyboard);
            hintsTouch.SetActive(group == hintsTouch);
        }
    }
}
