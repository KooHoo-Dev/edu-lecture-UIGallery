import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'skill-tree',
  title: '스킬트리 · 성장 노드',
  titleEn: 'Skill Tree',
  group: 'E',
  order: 7,
  paradigms: ['menu', 'meta'],
  oneLiner: '잠김 · 습득 가능 · 습득 · 최대를 모양 · 테두리 · 표식 · 글자로 함께 말하고, 멀리서는 아이콘만 · 가까이서는 이름과 수치를 보여 주는 팬 · 줌 노드 트리',
  goals: [
    '노드 상태 네 가지를 **색 하나에 맡기지 않고** 모양 · 테두리 · 표식 · 글자(2/3)로 함께 구분할 수 있다',
    '트리를 **표(TSV) 한 장**으로 정의하고, 선행 검사 · 습득 · 되돌리기 · 전체 초기화(환불)를 화면과 분리한 순수 함수로 만들 수 있다',
    '팬 · 줌에서 글자를 함께 축소하지 않고 **확대 단계마다 보여 줄 정보를 바꾸는(LOD)** 방식으로 읽을 수 없는 글자를 없앨 수 있다',
    '노드 툴팁에 지금 효과 · 다음 단계 수치 · 필요한 선행(✓ ✗)을 담아, 눌러 보기 전에 결과를 알게 할 수 있다',
  ],
  principles: ['가독성', '접근성', '인지 부하', '어포던스', '즉각 피드백'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['mouse', 'keyboard', 'gamepad', 'touch'],
  genres: ['액션 RPG', 'RPG', '로그라이트', '모바일 RPG'],
  difficulty: 3,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'points', label: '보유 포인트', type: 'range', min: 6, max: 32, step: 1, default: 14, unit: '점', hint: '트리 전체를 채우려면 32점. 적으면 습득 가능 노드가 금방 "포인트 부족" 으로 바뀌고 강조 고리가 꺼진다' },
    {
      key: 'stateCue',
      label: '상태 표시',
      type: 'select',
      default: 'full',
      options: [
        { value: 'full', label: '모양 + 테두리 + 표식 + 글자' },
        { value: 'color-only', label: '색만 (나쁜 예)' },
      ],
      hint: '색만으로 바꾸면 점선 · 고리 · 자물쇠 · 1/3 이 모두 사라진다. 잠김(회청)과 습득 가능(청)이 거의 같은 색이라 눌러 봐야 안다',
    },
    {
      key: 'labelMode',
      label: '노드 글자',
      type: 'select',
      default: 'lod',
      options: [
        { value: 'lod', label: '확대 단계별 (멀리 아이콘 · 중간 단계 · 가까이 이름)' },
        { value: 'always', label: '항상 이름 · 수치 (글자 크기는 그대로)' },
      ],
      hint: '항상 표시로 두고 축소하면 글자는 읽히는 크기지만 이웃 노드의 이름과 겹친다. 글자를 줄이지 않으려면 보여 줄 정보를 줄여야 한다',
    },
    { key: 'highlightAvailable', label: '습득 가능 강조', type: 'toggle', default: true, hint: '지금 바로 살 수 있는 노드(선행 충족 + 포인트 충분)에 1Hz 로 퍼지는 고리, 그 노드로 가는 연결선에 흐르는 점선' },
    {
      key: 'refundRule',
      label: '되돌리기 규칙',
      type: 'select',
      default: 'free',
      options: [
        { value: 'free', label: '한 단계씩 (선행을 깨지 않는 한)' },
        { value: 'reset-only', label: '전체 초기화만' },
      ],
      hint: '한 단계씩: 우클릭 · Backspace 로 1단계 환불. 다른 습득 노드의 선행이면 막고 이유를 보여 준다. 전체 초기화만: 개별 되돌리기 버튼이 꺼진다',
    },
    { key: 'startZoom', label: '처음 확대', type: 'range', min: 0.4, max: 1.6, step: 0.05, default: 0.75, unit: '배', hint: '0.65 미만은 멀리(아이콘 + 표식), 1 이상은 가까이(이름 · 다음 수치). 바꾸면 트리 가운데로 다시 맞춘다' },
  ],
  presets: [
    {
      id: 'action-rpg',
      name: '액션 RPG 성장 트리',
      look: '포인트 넉넉, 한 단계씩 되돌리기. 중간 확대에서 시작해 단계(1/3)가 한눈에 보인다',
      values: { points: 20, stateCue: 'full', labelMode: 'lod', highlightAvailable: true, refundRule: 'free', startZoom: 0.75 },
    },
    {
      id: 'committed-build',
      name: '되돌릴 수 없는 성장',
      look: '포인트 10, 전체 초기화만. 강조를 꺼 플레이어가 툴팁을 읽고 고르게 한다',
      values: { points: 10, stateCue: 'full', labelMode: 'lod', highlightAvailable: false, refundRule: 'reset-only', startZoom: 1.1 },
    },
    {
      id: 'overview',
      name: '전체 조망에서 시작',
      look: '가장 멀리서 시작 — 글자 없이 아이콘과 상태 표식만으로 트리 모양을 읽는다',
      values: { points: 14, stateCue: 'full', labelMode: 'lod', highlightAvailable: true, refundRule: 'free', startZoom: 0.45 },
    },
    {
      id: 'color-only',
      name: '색만으로 상태 구분 (비교용)',
      look: '모양 · 표식 · 글자를 뺀 트리. 잠김과 습득 가능을 색으로만 가려야 한다',
      values: { points: 14, stateCue: 'color-only', labelMode: 'lod', highlightAvailable: false, refundRule: 'free', startZoom: 0.75 },
    },
    {
      id: 'labels-always',
      name: '항상 이름 표시 (비교용)',
      look: '축소해도 이름 · 수치를 다 그린다. 글자 크기는 지켰지만 서로 겹친다',
      values: { points: 14, stateCue: 'full', labelMode: 'always', highlightAvailable: true, refundRule: 'free', startZoom: 0.5 },
    },
  ],
  events: [
    { id: 'learn', label: '습득 가능한 노드 하나 습득' },
    { id: 'locked-try', label: '잠긴 노드 눌러 보기' },
    { id: 'refund', label: '마지막 습득 한 단계 되돌리기' },
    { id: 'reset', label: '전체 초기화 (환불)' },
    { id: 'zoom-out', label: '멀리 보기 (정보 단계: 아이콘)' },
    { id: 'zoom-in', label: '고른 노드 가까이 (이름 · 수치)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'states',
      title: '상태 네 가지를 네 가지 방법으로',
      body: '잠김은 **점선 원 + 자물쇠 + "잠김"**, 습득 가능은 **밝은 고리 + ＋ + "0/3"**, 습득은 **채운 원 + 반원 + "1/3"**, 최대는 **육각 이중 테두리 + 별 + "최대"**. 색을 못 구분해도, 멀리서 글자가 없어도 모양과 표식이 남는다. "상태 표시" 를 **색만**으로 바꿔 보자 — 잠김과 습득 가능이 같은 파란 원이 된다.',
      principle: '접근성',
      pin: 'left',
    },
    {
      n: 2,
      part: 'lod',
      title: '글자를 줄이지 말고 정보를 줄인다',
      body: '확대 배율은 노드 **좌표**에만 곱하고, 글자 · 표식은 화면 px 그대로 둔다. 대신 배율에 따라 보여 줄 것을 바꾼다: 0.65 미만은 아이콘 + 상태 표식, 1 미만은 + 단계(1/3), 그 이상은 + 이름 · 다음 수치. 막대 끝 글은 지금 노드 글자의 **실제 크기**다. 효과를 끄면 트리 전체를 `scale()` 해 이 숫자가 10px 까지 떨어진다.',
      principle: '가독성',
      pin: 'below',
    },
    {
      n: 3,
      part: 'available',
      title: '지금 살 수 있는 것만 움직인다',
      body: '선행을 채웠고 **포인트도 충분한** 노드에만 1Hz 로 퍼지는 고리를 단다. 그 노드로 가는 연결선은 흐르는 점선, 습득한 길은 굵은 실선, 아직 먼 길은 흐린 점선이다. 선행은 채웠지만 포인트가 모자라면 고리 없이 테두리만 남아 "갈 수는 있는데 지금은 못 산다" 가 갈린다.',
      principle: '어포던스',
    },
    {
      n: 4,
      part: 'tooltip',
      title: '누르기 전에 결과를 알려 주는 툴팁',
      body: '지금 효과, **다음 단계 수치**와 비용, **필요한 선행**을 ✓ ✗ 로 보여 준다. 선행이 둘이면 "(모두)" 라고 적는다. 잠긴 노드를 누르면 흔들리면서 빠진 선행 노드와 그 연결선이 빨갛게 표시된다. 툴팁은 네 방향 중 **노드를 덜 가리는 쪽**(선행 노드는 3배로 센다)에 두고, 넘치면 뒤집고 창 안에 고정한다([인벤토리 툴팁](#/s/inventory-grid-tooltip)과 같은 배치 함수).',
      principle: '인지 부하',
      pin: 'below',
    },
    {
      n: 5,
      part: 'data',
      title: '트리는 표 한 장, 규칙은 순수 함수',
      body: '노드 하나가 표의 한 줄(id · 이름 · 갈래 · 최대 단계 · 선행 · 비용 · 위치 · 아이콘 · 효과 · 단계별 수치)이다. 엑셀에서 짜서 붙여 넣으면 트리가 바뀐다. 선행 검사 `checkLearn`, 되돌리기 검사 `checkRefund`, 환불 `refundAll` 은 화면을 모르는 함수라 테스트하기 쉽고, Unity 판도 같은 표를 `TextAsset` 으로 읽어 같은 규칙을 쓴다.',
      principle: '인지 부하',
      pin: 'left',
    },
  ],
  mistakes: [
    { title: '색만으로 상태 구분', body: '잠김 · 습득 가능 · 습득을 회색 · 파랑 · 초록으로만 나누면 색각에 따라, 또는 어두운 화면에서 잠김과 습득 가능을 헷갈린다. 모양(원 · 육각) · 테두리(점선 · 고리) · 표식 · 단계 글자를 함께 쓴다.' },
    { title: '트리 전체를 scale() 로 축소', body: '확대 · 축소를 컨테이너 크기 조절 하나로 끝내면 26px 글자가 0.45배에서 12px 이 된다. 좌표만 확대하거나(웹) 글자 묶음에 확대의 역수를 곱해(Unity) 화면 크기를 지키고, 대신 단계별로 정보를 줄인다.' },
    { title: '축소해도 모든 글자를 다 그림', body: '글자 크기를 지켜도 노드 간격이 좁아지면 이름끼리 겹쳐 읽을 수 없다. "항상 이름 표시 (비교용)" 프리셋에서 볼 수 있다. 멀리서는 아이콘 · 표식만 남긴다.' },
    { title: '선행을 깨는 환불', body: '한 단계씩 되돌리기를 허용하면서 검사를 빼면, 상위 노드는 남고 선행만 사라진 "떠 있는 노드" 가 생긴다. 마지막 1단계를 빼기 전에 이 노드를 선행으로 쓰는 습득 노드가 있는지 보고, 있으면 막고 이름을 알린다.' },
    { title: '규칙을 버튼 코드 안에 씀', body: '선행 검사와 포인트 계산이 클릭 처리기 안에 흩어지면 키보드 · 패드 · 자동 데모 · 툴팁이 서로 다른 판정을 한다. 규칙 함수 하나를 모두가 부른다.' },
  ],
  juiceOff:
    '흔한 실수인 **트리 전체 축소**다. 노드 좌표만 확대하던 것을 트리 층 전체의 `transform: scale()` 로 바꾸고 확대 단계별 정보 전환도 끈다. 그래서 기본 배율 0.75 에서 노드 이름이 약 20px, "멀리 보기" 에서는 약 12px 로 작아져 읽을 수 없다. 확대 막대 끝에 실제 글자 크기가 빨갛게 나온다. 상태 표시 · 강조 · 툴팁은 그대로 둬서 글자 크기 차이만 비교한다.',
  timings: [
    { event: '버튼 · 키 확대 (화면 점 고정)', ms: 300, easing: '지수 감쇠 (λ = 14)', note: '권장값. 휠 · 핀치는 입력마다 즉시' },
    { event: '노드 따라가기 · 맞춤', ms: 450, easing: '지수 감쇠 (λ = 9)', note: '권장값' },
    { event: '습득 가능 고리', ms: 1000, easing: 'ease-out 반복', note: '1Hz — 반복 맥동 2Hz 이하 기준' },
    { event: '잠긴 노드 흔들림', ms: 400, easing: 'ease-out', note: '권장값. 좌우 7px 이하' },
    { event: '초기화 포인트 강조', ms: 500, easing: 'ease-out', note: '권장값. 한 번만' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas (Canvas Scaler: Scale With Screen Size 1920×1080)
├─ TreeScroll (ScrollRect · Clamped · Scroll Sensitivity 0 + SkillTreeView.cs + SkillTreeDemo.cs)
│  ├─ Viewport (RectMask2D)
│  │  └─ Content (앵커 · 피벗 왼쪽 위 · localScale = 확대 배율, 크기는 코드가)
│  │     ├─ Edges (빈 RectTransform · 늘이기 — 연결선이 노드 아래에)
│  │     └─ Nodes (빈 RectTransform · 늘이기 — SkillNodeView 프리팹들)
│  ├─ Tooltip (VerticalLayoutGroup + ContentSizeFitter · 피벗 왼쪽 위 · CanvasGroup blocksRaycasts 끔)
│  │  └─ TipTitle · TipBody (TMP · Rich Text)
│  └─ ZoomBar (Button − · ZoomText · Button + · Button 맞춤)
├─ Side > PointsText · ToastText (TMP) · Button 습득 · 되돌리기 · 전체 초기화
└─ EventSystem (InputSystemUIInputModule)
Prefab_Node (Button + SkillNodeView.cs · 96×96)
├─ PulseRing · Frame · Shape > Icon · Badge · FocusRing (Image, Raycast 끔 — Shape 만 켬)
└─ Labels (피벗 위 가운데, 노드 아래) > NameText · RankText · NextText (TMP)
Prefab_Edge (Image · 높이 6 · Raycast Target 끔)
skill-tree.txt (TextAsset · 탭 구분 표 — 웹 판 tree.ts 와 같은 내용. 비우면 DefaultTsv)`,
      steps: [
        '엑셀에서 한 줄에 노드 하나로 짠 표를 탭 구분 텍스트 `skill-tree.txt` 로 저장해 `SkillTreeView.table` 에 넣는다(`.tsv` 확장자는 TextAsset 으로 임포트되지 않는다). 비우면 코드 안의 `DefaultTsv`(웹 판과 같은 표). 인스펙터에서 고치려면 `[Serializable]` 인 `SkillNode` 목록을 ScriptableObject 에 두어도 규칙 코드는 그대로다.',
        '`SkillTreeData.Parse()` 는 없는 선행 id 가 있으면 바로 예외를 낸다. 숫자는 `CultureInfo.InvariantCulture` 로 읽어 쉼표 소수점 지역에서도 `2.5` 가 깨지지 않는다.',
        '규칙은 `SkillProgress` 한 곳에: `CheckLearn`(최대 → 선행 → 포인트), `CheckRefund`(마지막 1단계를 빼면 고아가 생기는가), `ResetAll`(쓴 포인트 전부 환불). 툴팁 · 안내 문구도 여기서 만들어 두 화면이 같은 문장을 쓴다. 바뀌면 `Changed` 이벤트로 다시 그린다.',
        '연결선은 피벗을 왼쪽 가운데에 둔 Image 를 두 노드 거리만큼 늘리고 `Atan2` 각도로 돌린다([분기 경로 맵](#/s/branching-route-map)과 같은 방식). Edges 를 Nodes 보다 먼저 두어 선이 노드 아래에 그려지게 한다.',
        '팬은 `ScrollRect` 가, 줌은 Content 의 `localScale` 이 맡는다. 휠(`IScrollHandler`)이 오면 포인터 아래 Content 좌표를 확대 전후로 재서 그 차이만큼 `anchoredPosition` 을 옮긴다 — 포인터 아래의 노드가 제자리에 남는다.',
        '확대해도 글자를 지키려면 각 노드의 **Labels · Badge 에 `1 / 배율`** 을 곱한다. 그리고 배율이 0.65 미만이면 Labels 를 끄고, 1 미만이면 이름 · 다음 수치를 끈다. `keepTextSize` 를 끄면 나쁜 예(글자도 함께 축소)를 볼 수 있다.',
        '노드 Button 은 `transition = None` 이라 선택 색이 없다. `SkillNodeView` 가 `ISelectHandler` · `IDeselectHandler` 로 FocusRing 을 켜고 툴팁을 띄운다. Navigation 은 Automatic — 화면 위치로 가장 가까운 노드를 고른다.',
      ],
      pitfalls: [
        'ScrollRect 는 휠로도 스크롤한다. 휠을 줌에 쓰려면 `scrollSensitivity = 0` 으로 끄고 같은 오브젝트의 `IScrollHandler` 에서 받는다.',
        '`Clamped` 는 Content 가 창보다 작아지면 왼쪽 위로 붙인다. 최소 배율을 트리가 창에 맞는 값 근처로 두거나 Content 에 여백을 준다.',
        '툴팁을 Content 아래에 두면 함께 확대되고 마스크에 잘린다. Viewport 의 형제로 두고, 크기는 `LayoutRebuilder.ForceRebuildLayoutImmediate` 후에 읽는다.',
        '규칙(선행 · 포인트)을 Button 의 `interactable` 로만 막으면 잠긴 노드의 툴팁을 볼 수 없다. 모든 노드를 고를 수 있게 두고, 누르면 이유를 알린다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + SkillTreeUITK.cs
└─ SkillTree.uxml
   └─ #screen
      ├─ Label .title
      └─ .body
         ├─ #viewport (.viewport · overflow hidden)
         │  ├─ #world (.world · transform-origin 왼쪽 위 — C# 가 translate · scale)
         │  │  ├─ EdgeLayer (C# · generateVisualContent + Painter2D, picking-mode Ignore)
         │  │  └─ Button .node × N > .node__ring · .node__focus · .node__shape > .node__icon · .node__badge · .node__labels (C# 가 만든다)
         │  ├─ #tooltip (picking-mode Ignore) > Label #tip-title · Label #tip-body
         │  └─ .zoombar > Button #btn-out · Label #zoom · Button #btn-in · Label #lod
         └─ .side > Label #points · Button #btn-learn · #btn-refund · #btn-reset · Label #toast
SkillTreeData.cs 는 UGUI 폴더의 것을 그대로 (같은 namespace)`,
      steps: [
        'UGUI 판의 `SkillTreeData.cs` 를 그대로 쓴다. 표 읽기 · 규칙은 UI 기술과 무관하다.',
        '노드는 `Button` 을 `ClearClassList()` 로 기본 모양을 떼고 `.node` · `.branch-*` 를 붙여 `style.left/top` 으로 놓는다. 상태는 `.node--locked` · `--available` · `--acquired` · `--maxed` 클래스로만 바꾼다. USS 에는 점선 테두리가 없어서 잠김은 얇은 흐린 테두리 + 자물쇠 표식 + "잠김", 최대는 둥근 사각 + 바깥 고리(이중선)로 모양을 바꾼다.',
        '줌은 `#world` 의 `style.scale`, 팬은 `style.translate`. 휠은 `viewport.WorldToLocal(e.mousePosition)` 아래의 월드 점이 제자리에 남도록 translate 를 다시 계산한다. 끌기는 8px 넘게 움직였을 때만 `CapturePointer` 해서 노드 클릭과 나눈다.',
        '글자 묶음 `.node__labels` 와 표식에 `style.scale = 1 / 배율` 을 준다(USS `transform-origin` 은 위 가운데). 배율에 따라 `.lod-far` · `.lod-mid` · `.lod-near` 를 `#world` 에 붙여 USS 가 무엇을 보일지 정한다.',
        '연결선은 `EdgeLayer` 하나가 `Painter2D.LineTo` 로 그린다. `#world` 안에 있어 함께 확대되므로 `lineWidth` 를 배율로 나눠 화면 굵기를 지킨다. 상태가 바뀌면 `MarkDirtyRepaint()`.',
        '방향키 · 스틱은 `NavigationMoveEvent` 에서 그 방향의 가장 가까운 노드를 직접 골라 `Focus()` 한다. 툴팁은 `FocusInEvent` · `PointerEnterEvent` 에서 채우고, 위치는 레이아웃이 끝난 뒤(`Update`) 창 안에 고정한다.',
      ],
      pitfalls: [
        '`NavigationMoveEvent` 를 직접 처리할 때 `StopPropagation()` 만 부르면 기본 포커스 이동이 한 번 더 일어나 한 칸을 건너뛴다. `focusController?.IgnoreEvent(e)` 를 함께 부른다.',
        '`VisualElement.tooltip` 은 에디터 전용이라 런타임에서 뜨지 않는다. 툴팁 요소를 직접 만들고 `picking-mode="Ignore"` 로 둬 커서를 가로채지 않게 한다.',
        '`#world` 의 `transform-origin` 기본값은 가운데다. 왼쪽 위(`0 0`)로 두지 않으면 확대할 때 트리가 가운데로 밀려 휠 기준점 계산이 어긋난다.',
        'Button 의 `Clickable` 은 누르는 순간 포인터를 잡는다. 끌기 판정은 `TrickleDown` 으로 먼저 받아야 노드 위에서 시작한 끌기도 팬이 된다.',
        '한글 글리프가 있는 Font Asset 을 Panel Settings 에 넣지 않으면 이름 · ✓ ✗ 가 네모로 보인다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Diablo IV (2023)',
      credit: '© Blizzard Entertainment, Inc.',
      borrowed: [],
      learned:
        '후보 카드는 Icy Veins 포럼에 옮겨진 **스킬트리 피드백에 대한 개발진 공식 답변**을 근거로 "출시 무렵 스킬트리 가독성이 비판받았다" 고 요약했다. 이번 작업에서는 그 원문을 다시 열지 못해 답변 내용과 실제 화면(노드 모양 · 색 · 확대 방식 · 글자 크기)은 모두 **미확인**이다. 그래서 빌린 시각 축은 없고, 상태 표시 · 확대 단계 규칙은 일반 원리로 새로 만들었다. 카드의 Path of Exile · Ghost of Tsushima 는 출처를 확인하지 못해 넣지 않았다.',
      link: 'https://www.icy-veins.com/forums/topic/52508-official-response-to-feedback-regarding-the-diablo-4-skill-tree/',
    },
  ],
  original:
    '외곽 탐사대 세계관의 세 갈래(하린 탐사 · 세라 통신 · 도윤 정비)와 노드 14개의 이름 · 효과 · 수치, 직접 그린 노드 아이콘과 상태 표식(자물쇠 · ＋ · 반원 · 별), 상태별 모양(점선 원 · 고리 · 채운 원 · 육각 이중 테두리), 확대 단계 세 가지와 경계값, 실제 글자 크기를 보여 주는 확대 막대, 화면에 띄우는 TSV 한 줄, 되돌리기 규칙 두 가지는 모두 이 갤러리에서 새로 만들었다.',
  references: [
    { label: 'Icy Veins 포럼 — Diablo 4 스킬트리 피드백에 대한 공식 답변 (카드 출처, 이번에 미확인)', url: 'https://www.icy-veins.com/forums/topic/52508-official-response-to-feedback-regarding-the-diablo-4-skill-tree/' },
    { label: 'Game Accessibility Guidelines — 색만으로 정보를 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/' },
    { label: 'Unity 6.3 — TextAsset', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/TextAsset.html' },
    { label: 'uGUI 2.0 매뉴얼 — Scroll Rect', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-ScrollRect.html' },
    { label: 'Unity 6.3 — Painter2D', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.Painter2D.html' },
    { label: 'Unity 6.3 매뉴얼 — USS transform (translate · scale · transform-origin)', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-Transform.html' },
  ],
  related: [
    { id: 'branching-route-map', why: '같은 노드 그래프 UI. 연결선 Image 회전 · Painter2D 선, 갈 수 있는 곳만 강조하는 같은 원리' },
    { id: 'inventory-grid-tooltip', why: '상태를 색과 모양으로 이중 부호화하는 원칙과, 같은 툴팁 배치 함수' },
    { id: 'upgrade-draft-choice', why: '성장을 트리 대신 매번 고르는 카드로 주는 다른 방식' },
  ],
}
