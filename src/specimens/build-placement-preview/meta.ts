import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'build-placement-preview',
  title: '건설 배치 미리보기',
  titleEn: 'Build Placement Preview',
  group: 'G',
  order: 5,
  paradigms: ['spatial'],
  oneLiner: '건물을 집으면 고스트가 칸에 붙고, 놓기 전에 "여기 되나 · 왜 안 되나 · 어디까지 닿나" 를 색 · 무늬 · 글자 · 사거리로 보여 준다. 터치는 손가락 위로 띄워 끌고 확인 버튼으로 2단계',
  goals: [
    '포인터를 **화면 → 월드 → 칸** 으로 바꿔 고스트를 스냅하고, 본체가 포인터 가운데 오도록 원점을 잡을 수 있다',
    '배치 검사가 bool 이 아니라 **사유 enum** 을 돌려주게 만들고, 그 결과 하나로 틴트 · 빗금 · 문구 · 확인 버튼을 그릴 수 있다',
    '사거리 원과 **사거리 안에 드는 경로 칸** 을 미리 보여 배치 판단을 돕는 이유를 설명할 수 있다',
    '터치에서 고스트를 손가락 위로 띄우고 **끌기 → 확인** 2단계로 설치하는 흐름을 만들 수 있다',
  ],
  principles: ['즉각 피드백', '접근성', '인지 부하', '어포던스'],
  platforms: ['pc', 'mobile'],
  inputs: ['mouse', 'keyboard', 'touch'],
  genres: ['타워 디펜스', 'RTS · 전략', '생존 건설', '시티 빌더'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    {
      key: 'validityCue',
      label: '유효 · 무효 알림',
      type: 'select',
      default: 'full',
      options: [
        { value: 'full', label: '색 + 무늬 + 사유 문구' },
        { value: 'color', label: '색만 (빨강 · 초록)' },
        { value: 'after', label: '놓은 뒤에야 알림' },
      ],
      hint: '색만이면 색각 이상 사용자는 구분이 어렵고, 왜 안 되는지도 모른다. 놓은 뒤에야면 클릭이 헛수고가 된다',
    },
    {
      key: 'rangeMode',
      label: '사거리 표시',
      type: 'select',
      default: 'cells',
      options: [
        { value: 'cells', label: '원 + 사거리 안 경로 칸' },
        { value: 'circle', label: '원만' },
        { value: 'none', label: '없음' },
      ],
      hint: '포탑 · 센서탑의 사거리. "칸" 이면 원 안에 드는 드론 경로 칸을 금색으로 칠하고 개수를 센다',
    },
    { key: 'showAllRanges', label: '지은 탑 사거리도', type: 'toggle', default: true, hint: '배치하는 동안 이미 지은 포탑 · 센서탑의 사거리를 흐린 점선으로 함께 보인다 — 겹침 · 빈틈 판단' },
    {
      key: 'gridLines',
      label: '격자선',
      type: 'select',
      default: 'placing',
      options: [
        { value: 'placing', label: '배치 중에만' },
        { value: 'always', label: '늘' },
        { value: 'never', label: '안 보임' },
      ],
      hint: '평소에는 지형을 깨끗하게, 건물을 들었을 때만 칸을 보인다',
    },
    {
      key: 'inputDevice',
      label: '입력 방식',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: '자동 (터치면 2단계)' },
        { value: 'mouse', label: '마우스 · 키보드' },
        { value: 'touch', label: '터치 (끌기 → 확인)' },
      ],
      hint: '터치 방식은 무대를 마우스로 끌어도 시험할 수 있다',
    },
    { key: 'touchLiftPx', label: '터치 띄움 거리', type: 'range', min: 0, max: 220, step: 10, default: 120, unit: 'px', hint: '끄는 동안 고스트를 손가락보다 이만큼 위에 둔다. 0 이면 손가락에 가려 보이지 않는다' },
    { key: 'snapLerpMs', label: '칸 이동 보간', type: 'range', min: 0, max: 200, step: 10, default: 60, unit: 'ms', hint: '고스트가 다음 칸으로 미끄러지는 시간. 0 이면 뚝뚝 끊기고, 너무 길면 굼떠 보인다' },
    { key: 'startCredits', label: '처음 크레딧', type: 'range', min: 0, max: 400, step: 20, default: 260, unit: '크레딧', hint: '바꾸면 크레딧을 이 값으로. 초당 4씩 찬다. 모자란 건물은 목록에서 흐려진다' },
  ],
  presets: [
    {
      id: 'tower-defense',
      name: '타워 디펜스',
      look: '사거리 안 경로 칸까지, 지은 탑 사거리도 함께 — 어디가 덜 막혔는지 본다',
      values: { validityCue: 'full', rangeMode: 'cells', showAllRanges: true, gridLines: 'placing', inputDevice: 'auto', touchLiftPx: 120, snapLerpMs: 60, startCredits: 260 },
    },
    {
      id: 'builder',
      name: '생존 건설 · 경영',
      look: '격자는 늘, 사거리는 원만, 고스트는 칸마다 뚝뚝 — 정확한 자리 맞추기',
      values: { validityCue: 'full', rangeMode: 'circle', showAllRanges: false, gridLines: 'always', inputDevice: 'mouse', touchLiftPx: 120, snapLerpMs: 0, startCredits: 400 },
    },
    {
      id: 'touch',
      name: '터치 화면',
      look: '끌기 → 확인 2단계, 고스트를 더 높이 띄운다',
      values: { validityCue: 'full', rangeMode: 'cells', showAllRanges: true, gridLines: 'placing', inputDevice: 'touch', touchLiftPx: 160, snapLerpMs: 80, startCredits: 260 },
    },
  ],
  events: [
    { id: 'overlap', label: '겹치는 곳에 놓기' },
    { id: 'block-path', label: '드론 경로 위에 놓기' },
    { id: 'edge', label: '맵 가장자리 · 물가 (R 회전)' },
    { id: 'no-credits', label: '크레딧 부족' },
    { id: 'touch', label: '터치 모드 시연' },
    { id: 'reset', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'ghost',
      title: '화면 → 월드 → 칸 스냅',
      body: '포인터를 맵 좌표로 바꾸고, 본체가 포인터 가운데 오도록 **반 크기를 빼고 반올림**해 원점 칸을 얻는다. 고스트는 그 칸으로 `snapLerpMs` 동안 미끄러진다. Unity: `Camera.ScreenPointToRay` + 평면 교차(직교 2D 면 `ScreenToWorldPoint`) → `Grid.WorldToCell`. 효과를 끄면 고스트는 픽셀 위치에, 설치는 포인터 칸을 왼쪽 위로 — 2×2 가 반 칸 밀려 지어진다.',
      principle: '즉각 피드백',
      pin: 'left',
    },
    {
      n: 2,
      part: 'reason',
      title: '사유 enum → 색 + 무늬 + 글자',
      body: '검사는 `canPlace` bool 이 아니라 **사유 하나**(맵 밖 · 물 · 겹침 · 드론 경로 · 크레딧)를 돌려준다. 그 결과 하나로 틀(실선/점선), 사유마다 다른 아이콘, 문구, **문제 칸만 빗금**을 그린다 — 색을 못 구분해도 어느 칸이 왜 안 되는지 안다. 오른쪽 아래 "검사 결과" 가 지금 enum 값이다.',
      principle: '접근성',
    },
    {
      n: 3,
      part: 'range',
      title: '사거리 원 + 닿는 경로 칸',
      body: '포탑 3.5칸 · 센서탑 5칸. 원만으로는 "얼마나 덮는지" 세기 어려워, 원 안에 드는 **드론 경로 칸을 금색으로 칠하고 개수**를 적는다. 배치하는 동안 이미 지은 탑의 사거리도 흐린 점선으로 보여 겹침과 빈틈을 비교하게 한다.',
      principle: '인지 부하',
    },
    {
      n: 4,
      part: 'confirm',
      title: '터치는 띄우고 · 확인 2단계',
      body: '끄는 동안 고스트를 손가락보다 `touchLiftPx` 위에 띄우고 점선으로 잇는다. 손을 떼도 짓지 않고 **확인 · 취소** 를 띄운다. 안 되는 자리면 확인이 "설치 불가" 로 잠긴다. 효과를 끄면 고스트가 손가락 밑에 가리고 떼는 순간 설치 — "터치 모드 시연" 으로 비교.',
      principle: '어포던스',
      pin: 'right',
    },
    {
      n: 5,
      part: 'palette',
      title: '못 사는 건물은 고르기 전에',
      body: '크레딧이 모자란 건물은 흐리게 + 자물쇠 + "N 부족". 고르면 흔들리며 이유를 말하고 **집기 상태로 들어가지 않는다**. 효과를 끄면 멀쩡해 보여 끝까지 끌어 놓은 뒤에야 "설치할 수 없습니다" — "크레딧 부족" 으로 비교.',
      principle: '즉각 피드백',
      pin: 'left',
    },
  ],
  mistakes: [
    { title: '스냅 없는 고스트', body: '고스트를 포인터 픽셀 위치에 그리고 설치만 칸에 맞추면, 놓는 순간 건물이 다른 자리로 튄다. 고스트와 설치는 같은 원점 칸 하나를 쓴다.' },
    { title: 'bool 하나짜리 검사', body: '`CanPlace()` 가 true/false 만 돌려주면 화면은 빨강밖에 못 그린다. 사유와 문제 칸을 돌려줘야 "왜 · 어디가" 를 말할 수 있다.' },
    { title: '색만으로 구분', body: '빨강 · 초록은 색각 이상 사용자에게 같은 색일 수 있다. 테두리 모양 · 빗금 · 아이콘 · 글자를 함께 쓴다.' },
    { title: '놓은 뒤에야 거절', body: '클릭한 다음에 "설치 불가" 를 띄우면 손이 헛수고를 한다. 검사는 고스트가 움직일 때마다 미리 한다.' },
    { title: '손가락 밑 즉시 설치', body: '터치에서 손을 떼는 순간 지으면 손가락에 가려 못 본 자리에 짓는다. 고스트를 위로 띄우고 확인 버튼으로 한 번 더 받는다. 띄우는 거리는 화면 아래 가장자리에서 남은 높이만큼으로 줄인다 — 늘 같은 거리면 맨 아래 줄에 닿을 수 없다.' },
    { title: '경로 칸 검사 = 길 막힘 검사로 착각', body: '이 표본은 경로가 정해진 타워 디펜스라 "경로 칸 위에 못 짓는다" 만 본다. 자유 배치로 미로를 만드는 게임이면 건물을 임시로 놓고 입구 → 기지를 BFS 로 찾아, 길이 없으면 별도 사유(`BlocksPath`)를 돌려줘야 한다 (이 표본 범위 밖).' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 고스트는 칸에 붙지 않고 포인터 픽셀 위치를 따라다니며, 색 · 무늬 · 사유 문구 · 사거리 없이 늘 흰색이다. 클릭하면 포인터 칸을 왼쪽 위로 지어 2×2 건물이 반 칸 밀리고, 안 되는 자리면 그제야 "설치할 수 없습니다" 만 뜬다(이유 없음). 크레딧이 모자란 건물도 멀쩡히 골라진다. 터치는 고스트가 손가락 밑에 가리고, 손을 떼는 즉시 설치된다. 검사 결과 칸은 `canPlace` bool 하나이고, 놓아 봐야 값이 나온다.',
  timings: [
    { event: '고스트 칸 이동', ms: 60, easing: '지수 감쇠 1 − e^(−3000/ms · dt)', note: '권장값. 0 이면 끊기고 150 넘으면 굼뜨다' },
    { event: '거절 흔들림', ms: 350, easing: 'sin · 줄어드는 폭', note: '권장값' },
    { event: '알림 문구', ms: 2800, easing: '—', note: '권장값' },
    { event: '비용 숫자 떠오름', ms: 1100, easing: 'linear', note: '권장값' },
  ],
  unity: {
    ugui: {
      hierarchy: `Main Camera (Orthographic — 맵을 위에서 본다)
Grid (Grid · Cell Size 1×1)
├─ Ground · Water · Path (Tilemap + TilemapRenderer ×3)
└─ GridOverlay (SpriteRenderer Tiled — 격자선)
PlacementController (PlacementController.cs — 지은 건물 · 경로 표시 · 다른 탑 사거리는 실행 중 이 아래에 만든다. 건물 프리팹의 피벗 = 본체 중심, 패드는 자식)
└─ Ghost (빈 Transform — 원점 칸으로 미끄러진다. 칸 · 빗금 SpriteRenderer 는 실행 중 이 아래에 풀로 만든다)
   ├─ Art (SpriteRenderer — 건물 그림)
   └─ RangeCircle (SpriteRenderer — 지름 1 원, 사거리 × 2 로 스케일)
Canvas_Hud (Screen Space - Overlay · Canvas Scaler 1920×1080 · PlacementHud.cs — 실행 순서 100, 컨트롤러 뒤에)
├─ CreditsText (TextMeshProUGUI)
├─ Palette > Item ×3 (Button + CanvasGroup · Icon · Name · CostText · Lock)
├─ ReasonPanel (틀 Image 실선/점선 · Icon Image · ReasonText TMP — 자식 Image · TMP 까지 Raycast Target 끔. Pivot 은 코드가 위/아래로 바꾼다)
├─ ConfirmGroup (Button 확인 + ConfirmText · Button 취소. Pivot 은 코드가 오른쪽/왼쪽으로 바꾼다)
└─ NoteText (TextMeshProUGUI — 거절 알림, Raycast Target 끔)
EventSystem (InputSystemUIInputModule)
PlacementDemo (PlacementDemo.cs — 지도 칠하기 · 처음 건물 3채 · 크레딧 수입)
BuildingData 에셋 ×3 (PlacementTypes.cs — 방어 포탑 · 센서탑 · 수리 기지)`,
      steps: [
        '화면 → 월드: `cam.ScreenPointToRay(포인터)` 와 `new Plane(Vector3.back, Vector3.zero)` 를 `Raycast` 로 교차한다. 직교 2D 카메라면 `cam.ScreenToWorldPoint` 로도 같다.',
        '월드 → 칸: 본체가 포인터 가운데 오도록 `(1 − 크기) / 2` 칸 옮겨 `grid.WorldToCell`. 고스트는 `grid.CellToWorld(원점)` 으로 `1 − exp(−3000 / snapLerpMs · dt)` 만큼 따라간다.',
        '`PlacementValidator.Validate(건물, 원점, 회전, 크레딧)` → `PlacementCheck { reason, badCells, other, shortBy }`. 칸마다 `CellReason` 을 보고 enum 순서가 가장 큰 사유(맵 밖 > 물 > 겹침 > 경로)를 고르고, 자리가 괜찮을 때만 크레딧을 본다. 순수 C# 라 EditMode 테스트로 따로 확인할 수 있다.',
        '`Refresh()` 가 칸 SpriteRenderer 를 틴트하고 `badCells` 칸에만 빗금을 겹친다. 사거리 원은 `rangeCells × 2` 로 스케일, `PathInRange` 로 사거리 안 경로 칸에 표시를 놓는다. 회전(R)은 `BuildingData.Footprint(rot)` 로 패드 오프셋을 돌린다.',
        '`PlacementHud` 는 `Changed` 를 듣고 `chk.Text(건물)` · 사유 아이콘 · 틀을 바꾸고, `LateUpdate` 에서 `WorldToScreenPoint(LabelAnchor)` 를 그대로 `rt.position` 에 넣는다 (Overlay 캔버스는 화면 px = 월드 위치. Camera 캔버스면 `RectTransformUtility.ScreenPointToLocalPointInRectangle`). 앵커는 패드까지 포함한 발자국 테두리 기준이고, 화면 가장자리에 닿으면 `LabelBelow` · `ButtonsLeft` 로 반대쪽에 붙인다.',
        '터치(`Pointer.current is Touchscreen` 또는 `inputDevice = Touch`): 누르는 동안 `포인터 + min(touchLiftPx × Screen.height / 1080, 포인터 y)` 를 겨누고(아래 가장자리에서는 덜 띄운다), 떼면 `Pending` → ConfirmGroup. 확인 버튼은 `interactable = chk.Ok`. 살 수 없는 건물은 `Begin` 이 거절하고 `Rejected` 로 이유를 보낸다.',
      ],
      pitfalls: [
        '`WorldToCell(포인터)` 를 그대로 원점으로 쓰면 2×2 가 포인터의 오른쪽 위로 붙는다. 고스트를 픽셀 위치에 그리면 놓은 뒤 반 칸 밀린다.',
        '목록 버튼을 누른 클릭이 그대로 맵에 설치되는 실수 — 포인터가 UI 위면(`IsOverUI` = `EventSystem.RaycastAll`) 고스트를 움직이거나 짓지 않는다.',
        '지은 건물을 `CellToWorld(원점)`(칸 모서리)에 만들고 프리팹 피벗이 중심이면 반 칸(2×2 는 한 칸) 밀리고, 회전하면 다른 칸으로 돈다. 고스트와 같이 **본체 중심**에 만들고 그 점을 기준으로 돌린다.',
        '경로 칸 검사는 길 막힘 검사가 아니다. 자유 배치 미로형이면 임시로 점유한 뒤 입구 → 기지 BFS, 길이 없으면 `BlocksPath` 사유를 따로 둔다.',
        '사유 문구의 Image · TMP 가 Raycast Target 이면 `RaycastAll` 에 잡혀, 포인터가 문구 위에 오는 순간 고스트가 멈추고 클릭이 설치되지 않는다. 고스트를 따라다니는 UI 는 자식까지 끈다.',
        '`PlacementCheck.badCells` 를 검사기 안의 리스트 하나로 돌려쓰면 다음 검사가 이전 결과를 덮는다. 결과마다 새 리스트(또는 복사)로.',
        '`OnDisable` 에서 `Changed` 구독 · 버튼 리스너 · `IsOverUI` 를 풀지 않으면 꺼진 HUD 가 계속 불린다. 컨트롤러도 꺼질 때 `Cancel()` 로 끌던 고스트를 정리한다.',
      ],
    },
    uitk: {
      hierarchy: `월드 쪽은 UGUI 판과 같다 (Grid · Tilemap · PlacementController · PlacementDemo). Canvas_Hud 대신:
UIDocument (Panel Settings: Scale With Screen Size 1920×1080 · PlacementHudUITK.cs)
└─ PlacementHud.uxml
   └─ #hud (.hud · picking-mode Ignore)
      ├─ .top > .credits (#credits) · #hint
      ├─ #palette (.palette — C# 가 BuildingData 마다 Button .item 을 만든다)
      ├─ #reason (.reason > #reason-icon · #reason-text — picking-mode Ignore)
      ├─ #confirm (.confirm > Button #confirm-ok · #confirm-no)
      └─ #note`,
      steps: [
        '고스트를 따라가는 `#reason` · `#confirm`: `RuntimePanelUtils.CameraTransformWorldToPanel(panel, 월드 점, 카메라)` 로 패널 좌표를 얻어 `style.left/top` 에 넣는다. `.reason` 은 USS `translate: -50% -100%` 로 아래 가운데가 그 점에 온다. 화면 가장자리면 컨트롤러의 `LabelBelow` · `ButtonsLeft` 에 맞춰 수식 클래스 below · left 로 translate 를 바꾼다. HUD 는 `DefaultExecutionOrder(100)` 으로 컨트롤러 다음에 따라간다.',
        '`controller.IsOverUI` 에 `panel.Pick(RuntimePanelUtils.ScreenToPanel(panel, (x, Screen.height − y)))` 를 넣는다 — 화면은 y 가 위로, 패널은 아래로 +.',
        '사유는 `.reason` 의 수식 클래스 bad 와 `#reason-icon` 의 `style.backgroundImage`(사유마다 다른 Sprite), 문구는 `chk.Text(건물)`. 확인 버튼은 `SetEnabled(chk.Ok)`.',
        '목록 Button 은 `OnEnable` 에서 만들고 `OnDisable` 에서 `palette.Clear()` 로 람다와 함께 버린다. 살 수 없으면 수식 클래스 locked.',
      ],
      pitfalls: [
        'USS 에는 점선 테두리가 없다. 무효 표시를 테두리 모양에만 맡기지 말고 사유 아이콘 · 글자로.',
        '`#hud` 를 `picking-mode Ignore` 로 두지 않으면 화면 전체가 UI 로 잡혀 맵을 누를 수 없다.',
        '`ScreenToPanel` 에 y 를 뒤집지 않은 화면 좌표를 넣으면 위아래가 바뀐 곳을 판정한다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Bloons TD 6 (2018)',
      credit: '© Ninja Kiwi',
      borrowed: [],
      learned: '자유 배치 타워 디펜스의 대표 예로 들었다. 배치 중 사거리 · 무효 표시의 실제 모양은 이 표본 제작 중 화면으로 확인하지 못했다(미확인) — 장르 관례로만 다뤘다.',
    },
    {
      title: 'Kingdom Rush (2011)',
      credit: '© Ironhide Game Studio',
      borrowed: [],
      learned: '정해진 건설 자리를 고르는 방식이라 자유 배치의 "무효 사유" 자체를 줄이는 대안으로 비교했다. 화면 세부는 미확인.',
    },
  ],
  original:
    '맵(드론 경로 · 호수), 건물 세 가지와 수치, 착륙 패드 회전, 사유 아이콘, 빗금 · 점선 표시, 사거리 안 경로 칸 강조, 터치 띄움 · 확인 버튼 배치, 검사 결과 enum 패널, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다. 공개 데브로그 두 편이 말하는 원리(사거리 미리보기, 칸 스냅 · 경로 금지)를 참고했다.',
  references: [
    { label: 'JustD 데브로그 — 배치 표시에 사거리 표시 추가 (itch.io)', url: 'https://fairytalesgames.itch.io/justd/devlog/817232/range-indicator-added-to-placement-indicator' },
    { label: 'Wave Breakers 데브로그 — 칸 스냅 · 경로 금지 배치 (itch.io)', url: 'https://syntaxsurfers.itch.io/wave-breakers-firstperson-strategy-hybrid-tower-defense/devlog/1035728/lines-and-boxes-everything-has-its-place' },
    { label: 'Unity 6.3 — Grid.WorldToCell', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/GridLayout.WorldToCell.html' },
    { label: 'Unity 6.3 — RuntimePanelUtils.CameraTransformWorldToPanel', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.RuntimePanelUtils.CameraTransformWorldToPanel.html' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/full-list/' },
  ],
  related: [
    { id: 'inventory-grid-tooltip', why: '같은 "칸에 놓을 수 있나" 문제를 UI 격자에서 — 끌어서 놓기와 놓을 칸 표시' },
    { id: 'card-hand-targeting', why: '놓기 전에 결과를 미리 보이기 · 못 쓰는 것은 집기 전에 거절' },
    { id: 'virtual-joystick-touch-layout', why: '손가락에 가리는 영역과 터치 조작 배치' },
  ],
}
