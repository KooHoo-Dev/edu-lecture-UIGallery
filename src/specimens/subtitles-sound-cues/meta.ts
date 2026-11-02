import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'subtitles-sound-cues',
  title: '자막 · 효과음 캡션 + 소리 방향 링',
  titleEn: 'Subtitles, Sound Captions & Directional Sound Ring',
  group: 'F',
  order: 2,
  paradigms: ['non-diegetic'],
  oneLiner: '긴 대사는 두 줄씩 나누고 읽을 시간만큼 보여 준다. 누가 말하는지, 어떤 소리가 어디서 났는지를 글과 링으로 함께',
  goals: [
    '긴 대사를 **최대 줄 수**에 맞춰 장으로 나누고, 장마다 **글자 수 ÷ 읽기 속도**로 표시 시간을 정할 수 있다',
    '화자 이름을 **바뀔 때만** 붙이고, 색 · 모양 · 무전 · 화면 밖 방향으로 누가 말하는지 알릴 수 있다',
    '자막(대사)과 **캡션**(효과음 · 방향)의 차이를 설명하고, 효과음을 [캡션]으로 옮길 수 있다',
    '소리 위치를 플레이어 기준 각도로 바꿔 **소리 방향 링**에 호로 표시할 수 있다',
  ],
  principles: ['접근성', '가독성', '인지 부하', '시각 위계', '즉각 피드백'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'gamepad', 'mouse', 'touch'],
  genres: ['액션 어드벤처', '스토리', 'TPS', '공통'],
  tags: ['accessibility'],
  difficulty: 2,
  stage: { aspect: '16:9', backdrop: 'none' },
  params: [
    {
      key: 'textSize',
      label: '자막 크기',
      type: 'select',
      default: 'medium',
      options: [
        { value: 'small', label: '작게 (28px)' },
        { value: 'medium', label: '보통 (36px)' },
        { value: 'large', label: '크게 (46px)' },
        { value: 'xl', label: '아주 크게 (58px)' },
      ],
      hint: '1920×1080 기준. 크게 할수록 한 장에 들어가는 글자가 줄어 장이 늘어난다 (나누기는 자동)',
    },
    { key: 'bgOpacity', label: '배경 불투명도', type: 'range', min: 0, max: 1, step: 0.05, default: 0.65, hint: '아래쪽 밝은 눈밭 위에서 비교. 0이어도 얇은 외곽선이 있어 읽히지만, 배경판이 있을 때가 가장 안정적이다' },
    { key: 'maxLines', label: '최대 줄 수', type: 'range', min: 1, max: 3, step: 1, default: 2, unit: '줄', hint: '한 번에 보이는 줄. 넘는 대사는 다음 장으로 넘기고 "…" 로 이어진다는 것을 알린다' },
    { key: 'readingCps', label: '읽기 속도', type: 'range', min: 6, max: 20, step: 1, default: 13, unit: '자/초', hint: '장마다 (공백 뺀 글자 수 ÷ 이 값)초, 최소 1.5초. 낮을수록 오래 보여 준다 — 아래의 얇은 막대가 남은 시간(수업용 표시)' },
    {
      key: 'speakerStyle',
      label: '화자 표시',
      type: 'select',
      default: 'name-color',
      options: [
        { value: 'name-color', label: '이름 + 색 + 모양' },
        { value: 'name', label: '이름만' },
        { value: 'none', label: '없음' },
      ],
      hint: '이름은 화자가 바뀌거나 4초 넘게 쉰 뒤에만 다시 붙는다. 색만으로 구분하지 않도록 모양(원 · 사각 · 마름모)을 함께',
    },
    { key: 'captions', label: '효과음 캡션', type: 'toggle', default: true, hint: '[폭발음] 처럼 대사가 아닌 소리를 글로 옮긴다. 화살표는 소리가 난 방향' },
    { key: 'soundRing', label: '소리 방향 링', type: 'toggle', default: true, hint: '캐릭터 주위 링에 소리가 난 쪽을 호로. 위험한 소리는 빨강 + 세모, 그 밖은 흰색 + 동그라미. 가까울수록 두껍고 진하다' },
  ],
  presets: [
    {
      id: 'story-default',
      name: '스토리 게임 기본',
      look: '보통 크기, 두 줄, 이름 + 색. 캡션과 링을 함께',
      values: { textSize: 'medium', bgOpacity: 0.65, maxLines: 2, readingCps: 13, speakerStyle: 'name-color', captions: true, soundRing: true },
    },
    {
      id: 'large-readable',
      name: '큰 글씨 · 천천히',
      look: '아주 크게, 진한 배경, 한 장에 두 줄, 천천히. 장이 많아져도 끝까지 읽힌다',
      values: { textSize: 'xl', bgOpacity: 0.85, maxLines: 2, readingCps: 9, speakerStyle: 'name-color', captions: true, soundRing: true },
    },
    {
      id: 'competitive',
      name: '경쟁 슈터',
      look: '자막은 작게 한 줄, 대신 소리 방향 링이 주인공 (발소리 · 총성 위치)',
      values: { textSize: 'small', bgOpacity: 0.5, maxLines: 1, readingCps: 16, speakerStyle: 'name', captions: false, soundRing: true },
    },
  ],
  events: [
    { id: 'line', label: '다음 대사' },
    { id: 'explosion', label: '왼쪽 폭발음' },
    { id: 'drone', label: '오른쪽 드론 접근' },
    { id: 'restart', label: '처음부터' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'box',
      title: '두 줄씩 나눠 보여 준다',
      body: '긴 대사를 한 번에 4줄로 띄우면 다 읽기 전에 사라진다. **최대 줄 수**에 맞춰 띄어쓰기 단위로 장을 나누고, 이어지는 장은 "…" 로 알린다. 한국어는 어절 단위 줄바꿈(`word-break: keep-all`)으로 단어가 중간에서 끊기지 않게 한다. 배경판은 밝은 장면에서도 글자를 지킨다.',
      principle: '가독성',
    },
    {
      n: 2,
      part: 'speaker',
      title: '누가 말하는지',
      body: '이름은 **화자가 바뀔 때만** 붙인다(같은 사람이 이어 말하면 생략). 이름 색과 함께 **모양**(원 · 사각 · 마름모)을 붙여 색을 구분하기 어려운 플레이어도 알아보게 하고, 무전이면 [무전], 화면 밖 인물이면 방향 화살표를 단다.',
      principle: '접근성',
      pin: 'left',
    },
    {
      n: 3,
      part: 'timing',
      title: '읽을 시간만큼',
      body: '표시 시간은 **공백을 뺀 글자 수 ÷ 읽기 속도**(기본 13자/초), 최소 1.5초. 효과를 끄면 길이와 상관없이 2초라 긴 대사는 읽기 전에 넘어간다. 아래 막대는 남은 시간을 보여 주는 수업용 표시다.',
      principle: '인지 부하',
      pin: 'below',
    },
    {
      n: 4,
      part: 'captions',
      title: '대사가 아닌 소리도 글로',
      body: '자막은 대사만, **캡션**은 효과음 · 음악 · 방향까지 옮긴다. [폭발음]처럼 대괄호로 대사와 구분하고, 화살표로 소리가 난 쪽을 알린다. 한꺼번에 많으면 최근 3개만 남긴다.',
      principle: '시각 위계',
    },
    {
      n: 5,
      part: 'ring',
      title: '어디서 났는지 — 소리 방향 링',
      body: '음원 위치를 **플레이어 기준 각도**로 바꿔 링 위에 호로 그린다. 위험한 소리는 빨강 + 세모, 그 밖은 흰색 + 동그라미, 가까울수록 두껍고 진하다. 링은 시선이 머무는 캐릭터 주위라 화면 가장자리를 보지 않아도 된다.',
      principle: '즉각 피드백',
      pin: 'right',
    },
  ],
  mistakes: [
    { title: '대사 전체를 한 번에', body: '세 줄, 네 줄짜리 자막은 읽는 사이 다음 대사가 온다. 최대 두 줄로 장을 나눈다.' },
    { title: '고정 표시 시간', body: '모든 자막을 2초씩 보여 주면 짧은 대사는 오래 남고 긴 대사는 읽기 전에 사라진다. 글자 수에 비례하게, 최소 시간을 둔다.' },
    { title: '배경 없는 흰 글자', body: '눈밭 · 하늘 · 폭발처럼 밝은 장면에서 흰 글자는 사라진다. 반투명 배경판이나 최소한 외곽선 · 그림자를 둔다.' },
    { title: '화자 표시 없음', body: '이름이 없으면 무전인지, 옆 사람인지, 화면 밖 누구인지 알 수 없다. 색만으로 구분하지도 않는다.' },
    { title: '효과음은 자막에서 뺌', body: '"방금 그 소리 뭐야?" 라는 대사가 나오는데 소리를 못 들은 플레이어는 무슨 일인지 모른다. 이야기와 게임에 중요한 소리는 캡션과 방향 표시로 옮긴다.' },
  ],
  juiceOff:
    '흔한 실수를 한꺼번에 재현한다. 자막이 작고(26px) 배경판 · 외곽선이 없어 아래쪽 밝은 눈밭 위에서 흰 글자가 사라진다. 긴 대사를 나누지 않아 여러 줄 덩어리로 뜨고, 길이와 상관없이 2초만에 넘어간다. 화자 이름이 없고, 효과음 캡션과 소리 방향 링도 없다.',
  timings: [
    { event: '장 표시 시간', ms: 1500, easing: '—', note: '최소값. 실제는 (공백 뺀 글자 수 ÷ 13자/초) — 30자면 약 2.3초' },
    { event: '장 사이 쉼', ms: 250, easing: '—', note: '권장값. 장이 바뀐 것을 눈이 알아채게' },
    { event: '자막 나타남', ms: 150, easing: 'ease-out', note: '페이드만. 움직이지 않는다' },
    { event: '효과음 캡션 유지', ms: 2600, easing: 'ease-in (뒤쪽 45% 페이드)', note: '최대 3개' },
    { event: '링의 호 유지', ms: 2400, easing: 'ease-in (뒤쪽 45% 페이드)', note: '가까운 소리일수록 진하게 시작' },
    { event: '이름 다시 붙이는 쉼', ms: 4000, easing: '—', note: '같은 사람이라도 이만큼 쉬었다 말하면 이름을 다시' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_Subtitles (Screen Space - Overlay · Canvas Scaler 1920×1080 · Sort Order 높게)
├─ SubtitleBox (Image 검정 · CanvasGroup — 크기 고정, ContentSizeFitter 를 쓰지 않는다)
│  ├─ Speaker (TextMeshProUGUI — 이름. 색은 리치 텍스트 <color>)
│  └─ Body    (TextMeshProUGUI — Wrapping 켬 · Overflow: Page · 너비 1160 · 높이 = 한 줄 높이 × 최대 줄 수)
├─ Captions  (VerticalLayoutGroup — Caption 프리팹(TextMeshProUGUI) 최대 3개)
└─ SoundRing (RectTransform — 화면 가운데)
   └─ Cue 프리팹: Image (고리 스프라이트 · Type Filled · Radial 360 · Fill Origin Top · Clockwise · 앵커 · 피벗 가운데)
SubtitleSystem (SubtitleSystem.cs) · SoundCueRing (SoundCueRing.cs — 링과 캡션을 함께)`,
      steps: [
        '`SubtitleSystem.Say(speaker, text)` 이 대사를 대기열에 넣는다. 한 장씩 꺼내 `Body.text` 에 넣고 `ForceMeshUpdate()` 뒤 `textInfo.pageCount` 로 몇 장인지 센다 (Overflow 를 **Page** 로 두면 TMP 가 최대 줄 수에 맞춰 장을 나눠 준다 — 줄 수는 Body 높이로 정한다).',
        '장마다 `Body.pageToDisplay` 를 1, 2, … 로 바꾸고, 그 장의 글자 수 ÷ `readingCps` 초(최소 1.5초) 기다린다. 자막 시계는 `unscaledDeltaTime` 으로 흐르되 **`Time.timeScale` 이 0(일시정지)이면 멈춘다** — 슬로모션 중에는 읽을 시간을 지키고, 메뉴를 연 사이에 대사가 지나가 버리지 않게.',
        '화자가 이전과 다르거나 마지막 자막 뒤 4초가 넘었을 때만 `Speaker` 를 켠다. 무전 · 화면 밖 표시는 화자 데이터(ScriptableObject)의 값으로.',
        '효과음을 낼 때 `SoundCueRing.Show(worldPos, kind)` 와 캡션을 함께 부른다. 각도는 `Vector3.SignedAngle(카메라 정면(수평), 음원 방향(수평), Vector3.up)` — 오른쪽이 + 다.',
      ],
      pitfalls: [
        '`Overflow: Page` 는 Body RectTransform 높이에 들어가는 줄 수로 장을 나눈다. 그래서 Body 높이를 레이아웃이 키우게 두면(ContentSizeFitter · Control Child Size Height) 늘 한 장이 된다. 높이는 고정하고, 한 줄 높이는 `textInfo.lineInfo[0].lineHeight` 를 재서 × 최대 줄 수로 맞춘다(글꼴마다 글자 크기의 1.2~1.4배).',
        '`listener` 는 플레이어(또는 카메라)의 Transform. 위에서 똑바로 내려다보는 카메라는 정면을 수평으로 누르면 0 벡터가 되므로 플레이어를 쓴다.',
        'TMP 의 한국어 줄바꿈은 기본이 글자 단위라 단어가 중간에서 끊긴다. TMP Settings 의 **Use Modern Hangul Line Breaking Rules** 를 켜면 어절(띄어쓰기) 단위로 끊는다.',
        '각도를 3D 위치 그대로 계산하면 위아래(높이) 차이 때문에 값이 흔들린다. 두 벡터 모두 y 를 0 으로 눌러 수평 방향으로 비교한다.',
        '자막 크기 · 배경은 설정 화면의 값을 읽어 적용한다(실행 중 바뀌면 바로 반영) — 설정 · 접근성 표본 참고.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080)
└─ Subtitles.uxml
   └─ #subtitle-root (.subtitle-root .size-medium .bg-default — 크기 · 배경 클래스)
      ├─ #ring (.ring ← C# 가 SoundRingElement 를 넣는다: Painter2D 로 호)
      ├─ #captions (.captions ← C# 가 Label .caption 을 최대 3개)
      └─ #sub (.sub — 보일 때 .sub--on)
         ├─ Label #speaker (.sub__speaker)
         └─ Label #body (.sub__body)
SubtitlesUITK.cs`,
      steps: [
        '자막 크기 · 배경 불투명도는 루트의 USS 변수 대신 **클래스**(`.size-large`, `.bg-heavy`)로 바꾼다 — 런타임에 USS 변수를 C# 에서 직접 바꾸는 API 가 없다.',
        '장 나누기는 C# 에서 글자 수로 한다: 한 줄 글자 수 ≈ 상자 너비 ÷ (글자 크기 × 1.02), 장 용량 = 그 × 최대 줄 수. 띄어쓰기 단위로 채우고 문장 끝에서 끊는다.',
        '링은 `generateVisualContent` 의 `Painter2D.Arc` 로 그리고, 소리마다 남은 시간으로 투명도를 정해 매 프레임 `MarkDirtyRepaint()`.',
      ],
      pitfalls: [
        'UI Toolkit Label 의 줄바꿈은 `white-space: normal` 이 필요하다. 기본값(nowrap)이면 긴 자막이 화면 밖으로 나간다. 한국어가 단어 중간에서 끊기면 Panel Settings 의 Text Settings 에서 줄바꿈 규칙 설정을 확인한다(버전마다 위치가 다르다).',
        '`enabled = false` 로는 코루틴이 멈추지 않는다(오브젝트를 꺼야 멈춘다). `OnDisable` 에서 직접 멈추지 않으면 다시 켤 때 코루틴이 두 개가 되어 장이 겹친다.',
        'Painter2D 의 각도는 오른쪽 = 0°, 시계 방향 + 다. "앞 = 위 = 0°" 각도에서 90° 를 빼서 넘긴다.',
      ],
    },
  },
  inspiredBy: [],
  original:
    '외곽 탐사대 세 사람의 대사와 무전 시나리오, 밝은 눈밭 장면, 화자 모양(원 · 사각 · 마름모), 무전 · 화면 밖 표시, 장 나누기 규칙과 수업용 남은 시간 막대, 캡션 배치, 소리 방향 링의 모양과 배색은 모두 이 갤러리에서 새로 만들었다. 특정 게임의 화면을 재현하지 않고 접근성 지침(자막 · 소리 시각화 항목)과 공개된 자막 모범 사례를 바탕으로 정리했다.',
  references: [
    { label: 'Xbox Accessibility Guideline 104 — 자막과 캡션', url: 'https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/104' },
    { label: 'Game Accessibility Guidelines — 전체 목록 (청각 항목)', url: 'https://gameaccessibilityguidelines.com/full-list/' },
    { label: '80.lv — 10 Golden Rules on Subtitles for Games', url: 'https://80.lv/articles/10-golden-rules-on-subtitles-for-games' },
    { label: 'Can I Play That? — 소리 시각화 기능 기사', url: 'https://caniplaythat.com/?p=14083' },
    { label: 'TextMeshPro — Text Overflow 모드 (Page)', url: 'https://docs.unity3d.com/Packages/com.unity.textmeshpro@4.0/manual/TMPObjectUIText.html' },
  ],
  related: [
    { id: 'settings-accessibility', why: '자막 크기 · 배경 · 화자 표시를 고르는 설정 화면 — 이 표본은 그 값이 게임 중에 어떻게 쓰이는지' },
    { id: 'dialogue-choices', why: '플레이어가 넘기는 대화창 — 저절로 흘러가는 자막과 무엇이 다른지' },
    { id: 'offscreen-waypoint', why: '같은 "월드 위치 → 화면 기준 각도" 계산을 목표 표시에 쓰면' },
  ],
}
