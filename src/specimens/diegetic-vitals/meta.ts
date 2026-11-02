import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'diegetic-vitals',
  title: '세계 안 체력 표시 (체력 바 확장편)',
  titleEn: 'Diegetic Vitals (Body- and Gear-Mounted)',
  group: 'A',
  order: 4,
  paradigms: ['diegetic', 'spatial'],
  oneLiner: '체력·동력·산소를 화면 구석이 아니라 캐릭터의 등판과 장비 위에 붙여, 캐릭터를 보는 것만으로 상태를 읽게 하는 표시',
  goals: [
    '같은 체력 정보를 **화면에 붙는 바(Screen Space)** 와 **세계 안 장비(World Space)** 로 각각 구현하고 장단점을 비교할 수 있다',
    '**몸체 부착형(등판)** 과 **장비 투영형(바이저·손목)** 중 카메라 시점에 맞는 쪽을 고를 수 있다',
    '등판 법선과 카메라 방향의 **내적**으로 "지금 등판이 보이는가"를 판정하고, 안 보일 때만 켜지는 대체 신호를 **히스테리시스**와 함께 설계할 수 있다',
    '자체발광·칸 개수·색 단계·조건부 표시로 어두운 세계 안에서도 상태가 묻히지 않게 만들 수 있다',
  ],
  principles: ['몰입', '가독성', '시각 위계', '인지 부하', '접근성'],
  platforms: ['pc', 'console'],
  inputs: ['mouse', 'keyboard', 'gamepad'],
  genres: ['3인칭 생존 호러', '3인칭 액션', '1인칭 작업 시뮬레이션'],
  difficulty: 3,
  stage: { aspect: '16:9', three: true, backdrop: 'none' },
  params: [
    {
      key: 'mountMode',
      label: '부착 위치',
      type: 'select',
      default: 'spine',
      options: [
        { value: 'spine', label: '척추 (몸체 부착)' },
        { value: 'visor', label: '바이저 (헬멧 투영)' },
        { value: 'wrist', label: '손목 장비 화면' },
      ],
      hint: '척추 = 3인칭, 캐릭터와 함께 돈다 / 바이저 = 1인칭, 헬멧 안쪽 곡면에 고정돼 어느 각도로 봐도 읽힌다 / 손목 = 1인칭, 시야 아래 팔 위의 작은 화면',
    },
    { key: 'cameraYawDeg', label: '카메라 궤도 각도', type: 'range', min: -180, max: 180, step: 5, default: 0, unit: '°', hint: '0° = 캐릭터 바로 뒤, ±180° = 정면. 각도가 커질수록 등판 게이지가 납작해지다 사라진다. 바이저·손목에서는 시선 방향이라 표시가 따라온다. 무대를 드래그해도 돌아간다' },
    { key: 'segmentCount', label: '체력 칸 수', type: 'range', min: 3, max: 12, step: 1, default: 10, unit: '칸', hint: '체력 바 표본과 같은 10칸(칸당 10)이 기본. 적으면 멀리서도 개수가 읽히고, 많으면 정밀하지만 사선에서 뭉개진다' },
    {
      key: 'hpColorScheme',
      label: '체력 색 단계',
      type: 'select',
      default: 'gradient',
      options: [
        { value: 'gradient', label: '3색 연속 (민트→앰버→적색)' },
        { value: 'pattern', label: '3단계 + 사선 무늬' },
        { value: 'mono', label: '단색 (밝기·칸 수만)' },
      ],
      hint: '체력 60% 이상에서는 세 방식 모두 민트라 같아 보인다 — "강한 피격 (-40)"(2)을 두 번 눌러 25% 아래로 내려 비교하자. 사선 무늬는 위험(25% 미만) 칸에만 붙어 색을 구분하기 어려워도 읽힌다. 단색은 색 없이 칸 수와 맥동만으로 전달한다',
    },
    { key: 'conditionalO2', label: '산소는 진공에서만', type: 'toggle', default: true, hint: '끄면 산소 표시가 가압 구역에서도 늘 떠 있다. 평소 등판의 정보량을 비교해 보자' },
    { key: 'emissiveScale', label: '자체발광 강도', type: 'range', min: 0, max: 3, step: 0.1, default: 1.6, unit: '×', hint: '0 = 조명을 받는 일반 재질처럼 어둠에 묻힌다. 너무 높으면 번짐이 커져 칸 경계가 뭉개진다 (2.5 이상에서 확인)' },
    { key: 'angleFallback', label: '각도 보조 신호', type: 'toggle', default: false, hint: '등판이 카메라에서 80° 넘게 돌아가면 화면 왼쪽 가장자리의 점선 자리에 작은 미니 게이지를 띄운다. 65° 아래로 돌아오고 1초가 지나야 사라진다 (척추 모드 전용). 0°에서는 변화가 없다 — 켠 뒤 "카메라 궤도 각도"를 100° 넘게 돌리거나 "카메라 한 바퀴"(6)를 눌러 보자' },
    { key: 'pulseHz', label: '치명 맥동 속도', type: 'range', min: 0, max: 3, step: 0.25, default: 1.5, unit: 'Hz', hint: '체력 25% 미만일 때 칸 밝기가 100%↔35% 를 오가는 빈도. 기본 체력(70)에서는 보이지 않는다 — "강한 피격 (-40)"(2)을 두 번 눌러 확인하자. 2Hz 이하 권장, 3Hz 상한. 2Hz 를 넘겨도 몸 둘레 붉은 빛·바이저 비네트처럼 넓은 효과는 2Hz 로 제한된다. 0 이면 색·무늬만 바뀐다' },
  ],
  presets: [
    {
      id: 'survival-horror-body',
      name: '3인칭 생존 호러 · 몸체 부착형',
      look: '어두운 격납고에서 정비사의 등판 칸과 동력 호만 빛난다. 화면에는 오버레이가 없고, 진공에 들어가야 산소가 나타난다. 카메라를 정면으로 돌리면 정보가 사라지는 약점이 바로 보인다',
      values: { mountMode: 'spine', cameraYawDeg: 0, segmentCount: 10, hpColorScheme: 'gradient', conditionalO2: true, emissiveScale: 1.6, angleFallback: false, pulseHz: 1.5 },
    },
    {
      id: 'first-person-visor',
      name: '1인칭 작업 시뮬 · 바이저 투영형',
      look: '헬멧 안쪽 곡면에 같은 세 지표가 단색으로 늘어선다. 산소는 계속 관리하는 자원이라 늘 보이고, 고개를 어느 쪽으로 돌려도 읽힌다',
      values: { mountMode: 'visor', cameraYawDeg: 0, segmentCount: 10, hpColorScheme: 'mono', conditionalO2: false, emissiveScale: 1.0, angleFallback: false, pulseHz: 1.0 },
    },
    {
      id: 'accessible-hybrid',
      name: '접근성 우선 · 하이브리드',
      look: '몸체 부착형이 기본이지만 카메라가 옆·앞으로 돌면(120°에서 시작) 화면 가장자리에 미니 게이지가 뜬다. 칸은 5개로 크게, 위험 구간은 색과 사선 무늬로 함께, 맥동은 느리게',
      values: { mountMode: 'spine', cameraYawDeg: 120, segmentCount: 5, hpColorScheme: 'pattern', conditionalO2: true, emissiveScale: 1.4, angleFallback: true, pulseHz: 1.0 },
    },
  ],
  events: [
    { id: 'hit', label: '피격 (-15)' },
    { id: 'heavy', label: '강한 피격 (-40)' },
    { id: 'heal', label: '회복 (+30)' },
    { id: 'ability', label: '능력 사용 (동력 -25)' },
    { id: 'vacuum', label: '진공 구역 진입 · 복귀' },
    { id: 'orbit', label: '카메라 한 바퀴' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'spine-gauge',
      title: "상태가 '그 몸' 위에 있다",
      body: '정비사 도윤의 생명 유지 장치에 체력을 **세로 육각 칸**으로 붙였다. 화면은 비어 있고, 플레이어는 이미 보고 있는 캐릭터에서 상태를 읽는다. [체력 바 표본](#/s/health-bar-trail)의 10칸(칸당 10)을 세계 안으로 옮긴 짝이다. 남은 **칸 수**와 **색**이 같은 값을 두 번 말한다.',
      principle: '몰입',
    },
    {
      n: 2,
      part: 'energy-arc',
      title: '세 지표를 한 장비에, 모양으로 구분',
      body: '체력은 세로 칸, 동력은 **반원 호**, 산소는 **숫자 + 물방울 글리프**. 한 장비에 모아도 모양이 달라 헷갈리지 않는다. 스스로 빛나게 해서 캐릭터에서 가장 밝은 요소로 만든다. "자체발광 강도"를 0으로 내려 비교해 보자.',
      principle: '시각 위계',
    },
    {
      n: 3,
      part: 'o2-readout',
      title: '필요할 때만 나타나는 산소',
      body: '지금 등판 오른쪽 위의 **어두운 빈 창**이 산소가 나타날 자리다. 산소는 **진공에 있거나 다시 차오르는 동안만** 보인다. 평소 등판이 단순해지고, 나타나는 것 자체가 "지금 위험한 곳"이라는 신호가 된다. "진공 구역 진입 · 복귀"로 확인해 보자.',
      principle: '인지 부하',
    },
    {
      n: 4,
      part: 'fallback-cue',
      title: '보이지 않을 때를 위한 대비',
      body: '평소에는 화면 왼쪽 가장자리에 **옅은 점선 자리**만 있다. 등판이 **80°** 넘게 돌아가면 그 자리에 미니 게이지를 띄우고, **65°** 아래로 돌아와 1초가 지나야 끈다. 기준을 둘로 나눠 경계에서 깜빡이지 않게 한다. 학습용으로 더한 보완책이다. "접근성 우선" 프리셋을 고르거나, "각도 보조 신호"를 켜고 "카메라 한 바퀴"를 눌러 확인하자. 바이저·손목은 표시가 시선을 따라오므로 필요 없다.',
      principle: '접근성',
    },
    {
      n: 5,
      part: 'visibility-inset',
      title: '몰입과 가독성은 맞바꾼다',
      body: '등판 법선과 카메라 방향의 **내적**: 1 = 정면, 0 = 옆, 음수 = 반대쪽. 세계 안 표시는 몰입을 얻는 대신 이 값이 낮으면 정보를 잃고, 화면 위 바는 늘 읽히지만 세계와 따로 논다. 1인칭이면 **바이저 투영형**이 균형점이다. 등판이 가려지면 해설 1~3 번호도 캐릭터 가장자리로 물러난다.',
      principle: '가독성',
    },
  ],
  mistakes: [
    { title: '카메라 정면에서 정보가 사라진다', body: '등에만 게이지를 붙이고 후진·컷신·자유 카메라 상황을 검토하지 않는다. 위험한 순간에 체력을 모르게 된다. 등판이 보이는지 내적으로 판정해 대체 신호를 두거나, 카메라 규칙(항상 등 뒤)을 정한다.' },
    { title: '조명을 받는 재질로 그려 어둠에 묻힌다', body: '게이지가 장면 조명을 그대로 받으면 그림자 속에서 거의 안 보인다. 조명과 무관한 Unlit 재질에 HDR 강도를 곱하고, Bloom 임계값을 그 강도에 맞춘다.' },
    { title: '칸이 너무 많고 작다', body: '정밀하게 보여 주려고 칸을 20개 넘게 넣으면 3인칭 거리와 사선에서 한 줄로 뭉개진다. 가장 먼 카메라 거리에서 칸 하나가 화면에서 최소 몇 픽셀인지 해상도별로 확인한다.' },
    { title: '색 하나만으로 위험을 알린다', body: '민트에서 빨강으로만 바꾸면 적록 색각이상 플레이어는 구분하기 어렵다. 칸 수, 사선 무늬, 맥동 리듬을 함께 바꾼다. "3단계 + 사선 무늬"를 골라 비교해 보자.' },
    { title: '몸에 붙인 표시가 떨리거나 판정이 뒤집힌다', body: '본(bone)을 따라가는 계산을 애니메이션보다 먼저 하면 한 프레임씩 늦어 떨린다(`LateUpdate` 에서 따라간다). 표면과 같은 깊이면 갑옷에 파묻히니 법선 방향으로 2~3cm 띄운다. UGUI 캔버스와 기본 Quad 는 **보이는 면의 법선이 `-forward`** 라서, `transform.forward` 를 그대로 쓰면 가시성 판정이 정반대가 된다.' },
  ],
  juiceOff:
    '칸·색 단계·발광·피격 연출·치명 맥동·조건부 산소·각도 보조 신호를 모두 끈 상태. 등에는 조명을 받는 **회색 막대 하나**만 붙어 어두운 격납고에서 거의 보이지 않고, 피격 때 길이가 한 번에 줄어 무엇이 바뀌었는지 놓친다. 동력은 아예 보이지 않고, 산소 숫자는 가압 구역에서도 늘 떠 있으며, 카메라가 앞으로 돌면 아무 신호 없이 정보가 사라진다. 바이저 모드에서는 곡면 없이 화면에 그냥 붙인 회색 막대들이 된다.',
  timings: [
    { event: '피격 → 칸 꺼짐', ms: 220, easing: 'ease-out', note: '권장값. 꺼질 칸이 흰색으로 60ms 번쩍인 뒤 사그라든다. 여러 칸이면 위에서부터 40ms 간격' },
    { event: '피격 순간 몸체 림 플래시', ms: 120, easing: 'linear', note: '권장값. 공통 번쩍임 제한기(초당 3회 이하)를 거친다' },
    { event: '회복 → 칸 채움', ms: 600, easing: 'ease-in-out', note: '권장값. 아래 칸부터 차례로 — 잃을 때보다 천천히' },
    { event: '색 단계 전환', ms: 300, easing: '지수 감쇠 (λ=10)', note: '권장값. 칸이 꺼지는 것과 동시에 시작' },
    { event: '치명 맥동 1주기', ms: 667, easing: 'sine', note: '1.5Hz 기준 (주기 = 1000 / pulseHz). 밝기 100%↔35%, 완전히 꺼지지 않게. 2Hz 이하 권장, 3Hz 상한' },
    { event: '동력 호 소모·충전', ms: 400, easing: '지수 감쇠 (λ=9)', note: '권장값. 사용 2초 뒤부터 초당 9씩 재충전' },
    { event: '산소 표시 등장 / 퇴장', ms: 300, easing: 'ease-out / ease-in', note: '권장값. 등장은 스케일 0.9→1 과 페이드, 퇴장은 200ms 로 더 빠르게' },
    { event: '각도 보조 신호 페이드', ms: 250, easing: 'ease-out', note: '켜짐 80° / 꺼짐 65° 히스테리시스 + 최소 유지 1초. 90°에서는 등판이 이미 모서리만 보이므로 켜짐 기준은 90°보다 작게' },
  ],
  unity: {
    ugui: {
      hierarchy: `Scene
├─ Player (Animator, PlayerInput, Tag: Player)
│  └─ Armature … Spine_02 (본)
├─ VitalsAnchor (BoneFollower.cs — LateUpdate 로 Spine_02 추종)
│  └─ VitalsCanvas (Canvas: World Space, Scale 0.001, GraphicRaycaster 제거)
│     ├─ SpineGauge (VerticalLayoutGroup, Reverse Arrangement)
│     │  └─ Cell (프리팹: Image + 자식 Hatch Image) ← segmentCount 만큼 생성
│     ├─ EnergyArc (Image: Filled · Radial180 · Origin Top · Clockwise 끔)
│     ├─ EnergyEmpty (Image, 점선 윤곽 스프라이트)
│     └─ O2Readout (CanvasGroup)
│        ├─ O2Glyph (Image)
│        └─ O2Value (TextMeshProUGUI)
├─ FallbackCanvas (Canvas: Screen Space - Overlay)
│  └─ MiniGauge (CanvasGroup)
│     └─ MiniCells (HorizontalLayoutGroup) ← 같은 칸 수
├─ VacuumZone (BoxCollider: Is Trigger, VacuumZone.cs)
├─ CameraPivot → Main Camera (HDR 켜짐) + Global Volume (Bloom)
└─ VitalsController (DiegeticVitals.cs, DiegeticVitalsDemo.cs)`,
      steps: [
        'VitalsAnchor 는 Player **밖**(씬 루트)에 두고 `BoneFollower.cs` 로 Spine_02 를 `LateUpdate` 에서 따라가게 한다. 애니메이션이 적용된 뒤의 위치를 읽으므로 떨리지 않고, 표면에서 2cm 띄워 갑옷에 파묻히지 않는다.',
        'VitalsCanvas 를 **World Space**, RectTransform 200×600, Scale **0.001**(약 0.2m×0.6m)로 만든다. 조작할 UI 가 없으니 GraphicRaycaster 는 지운다. 앞면이 카메라 쪽을 보도록 캔버스의 `+Z(forward)` 가 캐릭터 앞쪽을 향하게 회전 오프셋을 잡는다.',
        'EnergyArc 는 아래 반원(∪) 스프라이트에 Image Type **Filled · Radial180 · Origin Top · Clockwise 끔**. Origin 은 "원의 중심이 있는 변"이다 — ∪ 는 중심이 위 변에 있으므로 Top 이고, Bottom 으로 두면 채움이 호를 따라가지 않고 건너뛴다. Clockwise 를 끄면(반시계) 왼쪽 → 아래 → 오른쪽 순으로 찬다. 코드 `Awake` 에서도 같은 값으로 맞추니, 방향이 반대로 보이면 Unity 에서 Clockwise 만 바꿔 확인한다.',
        '`DiegeticVitals.cs` 가 시작할 때 Cell 프리팹을 `segmentCount` 개 만들고, 레이아웃이 잡히면 VerticalLayoutGroup 을 꺼서 매 프레임 재계산하지 않게 한다.',
        '모든 칸과 EnergyArc 에 **UI 호환 발광 머티리얼**(Canvas 타입 Shader Graph 또는 UI/Default 복제 + `_Intensity`)을 넣는다. `Image.color` 는 0~1 로 제한되므로 HDR 밝기는 `material.SetFloat("_Intensity", emissiveScale)` 로 올린다.',
        '체력이 바뀌면 켤 칸 수 = `CeilToInt(체력 비율 × 칸 수)`. 꺼질 칸은 위에서부터 0.04초 간격으로 흰색 0.06초 → 0.22초 페이드, 회복은 아래 칸부터 0.6초에 걸쳐 차오른다 (칸별 타이머를 `Update` 에서 진행).',
        '가시성 판정: `toCam = (카메라 위치 − 캔버스 위치)` 의 수평 성분을 정규화하고 `Vector3.Dot(-canvas.forward, toCam)` 으로 앞면이 카메라를 향하는 정도를 구한다. 80° 초과면 MiniGauge 를 0.25초에 페이드 인, 65° 미만 + 최소 1초 유지 후 페이드 아웃.',
        '진공: `VacuumZone.cs` 의 트리거가 `onVacuumChanged(bool)` 이벤트로 `SetVacuum` 을 부른다 (Player 쪽에 Rigidbody 또는 CharacterController 가 있어야 트리거가 호출된다). 테스트는 `DiegeticVitalsDemo.cs` — 갤러리와 같은 숫자키 1~6.',
      ],
      pitfalls: [
        'World Space Canvas 의 Scale 을 1 로 두면 200×600 이 **200m×600m** 가 된다. 반드시 0.001 정도로 줄인다.',
        '캔버스를 본의 자식으로 바로 넣으면 본 스케일·리타게팅 때문에 크기가 틀어지고 떨린다. 별도 Anchor 를 `LateUpdate` 에서 따라가게 하는 쪽이 안전하다.',
        '매 프레임 색이 바뀌는 칸은 같은 Canvas 의 다른 UI 까지 다시 빌드하게 만든다. 게이지는 전용 Canvas(또는 하위 Canvas)로 분리한다.',
        'UI/Default 셰이더는 World Space 에서 ZTest LEqual 이지만 ZWrite 가 꺼져 있어, 몸체 메시와 같은 깊이면 묻히거나 정렬이 흔들린다. Anchor 를 법선 방향으로 2~3cm 띄운다.',
        '카메라는 `FindObjectOfType` 대신 인스펙터 참조나 `Camera.main` 캐싱으로 얻는다. 디버그 키는 구 Input Manager(`Input.GetKeyDown`) 대신 Input System 으로 받는다.',
      ],
    },
    uitk: {
      hierarchy: `VitalsUIDocument (UIDocument, PanelSettings_RT → Target Texture: RT_Vitals 256×768)
└─ VitalsBack.uxml
   └─ #vitals-root (.vitals)
      ├─ #o2 (.o2 .o2--hidden)
      │  ├─ .o2__glyph
      │  └─ Label #o2-value
      ├─ #spine-gauge (.spine) ← VitalsCell 을 C# 에서 segmentCount 만큼 생성
      └─ EnergyArcElement #energy-arc (.arc)
VitalsAnchor (UGUI 폴더의 BoneFollower.cs) → BackQuad (MeshRenderer, Mat_VitalsRT)
FallbackUIDocument (UIDocument, PanelSettings_Screen, Sort Order 높게)
└─ FallbackHud.uxml
   └─ #mini-gauge (.mini .mini--hidden)
      ├─ #mini-cells ← 같은 칸 수의 VitalsCell
      └─ .mini__energy > #mini-energy-fill
VitalsController (DiegeticVitalsUITK.cs, DiegeticVitalsUITKDemo.cs)`,
      steps: [
        'PanelSettings 를 두 개 만든다. **PanelSettings_RT** 는 Target Texture 에 RT_Vitals(256×768)를 지정하고 Clear Color 를 켜되 알파를 0 으로, **PanelSettings_Screen** 은 일반 화면용이다.',
        'BackQuad 용 Shader Graph(URP Unlit, Transparent)에서 RT 의 RGB × `_Intensity`(HDR)를 Base Color 에, A 를 Alpha 에 연결한다. URP Unlit 에는 Emission 슬롯이 없어 강도를 직접 곱한다.',
        '`DiegeticVitalsUITK.cs` 의 `OnEnable` 에서 `rootVisualElement` 를 얻고 `#spine-gauge` 에 `VitalsCell` 을 칸 수만큼 추가한다. 육각형과 사선 무늬는 `Painter2D` 로 그린다 (비트맵 없음).',
        '`EnergyArcElement` 는 `[UxmlElement]` 커스텀 요소다. `generateVisualContent` 에서 `painter2D.Arc(중심, 반지름, Angle.Degrees(180), Angle.Degrees(180 − 180 × fill), ArcDirection.CounterClockwise)` 로 아래 반원을 그리고, 값이 바뀌면 `MarkDirtyRepaint()`. 코드가 `UIGallery.DiegeticVitalsSample` namespace 안에 있으므로 UXML 에는 `<UIGallery.DiegeticVitalsSample.EnergyArcElement>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        '산소는 `.o2--hidden` 클래스를 넣고 빼는 것만으로 등장·퇴장한다 (USS `transition` 이 opacity·scale 을 보간). 치명 맥동은 레이아웃에 영향이 없는 `style.opacity` 에만 매 프레임 쓴다.',
      ],
      pitfalls: [
        'RenderTexture 로 그리는 패널은 화면 입력을 받지 않는다. 이 표본은 표시 전용이라 괜찮지만, 조작이 필요하면 Unity 6.3 의 **World Space 패널**(PanelSettings Render Mode = World Space)을 쓴다.',
        'Clear Color 를 끄거나 알파를 1 로 두면 Quad 에 이전 프레임 잔상이나 검은 사각형이 보인다.',
        '`rootVisualElement` 는 UIDocument 가 활성화된 뒤에만 유효하다. `Awake` 대신 `OnEnable` 에서 `Q()` 한다.',
        '`Painter2D.Arc` 의 각도 인자는 float 가 아니라 `Angle` 구조체다. `BeginPath` / `Stroke` 를 짝지어 호출해야 그려진다.',
        'USS 에는 gradient·box-shadow·filter 가 없다. 발광은 머티리얼(_Intensity)과 Bloom 이 맡고, USS 는 색·투명도·크기만 다룬다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Dead Space (2008)',
      credit: '© Electronic Arts Inc.',
      borrowed: ['레이아웃 구조'],
      learned: '체력을 등의 척추를 따라 세로로, 능력 자원을 등의 둥근 바로, 산소는 진공에서만 나타나게 해서 **세 지표를 슈트 하나에 통합한 배치 구조**를 참고했다. 몰입을 지키려고 상태 표시를 캐릭터 뒤에 둔 해법은 3인칭 카메라가 늘 등을 비춘다는 전제와 맞물린다(출처: Wikipedia·GameRant — 참고 자료 목록, 화면 세부는 직접 확인하지 못함). 원작의 색 단계, 슈트 형태, 고유 용어는 가져오지 않았다. 2023 리메이크는 다루지 않는다.',
      link: 'https://gdcvault.com/play/1017723/Crafting-Destruction-The-Evolution-of',
    },
    {
      title: 'Hardspace: Shipbreaker (2022)',
      credit: '© Blackbird Interactive',
      borrowed: [],
      learned: '비교 사례. 몸이 아니라 헬멧 바이저·장비 화면에 자원을 띄워 1인칭에서도 각도와 상관없이 읽히게 하는 방향을 "바이저 투영형" 모드의 출발점으로 삼았다. 1인칭 시점은 공식 상점 페이지로 확인했지만 바이저 HUD 의 구체 요소는 검증하지 못해(미확인) 시각 축은 빌리지 않고 장르 관례로만 다뤘다.',
      link: 'https://store.steampowered.com/app/1161580/Hardspace_Shipbreaker/',
    },
  ],
  original:
    '캐릭터는 캡슐·원기둥으로 조립한 오리지널 정비사 마네킹(도윤)이고, 무대는 이 갤러리의 궤도 정비 기지 격납고다. 체력은 갈비뼈·척추 모양 대신 **육각 배터리 셀**을 세로로 쌓았고, 동력은 등 아래쪽을 감싸는 **반원 보조 동력 코일**, 산소는 "O2" 글자 대신 물방울과 압력계를 합친 글리프로 표시한다. 민트→앰버→적색 3단계 팔레트와 접근성용 사선 무늬, 바이저의 얇은 곡면 프레임·브래킷, 손목 화면, 각도 보조 미니 게이지(80°/65° 히스테리시스), 등판 가시성 디버그 인셋은 모두 이 갤러리에서 새로 만든 것이다.',
  references: [
    { label: 'GDC Vault — Crafting Destruction: The Evolution of the Dead Space User Interface (Dino Ignacio, 2013)', url: 'https://gdcvault.com/play/1017723/Crafting-Destruction-The-Evolution-of' },
    { label: 'EA 공식 — Dead Space', url: 'https://www.ea.com/games/dead-space' },
    { label: 'Steam 공식 — Hardspace: Shipbreaker', url: 'https://store.steampowered.com/app/1161580/Hardspace_Shipbreaker/' },
    { label: 'GameRant — Dead Space HUD 가 독창적인 이유', url: 'https://gamerant.com/dead-space-hud-best-unique-creative/' },
    { label: 'Wikipedia — Dead Space (2008 video game)', url: 'https://en.wikipedia.org/wiki/Dead_Space_(2008_video_game)' },
    { label: '80.lv — 리브 슈트 디자인의 기술적 이유 (아트 디렉터 발언)', url: 'https://80.lv/articles/the-technological-reason-behind-the-ribbed-suit-design-in-dead-space' },
    { label: 'Wikipedia — Isaac Clarke (슈트 디자인 배경)', url: 'https://en.wikipedia.org/wiki/Isaac_Clarke' },
    { label: 'Unity 6.3 Manual — UI Toolkit World Space UI 만들기', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/ui-systems/create-world-space-ui.html' },
    { label: 'Unity 6.3 Scripting API — Painter2D.Arc', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.Painter2D.Arc.html' },
    { label: 'W3C — WCAG 2.3.1 번쩍임 기준 (초당 3회 이하)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold' },
  ],
  related: [
    { id: 'health-bar-trail', why: '같은 체력 정보를 화면 위 바 + 화면 효과(Screen Space)로 보여 주는 짝. 몰입 대신 늘 읽히는 쪽을 택한 해법과 비교해 보자' },
    { id: 'offscreen-waypoint', why: '월드 좌표 → 화면 좌표 투영과 "카메라 뒤" 판정을 다룬다. 이 표본의 등판 가시성(내적) 판정과 같은 수학' },
  ],
  flashes: true,
}
