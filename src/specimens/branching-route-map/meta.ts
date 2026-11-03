import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'branching-route-map',
  title: '분기 경로 맵',
  titleEn: 'Branching Route Map',
  group: 'D',
  order: 6,
  paradigms: ['meta', 'menu'],
  oneLiner: '아래에서 위로 갈라졌다 합쳐지는 런 지도. 갈 수 있는 곳만 밝히고, 지나온 길을 남기고, 같은 시드면 웹과 Unity 가 같은 지도를 만든다',
  goals: [
    '층 × 열 격자에서 경로를 위로 그어 **교차하지 않는 분기 지도(DAG)** 를 만들고, 종류를 **비율 + 제약**으로 배정할 수 있다',
    '**시드 난수기**를 따로 두어 같은 시드면 같은 지도가 나오게 하고, 그것이 버그 재현 · 공정한 공유 · 저장에 왜 필요한지 설명할 수 있다',
    '갈 수 있는 다음 노드만 강조 · 활성화하고, 지나온 길과 현재 위치(스크롤 따라가기)를 보여 주는 지도 UI 를 만들 수 있다',
    '진행 상태를 지도 전체가 아니라 **시드 + 지나온 길**의 JSON 으로 저장하고, 불러올 때 다시 만든 지도에서 길을 검증할 수 있다',
  ],
  principles: ['어포던스', '가독성', '인지 부하', '즉각 피드백', '일관성', '접근성'],
  platforms: ['pc', 'mobile', 'console'],
  inputs: ['mouse', 'touch', 'keyboard', 'gamepad'],
  genres: ['로그라이크', '덱빌딩', '로그라이트'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'floors', label: '층 수', type: 'range', min: 8, max: 16, step: 1, default: 12, unit: '층', hint: '출발부터 최종 목표 앞까지의 층. 많을수록 지도가 길어져 스크롤과 따라가기가 중요해진다' },
    { key: 'cols', label: '열 수', type: 'range', min: 3, max: 7, step: 1, default: 7, unit: '열', hint: '한 층에 노드가 놓일 수 있는 칸. 좁으면 경로가 자주 합쳐지고 넓으면 갈래가 넓게 퍼진다' },
    { key: 'paths', label: '경로 수', type: 'range', min: 2, max: 6, step: 1, default: 5, unit: '개', hint: '아래에서 위로 긋는 경로의 수. 많을수록 노드와 갈림길이 늘어 선택지가 많아진다' },
    {
      key: 'mix',
      label: '종류 비율',
      type: 'select',
      default: 'balanced',
      options: [
        { value: 'balanced', label: '보통' },
        { value: 'danger', label: '위험한 지도 (강적 많음)' },
        { value: 'supply', label: '보급이 많은 지도' },
        { value: 'unknown', label: '미확인 신호가 많은 지도' },
      ],
      hint: '고정 층(0층 교전 · 중간 층 회수 · 목표 앞 정비)을 뺀 나머지 노드의 가중치. 범례의 개수가 함께 바뀐다',
    },
    { key: 'seed', label: '시드', type: 'range', min: 1, max: 999, step: 1, default: 7, hint: '같은 시드 + 같은 조절 값이면 언제나 같은 지도(같은 지문). Unity 판에 같은 값을 넣으면 같은 지도가 나온다' },
    { key: 'preventCross', label: '간선 교차 막기', type: 'toggle', default: true, hint: '끄면 X 자로 엇갈리는 간선이 생겨 어느 선이 어디로 가는지 읽기 어려워진다 (경로 수를 늘리면 잘 보인다)' },
    { key: 'followScroll', label: '현재 위치 따라가기', type: 'toggle', default: true, hint: '이동하면 지도가 현재 위치 쪽으로 부드럽게 스크롤된다. 끄고 몇 칸 이동해 보면 현재 위치가 화면 밖으로 사라진다' },
  ],
  presets: [
    {
      id: 'mobile-short',
      name: '짧은 모바일 런',
      look: '8층 · 5열 · 경로 3개. 한 화면에 거의 다 들어오는 짧은 지도',
      values: { floors: 8, cols: 5, paths: 3, mix: 'balanced', seed: 3, preventCross: true, followScroll: true },
    },
    {
      id: 'hard-run',
      name: '고난도 런',
      look: '16층 · 경로 6개 · 강적이 많은 지도. 정비 위치를 범례로 찾아 길을 계획한다',
      values: { floors: 16, cols: 7, paths: 6, mix: 'danger', seed: 41, preventCross: true, followScroll: true },
    },
    {
      id: 'supply-heavy',
      name: '보급이 많은 지도',
      look: '정비 · 보급 비율을 올린 느긋한 지도',
      values: { floors: 12, cols: 6, paths: 4, mix: 'supply', seed: 12, preventCross: true, followScroll: true },
    },
    {
      id: 'tangled',
      name: '교차 허용 (비교용)',
      look: '교차 검사를 끈 지도. 같은 시드의 정상 지도와 번갈아 보면 엇갈린 선이 보인다',
      values: { floors: 12, cols: 7, paths: 6, mix: 'balanced', seed: 7, preventCross: false, followScroll: true },
    },
  ],
  events: [
    { id: 'step', label: '다음 노드로 이동 (자동 선택)' },
    { id: 'new-map', label: '새 지도 (시드 + 1)' },
    { id: 'legend', label: '범례 강조 순환' },
    { id: 'save-load', label: '저장 후 다시 불러오기' },
    { id: 'restart', label: '같은 시드로 처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'next',
      title: '갈 수 있는 곳만 밝게, 지나온 길은 굵게',
      body: '지금 고를 수 있는 노드만 크게 · 흰 테두리 · 퍼지는 고리로 그리고 나머지는 누를 수 없게 둔다. 이어지는 간선도 흐르는 선으로 바꾼다. 지나온 길은 굵은 흰 선과 채운 칸으로 남아 "어디서 왔는지" 와 "어디로 갈 수 있는지" 가 한눈에 갈린다. 효과를 끄면 모든 노드가 똑같아 **눌러 본 뒤에야** 막힌다.',
      principle: '어포던스',
    },
    {
      n: 2,
      part: 'legend',
      title: '범례에 올리면 같은 종류가 모두 강조',
      body: '"정비가 어디 있지?" 를 아이콘을 하나씩 읽어 찾게 하지 않는다. 범례 항목에 마우스를 올리거나 키보드 포커스를 두면 같은 종류만 크게 강조되고 나머지는 흐려진다. 아이콘은 삼각 · 겹삼각 · 십자 · 상자 · 마름모 · 전파 · 깃발처럼 **모양**이 달라 색을 못 구분해도 읽힌다. 항목 옆 숫자는 지도에 있는 개수.',
      principle: '가독성',
      pin: 'right',
    },
    {
      n: 3,
      part: 'rest-guard',
      title: '규칙이 있으면 계획할 수 있다',
      body: '최종 목표 바로 앞 층은 **언제나 정비**, 중간 층은 **언제나 회수**, 처음 네 층에는 강적이 없고, 같은 경로에서 정비 · 강적 · 보급이 연달아 나오지 않는다. 무작위 지도라도 이런 보장이 있으면 플레이어는 "끝에서 쉴 수 있으니 지금은 위험한 길로" 같은 계획을 세운다. 생성기는 추첨 전에 제약에 걸리는 종류의 가중치를 0 으로 만든다.',
      principle: '인지 부하',
      pin: 'left',
    },
    {
      n: 4,
      part: 'follow',
      title: '이동하면 현재 위치가 따라온다',
      body: '긴 지도는 한 화면에 들어가지 않는다. 이동할 때마다 현재 위치를 창 아래쪽 2/3 지점으로 부드럽게 스크롤해 앞으로 갈 길이 더 많이 보이게 한다. 사람이 직접 스크롤하면 따라가기를 멈추고 다음 이동 때 다시 켠다. 오른쪽 레일은 지도 전체에서 지금 보이는 곳(틀)과 현재 위치(점)를 보여 준다.',
      principle: '즉각 피드백',
      pin: 'left',
    },
    {
      n: 5,
      part: 'seed',
      title: '시드 하나로 같은 지도를 다시',
      body: '지도는 `Math.random` 대신 **시드 난수기(mulberry32)** 로 만든다. 같은 시드면 같은 지도라 "시드 7 의 9층에서 멈춤" 같은 버그를 그대로 재현하고, 친구와 같은 지도로 겨루고, 저장은 시드와 지나온 길만 하면 된다. 아래 **지문**은 지도 전체의 해시 — Unity 판이 콘솔에 찍는 값과 같으면 두 구현이 같은 지도를 만든 것이다.',
      principle: '일관성',
    },
  ],
  mistakes: [
    {
      title: '갈 수 있는 노드와 못 가는 노드를 똑같이 그림',
      body: '모든 노드가 같은 모양이면 플레이어는 눌러 보고 "갈 수 없는 경로입니다" 를 본 뒤에야 안다. 갈 수 있는 노드만 강조하고 나머지는 처음부터 누를 수 없게(`interactable` 끔) 둔다.',
    },
    {
      title: '간선이 교차하는 지도',
      body: '경로를 무작위로만 그으면 X 자로 엇갈리는 간선이 생겨 어느 선이 어느 노드로 가는지 읽을 수 없다. 이웃 열로 갈 때 반대 방향 간선이 이미 있으면 다른 열을 고른다(곧장 위는 절대 교차하지 않아 후보가 비지 않는다).',
    },
    {
      title: '이동해도 스크롤이 따라오지 않음',
      body: '긴 지도에서 위로 몇 칸 가면 현재 위치가 화면 밖으로 나가 "내가 어디 있지?" 를 찾게 된다. 이동마다 현재 위치 쪽으로 스크롤하고, 사람이 직접 스크롤하는 동안만 멈춘다.',
    },
    {
      title: '전역 난수(`Math.random` · `UnityEngine.Random`)로 생성',
      body: '같은 지도를 다시 만들 수 없어 버그를 재현할 수 없고, 다른 코드가 난수를 한 번만 더 불러도 지도가 바뀐다. 웹과 Unity 의 기본 난수기는 알고리즘도 달라 같은 시드라도 다른 지도가 나온다. 작은 난수기를 직접 넣어 두 곳에서 같은 연산을 한다.',
    },
    {
      title: '생성 코드를 바꾸고 옛 저장을 그대로 불러옴',
      body: '시드만 저장했는데 생성 규칙이 바뀌면 같은 시드가 다른 지도를 만들어 저장된 길이 엉뚱한 곳을 가리킨다. 불러올 때 길이 다시 만든 지도에서 이어지는지 검사하고, 저장에 생성 규칙 버전이나 지문을 함께 넣는다.',
    },
  ],
  juiceOff:
    '흔한 실수인 **갈 수 있는 곳을 표시하지 않는 지도**다. 다음 노드 강조 · 흐르는 간선 · 지난 층 흐리기를 모두 끄고 모든 노드를 누를 수 있게 둔다. 그래서 못 가는 노드를 눌러 보고 나서야 "갈 수 없는 경로입니다" 가 뜨고 노드가 흔들린다. 자동 데모도 못 가는 노드를 먼저 눌러 본다. 지나온 길 · 범례 · 스크롤 따라가기는 그대로 둬서 이 실수 하나만 비교한다.',
  timings: [
    { event: '이동 → 탐사대 표시 이동', ms: 350, easing: 'ease-in-out', note: '권장값. 짧게 — 고른 뒤 다음 선택을 기다리게 하지 않는다' },
    { event: '스크롤 따라가기', ms: 600, easing: '지수 감쇠 (λ = 5)', note: '권장값. 현재 위치를 창 아래쪽 2/3 지점으로' },
    { event: '갈 수 있는 노드 고리', ms: 1000, easing: 'ease-out 반복', note: '1Hz — 반복 맥동 2Hz 이하 기준' },
    { event: '범례 강조 맥동', ms: 800, easing: 'ease-in-out 왕복', note: '권장값. 약 0.6Hz' },
    { event: '저장 → 지도 버림 → 불러오기', ms: 1500, easing: '—', note: '수업용으로 단계를 늘려 보여 준다. 실제 게임은 즉시' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas (Canvas Scaler: Scale With Screen Size 1080×1920)
├─ Map (ScrollRect · Vertical만 · Movement Type: Clamped + RouteMapView.cs)
│  └─ Viewport (RectMask2D)
│     └─ Content (앵커·피벗: 위 가운데 — 크기는 코드가 정한다)
│        ├─ Edges  (간선 Image 들이 들어갈 빈 RectTransform — 먼저 그려진다)
│        └─ Nodes  (RouteNodeView 프리팹들이 들어간다)
├─ Legend (버튼 7개 · LegendEntry 로 kind · Button · 개수 TMP 연결)
├─ HereLabel · SeedLabel · JsonLabel (TextMeshProUGUI)
└─ EventSystem (InputSystemUIInputModule)
Prefab_Node (Button + RouteNodeView.cs)
├─ Fill (Image 원) · Frame (Image 원 테두리) · Icon (Image)
├─ PulseRing (Image 고리) · Check (Image)
└─ Caption (TextMeshProUGUI · 선택)
Prefab_Edge (Image · 높이 4 · Raycast Target 끔)
RouteMapData.cs (순수 C# — 생성기 · 저장 형식) · RouteMapDemo.cs (시험 입력)`,
      steps: [
        '`RouteMapData.Generate(seed, floors, cols, paths, mix)` 가 지도를 만든다. MonoBehaviour 가 아니라서 에디터 테스트로도 돌릴 수 있고, UI Toolkit 판도 같은 클래스를 쓴다. 콘솔에 찍히는 **지문**이 웹 판 화면의 지문과 같은지 비교해 보자.',
        '`RouteMapView` 를 ScrollRect 와 **같은 오브젝트**에 붙인다. 노드는 `anchoredPosition = (x, −y)` 로 놓고, 간선은 피벗을 왼쪽 가운데에 둔 Image 를 두 점 거리만큼 늘리고 `Atan2` 각도로 돌린다.',
        '이동할 때마다 `Refresh()` 가 갈 수 있는 노드만 `interactable = true` 로, 나머지는 끈다. 갈 수 있는 노드끼리만 `Navigation.Mode.Explicit` 로 좌우를 잇고 첫 노드를 선택해 키보드 · 패드로도 고를 수 있게 한다.',
        '범례 버튼에는 코드가 `EventTrigger` 를 붙여 PointerEnter · **Select** 에서 강조를 켜고 PointerExit · Deselect 에서 끈다. 마우스와 패드 포커스가 같은 강조를 만든다.',
        '`Save()` 는 `RunSave` 를 `JsonUtility.ToJson` 해 `PlayerPrefs` 에 넣는다. `Load()` 는 시드로 지도를 다시 만들고 `ValidPath` 로 길을 검사한 뒤 복원한다.',
      ],
      pitfalls: [
        '`UnityEngine.Random.InitState(seed)` 는 **전역** 상태라 다른 스크립트가 같은 프레임에 `Random` 을 쓰면 지도가 바뀐다. 생성기 전용 난수기(`Mulberry32`)를 둔다.',
        '자동 Navigation 은 화면상 가까운 Selectable 로 간다 — 꺼진(`interactable = false`) 노드는 건너뛰지만 범례 · 버튼으로 새어 나간다. 갈 수 있는 노드끼리 Explicit 으로 잇는다.',
        '노드가 수십 개면 상태가 바뀔 때마다 Canvas 전체가 다시 만들어진다. 지도(Content)를 별도 Canvas 로 나누면 범례 · 패널은 다시 그리지 않는다.',
        '`verticalNormalizedPosition` 은 1 이 맨 위다. 따라가는 동안 `velocity` 를 0 으로 두지 않으면 관성과 싸워 떨린다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1080×1920)
└─ RouteMap.uxml
   └─ #screen
      ├─ .head > Label · Label #here
      ├─ ScrollView #map (Vertical)
      │  └─ #content (.map__content)
      │     ├─ EdgeLayer (C# · generateVisualContent + Painter2D, picking-mode Ignore)
      │     └─ Button .node .kind-* × N (C# 가 만든다, position: absolute)
      ├─ #legend (C# 가 Button .legend__btn 7개를 만든다)
      └─ .save > Label #seed · Label #json · Button 저장 · 불러오기 · 새 지도
RouteMapUITK.cs (UIDocument 와 같은 오브젝트) + RouteMapData.cs (UGUI 폴더의 것을 그대로)`,
      steps: [
        'UGUI 판의 `RouteMapData.cs` 를 그대로 쓴다 (같은 namespace). 생성 · 저장 형식은 UI 기술과 무관하다.',
        '노드는 `Button` 을 `ClearClassList()` 로 기본 모양을 떼고 `.node` · `.kind-*` 클래스를 붙여 `style.left/top` 으로 놓는다. 상태는 `EnableInClassList("node--next", …)` 처럼 클래스로만 바꾼다.',
        '간선은 `EdgeLayer` 하나가 모두 그린다. `MarkDirtyRepaint()` 를 부르면 `generateVisualContent` 에서 `Painter2D.BezierCurveTo` 로 세로 접선 곡선을 다시 그린다. 흐린 선 → 다음 길 → 지나온 길 순서로 그려 밝은 선이 위에 온다.',
        '따라가기는 `Update` 에서 `scrollOffset` 을 목표로 지수 감쇠한다. `WheelEvent` · `PointerDownEvent` 를 TrickleDown 으로 받아 사람이 스크롤하면 멈춘다.',
      ],
      pitfalls: [
        '`SetEnabled(false)` 인 버튼은 포커스를 받지 못해 키보드 이동에서 빠진다(좋다). 다만 기본 테마가 흐리게 만들므로 USS 에서 `.node:disabled { opacity: 1 }` 로 되돌리고 흐리기는 우리 클래스로 정한다.',
        'Painter2D 에는 점선이 없다. 점선이 필요하면 곡선을 짧은 조각으로 나눠 하나씩 `Stroke()` 한다.',
        '첫 프레임에는 `contentViewport.layout.height` 가 NaN 이다. 레이아웃이 끝난 뒤(`GeometryChangedEvent` 또는 다음 프레임)에 스크롤 위치를 계산한다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Slay the Spire (2019)',
      credit: '© Mega Crit Games',
      borrowed: ['아래에서 위로 갈라졌다 합쳐지는 층 지도', '종류 아이콘 + 범례 강조'],
      learned:
        '카드 출처 중 muddasheep 의 지도 생성 분석 글을 근거로 **구조**만 참고했다: 시작점 여러 곳에서 위로 경로를 긋고, 이웃 열로만 가며 교차를 피하고, 보스 앞 휴식 · 중간 층 보물 · 초반 엘리트 없음 같은 보장 규칙을 둔다. 범례에 올리면 같은 종류가 강조되는 동작은 조사 카드의 요약(untapped 의 후속작 지도 가이드)에 기댄 것이며, 원작 1편의 실제 동작 · 아이콘 모양 · 색 · 지도 그림체는 **미확인**이라 새로 그렸다.',
      link: 'https://www.muddasheep.com/blog/416',
    },
  ],
  original:
    '외곽 탐사대 세계관의 노드 종류와 이름(교전 · 강적 · 정비 · 보급 · 회수 · 미확인 신호 · 최종 목표), 일곱 가지 아이콘 모양, 흐르는 간선 · 퍼지는 고리 · 범례 개수 · 오른쪽 위치 레일, 지도 지문(FNV-1a)으로 웹과 Unity 를 맞춰 보는 방법, 저장 → 지도 버림 → 시드로 다시 생성하는 시연, 종류 비율 네 가지와 수치는 모두 이 갤러리에서 새로 만들었다.',
  references: [
    { label: 'muddasheep — Slay the Spire 지도 생성 알고리즘 분석', url: 'https://www.muddasheep.com/blog/416' },
    { label: 'untapped.gg — Slay the Spire 2 지도 선택 가이드', url: 'https://sts2.untapped.gg/en/guides/how-to-make-the-best-map-choices-in-slay-the-spire-2' },
    { label: 'bryc/code — JavaScript 시드 난수기 모음 (mulberry32)', url: 'https://github.com/bryc/code/blob/master/jshash/PRNGs.md' },
    { label: 'Unity UGUI 2.0 — Navigation (Selectable 명시적 이동)', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/UnityEngine.UI.Navigation.html' },
    { label: 'Unity 6.3 — JsonUtility', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/JsonUtility.html' },
    { label: 'Unity 6.3 — Painter2D', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.Painter2D.html' },
  ],
  related: [
    { id: 'red-dot-badge-tree', why: '트리 데이터와 UI 를 나누는 같은 구조 — 데이터는 순수 클래스, 화면은 그 데이터를 그리기만 한다' },
    { id: 'card-hand-targeting', why: '같은 런의 전투 화면. Painter2D 로 곡선(타겟 화살표)을 그리는 다른 예' },
    { id: 'tutorial-spotlight', why: '처음 보는 지도에서 "갈 수 있는 곳" 을 가리키는 또 다른 방법 — 스포트라이트와 코치마크' },
  ],
}
