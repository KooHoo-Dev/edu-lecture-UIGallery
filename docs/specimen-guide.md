# 표본 제작 가이드 (계약 v1)

표본 하나를 새로 만들 때 따르는 규칙과 체크리스트. 기준 구현 두 개를 먼저 읽는다.

| 기준 구현 | 보여 주는 것 |
|---|---|
| [`src/specimens/health-bar-trail`](../src/specimens/health-bar-trail) | 2D HUD · ref 로 DOM 직접 갱신 · 자동 데모 · 효과 끄기 · 번쩍임 제한 · CSS 애니메이션 배속/정지 |
| [`src/specimens/offscreen-waypoint`](../src/specimens/offscreen-waypoint) | 3D Scene + HUD · `bus` 로 상태 공유 · WebGL 없을 때 2D 대체 · 드래그 입력 |

## 1. 파일

```
src/specimens/<id>/index.tsx          default export = HUD 컴포넌트, export { meta } from './meta'
                                      (3D 면) export { XxxScene as Scene } from './Scene'
src/specimens/<id>/meta.ts            모든 글·조절 값·프리셋·핫스팟·Unity 가이드
src/specimens/<id>/style.module.css   표본 전용 스타일 (전역 선택자 금지)
src/unity/<id>/ugui/*.cs              UGUI 구현 (+ 테스트 입력 스크립트 권장)
src/unity/<id>/uitk/*.uxml *.uss *.cs UI Toolkit 구현
```

- `<id>` 는 **영구 불변** kebab-case. `meta.id` 와 폴더명이 같아야 한다.
- 다른 폴더(`src/app`, `src/core`, 다른 표본)는 수정하지 않는다. 공통 기능이 필요하면 요청으로 남긴다.

## 2. 좌표와 크기

- HUD 는 **논리 해상도 1920×1080** (세로 표본은 1080×1920) 픽셀로 그린다. 무대가 알아서 축소한다.
  Unity Canvas Scaler 의 Reference Resolution 과 같은 개념이라 수치를 그대로 Unity 로 옮길 수 있다.
- 글자는 최소 22px (프로젝터에서 축소돼도 읽히도록), 주요 수치는 28px 이상.
- 루트 요소는 `position: absolute; inset: 0`.

## 3. Props 사용 규칙 (`SpecimenProps`)

| prop | 반드시 지킬 것 |
|---|---|
| `params` | `num/str/bool(p.params, key, 기본값)` 으로 읽는다. meta 의 모든 param 이 화면에 **눈에 띄는** 차이를 만들어야 한다 |
| `juice` | `false` 면 연출(잔상·흔들림·보간·강조·소리 대신 시각 피드백 등)을 끈 **나쁜 예**. 단순히 아무것도 안 보이는 게 아니라 "흔한 실수"를 재현한다 |
| `playing` | `false` 면 정지. JS 루프는 `useGameLoop(p.playing, p.timeScale, dt => …)`, CSS 애니메이션은 `data-paused` 로 `animation-play-state: paused` |
| `timeScale` | 게임 시간 배속. `useGameLoop` 의 dt 에 이미 곱해져 있다. CSS 애니메이션 시간은 `calc(… / var(--ts))` |
| `trigger` | `useTrigger(p.trigger, id => …)` — meta.events 의 id 마다 처리 |
| `autoplay` | `useAutoplay(p.autoplay, p.playing, p.timeScale, 초, fn, p.trigger?.seq)` 로 사람이 없어도 핵심 상황이 순환하는 데모 |
| `thumbnail` | 갤러리 카드용. 무거운 것(3D·많은 입자)은 생략 가능. 정지 상태에서도 **첫 화면이 의미 있게** 보여야 한다 |
| `webgl` | 3D 표본에서 `false` 면 HUD 가 2D 대체 배경을 그린다 |
| `bus` | HUD ↔ Scene 공유 객체 (마운트마다 새로 생성) |
| `width/height/aspect` | 논리 해상도. 세로(9:16) 지원 표본은 레이아웃을 분기 |

### 성능

