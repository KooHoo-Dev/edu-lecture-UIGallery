import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'dialogue-choices',
  title: '대화창 + 선택지',
  titleEn: 'Dialogue Box & Choices',
  group: 'F',
  order: 1,
  paradigms: ['non-diegetic'],
  oneLiner: '누가 말하는지 먼저 보이고, 내 속도로 읽고, 놓친 말은 되돌아보고, 고를 때는 포커스가 분명한 대화 UI',
  goals: [
    '타자기 효과에서 **입력 소비** 규칙(첫 입력 = 문장 완성, 다음 입력 = 다음 줄)과 선택지 직후 **입력 잠금**을 구현할 수 있다',
    '이름표·초상화·본문·▼ 순서로 **시각 위계**를 세우고, 아직 소개 전인 인물을 `???` 로 감출 수 있다',
    '자동 진행·빨리감기·대화 기록·글자 크기·제한시간 끄기를 함께 제공해 **읽는 속도가 다른 플레이어**를 모두 받을 수 있다',
    'Unity 에서 `maxVisibleCharacters`(UGUI)와 `<alpha=#00>` 태그(UI Toolkit)로 줄바꿈이 튀지 않는 타자기를 만들 수 있다',
  ],
  principles: ['시각 위계', '즉각 피드백', '어포던스', '접근성', '가독성'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'gamepad', 'mouse', 'touch'],
  genres: ['JRPG', '비주얼 노벨', '어드벤처', '로그라이트'],
  tags: ['accessibility'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'none' },
  params: [
    { key: 'typeSpeedCps', label: '타자기 속도', type: 'range', min: 0, max: 120, step: 5, default: 40, unit: '자/초', hint: '본문이 나타나는 속도. 0 이면 타자기 없이 문장 전체가 바로 보인다. 문장부호 뒤에는 0.16초 쉰다' },
    { key: 'autoAdvance', label: '자동 진행', type: 'toggle', default: false, hint: '켜면 문장이 끝난 뒤 "1.2초 + 글자당 0.04초" 기다렸다가 다음 줄로. 끄면 넘길 때까지 문장이 남는다. 무대 오른쪽 위 [자동] 버튼(R)으로도 바꾼다' },
    {
      key: 'speakerLayout',
      label: '화자 표시',
      type: 'select',
      default: 'tag-icon',
      options: [
        { value: 'tag', label: '이름표만' },
        { value: 'tag-icon', label: '이름표 + 얼굴 아이콘' },
        { value: 'side', label: '큰 측면 초상화' },
      ],
      hint: '얼굴 아이콘은 이름표 옆에 작게, 측면 초상화는 패널 왼쪽 밖으로 상반신이 솟는다',
    },
    { key: 'choiceTimerMs', label: '선택 제한시간 (0 = 끔)', type: 'range', min: 0, max: 10000, step: 1000, default: 0, unit: 'ms', hint: '0 이면 시간 제한 없음(막대도 숨김). 값이 있으면 선택지 위 막대가 줄어들고, 다 되면 "시간 초과 시" 표시가 붙은 기본 선택(침묵)이 확정된다' },
    { key: 'inputLockMs', label: '선택지 입력 잠금', type: 'range', min: 0, max: 600, step: 50, default: 300, unit: 'ms', hint: '선택지가 열린 직후 확정 입력을 무시하는 시간. 확정 키가 흐려지고 아래 막대가 줄어든다. 0 으로 두고 "빨리감기"를 눌러 보자' },
    { key: 'skewDeg', label: '틀 기울기', type: 'range', min: 0, max: 12, step: 1, default: 6, unit: '°', hint: '패널·이름표·선택지·버튼 "틀"의 사선 각도. 글자와 얼굴은 반대로 되돌려 반듯하게 둔다' },
    { key: 'accentColor', label: '강조색', type: 'color', default: '#FF6A3D', hint: '이름표·포커스된 선택지·타이머·▼ 에만 쓰는 단 하나의 색. 나머지는 흑백' },
    { key: 'textScale', label: '글자 크기', type: 'range', min: 80, max: 160, step: 10, default: 100, unit: '%', hint: '본문·선택지·기록의 글자 크기. 패널 높이가 함께 늘어나 잘리지 않는다' },
  ],
  presets: [
    {
      id: 'stylish-social',
      name: '연출형 소셜 RPG',
      look: '강한 사선 틀, 주황 강조색 하나와 흑백의 고대비. 이름표에 얼굴 아이콘이 붙고 선택은 시간 제한 없이 천천히 고른다',
      values: { typeSpeedCps: 45, autoAdvance: false, speakerLayout: 'tag-icon', choiceTimerMs: 0, inputLockMs: 300, skewDeg: 10, accentColor: '#FF6A3D', textScale: 100 },
    },
    {
      id: 'fast-repeat',
      name: '짧은 대화 반복형',
      look: '반듯한 사각 틀에 큰 측면 초상화. 글자가 빠르게 나와 몇 번 넘기면 끝난다 — 죽고 재도전하는 템포를 끊지 않는다',
      values: { typeSpeedCps: 90, autoAdvance: false, speakerLayout: 'side', choiceTimerMs: 0, inputLockMs: 250, skewDeg: 0, accentColor: '#5FB49C', textScale: 100 },
    },
    {
      id: 'tense-timed',
      name: '긴장감 시간 제한형',
      look: '대사는 자동으로 흐르고, 분기에서 5초 막대가 줄어든다. 이름표만 두어 화면을 비우고 압박은 막대 하나로',
      values: { typeSpeedCps: 35, autoAdvance: true, speakerLayout: 'tag', choiceTimerMs: 5000, inputLockMs: 400, skewDeg: 3, accentColor: '#3FA7D6', textScale: 110 },
    },
  ],
  events: [
    { id: 'advance', label: '넘기기 (완성 → 다음 줄)' },
    { id: 'fast-forward', label: '빨리감기 (누르고 있기)' },
    { id: 'move-focus', label: '선택지 포커스 이동' },
    { id: 'confirm-choice', label: '선택 확정' },
    { id: 'toggle-log', label: '대화 기록 열기/닫기' },
    { id: 'restart', label: '처음부터 (대사 시작)' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'speaker-tag',
      title: '"누가"가 "무엇을"보다 먼저 읽힌다',
      body: '이름표를 **강조색 판**으로 만들어 패널 위 모서리에 걸치면 눈이 본문보다 먼저 닿는다. 등장인물이 많으면 **얼굴 아이콘**을 붙여 이름을 읽기 전에 알아보게 한다. 아직 소개되지 않은 인물은 **`???` + 검은 실루엣**으로 감춰 스포일러 없이 "누군가 말한다"만 알린다. 효과 끄기에서는 이름이 본문 속 `세라:` 로 묻힌다.',
      principle: '시각 위계',
    },
    {
      n: 2,
      part: 'next-indicator',
      title: '▼ 가 보여야 다음 줄로 간다 — 입력 소비',
      body: '타이핑 중에는 ▼ 를 숨기고, 문장이 다 나왔을 때만 위아래로 천천히 움직인다. 타이핑 중 **첫 입력은 문장 완성**, ▼ 가 뜬 뒤 **다음 입력이 다음 줄**이다. 입력 하나가 두 단계를 넘기면(관통) 읽지 못한 문장이 사라진다. 효과 끄기에서 "넘기기"를 연타해 비교해 보자.',
      principle: '즉각 피드백',
    },
    {
      n: 3,
      part: 'choice-focus',
      title: '포커스는 늘 한 곳에 — 그리고 잠깐 잠근다',
      body: '선택지가 열리면 **첫 항목에 자동 포커스**. 포커스된 항목만 강조색 판·앞으로 밀기·▶·확정 키로 표시하고 나머지는 흑백으로 가라앉힌다(색 하나에만 기대지 않음). 열린 직후 `inputLockMs` 동안은 **확정 키가 흐려지고 막대가 줄어드는 입력 잠금** — 빨리감기를 누르고 있거나 연타하던 입력이 첫 항목을 골라 버리지 않는다. 마우스를 올리면 포커스가 따라오고, 빈 곳을 눌러도 사라지지 않는다. (선택지가 닫혀 있을 때 보이는 흐린 점선 틀은 갤러리용 자리 표시다 — **[지금 열기]** 로 바로 분기로 건너뛸 수 있다.)',
      principle: '어포던스',
    },
    {
      n: 4,
      part: 'reading-controls',
      title: '읽는 속도는 플레이어가 정한다',
      body: '**자동 진행**(끄면 넘길 때까지 문장이 남는다) · **빨리감기**(누르고 있는 동안, 선택지에서는 스스로 멈춤) · **대화 기록**(열면 타이핑·자동 진행·제한시간이 모두 멈추고, 최신 줄로 스크롤)을 함께 둔다. 시간 제한 선택지는 **0 = 끔**을 반드시 제공한다 — 기준은 [설정 · 접근성](#/s/settings-accessibility) 표본의 "시간 제한" 참고.',
      principle: '접근성',
    },
    {
      n: 5,
      part: 'frame-skew',
      title: '스타일은 틀에만, 본문은 반듯하게',
      body: '사선은 역동성을 주지만 글자까지 기울면 읽기 어렵다. **배경 틀만 기울이고**(`skewDeg`) 글자와 얼굴은 반대로 되돌린다. 강조색은 **하나만** 쓰고 나머지는 흑백으로 두어 "지금 중요한 것"(이름표·포커스·타이머)만 튀게 한다. 효과 끄기에서는 패널을 통째로 기울여 글자도 함께 기운다.',
      principle: '가독성',
    },
  ],
  mistakes: [
    { title: '한 번 눌렀는데 문장이 통째로 넘어간다', body: '타이핑 중 입력을 "다음 줄"로 처리하면 읽지도 못한 대사를 잃는다. 타이핑 중 입력은 **문장 완성만** 하고, 입력을 처리한 프레임은 거기서 끝낸다.' },
    { title: '빨리감기가 선택지를 뚫고 첫 항목을 고른다', body: '빨리감기를 누른 채 분기에 닿으면 첫 항목이 자동 확정되는 버그가 흔하다. 선택지가 열리면 **빨리감기를 강제로 풀고**, 0.2~0.4초 **입력 잠금**을 건다.' },
    { title: '화자를 본문 안에서만 알린다', body: '"하린: …" 처럼 이름을 본문과 같은 크기·색으로 섞으면 대화가 빠를 때 누가 말하는지 놓친다. 이름표를 **별도 요소**로 분리하고 자리를 고정한다.' },
    { title: '패널을 통째로 기울이고 높이를 고정한다', body: '컨테이너 전체에 skew(또는 Z 회전)를 걸면 글자까지 기운다. 높이를 고정한 채 글자 크기만 키우면 아랫줄이 잘린다. **틀만 기울이고**, 패널 높이는 글자 크기를 따라 늘린다.' },
    { title: '제한시간을 끌 수 없고, 기록을 열어도 시간이 흐른다', body: '시간 제한은 읽기가 느린 플레이어에게 벽이 된다. **0 = 끔**을 두고, 기록·일시정지 중에는 타이머를 멈춘다. 대화 시간은 **게임 일시정지(`Time.timeScale = 0`)와 분리**해 `unscaledDeltaTime` 으로 계산한다. (갤러리의 배속 버튼은 관찰용 슬로모션이라 대화에도 적용된다.)' },
  ],
  juiceOff:
    '패널이 등장 연출 없이 툭 나타나고, **패널 전체가 기울어 글자까지 비스듬하다**. 높이가 고정이라 글자 크기를 키우면 아랫줄이 잘린다. 이름은 본문 속 `하린:` 으로 묻히고 초상화·▼ 가 없어 입력을 기다리는지 알 수 없다. 타이핑 중 넘기기는 **곧바로 다음 줄로 관통**하고, 선택지는 똑같은 회색 버튼이라 **포커스가 보이지 않는다**. 입력 잠금이 없어 **빨리감기가 첫 선택지를 자동으로 고르고**, 제한시간은 왼쪽 위 구석의 작은 숫자, 대화 기록은 없다(메뉴 속).',
  timings: [
    { event: '패널 등장 (아래 → 위 + 페이드)', ms: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', note: '권장값. 퇴장은 160ms ease-in 으로 더 짧게. 등장이 끝난 뒤 타이핑 시작' },
    { event: '타자기 한 글자 (40자/초)', ms: 25, easing: 'linear (계단)', note: '권장값. 문장부호(. , ! ? …) 뒤 160ms 추가 정지 — 말하는 리듬' },
    { event: '▼ 위아래 반복', ms: 700, easing: 'ease-in-out, 왕복', note: '권장값. 너무 빠르면 재촉하는 느낌 (약 0.7Hz)' },
    { event: '선택지 순차 등장', ms: 180, easing: 'ease-out, 항목 간 50ms', note: '권장값. 3개 기준 280ms 안에 끝난다' },
    { event: '선택지 입력 잠금', ms: 300, easing: 'none', note: '권장값 200~400ms. 포커스 이동은 잠그지 않고 확정만 잠근다' },
    { event: '포커스 이동 강조', ms: 100, easing: 'ease-out', note: '권장값. 즉각 피드백을 위해 150ms 를 넘기지 않는다' },
    { event: '확정 번쩍임 → 닫힘', ms: 260, easing: 'ease-in', note: '권장값. 나머지 항목이 먼저 150ms 페이드아웃' },
    { event: '자동 진행 대기', ms: 1200, easing: 'none', note: '권장값. + 글자당 40ms (문장 길이에 비례)' },
    { event: '빨리감기 줄 간격', ms: 90, easing: 'none', note: '권장값. 타이핑은 생략하고 줄만 빠르게 넘긴다' },
    { event: '대화 기록 열기', ms: 250, easing: 'ease-out', note: '권장값. 열자마자 최신 줄 위치' },
  ],
  unity: {
    ugui: {
      hierarchy: `DialogueCanvas (Canvas · CanvasScaler 1920×1080 Match 0.5 · GraphicRaycaster)
├─ DialogueRoot (CanvasGroup · DialogueView.cs · DialogueChoicesDemo.cs)
│  ├─ Controls (HorizontalLayoutGroup)
│  │  ├─ AutoButton (Button → DialogueView.ToggleAuto · Image + SkewEffect) ─ AutoOnMark · AutoProgress (Image Filled)
│  │  ├─ FastForwardButton (EventTrigger PointerDown/Up → FastForwardDown/Up · Image + SkewEffect) ─ FfOnMark
│  │  └─ LogButton (Button → DialogueView.ToggleLog)
│  ├─ Stack (VerticalLayoutGroup · 아래 정렬 · ContentSizeFitter)
│  │  ├─ ChoiceGroup (VerticalLayoutGroup · 오른쪽 정렬)
│  │  │  ├─ TimerRoot ─ TimerFill (Image Filled Horizontal)
│  │  │  └─ ChoiceButton × 3 (Button[Transition None] · CanvasGroup · ChoiceButton.cs)
│  │  │     ├─ Frame (Image + SkewEffect)
│  │  │     └─ Content ─ Marker(▶) · Label (TMP) · DefaultTag · ConfirmGlyph (CanvasGroup) ─ LockFill (Image Filled)
│  │  └─ Panel (RectTransform · VerticalLayoutGroup · ContentSizeFitter Preferred)
│  │     ├─ Frame (Image 9-slice + SkewEffect)
│  │     ├─ SidePortrait (Image · 패널 왼쪽 밖 · 선택)
│  │     ├─ SpeakerTag ─ FaceIcon (Mask + Image) · Plate (Image + SkewEffect) · SpeakerName · SpeakerRole (TMP)
│  │     ├─ Body (TextMeshProUGUI · Overflow 없음 · 높이는 레이아웃이 늘린다)
│  │     └─ NextIndicator (▼)
│  └─ LogPanel (CanvasGroup · DialogueLog.cs)
│     └─ ScrollRect ─ Viewport ─ Content (VerticalLayoutGroup + ContentSizeFitter)
│        └─ LogEntry 프리팹 × N (LogEntry.cs · Icon · Who · Body)
└─ EventSystem (InputSystemUIInputModule)
Assets: DialogueData.asset (Create → UI Gallery → Dialogue Data) · Dialogue.inputactions (Advance · FastForward · ToggleLog · ToggleAuto)`,
      steps: [
        '`DialogueData` 에셋에 줄(화자·역할·소개 여부·초상화·실루엣·본문), 선택지 3개와 각 반응 한 줄, 기본 선택 번호(침묵 = 2), 마지막 줄을 넣는다.',
        'Input Actions 에 **Dialogue 맵**을 만들고 Advance(Enter · 패드 아래), FastForward(F · 패드 왼쪽), ToggleLog(L · 패드 위), ToggleAuto(R · R 숄더)를 둔다. 빨리감기는 Hold 상호작용 대신 `IsPressed()` 로 읽는다.',
        '`DialogueView` 는 상태 하나(`Typing · LineComplete · ChoiceOpen · ChoiceConfirmed · Closed`)로 입력을 나눈다. Advance 를 처리한 프레임은 `return` 해서 "완성"과 "다음 줄"이 한 프레임에 같이 일어나지 않게 한다. 패널이 올라오는 중(`delay > 0`)에 누른 입력도 버리지 않고 "문장 완성"으로 처리한다(웹 시연과 같음).',
        '타자기: `body.text` 에 문장 전체를 넣고 `ForceMeshUpdate()` 뒤 `textInfo.characterCount` 를 총 글자 수로 쓴다. `maxVisibleCharacters` 만 늘리고, 문장부호 뒤에는 0.16초를 더 기다린다.',
        '선택지가 열리면 `SetSelectedGameObject(첫 버튼)` 으로 포커스를 잡고 `lockLeft = inputLockSeconds`. 버튼 클릭·Submit·시간 초과가 모두 `OnChoice`/`Confirm` **한 곳**으로 모이고, `OnChoice` 는 잠금 중이면 무시한다.',
        '틀만 기울이기: 패널·이름표·선택지 배경 Image 에 `SkewEffect`(BaseMeshEffect)를 붙인다. TMP 글자는 형제 오브젝트로 두어 기울지 않는다.',
        '`DialogueChoicesDemo.cs` 를 붙이면 갤러리와 같은 숫자키(1~6)로 이벤트를 시험할 수 있다. 2번은 누르고 있는 동안 빨리감기.',
      ],
      pitfalls: [
        '`maxVisibleCharacters` 에 `string.Length` 를 쓰면 리치 텍스트 태그 글자까지 세서 끝에서 멈춘 것처럼 보인다. `textInfo.characterCount` 를 쓴다.',
        '`text` 를 매 글자 `Substring` 으로 바꾸면 태그가 깨지고, 줄바꿈 위치가 매 글자 바뀌어 단어가 윗줄·아랫줄을 오간다.',
        'Advance 와 UI Submit 이 같은 Enter 에 묶이면, 선택지가 열리는 프레임에 Submit 이 첫 버튼을 누를 수 있다 — 이것이 **입력 잠금**이 필요한 이유다.',
        '`SetSelectedGameObject(go)` 는 이미 선택된 오브젝트면 **아무것도 보내지 않는다**. 지난 회차에 고른 첫 버튼이 꺼진 채 선택으로 남아 있으면 다시 열 때 `OnSelect` 가 오지 않아 포커스 연출이 사라진다 → 선택지를 숨길 때 `SetSelectedGameObject(null)`, 선택할 때도 먼저 null 로 비운다.',
        '빈 곳을 클릭하면 `currentSelectedGameObject` 가 null 이 되어 패드 입력이 먹지 않는다. 선택지가 열려 있는 동안 null 이면 마지막 선택지를 다시 선택한다.',
        '일시정지(`Time.timeScale = 0`) 위에서 대화가 멈추지 않게 `Time.unscaledDeltaTime` 을 쓴다. 대신 기록을 열었을 때는 **직접** 타이핑·타이머를 멈춘다.',
        'RectTransform 을 Z 회전하면 기울어진 패널이 될 뿐 사선이 아니고 글자까지 기운다. 사선은 `SkewEffect` 나 사선 스프라이트로.',
        'MonoBehaviour 는 클래스 이름과 파일 이름이 같아야 컴포넌트로 붙는다 (`LogEntry.cs` 를 따로 둔 이유).',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + DialogueUITK.cs + DialogueUITKDemo.cs
└─ Dialogue.uxml  (#dialogue-root.dlg-root ← .dlg-root--hidden 로 등장/퇴장)
   ├─ #controls > Button #btn-auto · #btn-ff · #btn-log  (.dlg-ctl--on)
   ├─ #stack.dlg-stack
   │  ├─ #choices.dlg-choices (--hidden · --locked)
   │  │  ├─ #timer > #timer-fill
   │  │  └─ Button.dlg-choice × 3 (코드 생성) > SkewFrame.dlg-frame · Label ▶ · Label #label · Label.dlg-choice__key
   │  └─ #panel.dlg-panel
   │     ├─ SkewFrame.dlg-frame        ← Painter2D 로 그린 사선 틀 (UxmlElement)
   │     ├─ #speaker-tag > #face-icon · .dlg-speaker__plate > SkewFrame · #speaker-name · #speaker-role
   │     ├─ Label #body (enable-rich-text · <alpha=#00> 타자기)
   │     └─ Label #next (▼ · --show · --down)
   └─ #log.dlg-log (--hidden) > .dlg-log__head · ScrollView #log-scroll
(DialogueData.cs 는 ugui 폴더의 것을 함께 쓴다)`,
      steps: [
        '`SkewFrame` 은 `[UxmlElement]` 커스텀 요소다. USS 에 skew 가 없으므로 `generateVisualContent` 에서 `painter2D` 로 평행사변형을 채우고 테두리를 그린다. 색은 USS 사용자 정의 속성 `--frame-fill` · `--frame-border` 로 바꾼다. 코드가 `UIGallery.DialogueChoices` namespace 안에 있으므로 UXML 에는 `<UIGallery.DialogueChoices.SkewFrame>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        '타자기: Label 에는 `maxVisibleCharacters` 가 없다. `"보이는 부분" + "<alpha=#00>" + "남은 부분"` 을 `text` 에 넣어 문장 전체를 배치하고 경계만 옮긴다 → 줄바꿈 위치가 처음부터 고정된다.',
        '선택지 Button 은 코드로 만들고 `clicked` 와 `NavigationSubmitEvent` 를 **둘 다** `OnChoice` 로 연결한다(중복은 상태 검사로 무시). `PointerEnterEvent` 에서 `Focus()` 해 마우스와 패드의 포커스를 하나로 맞춘다.',
        '선택지를 연 프레임에는 아직 배치 전이라 `Focus()` 가 실패할 수 있다 → `schedule.Execute` 로 한 프레임 뒤 첫 버튼에 포커스. 순차 등장은 `.dlg-choice--enter` 를 50ms 씩 늦게 떼어 USS 전환으로.',
        '▼ 반복은 USS 전환에 무한 반복이 없어서 `schedule.Execute(...).Every(350)` 로 `--down` 클래스를 토글한다(왕복 700ms).',
        '기록은 Label 을 ScrollView 에 쌓고, 열 때 `schedule.Execute` 로 한 프레임 뒤 `ScrollTo(마지막 요소)`.',
        '`DialogueUITKDemo.cs` 로 숫자키 1~6 이벤트를 시험한다.',
      ],
      pitfalls: [
        'USS 에는 `skew`·gradient·box-shadow·`em` 이 없다. 사선은 `SkewFrame`, 글자 배율은 C# 에서 `style.fontSize` 에 곱한다. `rotate` 는 글자까지 기울이므로 사선 대용이 아니다.',
        '`schedule` 은 `Time.timeScale` 과 무관하게 돈다. 진행 계산(타이핑·타이머·잠금)은 `Update` 의 `unscaledDeltaTime` 한 곳에서 하고, 기록 중에는 거기서 멈춘다.',
        '기본 런타임 테마의 `.unity-button:hover`·`:focus`·`:active`(선택자 2단계)가 `.dlg-choice`·`.dlg-ctl--on`(1단계)보다 우선한다 → 마우스를 올리면 사선 틀 뒤에 회색 사각 배경이 비친다. `.dlg-choice:hover, .dlg-choice:focus, .dlg-choice:active { background-color: rgba(0,0,0,0); border-width: 0; }` 처럼 **의사 상태까지 적어** 의도한 모양을 명시한다(켜진 컨트롤도 `.dlg-ctl--on:hover`). `:hover` 와 `:focus` 는 같은 모양으로 맞춘다.',
        'Unity 버전에 따라 패드·키보드 Submit 이 `clicked` 로 들어오는지 다를 수 있다 — **강사가 6.3 에서 직접 확인**한다(이 예제는 둘 다 받아도 안전).',
        '`display: none` 전환에는 transition 이 없다. 기록은 `opacity`·`translate` + `visibility` 로 숨긴다.',
        '한글 글리프가 있는 FontAsset 을 Panel Settings 의 Text Settings 에 지정해야 한글이 깨지지 않는다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Persona 5 Royal (2019)',
      credit: '© ATLUS © SEGA',
      borrowed: ['색 체계 (강조색 하나 + 흑백 고대비)', '형태 (사선 틀)'],
      learned:
        '빨강 하나를 주색으로 두고 보조색을 거의 쓰지 않는 **고대비 배색 전략**(CEDEC 2017 개발자 패널 보도, 원작 P5 대상)과 사선 형태가 주는 역동성(디자인 블로그 해석)을 배웠다. 색은 "강조색 하나 + 흑백" **규칙만** 가져오고 색상은 빨강을 피했다. 대화 UI 에서는 이름표 + 주요 인물 얼굴, 미소개 인물의 모호한 호칭, 자동 진행 토글(끄면 자막 유지)과 대화 기록의 조합을 참고했다(Royal 판 농·난청 접근성 리뷰로 확인). 같은 리뷰가 지적한 **자막 크기 조절 없음**은 이 갤러리에서 `textScale` 로 보완했다. 대화창의 정확한 위치·형태와 선택지 포커스 방식, 타자기 효과·빨리감기 여부는 **미확인**이라 쓰지 않았다.',
      link: 'https://caniplaythat.com/2020/04/02/deaf-hoh-review-persona-5-royal/',
    },
    {
      title: 'Hades (2020)',
      credit: '© Supergiant Games',
      borrowed: [],
      learned:
        '명시적 선택지 없이 **누적된 사건에 따라 대사가 이어지는 서사 구조**를 배웠다(Wikipedia: 연쇄 이벤트 기반 약 10시간 대사, Steam: 수천 개의 고유 스토리 이벤트). 그래서 대화가 잦은 게임의 대화 UI 는 "짧고 빠르게 넘기기"에 집중해도 된다는 **설계 해석**을 "짧은 대화 반복형" 프리셋의 빠른 템포로 옮겼다. 하단 대화 상자 + 측면 초상화 배치, 타자기 효과 여부, 넘기기 조작은 화면으로 확인하지 못한 **미확인(기억)** 이라 빌린 축으로 삼지 않았다. 큰 측면 초상화는 비주얼 노벨 등에서 널리 쓰는 일반 관례로 다룬다.',
      link: 'https://en.wikipedia.org/wiki/Hades_(video_game)',
    },
  ],
  original:
    '세계관(외곽 탐사대)·인물(하린·도윤·세라)·대본·도형 초상화·궤도 기지 배경은 모두 새로 만들었다. 참고 게임 상징인 오려붙인 글자풍 서체와 예고장 모티프는 쓰지 않고, 역동성은 조절 가능한 **기울기 각도(`skewDeg`) 하나**로만 재현한다. 강조색 기본값은 빨강이 아닌 주황이고 프리셋마다 주황·청록·하늘색을 쓴다. 초상화는 흑백으로 두어 강조색은 UI 에만 쓰이게 했다. **입력 잠금과 그 시각화(흐린 확정 키 + 줄어드는 막대), 선택지에서 멈추는 빨리감기, 제한시간 막대와 "시간 초과 시" 표시(0 = 끔), 기록 중 정지, 이전 장면까지 이어지는 기록, 글자 크기에 맞춰 늘어나는 패널, 화자 실루엣을 밝히는 배경, 세로 화면 재배치**는 원작 재현이 아닌 갤러리 고유 설계다.',
  references: [
    { label: 'Persona 5 CEDEC+KYUSHU 2017 패널: 콘셉트와 UI 개발 (Persona Central)', url: 'https://personacentral.com/persona-5-panel-concept-development-ui/' },
    { label: 'Persona 5 UI 디자인 인터뷰 (Famitsu 번역, Persona Central)', url: 'https://personacentral.com/persona-5-interview-ui-design-sound-music/' },
    { label: 'Persona 5 Royal 농·난청 접근성 리뷰 (Can I Play That, 2020)', url: 'https://caniplaythat.com/2020/04/02/deaf-hoh-review-persona-5-royal/' },
    { label: 'Hades — Supergiant Games 공식 페이지', url: 'https://www.supergiantgames.com/games/hades/' },
    { label: 'Hades — Steam 상점 페이지', url: 'https://store.steampowered.com/app/1145360/Hades/' },
    { label: 'Game Accessibility Guidelines', url: 'https://gameaccessibilityguidelines.com/' },
    { label: 'Unity 6.3 Manual — UI Toolkit 지원 리치 텍스트 태그', url: 'https://docs.unity3d.com/6000.3/Documentation/Manual/UIE-supported-tags.html' },
    { label: 'Unity 6.3 — UIElements.TextElement', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.TextElement.html' },
    { label: 'uGUI 2.0 — Navigation 옵션', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-SelectableNavigation.html' },
  ],
  related: [
    { id: 'settings-accessibility', why: '자막 크기·배경·화자 표시와 "시간 제한" 기준을 한곳에서 설정하는 메뉴' },
  ],
}
