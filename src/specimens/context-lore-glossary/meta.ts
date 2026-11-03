import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'context-lore-glossary',
  title: '맥락 용어집 · 중첩 툴팁',
  titleEn: 'Contextual Lore Glossary & Nested Tooltips',
  group: 'F',
  order: 3,
  paradigms: ['meta', 'non-diegetic'],
  oneLiner: '대사 속 키워드에 머물면 설명이 고정되고 그 안의 키워드로 한 겹 더 들어간다. 누르고 있으면 지금 장면에 나온 인물 · 용어 · 장소만 골라 보여 준다',
  goals: [
    '키워드 툴팁에 **머무르면 고정(잠금)** 규칙을 두어, 툴팁 안의 키워드로 들어가는 **중첩 툴팁 스택**을 설계할 수 있다',
    '중첩에 **깊이 한도**를 두고 **순환 참조**(A 설명에 B, B 설명에 A)를 "이미 열림" 으로 처리하는 이유를 설명할 수 있다',
    '장면 · 대사 노드에 태그를 달아 **지금 장면의 항목만** 질의하는 용어집 데이터를 화면과 분리해 만들 수 있다',
    'Unity 에서 TMP `<link>` + `TMP_TextUtilities.FindIntersectingLink`(UGUI)와 리치 텍스트 링크 이벤트(UI Toolkit)로 키워드를 판정할 수 있다',
  ],
  principles: ['인지 부하', '어포던스', '즉각 피드백', '가독성', '접근성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['mouse', 'keyboard', 'gamepad', 'touch'],
  genres: ['스토리 RPG', '카드 · 덱빌딩', '전략', '공통'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    { key: 'lockMs', label: '잠금까지 머무르기', type: 'range', min: 0, max: 1500, step: 100, default: 700, unit: 'ms', hint: '키워드(또는 키보드 포커스)에 이만큼 머무르면 툴팁이 고정되어 그 안으로 들어갈 수 있다. 노란 링이 차는 속도가 바뀐다. 0 = 열자마자 고정. 클릭 · 탭 · Enter 는 언제나 바로 고정' },
    { key: 'maxDepth', label: '중첩 깊이 한도', type: 'range', min: 1, max: 4, step: 1, default: 3, unit: '겹', hint: '마지막 겹의 키워드는 링크가 아니라 굵은 글자 + ⋯ 로 바뀐다. 낮추면 열린 겹이 한도 안으로 닫힌다. 1 이면 중첩 없음' },
    {
      key: 'cycleMode',
      label: '순환 참조',
      type: 'select',
      options: [
        { value: 'mark', label: '이미 열림 표시 (↩)' },
        { value: 'allow', label: '그대로 다시 쌓기' },
      ],
      default: 'mark',
      hint: '위에 이미 열린 항목을 가리키는 키워드를 어떻게 할지. 표시: ↩ 를 붙이고 올리면 그 툴팁을 짚기만 한다. 다시 쌓기: 냉각 셀 → 궤도 정비 기지 → 냉각 셀 … 같은 두 장이 한도까지 반복된다',
    },
    {
      key: 'glossaryScope',
      label: '용어집 범위',
      type: 'select',
      options: [
        { value: 'scene', label: '지금 장면만' },
        { value: 'seen', label: '지금까지 나온 것' },
        { value: 'all', label: '전체 사전 (아직 안 나온 것까지)' },
      ],
      default: 'scene',
      hint: '용어집이 보여 주는 항목. 바꾸면 용어집이 3초 동안 열려 차이를 보여 준다. 전체 사전은 아직 나오지 않은 항목(스포일러)까지 섞인다',
    },
    { key: 'edgeCorrection', label: '가장자리 보정', type: 'toggle', default: true, hint: '하위 툴팁은 부모 오른쪽이 기본. 화면 밖으로 나가면 왼쪽으로 뒤집고 그래도 넘치면 화면 안으로 고정한다 (노란 안내 띠). 끄면 오른쪽 끝 키워드의 하위 툴팁이 잘린다' },
    {
      key: 'holdMode',
      label: '용어집 여는 방식',
      type: 'select',
      options: [
        { value: 'hold', label: '누르고 있기 (G)' },
        { value: 'toggle', label: '눌러서 열고 닫기' },
      ],
      default: 'hold',
      hint: '누르고 있기는 슬쩍 보고 바로 대사로 돌아오기 좋다. 계속 누르기 어려운 사람을 위해 토글도 고를 수 있어야 한다. 토글로 열면 포커스가 용어집 첫 항목으로 가고, 닫으면 연 곳으로 돌아온다',
    },
  ],
  presets: [
    {
      id: 'story-rpg',
      name: '스토리 RPG',
      look: '대사 속 세계관 용어. 0.7초 머무르면 고정, 세 겹까지. 용어집은 지금 장면만',
      values: { lockMs: 700, maxDepth: 3, cycleMode: 'mark', glossaryScope: 'scene', edgeCorrection: true, holdMode: 'hold' },
    },
    {
      id: 'card-keywords',
      name: '카드 · 스킬 키워드',
      look: '짧은 규칙 키워드를 빠르게 훑는다. 고정은 짧게, 깊이는 두 겹, 용어집은 지금까지 나온 키워드',
      values: { lockMs: 300, maxDepth: 2, cycleMode: 'mark', glossaryScope: 'seen', edgeCorrection: true, holdMode: 'hold' },
    },
    {
      id: 'lore-archive',
      name: '설정 백과',
      look: '깊이 파고드는 독자용 — 네 겹까지, 용어집은 지금까지 나온 전체. 그래도 순환은 표시한다',
      values: { lockMs: 900, maxDepth: 4, cycleMode: 'mark', glossaryScope: 'seen', edgeCorrection: true, holdMode: 'hold' },
    },
    {
      id: 'easy-access',
      name: '천천히 · 누르지 않고 (접근성)',
      look: '열자마자 고정(머무를 필요 없음), 용어집은 토글 — 정확히 머무르기 · 계속 누르기를 덜어 준다',
      values: { lockMs: 0, maxDepth: 3, cycleMode: 'mark', glossaryScope: 'scene', edgeCorrection: true, holdMode: 'toggle' },
    },
  ],
  events: [
    { id: 'open-nested', label: '중첩 툴팁 열기 (오른쪽 끝 키워드부터)' },
    { id: 'cycle', label: '순환 참조 따라가기' },
    { id: 'glossary', label: '용어집 열기 · 닫기 (일시정지)' },
    { id: 'next-line', label: '다음 대사' },
    { id: 'next-scene', label: '다음 장면' },
    { id: 'close-all', label: '모두 닫기' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'keyword',
      title: '키워드는 색 + 모양 + 밑줄',
      body: '설명이 있는 낱말은 종류마다 **색과 모양**(인물 ● · 장소 핀 · 용어 ◆)을 함께 쓰고 점선 밑줄을 긋는다. 색만으로 표시하면 색각 차이가 있는 사람은 링크인지 모르고, 밑줄만 있으면 "누구 · 어디 · 무엇" 을 열기 전에는 모른다. 열린 키워드는 밑줄이 실선으로 바뀌어 지금 어느 툴팁의 출처인지 보인다. 키보드는 Tab 순서대로, 또는 무대에서 **←→** 로 고른다.',
      principle: '어포던스',
      pin: 'below',
    },
    {
      n: 2,
      part: 'lock',
      title: '머무르면 고정 — 그래야 안으로 들어간다',
      body: '툴팁을 연 키워드에서 커서가 떠나면 툴팁도 닫히는 것이 기본이다. 그러면 툴팁 안의 키워드에 갈 수 없다. 그래서 **잠시 머무르면(기본 0.7초) 고정**한다 — 노란 링이 차면 테두리가 노랗게 바뀌고, 그때부터 커서가 툴팁 위로 옮겨 가도 남는다. 고정된 툴팁은 커서가 완전히 떠난 뒤 0.45초 기다렸다가 닫혀 비스듬히 지나가도 끊기지 않는다. 클릭 · 탭 · Enter 는 기다리지 않고 바로 고정한다.',
      principle: '즉각 피드백',
    },
    {
      n: 3,
      part: 'nested',
      title: '한 겹 더 — 깊이 한도와 순환 표시',
      body: '하위 툴팁은 **부모 오른쪽**, 키워드 줄 높이에 같은 모양으로 붙어 어느 키워드에서 나왔는지 따라갈 수 있다. 오른쪽이 모자라면 왼쪽으로 뒤집고(`core/placement`), 셋째 겹부터는 **부모가 놓인 방향으로 이어 가고** 되돌아 뒤집지 않는다 — 되돌아가면 첫 겹을 통째로 덮는다. 모자라면 화면 안으로 고정만 한다. 부모 아래 변보다는 내려가지 않아 대사도 가리지 않는다. **깊이 한도**의 마지막 겹에서는 키워드가 링크가 아니다 — 스택이 화면을 덮지 않게. 설명 안에 이미 위에 열린 항목이 있으면(**순환 참조**) 새로 쌓지 않고 **↩** 를 붙여 그 툴팁을 짚는다. "순환 참조 따라가기" 를 눌러 "그대로 다시 쌓기" 와 비교해 보자.',
      principle: '인지 부하',
    },
    {
      n: 4,
      part: 'glossary',
      title: '용어집은 지금 장면의 항목만',
      body: '사전 전체 대신 **이 장면의 대사에 태그된 인물 · 용어 · 장소 + 장면 장소**만 질의해 보여 준다. 다섯 개 안팎이라 찾을 필요 없이 바로 읽히고, 아직 나오지 않은 항목(스포일러)도 섞이지 않는다. 지금 줄에서 처음 나온 항목에는 **새**. 대사가 넘어가면 목록도 따라 바뀐다. 데이터는 화면과 분리되어 있어(장면 · 대사 노드 → 태그 → 질의) Unity 에서는 ScriptableObject 하나로 옮긴다.',
      principle: '인지 부하',
    },
    {
      n: 5,
      part: 'hold',
      title: '누르고 있는 동안 — 또는 토글',
      body: '용어집은 대사를 읽다가 **슬쩍 보는** 화면이라 누르고 있는 동안만 열고, 떼면 그 자리로 돌아온다(포커스를 옮기지 않는다). 갤러리 단축키와 겹치지 않게 웹에서는 **G** 다. 계속 누르기 어려운 사람을 위해 **토글**을 고를 수 있어야 하고, 토글 · 일시정지로 열면 포커스를 첫 항목으로 옮겼다가 닫을 때 연 곳으로 돌려준다.',
      principle: '접근성',
    },
  ],
  mistakes: [
    { title: '툴팁이 커서를 따라다닌다', body: '커서 옆에 붙어 움직이는 툴팁은 커서를 그쪽으로 옮기는 순간 같이 달아나고, 키워드를 벗어나면 바로 닫힌다. 안의 키워드는 영원히 못 누른다. 키워드에 붙여 두고, **머무르면 고정**한다.' },
    { title: '잠금 없이 지연만 늘린다', body: '"닫힐 때 0.5초 기다리기" 만으로는 느리게 움직이는 사람 · 터치 · 패드가 못 들어간다. 잠금 상태를 링 · 테두리로 **보여 주고**, 클릭 · 탭 · 버튼으로 바로 고정하는 길을 함께 둔다.' },
    { title: '순환 참조를 그대로 쌓는다', body: 'A 설명에 B, B 설명에 A 가 있으면 A → B → A → B … 같은 두 장이 화면을 덮는다. 스택에 이미 있는 항목은 **↩ 로 표시**하고 그 툴팁을 강조만 한다.' },
    { title: '깊이에 한도가 없다', body: '설명마다 키워드가 두세 개면 다섯 겹만 열어도 화면 절반이 툴팁이다. 2~3겹에서 멈추고, 더 깊은 내용은 용어집으로 보낸다.' },
    { title: '용어집이 사전 전체', body: '수십 개 항목이 가나다순으로 쏟아지면 "방금 그 이름" 을 찾느라 이야기가 끊기고, 아직 등장하지 않은 인물 · 장소까지 보여 스포일러가 된다. 장면 · 대사에 태그를 달아 **지금 장면의 항목만** 고른다.' },
  ],
  juiceOff:
    '잠금이 없다: 툴팁이 커서를 따라다니고(보정도 없이) 키워드를 벗어나는 순간 닫혀, 안의 키워드에 갈 수 없다 — "중첩 툴팁 열기" 를 눌러도 한 겹뿐이다. 잠금 링 · 노란 테두리 · ↓/Enter 로 들어가기도 없다. 용어집은 **사전 전체 11개**를 가나다순 통짜 글로 보여 주어 이 장면과 상관없는 항목과 아직 나오지 않은 항목까지 섞인다.',
  timings: [
    { event: '툴팁 나타남', ms: 140, easing: 'ease-out (투명도 + 10px 위로)', note: '권장값. 짧게 — 읽으려고 올린 것이다' },
    { event: '머무르면 고정', ms: 700, easing: 'linear (노란 링이 참)', note: '권장값. 0.3~1초. 클릭 · 탭 · Enter 는 즉시' },
    { event: '고정된 툴팁 닫힘 유예', ms: 450, easing: '—', note: '권장값. 커서가 비스듬히 지나가도 끊기지 않게' },
    { event: '고정 안 된 툴팁 닫힘', ms: 0, easing: '즉시', note: '키워드를 떠나면 바로 — 그래서 잠금이 필요하다' },
    { event: '순환 링크 → 기존 툴팁 강조', ms: 1600, easing: '테두리 맥동 (1.25Hz)', note: '권장값' },
    { event: '용어집 열기 · 닫기', ms: 140, easing: 'ease-out (투명도 + 16px)', note: '권장값. 누르고 있기는 짧아야 슬쩍 보기가 된다' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Lore (Screen Space - Overlay · Canvas Scaler 1920×1080)
├─ SceneTitle (TextMeshProUGUI)
├─ DialogueBox (Image)
│  └─ DialogueText (TextMeshProUGUI · Raycast Target 켬 · KeywordText.cs level 0)
│     └─ FocusFrame (Image · Raycast Target 끔 — 키보드로 고른 키워드 테두리)
├─ TooltipLayer (RectTransform 전체 stretch · 피벗 0.5,0.5 · TooltipStack.cs)
├─ Glossary (CanvasGroup — 닫힘 alpha 0 · blocksRaycasts 끔 · interactable 끔)
│  ├─ Dim (Image) · Panel (Image)
│  ├─ GlossaryTitle · GlossaryCount (TextMeshProUGUI)
│  ├─ List (VerticalLayoutGroup — GlossaryRow 프리팹을 재사용)
│  └─ DetailTitle · DetailBody (TextMeshProUGUI)
└─ LoreScene (LoreSceneView.cs — 장면 진행 · 용어집 · 시험 키 G · N)
TooltipPanel 프리팹 (Image 테두리 · CanvasGroup · VerticalLayoutGroup · ContentSizeFitter Vertical)
├─ Note (TextMeshProUGUI · LayoutElement ignoreLayout — "오른쪽 공간 부족 → 왼쪽으로")
├─ Title (TextMeshProUGUI)
├─ Body (TextMeshProUGUI · Raycast Target 켬 · KeywordText.cs) └─ FocusFrame (Image)
└─ Footer (HorizontalLayoutGroup) ├─ LockRing (Image · Filled Radial 360) ├─ Status └─ Depth (TextMeshProUGUI)
GlossaryRow 프리팹 (Button · Transition Color Tint + 자식 TextMeshProUGUI)
LoreDatabase.asset (LoreDatabase.cs — ScriptableObject: entries · scenes · Query · ToRichText)`,
      steps: [
        'Project 창 ▸ Create ▸ UI Gallery ▸ Context Lore Glossary ▸ **Lore Database** 로 에셋을 만들고 항목(id · 이름 · 종류 · 역할 · 설명)과 장면(제목 · 장소 · 대사: 말한 사람 + 글)을 채운다. 글 안의 키워드는 `[[cell]]` · `[[cell|셀]]` 로 적는다 — 웹과 같은 표기라 그대로 옮길 수 있다.',
        '`LoreDatabase.ToRichText` 가 `[[id]]` 를 `<link="id"><color=…><u>◆냉각 셀</u></color></link>` 로 바꾼다. 색 + 모양 글자 + 밑줄. 툴팁 안 글은 깊이 · 순환에 따라 `LinkState.Flat`(링크 아님) · `Cycle`(↩) 로 그린다.',
        '`KeywordText` 는 `IPointerMoveHandler` 에서 `TMP_TextUtilities.FindIntersectingLink(text, e.position, cam)` 로 지금 링크 번호를 구하고, **바뀐 순간에만** `TooltipStack.KeywordEnter / KeywordExit` 를 부른다. 클릭은 같은 판정으로 `KeywordClick`(즉시 고정). 링크 사각형은 `textInfo.linkInfo` 의 글자 `bottomLeft · topRight` 로 계산한다.',
        '`TooltipStack` 은 툴팁 프리팹을 풀에서 꺼내 내용을 채운 뒤 `LayoutRebuilder.ForceRebuildLayoutImmediate` 로 크기를 확정하고, 1겹은 키워드 위 · 하위 겹은 부모 오른쪽에 둔다. 넘치면 뒤집고 그래도 넘치면 Clamp. `Update` 에서 포인터 · 포커스가 붙잡은 가장 깊은 겹(`Held`)을 구해 머무름 → 고정, 벗어남 → 즉시(고정 전) · 0.45초 뒤(고정 후) 닫기를 처리한다. 코루틴은 쓰지 않는다.',
        '키보드 · 패드: UI 액션 맵의 Navigate · Submit · Cancel 을 연결한다. 아무것도 선택되지 않은 상태에서 방향키를 누르면 대사의 첫 키워드부터 — ←→ 같은 글 안 키워드, ↓ · Submit 고정하고 안으로, ↑ 바깥 글로, Cancel 맨 위 겹 닫고 그 키워드로 돌아간다. 고른 키워드는 FocusFrame 으로 보인다.',
        '`LoreSceneView` 의 `glossaryAction` 은 `<Keyboard>/g` · `<Gamepad>/select`. `holdToOpen` 이면 누르는 동안만 열고(선택을 옮기지 않음), 아니면 `OpenPaused()` 처럼 첫 줄로 `SetSelectedGameObject` 하고 닫을 때 연 요소로 돌려준다. 목록은 `db.Query(scope, scene, line)` 결과만 그린다.',
      ],
      pitfalls: [
        '`FindIntersectingLink` 는 `textInfo` 가 최신이어야 맞는다. 글을 바꾼 직후 같은 프레임에 판정 · 배치하려면 `ForceMeshUpdate()` 를 먼저 부른다 (`KeywordText.SetText`).',
        'Screen Space - Overlay 면 카메라 인자는 `null`, Camera · World 모드면 `canvas.worldCamera`. 잘못 넘기면 링크가 몇 줄씩 어긋나 판정된다.',
        '툴팁 프리팹의 Body 는 Raycast Target 을 켜야 안의 키워드에 포인터 이벤트가 온다. 대신 Note · LockRing · FocusFrame 은 꺼서 키워드 판정을 가리지 않게 한다.',
        '모양 글자(● ◆ ▼ ↩ …)가 TMP 폰트 에셋에 없으면 네모로 나온다. 한글 폰트 에셋의 Fallback 에 기호 폰트를 넣거나 문자 집합에 추가한다. 스프라이트(`<sprite>`)로 바꾸려면 비트맵 아틀라스가 필요하다.',
        '용어집 CanvasGroup 의 `interactable` 을 끄기 전에 선택을 연 요소로 옮긴다. 선택된 줄이 꺼지면 선택이 해제되어 패드가 갈 곳을 잃는다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ LoreGlossary.uxml (.lore)
   ├─ .scene-head — #scene-title (Label)
   ├─ #dialogue (.dialogue) — #dialogue-text (Label · 리치 텍스트 · focusable) · .hint
   ├─ #tooltip-layer (picking-mode Ignore — 툴팁 .tip 은 C# 가 풀에서 꺼내 absolute 로 넣는다)
   │  └─ .tip (수식 클래스 in · locked · echo) — .tip__note · .tip__title · .tip__body (Label · focusable) · .tip__foot (.tip__lock › .tip__lock-fill · .tip__status · .tip__depth)
   └─ #glossary (.glossary · 수식 클래스 open · 닫힘은 visibility Hidden)
      └─ .glossary__panel — #glossary-title · #glossary-count · #glossary-list (ScrollView › Button 행) · #detail-title · #detail-body
LoreGlossaryUITK.cs (LoreDatabase · LinkState 는 UGUI 폴더 것을 그대로 쓴다)`,
      steps: [
        'UGUI 판의 `LoreDatabase` 에셋을 그대로 연결한다. 글은 `ToRichText` 로 만든 `<link="id">` 리치 텍스트를 `Label.text` 에 넣는다(`enableRichText`).',
        '키워드 판정은 Label 에 링크 이벤트를 단다: `PointerOverLinkTagEvent`(열기) · `PointerOutLinkTagEvent`(고정 전이면 닫기) · `PointerUpLinkTagEvent`(즉시 고정). Unity 6.3 에서는 **`UnityEngine.UIElements.Experimental`** 네임스페이스에 있다(컴파일로 확인). `evt.linkID` 가 항목 id, `evt.position` 이 패널 좌표라 툴팁 기준점으로 쓴다.',
        '툴팁은 `VisualElement` 를 풀에서 꺼내 `#tooltip-layer` 에 붙이고, `GeometryChangedEvent` 로 크기가 정해진 뒤 위 → (넘치면) 아래, 부모 오른쪽 → (넘치면) 왼쪽 → Clamp 로 `style.left · top` 을 정한다. 하위 겹은 부모를 따라 이어서 다시 놓는다. 진입 transition 은 `schedule.Execute(...).StartingIn(16)` 뒤에 수식 클래스 in 을 붙인다.',
        '키보드 · 패드: 글 Label 이 포커스를 받는다. `NavigationMoveEvent` ←→ 로 포커스 키워드를 바꿔 다시 그리고(노란 굵은 글자), ↓ · `NavigationSubmitEvent` 고정하고 하위 글로 `Focus()`, ↑ 부모 글로, `NavigationCancelEvent` 맨 위 겹 닫기. 직접 처리한 이동은 `StopPropagation()` + `focusController?.IgnoreEvent(evt)`.',
        '용어집은 수식 클래스 open(opacity transition) + `style.visibility` 로 켜고 끈다. 토글 · 일시정지로 열면 첫 행에 `Focus()`, 닫으면 열 때의 `focusController.focusedElement` 로 돌려준다.',
      ],
      pitfalls: [
        '링크 이벤트는 Experimental 이다 — 다음 버전에서 이름이나 네임스페이스가 바뀔 수 있으니 업그레이드 후 컴파일로 확인한다. 링크 글자의 사각형은 공개 API 로 얻을 수 없어, 포인터는 `evt.position`, 키보드는 글 머리를 기준점으로 썼다.',
        '`pickingMode` 는 상속되지 않는다. 레이어만 Ignore 로 두면 안의 툴팁은 포인터를 받는다(원하는 동작). 반대로 닫은 툴팁을 opacity 0 으로 남겨 두면 계속 포인터를 받으므로 `RemoveFromHierarchy()` 로 떼어 낸다.',
        'UI Toolkit 에는 Filled 이미지가 없다. 잠금 진행은 막대 `width` 퍼센트로 그렸다 — 원형 링은 `Painter2D.Arc` 로 직접 그린다. `width` 는 padding · border 를 포함하므로 막대 바탕에 padding 을 두지 않는다.',
        '포커스가 이미 있는 Label 에 `Focus()` 를 다시 불러도 `FocusInEvent` 가 오지 않는다. 같은 글 안에서 키워드만 바뀌면 직접 다시 그린다(`FocusText`).',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Final Fantasy XVI (2023)',
      credit: '© SQUARE ENIX',
      borrowed: ['지금 장면의 항목만 고른 용어집 (설계 원리)'],
      learned:
        '후보 카드의 출처인 GDC Vault 세션 "Designing Active Time Lore" 소개와 기능 소개 기사를 근거로, **사전 전체가 아니라 지금 장면에 관련된 인물 · 용어 · 장소만 골라 보여 준다**는 설계 원리를 빌렸다. 여는 버튼, 화면 배치 · 색 · 글꼴, 항목 수, 일시정지 여부 같은 화면 세부는 **미확인**이라 쓰지 않았다. 중첩 툴팁 · 머무르면 고정 · 깊이 한도 · 순환 표시는 이 게임에서 확인한 것이 아니라 장르 관례로 다룬다.',
      link: 'https://gdcvault.com/play/1034185/Designing-Active-Time-Lore-for',
    },
  ],
  original:
    '외곽 탐사대 세 장면의 대사 · 용어 11개와 그 설명, 인물 ● · 장소 핀 · 용어 ◆ 표식, 노란 잠금 링과 고정 테두리, 0.45초 닫힘 유예, 깊이 한도 표시(⋯), 순환 ↩ 와 기존 툴팁 강조, 툴팁 스택 표시줄, 가장자리 보정 안내 띠, 범위 3단계(지금 장면 · 지금까지 · 전체)와 "새" 표시, 누르고 있기 · 토글, 나쁜 예 재현은 모두 이 갤러리에서 새로 만들었다.',
  references: [
    { label: 'GDC Vault — Designing Active Time Lore for Final Fantasy XVI', url: 'https://gdcvault.com/play/1034185/Designing-Active-Time-Lore-for' },
    { label: 'TrueTrophies — Final Fantasy XVI Active Time Lore 소개 (출처 · 화면 미확인)', url: 'https://www.truetrophies.com/n23011/final-fantasy-xvi-active-time-lore' },
    { label: 'Prima Games — Active Time Lore 사용법 (출처 · 화면 미확인)', url: 'https://primagames.com/tips/how-to-use-active-time-lore-in-final-fantasy-xvi' },
    { label: 'TextMeshPro — TMP_TextUtilities (FindIntersectingLink)', url: 'https://docs.unity3d.com/Packages/com.unity.textmeshpro@3.0/api/TMPro.TMP_TextUtilities.html' },
    { label: 'Unity 6.3 Manual — UI Toolkit 지원 리치 텍스트 태그 (link)', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-supported-tags.html' },
    { label: 'Unity 6.3 — UIElements.NavigationMoveEvent', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.NavigationMoveEvent.html' },
    { label: 'Game Accessibility Guidelines — 누르고 있기 대신 토글 · 색만으로 전달하지 않기', url: 'https://gameaccessibilityguidelines.com/full-list/' },
  ],
  related: [
    { id: 'inventory-grid-tooltip', why: '툴팁 하나의 배치(크기 잰 뒤 → 뒤집기 → 고정)와 열기 지연은 그쪽, 여기서는 그 툴팁을 겹으로 쌓고 고정하는 규칙' },
    { id: 'dialogue-choices', why: '같은 대사 화면 — 그쪽은 대사를 읽고 넘기는 입력, 여기서는 대사 속 낱말을 멈춰 읽는 방법' },
  ],
}