- 매 프레임 바뀌는 값은 `useRef` + DOM 직접 갱신 (`el.style.transform = …`). 프레임마다 `setState` 하지 않는다.
- 값이 바뀌거나 정지 상태일 때도 한 번은 그려지게 `useLayoutEffect(() => paint())` 를 둔다.

### 공통 유틸 (직접 만들지 말고 가져다 쓴다)

| 파일 | 내용 | 쓰는 표본 예 |
|---|---|---|
| `core/hooks.ts` | `useGameLoop` · `useTrigger` · `useAutoplay` · `damp` · `clamp` · `scaled` | 전부 |
| `core/countup.ts` | `createCountUp(from, to, ms)` → `.step(dt)` `.skip()` · `formatNumber` · 이징 함수 | 결과·보상, 데미지 합계, 퀘스트 진행 |
| `core/placement.ts` | `placeFloating(anchor, size, bounds, 'right')` — 재고→뒤집고→고정 | 툴팁, 선택지 패널, 말풍선 |
| `core/projection.ts` | `project()` 월드→화면+가장자리 고정+카메라 뒤 판정, `relativeBearing` | 화면 밖 표시, 데미지 숫자, 미니맵 |
| `core/input.tsx` | 중립 입력 글리프(`ActionGlyph` `KeyCap` `PadButton` `Shoulder` `MouseGlyph` `TouchGlyph`) + `useLastInputDevice()` | 메뉴, 쿨다운, 인벤토리, 대화창, 설정 |
| `core/silhouettes.tsx` | 실루엣 키트 `<Silhouette role="ally|enemy|neutral">` (아군=캡슐, 적=삼각, 중립=마름모) | 데미지 숫자, 조준점, 설정 미리보기 |
| `core/flash.ts` | `requestFlash()` 번쩍임 제한기 · `prefersReducedMotion()` | 번쩍이는 효과가 있는 표본 |
| `core/virtualList.ts` | `visibleRange(scroll, viewport, itemSize, count, overscan)` · `itemOffset()` · `createRecycler(recycle)` → `.layout(range)` 항목→셀 배정 · `.stats()` 만든/재사용 셀 수 | 재활용 스크롤 리스트, 배틀패스 트랙 (같은 크기 항목 한 줄) |
| `core/inputLock.ts` | `createInputLock(ms)` → `.open(now)` · `.blocks(누른 시각)` · `.progress(now)` — **누른 시각**으로 판정하는 입력 잠금 | 뽑기 결과, 보상 받기 (처음 쓴 곳: 레벨업 3택) |
| `core/input.tsx` (추가) | `BindingGlyph` 임의 입력 하나의 글리프 · `keyLabel(code)` · `bindingLabel()` 읽는 이름 · `bindingFromKeyboard(e)` · `sameBinding()` 충돌 확인 | 키 리바인딩, 스킬 칸 |

- 게임패드 버튼은 **위치(아래/오른쪽/왼쪽/위)** 로만 표기한다. 특정 콘솔의 기호(A/B/X/Y, ○/×/△/□)·로고 금지.
- 파라미터 이름은 camelCase, 같은 개념은 같은 이름: `edgeMargin`(px), `fovDeg`, `accentColor`, `skewDeg`, `inputDevice`(auto|keyboard|gamepad|touch), `pulseHz`(≤ 3).
- 단위가 있는 값은 이름 끝에 단위를 붙인다: 시간 `…Ms`, 각도 `…Deg`, 주파수 `…Hz`, 배율 `…Scale`, 초당 글자 수 `…Cps` (예: `displayMs`, `cooldownMs`, `typeSpeedCps`).
- 색 설정은 대상을 이름에 넣는다 (`damageColorMap`, `rarityColors`). `colorMode` 처럼 설정·접근성 표본의 색각 보정과 헷갈리는 이름은 쓰지 않는다.

### 공통 용어 (해설에서 같은 말로 쓴다)

