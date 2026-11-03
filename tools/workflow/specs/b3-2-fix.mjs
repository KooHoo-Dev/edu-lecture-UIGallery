// 3순위 2차 묶음 수정 명세 (2026-11-03). 독립 리뷰 지적 중 코드와 화면으로 확인한 것.
// 1차 묶음의 교훈: 수정 잡에 "용량 줄이기" 를 넣지 않는다 (워커가 바이트를 세다 예산을 태웠다).
const CHANGED = [
  '갤러리 전체가 원본 74% · gzip 92% 다. 고치면서 용량을 늘리지 않는다. 측정은 끝내기 전에 `node tools/size.mjs <id>` 한 번만 보고, 줄이는 작업은 하지 않는다.',
]

export default [
  {
    id: 'match3-goal-hud', batch: '3순위 2차',
    keep: '개수 정산(날리는 개수 `min(깨진 수, 남은 수)`, 도착 때 표시값이 실제값을 앞지르지 않음), 결과가 두 번 나지 않는 구조, 별 마커 위치 계산, 경고 맥동 주기, 0개 부스터의 충전 상태, 모양으로도 구분되는 블록, Unity 좌표 변환과 OnDisable 정리, SO 로 HUD 자동 구성, 안전 영역 처리는 리뷰가 맞다고 확인했으니 유지한다.',
    changed: CHANGED,
    required: [
      '**UGUI: 비행 중에 다시 시작하면 MissingReferenceException** (`GoalHud.Bind` · `GoalFlyer`). `Bind` 가 옛 목표 칸을 지우지만 남은 비행을 취소하지 않아, 도착할 때 지워진 TMP 에 접근한다 (R 키, 실패 뒤 다시 하기, 연쇄 중 L). UI Toolkit 판처럼 `Bind` 에서 비행을 콜백 없이 풀로 돌려준다 (`GoalFlyer.CancelAll()`).',
      '**실패 판정이 비행을 기다리지 않는다** (웹 `index.tsx` 의 판정, C# `LevelDefinition.Judge`). 성공만 비행 0 을 확인해, 연쇄 없는 마지막 이동에서는 실패 창이 먼저 뜨고 아이콘이 창 위로 날아가며 "남은 목표" 와 HUD 숫자가 잠깐 어긋난다. 해설 1, 실수 4, timings, UGUI 단계 5 와 코드 주석이 모두 "연쇄와 비행이 끝날 때까지 미룬다" 고 말하므로 코드를 글에 맞춘다: 실패도 비행 0 일 때만.',
      '**자동으로 열리는 결과 창에 입력 잠금이 없다**: 마지막 연쇄 중에 Enter 를 연타하던 사람이 창이 뜬 직후 바로 다시 시작한다 (Enter 자동 반복도). 웹은 `core/inputLock` 의 `createInputLock(300)` 처럼 누른 시각으로 판정하고 `e.repeat` 를 거른다. Unity 는 창을 연 시각과 누른 시각을 비교한다 (UGUI · UI Toolkit).',
    ],
    recommended: [
      'Unity 비행 도착점을 Fly 순간에 한 번만 읽어, 다시 시작한 같은 프레임이나 회전 · 안전 영역 변경 뒤 엉뚱한 곳으로 간다. 매 프레임 목표에서 다시 읽거나 `Bind` 에서 `LayoutRebuilder.ForceRebuildLayoutImmediate`.',
      '목표를 다 채운 뒤 비행을 기다리는 동안 탭 · 자동 데모가 이동을 쓰지 않게 막는다.',
      'Unity: HUD 를 껐다 켜면 결과 창이 사라진 채 멈춘다 → `OnEnable` 에서 결과가 있으면 다시 연다. UGUI 별 마커 앵커를 늘릴 때 `sizeDelta.y` 를 0 으로. UI Toolkit `.booster` · `.result__retry` 는 테마의 `:hover` · `:active` 배경도 직접 지정한다.',
      '16:9 비행 경로의 조절점을 목표 패널 위로 올려 다른 목표 아이콘을 가로지르지 않게.',
      '글과 주석의 수치를 코드와 맞춘다: "살짝 커진다"(실제 ×1.45), "1.2→1"(실제 1.22), CSS 주석의 "왕복", 쓰이지 않는 hotspot `pin`, 해설 3 `fly` 가 보드 전체를 가리킴(가이드 4절), UI Camera 가 계층에 없음(URP Overlay 카메라 스택 한 줄), UGUI pitfall 의 timeScale 0 이유.',
    ],
    shots: '기본, 효과 끄기, 연쇄 없는 마지막 이동으로 실패(정산 보기 프리셋), 결과 창에서 Enter 연타, 다시 하기',
    budgetUsd: 7,
  },
  {
    id: 'directional-combo-input', batch: '3순위 2차',
    keep: '판정 로직(접두사 필터, 재사용 대기 제외, 긴 후보가 있으면 기다림, 기다림 중 다른 방향이면 먼저 발동하고 새 첫 칸으로, 기다리는 동안 제한 시간 정지, 관대한 모드)은 웹과 Unity 가 같고 리뷰가 맞다고 확인했다. 열렸을 때만 방향키 · WASD 를 먹는 키 처리, 효과 끄기, 새 커맨드 이름과 시퀀스(원작 코드와 같은 것 없음)도 유지한다.',
    changed: CHANGED,
    required: [
      '**스와이프 임계값과 "한 번 = 한 칸"** (`index.tsx` `SWIPE_PX`, `combo.ts` 양자화). 70 논리 px 라 무대가 축소되면 390px 폰에서 약 13 CSS px 가 되어 한 번 밀면 4~9칸이 들어간다 (가이드의 입력 소비 · 관통). 임계값을 화면(CSS) px 로 32~40 정도에 두고, 한 번 밀기(누름 → 뗌 또는 방향이 바뀔 때까지)가 한 칸이 되게 한다. 대각선 무시 구간을 넣고(Unity `diagonalBand` 처럼), 첫 포인터만 열기 · 닫기를 맡게 해 두 번째 손가락이 덮어쓰지 않게 한다. 주석과 해설 문구를 사실대로.',
      '**누르고 있기 모드에서 아무도 안 누르는데 열린 채 남고 자동 데모가 멈춘다**: 자동 데모가 연 목록을 방향키로 넘겨받거나 이벤트(open · wrong · ambiguous)로 열면 `owner=\'human\'`, `heldBy=null` 이 되어 Esc 전까지 데모가 영구히 멈추고 ←/→ 도 계속 먹힌다 (강사가 해설 번호를 넘기려던 → 가 커맨드로 들어간다). 누르고 있기 모드에서 누르는 사람이 없는 상태는 이벤트 · 인계로 연 경우 입력이 없으면 약 3초 뒤 닫고 자동 데모를 되살린다 (`radial-quick-select` 의 구조 참고).',
      '**Unity: 열 때 이미 눌려 있던 이동 키가 첫 칸으로 들어간다** (`ComboInput.cs`). `Open()` 에서 Direction 액션을 Enable 한 그 프레임에 `ReadValue` 가 0 이라 `waitNeutral` 이 풀리고, 다음 프레임에 걷던 W 가 ↑ 로 들어간다. Direction 을 늘 켜 두고 열렸을 때만 Feed 하거나, 연 프레임은 Feed 를 건너뛴다. 주석과 meta UGUI 단계 3 을 실제 동작에 맞춘다.',
    ],
    recommended: [
      '닫는 경로를 나눈다: 떼기와 토글 닫기에서만 기다리던 커맨드를 발동하고, Esc · 취소 · blur · 창 포커스 잃음 · OnDisable 에서는 버린다 (`Close(bool fire)`, 웹과 Unity).',
      '기다리던 커맨드가 자동 발동된 직후 틀리면 칸 번호가 틀린다: `slot` 을 push 뒤에 계산한다 (웹 `index.tsx`, `ComboHud.cs`, `ComboHudUITK.cs`).',
      'UGUI 5파일 → 4파일: `ComboMatcher` · `DirectionQuantizer` · `ComboLabels` · `MismatchStyle` 을 `ComboCommandSet.cs` 로 옮겨 UI Toolkit 판이 TMPro 를 쓰는 UGUI 화면 파일에 묶이지 않게 하고, 두 HUD 의 `hasPrefix` 계산을 `ComboCommandSet.HasPrefix(i)` 로 합친다.',
      '웹과 Unity 차이: UITK `.row--cooling` 이 `.row--mismatch` 보다 뒤에 있어 대기 줄이 더 밝다 (선언 순서나 선택자 조정), UGUI \'다음 칸\' 표시를 해설 1 의 "두꺼운 금색 테두리" 와 맞추고 색에만 기대지 않게, UITK 에 재사용 대기 막대, meta 에 터치가 있으니 Unity 에서 포인터 이동량을 `DirectionQuantizer` 에 넣는 방법을 단계나 함정으로 한 줄.',
      'Unity 열기 · 닫기 가장자리: 누름과 뗌이 같은 프레임이면 닫히지 않는다 (`if (open.IsPressed() != IsOpen)` 식으로), 스틱 0.5 기준에 해제 기준(히스테리시스).',
      '글: `index.tsx` 주석의 "←/→ 가 갤러리로 새어 표본이 바뀐다" → 실제로는 해설 번호 이동. meta UGUI 단계 1 의 "OnValidate 가 경고한다"(실제 `Debug.Log`, 값이 바뀔 때마다). `inspiredBy.learned` 의 "출처로 확인한 것" → "후보 카드가 출처로 든 범위". `borrowed` 에 "맞는 후보만 남고 입력한 화살표가 켜지는 목록 (카드 설명 기준, 원작 화면 미확인)" 을 둘째 축으로. 해설 `row` 강조가 실제 화살표보다 넓은 것(`justify-self: start`), `errorMode` 변화가 미리보기에서 잘 보이게, timings 마지막 항목의 "권장값".',
    ],
    shots: '기본, 효과 끄기, 좁은 폭(390px 상당)에서 한 번 밀기, 자동 데모 중 → 키 뒤 3초, 이벤트 \'틀린 방향 넣기\' 뒤 자동 데모 재개',
    budgetUsd: 7,
  },
  {
    id: 'context-lore-glossary', batch: '3순위 2차',
    keep: '용어집 질의(장면 장소 + 지금 장면 0..현재 줄의 말한 사람 · 키워드), 깊이 한도 · 순환 판정, G 키 처리(keyup · blur 해제, Tab 을 가로채지 않음), 효과 끄기의 나쁜 예, 항상 있는 `data-part` 5개, Unity 의 `IgnoreEvent` · `OnDisable` 정리 · Experimental 링크 이벤트(6000.3.20f1 에 실제로 있음을 리뷰가 확인)는 유지한다.',
    changed: CHANGED,
    required: [
      '**셋째 겹부터 부모 툴팁과 그 안의 여는 키워드를 덮는다** (웹 `index.tsx` 겹 배치 · prune · `onKwLeave`). 4겹 프리셋에서는 넷째 겹이 셋째 겹을 거의 다 가려 열림 → 가려짐 → pointerleave → 닫힘 → 다시 열림이 반복되어 머물러 고정할 수 없다. 고정된 겹은 여는 키워드 줄을 피해 부모 위나 아래에 놓고, prune 은 Unity 처럼 포인터 좌표가 보이는 툴팁 안인지로 판정한다. Unity 배치도 부모를 가리지 않게 맞춘다.',
      '**웹: 스택이 줄어들 때 그 안의 포커스를 돌려주지 않는다** (이벤트 4 · 5 · 6, 자동 데모, `maxDepth` 낮추기). 줄인 뒤 `activeElement` 가 닫힌 겹 안에 있으면 그 겹을 연 키워드(없으면 무대 루트)로 포커스를 옮긴다 (가이드 3절의 창 포커스 규칙과 같은 원리).',
      '**내용의 조사**: `data.ts` 의 `[[tower]]가` 가 화면에서 "북쪽 통신탑가" 로 나온다 (두 곳). `[[tower]]이` 로 고치고, 키워드 뒤 조사가 받침에 맞는지 모든 글(웹 데이터와 Unity 데이터)을 한 번 훑는다.',
      '**UGUI 툴팁이 고정되면 노란 판이 된다** (`TooltipStack.cs` 가 루트 Image 색을 매 프레임 테두리 색으로 덮어쓰는데 하이어라키에 어두운 배경 Image 가 없다). 하이어라키를 Frame(Image) › Background(Image, 2px 안쪽) 로 적고 코드는 Frame 색만 바꾼다.',
      '**param 변화가 바로 안 보인다** (가이드 3절): `edgeCorrection` 은 시작 스택에 뒤집기 · 고정이 없어 토글해도 그대로, `lockMs` 는 시작 상태가 모두 고정이라 링이 안 보인다. 값이 바뀌면 중첩을 다시 열거나 마지막 겹을 고정 전 상태로 연다.',
      '**자동 데모가 읽는 중에 끼어든다**: `humanAt` 이 키워드 올리기 · 클릭 · 키 입력 때만 갱신되어, 툴팁 안에 커서나 포커스를 둔 채 6초 넘게 읽으면 다음 대본이 스택을 지운다. 포인터가 툴팁 안에 있거나(`held() >= 0`) 무대에 포커스가 있으면 자동 데모를 쉰다.',
    ],
    recommended: [
      'Unity 터치: 탭으로 고정한 툴팁이 손을 떼면 0.45초 뒤 닫힌다 (UI 모듈이 exit 를 보냄). 터치 탭은 다른 곳을 탭할 때까지 붙잡고 바깥 탭에서 모두 닫는다 (웹은 이미 그렇다).',
      'UI Toolkit: 막 보이게 하거나 붙인 요소의 `Focus()` 는 한 프레임 미룬다 (`schedule.Execute(() => x.Focus())`, `dialogue-choices` 참고). `OnEnable` 에서 `RegisterCallback` 하면 컴포넌트만 껐다 켤 때 중복 등록되어 `NavigationMove` 가 두 번 처리되니 `OnDisable` 에서 해제한다. Label 을 마우스로 눌러 온 FocusIn 이면 0번 키워드 툴팁을 열지 않는다. Cancel 로 용어집을 닫고, 창 포커스를 잃으면 누르고 있기를 푼다 (UGUI 처럼).',
      'Unity 에서 용어집을 열면 키보드 위치를 잃는다 (hotspot 5 "떼면 그 자리로 돌아온다" 와 불일치): (글, 링크 번호)를 저장했다 복원하고 용어집이 열린 동안 닫힘 유예를 멈춘다.',
      '글리프: 맑은 고딕 · Arial 에 ↩ 가 없고 Arial 에는 ◆ 도 없다. 순환 표시의 핵심 단서가 □ 로 나올 수 있으니 한글 폰트에도 있는 글자로 바꾸거나 pitfall 에 콕 집어 적는다. UI Toolkit USS 와 pitfall 에 한글 FontAsset 안내를 넣는다 (`dialogue-choices` 의 USS 주석 참고).',
      'UGUI FocusFrame 이 TMP 글 위에 그려져 기본 흰 사각형이면 키워드를 가린다: 색 · 스프라이트와 그리는 순서를 하이어라키에 적는다. 웹 Tab 순서: 툴팁 칸을 대사 바로 뒤 DOM 으로 옮겨 Tab 으로도 툴팁 키워드에 들어가게.',
      '웹 · Unity 차이를 맞춘다: 순환 강조 맥동(웹 1.25Hz, UGUI 1.5Hz, UITK 없음), 용어집 페이드(140 / 없음 / 160ms), 깊이 한도 표식(⋯ / …). timings 표는 복사용 프롬프트에 들어간다. 해설 번호가 글을 덮는 것(2번 `pin: \'left\'`, 5번 `\'below\'`), `holdMode` 힌트 · hotspot 5 의 "토글로 열면 첫 항목"(웹은 마지막 선택 유지)을 실제 동작에 맞춘다.',
    ],
    shots: '기본, 효과 끄기, 4겹 프리셋에서 넷째 겹에 머물러 고정, 툴팁 안 키워드에 포커스 둔 채 이벤트 4, 툴팁을 8초 읽기(자동 데모가 끼어들지 않는지), edgeCorrection 토글',
    budgetUsd: 8,
  },
]
