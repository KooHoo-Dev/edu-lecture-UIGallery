import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'loading-screen',
  title: '로딩 화면 · 진행률',
  titleEn: 'Loading Screen & Progress',
  group: 'D',
  order: 5,
  paradigms: ['menu'],
  oneLiner: '실제 진행률은 계단식으로 오르다 0.9 에서 멈춘다. 화면에 보이는 값은 늘리고 보간하고 최소 시간을 지켜, 멈춘 것 같지 않게 끝까지 채운다',
  goals: [
    '`SceneManager.LoadSceneAsync` 에 `allowSceneActivation = false` 를 주면 **progress 가 0.9 에서 멈추는 이유**를 설명하고, `progress / 0.9` 로 0~1 을 만들 수 있다',
    '표시 진행률을 `Mathf.MoveTowards` 로 보간하고 **최소 노출 시간**으로 위를 막아, 계단 · 번쩍임 없이 채울 수 있다',
    '기다리는 길이에 따라 **스피너 / 퍼센트 바 / 단계 문구**를 고르고, 실제 값이 멈춘 동안에도 화면이 살아 있게 할 수 있다',
    '팁을 **읽을 수 있는 간격**으로 돌리고 손으로 넘기게 하며, 준비 완료 뒤 **아무 키나 눌러 계속**을 입력 잠금과 함께 만들 수 있다',
  ],
  principles: ['즉각 피드백', '일관성', '인지 부하', '가독성', '어포던스'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'mouse', 'gamepad', 'touch'],
  genres: ['오픈 월드', '액션', 'RPG', '모바일'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    {
      key: 'smoothSpeed',
      label: '표시 보간 속도',
      type: 'range',
      min: 10,
      max: 200,
      step: 5,
      default: 60,
      unit: '%/초',
      hint: '화면 진행률이 실제 값(0.9 로 나눈 값)을 따라가는 최대 속도 — Mathf.MoveTowards 의 maxDelta. 작으면 그래프의 청록 선이 한참 뒤처지고, 200 이면 계단이 그대로 보인다',
    },
    {
      key: 'minShowMs',
      label: '최소 노출 시간',
      type: 'range',
      min: 0,
      max: 5000,
      step: 250,
      default: 2500,
      unit: 'ms',
      hint: '로딩이 빨라도 이 시간 동안은 바가 천천히 차오른다(그래프의 점선). 0 이면 빠른 로딩에서 화면이 번쩍 지나가 팁을 못 읽는다',
    },
    {
      key: 'tipIntervalMs',
      label: '팁 넘김 간격',
      type: 'range',
      min: 2000,
      max: 12000,
      step: 500,
      default: 6000,
      unit: 'ms',
      hint: '팁 하나를 보여 주는 시간. 팁 아래 막대가 남은 시간이다. ←/→ (Q/E) 로 넘기면 타이머가 처음부터 다시 간다',
    },
    {
      key: 'indicatorMode',
      label: '진행 표시',
      type: 'select',
      options: [
        { value: 'auto', label: '자동 (기다리는 길이에 따라)' },
        { value: 'spinner', label: '스피너만' },
        { value: 'percent', label: '퍼센트 바' },
        { value: 'stages', label: '바 + 단계 문구' },
      ],
      default: 'auto',
      hint: '자동: 처음 2초는 스피너, 그보다 길어지면 퍼센트 바, 6초가 넘으면 단계 문구까지. 빠른 로딩은 끝까지 스피너만 보인다',
    },
    {
      key: 'waitForInput',
      label: '준비 완료 뒤 키 입력 대기',
      type: 'toggle',
      default: true,
      hint: '켜면 100% 에서 "아무 키나 눌러 계속" 을 띄우고 기다린다(읽던 팁을 마저 읽는다). 끄면 100% 를 잠깐 보여 주고 바로 들어간다',
    },
  ],
  presets: [
    {
      id: 'long-open-world',
      name: '긴 로딩 · 단계 안내',
      look: '느긋한 보간, 긴 팁 간격, 바와 단계 문구를 처음부터, 키 입력 대기',
      values: { smoothSpeed: 40, minShowMs: 3000, tipIntervalMs: 9000, indicatorMode: 'stages', waitForInput: true },
    },
    {
      id: 'quick-action',
      name: '짧은 로딩 · 스피너',
      look: '빠른 보간, 최소 1초, 스피너만, 끝나면 바로 들어간다',
      values: { smoothSpeed: 120, minShowMs: 1000, tipIntervalMs: 4000, indicatorMode: 'spinner', waitForInput: false },
    },
    {
      id: 'no-smoothing',
      name: '보간 없음 비교',
      look: '0.9 로 나누기만 하고 보간 · 최소 시간 없음 — 계단과 번쩍임이 그대로',
      values: { smoothSpeed: 200, minShowMs: 0, tipIntervalMs: 6000, indicatorMode: 'percent', waitForInput: false },
    },
  ],
  events: [
    { id: 'fast', label: '빠른 로딩' },
    { id: 'slow', label: '느린 로딩 (디스크 느림)' },
    { id: 'hitch', label: '중간 멈칫' },
    { id: 'continue', label: '아무 키 누르기' },
    { id: 'restart', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'graph',
      title: '실제 값은 0.9 에서 멈춘다',
      body: '`LoadSceneAsync` 의 `progress` 는 불러오기가 끝나면 **0.9** 가 되고, `allowSceneActivation = false` 면 활성화(0.9 → 1)를 미룬 채 그대로 멈춘다. 그래프의 주황 계단이 그것이다. 화면 값은 `Mathf.Clamp01(progress / 0.9f)` 로 늘려야 바가 100% 에 닿는다. 효과를 끄면 progress 를 그대로 써서 **90% 에서 영원히 멈춘** 화면이 된다.',
      principle: '일관성',
      pin: 'left',
    },
    {
      n: 2,
      part: 'bar',
      title: '보간 + 최소 노출 시간',
      body: '표시 값 = `MoveTowards(표시, min(실제/0.9, 경과/최소시간), 속도 × dt)`. 실제 값이 한 번에 30% 뛰어도 바는 고르게 차오르고, 빠른 로딩도 **최소 노출 시간** 동안은 화면을 지킨다. 실제 값이 멈춘 동안에도 **뒤로 흐르는 줄무늬**가 움직여 "멈춘 게 아니다" 를 알린다.',
      principle: '즉각 피드백',
    },
    {
      n: 3,
      part: 'indicator',
      title: '기다리는 길이로 표시를 고른다',
      body: '몇 초면 끝나는 기다림에 퍼센트를 보이면 숫자가 튀기만 한다. **처음엔 스피너**, 2초를 넘기면 **퍼센트 바**, 6초를 넘기면 **단계 문구**("단계 3/5 · 셰이더 준비")까지. 실제 값이 1초 넘게 그대로면 "조금 오래 걸리는 중" 을 덧붙인다 — "느린 로딩" · "중간 멈칫" 으로 비교.',
      principle: '인지 부하',
      pin: 'left',
    },
    {
      n: 4,
      part: 'tip',
      title: '팁은 읽을 시간을 준다',
      body: '팁 하나에 6초 안팎(권장값 — 긴 팁이 많으면 간격을 늘린다), 아래 막대로 **언제 바뀌는지** 미리 보이고, ←/→ (Q/E) 로 넘기면 타이머가 다시 시작한다. 효과를 끄면 1.5초마다 바뀌어 한 줄도 끝까지 읽을 수 없다.',
      principle: '가독성',
    },
    {
      n: 5,
      part: 'prompt',
      title: '준비 완료 → 아무 키나',
      body: '불러오기와 표시가 모두 끝나면 **"아무 키나 눌러 계속"** 을 띄우고 기다린다. 키를 **누른 뒤에야** `allowSceneActivation = true` 로 활성화를 허락한다. 뜬 직후 0.4초는 **입력 잠금** — 로딩 중 팁을 넘기던 연타가 바로 넘겨 버리지 않게. 효과를 끄면 안내 없이 90% 에서 키를 기다린다. (이 갤러리에서는 숫자 · J S A H P · Esc · Tab · F키 · 방향키가 갤러리 · 브라우저 단축키라 "아무 키" 에서 뺀다. Space 는 준비 완료 화면에서만 계속으로 쓴다.)',
      principle: '어포던스',
      pin: 'left',
    },
  ],
  mistakes: [
    { title: 'progress 를 그대로 퍼센트로', body: '`allowSceneActivation = false` 면 progress 는 0.9 가 최대다. 그대로 쓰면 바가 90% 에서 멈춘다. `progress / 0.9f` 로 늘린다.' },
    { title: 'while (progress < 1) 로 기다리기', body: '활성화를 미룬 채 1 을 기다리면 영원히 끝나지 않는다. 0.9 에 닿았는지(`progress >= 0.9f`)로 판단하고, 그 뒤에 `allowSceneActivation = true`.' },
    { title: '보간 없는 계단 바', body: '에셋 묶음 단위로 값이 뛰어 바가 뚝뚝 끊기고, 묶음이 큰 구간에서는 한참 멈춘다. MoveTowards 로 고르게 따라가고, 멈춘 동안 움직이는 것(줄무늬 · 스피너 · 단계 문구)을 둔다.' },
    { title: '번쩍 지나가는 로딩 화면', body: 'SSD 에서는 1초 만에 끝나 화면이 깜빡이기만 한다. 최소 노출 시간을 두거나, 아주 짧은 로딩이면 아예 화면 전환(페이드)만 쓴다.' },
    { title: '읽기 전에 바뀌는 팁', body: '1~2초마다 바뀌면 한 줄도 못 읽는다. 가장 긴 팁도 읽을 수 있는 간격(권장 6초 안팎) + 남은 시간 표시 + 손으로 넘기기.' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 진행 바가 `op.progress` 를 그대로 따라 계단식으로 뚝뚝 끊기고, 최대가 90% 라 거기서 멈춘다. 키 입력을 기다리는 동안 아무 안내가 없어 "멈춘 화면" 처럼 보이고(자동 데모는 4초 뒤 답답해서 키를 누른다), 기다리지 않는 설정이면 90% 에서 바로 넘어간다. 최소 노출 시간이 없어 빠른 로딩은 번쩍 지나가고, 팁은 1.5초마다 바뀌며 손으로 넘길 수도 없다. 스피너 · 줄무늬 · 단계 문구가 없어 멈칫하는 동안 움직이는 것이 하나도 없다.',
  timings: [
    { event: '표시 진행률이 30% 계단을 따라잡음', ms: 500, easing: 'MoveTowards (선형, 초당 60%)', note: '권장값' },
    { event: '최소 노출 시간', ms: 2500, easing: '—', note: '권장값. 팁 한 줄을 읽을 수 있는 정도' },
    { event: '스피너 → 퍼센트 바', ms: 2000, easing: '페이드 300ms', note: '권장값. 응답 시간 연구의 "1초 · 10초" 경계를 수업용으로 줄였다' },
    { event: '단계 문구 추가', ms: 6000, easing: '—', note: '권장값' },
    { event: '팁 한 장', ms: 6000, easing: '밀려 들어오기 300ms', note: '권장값. 짧은 한 줄 기준, 길면 늘린다' },
    { event: '준비 완료 입력 잠금', ms: 400, easing: '—', note: '권장값' },
    { event: '로딩 화면 걷힘', ms: 450, easing: 'ease-out', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Loading (Screen Space - Overlay · Canvas Scaler 1920×1080 · Sort Order 높게)
└─ LoadingView (LoadingView.cs)
   └─ Screen (CanvasGroup — 걷힐 때 alpha)
      ├─ Backdrop (Image — 지역 그림)
      ├─ Destination (TextMeshProUGUI — "북쪽 통신탑")
      ├─ Tip (Image 바탕)
      │  ├─ TipIndex (TextMeshProUGUI — "2 / 6")
      │  ├─ TipText (TextMeshProUGUI)
      │  └─ TipTimer (Image Filled Horizontal — 다음 팁까지)
      ├─ StageText (TextMeshProUGUI — "단계 3/5 · 셰이더 준비 불러오는 중")
      ├─ SpinnerText (TextMeshProUGUI) · Spinner (Image 고리 — Z 회전)
      ├─ Percent (TextMeshProUGUI)
      ├─ Bar (CanvasGroup · Image 바탕)
      │  └─ Fill (Image Simple · RectMask2D — 왼쪽 고정, anchorMax.x = 표시 진행률)
      │     └─ Ribs (RectTransform — 기울인 줄무늬 Image 여러 개, 왼쪽으로 흘린다. Fill 밖은 잘린다)
      └─ Prompt (CanvasGroup · Image + TextMeshProUGUI "아무 키나 눌러 계속")
LoadingScreenDemo (LoadingScreenDemo.cs — 시험용: 1 빠른 · 2 느린 · 3 멈칫 · R 보통, 또는 실제 씬 이름)
LoadingProgress.cs (LoadingSettings · IndicatorMode · LoadingProgress — 계산만) · LoadOperation.cs (ILoadOperation · SceneLoadOperation · ILoadingScreen) · FakeLoadOperation.cs`,
      steps: [
        '`LoadingView.Run(ILoadOperation op)` 코루틴이 매 프레임 `LoadingProgress.Tick(op.Progress, Time.unscaledDeltaTime)` 를 부른다. 실제 게임은 `new SceneLoadOperation("Field")` — 안에서 `SceneManager.LoadSceneAsync` 후 `allowSceneActivation = false`.',
        '`LoadingProgress` 가 표시 값을 계산한다: `loaded = Clamp01(progress / 0.9f)`, `cap = 경과 / minShowSeconds`, `Display = MoveTowards(Display, Min(loaded, cap), smoothSpeed × dt)`. `progress >= 0.9f` 이고 `Display >= 1` 이면 준비 완료.',
        '어떤 표시기를 켤지도 `LoadingProgress` 가 정한다(`ShowBar` · `ShowPercent` · `ShowStages` · `BigSpinner`). 자동 모드는 `barAfterSeconds`(2초) · `stagesAfterSeconds`(6초)를 넘길 때 켠다. 화면 쪽은 결과를 그리기만 한다.',
        '준비 완료: `waitForInput` 이면 Prompt 를 켜고 `InputSystem.onAnyButtonPress` 를 구독한다. `inputLockSeconds`(0.4초) 안에 누른 것과 팁 넘기기 액션의 컨트롤은 무시하고, 그 뒤 첫 입력에서 `op.AllowActivation()`.',
        '팁: `tipIntervalSeconds` 마다 다음 팁, `tipPrev / tipNext` (InputActionReference) 로 넘기면 타이머를 0 으로. 시간은 모두 `Time.unscaledDeltaTime` — 로딩 중 `timeScale = 0` 이어도 돈다.',
        '바: Fill 은 Filled 가 아닌 **Simple** Image 로 두고 `anchorMax.x = 표시 진행률` 로 폭을 바꾼다. Fill 에 RectMask2D 를 달아야 자식 줄무늬가 채워진 부분 안에서만 보인다(Filled 의 fillAmount 는 자식을 자르지 않는다). 바가 나타나고 사라질 때는 CanvasGroup.alpha 를 0.3초에 걸쳐 바꾼다.',
        '`LoadingScreenDemo` 는 실제 씬 없이 `FakeLoadOperation`(에셋 묶음별 계단 · 멈칫 구간)으로 같은 화면을 돌린다. `sceneName` 을 채우면 그 씬을 진짜로 불러온다(Build Profiles 의 씬 목록에 있어야 한다). 이때 `LoadingView.persistAcrossScenes` 가 켜져 있으면 Run 할 때 `DontDestroyOnLoad(transform.root.gameObject)` 로 로딩 화면 루트를 남겨 두어, 새 씬이 활성화된 뒤에도 페이드와 `Finished` 가 끝까지 돈다. 다음 씬에 같은 로딩 화면이 또 있으면 둘이 되므로, 하나만 두는 관리자(예: 처음 씬의 부트스트랩)에 붙인다.',
      ],
      pitfalls: [
        '`allowSceneActivation = false` 인 채 `while (!op.isDone)` 이나 `progress < 1f` 를 기다리면 영원히 끝나지 않는다. 0.9 에 닿았는지로 판단한다.',
        '로딩 화면 오브젝트가 이전 씬에 있으면 `LoadSceneMode.Single` 로 바꿀 때 함께 사라져 페이드 · 완료 알림이 돌지 않는다. `persistAcrossScenes` 처럼 `DontDestroyOnLoad` 로 루트를 남기거나, 활성화 직후 새 씬에서 페이드를 마무리한다.',
        '`Time.deltaTime` 을 쓰면 로딩 중 `Time.timeScale = 0` 일 때 바 · 스피너 · 팁이 모두 멈춘다. UI 시간은 `unscaledDeltaTime`.',
        '활성화(0.9 → 1)는 새 씬의 `Awake` · `Start` 가 도는 구간이라 한 프레임이 길게 멈출 수 있다. 그 전에 바를 100% 로 채워 두고, 무거운 초기화는 여러 프레임으로 나눈다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080 · Sort Order 높게)
└─ LoadingScreen.uxml
   └─ #loading (.loading)
      ├─ #destination (.dest > Label 셋)
      ├─ #tip (.tip > #tip-index · #tip-text · .tip__timer > #tip-timer-fill)
      ├─ .status > #stage-text · .status__right(#spinner-text · #spinner · #percent)
      ├─ #bar (.bar > #bar-fill (.bar__fill) > #ribs (.ribs — C# 가 줄무늬 요소를 채운다))
      └─ #prompt (.prompt > .prompt__check · .prompt__text)
LoadingViewUITK.cs (LoadingSettings · LoadingProgress · ILoadOperation · FakeLoadOperation · LoadingScreenDemo 는 UGUI 폴더 것을 쓴다 — 시험용 스크립트의 screen 에 LoadingViewUITK 를 넣는다)`,
      steps: [
        '`LoadingViewUITK.Run(ILoadOperation op)` 은 UGUI 판과 같은 `LoadingProgress` 를 쓰고 그리기만 다르다. 바는 `#bar-fill.style.width = Length.Percent(표시 × 100)`.',
        '스피너는 `style.rotate = new Rotate(각도)` 를 매 프레임, 줄무늬는 `#ribs` 의 `style.translate` 를 왼쪽으로 흘려 64px 마다 되돌린다(USS 에는 그라디언트가 없어 줄무늬를 요소 여러 개로 만든다).',
        '표시기 전환은 요소마다 `EnableInClassList("is-hidden", …)` — 숨김 클래스는 `opacity: 0` 이라 레이아웃이 흔들리지 않는다. 큰 스피너는 `spinner--big` 클래스로.',
        '팁이 바뀔 때 `.tip__text` 에 `is-entering` 을 붙였다가 다음 프레임에 떼면 USS `transition`(translate · opacity 0.3s)으로 밀려 들어온다.',
        '준비 완료 입력은 UGUI 판과 같이 `InputSystem.onAnyButtonPress` + 입력 잠금. 패널 클릭도 입력이라 따로 처리하지 않아도 된다.',
      ],
      pitfalls: [
        '`display: none` 으로 표시기를 바꾸면 줄 높이가 바뀌어 퍼센트 글자가 들썩인다. 자리를 지키는 `opacity` / `visibility` 로 숨긴다.',
        'USS `transition` 으로 바 폭을 따라가게 하면 매 프레임 목표가 바뀌어 늘 늦게 따라온다. 보간은 C# 의 MoveTowards 하나로 하고 바에는 transition 을 걸지 않는다.',
        '`UIDocument` 가 있는 오브젝트가 씬 전환 때 사라지면 화면도 사라진다. UGUI 판과 같은 `persistAcrossScenes` 를 켜면 Run 할 때 루트를 `DontDestroyOnLoad` 로 남긴다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Bayonetta (2009)',
      credit: '© SEGA · PlatinumGames',
      borrowed: [],
      learned: '로딩 시간을 기술 연습 시간으로 바꿀 수 있다 — 기다림을 "할 거리" 로 채우는 예. 이 표본은 화면 모양을 빌리지 않고 팁 · 진행 표시의 원리만 다룬다 (화면 직접 확인은 못 함).',
      link: 'https://www.nintendolife.com/features/18-best-credits-sequences-and-loading-screens-that-let-you-do-stuff?page=2',
    },
  ],
  original:
    '에셋 묶음 단계와 시간표, 네 가지 로딩 각본(보통 · 빠른 · 느린 · 멈칫), 실제 vs 표시 비교 그래프, 팁 여섯 개, 배경 그림, 표시기 전환 기준, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 특정 게임의 로딩 화면을 재현하지 않고 Unity 의 비동기 로딩 동작과 진행 표시 연구로 만들었다.',
  references: [
    { label: 'Unity 6.3 — SceneManager.LoadSceneAsync', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/SceneManagement.SceneManager.LoadSceneAsync.html' },
    { label: 'Unity 6.3 — AsyncOperation.allowSceneActivation (0.9 에서 멈춤)', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/AsyncOperation-allowSceneActivation.html' },
    { label: 'Unity Discussions — PercentComplete 와 AsyncOperation 진행률 차이 (0.9)', url: 'https://discussions.unity.com/t/percentagecomplete-differs-to-underlying-asyncoperation/764706' },
    { label: 'UX Movement — 진행 바를 더 빠르게 느끼게 하는 법 (뒤로 흐르는 줄무늬 · 끝에서 가속)', url: 'https://uxmovement.com/buttons/how-to-make-progress-bars-feel-faster-to-users/' },
    { label: 'Nielsen Norman Group — 진행 표시기 (기다리는 길이별 선택)', url: 'https://www.nngroup.com/articles/progress-indicators/' },
    { label: 'Nielsen Norman Group — 응답 시간의 세 경계 (0.1 · 1 · 10초)', url: 'https://www.nngroup.com/articles/response-times-3-important-limits/' },
  ],
  related: [
    { id: 'results-reward', why: '같은 "기다림" 이라도 결과 화면은 연출 순서와 스킵 — 이쪽은 시스템이 정하는 기다림' },
    { id: 'tutorial-spotlight', why: '팁보다 강한 안내 — 실제로 해 보게 하는 튜토리얼' },
    { id: 'settings-accessibility', why: '자동으로 넘어가는 것을 끄거나 늘리는 시간 제한 설정' },
  ],
}
