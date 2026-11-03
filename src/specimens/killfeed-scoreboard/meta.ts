import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'killfeed-scoreboard',
  title: '킬 피드 + 스코어보드',
  titleEn: 'Kill Feed & Hold Scoreboard',
  group: 'C',
  order: 4,
  paradigms: ['non-diegetic'],
  oneLiner: '짧은 시간에 몰려 오는 제압 소식을 고정 열 · 아이콘 · 내 줄 강조로 훑어 읽게 하고, 누르고 있는 동안만 팀별 표를 띄워 승리까지 남은 제압 수를 가장 크게 보인다',
  goals: [
    '피드 한 줄을 **가해자 | 무기 아이콘 | 피해자** 고정 열로 맞추고 팀을 **색 + 모양**으로 나눠, 문장을 읽지 않고 훑어서 알 수 있게 만들 수 있다',
    '**최대 줄 수 · 유지 시간 · 같은 가해자 합치기 · 새 줄 간격(속도 조절)** 네 규칙으로 몰아치는 이벤트를 받아 내는 피드 큐를 설계할 수 있다',
    '누르고 있는 동안만 보이는 표에서 **정렬 기준**과 **모드에 가장 중요한 숫자**(승리까지 남은 제압 수)의 위계를 정할 수 있다',
    '네트워크 메시지를 UI 이벤트로 바꾸는 층을 따로 두고, Unity 에서 **줄 풀링 + CanvasGroup 페이드**(UGUI)와 **ListView 가상화 + USS transition**(UI Toolkit)으로 같은 모델을 그릴 수 있다',
  ],
  principles: ['가독성', '시각 위계', '인지 부하', '즉각 피드백', '접근성'],
  platforms: ['pc', 'console'],
  inputs: ['keyboard', 'mouse', 'gamepad', 'touch'],
  genres: ['팀 대전 슈터', '아레나 슈터', '공통'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'maxRows', label: '최대 줄 수', type: 'range', min: 3, max: 10, step: 1, default: 5, unit: '줄', hint: '피드에 한 번에 남는 줄 수. 넘치면 내 줄이 아닌 가장 오래된 줄부터 빨리 빠진다. 늘리면 놓치는 소식은 줄지만 화면을 더 가린다' },
    { key: 'displayMs', label: '유지 시간', type: 'range', min: 2000, max: 12000, step: 500, default: 5000, unit: 'ms', hint: '한 줄이 머무는 시간. 내가 관련된 줄은 1.5배. 마지막 0.45초 동안 흐려진다. 읽는 속도가 느린 사람을 위해 크게 늘릴 수 있어야 한다' },
    {
      key: 'eventRate',
      label: '이벤트 빈도',
      type: 'select',
      options: [
        { value: 'calm', label: '느긋 (약 2.6초마다)' },
        { value: 'normal', label: '보통 (약 1.4초마다)' },
        { value: 'burst', label: '몰아치기 (보통 + 8초마다 1초에 7건)' },
      ],
      default: 'normal',
      hint: '자동 데모가 만드는 제압 소식의 빈도. 몰아치기에서 합치기 · 속도 조절 · 최대 줄 수가 어떻게 일하는지 보인다',
    },
    { key: 'playersPerTeam', label: '팀당 인원', type: 'range', min: 3, max: 6, step: 1, default: 5, unit: '명', hint: '스코어보드 행 수와 피드에 나오는 이름이 바뀐다. 6 대 6 이면 표가 길어져 내 줄 강조 · 정렬이 더 중요해진다' },
    {
      key: 'sortBy',
      label: '정렬 기준',
      type: 'select',
      options: [
        { value: 'score', label: '점수순' },
        { value: 'takedowns', label: '제압순' },
        { value: 'join', label: '들어온 순서 (정렬 안 함)' },
      ],
      default: 'score',
      hint: '스코어보드 팀 안의 행 순서. 기준 열은 머리글에 ▼ 와 밑줄. 동점은 들어온 순서까지 정해 흔들리지 않게',
    },
    { key: 'mergeWindowMs', label: '합치기 창', type: 'range', min: 0, max: 3000, step: 250, default: 1500, unit: 'ms', hint: '같은 사람이 같은 무기로 이 시간 안에 다시 제압하면 새 줄 대신 그 줄에 "+1 · ×2" 로 합친다. 0 이면 합치지 않아 몰아칠 때 같은 이름이 줄줄이 쌓인다' },
    {
      key: 'holdMode',
      label: '보드 여는 방식',
      type: 'select',
      options: [
        { value: 'hold', label: '누르고 있기' },
        { value: 'toggle', label: '눌러서 열고 닫기 (토글)' },
      ],
      default: 'hold',
      hint: '누르고 있기는 슬쩍 보고 바로 돌아오기 좋고, 토글은 버튼을 계속 누르기 어려운 사람에게 필요하다. 둘 다 고를 수 있게 두는 것이 접근성 관례다',
    },
  ],
  presets: [
    {
      id: 'tactical',
      name: '전술 슈터',
      look: '5 대 5, 소식이 드문드문 — 줄은 적고 오래, 점수순',
      values: { maxRows: 5, displayMs: 7000, eventRate: 'calm', playersPerTeam: 5, sortBy: 'score', mergeWindowMs: 1500, holdMode: 'hold' },
    },
    {
      id: 'arena-brawl',
      name: '아레나 난전',
      look: '6 대 6, 몰아치기 — 줄을 늘리고 짧게, 넓게 합치기, 제압순',
      values: { maxRows: 7, displayMs: 3500, eventRate: 'burst', playersPerTeam: 6, sortBy: 'takedowns', mergeWindowMs: 2500, holdMode: 'hold' },
    },
    {
      id: 'readable',
      name: '천천히 읽기 (접근성)',
      look: '줄은 4개만 · 10초 유지 · 보드는 토글 — 시간 제한과 계속 누르기를 덜어 준다',
      values: { maxRows: 4, displayMs: 10000, eventRate: 'normal', playersPerTeam: 5, sortBy: 'score', mergeWindowMs: 3000, holdMode: 'toggle' },
    },
  ],
  events: [
    { id: 'me-takedown', label: '내가 제압 (정밀 타격)' },
    { id: 'me-down', label: '내가 이탈' },
    { id: 'burst', label: '몰아치기 (1초에 7건)' },
    { id: 'boundary', label: '경계 밖 이탈 (가해자 없음)' },
    { id: 'board', label: '스코어보드 열기 · 닫기' },
    { id: 'reset', label: '경기 처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'columns',
      title: '고정 열 — 문장이 아니라 칸으로 읽는다',
      body: '한 줄은 **나 | 가해자 | 무기 | 피해자 | 합친 수** 다섯 칸이고 칸 너비가 고정이다. 가해자는 오른쪽, 피해자는 왼쪽으로 맞춰 무기 아이콘이 늘 같은 세로선에 서고 눈이 그 선을 따라 훑는다. 팀은 색과 함께 **캡슐(우리) · 삼각(상대)** 표식으로, 정밀 타격은 노란 조준 표식으로 모양이 다르다. 효과를 끄면 "도윤이 펄스 소총으로 지호를 제압했습니다" 같은 문장이 오른쪽 맞춤으로 쌓여 줄마다 이름 위치가 다르다.',
      principle: '가독성',
    },
    {
      n: 2,
      part: 'my-row',
      title: '내가 관련된 줄은 다르게, 더 오래',
      body: '내가 제압한 줄은 **밝은 바탕**, 내가 이탈한 줄은 **어두운 붉은 바탕 + 테두리**, 둘 다 맨 앞에 "나" 칸이 붙는다(색만이 아니라 글자로도). 1.5배 오래 남고, 줄이 넘쳐도 다른 줄이 먼저 밀려나며, 남의 합친 줄에 묻히지 않는다. 효과를 끄면 내 줄도 다른 문장과 똑같다. 플레이어가 피드에서 가장 먼저 찾는 것은 "방금 내가 한 것" 과 "누가 나를" 이다.',
      principle: '시각 위계',
    },
    {
      n: 3,
      part: 'merge',
      title: '몰릴 때 — 합치기 · 속도 조절 · 최대 줄 수',
      body: '같은 사람이 같은 무기로 **합치기 창** 안에 다시 제압하면 새 줄 대신 그 줄에 **+1 · ×2** 가 붙는다. 새 줄은 큐에서 기본 0.22초, 대기가 길면 0.08초까지 줄인 간격으로 들어와 한 프레임에 일곱 줄이 튀어나오지 않는다. 그래도 **최대 줄 수**를 넘으면 내 줄이 아닌 줄 중 가장 오래 갱신되지 않은 줄이 0.22초 만에 빠진다. 디버그 칸의 합침 · 대기 · 밀려남 수로 확인 — "몰아치기" 를 효과 켜고 끄고 비교.',
      principle: '인지 부하',
    },
    {
      n: 4,
      part: 'goal',
      title: '모드에 중요한 숫자를 가장 크게',
      body: '팀 제압전에서 지금 결정을 바꾸는 숫자는 개인 점수가 아니라 **승리까지 남은 제압 수**다. 그래서 가장 큰 글자(84px)로 두고 "제압" 을 붙여 개인 "점수" 열과 구분한다. 개인 행은 **정렬 기준** 열을 ▼ 와 밑줄로 표시하고, 내 행은 금색 띠 + "나" 로 찾게 한다. 효과를 끄면 "20 : 19" 만 작게 있고 정렬 · 내 행 표시가 없다 — 남은 수를 계산해야 한다. 보드가 닫혀 있으면 이 번호는 HUD 의 "먼저 50 제압" 을 가리킨다 — Q 를 누르고 있거나 이벤트로 연다.',
      principle: '시각 위계',
    },
    {
      n: 5,
      part: 'hold',
      title: '누르고 있는 동안만 — 웹에서는 Tab 대신 Q',
      body: '표는 화면 대부분을 가리므로 **누르고 있는 동안만** 보인다. 실제 PC 게임은 Tab 을 쓴다 — 왼손을 WASD 에 둔 채 새끼손가락으로 닿는 큰 키라 이동을 멈추지 않고 슬쩍 볼 수 있다. 그런데 웹에서 Tab 은 포커스 이동이라 가로채면 키보드 사용자가 갇힌다 — 그래서 Q 와 이 버튼(누르는 동안 포인터 캡처)으로 보인다. 계속 누르기 어려운 사람을 위해 **토글**도 고를 수 있어야 한다("보드 여는 방식"). Unity 판은 Hold 상호작용으로 둘을 함께 둔다(Unity 탭).',
      principle: '접근성',
    },
  ],
  mistakes: [
    { title: '줄 수 제한 없음', body: '받는 대로 한 줄씩 붙이면 몰아칠 때 피드가 화면 가운데까지 내려와 조준선을 가린다. 최대 줄 수를 두고 넘치면 오래된 줄부터 빨리 뺀다 — 내 줄은 마지막에.' },
    { title: '문장으로 쓴 피드', body: '"A 가 B 로 C 를 제압했습니다" 는 줄마다 이름 위치가 달라 훑어 읽을 수 없다. 칸을 고정하고 무기는 아이콘으로, 보너스는 표식으로 줄인다.' },
    { title: '내 줄이 다른 줄과 같다', body: '내가 한 일 · 당한 일을 다른 열한 명의 소식 사이에서 찾게 된다. 바탕 · 테두리 · "나" 표시로 구분하고 조금 더 오래 둔다.' },
    { title: '팀을 색으로만', body: '빨강 · 파랑 이름만 다르면 색각 차이가 있는 사람은 누가 우리 편인지 모른다. 팀 표식 모양(캡슐 · 삼각)을 이름 옆에 함께 둔다.' },
    { title: '표가 계속 흔들린다', body: '점수만으로 정렬하면 동점끼리 매 갱신마다 자리가 바뀐다. 2차 · 3차 기준(제압 → 들어온 순서)까지 정해 순서를 안정시킨다.' },
  ],
  juiceOff:
    '피드는 큐도 줄 수 제한도 없어 몰아치기를 누르면 화면 오른쪽을 타고 길게 내려온다. 줄은 문장이라 이름 위치가 줄마다 다르고, 무기 · 정밀 타격 아이콘 · 팀 표식 모양 · 내 줄 강조 · 합치기 · 흐려짐이 없다(팀은 이름 색으로만). 스코어보드는 들어온 순서 그대로이고 내 행 표시가 없으며, 승리까지 남은 제압 수 대신 "20 : 19" 만 작게 쓴다.',
  timings: [
    { event: '새 줄 들어옴', ms: 180, easing: 'ease-out (오른쪽에서 80px 미끄러짐)', note: '권장값' },
    { event: '새 줄 사이 간격 (속도 조절)', ms: 220, easing: '—', note: '권장값. 기본 0.22초, 대기 1건마다 30ms 줄여 0.08초까지' },
    { event: '한 줄 유지', ms: 5000, easing: '마지막 450ms 흐려짐', note: '권장값. 내 줄은 1.5배. 조절 값으로 늘릴 수 있게' },
    { event: '최대 줄 수에 밀려 빠짐', ms: 220, easing: 'linear (투명도)', note: '권장값' },
    { event: '줄이 빠진 뒤 나머지가 올라감', ms: 160, easing: 'ease-out', note: '권장값' },
    { event: '스코어보드 열기 · 닫기', ms: 120, easing: 'ease-out (투명도 + 12px)', note: '권장값. 슬쩍 보는 표라 짧게' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Match (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ KillFeed (RectTransform 오른쪽 위 앵커 · KillFeedView.cs — LayoutGroup 없음, 줄 위치를 직접 계산)
│  └─ FeedRow 프리팹 (FeedRowView.cs · CanvasGroup · Image 바탕 — 풀에서 꺼내 쓴다)
│     ├─ MeTag (Image + TextMeshProUGUI "나")
│     ├─ Attacker (TextMeshProUGUI, 오른쪽 정렬) · AttackerMark (Image — 캡슐 · 삼각)
│     ├─ Weapon (Image — 무기 스프라이트) · Precision (Image — 정밀 타격)
│     ├─ VictimMark (Image) · Victim (TextMeshProUGUI, 왼쪽 정렬) · Extra (TextMeshProUGUI "+2")
│     └─ Multi (Image + TextMeshProUGUI "×3")
├─ Scoreboard (CanvasGroup · ScoreboardView.cs — 누르고 있는 동안만 alpha 1)
│  ├─ OrbitHead · SurfaceHead (Image 표식 — 캡슐 · 삼각 + TextMeshProUGUI 팀 이름)
│  ├─ OrbitToWin · SurfaceToWin (TextMeshProUGUI — 승리까지 남은 제압 수, 가장 크게)
│  ├─ OrbitRows · SurfaceRows (RectTransform — 행 프리팹을 재사용해 채운다)
│  ├─ Headers (TextMeshProUGUI 5개 — 정렬 기준 열은 굵게 + 밑줄) · FootText
│  └─ ScoreRow 프리팹 (Image 바탕 · MeBar Image · TextMeshProUGUI 6개: 이름 · 제압 · 지원 · 이탈 · 점수 · 핑)
└─ MatchEvents (MatchEventSource.cs — 가짜 경기 서버: 네트워크 메시지 → UI 이벤트. 시험용 키 1 · 2 · 3 · 4 · R)
KillFeedModel.cs (순수 C# — MatchState · FeedQueue · PlayerStats · KillEvent) · MatchEventSource.cs 안에 NetKillMessage · KillEventTranslator · FeedRowView.cs 안에 FeedTheme · ScoreboardView.cs 안에 HoldToShow`,
      steps: [
        '`MatchEventSource`(가짜 경기 서버)는 서버 대신 `NetKillMessage`(선수 네트워크 id · 무기 코드 · 플래그 비트)를 만든다. `KillEventTranslator.TryTranslate` 가 이것을 `KillEvent` 로 바꾸고, `MatchState.Apply` 로 기록을 고친 뒤 `KillReceived` 를 낸다. 실제 게임에서는 Netcode RPC 수신이 `Receive` 를 부른다 — 뷰는 네트워크를 모른다. 모르는 선수 · 무기 번호는 번역 층에서 버린다(가해자를 못 찾았다고 환경으로 치지 않는다).',
        '`KillFeedView` 는 `KillReceived` 를 받아 `FeedQueue.Push` 한다. 큐가 합치기(같은 가해자 · 같은 무기 · 창 안, 내 소식은 내 줄에만) · 대기열(새 줄 간격) · 최대 줄 수(내 줄은 마지막에 뺀다)를 정하고 `RowShown` · `RowMerged` · `RowRemoved` 를 알린다. 뷰는 `RowShown` 에 풀에서 `FeedRowView` 를 꺼내고 `RowRemoved` 에 돌려준다.',
        '`Update` 에서 `queue.Tick(Time.deltaTime)` 후 줄마다 `CanvasGroup.alpha = queue.Alpha(row)`, 목표 y = 순번 × 58 로 `anchoredPosition` 을 보간한다. 빠진 줄 아래가 160ms 동안 올라온다.',
        '아이콘은 `Image` 로 둔다. TMP 글자 안에 `<sprite name="pulse">` 로 넣으려면 비트맵 아틀라스로 **TMP Sprite Asset** 을 만들어야 한다(Window ▸ TextMeshPro ▸ Sprite Importer). 고정 열에는 Image 쪽이 정렬하기 쉽다.',
        '`ScoreboardView` 는 `HoldToShow` 로 열고 닫는다. 바인딩은 `<Keyboard>/tab` · `<Gamepad>/select`. 액션 Interactions 에 **Hold(duration 0.25)** 를 두면 `started`(누름) → 연다, `performed`(0.25초 넘게) → 길게 누름 표시, `canceled`(뗌) → 길게 눌렀으면 닫고, 짧게 눌렀으면 `tapToggles` 일 때 열린 채 고정한다. 뗀 신호가 안 오는 경우는 `OnApplicationFocus` · `OnDisable` 에서 닫는다. 정렬 바꾸기는 액션 하나(E · 패드 오른쪽 어깨)로 순환하고, 행은 팀 인원만큼 만든 것을 데이터만 바꿔 다시 쓴다.',
      ],
      pitfalls: [
        '`VerticalLayoutGroup` 으로 피드를 쌓으면 줄이 빠지는 순간 나머지가 한 프레임에 튀어 오른다. 위치는 직접 계산해 보간한다.',
        '페이드에 `Graphic.CrossFadeAlpha` 를 자식마다 부르면 TMP · Image 가 따로 놀고 비용도 크다. 줄 루트의 `CanvasGroup.alpha` 하나로 한꺼번에.',
        '`Time.timeScale = 0` 인 일시정지 메뉴에서도 피드를 흘리고 싶으면 `Time.unscaledDeltaTime` — 이 예제는 게임 시간을 따라 일시정지 중에 멈춘다.',
        'Tab 을 쓰려면 UI 입력 모듈의 Navigate 가 Tab 을 쓰지 않는지 확인한다. 보드는 보는 표라 `Selectable` 을 두지 않았다 — 행을 골라 신고 · 프로필을 열게 하려면 `transition = None` 일 때 선택 표시를 `ISelectHandler` 로 직접 그린다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ KillFeedScoreboard.uxml
   ├─ #feed (.feed — 줄은 C# 가 만들어 absolute 로 넣는다: .feed-row + 수식 클래스 in · out · pushed · mine-attacker · mine-victim)
   └─ #board (.board · 수식 클래스 open · 닫힘이 끝나면 visibility Hidden)
      ├─ .board__head — #orbit-to-win · #surface-to-win (Label .to-win__value — 가장 크게) · #orbit-score · #surface-score
      ├─ .table-head — #head-takedowns · #head-score (정렬 기준이면 수식 클래스 sort)
      ├─ #orbit-list · #surface-list (ListView — 행 가상화, focusable 끔)
      └─ #board-foot (Label)
KillFeedScoreboardUITK.cs (FeedQueue · MatchState · MatchEventSource · HoldToShow 는 UGUI 폴더 것을 그대로 쓴다)`,
      steps: [
        'UGUI 판의 모델 · 이벤트 소스 · `HoldToShow` 를 그대로 쓰고 그리는 쪽만 바꾼다.',
        '피드 줄은 `RowShown` 때 풀에서 꺼낸(없으면 만든) `VisualElement` 를 `#feed` 에 넣고, **16ms 뒤**(`StartingIn(16)`) 수식 클래스 in 을 붙여 USS transition(translate · opacity)으로 미끄러져 들어오게 한다. 남은 시간이 0.45초 아래면 수식 클래스 out(흐려짐), 밀려나면 pushed 를 함께 붙여 0.22초로 줄인다. 흐려짐이 끝나는 시각에 큐가 `RowRemoved` 를 알리면 `RemoveFromHierarchy()` 후 풀에 넣는다.',
        '스코어보드 행은 `ListView` 로 — `makeItem` 은 보이는 행 수만큼만 불리고, 정렬이 바뀌면 `itemsSource` 리스트를 다시 채운 뒤 `RefreshItems()`. `fixedItemHeight` 를 USS 행 높이와 같게 둔다.',
        '보드를 열고 닫는 것은 `.board` 의 수식 클래스 open 하나다. USS 에서 `opacity` · `translate` 에 transition 을 주고, 닫힘이 끝난 뒤 `visibility = Hidden` 으로 꺼 아래 화면을 막지 않는다.',
      ],
      pitfalls: [
        '`display` 는 transition 되지 않아 `opacity` 로 흐리게 하는데, opacity 0 도 포인터를 받고 `pickingMode` 는 상속되지 않는다(부모만 Ignore 면 안의 Label 이 받는다). 닫힘이 끝나면 상속되는 `visibility = Hidden` 으로 끄고, 피드 줄은 하위 요소까지 Ignore.',
        '합친 수(×3) 칸은 비어 있을 때 `display: none` 이 아니라 `visibility: hidden` — 칸이 사라지면 고정 열이 줄마다 흔들린다.',
        '요소를 만든 프레임에 바로 클래스를 바꾸면 시작 스타일이 계산되기 전이라 transition 이 일어나지 않는다. 지연 없는 `schedule.Execute` 도 스타일 계산 전에 돌 수 있어 `.StartingIn(16)` 이나 `GeometryChangedEvent` 뒤에 바꾼다.',
        'ListView 는 기본으로 포커스를 받아 방향키 · 패드가 행 선택으로 먹힌다. 보는 표라면 `focusable = false` · `selectionType = None`. 행을 고르게 만든다면 `NavigationMoveEvent` 를 직접 처리할 때 `StopPropagation()` 과 함께 `focusController?.IgnoreEvent(e)` 를 불러 한 번에 한 칸만 움직이게 한다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Overwatch (버전 미확인)',
      credit: '© Blizzard Entertainment',
      borrowed: [],
      learned:
        '후보 카드는 "Overwatch 2" 지만 출처 글이 다루는 버전을 확인하지 못해 연도를 비웠다. 출처는 이 게임의 UI 개선 제안 글, Arma Reforger 킬 피드 모드 페이지, War Thunder 포럼의 전투 UI 의견 글이고 원문 화면은 확인하지 못했다(미확인) — 빌린 시각 축은 없다. "가해자 [아이콘] 피해자" 한 줄, 오른쪽 위 위치, 누르고 있는 동안 보이는 표는 장르 관례로만 다뤘다.',
      link: 'https://gosugamers.net/overwatch/features/38572-suggested-fixes-to-the-overwatch-ui',
    },
  ],
  original:
    '두 훈련 분대(궤도 · 지표)와 열두 명의 이름 · 기록, 훈련 장비 아이콘 여섯 개 · 정밀 타격 표식, 다섯 칸 고정 열, "나" 칸, 합치기(+1 · ×2), 속도 조절 규칙(220ms − 대기 × 30ms, 최소 80ms), 점수 공식(제압 100 · 지원 50 · 정밀 25), 디버그 큐 칸, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. "제압 · 이탈" 은 모의 훈련 설정에 맞춘 말이다.',
  references: [
    { label: 'GosuGamers — Overwatch UI 개선 제안 (출처 · 미확인)', url: 'https://gosugamers.net/overwatch/features/38572-suggested-fixes-to-the-overwatch-ui' },
    { label: 'Arma Reforger 워크숍 — 킬 피드 개선 모드 (출처 · 미확인)', url: 'https://reforger.armaplatform.com/workshop/68FD0C1DBEB69F0F-REABetterKillFeed' },
    { label: 'War Thunder 포럼 — 전투 모드 UI 의견 (출처 · 미확인)', url: 'https://forum.warthunder.com/t/the-new-battle-gamemode-ui-is-almost-good/78264' },
    { label: 'Unity Input System — Interactions (Hold)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/Interactions.html' },
    { label: 'Unity 6.3 — USS transitions', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-Transitions.html' },
    { label: 'Game Accessibility Guidelines — 누르고 있기 대신 토글 · 색만으로 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/full-list/' },
  ],
  related: [
    { id: 'quest-tracker-toasts', why: '같은 알림 큐 구조 — 그쪽은 획득 알림의 슬롯 · 우선순위, 이쪽은 몰아치는 소식을 훑어 읽게 하는 줄 설계' },
    { id: 'radial-quick-select', why: '누르고 있는 동안만 열리는 UI — 누르고 있기 · 토글 선택을 같은 이유로 둔다' },
    { id: 'recycled-scroll-list', why: '스코어보드 행 재사용을 1,000줄 규모로 — ListView 가상화와 직접 만든 재활용 비교' },
    { id: 'reticle-hitmarker', why: '정밀 타격을 그 순간 조준점에서 알리는 쪽 — 피드는 지난 일을 모아 보여 준다' },
  ],
}