| 용어 | 뜻 |
|---|---|
| **입력 소비** | 입력 하나는 한 단계만 처리한다. 한 번 눌렀는데 여러 단계가 넘어가면(관통) 실수 |
| **입력 버퍼** | 연출 중에 들어온 입력을 버리지 않고 기억했다가 연출이 끝나면 적용한다 |
| **입력 잠금** | 새 선택지·창이 막 나타난 직후 짧게(0.2~0.4초) 확정 입력을 막아 실수로 고르는 것을 방지한다 |
| **시간 제한** | 자동으로 넘어가거나 사라지는 것은 끄거나 길게 늘릴 수 있어야 한다 (자세한 기준은 설정 · 접근성 표본) |

### 다른 표본과 이어 주기

- 겹치는 주제는 한 표본이 맡고, 다른 표본은 짧게 비교한 뒤 링크한다. `meta.related` 에 `{ id, why }` 를 넣으면 '더 보기'에 나타난다.
- 해설 문장 안에서는 `[화면 밖 목표 표시](#/s/offscreen-waypoint?preset=ambient)` 처럼 링크한다 (같은 탭에서 열린다).

### 주제 태그

- 접근성 기능 자체가 학습 목표(`goals`)에 들어 있으면 `meta.tags: ['accessibility']` 를 단다. 홈의 '주제' 필터와 카드 · 상세 페이지에 '접근성' 으로 보인다.
- 원리 '접근성'(`principles`)은 더 넓다. 색만으로 구분하지 않기처럼 표본이 접근성을 지키기만 해도 단다. 태그는 그것이 주제일 때만.

### 공통 세계관 · 문구

표본마다 따로 노는 설정 대신 하나의 가상 세계를 쓴다 (원작과 무관한 이 갤러리 고유 설정).

- **외곽 탐사대** — 변방 행성의 궤도 정비 기지와 지표 탐사 구역
- 인물: **하린**(탐사대장), **도윤**(정비사), **세라**(통신 담당) — 모두 아군(캡슐 실루엣)
- 적: **잔해 드론** (삼각 실루엣)
- 아이템·자원: 수리 키트, 냉각 셀, 회로 조각, 산소 캔, 크레딧
- 화면 속 문구는 짧고 구체적으로: "냉각 셀 3개 회수", "북쪽 통신탑 복구"

## 4. 해설 번호 (hotspots)

- meta.hotspots 의 `part` 마다 HUD 안에 `data-part="<part>"` 요소가 **항상** 있어야 한다 (숨김 상태여도 DOM 에는 존재).
- 번호는 요소의 위쪽 가운데에 붙는다. 넓은 요소(예: 바 전체) 대신 **설명하려는 부분만 감싼 영역**에 붙인다 (기준 구현의 `trail` 영역 참고).
- 위쪽이 막혀 있으면 hotspot 의 `pin: 'below' | 'left' | 'right' | 'inside'`, 상태에 따라 바꾸려면 요소에 `data-pin="…"`.
- 대상이 지금 보이지 않으면(opacity 0 · visibility hidden) 번호는 자동으로 흐려진다. 숨은 요소를 가리키려고 자리 표시 요소를 따로 만들 필요는 없다.
- 3~5개. `principle` 은 8개 원리 중 하나.

## 5. 접근성 · 안전

- 화면의 넓은 영역이 번쩍이는 효과는 `requestFlash()` 가 `true` 일 때만. 해당 표본은 `meta.flashes = true`.
- 반복 맥동은 2Hz 이하.
- 색만으로 상태를 전달하지 않는다 (모양·위치·글자와 함께).

## 6. 콘텐츠 정책 (요약)

- 원작 에셋·로고·캐릭터·전용 폰트·고유 문구 0. 원작에서 빌리는 시각 축은 **최대 2개** (`inspiredBy[].borrowed`).
- `inspiredBy[].title` 은 `원제 (연도)` 형식 (예: `Dead Space (2008)`). 근거로 확인하지 못한 화면 묘사는 "미확인"이라고 밝히고, 확인된 근거가 없으면 `borrowed: []` (장르 관례로만 다룬다).
- 표본 제목·ID·프리셋 이름·CSS 클래스·변수명에 **게임명 금지**. 게임명은 `inspiredBy` 에만.
- 비트맵 금지. 아이콘은 직접 그린 SVG/CSS.
- 화면 속 텍스트(퀘스트명, 아이템명, 대사)는 원작과 무관한 새 문구로.

