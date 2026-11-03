import type { SpecimenMeta } from '../../core/types'

const base = { energyMax: 60, regenMinutes: 6, stageCost: 20, offlineHours: 8, resetHour: 5, clockScale: '60', attendanceRule: 'cumulative', clockSource: 'server' }

export const meta: SpecimenMeta = {
  id: 'time-gated-meta',
  title: '출석 캘린더 + 에너지 회복 타이머',
  titleEn: 'Daily Login Calendar & Energy Refill Timer',
  group: 'E',
  order: 10,
  paradigms: ['meta'],
  oneLiner: '7일 출석판과 탐사 연료 타이머. 현재값은 매초 더하지 않고 "마지막 기록 + 서버 시각" 으로 계산해, 앱을 껐다 켜도 맞고 기기 시계를 바꿔도 흔들리지 않는다',
  goals: [
    '에너지를 **마지막 회복 시각 + 경과 시간** 으로 계산해, 앱을 끄고 몇 시간 뒤 켜도 맞는 값과 두 타이머(다음 +1 · 가득까지)를 보일 수 있다',
    '하루 경계를 **서버 시각의 초기화 시각(예: 05:00)** 으로 정하고, 서버 시각 = 받은 서버 시각 + 단조 시계로 기기 시계 조작을 막을 수 있다',
    '출석 칸(받음 · 오늘 · 내일 · 앞날)과 놓친 날, 7일차 큰 보상을 모양 · 글자로 구분하고, **연속 · 누적** 규칙의 차이(손실 회피 · 피로)를 설명할 수 있다',
    '최대치 초과(회복 정지)와 부족할 때의 **비활성 버튼 + 남은 시간** 을 보이고, Unity 에서 `OnApplicationPause` 로 복귀 때 다시 계산할 수 있다',
  ],
  principles: ['일관성', '가독성', '인지 부하', '어포던스', '즉각 피드백'],
  platforms: ['mobile', 'pc'],
  inputs: ['touch', 'mouse', 'keyboard'],
  genres: ['모바일 수집형 RPG', '캐주얼 퍼즐', '라이브 서비스 전반'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'energyMax', label: '연료 최대치', type: 'range', min: 5, max: 120, step: 5, default: 60, hint: '바꾸면 연료가 최대치의 62% 로 다시 시작한다. 20 이하면 막대가 한 칸씩 나뉜다' },
    { key: 'regenMinutes', label: '회복 간격', type: 'range', min: 1, max: 30, step: 1, default: 6, unit: '분', hint: '연료 1 이 차는 시간. "가득 찰 때까지" = 다음 +1 까지 + (남은 칸 − 1) × 간격' },
    { key: 'stageCost', label: '탐사 비용', type: 'range', min: 1, max: 40, step: 1, default: 20, hint: '출발 버튼이 쓰는 연료. 모자라면 버튼이 꺼지고 "얼마 뒤 출발할 수 있는지" 가 버튼 글자에 나온다' },
    { key: 'offlineHours', label: '앱을 끈 시간', type: 'range', min: 1, max: 24, step: 1, default: 8, unit: '시간', hint: '"앱 끄고 n시간 뒤 켜기" 의 n. 바르게 계산하면 그만큼 찬다. 효과를 끄면(매초 증가) 그대로다' },
    { key: 'resetHour', label: '초기화 시각', type: 'range', min: 0, max: 23, step: 1, default: 5, unit: '시', hint: '서버 지역 시간(UTC+9)의 하루 경계. 지금(13시대)보다 뒤로 옮기면 아직 "어제" 라 출석판이 받은 상태로 바뀐다' },
    {
      key: 'clockScale',
      label: '시간 배속',
      type: 'select',
      options: [
        { value: '1', label: '×1 (실제 시간)' },
        { value: '60', label: '×60 (1초 = 1분)' },
        { value: '600', label: '×600 (1초 = 10분)' },
      ],
      default: '60',
      hint: '서버 시각이 흐르는 속도. ×1 은 실제 초, ×600 이면 연료가 눈에 보이게 차고 초기화 카운트다운이 빠르게 준다',
    },
    {
      key: 'attendanceRule',
      label: '출석 규칙',
      type: 'select',
      options: [
        { value: 'cumulative', label: '누적 — 놓쳐도 다음 칸' },
        { value: 'streak', label: '연속 — 놓치면 1일차부터' },
      ],
      default: 'cumulative',
      hint: '"이틀 뒤 접속" 으로 비교. 누적은 칸 사이에 "놓친 날" 표시만 남고, 연속은 모은 칸을 잃는다',
    },
    {
      key: 'clockSource',
      label: '기준 시계',
      type: 'select',
      options: [
        { value: 'server', label: '서버 시각 (바른 방법)' },
        { value: 'device', label: '기기 시계 (흔한 실수)' },
      ],
      default: 'server',
      hint: '"기기 시계" 로 두고 "기기 시계 바꾸기" 를 누르면 출석이 다시 열리고 연료가 하루치 찬다. 아래 "서버 계산" 줄이 "화면과 다름" 을 띄운다',
    },
  ],
  presets: [
    { id: 'collector-rpg', name: '모바일 수집형 RPG', look: '연료 60 · 6분마다 +1 · 누적 출석 · 05:00 초기화 — 기본', values: { ...base } },
    {
      id: 'puzzle-lives',
      name: '캐주얼 퍼즐 (생명 5칸)',
      look: '최대 5 · 30분마다 +1 · 한 판에 1 — 막대가 다섯 칸, "가득 찰 때까지" 가 길다',
      values: { ...base, energyMax: 5, regenMinutes: 30, stageCost: 1, clockScale: '600' },
    },
    {
      id: 'strict-streak',
      name: '연속 출석 (놓치면 처음부터)',
      look: '연속 규칙 — "이틀 뒤 접속" 을 누르면 모은 칸을 잃고 1일차부터',
      values: { ...base, attendanceRule: 'streak' },
    },
    {
      id: 'device-clock',
      name: '기기 시계 기준 (흔한 실수)',
      look: '계산은 바르지만 기기 시계를 믿는다 — "기기 시계 바꾸기" 로 출석 · 연료가 열린다',
      values: { ...base, clockSource: 'device' },
    },
  ],
  events: [
    { id: 'claim', label: '오늘 출석 받기' },
    { id: 'depart', label: '탐사 출발 (연료 사용)' },
    { id: 'offline', label: '앱 끄고 n시간 뒤 켜기' },
    { id: 'miss-day', label: '이틀 뒤 접속 (하루 놓침)' },
    { id: 'device-clock', label: '기기 시계 바꾸기 (+1일)' },
    { id: 'bonus', label: '보급 보상 (+30 연료 · 초과)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'today',
      title: '오늘 칸 · 받음 도장 · 놓친 날',
      body: '칸 상태는 저장하지 않고 **받은 날 목록 + 오늘 날짜** 에서 계산한다. 받음 = 흐린 칸 + 기울어진 도장(체크 · 받은 날짜), **오늘** = 금색 굵은 테두리 + "오늘" 꼬리표 + 느린 맥동 0.8Hz, 오늘 받았으면 다음 칸이 **내일**(청록 빗금), 그 뒤는 "+2일" 처럼 남은 날. 7일차는 두 칸 크기로 끝의 큰 보상을 미리 보여 준다. 누적 규칙에서 하루를 건너뛴 자리에는 "✕ 놓친 날" 이 붙는다. 색을 못 구분해도 꼬리표 글자와 도장으로 읽힌다.',
      principle: '가독성',
    },
    {
      n: 2,
      part: 'reset',
      title: '하루 경계는 서버 시각 05:00',
      body: '"오늘" 은 기기의 자정이 아니라 **서버 지역 시간의 초기화 시각**에 바뀐다(하루 번호 = floor((서버 UTC + 9시간 − 5시간) / 24시간)). 새벽 플레이어가 자정에 하루를 두 번 받거나 잃지 않게 하는 흔한 선택이다. 서버 시각은 [배틀패스](#/s/battle-pass-track) 와 같은 방식 — **접속 때 받은 서버 시각 + 그 뒤 흐른 단조 시계** 로 기기 시계를 바꿔도 따라가지 않는다. 앱이 돌아오면 다시 받을 때까지 "동기화 중" 이라 쓰고 판정하지 않는다. 카운트다운은 다음 초기화 시각 − 서버 시각.',
      principle: '일관성',
    },
    {
      n: 3,
      part: 'rule',
      title: '연속 vs 누적 — 손실 회피를 어디에 쓸까',
      body: '**연속 출석**은 하루라도 비면 1일차로 돌아간다. 모은 칸을 잃기 싫어 매일 들어오게 하는 힘(손실 회피)이 크지만, 한 번 끊기면 "이미 망했다" 며 아예 떠나기 쉽고 매일의 의무가 **피로**가 된다. **누적 출석**은 놓쳐도 다음 칸으로 가 복귀가 쉽다. 연속을 쓴다면 끊겼다는 사실과 잃은 칸 수를 숨기지 말고 알린다(출석판 위 붉은 띠). 출석판은 보통 접속 직후 첫 팝업이라 [팝업 대기열](#/s/popup-queue-stack) 에서 점검 공지 다음, 이벤트 광고 앞에 둔다.',
      principle: '인지 부하',
      pin: 'left',
    },
    {
      n: 4,
      part: 'energy',
      title: '현재값 = 마지막 회복 시각 + 경과',
      body: '저장하는 것은 **값 · 마지막 회복 시각** 둘뿐이다. 지금 값 = 값 + floor(경과 ÷ 간격), 최대치에서 멈춘다. 쓸 때는 계산값을 확정하되 **다음 +1 까지 쌓인 부분 시간은 버리지 않는다**. 앱이 꺼져 있던 시간도 서버 시각으로 다시 계산하면 저절로 들어간다("앱 끄고 n시간 뒤 켜기"). 보상으로 최대치를 넘기면 자르지 않고 **초과**(금색 · 빗금 막대)로 두고 그동안 회복을 멈춘다 — 최대치 아래로 내려가는 순간부터 다시 센다. 가득 찰 시각은 로컬 알림 예약에 쓴다. 아래 점선 상자가 이 계산을 그대로 보여 준다.',
      principle: '일관성',
    },
    {
      n: 5,
      part: 'enter',
      title: '부족하면 꺼진 버튼 + 남은 시간',
      body: '연료가 모자라면 출발 버튼을 끄고 **"연료 부족 · 20까지 48:00"** 처럼 무엇이 얼마나 모자라고 언제 되는지를 버튼 글자에 쓴다(필요량 − 지금 − 1 칸 × 간격 + 다음 +1 까지). 눌러 보면 살짝 흔들리고 같은 내용을 안내한다. 웹 판은 `aria-disabled` 로 꺼서 포커스는 남긴다 — 키보드로 와서 이유를 읽을 수 있다. 효과를 끄면 버튼은 늘 켜져 있고 눌러야 "부족합니다" 만 나온다.',
      principle: '어포던스',
      pin: 'below',
    },
  ],
  mistakes: [
    { title: '매초 +1 로 세기', body: '`Update` 에서 타이머를 줄이다 0 이 되면 +1 하면, 앱이 꺼져 있던 시간은 아무도 세지 않는다. 8시간 뒤 켜도 그대로고 타이머도 처음부터. 마지막 회복 시각을 저장하고 매번 계산한다.' },
    { title: '기기 시계로 날짜 판단', body: '`DateTime.Now` 로 "오늘" 을 정하면 시계를 하루 앞당겨 출석을 다시 받고 연료를 채울 수 있다. 서버 시각(받은 UTC + 단조 시계)으로 판단하고, 확정은 서버가 자기 시각으로 다시 한다.' },
    { title: '기기 자정에 초기화', body: '시간대마다 하루가 다르고, 자정 근처 플레이어는 하루를 두 번 받거나 잃는다. 서버 지역 시간의 정해진 초기화 시각(예: 05:00)을 쓰고 화면에 적는다.' },
    { title: '보상을 최대치에서 자르기', body: '보급으로 받은 연료를 `Mathf.Min(max, …)` 로 자르면 받은 보상이 사라진다. 초과를 허용하고 그동안만 회복을 멈춘다.' },
    { title: '부족한데 이유 없이 회색', body: '버튼만 회색이면 "왜 안 되지?" 가 된다. 필요량 · 지금 값 · 남은 시간을 버튼에 바로 쓴다.' },
  ],
  juiceOff:
    '흔한 실수 두 가지를 함께 재현한다. ① 연료를 **켜져 있는 동안 흐른 시간만** 세는 매초 증가 방식 — "앱 끄고 n시간 뒤 켜기" 를 해도 연료가 그대로이고 타이머도 처음부터다(아래 "서버 계산" 줄은 이미 가득이라 "화면과 다름"). ② 날짜를 **기기 시계**로 판단 — "기기 시계 바꾸기" 를 누르면 출석이 다시 열려 같은 날 또 받는다. 덤으로 보급 보상은 최대치에서 잘려 사라지고, 부족할 때 출발 버튼이 켜진 채 눌러야 이유 없이 "부족합니다" 만 나온다. 오늘 칸 맥동과 도장 연출도 꺼진다.',
  timings: [
    { event: '오늘 칸 맥동', ms: 1250, easing: 'ease-in-out', note: '권장값. 한 주기 1.25초 = 0.8Hz (2Hz 이하). UGUI 는 Update 의 sin, UI Toolkit 은 625ms 마다 수식 클래스 pulse 를 켜고 끄고 USS transition 이 잇는다' },
    { event: '받음 도장 찍기', ms: 320, easing: 'cubic-bezier(0.3, 1.6, 0.5, 1)', note: '권장값. 1.8배 · −30° 에서 −12° 로 내려앉는다. Unity 판은 생략' },
    { event: '앱 복귀 → 서버 시각 다시 받기 (모형)', ms: 500, easing: '—', note: '이 재현의 가정값. 그동안 숫자 대신 "동기화 중", 받기 · 출발을 막는다. Unity 가짜 서버는 300ms' },
    { event: '연료 막대 변화', ms: 300, easing: 'ease-out', note: '권장값. 값 자체는 즉시 바뀌고 막대만 따라간다' },
    { event: '부족할 때 출발 누름 흔들기', ms: 300, easing: 'ease-out', note: '권장값. 좌우 8px' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_TimeGated (Screen Space - Overlay · Canvas Scaler 1920×1080, 세로 화면은 1080×1920)
├─ Header (TextMeshProUGUI — 제목 · 서버 시각)
├─ CalendarPanel
│  ├─ RuleChip (TextMeshProUGUI) · ResetCountdown (TextMeshProUGUI)
│  ├─ BrokeBanner (TextMeshProUGUI — 연속 끊김 안내)
│  ├─ Days (GridLayoutGroup · Constraint Fixed Column Count 4 · Cell 243×216 · Spacing 16)
│  │  ├─ Day1 … Day6 (Image Frame + TextMeshProUGUI ×3 Day · Tag · Reward + Stamp(Image + TMP 날짜) + Missed(Image + TMP))
│  │  └─ Day7 (LayoutElement Ignore Layout = 켬 · 오른쪽 아래 두 칸 자리에 직접 배치 · 같은 구성)
│  └─ ClaimButton (Button · ColorTint, Selected Color 다르게 + TextMeshProUGUI)
├─ FuelPanel
│  ├─ Value (TextMeshProUGUI "37 / 60") · OverTag (초과 꼬리표)
│  ├─ Fill (Image Filled Horizontal)
│  ├─ Next · Full (TextMeshProUGUI — 다음 +1 까지 · 가득 찰 때까지) · Notify (TextMeshProUGUI)
│  └─ EnterButton (Button · ColorTint + TextMeshProUGUI — 부족하면 남은 시간)
└─ TimeGated (TimeGatedScreen.cs — 시계 · 모델 · 그리기, TimeGatedDemo.cs — 시험 키)
ServerClock.cs (서버 시각 · 하루 번호 · 남은 시간 포맷 + FakeServer 가짜 서버 — 순수 C#)
TimeGatedModel.cs (EnergyMeter · AttendanceBook · 보상 표 — 순수 C#)`,
      steps: [
        '`ServerClock.Sync(서버 UTC, Time.realtimeSinceStartupAsDouble)` 를 접속 때 한 번, 그 뒤 `UtcNow(단조 시계)` = 받은 시각 + 흐른 시간. 서버 호출은 `FakeServer.FetchUtc` 코루틴(300ms 지연)이 흉내 낸다 — 처음 읽은 시각을 고정하고 단조 시계로만 흐르니 시험 중 기기 시계를 바꿔도 따라가지 않는다.',
        '`EnergyMeter` 는 `value` 와 `lastRegenUtc` 만 저장한다. `Current(now, out next, out full)` 이 값 = value + (now − lastRegenUtc).Ticks / 간격, 최대치에서 멈추고 두 타이머를 `TimeSpan` 으로 돌려준다. `TrySpend` · `Add` 는 먼저 `Settle(now)` 로 확정하되 부분 간격은 `lastRegenUtc` 에 남긴다. `Add` 는 자르지 않는다(초과 = 회복 정지).',
        '`AttendanceBook` 은 받은 날의 하루 번호 목록만 저장한다. 하루 번호는 `ServerClock.DayIndex(utc, resetHour, 9)`. 날짜가 바뀐 순간 `SettleDay(today)` — 7칸 완료면 새 주기, 연속 규칙에서 마지막 기록이 어제보다 앞이면 끊김(잃은 칸 수를 남겨 안내). `State(k, today)` 가 칸 상태, `MissedBefore` 가 누적 규칙의 놓친 날.',
        '`TimeGatedScreen.Update` 는 `Ready`(서버 시각을 받았나) 가 아니면 "동기화 중" 만 쓰고 버튼을 끈다. 하루 번호가 바뀌면 `RefreshBoard`(칸마다 색 · 꼬리표 · 도장 · 놓친 날을 켜기와 끄기 둘 다 설정), 초가 바뀔 때만 `RefreshTimers`(문자열은 1초에 한 번).',
        '`OnApplicationPause(false)` · `OnApplicationFocus(true)` 에서 `Resync()` — `clock.Invalidate()` 후 서버 시각을 다시 받는다. 꺼져 있던 동안 아무것도 세지 않았지만 다시 계산하면 그 시간이 저절로 들어간다. 시험은 `TimeGatedDemo`: O = 앱 끄고 n시간(가짜 서버 시각을 앞당기고 Resync), M = 이틀 뒤, C = 기기 시계 +1일, B = 연료 +30, T = 기준 시계 Server ↔ Device.',
        '가득 참 로컬 알림은 `ScheduleFullNotification(남은 시간)` 이 연결 지점이다. Mobile Notifications 패키지로 이전 알림을 취소하고 새로 예약한다. 알림은 기기 시계로 울리니 서버 시각이 아니라 **남은 시간**(fullAt − 서버 지금)으로 예약한다. 가득 · 초과면 취소.',
      ],
      pitfalls: [
        '`Time.time` · `Time.deltaTime` 으로 회복을 세면 `timeScale` · 일시정지 · 백그라운드에서 멈춘다. `DateTime.Now` 는 사용자가 바꾼다. 서버 UTC + `realtimeSinceStartupAsDouble` 만 쓴다.',
        '`GridLayoutGroup` 은 칸 크기가 모두 같아 7일차 두 칸짜리를 넣을 수 없다. 1~6일차만 그리드가 배치하고, 7일차는 `LayoutElement.ignoreLayout` 으로 빼서 직접 놓는다.',
        '`DateTime` 은 Unity 가 직렬화하지 않는다. 저장은 서버(또는 `ToBinary()` · ISO 문자열)로 하고, 불러온 뒤 `DateTimeKind.Utc` 를 확인한다 — Local 로 읽히면 9시간 어긋난다.',
        '`interactable = false` 버튼은 선택되지 않아 패드 사용자가 이유를 따로 읽을 수 없다. 남은 시간을 버튼 글자 자체에 넣는다. `transition = None` 으로 바꾸면 선택 표시를 `ISelectHandler` · `IDeselectHandler` 로 직접 그린다.',
        '클라이언트 판정은 표시용이다. 받기 · 출발은 서버가 자기 시각으로 같은 계산을 다시 해서 확정해야 한다(시계를 바꾼 클라이언트가 보낸 요청을 거절).',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ TimeGated.uxml
   └─ #root (.tg — 상태 수식 클래스 over · full · sync 를 C# 가 켠다)
      ├─ .tg__top (제목 · Label #clock)
      └─ .tg__panels
         ├─ .panel--cal (Label #rule · #reset-label · #reset · #broke · #days(.days — flex-wrap, C# 가 .slot 7개를 넣는다) · Button #claim)
         └─ .panel--fuel (Label #fuel-value · #fuel-max · #over-tag · .bar > #fuel-fill · .timer > #next · #full · #over-msg · #notify · Button #enter)
.slot (.slot__day · .slot__tag · .slot__name · .slot__count · .slot__stamp · .slot__missed) + 상태 수식 클래스 claimed · today · next · future, 7일차는 big
TimeGatedUITK.cs (모델 · 시계는 UGUI 폴더의 TimeGatedModel.cs · ServerClock.cs 를 쓴다)`,
      steps: [
        '`#days` 는 `flex-direction: row; flex-wrap: wrap`. 칸은 243px + 좌우 여백 6px 로 네 칸이 패널 안쪽 폭(1020px)을 채우고, 7일차는 수식 클래스 big 으로 498px(두 칸) — GridLayoutGroup 과 달리 칸마다 폭을 바꿀 수 있다.',
        '칸 상태는 `EnableInClassList` 로 네 수식 클래스 중 하나만 켠다(켜기 · 끄기를 한 번에). 도장 · 놓친 날 표시도 클래스로 `display` 를 바꾼다. 칸은 `focusable = false` · `pickingMode = Ignore`.',
        '갱신은 `schedule.Execute(Refresh).Every(250)` — 문자열을 1초에 4번만 만든다. 하루 번호가 바뀐 순간에만 `SettleDay` · `RefreshBoard`. 오늘 칸 맥동은 `Every(625)` 로 수식 클래스 pulse 를 켜고 끄고 USS `transition` 이 크기 · 테두리 색을 잇는다(0.8Hz).',
        '`OnApplicationPause(false)` · `OnApplicationFocus(true)` 에서 `Resync()`: 루트에 수식 클래스 sync 를 켜고 `schedule.Execute(…).StartingIn(300)` 이 가짜 서버 응답(`FakeServer.Now`)으로 `ServerClock.Sync` 한 뒤 다시 계산한다.',
        '부족하면 `enter.SetEnabled(false)` + 버튼 글자에 남은 시간. 포커스 표시는 USS `.btn:focus` 의 흰 테두리 — 기본 포커스 표시는 거의 보이지 않는다.',
      ],
      pitfalls: [
        '칸 사이를 직접 옮기려고 `NavigationMoveEvent` 를 처리하면 `e.StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 부른다. Unity 6.3 은 전파가 멈춰도 기본 포커스 이동을 한 번 더 해 한 칸씩 건너뛴다. 이 예제는 칸에 포커스를 주지 않아 기본 탐색만 쓴다.',
        'USS 에는 gradient · box-shadow 가 없다. 오늘 칸 강조는 테두리 두께 · 색, 초과 막대는 단색 금색으로 바꾼다.',
        '`clicked +=` 는 `OnEnable` 에서 한 번, `OnDisable` 에서 `-=` · 예약(`Pause`)까지 푼다. 안 풀면 다시 켤 때 한 번 눌러 두 번 받는다.',
        '`Label.text` 를 매 프레임 바꾸면 레이아웃이 매번 다시 계산된다. 초 단위 글자는 초가 바뀔 때만.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '출석판 구성(7칸 · 두 칸 크기 7일차 · 기울어진 받음 도장 · 칸 사이 "놓친 날" 표시 · 연속 끊김 띠), 보상 표(크레딧 · 산소 캔 · 냉각 셀 · 탐사 연료 · 수리 키트 · 회로 조각 · 정비 보급 상자), 탐사 연료 패널(두 타이머 · 초과 빗금 막대 · 가득 참 알림 시각 · 남은 시간이 든 출발 버튼), 시험 도구 줄과 "서버 계산" 비교 줄, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 후보 카드의 출처는 Unity 문서 · 블로그 · 포럼이라 특정 게임 화면을 확인하지 못했다 — 예로 든 게임의 화면 묘사는 미확인이므로 빌린 시각 요소 없이 장르 관례로만 다룬다.',
  references: [
    { label: 'Unity Gaming Services — Daily Rewards 예제 (서버 기준 출석 보상)', url: 'https://docs.unity.com/en-us/services/solutions/daily-rewards' },
    { label: 'Beamable — Inspiring examples of daily login rewards', url: 'https://beamable.com/blog/inspiring-examples-of-daily-login-rewards-for-your-mobile-game' },
    { label: 'GameAnalytics — Appointment mechanics (정해진 시간에 돌아오게 하는 장치)', url: 'https://www.gameanalytics.com/blog/appointment-mechanics-how-to-keep-your-players-in-game' },
    { label: 'Nerdbot — The psychology behind daily rewards (손실 회피와 피로)', url: 'https://nerdbot.com/2026/08/19/the-psychology-behind-daily-rewards-in-video-games/' },
    { label: 'Heroic Labs 포럼 — Regenerating energy and timer (마지막 회복 시각 + 경과 계산)', url: 'https://forum.heroiclabs.com/t/regenerating-energy-and-timer/389' },
    { label: 'UEFN Central — Stamina · energy 시스템 만들기', url: 'https://uefncentral.com/nl/blog/how-to-build-stamina-and-energy-systems-in-uefn-th' },
  ],
  related: [
    { id: 'battle-pass-track', why: '같은 서버 시각(받은 UTC + 단조 시계) 방식을 시즌 카운트다운에 — 받기를 서버 확인 뒤 확정하는 "받는 중" 상태도 그쪽' },
    { id: 'popup-queue-stack', why: '접속 직후 출석판 · 공지 · 이벤트 창의 순서를 대기열로 — 출석은 점검 공지 다음, 광고성 이벤트 앞' },
    { id: 'red-dot-badge-tree', why: '"오늘 받을 출석 있음" 알림 점을 로비 버튼까지 올리기' },
  ],
}
