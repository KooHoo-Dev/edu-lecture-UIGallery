import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'directional-combo-input',
  title: '방향 커맨드 입력 HUD',
  titleEn: 'Directional Combo Input HUD',
  group: 'G',
  order: 6,
  paradigms: ['non-diegetic'],
  oneLiner: '키를 누르고 있는 동안 커맨드 목록이 열리고, 방향 시퀀스를 넣을수록 접두사가 맞는 후보만 남으며 맞은 화살표가 하나씩 켜진다',
  goals: [
    '입력 버퍼와 **접두사 매칭**으로 남은 후보를 거르고, 맞은 칸 · 다음 칸 · 틀린 칸을 즉시 보여 줄 수 있다',
    '다른 커맨드의 **앞부분인 커맨드**를 완성 즉시 발동할지, 짧게 기다릴지 정하고 그 결과(가려지는 커맨드)를 설명할 수 있다',
    '커맨드 정의(이름 · 시퀀스 · 재사용 대기)를 **데이터로 분리**해 UGUI · UI Toolkit 이 같은 판정 클래스를 쓰게 할 수 있다',
    '누르고 있기 / 토글, 입력 제한 시간 늘리기 · 끄기, 틀린 칸만 다시 받기를 **운동 접근성** 설정으로 둘 수 있다',
  ],
  principles: ['즉각 피드백', '인지 부하', '일관성', '접근성', '가독성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'gamepad', 'touch', 'mouse'],
  genres: ['협동 슈터', '액션', '격투', '공통'],
  tags: ['accessibility'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    {
      key: 'openMode',
      label: '여는 방식',
      type: 'select',
      default: 'hold',
      options: [
        { value: 'hold', label: '누르고 있기 (떼면 닫힘)' },
        { value: 'toggle', label: '눌러서 켜기 · 끄기 (토글)' },
      ],
      hint: 'Q · 터치를 계속 누른 채 방향까지 넣기 어려운 플레이어를 위한 운동 접근성 설정. 토글이면 한 번 눌러 열고, 방향을 넣은 뒤 다시 눌러(터치는 톡) 닫는다',
    },
    {
      key: 'stepTimeoutMs',
      label: '입력 사이 제한 시간',
      type: 'range',
      min: 0,
      max: 4000,
      step: 250,
      default: 1500,
      unit: 'ms',
      hint: '다음 방향을 이 시간 안에 넣지 않으면 처음부터. 0 이면 끈다(제한 없음). 빠른 손을 요구하는 설계일수록 늘리거나 끌 수 있어야 한다 — 막대가 줄어드는 것을 보자',
    },
    {
      key: 'errorMode',
      label: '틀렸을 때',
      type: 'select',
      default: 'reset',
      options: [
        { value: 'reset', label: '흔들고 처음부터' },
        { value: 'retry', label: '그 칸만 다시 (관대한 모드)' },
      ],
      hint: '관대한 모드는 틀린 입력을 버리고 맞게 넣은 칸은 그대로 둔다. 손 떨림 · 한 손 조작 플레이어에게 처음부터는 큰 벌이다',
    },
    {
      key: 'prefixWaitMs',
      label: '접두사 커맨드 기다림',
      type: 'range',
      min: 0,
      max: 1000,
      step: 50,
      default: 450,
      unit: 'ms',
      hint: '정찰 드론(← ↑ →)은 정찰 드론 편대(← ↑ → ↑ ↓)의 앞부분이다. 0 이면 완성 즉시 발동해 편대에 닿을 수 없다(가려짐). 기다리는 동안 다음 칸을 넣으면 긴 쪽으로 이어 간다',
    },
    {
      key: 'mismatchStyle',
      label: '맞지 않는 후보',
      type: 'select',
      default: 'dim',
      options: [
        { value: 'dim', label: '흐리게 (자리 유지)' },
        { value: 'hide', label: '숨기고 남은 후보를 위로' },
      ],
      hint: '흐리게는 목록 자리가 그대로라 손에 익은 위치를 지킨다. 숨기기는 남은 후보가 위로 모여 읽기 쉽지만 줄 위치가 입력마다 바뀐다',
    },
  ],
  presets: [
    {
      id: 'coop-shooter',
      name: '협동 슈터 기본',
      look: '누르고 있기, 1.5초 제한, 틀리면 처음부터. 접두사 커맨드는 잠깐 기다린다',
      values: { openMode: 'hold', stepTimeoutMs: 1500, errorMode: 'reset', prefixWaitMs: 450, mismatchStyle: 'dim' },
    },
    {
      id: 'motor-accessible',
      name: '운동 접근성',
      look: '토글로 열고, 제한 시간 없음, 틀린 칸만 다시. 남은 후보만 위로 모은다',
      values: { openMode: 'toggle', stepTimeoutMs: 0, errorMode: 'retry', prefixWaitMs: 600, mismatchStyle: 'hide' },
    },
    {
      id: 'arcade-strict',
      name: '아케이드 커맨드',
      look: '0.75초 제한, 완성 즉시 발동 — 편대 커맨드가 가려지는 문제를 보자',
      values: { openMode: 'hold', stepTimeoutMs: 750, errorMode: 'reset', prefixWaitMs: 0, mismatchStyle: 'dim' },
    },
  ],
  events: [
    { id: 'demo', label: '시연: 발동 · 틀림 · 접두사' },
    { id: 'open', label: '목록 열기 / 닫기' },
    { id: 'wrong', label: '틀린 방향 넣기 (↑ ← →)' },
    { id: 'ambiguous', label: '접두사 겹침 (← ↑ →)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'row',
      title: '맞은 화살표가 하나씩 켜진다',
      body: '넣은 칸은 **채워지고**, 다음에 넣을 칸은 **두꺼운 금색 테두리**다. 색만이 아니라 채움 · 테두리 모양으로도 구분해, 목록을 흘끗 봐도 "어디까지 넣었고 다음은 무엇인지" 가 보인다. 효과를 끄면 아무 칸도 켜지지 않아 몇 번째인지 셀 수밖에 없다.',
      principle: '즉각 피드백',
    },
    {
      n: 2,
      part: 'count',
      title: '접두사가 맞는 후보만 남는다',
      body: '버퍼(지금까지 넣은 방향)가 시퀀스의 **앞부분과 같은** 커맨드만 후보다. 단순 필터로 충분하다 — 커맨드가 수백 개가 아니면 트라이는 필요 없다. 남은 수를 숫자로도 보여 주고, 맞지 않는 줄은 흐리게 하거나 숨긴다. 재사용 대기 중인 커맨드는 후보에서 뺀다.',
      principle: '인지 부하',
      pin: 'left',
    },
    {
      n: 3,
      part: 'prefix',
      title: '다른 커맨드의 앞부분인 커맨드',
      body: '← ↑ → 를 넣으면 정찰 드론은 완성이지만 편대(← ↑ → ↑ ↓)의 앞부분이기도 하다. **완성 즉시 발동**하면 편대는 영영 닿을 수 없다(가려짐). **짧게 기다리면** 그사이 이어 넣을 수 있고, 다른 방향이 오면 정찰 드론을 발동한 뒤 그 방향을 새 시퀀스의 첫 칸으로 쓴다. 가장 좋은 해법은 처음부터 접두사가 겹치지 않게 시퀀스를 짓는 것.',
      principle: '일관성',
      pin: 'right',
    },
    {
      n: 4,
      part: 'timer',
      title: '입력 사이 제한 시간',
      body: '다음 방향을 넣을 때까지 막대가 줄고, 다 줄면 처음부터다. 긴장을 만드는 장치지만 손이 느린 플레이어에게는 벽이다. **늘리거나 끌 수 있어야** 하고(접근성 표본의 "시간 제한"), 관대한 모드에서는 틀려도 막대를 다시 채운다.',
      principle: '접근성',
      pin: 'below',
    },
    {
      n: 5,
      part: 'buffer',
      title: '틀리면 그 칸에서 흔들린다',
      body: '틀린 방향은 **몇 번째 칸**에 빨간 화살표로 잠깐 남고 띠가 흔들린 뒤 처음부터(또는 그 칸만 다시). 효과를 끄면 틀려도 아무 일이 없고 입력이 점으로 계속 쌓인다 — 버퍼 끝부분만 보는 흔한 구현이라 엉뚱한 때에 커맨드가 튀어나온다.',
      principle: '가독성',
    },
  ],
  mistakes: [
    {
      title: '어디까지 넣었는지 안 보임',
      body: '맞은 칸을 켜지 않으면 플레이어는 손가락으로 센다. 칸마다 채움 · 다음 칸 테두리를 두고, 넣은 방향을 따로 큰 띠로도 보여 준다.',
    },
    {
      title: '틀려도 조용히 쌓이는 버퍼',
      body: '입력을 끝없이 모아 두고 "끝부분이 시퀀스와 같으면 발동" 하면 틀렸다는 신호가 없고, 앞에서 틀린 입력과 우연히 이어져 다른 커맨드가 나간다. 틀린 순간 버퍼를 비우거나(또는 그 칸만 다시) 흔들어 알린다.',
    },
    {
      title: '접두사 커맨드를 완성 즉시 발동',
      body: '짧은 커맨드가 긴 커맨드의 앞부분이면 긴 쪽은 쓸 수 없다. 데이터를 넣을 때 접두사 겹침을 검사하고, 겹쳐야 한다면 짧게 기다린다.',
    },
    {
      title: '방향 입력이 캐릭터도 움직임',
      body: 'WASD · 왼쪽 스틱을 방향 입력과 이동에 함께 쓰면 커맨드를 넣는 동안 캐릭터가 걸어간다. 목록이 열린 동안 이동 액션을 끄거나 액션맵을 바꾼다 — 일부러 움직이게 두는 설계라면 방향 입력을 십자키 · 방향키로만 받는다.',
    },
    {
      title: '누르고 있기 · 짧은 제한 시간만',
      body: '한 손으로 키를 누른 채 다른 손으로 빠르게 넣어야만 하는 설계는 운동 장애가 있는 플레이어를 막는다. 토글 · 제한 시간 끄기 · 관대한 모드를 설정으로 둔다.',
    },
  ],
  juiceOff:
    '흔한 구현을 그대로 재현한다. 입력을 끝없이 쌓아 두고 끝부분이 어떤 시퀀스와 같으면 발동한다. 맞은 화살표가 켜지지 않고 후보도 줄지 않아 어디까지 넣었는지 모르고, 틀려도 흔들림 · 알림 없이 점만 늘어난다. 제한 시간도 없고, 정찰 드론이 먼저 걸려 편대에는 닿을 수 없다. 발동 연출(펄스 · 고리)도 없다.',
  timings: [
    { event: '목록 열기 (밀려 들어오기 + 페이드)', ms: 140, easing: 'ease-out', note: '권장값. 누르는 즉시 방향을 넣을 수 있어야 하므로 짧게' },
    { event: '틀림 흔들림', ms: 360, easing: 'ease-out', note: '권장값. 좌우 18px → 0 감쇠' },
    { event: '접두사 커맨드 기다림', ms: 450, easing: 'linear', note: '권장값. 입력 간격(보통 150~300ms)보다 길고, 기다림이 느껴지지 않을 만큼 짧게' },
    { event: '입력 사이 제한 시간', ms: 1500, easing: 'linear', note: '권장값. 끌 수 있게' },
    { event: '발동 펄스 (배너 튐 · 고리 퍼짐)', ms: 650, easing: 'ease-out' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Combo (Screen Space - Overlay · Canvas Scaler 1920×1080)
└─ ComboHud (ComboHud.cs · ComboInput.cs — 열기 · 방향 · 취소 액션, 열린 동안 이동 액션 끄기)
   ├─ OpenGroup (CanvasGroup — 열린 동안만 alpha 1 · Blocks Raycasts 끔)
   │  ├─ Panel (Image 바탕)
   │  │  ├─ Head — Title (TextMeshProUGUI "지원 요청") · CountText (TextMeshProUGUI "남은 후보 2 / 7")
   │  │  ├─ List (VerticalLayoutGroup — ComboHud 가 ComboRow 프리팹으로 채운다)
   │  │  └─ AccessText (TextMeshProUGUI — 지금 접근성 설정 요약)
   │  └─ Strip (RectTransform — 틀리면 흔든다)
   │     ├─ Slots > Slot ×5 (Image 칸 + 자식 Glyph Image)
   │     └─ Timer — Track (Image) > Fill (Image Filled Horizontal) · TimerText (TextMeshProUGUI)
   ├─ Banner (CanvasGroup) > BannerText (TextMeshProUGUI "발동 · 보급 투하")
   └─ NoteText (TextMeshProUGUI)
ComboRow 프리팹 (ComboRow.cs · Image 바탕 · CanvasGroup)
   ├─ Icon (Image) · NameText (TextMeshProUGUI) · StatusText (TextMeshProUGUI)
   ├─ Arrows (HorizontalLayoutGroup) > Arrow ×5 (Image 칸 + 자식 Glyph Image — 위쪽 화살표 스프라이트 하나를 Z 회전)
   └─ CooldownFill · WaitFill (Image Type Filled · Horizontal)
ComboCommandSet 에셋 (Create ▸ UI Gallery ▸ Combo Command Set — 커맨드 이름 · 시퀀스 · 재사용 대기)
ComboMatcher.cs (순수 C# — 버퍼 · 접두사 매칭 · 기다림 · 제한 시간 + DirectionQuantizer)
Input Actions 에셋:
   Combo/Open      = <Keyboard>/q · <Gamepad>/leftShoulder (Button, Interactions 없음)
   Combo/Direction = 2D Vector 합성(WASD · 방향키, Mode Digital Normalized) · <Gamepad>/dpad · <Gamepad>/leftStick (Vector2)
   Combo/Cancel    = <Keyboard>/escape · <Gamepad>/buttonEast (Button)
   Gameplay/Move   = 같은 WASD · 왼쪽 스틱 (열린 동안 ComboInput 이 끈다)`,
      steps: [
        '`ComboCommandSet`(ScriptableObject)에 커맨드를 데이터로 적는다: 이름 · 설명 · 시퀀스(`ComboDir[]`) · 재사용 대기. 에셋을 만들면 `Reset()` 이 예제 일곱 개를 채우고, `OnValidate` 가 **다른 커맨드의 앞부분인 커맨드**를 콘솔에 경고한다.',
        '`ComboInput` 은 열기 액션을 매 프레임 `WasPressedThisFrame` · `WasReleasedThisFrame` 으로 읽는다. 누르고 있기면 눌림에 열고 뗌에 닫고, 토글이면 눌림마다 번갈아. 열면 `Direction` 액션을 켜고 이동 액션을 끄며(`blockMovement`), `EventSystem.sendNavigationEvents` 를 꺼 방향키가 UI 선택을 움직이지 않게 한다. 닫을 때 모두 되돌린다.',
        '방향은 Vector2 하나로 받아 `DirectionQuantizer.Feed` 로 4방향 하나로 바꾼다: 세기가 기준(0.5) 아래면 중립(다시 받을 준비), 한 축이 뚜렷하면 그 방향, 대각선이면 **새로 더해진 축**을 고른다(↓ 를 누른 채 → 를 누르는 키보드 겹침). 대각선에서 한 축으로 돌아오는 것은 새 입력이 아니다 — 한 번 누르면 한 칸.',
        '`ComboHud` 는 방향마다 `matcher.Push(dir, Time.time)` 결과(진행 · 기다림 · 발동 · 틀림 · 재사용 대기)로 칸 · 후보 수 · 알림을 고치고, `Update` 에서 `matcher.Tick` 으로 기다림 끝 발동 · 제한 시간 초과를 처리한다. 틀림 흔들림은 코루틴 하나로, 새로 시작하기 전에 이전 것을 멈춘다.',
      ],
      pitfalls: [
        '열기 액션에 **Hold 상호작용**을 넣으면 `performed` 가 누른 지 0.4초 뒤에야 와서 "누르는 즉시 열림" 이 안 된다. 상호작용 없는 Button 의 눌림 · 뗌을 읽고, 토글은 코드로 처리한다(또는 Press 상호작용 Press And Release).',
        '이동 액션이 든 **액션맵 전체**를 끄면 그 맵에 열기 버튼도 있을 때 뗌을 못 받아 목록이 닫히지 않는다. 이동 액션만 끄거나, 열기 액션을 두 맵 모두에 둔다. 끈 액션은 원래 켜져 있었을 때만 다시 켠다.',
        '`OnDisable` 에서 흔들림 코루틴을 멈추고 띠 위치 · 열린 목록 · 꺼 둔 이동 액션 · UI 탐색을 되돌린다. 꺼진 동안에는 코루틴을 새로 시작하지 않는다(`isActiveAndEnabled`). 창 포커스를 잃으면(`OnApplicationFocus(false)`) 뗌이 안 와서 누르고 있기 목록이 열린 채 남으니 닫는다.',
        '남은 시간 표기는 `ToString("0.0", CultureInfo.InvariantCulture)` — 문화권에 따라 소수점이 쉼표가 된다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ ComboHud.uxml (모든 요소 picking-mode Ignore — 화면을 막지 않는 HUD)
   ├─ #panel (.panel — 열리면 수식 클래스 open, 닫힘이 끝나면 visibility Hidden)
   │  ├─ .panel__head > Label .panel__title · Label #count
   │  ├─ #list (C# 가 줄을 만든다: .row > .row__name · .row__arrows(ArrowElement ×n) · .row__status · .row__wait)
   │  └─ Label #access
   ├─ #strip (.strip) > #slots (ArrowElement ×5) · .timer > .timer__track > #timer-fill · Label #timer-text
   ├─ #banner (.banner — 발동하면 수식 클래스 on) > Label #banner-text
   └─ Label #note
ComboHudUITK.cs (ComboInput · ComboMatcher · ComboCommandSet 은 UGUI 폴더 것을 그대로 쓴다. ArrowElement 는 Painter2D 로 화살표를 그린다)`,
      steps: [
        'UGUI 판의 `ComboInput` 을 같은 오브젝트에 두고, 이벤트(`Opened` · `Closed` · `Direction`)만 구독한다. 판정은 같은 `ComboMatcher` — 화면 기술이 달라도 규칙이 한곳에 있다.',
        '화살표는 비트맵 없이 `ArrowElement`(`generateVisualContent` + `Painter2D`)로 그린다. 방향 · 상태(켜짐 · 다음 · 틀림)가 바뀌면 `MarkDirtyRepaint()`.',
        '목록 열기는 `.panel` 에 수식 클래스 open 을 붙여 USS transition(opacity · translate)으로. 닫을 때는 클래스를 떼고 150ms 뒤 `visibility = Hidden`.',
        '흔들림은 `Update` 에서 `strip.style.translate` 를 감쇠 사인으로 — 코루틴이 없어 끌 때 멈출 것이 없다. 남은 시간 막대는 `#timer-fill` 의 `style.width = Length.Percent(…)`(트랙에 padding · border 를 두지 않는다).',
      ],
      pitfalls: [
        '`pickingMode` 는 자식에게 상속되지 않는다. C# 로 만든 줄 · 화살표도 하나하나 `PickingMode.Ignore` 로 둔다 — 아니면 opacity 0 인 닫힌 목록이 아래 화면의 클릭을 막는다.',
        '`#panel` 에 Button 같은 포커스 요소를 넣으면 방향키가 UI 탐색(`NavigationMoveEvent`)으로도 가서 포커스가 움직인다. 이 HUD 는 포커스 요소가 없고, `ComboInput` 이 열린 동안 `EventSystem.sendNavigationEvents` 를 끈다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Helldivers 2 (2024)',
      credit: '© Sony Interactive Entertainment · Arrowhead Game Studios',
      borrowed: ['버튼을 누르고 있는 동안 방향 시퀀스를 넣어 지원을 부르는 조작 방식'],
      learned:
        '후보 카드의 출처(커맨드 코드 목록 글, Steam 토론의 누르고 있기 · 토글 요구, 팬 제작 메뉴 개발 글)로 확인한 것은 "누르고 있는 동안 방향 시퀀스를 넣는다" 는 조작 방식과 그에 대한 운동 접근성 논쟁까지다. 목록 배치 · 화살표 모양 · 색 · 발동 연출 같은 화면 세부는 확인하지 못했다(미확인) — 이 표본의 화면은 모두 새로 그렸다. 커맨드 이름과 방향 코드도 원작 것을 쓰지 않았다.',
      link: 'https://www.shacknews.com/article/138705/all-stratagems-codes-helldivers-2',
    },
  ],
  original:
    '외곽 탐사대의 지원 요청 일곱 가지(정찰 드론 · 편대 · 보급 투하 · 냉각 셀 지원 · 수리 키트 투하 · 방어막 발생기 · 통신 중계기)와 그 시퀀스 · 재사용 대기, 아이콘, 목록 · 넣은 방향 띠 · 제한 시간 막대 디자인, 접두사 기다림 게이지 · "가려짐" 표시, 관대한 모드, 나쁜 예(끝부분 매칭) 재현은 모두 이 갤러리에서 새로 만들었다.',
  references: [
    { label: 'Shacknews — Helldivers 2 커맨드 코드 목록 (출처 · 화면 미확인)', url: 'https://www.shacknews.com/article/138705/all-stratagems-codes-helldivers-2' },
    { label: 'Steam 토론 — 누르고 있기 · 토글 요구 (출처)', url: 'https://steamcommunity.com/app/553850/discussions/0/4295944344104408657' },
    { label: 'itch.io 개발 글 — 대화형 커맨드 팝업 메뉴 (출처)', url: 'https://boardgamers2409.itch.io/plague-wardens/devlog/805643/interactive-stratagem-popout-menu-ryan-brown' },
    { label: 'Game Accessibility Guidelines — 누르고 있기 대신 토글 · 시간 제한 조절', url: 'https://gameaccessibilityguidelines.com/full-list/' },
    { label: 'Unity Input System — Interactions (Hold · Press)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/Interactions.html' },
    { label: 'Unity Input System — Action Maps / Composite (2D Vector)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/ActionBindings.html' },
  ],
  related: [
    { id: 'radial-quick-select', why: '같은 "누르고 있는 동안 열리는 입력 UI" — 그쪽은 방향 하나로 고르고, 이쪽은 방향 여러 개를 이어 넣는다' },
    { id: 'input-rebinding', why: '여는 키 · 방향 키를 바꾸는 화면 — 커맨드 입력을 리매핑할 수 있게' },
    { id: 'rhythm-timing-feedback', why: '같은 "관대한 판정" 접근성 — 박자를 놓쳐도 실패시키지 않는 쪽' },
    { id: 'settings-accessibility', why: '시간 제한 늘리기 · 끄기, 누르고 있기 대신 토글을 설정 화면에서 묶어 보여 주는 곳' },
  ],
}
