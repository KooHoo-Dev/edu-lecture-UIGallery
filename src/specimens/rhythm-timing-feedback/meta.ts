import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'rhythm-timing-feedback',
  title: '박자 표시 · 판정 피드백',
  titleEn: 'Rhythm Timing & Judgement Feedback',
  group: 'C',
  order: 3,
  paradigms: ['non-diegetic'],
  tags: ['accessibility'],
  oneLiner: '박자 표시와 PERFECT · EARLY/LATE 판정을 곡 시계 하나로. 입력 지연 보정과 실패 없는 판정까지',
  goals: [
    '노트 위치 · 판정 · 소리 예약을 **곡 시계 하나**(Unity `AudioSettings.dspTime`, 웹 `AudioContext.currentTime`)로 계산하고, 프레임 시간으로 움직이면 왜 음악과 어긋나는지 설명할 수 있다',
    '판정 창을 **밀리초**로 정하고, 등급(PERFECT · GREAT · GOOD · MISS)과 **EARLY / LATE** 를 글자 · 위치 · 색으로 함께 보여 줄 수 있다',
    '**탭 테스트**로 평균 입력 지연을 재서 오프셋으로 적용하는 보정 화면을 만들 수 있다',
    "판정 창을 넓히고 MISS 를 '놓침' 으로만 기록하는 **실패 없는 판정**을 접근성 옵션으로 설계할 수 있다",
  ],
  principles: ['즉각 피드백', '일관성', '가독성', '접근성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'touch', 'mouse'],
  genres: ['리듬', '리듬 액션', '음악 미니게임'],
  difficulty: 3,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    {
      key: 'bpm',
      label: '빠르기',
      type: 'range',
      min: 70,
      max: 120,
      step: 5,
      default: 100,
      unit: 'BPM',
      hint: '박자 불빛 · 판정선 맥동은 한 박에 한 번 = BPM ÷ 60 Hz. 120 BPM 이 2Hz 라 상한을 120 으로 둔다. 바꾸면 채보가 바뀌어 처음부터',
    },
    {
      key: 'laneCount',
      label: '레인 수',
      type: 'range',
      min: 2,
      max: 4,
      step: 1,
      default: 4,
      unit: '개',
      hint: '4개 D F J K · 3개 F J K · 2개 F J. 같은 채보를 레인 수에 맞춰 접는다',
    },
    {
      key: 'approachMs',
      label: '노트가 보이는 시간',
      type: 'range',
      min: 700,
      max: 2000,
      step: 100,
      default: 1300,
      unit: 'ms',
      hint: '노트가 맨 위에서 판정선까지 오는 시간(속도의 역수). 짧을수록 빠르게 내려온다. 판정 창 띠의 높이도 함께 바뀐다',
    },
    {
      key: 'perfectMs',
      label: 'PERFECT 창',
      type: 'range',
      min: 20,
      max: 60,
      step: 5,
      default: 40,
      unit: '± ms',
      hint: 'GREAT 은 2배, GOOD 은 3배. 그 밖에서 누르면 판정하지 않고, 지나간 노트는 MISS',
    },
    {
      key: 'lenient',
      label: '관대한 판정 (실패 없음)',
      type: 'toggle',
      default: false,
      hint: "판정 창을 1.5배로 넓히고, 놓친 노트는 MISS 대신 '놓침' 으로 기록만 한다 — 콤보 · 생명이 줄지 않아 공연이 중단되지 않는다",
    },
    {
      key: 'timingDisplay',
      label: '이르게 · 늦게 표시',
      type: 'select',
      options: [
        { value: 'label', label: 'EARLY / LATE 글자' },
        { value: 'ms', label: '오차 ms 숫자' },
        { value: 'off', label: '숨김' },
      ],
      default: 'label',
      hint: '글자: PERFECT 밖에서만 EARLY(문구 위) · LATE(문구 아래). 숫자: PERFECT 도 −12 ms 처럼. 숨김이어도 아래 오차 막대는 남는다',
    },
    {
      key: 'showWindows',
      label: '판정 창 띠',
      type: 'toggle',
      default: true,
      hint: '판정선 위아래로 PERFECT · GREAT · GOOD 창을 노트가 지나는 거리로 그린다 (디버그용). 오프셋을 적용하면 띠가 그만큼 아래로 내려간다',
    },
    {
      key: 'deviceLatencyMs',
      label: '모형 기기 지연',
      type: 'range',
      min: 0,
      max: 200,
      step: 10,
      default: 0,
      unit: 'ms',
      hint: '모형: 무선 이어폰 · TV 처럼 입력(또는 소리 · 화면)이 이만큼 늦게 도착한다고 흉내 낸다. 사람과 자동 연주 모두에 더한다. 판정이 LATE 로 쏠리면 탭 테스트로 잰다',
    },
  ],
  presets: [
    {
      id: 'arcade',
      name: '아케이드 정확도',
      look: '120 BPM · 빠른 노트 · PERFECT ±25 ms · 오차를 ms 숫자로. 디버그 띠 없이 실제 게임처럼',
      values: {
        bpm: 120,
        laneCount: 4,
        approachMs: 800,
        perfectMs: 25,
        lenient: false,
        timingDisplay: 'ms',
        showWindows: false,
        deviceLatencyMs: 0,
      },
    },
    {
      id: 'no-fail',
      name: '실패 없는 연습 (접근성)',
      look: '85 BPM · 레인 2개 · 느린 노트 · 넓은 창 · 놓쳐도 콤보 유지 — 박자 감각을 실패 없이 익힌다',
      values: {
        bpm: 85,
        laneCount: 2,
        approachMs: 1900,
        perfectMs: 50,
        lenient: true,
        timingDisplay: 'label',
        showWindows: true,
        deviceLatencyMs: 0,
      },
    },
    {
      id: 'wireless',
      name: '무선 이어폰 지연',
      look: '모형 지연 110 ms — 판정이 모두 LATE 로 쏠리고 오차 막대가 오른쪽에 몰린다. 자동 데모가 탭 테스트로 재서 적용하면 가운데로',
      values: {
        bpm: 100,
        laneCount: 4,
        approachMs: 1300,
        perfectMs: 40,
        lenient: false,
        timingDisplay: 'label',
        showWindows: true,
        deviceLatencyMs: 110,
      },
    },
  ],
  events: [
    { id: 'early', label: '일부러 이르게' },
    { id: 'late', label: '일부러 늦게' },
    { id: 'hitch', label: '프레임 끊김 흉내' },
    { id: 'calibrate', label: '오프셋 측정 시작' },
    { id: 'miss', label: '노트 놓치기' },
    { id: 'restart', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'clock',
      title: '기준 시계는 하나',
      body: '곡 위치 = (기준 시각 − 시작 기준) × 재생 속도. 노트 y 는 매 프레임 (노트 시각 − 곡 위치) 로 **다시 계산**하고 쌓아 가지 않는다. 기준 시각은 소리를 켜면 `AudioContext.currentTime`(Unity `AudioSettings.dspTime`), 꺼져 있으면 `performance.now()` 하나 — 소리 켜기 · 일시정지 · 배속은 **시작 기준만** 다시 잡는다. 효과를 끄면 노트가 `y += 속도 × dt` 로 움직여 "프레임 끊김 흉내" · 0.5× 에서 "노트 − 음악" 이 벌어진다.',
      principle: '일관성',
    },
    {
      n: 2,
      part: 'windows',
      title: '판정 창은 밀리초로',
      body: 'PERFECT ±40 ms · GREAT ±80 · GOOD ±120 (기본값). 띠의 높이 = 창 × 2 ÷ 보이는 시간 × 레인 길이라, 노트가 빨라지면 같은 창도 띠가 얇아진다. 판정은 **입력 이벤트가 일어난 순간**의 곡 시각으로 — 처리한 프레임이 늦어도 그만큼은 밀리지 않는다(이벤트 시각 자체의 정확도는 브라우저 · 플랫폼마다 다르다). 효과를 끄면 창이 "±1 · 2 · 3 프레임" 이라 주사율 · 배속에 따라 창이 바뀌고, 입력도 다음 프레임 시각으로 판정한다.',
      principle: '가독성',
      pin: 'right',
    },
    {
      n: 3,
      part: 'feedback',
      title: '등급 + 이르게 · 늦게',
      body: '등급은 **모양 + 글자 + 색**(◆ PERFECT · ● GREAT · ▲ GOOD · ✕ MISS). PERFECT 밖이면 **EARLY 는 문구 위, LATE 는 문구 아래** — 노트가 판정선 위에 있을 때 누르면 이르다는 공간 비유와 같다. 아래 오차 막대에 최근 16개 눈금과 평균(▲)이 쌓여 "늘 늦게 친다" 를 한눈에 본다. 나타날 때 0.12초 동안 1.3배 → 1배, 0.7초 뒤 사라진다. 효과를 끄면 등급 글자만 남는다.',
      principle: '즉각 피드백',
    },
    {
      n: 4,
      part: 'calib',
      title: '탭 테스트로 입력 지연 보정',
      body: '노트 없이 박자 불빛(소리)에 맞춰 8번 누르면, 탭을 **다음에 올 박에 차례로** 붙여 오차를 모은다 — 가장 가까운 박으로 반올림하면 지연이 반 박을 넘을 때 부호가 뒤집힌다. 중앙값에서 크게 튄 탭(점선 눈금)은 빼고 **평균**과 흩어짐을 보여 준다. \'적용\' 하면 판정 시각에서 평균을 빼고, 판정 창 띠가 그만큼 아래로 내려간다. "무선 이어폰 지연" 프리셋에서 LATE 로 쏠린 판정이 가운데로 돌아온다. 효과를 끄면 재기만 하고 적용하지 못한다.',
      principle: '접근성',
      pin: 'right',
    },
    {
      n: 5,
      part: 'gauge',
      title: '실패 없는 판정',
      body: "기본은 MISS 하나에 생명 −10, 0 이면 공연 중단. **관대한 판정**을 켜면 창을 1.5배로 넓히고 놓친 노트는 '놓침'(○)으로 기록만 한다 — 콤보 · 생명이 그대로라 박자를 익히는 사람이 멈추지 않는다. 기록은 남기므로 실력은 정확도로 따로 보인다.",
      principle: '접근성',
      pin: 'left',
    },
  ],
  mistakes: [
    {
      title: '프레임 시간으로 노트 이동',
      body: '`transform.position += 속도 * Time.deltaTime` 은 프레임이 끊기면(dt 가 최대값에서 잘린다) 노트가 뒤처진 채로 남고, `Time.timeScale` 을 바꾸면 노트만 느려지고 음악은 그대로 흐른다. 노트 위치는 매 프레임 곡 위치에서 다시 계산한다.',
    },
    {
      title: '프레임 단위 판정',
      body: '`Update` 에서 `wasPressedThisFrame` 으로 판정하면 입력 시각이 프레임 단위로 뭉개지고, 판정 창을 프레임 수로 잡으면 60Hz 와 144Hz 에서 창이 다르다. 창은 ms, 입력은 이벤트 시각(`CallbackContext.time`)으로.',
    },
    {
      title: '등급만 있는 판정',
      body: 'GOOD 만 보여 주면 이르게 쳤는지 늦게 쳤는지 몰라 고칠 수 없다. EARLY/LATE 를 위치 · 색 · 글자로, 쌓이는 오차 막대로 경향을 보여 준다.',
    },
    {
      title: '오프셋 보정 없음',
      body: '무선 이어폰 · TV 는 소리와 화면이 수십~수백 ms 늦다. 보정이 없으면 정확히 쳐도 늘 LATE 다. 탭 테스트로 평균을 재서 판정 시각에서 뺀다.',
    },
    {
      title: '실패만 있는 판정 · 빠른 깜빡임',
      body: '놓치면 바로 공연이 끝나는 구조만 있으면 박자를 익히는 단계의 사람이 들어올 수 없다. 박자 불빛도 BPM 그대로 깜빡이면 빠른 곡에서 2Hz 를 넘는다 — 두 박에 한 번만 켜는 식으로 줄인다.',
    },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 노트가 프레임마다 y += 속도 × dt 로 움직이고 판정도 그 프레임 시계로 한다 — "프레임 끊김 흉내" 뒤 노트가 음악(박자 불빛 · 소리)보다 약 0.4초(끊김 0.5초 − 잘린 dt 0.1초) 더 뒤처지고, 배속 0.5× 에서는 음악은 1배로 흐르는데 노트만 느려져 점점 벌어진다(왼쪽 \'노트 − 음악\'). 판정 창은 ±1 · 2 · 3 프레임, 입력은 다음 프레임에서 처리한다. 판정 문구는 등급 글자뿐이고 EARLY/LATE · 오차 막대 · 커지는 연출 · 레인 빛이 없다. 탭 테스트는 재기만 하고 적용하지 못한다.',
  timings: [
    {
      event: 'PERFECT · GREAT · GOOD 창',
      ms: 40,
      easing: '± 40 / 80 / 120 ms',
      note: '권장값. 공개 구현 예(±45 / 90 / 135 ms)와 비슷한 1 : 2 : 3 비율. 관대한 판정은 1.5배',
    },
    {
      event: '판정 문구 커짐',
      ms: 120,
      easing: '1.3배 → 1배 직선',
      note: '권장값',
    },
    {
      event: '판정 문구 유지 → 사라짐',
      ms: 700,
      easing: '그 뒤 250ms 직선 페이드',
      note: '권장값. 다음 노트(100 BPM 8분음표 = 300ms)가 오면 바로 바뀐다',
    },
    {
      event: '레인 빛',
      ms: 150,
      easing: '직선 감쇠',
      note: '권장값. requestFlash() 를 거쳐 초당 3회까지',
    },
    {
      event: '판정선 맥동',
      ms: 150,
      easing: '박 앞 1/4 박 동안 밝음',
      note: '100 BPM 기준 (한 박 600ms 의 1/4). 맥동 = BPM ÷ 60 Hz ≤ 2Hz',
    },
    {
      event: '소리 미리 예약',
      ms: 150,
      easing: '—',
      note: '권장값. 곡 앞으로 0.15초 분량을 start(at) 로 예약한다 (Unity PlayScheduled 와 같은 생각)',
    },
  ],
  unity: {
    ugui: {
      hierarchy: `Rhythm (빈 오브젝트)
├─ Conductor (Conductor.cs + AudioSource)
├─ Game (RhythmGame.cs — Judge · 레인 InputActionReference · inputOffsetMs)
└─ Demo (RhythmDemo.cs — 시험용: 합성 곡 · R/P/1/2 키 · 자동 연주 · 생명 0 이면 처음부터)
Canvas_Rhythm (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ BeatLamp (BeatLamp.cs · Image ×4 — 첫 칸은 동그라미 스프라이트)
├─ Highway (Image 바탕 + 레인 구분선 Image)
│  ├─ JudgeLine (Image)
│  │  └─ Glow (Image + CanvasGroup — 박마다 밝아짐)
│  ├─ WindowBands (피벗 = 판정선 가운데)
│  │  └─ Perfect · Great · Good (Image, 가운데 피벗)
│  └─ Notes (RectTransform · 피벗 = 판정선 가운데 · NoteSpawner.cs)
│     └─ NoteView 프리팹 ×40 (NoteView.cs + Image · Raycast Target 끔)
├─ Judgement (JudgementView.cs)
│  ├─ Popup (CanvasGroup — 0.7초 뒤 사라지는 것은 이것뿐)
│  │  └─ Early (TextMeshProUGUI — 문구 위) · Word (TextMeshProUGUI) · Late (TextMeshProUGUI — 문구 아래) · Combo (TextMeshProUGUI)
│  ├─ Meter (RectTransform 600×44 · 띠 Image 3개)
│  │  ├─ Tick 프리팹 ×16 (Image — JudgementView 가 만든다)
│  │  └─ MeanMarker (Image ▲)
│  └─ Score (Accuracy TextMeshProUGUI · LifeFill Image Filled · LifeText TextMeshProUGUI)
└─ CalibrationPanel (CalibrationPanel.cs + Image)
   ├─ OffsetText · StatusText (TextMeshProUGUI)
   ├─ Ruler (RectTransform — 탭마다 Tick 프리팹 하나)
   └─ StartButton · ApplyButton (Button)`,
      steps: [
        '`Conductor.Play(clip)` 은 준비 시간 뒤의 dsp 시각에 `AudioSource.PlayScheduled` 로 예약하고 그 시각을 곡 위치 0 으로 쓴다. `SongPosition = (dspTime − 시작 dsp) × playbackRate`. `Resume()` 은 `UnPause` 대신 `timeSamples` 를 멈춘 위치로 맞추고 0.1초 뒤 dsp 에 다시 예약해 시작 dsp 를 그 시각에 맞춘다(소리와 시계가 한 버퍼만큼 어긋나지 않게). 연습 배속 `SetPlaybackRate()`(0.25~1)도 멈췄다 다시 예약한다.',
        '`NoteSpawner.LateUpdate` 가 `NoteChart.Between(곡 위치 − 0.35, 곡 위치 + 보이는 시간)` 으로 지금 보일 노트만 뽑아 풀의 `NoteView.Place()` 에 넣는다. y = (노트 시각 − 곡 위치) ÷ approach × travel. 그리기는 `VisualPosition`(`unscaledDeltaTime` 으로 예측하고 dspTime 쪽으로 천천히 맞춘 값, 뒤로 가지 않음), 판정은 `SongPosition`.',
        '`RhythmGame` 은 레인마다 `InputActionReference` 의 `performed` 를 듣고 `ctx.time`(이벤트 시각)을 곡 시각으로 바꿔 `Press(lane, songTime)` 을 부른다. `songTime − inputOffset` 에서 가장 가까운 미판정 노트를 찾아 `Judge.TryGrade(오차)` → `Judged(노트, 등급, 오차)` 이벤트. `Update` 는 GOOD 창을 지나간 노트를 MISS(관대한 판정이면 놓침)로 기록한다.',
        '`JudgementView` 는 `Judged` 만 듣는다: 등급 문구(모양 + 글자 + 색), `Judge.TimingOf()` 로 EARLY(위) · LATE(아래), 콤보, 오차 막대 눈금 16개 풀, 정확도 · 생명.',
        '`CalibrationPanel.Begin()` → `game.Calibrating = true` 면 `Press` 가 노트 대신 눌린 곡 시각을 `CalibrationTap` 으로 보낸다. `TapCalibration` 이 탭을 다음 박에 차례로 붙여 8번을 모으고, 중앙값 ± 3 × MAD 밖을 뺀 평균을 낸다. `Apply()` 가 `game.SetInputOffset(평균)`. 측정이 끝나면 노트는 2초 뒤 것부터 다시 나온다.',
        '`BeatLamp` 는 `Conductor.Beat` 를 듣고 지금 박의 칸만 켠다. 120 BPM 이 넘으면(`PulseBeats = 2`) 불빛 · 판정선 맥동을 두 박에 한 번으로 줄여 2Hz 이하를 지킨다. `RhythmDemo` 는 `AudioClip.Create` 로 곡을 합성해 외부 파일 없이 시험한다(`autoPlay` + `deviceLatencyMs` 로 보정 시험).',
      ],
      pitfalls: [
        '`AudioSource.Play()` 뒤 `Time.time` 으로 곡 위치를 세면 실제 소리가 시작한 순간을 모른다(다음 오디오 버퍼에서 시작). 미래의 dsp 시각에 `PlayScheduled` 하고 그 시각을 0 으로 쓴다.',
        '`dspTime` 은 오디오 버퍼 단위로 갱신돼 몇 프레임 연속 같은 값이 나온다 — 그대로 그리면 노트가 떨린다. 판정은 dspTime 그대로, 그리기만 보간한다(`Conductor.VisualPosition`).',
        '`Time.timeScale = 0` 으로 멈춰도 음악과 dspTime 은 흐른다. 일시정지는 `Conductor.Pause()` 로 소리와 시계를 함께 멈추고, 멈춘 동안의 입력은 판정하지 않는다(`RhythmGame.Press`).',
        'TMP 기본 폰트에 ◆ ● ▲ ✕ ○ 와 한글이 없으면 네모로 나온다. 한글 · 기호가 든 폰트 에셋을 Fallback 에 넣는다.',
        '`OnDisable` 에서 입력 구독을 풀고 액션을 끈다(`RhythmGame`). 측정 중에 패널을 끄면 `Calibrating` 을 풀어 노트가 멈춘 채로 남지 않게 한다(`CalibrationPanel`).',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + RhythmHudUITK.cs
└─ RhythmHud.uxml
   └─ #root (.rhythm)
      ├─ #lamp (.lamp > #beat-0 ~ #beat-3)
      ├─ #highway (.highway)
      │  ├─ #lanes (C# 가 .lane 을 레인 수만큼)
      │  ├─ #notes (C# 가 .note 40개 풀)
      │  ├─ #band > #band-good · #band-great · #band-perfect
      │  └─ #judge-line
      ├─ #feedback > #early · #word · #late · #combo
      ├─ #meter (띠 3개 · #meter-ticks — C# 가 .tick 16개)
      ├─ #calib (.panel > #offset · #ruler · #calib-status · Button #calib-start · #calib-apply)
      └─ #score (.panel > #accuracy · #counts · .life > #life-fill · #life-text)
같은 장면에 Conductor · RhythmGame (UGUI 폴더의 것) — 판정 로직은 그대로 쓴다`,
      steps: [
        '`RhythmHudUITK` 는 `RhythmGame` 의 `Judged` · `CalibrationTap` 과 `Conductor.Beat` 를 듣는다. 판정 · 채보 · 측정 계산(`Judge` · `NoteChart` · `TapCalibration`)은 UGUI 판과 같은 코드다.',
        '노트는 `#notes` 안에 40개를 미리 만들어 두고, `LateUpdate` 에서 `style.translate` 와 `display` 만 바꾼다. y = 판정선(700) − (노트 시각 − 곡 위치) ÷ approach × 680.',
        '판정 창 띠는 `.band__w` 셋의 `style.height` = 창 × 2 ÷ approach × 680, `#band` 의 `style.translate` 로 오프셋만큼 아래로.',
        '판정 문구는 `EnableInClassList("feedback__timing--on", …)` 로 EARLY · LATE 를 켜고, 커짐 · 사라짐은 `style.scale` · `style.opacity` 를 C# 에서 계산한다.',
      ],
      pitfalls: [
        'USS `transition` 으로 노트를 움직이면 transition 시계(프레임)를 따라가 음악과 어긋난다. 위치는 매 프레임 곡 위치에서 계산해 넣는다.',
        '`left` · `top` 을 매 프레임 바꾸면 레이아웃을 다시 계산한다. 노트는 `translate` 로만 옮긴다.',
        'UIDocument 를 껐다 켜면 트리가 새로 만들어져 예전 요소 참조가 끊긴다. 노트 · 눈금 풀은 `OnEnable` 마다 다시 만든다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Hi-Fi RUSH (2023)',
      credit: '© Bethesda Softworks · Tango Gameworks',
      borrowed: ['박자를 화면 요소의 맥동으로도 보여 주는, 켜고 끄는 시각 보조', '박자를 놓쳐도 실패로 치지 않는 판정'],
      learned:
        "리듬 시각화를 접근성 메뉴에서 켜는 옵션(동료 로봇 고양이가 박자에 맞춰 맥동)과, 박자를 놓쳐도 진행은 되고 점수만 낮아지는 설계가 기사로 확인된다. 이 표본은 그 생각을 박자 불빛 · 판정선 맥동과 '관대한 판정' 으로 옮겼다. 실제 화면의 배치 · 색 · 판정 문구는 확인하지 않았고 따라 하지 않았다.",
      link: 'https://kotaku.com/hi-fi-rush-game-pass-rhythm-game-visual-options-1850053933',
    },
  ],
  original:
    '레인 · 노트 · 판정선 · 판정 창 띠 · 오차 막대 · 박자 불빛 · 곡 시계 판 · 탭 테스트 화면, 8마디 채보와 합성음, 등급 모양(◆ ● ▲ ✕ ○)과 EARLY 위 · LATE 아래 배치, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 세로로 내려오는 레인 · PERFECT 같은 등급 이름은 리듬 장르의 관례로 썼고, 특정 게임의 화면을 재현하지 않았다.',
  references: [
    {
      label: 'Building Fair Rhythm Game Judgement Windows in JavaScript (DEV)',
      url: 'https://dev.to/skywalker_2de7de5f97df567/building-fair-rhythm-game-judgement-windows-in-javascript-1og9',
    },
    {
      label: 'Kotaku — Hi-Fi Rush 리듬 시각화 옵션 (2023-01-31)',
      url: 'https://kotaku.com/hi-fi-rush-game-pass-rhythm-game-visual-options-1850053933',
    },
    {
      label: 'The Tacoma Ledger — Hi-Fi Rush 의 접근성 (2023-02-27)',
      url: 'https://thetacomaledger.com/2023/02/27/the-ingenious-accessibility-of-hi-fi-rush/',
    },
    {
      label: 'Unity 6.3 — AudioSettings.dspTime',
      url: 'https://docs.unity.com/en-us/engine/6000.3/script-reference/unityengine/audiosettings/dsptime',
    },
    {
      label: 'Unity — AudioSource.PlayScheduled',
      url: 'https://docs.unity3d.com/ScriptReference/AudioSource.PlayScheduled.html',
    },
    {
      label: 'MDN — BaseAudioContext.currentTime',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime',
    },
  ],
  related: [
    {
      id: 'settings-accessibility',
      why: '시간 제한 · 실패를 끄는 다른 접근성 설정들을 한 화면에서',
    },
    {
      id: 'input-rebinding',
      why: '레인 키(D F J K)를 사람마다 바꿀 수 있게 — 충돌 확인까지',
    },
    {
      id: 'damage-numbers',
      why: '판정 문구처럼 짧게 커졌다 사라지는 글자를 풀로 돌리는 방법',
    },
  ],
  flashes: true,
}
