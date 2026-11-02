import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'settings-accessibility',
  title: '설정 · 접근성 메뉴',
  titleEn: 'Settings & Accessibility Menu',
  group: 'G',
  order: 1,
  paradigms: ['menu'],
  oneLiner: '유형별 프리셋으로 한 번에 켜고, 하나씩 다시 손보고, 바꾸는 즉시 옆 미리보기에서 결과를 확인하는 설정 화면',
  goals: [
    '많은 옵션을 **카테고리 탭 + 유형별 프리셋**으로 나눠 플레이어가 덜 헤매는 정보 구조를 설계할 수 있다',
    '값을 바꾸면 바로 미리보기에 반영되는 **설정 데이터 → 변경 이벤트 → 화면 갱신** 구조를 구현할 수 있다',
    '글자 크기·자막 배경·색각 모드·고대비·카메라 흔들림·모션 줄이기가 각각 **어떤 렌더링 수단**(폰트 크기, 불투명도, 색 변수, 후처리, 진폭, 전환 시간)을 바꾸는지 설명할 수 있다',
    '프리셋 적용·개별 수정·기본값 복원이 섞일 때 **기본 / 프리셋 / 수정됨 / 사용자 지정** 상태를 화면에 드러낼 수 있다',
  ],
  principles: ['접근성', '인지 부하', '즉각 피드백', '가독성', '시각 위계'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['gamepad', 'keyboard', 'mouse', 'touch'],
  genres: ['액션 어드벤처', '3인칭 슈터', '모바일 액션', '공통'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'textScale', label: '글자 크기', type: 'range', min: 80, max: 200, step: 10, default: 100, unit: '%', hint: '메뉴 글자·설명·자막을 함께 키운다. 커진 글자가 잘리지 않게 행 높이도 늘고, 넘치면 줄바꿈된다' },
    {
      key: 'subtitleBg',
      label: '자막 배경',
      type: 'select',
      default: 'default',
      options: [
        { value: 'off', label: '끔' },
        { value: 'default', label: '기본 (50%)' },
        { value: 'heavy', label: '진하게 (85%)' },
      ],
      hint: '자막 뒤 반투명 판의 불투명도. 미리보기의 밝은 모래 바닥 위에서 읽기 쉬운 정도가 달라진다',
    },
    { key: 'speakerCues', label: '화자명·방향 표시', type: 'toggle', default: true, hint: '대사 앞 색 이름 + 화면 밖 화자 쪽 화살표. "대사 재생"을 눌러 화면 밖 화자 대사를 확인해 보자' },
    {
      key: 'colorMode',
      label: '색각 모드',
      type: 'select',
      default: 'off',
      options: [
        { value: 'off', label: '끔' },
        { value: 'protanopia', label: '적색약' },
        { value: 'deuteranopia', label: '녹색약' },
        { value: 'tritanopia', label: '청색약' },
      ],
      hint: '아군·적·아이템·위험의 역할 색 변수 묶음을 바꾼다. 미리보기 왼쪽 범례와 머리 위 표식 색이 함께 바뀌고, 실루엣 모양(캡슐·삼각·마름모)은 그대로',
    },
    {
      key: 'highContrast',
      label: '고대비 디스플레이',
      type: 'select',
      default: 'off',
      options: [
        { value: 'off', label: '끔' },
        { value: 'dim-bg', label: '배경 억제' },
        { value: 'role-color', label: '역할 단색' },
        { value: 'role-outline', label: '단색 + 외곽선' },
      ],
      hint: '배경 채도·명도를 낮추고 대상을 역할 색으로 칠한다. 메뉴 테두리와 포커스 링도 함께 굵어진다',
    },
    { key: 'cameraShake', label: '카메라 흔들림', type: 'range', min: 0, max: 10, step: 1, default: 5, unit: '단계', hint: '"피격" 때 미리보기 장면이 흔들리는 크기(값 × 2px). 0이면 테두리만 강조. 자막·HUD 는 흔들지 않는다' },
    { key: 'reduceMotion', label: '모션 줄이기', type: 'toggle', default: false, hint: '메뉴 쪽 움직임만 담당: 탭 페이드·순차 강조·창 확대·색 전환이 즉시 바뀐다. 장면 흔들림과 역할을 나눈다' },
    {
      key: 'menuLayout',
      label: '메뉴 배치',
      type: 'select',
      default: 'split-tabs',
      options: [
        { value: 'split-tabs', label: '탭 + 옆 미리보기 (넓은 화면·패드)' },
        { value: 'single-list-touch', label: '접히는 목록 (터치)' },
      ],
      hint: '터치 배치는 탭 대신 접히는 섹션, 큰 ◀ ▶ 버튼, 행 높이 48dp 이상. 9:16 화면에서는 항상 터치 배치',
    },
  ],
  presets: [
    {
      id: 'low-vision-contrast',
      name: '저시력 고대비형',
      look: '글자와 자막이 크고 배경판이 진하다. 미리보기는 거의 무채색이 되고, 대상만 선명한 단색과 굵은 외곽선으로 떠오른다',
      values: { textScale: 160, subtitleBg: 'heavy', speakerCues: true, colorMode: 'off', highContrast: 'role-outline', cameraShake: 2, reduceMotion: false, menuLayout: 'split-tabs' },
    },
    {
      id: 'motion-comfort',
      name: '멀미 완화형',
      look: '피격 테스트를 눌러도 장면은 움직이지 않고 테두리만 잠깐 강조된다. 탭 전환·프리셋 적용도 페이드 없이 즉시 바뀐다',
      values: { textScale: 100, subtitleBg: 'default', speakerCues: true, colorMode: 'off', highContrast: 'off', cameraShake: 0, reduceMotion: true, menuLayout: 'split-tabs' },
    },
    {
      id: 'mobile-condensed',
      name: '세로 터치 축약형',
      look: '위에 미리보기, 아래에 큰 터치 영역의 접히는 목록. 좁은 화면에 맞춰 글자는 조금 크게, 녹색약 팔레트로 시작한다',
      values: { textScale: 120, subtitleBg: 'default', speakerCues: false, colorMode: 'deuteranopia', highContrast: 'off', cameraShake: 3, reduceMotion: false, menuLayout: 'single-list-touch' },
    },
  ],
  events: [
    { id: 'apply-preset-vision', label: '시각 프리셋 적용' },
    { id: 'tweak-option', label: '옵션 하나 직접 바꾸기' },
    { id: 'play-dialogue', label: '대사 재생 (자막)' },
    { id: 'hit-shake', label: '피격 (흔들림 테스트)' },
    { id: 'quick-contrast', label: '고대비 빠른 전환' },
    { id: 'reset-defaults', label: '기본값 복원' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'preset-bar',
      title: '프리셋은 "출발점"이지 "정답"이 아니다',
      body: '수십 개의 옵션을 처음부터 훑게 하면 지친다. **유형별 프리셋**이 여러 탭에 흩어진 권장값을 한 번에 켜 주면 필요한 지원을 빨리 얻는다. 적용 뒤에도 모든 값을 다시 고칠 수 있어야 하고, 고치면 라벨이 **"프리셋 · 수정됨"**으로 바뀐다. "옵션 하나 직접 바꾸기"로 확인해 보자.',
      principle: '인지 부하',
    },
    {
      n: 2,
      part: 'subtitle-sample',
      title: '소리로만 오던 정보를 화면으로',
      body: '글자만 키워도 배경이 밝으면 읽히지 않고, 누가 어디서 말하는지 모르면 대화를 따라갈 수 없다. **크기 · 배경 진하기 · 화자 색 이름 · 화면 밖 방향 화살표**를 함께 조정하게 하면 듣지 못해도 "누가, 어디서, 무엇을" 말했는지 안다.',
      principle: '가독성',
    },
    {
      n: 3,
      part: 'footer-hints',
      title: '수시로 바꾸는 옵션은 메뉴 밖 단축 입력으로',
      body: '필요한 시인성은 장면마다 다르다. 고대비처럼 자주 켜고 끄는 옵션은 **입력 한 번으로 토글**하게 하고 하단 안내에 적어 둔다. 한 기기에만 있는 입력에 묶지 말고 **패드 · 키보드 · 터치 버튼**에 하나씩 연결한다. 키보드·마우스·게임패드·터치 중 **마지막으로 쓴 장치**를 감지해 안내가 그 장치용으로 바뀐다.',
      principle: '접근성',
    },
    {
      n: 4,
      part: 'live-preview',
      title: '바꾸는 즉시 결과가 보인다',
      body: '"자막 배경 진하게"가 실제로 얼마나 읽기 쉬운지는 글 설명으로 알기 어렵다. 메뉴 옆 미리보기가 값 변경을 **같은 프레임에** 그리고, 포커스된 옵션이 바꾸는 부분을 점선으로 짚어 주면 메뉴를 닫고 확인하는 왕복이 사라진다. (근거 자료에 없는, 교육용으로 더한 장치)',
      principle: '즉각 피드백',
    },
    {
      n: 5,
      part: 'change-marker',
      title: '무엇을 바꿨는지 표시해 둔다',
      body: '프리셋과 개별 수정이 섞이면 지금 상태가 어디서 왔는지 헷갈린다. 기본값과 다른 행에 **점**을 찍고 탭에 **변경 개수 배지**를 달면 복원할 범위를 스스로 판단할 수 있다. 그래서 복원 확인 창도 "현재 탭만 / 전체 / 취소"를 고르게 한다. (교육용 추가 장치)',
      principle: '시각 위계',
    },
  ],
  mistakes: [
    { title: '미리보기 없이 "적용" 버튼으로만 반영', body: '값을 바꾸고 적용한 뒤 메뉴를 닫아야 결과가 보이면 같은 메뉴를 여러 번 왕복하게 된다. 시각 옵션은 **즉시 미리보기**와 짝을 지어 둔다.' },
    { title: '글자 크기 설정이 메뉴에는 적용되지 않음', body: '자막만 커지고 설정 메뉴 글자는 그대로면, 저시력 플레이어는 글자 크기 옵션을 찾는 것부터 어렵다. 메뉴·HUD·자막에 같은 배율을 쓰고, 행 높이는 레이아웃이 자동으로 늘린다.' },
    { title: '프리셋을 고르면 개별 값이 잠김', body: '프리셋을 "모드"로 만들어 수정을 막거나, 하나만 고쳐도 프리셋이 통째로 풀려 값이 돌아가면 혼란스럽다. 프리셋은 **값을 한 번 덮어쓰는 함수**일 뿐이고, 그 뒤는 "수정됨" 상태로 넘긴다.' },
    { title: '색각 모드가 색만 바꿈', body: '빨강/초록을 다른 색 쌍으로 바꿔도 모양이 같으면 여전히 구별이 어려운 사람이 있다. 적·아군·아이템은 **실루엣 모양**이나 외곽선으로도 구분되게 한다.' },
    { title: '기본값 복원이 확인 없이 전체를 초기화', body: '한 번 눌러 수십 개의 조정값이 사라지면 다시 맞추기 매우 번거롭다. 범위(현재 탭/전체)를 고르게 하고 확인 창의 **기본 포커스는 "취소"**에 둔다.' },
  ],
  juiceOff:
    '탭·프리셋 없이 옵션 42개가 한 줄 목록에 섞여 있고(접근성 옵션이 일반 옵션 사이에 흩어짐), 미리보기 대신 **메뉴를 닫아야 반영되는** 게임 화면만 있다. 글자는 글자 크기 설정과 상관없이 작게 고정, 바뀐 항목 표시 없음, 단계 옵션은 **팝업 드롭다운**, 기본값 복원은 **확인 없이 즉시 전체 초기화**, 피격 테스트는 흔들림 설정을 무시하고 메뉴째 크게 흔들린다.',
  timings: [
    { event: '값 변경 → 미리보기 반영', ms: 0, easing: 'none', note: '권장값. 다음 프레임에 바로. 색이 바뀔 때만 아래 크로스페이드' },
    { event: '색각·고대비 팔레트 크로스페이드', ms: 200, easing: 'ease-out', note: '권장값. 모션 줄이기면 0ms' },
    { event: '프리셋 적용 → 바뀐 행 순차 강조', ms: 240, easing: 'ease-out', note: '권장값. 다음 행은 40ms 간격, 전체 1초 이내. 모션 줄이기면 모든 행을 동시에 정지 강조' },
    { event: '카테고리 탭 전환', ms: 150, easing: 'ease-out', note: '권장값. 페이드만, 좌우 슬라이드 없음(멀미 요소 최소화). 모션 줄이기면 0ms' },
    { event: '자막 등장', ms: 120, easing: 'linear', note: '권장값. 읽혀야 하므로 위치 이동 없이 페이드만' },
    { event: '피격 흔들림', ms: 300, easing: '감쇠 진동', note: '권장값. 진폭 = 값 × 2px. 0단계면 테두리 120ms 강조, 모션 줄이기면 깜빡임 없이 300ms 정지 강조' },
    { event: '복원 확인 창 열림', ms: 180, easing: 'ease-out', note: '권장값. 0.96 → 1.0 확대 + 페이드. 모션 줄이기면 즉시 표시. 기본 포커스는 "취소"' },
  ],
  unity: {
    ugui: {
      hierarchy: `SettingsCanvas (Canvas · CanvasScaler 1920×1080 · GraphicRaycaster)
├─ SettingsMenu (SettingsMenu.cs · SettingsPreview.cs · SettingsAccessibilityDemo.cs)
│  ├─ LeftPanel (VerticalLayoutGroup)
│  │  ├─ PresetBar (HorizontalLayoutGroup)
│  │  │  ├─ PresetButton × 4 (Button → SettingsMenu.ApplyPreset(0~3))
│  │  │  └─ PresetStateLabel (TMP_Text)
│  │  ├─ CategoryTabs (HorizontalLayoutGroup)
│  │  │  └─ Tab × 5 (Button + TMP_Text + Badge(Image + TMP_Text))
│  │  ├─ TabPage × 5 (탭마다 옵션 행 부모, 하나만 활성)
│  │  │  └─ OptionRow (OptionRow.cs)
│  │  │     ├─ Flash (CanvasGroup · Image)   ← 프리셋 순차 강조
│  │  │     ├─ ChangeDot (Image)
│  │  │     ├─ Label (TMP_Text)
│  │  │     └─ StepSelector (StepSelector.cs) ◀ ValueText ▶
│  │  └─ ResetButton (Button → OpenReset)
│  └─ RightPanel (VerticalLayoutGroup)
│     ├─ PreviewView (RawImage ← 미리보기 Camera 의 RenderTexture)
│     │  ├─ Hud (체력·탄약) · CenterDot · HitFrame
│     │  └─ SubtitleSample (Image + TMP 화자명/대사 + 방향 화살표 ◀ ▶)
│     └─ DescriptionPanel (TMP_Text 제목 · 본문)
├─ FooterHints (Gamepad / Keyboard / Touch 그룹 3개 중 하나만 활성)
├─ ResetConfirmDialog (CanvasGroup · 버튼 3개: 현재 탭만 · 전체 · 취소)
└─ EventSystem (InputSystemUIInputModule)
PreviewWorld (별도 레이어 · 전용 Camera → RenderTexture)
└─ 아군 캡슐 · 적 삼각 · 아이템 마름모 (SpriteRenderer) + Outline 스프라이트 + 역할 범례(Image + TMP)
Assets: AccessibilitySettings.asset · Defaults.asset · Preset_Vision/Hearing/Motor/Comfort.asset`,
      steps: [
        '`AccessibilitySettings` (ScriptableObject) 에셋을 **두 개** 만든다: 실제 값 + 기본값(Defaults). 모든 값은 int 하나(단계 인덱스·0/1·수치)라 위젯 하나로 다룰 수 있다. 런타임에는 `Instantiate` 한 복사본을 쓴다.',
        '`AccessibilityPreset` 에셋 4개(시각·청각·운동·멀미 완화)에 덮어쓸 키와 값만 넣는다. `Apply()` 는 실제로 바뀐 키 목록을 돌려준다.',
        '옵션 행은 `OptionRow` + `StepSelector` 하나로 통일한다. StepSelector 는 `Selectable` 을 상속해 `OnMove` 에서 **좌우 = 값 변경, 위아래 = `base.OnMove`(행 이동)** 로 나눈다.',
        'UI 는 화면을 직접 바꾸지 않는다. 위젯 → `settings.Set(키, 값)` → `Changed` → `SettingsMenu`(변경 점·배지·상태 라벨)와 `SettingsPreview`(글자·자막·팔레트·고대비·HUD)가 각자 구독해 다시 그린다.',
        '`SettingsMenu` 에 Input Actions(이전/다음 탭, 복원, 고대비 빠른 전환)를 연결한다. 각 액션에 **패드·키보드 바인딩을 둘 다** 두고, 터치는 화면 버튼이 `ToggleQuickContrast()` 를 부른다.',
        '`SettingsPreview.scaledTexts` 에 **메뉴의 TMP_Text 까지** 넣는다. 자막만 커지고 메뉴가 그대로면 글자 크기 옵션을 찾을 수 없다.',
        '`SettingsAccessibilityDemo.cs` 를 붙이면 갤러리와 같은 숫자키(1~6)로 이벤트를 시험할 수 있다.',
      ],
      pitfalls: [
        '`CanvasScaler.scaleFactor` 로 글자를 키우면 레이아웃 전체가 커져 화면 밖으로 넘친다. 글자는 `TMP_Text.fontSize`, 행 높이는 레이아웃 그룹(Control Child Size)으로.',
        'StepSelector 의 Navigation 이 Automatic 이면 위아래 이동이 엉뚱한 버튼으로 튄다. 목록 행은 **Vertical** 또는 Explicit 내비게이션으로 지정한다.',
        '일시정지(`Time.timeScale = 0`) 메뉴의 연출은 `Time.unscaledDeltaTime` · `WaitForSecondsRealtime` 으로 돌린다. 이 예제의 코루틴도 모두 그렇게 되어 있다.',
        '고대비를 URP Volume 으로 만들 때 Global 로 두면 실제 게임까지 무채색이 된다. 미리보기 카메라의 **Volume Mask** 와 레이어를 맞춘다.',
        '`FindObjectOfType` 은 6.3 에서 obsolete. 설정은 인스펙터 직렬화 참조로 연결한다.',
        '`OnEnable` 에서 바로 `EventSystem.current` 를 쓰면 실행 순서에 따라 아직 null 일 수 있다. null 이면 건너뛰고 `Start` 에서 첫 선택을 한 번 더 한다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + SettingsMenuUITK.cs
└─ SettingsMenu.uxml  (#root.settings  ← cb-xxx · high-contrast · reduce-motion 클래스)
   ├─ #left
   │  ├─ #preset-bar  > Button ×4 · Label #preset-state
   │  ├─ #tabs        > Button.tab ×5 (+ Label.badge)
   │  ├─ ScrollView #option-list
   │  │  └─ .option-row.tab-N ×12  > .change-dot · Label.row-label · StepSelectorElement
   │  └─ Button #reset
   ├─ #right
   │  ├─ #preview (RenderTexture → background-image)
   │  │  └─ #subtitle.bg-default > #arrow-left · #speaker · #line · #arrow-right
   │  └─ .description-panel > #description-title · #description
   ├─ #footer > Label #hints
   └─ #reset-dialog.scrim.hidden > .dialog > #dlg-tab · #dlg-all · #dlg-cancel
(AccessibilitySettings.cs · AccessibilityPreset.cs 는 ugui 폴더의 것을 함께 쓴다)`,
      steps: [
        '`StepSelectorElement` 는 `[UxmlElement]` 커스텀 컨트롤(◀ 값 ▶)이다. `NavigationMoveEvent` 의 좌우에서 값을 바꾸고 `StopPropagation()` + `focusController.IgnoreEvent(evt)` 로 소비한다. 위아래는 그대로 두어 포커스 이동에 쓴다. 코드가 `UIGallery.SettingsAccessibility` namespace 안에 있으므로 UXML 에는 `<UIGallery.SettingsAccessibility.StepSelectorElement>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        '런타임 설정 복사본(`Instantiate`)은 `Awake` 에서 한 번만 만든다. `OnEnable` 은 UIDocument 가 새로 만든 트리에서 행·탭 목록을 **비우고 다시 모으고**, 입력 액션은 메서드로 `+=` 해 `OnDisable` 에서 `-=` 한다.',
        '`SettingsMenuUITK` 가 데이터의 `Changed` 에서 루트 클래스(`cb-deutan`, `high-contrast`, `reduce-motion`)를 `EnableInClassList` 로 바꾼다. 역할 색은 USS 변수(`--c-ally` 등)라 클래스 하나로 하위 전체가 바뀐다.',
        '변경 점은 행에 `.changed` 클래스, 탭 배지는 `.badge` 텍스트와 `.zero` 클래스로 갱신한다.',
        '프리셋 순차 강조: 바뀐 행에 `.flash` 를 붙이고 `schedule.Execute(...).StartingIn()` 으로 40ms 씩 늦게 시작, 240ms 뒤 뗀다. 모션 줄이기면 동시에.',
        '복원 버튼에서 `#reset-dialog` 의 `.hidden` 을 떼고 `#dlg-cancel.Focus()` 로 **기본 포커스를 취소**에 둔다. 창은 `.opening`(scale 0.96 · opacity 0)을 한 프레임 뒤 떼어 확대 + 페이드.',
        '`SettingsUITKDemo.cs` 로 숫자키 1~6 이벤트를 시험한다.',
      ],
      pitfalls: [
        'USS 에는 `calc()`·`rem` 이 없다. 글자 배율은 단계 클래스나, 이 예제처럼 C# 에서 `.scaled` 라벨의 `style.fontSize` 를 직접 넣는다.',
        '`transition` 은 상속되지 않는다. 모션 줄이기는 `.reduce-motion .option-row { transition-duration: 0s; }` 처럼 **하위 선택자로 대상마다** 덮어쓴다.',
        '`DropdownField` 는 Submit 으로 팝업을 열어 "좌우로 값 변경" 규칙이 깨진다. 패드 사용자를 위해 단계 옵션은 커스텀 컨트롤로.',
        'USS 는 gradient·box-shadow·filter 를 지원하지 않는다. 포커스 강조는 `border-width`·`border-color` 로, 장면 고대비는 URP Volume 에서 처리한다.',
        '`StopPropagation()` 만으로는 Unity 6 의 FocusController 가 좌우 포커스 이동을 그대로 처리할 수 있다. `focusController?.IgnoreEvent(evt)` 를 함께 불러 값만 바뀌고 포커스는 제자리에 있는지 **강사가 6.3 에서 직접 확인**한다.',
        '메뉴를 `SetActive` 로 껐다 켜면 `OnEnable` 이 다시 돈다. 요소 목록을 비우지 않거나 `InputAction.performed` 에 람다를 붙이면 배지가 2배로 세어지고 Q/E 한 번에 탭이 두 칸 넘어간다.',
        '한글 글리프가 있는 Text Core **FontAsset** 을 Panel Settings 의 Text Settings 나 `-unity-font-definition` 으로 지정해야 한글이 깨지지 않는다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'The Last of Us Part II (2020)',
      credit: '© 2020 Sony Interactive Entertainment LLC',
      borrowed: ['정보 구조 (유형별 프리셋 → 개별 조정)', '자막·고대비 옵션 구성'],
      learned:
        '시각/청각/운동 유형별 프리셋이 여러 카테고리에 흩어진 권장 옵션을 **한 번에 켜고, 그 뒤에도 개별 조정을 허용**하는 구조, 크기·배경·화자명·방향 표시를 묶은 자막 옵션 구성, 배경을 억제하고 대상에 대비 색을 입히는 고대비 개념과 **메뉴 밖 빠른 전환** 아이디어를 가져왔다. 근거는 공식 블로그와 PlayStation 접근성 페이지의 텍스트이며, 실제 메뉴의 배치·색·위젯 모양은 확인하지 않았고 쓰지도 않았다.',
      link: 'https://www.naughtydog.com/blog/the_last_of_us_part_ii_accessibility_features_detailed',
    },
  ],
  original:
    '메뉴 배치, 금색 강조 색, 위젯 모양, 아이콘과 입력 기호(갤러리 공통 중립 글리프), 미리보기 장면(갤러리 공통 캡슐·삼각·마름모 실루엣, 역할 범례, 사막 폐허), 대사와 화자(하린·도윤), 옵션 이름과 설명은 모두 새로 만들었다. 고대비는 원작의 번호식 단계 대신 **배경 억제 / 역할 단색 / 단색 + 외곽선**으로, 색각 팔레트는 갤러리용 역할 색으로 새로 구성했다. **즉시 미리보기, 변경 표시 점, 탭 배지, 프리셋 상태 라벨, 복원 범위 선택, 모션 줄이기와 카메라 흔들림의 역할 분리, 세로 터치 재배치**는 원작에 없는 교육용 추가 장치다.',
  flashes: true,
  references: [
    { label: 'Naughty Dog 공식 블로그 — The Last of Us Part II 접근성 기능 상세 (2020)', url: 'https://www.naughtydog.com/blog/the_last_of_us_part_ii_accessibility_features_detailed' },
    { label: 'PlayStation 공식 — The Last of Us Part II 접근성 페이지', url: 'https://www.playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/' },
    { label: 'Game Accessibility Guidelines', url: 'https://gameaccessibilityguidelines.com/' },
    { label: 'Xbox Accessibility Guidelines (Microsoft Learn)', url: 'https://learn.microsoft.com/en-us/gaming/accessibility/guidelines' },
    { label: 'Unity 6.3 — UIElements.TabView', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.TabView.html' },
    { label: 'uGUI 2.0 — Selectable (OnMove · OnSelect)', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/UnityEngine.UI.Selectable.html' },
    { label: 'Unity 6.3 — UIElements.NavigationMoveEvent', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.NavigationMoveEvent.html' },
  ],
}