## 7. meta.ts 글쓰기

- 한국어, 수업에서 그대로 읽을 수 있게 짧게. `**굵게**`, `` `코드` `` 사용 가능.
- `goals` 3~4개 ("~할 수 있다"), `mistakes` 3~5개, `timings` 는 근거 없으면 note 에 "권장값".
- `unity.ugui / unity.uitk` 의 `hierarchy` 는 실제 파일과 일치해야 한다.

## 8. Unity 코드

- Unity 6.3 LTS · 새 Input System · TextMeshPro(UGUI).
- 금지: `FindObjectOfType`, `Rigidbody.velocity`, 구 Input Manager (`Input.GetKey` 등).
- UI Toolkit: `UIDocument` + UXML + USS. USS 에 없는 CSS 기능(gradient, filter, box-shadow 등)을 쓰지 않는다.
- 각 파일 상단에 무엇을 하는지 한국어 주석. 외부 패키지(DOTween 등)는 쓰지 않는다.
- 모든 C# 는 `namespace UIGallery.<PascalCase 표본 id>` 안에 둔다 (예: `card-hand-targeting` → `UIGallery.CardHandTargeting`). 학생이 여러 표본을 한 프로젝트에 넣어도 같은 이름(`SkewEffect`, `Rarity` …)이 부딪치지 않게 하려는 것이다.
  - 표본 안에 namespace 와 같은 이름의 형식이 있으면 끝에 `Sample` 을 붙인다 (`HealthBarTrail` 클래스 → `UIGallery.HealthBarTrailSample`). 형식과 namespace 이름이 같으면 이름 찾기가 헷갈린다.
  - Unity 6 은 C# 9 라 `namespace X;` (파일 범위) 를 못 쓴다. `namespace X { … }` 블록으로 감싼다.
  - UGUI · UI Toolkit 두 폴더는 같은 namespace 다. UI Toolkit 판이 UGUI 폴더의 데이터 클래스를 `using` 없이 그대로 쓴다.
  - `[UxmlElement]` 요소는 UXML 에 namespace 를 포함한 이름으로 쓴다 (`<UIGallery.DialogueChoices.SkewFrame />`).
- UXML 주석 `<!-- -->` 안에 `--` 를 쓰지 않는다. XML 규칙이라 Unity 가 그 UXML 을 임포트하지 못한다. BEM 수식 클래스(`.card--rare`)를 주석에 적을 때 특히 주의한다 ("`.card` 의 수식 클래스 rare" 처럼 쓴다). `python tools/check.py` 가 UXML 을 XML 로 읽어 확인한다.

## 9. 검사 체크리스트

```bash
npx tsc --noEmit                                   # 내 파일 오류 0
python tools/shot.py <id> default juice0 event:<이벤트> preset:<프리셋> spot:1 mobile   # 이 표본만 넣어 빌드
node tools/live.mjs <id> --query="p.<값이름>=<값>" wait:3000 stage:a key:ArrowDown wait:500 stage:b
# ↑ 실제 시간 캡처. shot.py 의 가상 시간에서는 게임 루프가 거의 진행되지 않으므로 연출·타이머 확인은 이쪽으로
python tools/check.py                              # (dist 빌드 후) 전체 규칙
```

- [ ] 기본 화면이 의미 있게 보인다 (썸네일 포함)
- [ ] 이벤트 버튼마다 눈에 띄는 반응
- [ ] 효과 끄기 = 설득력 있는 나쁜 예
- [ ] 모든 param·preset 이 눈에 띄게 다르다
- [ ] 해설 번호가 올바른 부분을 가리킨다
- [ ] 모바일 폭(390px)에서 깨지지 않는다
- [ ] 게임명·원작 고유 표현이 코드·화면에 없다
