import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'input-rebinding',
  title: '입력 재설정 (키 리바인딩)',
  titleEn: 'Input Rebinding',
  group: 'G',
  order: 4,
  paradigms: ['menu'],
  tags: ['accessibility'],
  oneLiner: '칸을 고르면 새 키를 기다리고, 이미 쓰는 키면 맞바꿀지 묻는다. Esc 는 늘 빠져나오는 길, 바꾼 것만 JSON 으로 저장',
  goals: [
    '**키 입력 대기**를 만들고 Esc 취소 · 남은 시간 · 시작 키 무시로 대기에서 늘 빠져나올 수 있게 할 수 있다',
    '같은 열에서 **충돌**을 찾아 맞바꾸기 · 비우기 · 거절 중 하나로 처리하고, 무엇이 바뀌는지 미리 말해 줄 수 있다',
    'Input System 의 `PerformInteractiveRebinding` 으로 바꾸고 `SaveBindingOverridesAsJson` 으로 **바뀐 것만** 저장 · 불러올 수 있다',
    '`GetBindingDisplayString` 과 마지막 입력 장치로 **안내 글리프가 바꾼 키를 따라가게** 할 수 있다',
  ],
  principles: ['접근성', '즉각 피드백', '인지 부하', '일관성', '어포던스'],
  platforms: ['pc', 'console'],
  inputs: ['keyboard', 'mouse', 'gamepad'],
  genres: ['액션 어드벤처', '플랫포머', '슈터', '모든 장르의 설정 화면'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'timeoutMs', label: '대기 시간', type: 'range', min: 0, max: 10000, step: 500, default: 5000, unit: 'ms', hint: '키 입력 대기가 저절로 끝나는 시간. 남은 시간이 칸과 상태 카드에 줄어드는 막대로 보인다. 0 이면 시간 제한 없음 — Esc 로만 끝난다(느리게 누르는 사람을 위한 설정)' },
    {
      key: 'conflictPolicy',
      label: '충돌 처리',
      type: 'select',
      default: 'swap',
      options: [
        { value: 'swap', label: '맞바꾸기 물어보기' },
        { value: 'unbind', label: '다른 행 비우기 물어보기' },
        { value: 'reject', label: '거절하고 계속 대기' },
      ],
      hint: '이미 다른 행동에 쓰는 키를 눌렀을 때. 맞바꾸기 = 그 행동이 내 옛 키를 받는다 · 비우기 = 그 행동은 키 없음(⚠) · 거절 = 이유를 보이고 다른 키를 기다린다',
    },
    {
      key: 'inputDevice',
      label: '입력 안내',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: '자동 (마지막 입력 장치)' },
        { value: 'keyboard', label: '키보드 고정' },
        { value: 'gamepad', label: '게임패드 고정' },
      ],
      hint: '아래 안내 줄의 글리프와 표의 "지금 장치" 열. 자동이면 마지막으로 누른 장치(가상 패드 포함)를 따라간다',
    },
    { key: 'showSaveJson', label: '저장 JSON 펼치기', type: 'toggle', default: true, hint: '오른쪽 아래 저장 데이터. 머리를 눌러 접고 펼 수도 있다 — 바뀐 칸만 담기는 것을 보며 키를 바꿔 본다' },
  ],
  presets: [
    {
      id: 'swap-confirm',
      name: 'PC 액션 — 맞바꾸기 확인',
      look: '5초 대기, 충돌하면 두 행동의 키를 맞바꿀지 묻는다. 저장 JSON 을 펼쳐 둔다',
      values: { timeoutMs: 5000, conflictPolicy: 'swap', inputDevice: 'auto', showSaveJson: true },
    },
    {
      id: 'console-unbind',
      name: '콘솔 — 다른 행 비우기',
      look: '게임패드 안내 고정, 충돌하면 원래 쓰던 행동을 비운다(⚠ 키 없음). 저장 데이터는 접어 둔다',
      values: { timeoutMs: 4000, conflictPolicy: 'unbind', inputDevice: 'gamepad', showSaveJson: false },
    },
    {
      id: 'strict-reject',
      name: '경쟁 게임 — 중복 거절',
      look: '3초 대기, 이미 쓰는 키는 거절하고 이유를 보이며 다시 기다린다. 키보드 안내 고정',
      values: { timeoutMs: 3000, conflictPolicy: 'reject', inputDevice: 'keyboard', showSaveJson: true },
    },
    {
      id: 'no-time-limit',
      name: '시간 제한 없음 (운동 접근성)',
      look: '대기가 저절로 끝나지 않는다 — 천천히 눌러도 된다. Esc · 패드 메뉴 버튼으로만 취소',
      values: { timeoutMs: 0, conflictPolicy: 'swap', inputDevice: 'auto', showSaveJson: true },
    },
  ],
  events: [
    { id: 'conflict', label: '점프에 이미 쓰는 E 누르기' },
    { id: 'escape', label: '대기 중 Esc 누르기' },
    { id: 'listen', label: '키 입력 대기 (아무것도 안 누름)' },
    { id: 'pad', label: '패드: 상호작용을 방향 패드 위로' },
    { id: 'reset', label: '전체 기본값 복원 (길게 누르기)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'listen',
      title: '대기에서 늘 빠져나올 수 있게',
      body: '칸을 고르면 **키 입력 대기**. 무엇을 기다리는지(행동 · 장치), **남은 시간**, 취소 방법(Esc · 패드 메뉴 버튼)을 함께 보인다. Esc 는 바인딩하지 않고 취소로만 쓰고, 대기를 시작한 Enter 는 **뗄 때까지 무시**한다. 시간이 지나면 그대로 둔다. 대기 시간 0 = 시간 제한 없음 — 천천히 누르는 사람에게 필요하다. 효과를 끄면 Esc 도 키로 들어가고 시간 제한도 없어 무언가 누르기 전에는 나갈 수 없다. XAG 107 은 PC 에서 Esc 까지 바꿀 수 있게 하라고 권한다 — 그렇게 하려면 시간 제한 · 화면의 취소 버튼처럼 Esc 가 아닌 탈출구를 따로 보장한다. 이 표본은 Esc 를 고정 보조 키로 남기는 쪽을 보여 준다.',
      principle: '접근성',
    },
    {
      n: 2,
      part: 'conflict',
      title: '충돌은 조용히 넘기지 않는다',
      body: '같은 열(키보드 · 패드)에 같은 입력이 있으면 바꾸기 전에 멈추고 **어느 행동이 그 키를 쓰는지**, 고르면 **무엇이 어떻게 바뀌는지**(상호작용 ← Space)를 버튼 글자로 말한다. 창이 뜬 뒤 0.3초는 확정을 막아(입력 잠금) 연타로 잘못 고르지 않게 한다. 효과를 끄면 경고 없이 한 키에 두 행동이 묶인다 — "시험해 보기" 에서 E 를 눌러 보면 점프와 상호작용이 함께 나간다.',
      principle: '인지 부하',
    },
    {
      n: 3,
      part: 'changed',
      title: '바뀐 칸 표시 · 행 하나 복원',
      body: '기본값과 다른 칸에 **‘바뀜’** 글자, 그 행에 **↺ 복원**. 복원한 키를 다른 행이 쓰고 있으면 그 행도 함께 기본값으로 되돌려 충돌이 남지 않게 한다. 전체 복원은 실수로 누르지 않게 **길게 눌러** 확인한다(Delete 길게). 효과를 끄면 표시 · 복원이 모두 없어 무엇을 바꿨는지 기억해야 한다.',
      principle: '어포던스',
      pin: 'right',
    },
    {
      n: 4,
      part: 'glyph',
      title: '안내는 바꾼 키와 장치를 따라간다',
      body: '아래 안내 줄은 고정 문구가 아니라 **지금 입력표**에서 글리프를 뽑는다. 마지막으로 누른 장치가 패드면 패드 글리프(위치로만 표기)로 바뀐다. Unity 에서는 `GetBindingDisplayString(index, out layout, out controlPath)` 의 controlPath 로 글리프를 고른다. 효과를 끄면 처음 키(E · Space)가 박혀 있어 바꾼 뒤에도, 패드를 잡아도 그대로다.',
      principle: '일관성',
      pin: 'left',
    },
    {
      n: 5,
      part: 'json',
      title: '바뀐 것만 저장한다',
      body: '`SaveBindingOverridesAsJson()` 은 기본값과 다른 바인딩만 action · id · path 로 담는다. 업데이트로 기본 키가 바뀌어도 사용자가 바꾼 칸만 덮어쓰고, 비운 칸은 path "" 로 남는다. 불러올 때 `LoadBindingOverridesFromJson()` 은 **id** 로 짝을 찾으므로 액션 에셋의 바인딩 id 를 함부로 다시 만들지 않는다.',
      principle: '가독성',
      pin: 'right',
    },
  ],
  mistakes: [
    { title: '충돌을 조용히 허용', body: '한 키에 두 행동이 묶여 E 를 누르면 점프하면서 상호작용한다. 같은 열에서 찾아 바꾸기 전에 물어본다.' },
    { title: '대기에서 나갈 수 없음', body: 'Esc 까지 키로 받아들이고 시간 제한도 없으면 무언가를 바인딩하기 전에는 빠져나올 수 없다. Esc(패드 메뉴 버튼)는 취소 전용으로 둔다.' },
    { title: '시작 키가 그대로 들어감', body: 'Enter 로 대기를 시작했는데 그 Enter 가 아직 눌린 채라 곧바로 새 키가 된다. 시작 키는 뗄 때까지 무시한다.' },
    { title: '복원 없음 · 표시 없음', body: '바꾼 칸이 표시되지 않고 기본값으로 돌릴 방법이 없으면 실험하기가 무섭다. 행 복원과 (길게 눌러 확인하는) 전체 복원을 둔다.' },
    { title: '안내 문구에 키 하드코딩', body: '"E 로 상호작용" 을 글자로 박아 두면 키를 바꾼 뒤에도 E 라고 말한다. 안내는 늘 지금 바인딩에서 읽는다.' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 이미 쓰는 키를 눌러도 경고 없이 묶여 한 키에 두 행동이 된다(시험해 보기에서 둘 다 나간다). 대기 중 Esc 도 키로 들어가고 시간 제한 · 남은 시간 표시가 없어 무언가 눌러야만 끝난다. Enter 로 대기를 시작하면 그 Enter 가 바로 새 키가 된다. 바뀐 칸 표시와 복원 버튼이 없다. 키보드 칸에 패드 버튼이, 패드 칸에 키가 그대로 들어간다. 아래 안내 줄은 처음 키가 박혀 있어 바꿔도, 패드를 잡아도 그대로다.',
  timings: [
    { event: '키 입력 대기 시간', ms: 5000, easing: '—', note: '권장값. 끄거나(0) 늘릴 수 있어야 한다 — 시간 제한 원칙' },
    { event: '충돌 창 입력 잠금', ms: 300, easing: '—', note: '권장값 (0.2~0.4초). 창이 뜬 직후의 연타가 확정되지 않게' },
    { event: '전체 복원 길게 누르기', ms: 1000, easing: 'linear', note: '권장값' },
    { event: 'Unity OnMatchWaitForAnother', ms: 100, easing: '—', note: '권장값. 후보를 잠깐 더 모아 더 나은 컨트롤(버튼 > 축)을 고른다' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Rebind (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ Header (TextMeshProUGUI 제목 · 장치)
│  └─ ResetAllButton (Image + HoldButton.cs · Fill Image(Filled) — 길게 누르기)
├─ Rows (VerticalLayoutGroup)
│  └─ RebindRow 프리팹 ×N (RebindRow.cs — 행동 하나 · 키보드 칸 + 패드 칸)
│     ├─ Label (TextMeshProUGUI)
│     ├─ KeyboardButton (Button > Glyph Image · TextMeshProUGUI · ChangedMark '바뀜' · ListeningMark · TimeFill Image(Filled))
│     ├─ GamepadButton (같은 구성 — 바인딩이 없으면 '고정' 으로 잠긴다)
│     └─ ResetButton (Button ↺)
├─ FixedRow (메뉴 열기 · 대기 취소 — Esc · 패드 메뉴 버튼, 버튼 없음)
├─ StatusPanel (TextMeshProUGUI 제목 · 남은 시간 · 알림 + TimeFill Image(Filled))
├─ ConflictPanel (ConflictPanel.cs · TextMeshProUGUI · AcceptButton · CancelButton)
├─ TestText (TextMeshProUGUI — 시험해 보기: 누른 입력 → 행동)
├─ PromptBar (BindingPromptBar.cs > 안내 칸 ×4: Image · TextMeshProUGUI 키 · 이름)
├─ JsonText (TextMeshProUGUI — 저장 JSON 미리보기)
├─ RebindMenu (RebindMenu.cs — 대기 · 충돌 · 저장을 묶는다)
└─ RebindDemo (RebindDemo.cs — 시험용: 액션 에셋을 코드로 만들고 누른 행동을 띄운다)
GlyphTable 에셋 (GlyphTable.cs — controlPath → Sprite)
RebindService.cs · RebindActions.cs (UI 없는 C# — UI Toolkit 판도 같이 쓴다)`,
      steps: [
        '액션 에셋: 프로젝트 기본 `InputSystem_Actions` 를 쓰려면 RebindMenu 의 `actions` 에 끌어 놓고 행마다 `Player/Jump` · `Player/Move` + 부분 이름 `up` 처럼 적는다(그 에셋도 그룹이 `Keyboard&Mouse` · `Gamepad`). 비워 두면 `RebindDemo` 가 `RebindActions.CreateDefault()` 로 코드에서 만든다 — 바인딩 id 를 고정해 두어야 저장한 JSON 을 다음 실행에서 불러올 수 있다.',
        '칸을 누르면 `RebindMenu` 가 Submit 키(Enter · 패드 아래)를 **뗄 때까지** 기다린 뒤 `RebindService.Start(action, bindingIndex)` — 액션 맵을 **Disable** 하고(켜진 액션은 바꿀 수 없다) `PerformInteractiveRebinding(index)` 을 시작한다. `WithControlsHavingToMatchPath("<Keyboard>")` · `("<Mouse>")` 또는 `("<Gamepad>")` 로 열을 거르고(키보드 칸에도 `("<Gamepad>/start")` 를 더해 패드 메뉴 버튼으로 취소할 수 있게), `WithCancelingThrough("<Keyboard>/escape")` · `WithTimeout(timeoutSeconds)` · `OnMatchWaitForAnother(0.1f)`. Input System 도 시작할 때 이미 눌려 있던 컨트롤은 후보로 잡지 않지만, 뗄 때까지 기다리면 키 반복 · 다시 누름까지 깔끔하다.',
        '`OnApplyBinding((op, path) => …)` 을 주면 덮어쓰기를 직접 한다. 같은 그룹의 다른 바인딩 중 `effectivePath` 가 같은 것이 있으면 적용하지 않고 `ConflictPanel` 을 띄운다 — 맞바꾸기는 두 바인딩에 `ApplyBindingOverride(index, path)` 를 서로 엇갈려 부른다. 비우기는 상대에 `""`.',
        '패드 메뉴 버튼은 두 번째 취소 경로라 `OnPotentialMatch` 에서 `op.selectedControl` 이 `<Gamepad>/start` 면 `op.Cancel()`. 운영체제 키는 `WithControlsExcluding` 으로 아예 후보에서 뺀다.',
        '바뀔 때마다 `actions.SaveBindingOverridesAsJson()` 을 `PlayerPrefs` 에 저장하고, 시작할 때 `LoadBindingOverridesFromJson()`. 행 복원은 `RemoveBindingOverride(index)`, 전체 복원은 `RemoveAllBindingOverrides()` 후 저장 키를 지운다.',
        '`BindingPromptBar` 는 `InputSystem.onAnyButtonPress` 로 마지막 장치를 알아내고, `InputSystem.onActionChange` 의 `BoundControlsChanged` 마다 `GetBindingDisplayString(index, out layout, out controlPath)` 로 글리프를 다시 고른다.',
      ],
      pitfalls: [
        '`PerformInteractiveRebinding` 은 켜진 액션에서 예외(InvalidOperationException)를 낸다. Disable → 바꾸기 → Enable, 끝나면 `operation.Dispose()` (안 하면 메모리가 샌다).',
        '고른 입력은 기본값(`WithMatchingEventsBeingSuppressed`)으로 UI 에 새지 않지만, 거른 입력은 그대로 간다 — 패드 칸을 기다리는 동안 누른 키보드 Enter · 방향키(또는 그 반대)가 UI 버튼을 눌러 대기가 또 시작된다. 대기 동안 `EventSystem.sendNavigationEvents = false`, 끝나면(그리고 `OnDisable` 에서도) 다시 켠다.',
        '`WithCancelingThrough` 는 한 경로만 기억한다(두 번 부르면 덮어씀). 패드 메뉴 버튼 취소는 `OnPotentialMatch` 에서 처리하는데, 거르기 경로 검사가 먼저라 키보드 칸에서도 `<Gamepad>/start` 를 거르기 경로에 넣어 둬야 그 콜백까지 온다. 시간 제한 0 이면 이것이 패드 사용자의 유일한 탈출구다.',
        '`OnPotentialMatch` 를 주면 완료를 그 콜백에 맡긴 것이 된다 — 지금은 `OnMatchWaitForAnother(0.1f)` 의 기다림이 끝나며 완료된다. 그 줄을 지우면 영원히 끝나지 않는다(콜백에서 직접 `op.Complete()` 를 부르거나 기다림을 남긴다).',
        '충돌 검사는 같은 경로만 본다. `<Gamepad>/leftStick` 과 `<Gamepad>/leftStick/up` 처럼 겹치는 경로는 놓친다 — 스틱 · 합성을 바꾸게 하려면 `InputControlPath.Matches` 등으로 포함 관계까지 본다.',
        '오브젝트가 대기 중에 꺼지거나 파괴되면 액션 맵이 꺼진 채 남는다. `OnDisable` 에서 코루틴을 멈추고 `Cancel()`, 서비스 `Dispose()` 도 먼저 `Cancel()`.',
        '안내 문구에 "E" 를 글자로 넣지 말고 `GetBindingDisplayString` 으로 읽는다. 키보드 배열이 다르면(AZERTY) 같은 자리의 키 이름도 다르다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ RebindMenu.uxml
   └─ #menu (.menu)
      ├─ .head (제목 · #device · #reset-all .hold > #reset-fill — 길게 누르기)
      ├─ .body
      │  ├─ .table (.table__head > #th-kb · #th-pad) · #rows (C# 가 RebindRow.uxml 을 행마다 복제) · .row--fixed 고정 행
      │  └─ .side
      │     ├─ #listen (.panel > #listen-title · .time > #listen-time · .time__track > #time-bar · #note)
      │     ├─ #conflict (.panel.conflict > #conflict-text · Button #accept · Button #cancel)
      │     └─ Foldout #json (TextField #json-text — C# 에서 읽기 전용 · 여러 줄)
      └─ #prompts (.prompts — C# 가 안내 칸을 만든다)
RebindRow.uxml (#row .row > #label · Button #kb .slot · Button #pad .slot · Button #reset — 칸 안 글리프 · 바뀜 · 시간 막대는 C# 가 더한다)
RebindMenuUITK.cs (RebindService · RebindActions · GlyphTable 은 UGUI 폴더 것을 쓴다)`,
      steps: [
        '행은 `RebindRow.uxml` 을 `Instantiate()` 해서 `#rows` 에 넣고, 칸 Button 의 `clicked` 에서 `service.Start(...)`. 로직(대기 · 충돌 · 저장)은 UGUI 판과 같은 `RebindService` 가 맡고 UXML 은 표시만 한다.',
        '대기 중인 칸은 `AddToClassList("slot--listening")`, 바뀐 칸은 `slot--changed` — 모양은 USS 에서. 남은 시간 막대는 매 프레임 `style.scale` 만 바꾼다.',
        '저장 JSON 은 `Foldout` 안의 읽기 전용 `TextField` (`isReadOnly = true`, `multiline = true`) — 접어 두면 화면을 차지하지 않는다.',
        '전체 복원은 `PointerDownEvent` 에서 누르기 시작, `PointerUpEvent` · `PointerLeaveEvent` 에서 취소, 1초를 채우면 복원. 버튼의 `clicked` 를 쓰면 길게 누르기를 만들 수 없다.',
      ],
      pitfalls: [
        'UI Toolkit 의 Button 도 대기 중에 Submit(Enter)을 받는다. 대기 동안 `rootVisualElement.SetEnabled(false)` 로 막거나 포커스를 빼 둔다.',
        '칸 글자에 `GetBindingDisplayString()` 을 그대로 넣으면 패드는 영어 이름이 나온다. `out controlPath` 로 글리프 · 한국어 이름을 직접 고른다.',
        'UXML 주석 안에 하이픈 두 개를 쓰면 임포트가 깨진다. BEM 수식 클래스 이름은 USS 쪽에만 적는다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Celeste (2018)',
      credit: '© Maddy Makes Games Inc.',
      borrowed: ['전체 복원은 길게 눌러 확인'],
      learned: 'v1.4 업데이트 기록에 메뉴 입력까지 포함한 세밀한 재설정과, "모든 조작을 기본값으로" 를 길게 눌러 확인하도록 바꾼 내용이 있다. 마지막 장치에 맞춰 키보드 아이콘을 쓰는 수정도 적혀 있다. 메뉴 화면의 모양은 직접 확인하지 못했다(미확인).',
      link: 'https://maddymakesgamesinc.itch.io/celeste/devlog/237097/v1400-changelog',
    },
    {
      title: 'The Last of Us Part II (2020)',
      credit: '© Sony Interactive Entertainment · Naughty Dog',
      borrowed: [],
      learned: '공식 접근성 안내에 따르면 모든 명령을 다른 입력으로 재설정할 수 있고, 한 손 조작용 배치와 이름을 바꿀 수 있는 사용자 배치 슬롯을 둔다. 재설정 화면의 시각 모양은 확인하지 못했다(미확인) — 장르 관례로만 다뤘다.',
      link: 'https://www.playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/',
    },
  ],
  original:
    '행동 목록과 외곽 탐사대 문구, 표 배치, 충돌 창 문구와 세 가지 처리, 고정 행, 가상 패드, 시험해 보기, 저장 JSON 미리보기, 나쁜 예 재현은 이 갤러리에서 새로 만들었다. 패드 버튼은 특정 콘솔의 기호 대신 위치(아래 · 오른쪽 …)로만 그린다.',
  references: [
    { label: 'Input System 1.8 — InputActionRebindingExtensions (PerformInteractiveRebinding · Save/LoadBindingOverridesAsJson · GetBindingDisplayString)', url: 'https://docs.unity.cn/Packages/com.unity.inputsystem@1.8/api/UnityEngine.InputSystem.InputActionRebindingExtensions.html' },
    { label: 'Input System 1.19 — RebindingOperation (WithTimeout · OnApplyBinding · WithCancelingThrough)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.19/api/UnityEngine.InputSystem.InputActionRebindingExtensions.RebindingOperation.html' },
    { label: 'Xbox Accessibility Guidelines — 목록', url: 'https://learn.microsoft.com/en-us/gaming/accessibility/guidelines' },
    { label: 'XAG 107 — 입력 (모든 조작 재설정 · 바꾼 키가 안내에 반영)', url: 'https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107' },
    { label: 'Celeste v1.4.0.0 업데이트 기록', url: 'https://maddymakesgamesinc.itch.io/celeste/devlog/237097/v1400-changelog' },
    { label: 'The Last of Us Part II — 접근성 기능 안내', url: 'https://www.playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/' },
  ],
  related: [
    { id: 'settings-accessibility', why: '같은 설정 메뉴의 다른 탭 — 글자 크기 · 색각 · 모션. 조작 탭의 깊은 판이 이 표본' },
    { id: 'skill-cooldown-prompt', why: '바꾼 키가 실제 HUD 의 버튼 안내에 어떻게 나타나는지' },
    { id: 'main-pause-menu', why: '이 화면으로 들어오는 메뉴 · Esc 와 뒤로가기의 일관성' },
  ],
}
