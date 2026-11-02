using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace UIGallery.SettingsAccessibility
{
    /// <summary>
    /// 설정·접근성 메뉴 — UI Toolkit 버전.
    /// UGUI 버전과 같은 AccessibilitySettings / AccessibilityPreset 에셋을 쓴다 (ugui 폴더의 두 스크립트를 함께 넣을 것).
    /// 데이터의 Changed 에서 루트 클래스(cb-xxx, high-contrast, reduce-motion)와 각 요소를 다시 지정한다.
    /// USS 에는 calc() 가 없으므로 글자 배율은 .scaled 라벨의 style.fontSize 로 직접 넣는다.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public class SettingsMenuUITK : MonoBehaviour
    {
        [SerializeField] AccessibilitySettings settingsAsset;
        [SerializeField] AccessibilitySettings defaults;
        [SerializeField] AccessibilityPreset[] presets;             // 시각 · 청각 · 운동 · 멀미 완화 (UXML 버튼 순서)
        [SerializeField] RenderTexture previewTexture;              // 미리보기 전용 Camera 의 Output Texture
        [SerializeField] InputActionReference prevTab, nextTab, quickContrast, resetAction;

        public AccessibilitySettings Settings { get; private set; }

        VisualElement root, settingsRoot, dialog, dialogBox, subtitle;
        Label presetState, descTitle, desc, dialogBody, line, speaker, arrowLeft, arrowRight;
        readonly List<VisualElement> rows = new();
        readonly List<StepSelectorElement> selectors = new();
        readonly List<Button> tabs = new();
        readonly List<Button> presetButtons = new();
        readonly Dictionary<Label, float> baseFontSize = new();

        int tab = 1;
        AccessibilityPreset activePreset;
        bool modified, applyingPreset;
        int lastContrast = 3;

        void Awake()
        {
            // 런타임 복사본은 한 번만 만든다 — 메뉴를 SetActive 로 껐다 켜도 값이 유지된다
            Settings = Instantiate(settingsAsset);
        }

        void OnEnable()
        {
            // UIDocument 는 다시 켤 때마다 트리를 새로 만든다 → 이전 요소 목록을 비우고 새로 모은다
            // (비우지 않으면 행·탭이 두 배가 되어 배지 개수가 2배로 세어진다)
            rows.Clear();
            selectors.Clear();
            tabs.Clear();
            presetButtons.Clear();
            baseFontSize.Clear();

            root = GetComponent<UIDocument>().rootVisualElement;
            settingsRoot = root.Q("root");
            presetState = root.Q<Label>("preset-state");
            descTitle = root.Q<Label>("description-title");
            desc = root.Q<Label>("description");
            dialog = root.Q("reset-dialog");
            dialogBox = dialog.Q(className: "dialog");
            dialogBody = root.Q<Label>("dialog-body");
            subtitle = root.Q("subtitle");
            line = root.Q<Label>("line");
            speaker = root.Q<Label>("speaker");
            arrowLeft = root.Q<Label>("arrow-left");
            arrowRight = root.Q<Label>("arrow-right");

            if (previewTexture) root.Q("preview").style.backgroundImage = Background.FromRenderTexture(previewTexture);

            // 글자 배율 대상: 메뉴 라벨 + 설명 + 자막 (메뉴도 반드시 포함)
            root.Query<Label>(className: "scaled").ForEach(l => baseFontSize[l] = 26f);
            root.Query<Label>(className: "scaled-sub").ForEach(l => baseFontSize[l] = 30f);
            baseFontSize[descTitle] = 30f;
            baseFontSize[desc] = 23f;

            // 옵션 행
            root.Query(className: "option-row").ForEach(row =>
            {
                var sel = row.Q<StepSelectorElement>();
                var key = System.Enum.Parse<AccessibilitySettings.Key>(sel.key);
                sel.Min = AccessibilitySettings.Min(key);
                sel.Max = AccessibilitySettings.Max(key);
                sel.Step = AccessibilitySettings.Step(key);
                sel.Format = v => AccessibilitySettings.Label(key, v);
                sel.ValueChanged += v => Settings.Set(key, v);
                var label = row.Q<Label>(className: "row-label").text;
                sel.RegisterCallback<FocusInEvent>(_ =>
                {
                    foreach (var r in rows) r.RemoveFromClassList("focused");
                    row.AddToClassList("focused");
                    descTitle.text = label;
                    desc.text = $"{label}: 좌우로 값을 바꾸면 미리보기에 바로 반영됩니다.";
                });
                rows.Add(row);
                selectors.Add(sel);
            });

            // 탭
            for (int i = 0; i < 5; i++)
            {
                int t = i;
                var b = root.Q<Button>($"tab-{i}");
                b.clicked += () => SelectTab(t);
                tabs.Add(b);
            }

            // 프리셋
            string[] presetNames = { "preset-vision", "preset-hearing", "preset-motor", "preset-comfort" };
            for (int i = 0; i < presetNames.Length && i < presets.Length; i++)
            {
                int p = i;
                var b = root.Q<Button>(presetNames[i]);
                b.clicked += () => ApplyPreset(p);
                presetButtons.Add(b);
            }

            root.Q<Button>("reset").clicked += OpenReset;
            root.Q<Button>("dlg-tab").clicked += () => ConfirmReset(false);
            root.Q<Button>("dlg-all").clicked += () => ConfirmReset(true);
            root.Q<Button>("dlg-cancel").clicked += CloseReset;

            // 입력 액션: 람다 대신 메서드로 붙여야 OnDisable 에서 뗄 수 있다
            // (InputActionReference 는 에셋이라, 떼지 않으면 씬을 바꾼 뒤에도 파괴된 컴포넌트가 불린다)
            prevTab.action.performed += OnPrevTab;
            nextTab.action.performed += OnNextTab;
            quickContrast.action.performed += OnQuickContrast;
            resetAction.action.performed += OnResetAction;
            foreach (var a in new[] { prevTab, nextTab, quickContrast, resetAction }) a.action.Enable();

            Settings.Changed += OnChanged;
            Settings.NotifyAll();
            SelectTab(tab);
        }

        void OnDisable()
        {
            prevTab.action.performed -= OnPrevTab;
            nextTab.action.performed -= OnNextTab;
            quickContrast.action.performed -= OnQuickContrast;
            resetAction.action.performed -= OnResetAction;
            foreach (var a in new[] { prevTab, nextTab, quickContrast, resetAction }) a.action.Disable();
            if (Settings) Settings.Changed -= OnChanged;
            // 버튼 clicked 람다는 UIDocument 가 트리를 다시 만들 때 요소와 함께 버려지므로 떼지 않아도 된다
        }

        void OnPrevTab(InputAction.CallbackContext _) => SelectTab(tab - 1);
        void OnNextTab(InputAction.CallbackContext _) => SelectTab(tab + 1);
        void OnQuickContrast(InputAction.CallbackContext _) => ToggleQuickContrast();
        void OnResetAction(InputAction.CallbackContext _) => OpenReset();

        /* ───── 데이터 → 화면 ───── */

        void OnChanged(AccessibilitySettings s, AccessibilitySettings.Key? key)
        {
            if (key.HasValue && !applyingPreset && activePreset != null) modified = true;

            // 위젯 값 + 변경 점
            var counts = new int[5];
            for (int i = 0; i < rows.Count; i++)
            {
                var k = System.Enum.Parse<AccessibilitySettings.Key>(selectors[i].key);
                selectors[i].SetValueWithoutNotify(s.Get(k));
                bool changed = s.Get(k) != defaults.Get(k);
                rows[i].EnableInClassList("changed", changed);
                if (changed) counts[(int)AccessibilitySettings.TabOf(k)]++;
            }
            for (int i = 0; i < tabs.Count; i++)
            {
                var badge = tabs[i].Q<Label>(className: "badge");
                badge.text = counts[i].ToString();
                badge.EnableInClassList("zero", counts[i] == 0);
            }

            // 루트 클래스: 색각 · 고대비 · 모션 줄이기 (USS 변수와 하위 선택자가 나머지를 처리)
            int cb = s.Get(AccessibilitySettings.Key.ColorMode);
            settingsRoot.EnableInClassList("cb-protan", cb == 1);
            settingsRoot.EnableInClassList("cb-deutan", cb == 2);
            settingsRoot.EnableInClassList("cb-tritan", cb == 3);
            settingsRoot.EnableInClassList("high-contrast", s.Get(AccessibilitySettings.Key.HighContrast) > 0);
            settingsRoot.EnableInClassList("reduce-motion", s.GetBool(AccessibilitySettings.Key.ReduceMotion));

            // 글자 크기: font-size 는 transition 걸지 않고 즉시 (레이아웃 재계산이 무겁다)
            float scale = s.Get(AccessibilitySettings.Key.TextScale) / 100f;
            foreach (var pair in baseFontSize) pair.Key.style.fontSize = pair.Value * scale;

            // 자막
            int bg = s.Get(AccessibilitySettings.Key.SubtitleBg);
            subtitle.EnableInClassList("bg-off", bg == 0);
            subtitle.EnableInClassList("bg-default", bg == 1);
            subtitle.EnableInClassList("bg-heavy", bg == 2);
            int color = s.Get(AccessibilitySettings.Key.SubtitleColor);
            line.EnableInClassList("yellow", color == 1);
            line.EnableInClassList("sky", color == 2);
            speaker.EnableInClassList("hidden", !s.GetBool(AccessibilitySettings.Key.SpeakerCues));

            RefreshState();
        }

        void RefreshState()
        {
            bool isDefault = true;
            foreach (var k in AccessibilitySettings.AllKeys)
                if (Settings.Get(k) != defaults.Get(k)) { isDefault = false; break; }

            presetState.RemoveFromClassList("is-preset");
            presetState.RemoveFromClassList("is-modified");
            presetState.RemoveFromClassList("is-custom");
            if (activePreset != null)
            {
                presetState.text = modified ? $"{activePreset.displayName} 프리셋 · 수정됨" : $"{activePreset.displayName} 프리셋";
                presetState.AddToClassList(modified ? "is-modified" : "is-preset");
            }
            else
            {
                presetState.text = isDefault ? "기본" : "사용자 지정";
                if (!isDefault) presetState.AddToClassList("is-custom");
            }
            for (int i = 0; i < presetButtons.Count; i++) presetButtons[i].EnableInClassList("active", presets[i] == activePreset);
        }

        /* ───── 탭 · 프리셋 · 빠른 전환 ───── */

        public void SelectTab(int index)
        {
            if (!dialog.ClassListContains("hidden")) return;
            tab = (index + tabs.Count) % tabs.Count;
            for (int i = 0; i < tabs.Count; i++) tabs[i].EnableInClassList("selected", i == tab);
            VisualElement first = null;
            for (int i = 0; i < rows.Count; i++)
            {
                bool show = rows[i].ClassListContains($"tab-{tab}");
                rows[i].EnableInClassList("hidden-tab", !show);
                if (show && first == null) first = selectors[i];
            }
            first?.Focus();
        }

        public void ApplyPreset(int index)
        {
            applyingPreset = true;
            var changed = presets[index].Apply(Settings);
            applyingPreset = false;
            activePreset = presets[index];
            modified = false;
            RefreshState();

            // 바뀐 행 순차 강조: 행마다 40ms 늦게 .flash 를 붙였다가 240ms 뒤 뗀다 (모션 줄이기면 동시에)
            bool still = Settings.GetBool(AccessibilitySettings.Key.ReduceMotion);
            int order = 0;
            for (int i = 0; i < rows.Count; i++)
            {
                var k = System.Enum.Parse<AccessibilitySettings.Key>(selectors[i].key);
                if (!changed.Contains(k)) continue;
                var row = rows[i];
                long start = still ? 0 : order++ * 40;
                row.schedule.Execute(() => row.AddToClassList("flash")).StartingIn(start);
                row.schedule.Execute(() => row.RemoveFromClassList("flash")).StartingIn(start + (still ? 900 : 240));
            }
        }

        public void ToggleQuickContrast()
        {
            const AccessibilitySettings.Key k = AccessibilitySettings.Key.HighContrast;
            int now = Settings.Get(k);
            if (now != 0) { lastContrast = now; Settings.Set(k, 0); }
            else Settings.Set(k, lastContrast);
        }

        /* ───── 자막 샘플 ───── */

        /// <summary>대사 한 줄. voice: 0 하린(아군 색) · 1 도윤(두 번째 화자 색), dir: -1 왼쪽 화면 밖 · +1 오른쪽 · 0 화면 안</summary>
        public void PlayLine(string who, string text, int voice, int dir)
        {
            bool cues = Settings.GetBool(AccessibilitySettings.Key.SpeakerCues);
            speaker.text = who + ":";
            speaker.EnableInClassList("voice2", voice == 1);                // 화자마다 다른 이름 색 (USS 변수라 색각 모드도 따라간다)
            line.text = text;
            arrowLeft.EnableInClassList("hidden", !(cues && dir < 0));
            arrowRight.EnableInClassList("hidden", !(cues && dir > 0));
            subtitle.style.opacity = 0f;                                    // 위치 이동 없이 페이드만 (USS transition 0.12s)
            subtitle.schedule.Execute(() => subtitle.style.opacity = 1f).StartingIn(16);
        }

        /* ───── 기본값 복원 ───── */

        public void OpenReset()
        {
            int all = 0, inTab = 0;
            foreach (var k in AccessibilitySettings.AllKeys)
                if (Settings.Get(k) != defaults.Get(k)) { all++; if ((int)AccessibilitySettings.TabOf(k) == tab) inTab++; }
            dialogBody.text = $"되돌릴 범위를 고르세요. 지금 탭에서 {inTab}개, 전체에서 {all}개가 바뀌어 있습니다.";

            dialog.RemoveFromClassList("hidden");
            if (!Settings.GetBool(AccessibilitySettings.Key.ReduceMotion))
            {
                dialogBox.AddToClassList("opening");                              // 0.96 + 투명에서 시작
                dialogBox.schedule.Execute(() => dialogBox.RemoveFromClassList("opening")).StartingIn(16);
            }
            root.Q<Button>("dlg-cancel").Focus();                                 // 기본 포커스 = 취소
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
            dialog.AddToClassList("hidden");
            SelectTab(tab);
        }
    }
}
