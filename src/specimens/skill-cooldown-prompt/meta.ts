import type { SpecimenMeta } from '../../core/types'

export const meta: SpecimenMeta = {
  id: 'skill-cooldown-prompt',
  title: '스킬 쿨다운 + 버튼 안내',
  titleEn: 'Skill Cooldown with Input Prompt',
  group: 'A',
  order: 3,
  paradigms: ['non-diegetic'],
  oneLiner: '슬롯 하나로 세 가지를 알린다 — 언제 다시 쓸 수 있는지, 지금 왜 못 쓰는지, 어떤 버튼을 누르면 되는지',
  goals: [
    '스킬 슬롯을 **아이콘 · 쿨다운 덮개 · 남은 시간 숫자 · 준비 완료 신호 · 버튼 안내** 다섯 층으로 나눠 설계할 수 있다',
    '"못 씀"의 이유(**쿨다운 · 에너지 부족 · 충전 0**)를 서로 다른 모양으로 그리고, 거부된 입력에도 반응을 돌려줄 수 있다',
    '마지막 입력 장치에 따라 버튼 안내를 바꾸고, 터치에서는 안내 대신 **슬롯 자체를 엄지 영역의 큰 버튼**으로 옮기는 이유를 설명할 수 있다',
    'Unity 에서 원형 쿨다운을 UGUI `Image`(Filled · Radial 360)와 UI Toolkit `Painter2D.Arc` 두 방식으로 만들고, **걷히는 방향을 일치**시킬 수 있다',
  ],
  principles: ['가독성', '어포던스', '즉각 피드백', '일관성', '인지 부하'],
  platforms: ['pc', 'console', 'mobile'],
  inputs: ['keyboard', 'mouse', 'gamepad', 'touch'],
  genres: ['액션 RPG', 'MMO', '히어로 슈터', '모바일 액션'],
  difficulty: 2,
  stage: { aspect: 'both', backdrop: 'field' },
  params: [
    {
      key: 'fillStyle',
      label: '덮개 방식',
      type: 'select',
      default: 'radial',
      options: [
        { value: 'radial', label: '원형 (시계 방향으로 걷힘)' },
        { value: 'vertical', label: '세로 (아래부터 드러남)' },
        { value: 'binary', label: '이분 (회색 / 사용 가능)' },
      ],
      hint: '이분으로 바꾸면 "곧 돌아오는지, 한참 남았는지"를 모양으로 읽을 수 없게 된다. 숫자 표시를 끄고 비교해 보자',
    },
    { key: 'cooldownMs', label: '기본 스킬 쿨다운', type: 'range', min: 2000, max: 30000, step: 1000, default: 8000, unit: 'ms', hint: '파동(Q)의 재사용 대기. 보호막은 이 값의 1.5배. 길수록 덮개가 느리게 걷히고 숫자가 더 쓸모 있어진다' },
    {
      key: 'numberMode',
      label: '남은 시간 숫자',
      type: 'select',
      default: 'smart',
      options: [
        { value: 'smart', label: '스마트 (3초 미만 소수 한 자리)' },
        { value: 'seconds', label: '정수 초 (올림)' },
        { value: 'none', label: '없음 (덮개만)' },
      ],
    },
    { key: 'numberMinCooldownMs', label: '숫자를 보일 최소 쿨다운', type: 'range', min: 0, max: 8000, step: 500, default: 3000, unit: 'ms', hint: '총 쿨다운이 이보다 짧은 슬롯은 숫자 없이 덮개만 보인다. 기본값에서 도약(2.5초 충전)은 숫자가 없다. 0 이면 모든 슬롯에 숫자' },
    {
      key: 'readyCue',
      label: '준비 완료 신호',
      type: 'select',
      default: 'glint',
      options: [
        { value: 'glint', label: '빛줄기 한 번' },
        { value: 'ring', label: '고리 한 번' },
        { value: 'none', label: '없음' },
      ],
      hint: '쿨다운이 끝나는 순간 한 번만 재생한다. 없음이면 다시 쓸 수 있게 된 것을 놓치기 쉽다',
    },
    { key: 'pulseHz', label: '준비 상태 반복 맥동', type: 'range', min: 0, max: 2, step: 0.5, default: 0, unit: 'Hz', hint: '0 = 한 번만 알림(권장). 올리면 준비된 슬롯이 계속 깜빡인다 — 여러 개가 동시에 준비되면 얼마나 시끄러운지 확인해 보자 (최대 2Hz)' },
    {
      key: 'inputDevice',
      label: '입력 장치',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: '자동 (마지막 입력)' },
        { value: 'keyboard', label: '키보드 · 마우스' },
        { value: 'gamepad', label: '게임패드' },
        { value: 'touch', label: '터치' },
      ],
      hint: '자동이면 무대를 클릭하거나 키를 누르거나 패드 버튼을 누르는 순간 모든 안내가 그 장치로 바뀐다. 터치는 안내를 없애고 슬롯을 우하단 엄지 영역으로 모은다',
    },
    { key: 'ultCost', label: '폭주 에너지 비용', type: 'range', min: 0, max: 100, step: 10, default: 40, unit: '%', hint: '궁극기(폭주)가 쓰는 에너지. 에너지 바에 비용 눈금이 그려진다. 0 이면 자원 게이트가 없다' },
    { key: 'dashCharges', label: '도약 충전 횟수', type: 'range', min: 1, max: 3, step: 1, default: 2, unit: '회', hint: '2 이상이면 슬롯 아래에 점이 생기고, 남은 횟수가 있는 동안은 덮개 대신 테두리의 얇은 진행 고리만 돈다. 1 이면 충전형이 아니라 다른 슬롯과 같은 일반 쿨다운(덮개)이다' },
    { key: 'hasteScale', label: '쿨다운 가속 버프 배율', type: 'range', min: 0.4, max: 0.9, step: 0.05, default: 0.6, unit: '×', hint: '버프 동안 모든 쿨다운의 총 시간 × 이 값. 남은 비율은 그대로 두므로 덮개가 튀지 않고 걷히는 속도만 빨라진다' },
  ],
  presets: [
    {
      id: 'arpg-hotbar',
      name: '액션 RPG 단축바',
      look: '원형 덮개 + 3초 미만 소수 숫자로 정확한 타이밍 계산을 돕는다. 슬롯 모서리마다 키캡이 붙는다',
      values: { fillStyle: 'radial', cooldownMs: 12000, numberMode: 'smart', numberMinCooldownMs: 3000, readyCue: 'glint', pulseHz: 0, inputDevice: 'keyboard', ultCost: 40, dashCharges: 1, hasteScale: 0.6 },
    },
    {
      id: 'shooter-ability',
      name: '슈터 능력 게이지',
      look: '숫자 없이 아래부터 드러나는 세로 덮개와 준비 고리만. 시선은 조준점에 있으니 주변 시야로 읽히는 모양에 기댄다. 패드 기호로 안내',
      values: { fillStyle: 'vertical', cooldownMs: 20000, numberMode: 'none', numberMinCooldownMs: 0, readyCue: 'ring', pulseHz: 0, inputDevice: 'gamepad', ultCost: 0, dashCharges: 2, hasteScale: 0.7 },
    },
    {
      id: 'mobile-touch',
      name: '모바일 터치 버튼',
      look: '버튼 안내 대신 슬롯 자체가 큰 원형 버튼이 되어 우하단 엄지 영역에 부채꼴로 모인다. 숫자는 손가락에 가리지 않게 버튼 바깥 왼쪽 위(엄지 반대편)에. 궁극기만 손을 뻗어야 닿는 바깥 띠에',
      values: { fillStyle: 'radial', cooldownMs: 6000, numberMode: 'seconds', numberMinCooldownMs: 3000, readyCue: 'glint', pulseHz: 0, inputDevice: 'touch', ultCost: 30, dashCharges: 2, hasteScale: 0.6 },
    },
  ],
  events: [
    { id: 'use-skill', label: '기본 스킬 사용 (파동)' },
    { id: 'use-dash', label: '이동기 사용 (충전 소모)' },
    { id: 'use-ult', label: '궁극기 시도 (폭주)' },
    { id: 'gain-energy', label: '에너지 획득 (+25)' },
    { id: 'haste', label: '쿨다운 가속 버프' },
    { id: 'switch-device', label: '입력 장치 바꾸기' },
  ],
  hotspots: [
    {
      n: 1,
      part: 'sweep',
      title: '남은 시간은 두 채널로 — 모양과 숫자',
      body: '덮개(공간)는 숫자를 읽지 않아도 **얼마나 남았는지**를 주변 시야로 알려 주고, 숫자(정밀)는 "기다릴까, 다른 걸 쓸까"를 정할 때 쓴다. 덮개는 반드시 **일정한 속도(linear)** 로 걷혀야 비율과 시간이 어긋나지 않는다. 덮개 방식을 "이분"으로 바꾸면 회색/사용 가능 두 상태만 남아 판단 정보가 빠진다.',
      principle: '가독성',
    },
    {
      n: 2,
      part: 'timer',
      title: '숫자는 필요할 때만, 마지막 몇 초만 정밀하게',
      body: '8초 남았을 때 소수점은 쓸모없는 정보다. **3초 미만**에서만 소수 한 자리로 바꾸고, 정수는 **올림**해서 0이 보이는 순간에는 실제로 쓸 수 있게 한다. 총 쿨다운이 짧은 슬롯(기본값의 도약 2.5초)은 숫자를 아예 숨기고 덮개만 쓴다 — 읽기 전에 끝나는 숫자는 소음이다. 이 판정은 **가속 전 기본 총 시간**으로 한다. 가속으로 짧아진 시간으로 판정하면 버프를 받는 순간 쿨다운 도중에 숫자가 사라진다.',
      principle: '인지 부하',
    },
    {
      n: 3,
      part: 'ready-glint',
      title: '돌아온 순간을 한 번만 짧게 알린다',
      body: '전투 중 시선은 화면 가운데에 있다. 쿨다운이 끝나는 순간 빛줄기나 고리가 **한 번** 지나가고 아이콘이 살짝 커졌다 돌아오면, 슬롯을 보지 않아도 알아챈다. 계속 깜빡이게 하면(반복 맥동 값을 올려 보자) 준비된 슬롯이 많을 때 화면이 시끄러워지고 다른 신호를 가린다. 반복이 꼭 필요하면 2Hz 이하로.',
      principle: '즉각 피드백',
    },
    {
      n: 4,
      part: 'block-reason',
      title: '"못 씀"의 이유마다 다른 모양 — 거부된 입력에도 반응',
      body: '쿨다운은 **어두운 덮개 + 숫자**, 에너지 부족은 **탈색 + 물방울 + 필요량**(덮개 없음), 충전 0 은 **빈 점 + 다음 충전 덮개**로 그린다. 기다릴지, 자원을 모을지, 다른 기술을 쓸지 해결 방법이 다르기 때문이다. 막힌 버튼을 누르면 슬롯이 짧게 흔들리고 이유 표시가 한 번 밝아지며, 같은 모양의 기호로 짧은 안내가 뜬다. "궁극기 시도"를 눌러 보자.',
      principle: '어포던스',
    },
    {
      n: 5,
      part: 'input-prompt',
      title: '지금 쥔 장치의 버튼을, 모든 슬롯에서 한꺼번에',
      body: '패드를 쥐었는데 키보드 글자가 보이면 안내가 틀린 것과 같다. **마지막으로 실제 입력이 들어온 장치**를 기준으로 모든 안내를 한 번에 바꾸고, 스틱 잡음으로 깜빡이지 않게 전환 뒤 0.25초는 다시 바꾸지 않는다. 터치에서는 안내를 버리고 슬롯 자체를 **엄지가 닿는 우하단의 큰 버튼**으로 옮긴다 — 자주 쓰는 기술은 가깝게, 궁극기는 손을 뻗어야 닿는 곳에. 세로(9:16)로 바꾸면 엄지 영역 안내선이 보인다.',
      principle: '일관성',
    },
  ],
  mistakes: [
    { title: '쿨다운과 에너지 부족을 같은 회색으로', body: '둘 다 "못 쓴다"는 뜻이지만 해결 방법이 다르다. 하나는 기다려야 하고 다른 하나는 자원을 모아야 한다. 같은 모습이면 플레이어는 버튼을 연타하며 이유를 추측한다. 색만 바꾸지 말고 **덮개 / 물방울 / 빈 점**처럼 모양으로 구분한다.' },
    { title: '거부된 입력을 조용히 무시', body: '막힌 버튼을 눌렀는데 아무 반응이 없으면 "입력이 안 먹었나?"와 "못 쓰는 상태인가?"를 구별할 수 없다. 거부에도 짧은 흔들림과 이유 표시를 돌려준다.' },
    { title: '남은 시간을 내림해서 0 표시', body: '0.7초 남았는데 "0"이 보이면 눌렀다가 거부당한다. 정수는 **올림(Ceil)** 하고, 0 은 보여 주지 말고 바로 준비 상태로 바꾼다.' },
    { title: '쿨다운 감소 버프로 남은 초만 그대로 두고 총 시간만 바꿈', body: '총 시간이 8초 → 4.8초로 줄었는데 남은 시간 6초를 그대로 두면 남은 비율이 0.75 → 1.25 로 튀어 덮개가 **오히려 커진다**. 버프는 남은 비율을 유지한 채 총 시간을 바꾸도록, 진행도를 시간 대신 **비율**로 저장한다.' },
    { title: '터치 버튼 한가운데에 숫자 · PC 배치를 그대로 옮김', body: '모바일에서 숫자를 버튼 중앙에 두면 누르는 순간 엄지에 가려진다. 키캡 글자가 붙은 작은 PC 단축바를 그대로 옮기면 누를 곳도 작고 멀다. 숫자는 버튼 바깥의 엄지 반대편(왼쪽 위)으로, 자주 쓰는 버튼은 엄지 영역 안에 크게.' },
  ],
  juiceOff:
    '덮개 모양·준비 신호·눌림·거부 반응을 모두 끈 상태. 쿨다운 중에는 아이콘이 그냥 회색이 되고 **내림한 정수(0 포함)** 만 보인다. 에너지 부족도 같은 회색이라 **왜 못 쓰는지** 알 수 없고, 막힌 버튼을 눌러도 아무 반응이 없다. 쿨다운이 끝나도 조용히 색만 돌아온다. 버튼 안내는 입력 장치와 상관없이 **키보드 글자로 고정**되고, 터치로 바꿔도 작은 PC 단축바가 그대로 남는다(세로 화면에서는 작은 버튼 한가운데에 숫자).',
  timings: [
    { event: '버튼 누름 → 슬롯 눌림', ms: 80, easing: 'ease-out (0.92배 후 복귀)', note: '권장값. 입력이 받아들여졌다는 반응을 다음 프레임에 시작' },
    { event: '쿨다운 덮개', ms: 8000, easing: 'linear', note: '쿨다운 길이와 같다. 남은 비율과 화면이 어긋나지 않으려면 반드시 linear' },
    { event: '남은 시간 숫자 갱신', ms: 100, easing: 'step (즉시 교체)', note: '권장값. 3초 이상 1초 단위, 3초 미만 0.1초 단위. 표시값이 바뀔 때만 텍스트를 다시 쓴다' },
    { event: '준비 완료 빛줄기 / 고리', ms: 350, easing: 'ease-out', note: '권장값. 한 번만 재생. 번쩍임 제한기를 거친다' },
    { event: '준비 완료 팝 (1 → 1.08 → 1)', ms: 180, easing: 'ease-out-back', note: '권장값. 빛줄기·고리와 동시에' },
    { event: '거부 흔들림 + 이유 강조', ms: 240, easing: '감쇠 사인 (좌우 6px)', note: '권장값. 같은 시간 동안 이유 표시(숫자·물방울·빈 점)가 한 번 밝아진다. 움직임 줄이기(prefers-reduced-motion)가 켜져 있으면 흔들지 않고 테두리 강조만' },
    { event: '버튼 안내 교체 (장치 전환)', ms: 120, easing: 'ease-in-out 교차 페이드', note: '권장값. 전환 판정 뒤 250ms 동안은 다시 바꾸지 않는다(디바운스)' },
    { event: '터치 배치로 이동 · 확대', ms: 320, easing: 'ease-out', note: '권장값. 위치가 왜 바뀌었는지 눈으로 따라갈 수 있게. 움직임 줄이기가 켜져 있으면 0 (바로 이동)' },
  ],
  unity: {
    ugui: {
      hierarchy: `Canvas_HUD (Screen Space - Overlay · Canvas Scaler: Scale With Screen Size 1920×1080)
├─ EnergyRow (SkillBar.cs 가 갱신)
│  ├─ EnergyLabel (TextMeshProUGUI)
│  ├─ EnergyBar ─ Fill (Image · Filled · Horizontal) · CostMarker (Image · 앵커 x = 비용 / 100)
│  └─ HasteChip (꺼 두었다가 버프 동안 켬)
├─ Toast (CanvasGroup) ─ Icon (Image: 시계 / 물방울 / 빈 점) · Text (TextMeshProUGUI)
└─ Canvas_SkillBar (중첩 Canvas — 자주 바뀌는 요소 분리)
   └─ SkillBar (SkillBar.cs · InputGlyphSwitcher.cs · SkillBarDemo.cs)
      └─ SkillSlot_Primary (SkillSlot.cs · IPointerDownHandler · 앵커: 하단 중앙, 터치면 우하단)
         ├─ ChargeRing    (Image · Filled · Radial 360 · Raycast Target 끔)
         ├─ Body          (RectTransform — 눌림·흔들림 대상)
         │  ├─ Frame      (Image · Raycast Target 켬 — 슬롯에서 눌리는 유일한 면)
         │  └─ Clip       (RectMask2D — 이 안의 요소만 잘린다)
         │     ├─ Icon          (Image)
         │     ├─ CooldownMask  (Image · Filled · Radial 360 · Origin Top · Clockwise 끔)
         │     ├─ CooldownMaskV (Image · Filled · Vertical · Origin Top)
         │     ├─ BinaryMask    (Image · Simple — 이분 방식)
         │     └─ ReadyGlint    (Image · 기울인 흰 막대)
         ├─ ReadyRing     (Image — 준비 고리)
         ├─ ResourceLock  (CanvasGroup) ─ DropIcon (Image) · CostText (TextMeshProUGUI)
         ├─ Timer         (TextMeshProUGUI)
         ├─ ChargePips    (HorizontalLayoutGroup → Image ×3, 슬롯 아래 바깥)
         ├─ KeyPrompt     (Image 키캡 + KeyText: TextMeshProUGUI)
         └─ PadPrompt     (Image · 위치형 중립 패드 기호)
      (SkillSlot_Dash · SkillSlot_Utility · SkillSlot_Ult 동일 구조, 장식 Image 는 모두 Raycast Target 끔)
PlayerInput (Behavior: Invoke C Sharp Events · 스킴: Keyboard&Mouse / Gamepad / Touch)
EventSystem (InputSystemUIInputModule)`,

      steps: [
        '**Canvas Scaler** 를 `Scale With Screen Size`, Reference Resolution `1920×1080` 으로 맞춘다. 갤러리 무대와 같은 기준이라 위치·크기를 그대로 옮길 수 있다.',
        '슬롯 안에 `Clip`(RectMask2D)을 만들고 Icon · CooldownMask · ReadyGlint 만 그 안에 넣는다. 충전 점 · 버튼 안내 · 숫자는 Clip **밖**에 둔다.',
        'CooldownMask 는 **Image Type = Filled, Fill Method = Radial 360, Fill Origin = Top, Clockwise 끔**. `fillAmount` 를 1 → 0 으로 줄이면 12시부터 시계 방향으로 걷힌다. 세로 방식용 CooldownMaskV 는 Vertical · **Origin Top**.',
        '`SkillSlot.cs` 는 남은 시간을 초가 아니라 **남은 비율 `remainRatio`(1→0)** 로 저장하고, `Update` 에서 `remainRatio -= Time.deltaTime / EffectiveDuration` 한다. `SkillBar.ApplyHaste()` 는 총 시간 배율(`DurationScale`)만 바꾸므로 비율이 유지된 채 총 시간이 줄어든다.',
        '`TryUse()` 는 성공 여부와 함께 `BlockReason { None, Cooldown, Resource, NoCharge }` 를 돌려준다. 거부면 `PlayDenied(reason)` 코루틴이 슬롯을 흔들고 이유 표시(숫자 / 물방울 / 빈 점)를 한 번 밝힌다.',
        '숫자는 표시값이 **바뀔 때만** `SetText` 한다. 3초 이상은 `Mathf.CeilToInt`, 3초 미만은 0.1 단위 올림을 `SetText("{0:1}", v)` 로(할당 없음). 총 쿨다운이 `numberMinDuration` 보다 짧으면 숫자를 끈다.',
        '`remainRatio` 가 0 이 되는 프레임에 `PlayReadyCue()` 를 **한 번만** 부른다. 빛줄기는 350ms 동안 Clip 왼쪽 밖 → 오른쪽 밖으로, 아이콘 `localScale` 은 1 → 1.08 → 1.',
        '`InputGlyphSwitcher.cs` 가 `PlayerInput.onControlsChanged` 를 받아 0.25초 디바운스 후 `SkillBar.SetDevice()` 를 부르면 모든 슬롯의 안내가 한 번에 바뀐다. 터치면 KeyPrompt · PadPrompt 를 끄고 슬롯을 우하단 부채꼴 위치로 옮겨 키운다(앵커를 바꾼 뒤 0.32초 보간). 기본 · 도약 · 보호막은 모서리에서 610 안쪽, 궁극기만 그 바깥(약 730)에 둔다.',
        '터치 배치에서는 슬롯 자체가 버튼이다. `SkillSlot` 이 `IPointerDownHandler` 를 구현해 `OnPointerDown` 에서 `TryUse()` 를 부르고, Frame Image 하나만 Raycast Target 을 켠다. (같은 InputAction 을 쓰고 싶다면 On-Screen Button 을 붙이는 방법도 있다 — 아래 함정 참고)',
        '`SkillBarDemo.cs` 를 붙이면 갤러리와 같은 숫자키(1~6)로 이벤트를 시험할 수 있다.',
      ],
      pitfalls: [
        'Image 에 **Source Image 가 없으면** Inspector 에 Image Type 항목이 보이지 않는다(강사 확인 권장). 흰 사각형이라도 스프라이트를 먼저 넣는다.',
        '슬롯 위에 겹쳐 그린 **다른** UI(거부 안내 · 가속 칩 · 엄지 영역 안내)의 **Raycast Target** 을 켜 두면 그 아래 슬롯의 터치를 가로챈다. 슬롯 안의 덮개 · 빛줄기 · 고리는 눌러도 이벤트가 부모 SkillSlot 으로 올라가지만 레이캐스트 대상만 늘어나므로 끄고, 누르는 면은 Frame 하나만 켠다.',
        '거부 흔들림 코루틴을 연타로 끊고 새로 시작할 때, 시작 시점의 `anchoredPosition` 을 기준점으로 잡으면 **흔들린 위치**가 기준이 되어 슬롯이 조금씩 옆으로 밀려난다. 기준 위치는 `Awake` 에서 한 번만 저장하고, 끊을 때 위치 · 크기를 먼저 되돌린다.',
        '`RectMask2D` 를 슬롯 루트에 붙이면 바깥에 둔 충전 점 · 키캡 · 숫자까지 잘린다. 잘라야 할 것만 안쪽 Clip 에.',
        '세로 덮개를 **Origin Bottom** 으로 두고 1 → 0 으로 줄이면 아이콘이 위부터 드러나 의도와 반대가 된다.',
        'TMP 의 `SetText("{0:1}", v)` 는 `string.Format` 과 서식이 다르다(콜론 뒤 숫자 = 소수 자릿수). 매 프레임 `text = v.ToString("F1")` 은 문자열 할당이 계속 생긴다.',
        'On-Screen Control 은 가상 Gamepad 를 만든다. PlayerInput 의 Auto-Switch 가 켜져 있으면 터치 버튼을 누르는 순간 Gamepad 스킴으로 바뀌어 안내가 패드 기호로 튈 수 있다(강사 확인 권장). 터치 UI 가 켜진 동안은 이 전환을 무시한다.',
        '자주 바뀌는 스킬 바는 정적 UI 와 **별도 Canvas** 로. 같은 Canvas 면 `fillAmount` 가 바뀔 때마다 Canvas 전체가 다시 배칭된다.',
      ],
    },
    uitk: {
      hierarchy: `UIDocument (Panel Settings: Scale With Screen Size 1920×1080) + SkillBarUITK.cs
└─ SkillBar.uxml  (#hud ← device-keyboard / device-gamepad / device-touch · fill-vertical / fill-binary 클래스)
   ├─ Label #toast (.toast · toast--energy / toast--empty)
   ├─ #energy (.energy)
   │  ├─ Label #energy-label
   │  ├─ .energy__bar > #energy-fill · #cost-marker > Label #cost-label
   │  └─ Label #haste-chip
   └─ #skill-bar (.skill-bar)
      └─ .slot ×4 (#slot-primary · #slot-dash · #slot-utility · #slot-ult)
         ├─ .slot__clip (overflow: hidden — 여기 안만 잘린다)
         │  ├─ .slot__icon
         │  ├─ RadialCooldown .slot__sweep (picking-mode: Ignore)
         │  ├─ .slot__vmask (세로 덮개 · top 고정 · height = 남은 비율 %)
         │  └─ .slot__glint (picking-mode: Ignore)
         ├─ .slot__lock > .slot__drop · Label.slot__cost
         ├─ Label .slot__timer
         ├─ .slot__pips > .pip ×3
         ├─ .slot__prompt > Label.prompt-key · .prompt-pad
         └─ Label .slot__name
파일: SkillBar.uxml · SkillBar.uss · RadialCooldown.cs · SkillBarUITK.cs`,

      steps: [
        'Panel Settings 의 Scale Mode 를 `Scale With Screen Size`, Reference Resolution 을 `1920×1080` 으로 맞춘다.',
        '`RadialCooldown.cs` 는 `[UxmlElement] public partial class RadialCooldown : VisualElement`. 생성자에서 `generateVisualContent += Draw` 를 등록하고, `progress` 속성의 setter 에서 값이 바뀔 때만 `MarkDirtyRepaint()` 한다. 코드가 `UIGallery.SkillCooldownPrompt` namespace 안에 있으므로 UXML 에는 `<UIGallery.SkillCooldownPrompt.RadialCooldown>` 처럼 namespace 를 포함한 이름으로 쓴다.',
        '`Draw` 에서 `painter2D.Arc(center, r, Angle.Degrees(-90 + 360 * (1 - progress)), Angle.Degrees(270), ArcDirection.Clockwise)` 로 "바늘 → 12시" 구간만 칠하면 UGUI(Clockwise 끔)와 같은 **시계 방향**으로 걷힌다.',
        '`SkillBarUITK.cs` 의 `Update` 에서 각 슬롯의 남은 비율을 줄이고 `radial.progress` 와 `.slot__vmask` 의 `style.height = Length.Percent(비율 × 100)` 을 넣는다.',
        '못 쓰는 이유는 슬롯 클래스로 나눈다: `.slot--cooling`(덮개+숫자) · `.slot--no-energy`(아이콘 틴트 회색 + `.slot__lock` 표시) · `.slot--empty`(빈 점 + 덮개). 거부 시 `.slot--hot-<이유>` 를 붙여 이유 표시를 키우고, `style.translate` 로 240ms 흔든 뒤 뗀다.',
        '장치 전환은 루트 클래스 하나(`EnableInClassList("device-gamepad", …)`)로 모든 슬롯의 안내를 한꺼번에 바꾼다. 슬롯은 두 배치 모두 `position: absolute` + `left/top` 값으로 두고, `.device-touch` 에서는 `.slot__prompt` 를 숨기고 `left/top/width/height` 값만 바꿔 0.32초 transition 으로 옮긴다.',
        '스크립트 아래쪽 테스트 입력이 갤러리와 같은 숫자키(1~6)로 이벤트를 발생시킨다.',
      ],
      pitfalls: [
        '`Painter2D.Arc` 의 각도는 float 가 아니라 `Angle` 구조체 — `Angle.Degrees(…)` 로 감싼다. 0도는 3시 방향이라 12시는 -90도.',
        '`Arc(-90, -90 + 360 × progress, Clockwise)` 로 그리면 덮개가 **반시계**로 걷혀 UGUI 와 반대가 된다. 시작각을 바늘 위치로 잡는다(위 단계). 방향은 강사가 6.3 에서 직접 확인한다.',
        '`progress` 를 바꾸고 `MarkDirtyRepaint()` 를 빼먹으면 덮개가 멈춘 것처럼 보인다.',
        '`[UxmlElement]` 클래스는 `partial` 이어야 하고, 구버전 `UxmlFactory` / `UxmlTraits` 방식과 섞어 쓰지 않는다.',
        'USS 는 gradient · box-shadow 를 지원하지 않는다. 원형 덮개는 Painter2D, 탈색은 `-unity-background-image-tint-color`(가볍다). 6.3 의 USS `filter` 는 요소를 한 번 더 렌더링하므로 이 예제에서는 쓰지 않았다.',
        '`overflow: hidden` 을 `.slot` 에 걸면 바깥의 충전 점 · 안내 · 숫자까지 잘린다. `.slot__clip` 에만.',
        '단축바를 flex row(위치 = auto)로 두고 터치에서만 `position: absolute` + `right/bottom` 값을 주면, auto ↔ 값 사이는 transition 이 보간하지 못해 슬롯이 **순간 이동**한다. 두 배치 모두 같은 속성(left/top)의 값으로 둔다.',
      ],
    },
  },
  inspiredBy: [
    {
      title: 'Destiny 2 (2017)',
      credit: '© Bungie, Inc.',
      borrowed: ['레이아웃 구조 (자원 게이지 옆에 그 자원을 쓰는 능력 슬롯)'],
      learned:
        '커뮤니티 위키(T3)에 따르면 슈퍼 게이지 옆에 해당 능력 아이콘이 붙어 있다. 이 표본은 그 **"자원 게이지 + 그 자원을 쓰는 슬롯"을 붙여 두는 구성**만 빌려 에너지 바에 궁극기 비용 눈금을 그렸다. 2020년 공식 포럼 답변(T3)이 설명하는 근접 능력의 채워짐/회색 **이분 상태**는 빌리지 않고, 덮개 방식 "이분"으로 재현해 비교 기준으로만 쓴다. 채움 방향 · 준비 반짝임 · 장치별 아이콘 전환은 출처로 확인하지 못했다(미확인).',
      link: 'https://www.bungie.net/7/en/Destiny',
    },
    {
      title: 'Prince of Persia: The Lost Crown (2024)',
      credit: '© Ubisoft Entertainment',
      borrowed: ['레이아웃 구조 (모바일판: 버튼 안내 대신 화면 위 버튼 자체)'],
      learned:
        'Ubisoft 공식 기사(T1)에 따르면 2025년 모바일 포팅판은 콘솔식 버튼 안내를 옮기지 않고, 화면 위 가상 입력의 **크기 · 위치 · 투명도를 플레이어가 고치게** 했다. 이 표본의 터치 배치는 "안내 기호 대신 슬롯 자체를 큰 터치 버튼으로"라는 배치 원리만 빌렸다. 사용자 조정은 해설의 확장 아이디어로만 다룬다. 콘솔 · PC판의 쿨다운 표시는 확인하지 못했다(미확인).',
      link: 'https://news.ubisoft.com/en-us/article/7HvHq2SIDTcXg6ap0v4QgD/prince-of-persia-the-lost-crown-mobile-accessibility-spotlight',
    },
  ],
  original:
    '스킬 아이콘 4종(파동 = 동심원 호, 도약 = 겹친 화살촉, 보호막 = 육각형, 폭주 = 여덟 갈래 별), 한쪽 모서리를 깎은 슬롯, 테두리 진행 고리, 물방울 자원 기호, 충전 점, 거부 이유 안내, 쿨다운 가속 표시, 터치 부채꼴 배치와 엄지 영역 안내선, 색(준비 = 청록 · 자원 = 호박색 · 덮개 = 중립 남색)과 문구는 모두 이 갤러리에서 새로 만들었다. 패드 안내는 특정 콘솔 기호 대신 갤러리 공통 **위치형 중립 글리프**를 쓴다. **숫자를 보일 최소 쿨다운, 비율 유지 가속 버프, 거부 이유별 모양 구분**은 교육용으로 더한 장치다.',
  references: [
    { label: 'GDC 2016 — Tenacious Design and The Interface of Destiny (David Candland, Bungie · 원작 Destiny 기준)', url: 'https://gdcvault.com/play/1023460/Tenacious-Design-and-The-Interface' },
    { label: 'GDC — UX Mobile Porting Challenges in Prince of Persia: The Lost Crown (Ubisoft Da Nang)', url: 'https://gdcvault.com/play/1035691/UX-Mobile-Porting-Challenges-in' },
    { label: 'Ubisoft News — The Lost Crown 모바일 접근성 소개 (가상 입력 커스터마이즈)', url: 'https://news.ubisoft.com/en-us/article/7HvHq2SIDTcXg6ap0v4QgD/prince-of-persia-the-lost-crown-mobile-accessibility-spotlight' },
    { label: 'Destiny 2 위키 — UI, HUD and Menu Changes in Destiny 2 (T3)', url: 'https://d2.destinygamewiki.com/wiki/UI,_HUD_and_Menu_Changes_in_Destiny_2' },
    { label: 'Unity 6.3 — Painter2D.Arc', url: 'https://docs.unity3d.com/6000.3/Documentation/ScriptReference/UIElements.Painter2D.Arc.html' },
    { label: 'uGUI 2.0 — Image (fillMethod · fillOrigin · fillClockwise)', url: 'https://docs.unity3d.com/Packages/com.unity.ugui@2.0/api/UnityEngine.UI.Image.html' },
    { label: 'Input System — Displaying bindings (GetBindingDisplayString)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/ActionBindings.html#displaying-bindings' },
    { label: 'Input System — On-Screen Controls (가상 장치 생성)', url: 'https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/OnScreen.html' },
  ],
  related: [
    { id: 'health-bar-trail', why: '같은 "즉시 반영 + 따라오는 연출" 문법을 체력 바에 쓴 예. 에너지 바도 같은 구조로 만들 수 있다' },
    { id: 'main-pause-menu', why: '버튼 안내 글리프가 마지막 입력 장치를 따르는 같은 규칙을 메뉴에 적용한 예' },
    { id: 'settings-accessibility', why: '빠른 전환 안내를 장치별로 바꾸는 하단 힌트와, 세로 터치 재배치 비교' },
  ],
  flashes: true,
}
