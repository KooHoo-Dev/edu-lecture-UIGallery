# UI Gallery 다음 배치 후보 종합 (5개 관점 병합)

관점 약칭: **호평작**(acclaimed), **분류체계**(taxonomy), **모바일**(mobile-live), **교육**(education-jobs), **장르**(genre). 백로그 메모와 겹치는 후보는 "백로그" 표시.

## 0. 병합 결과 요약

| 병합 후보 | 합친 원본 | 추천 관점 수 |
|---|---|---|
| 가상 조이스틱·터치 배치(+세이프 에어리어) | touch-controls-layout, virtual-joystick-touch-layout, virtual-joystick-safe-area, safe-area-aspect-fit | 3 (분류체계·모바일·교육) + 백로그 |
| 팝업 스택·확인 모달 | popup-stack-modal, confirm-modal-stack | 2 (교육·분류체계) |
| 방사형 선택 휠 | radial-quick-select, radial-wheel, (contextual-ping-wheel의 휠 기술) | 2 (호평작·분류체계), 장르가 기술 공유 + 백로그 |
| 튜토리얼 스포트라이트 | tutorial-spotlight ×2 | 2 (분류체계·교육) + 백로그 |
| 자막·캡션 + 소리 방향 표시 | subtitles-captions, sound-visualizer-ring, sound-visualizer | 2 (분류체계·호평작) |
| 로딩 화면 | loading-screen, loading-screen-progress | 2 (분류체계·교육) + 백로그 |
| 박자·판정 피드백 | beat-sync-indicator, rhythm-judgment-highway | 2 (호평작·장르) |

## 1. 1순위 묶음 (다음 배치, 8개)

> **2026-10-24 완료** — 8개 모두 갤러리에 들어갔다(popup-stack-modal 은 popup-queue-stack 으로 이름을 바꿈).

| # | id | 이름 | 그룹 | 패러다임 | 관점 | 비용 |
|---|---|---|---|---|---|---|
| 1 | virtual-joystick-touch-layout | 가상 조이스틱·터치 배치 편집 | G | screen | 분류체계·모바일·교육 + 백로그 | low |
| 2 | popup-stack-modal | 팝업 스택·확인 모달 | D | screen | 교육·분류체계 | low |
| 3 | radial-quick-select | 방사형 선택 휠 | G | non-diegetic | 호평작·분류체계 (+장르) + 백로그 | low |
| 4 | tutorial-spotlight | 튜토리얼 스포트라이트·코치마크 | D | screen | 분류체계·교육 + 백로그 | low |
| 5 | subtitles-sound-cues | 자막·효과음 캡션 + 소리 방향 링 | F (링은 G) | non-diegetic | 분류체계·호평작 | low |
| 6 | upgrade-draft-choice | 레벨업 3택 업그레이드 | E | screen | 장르 | low |
| 7 | card-hand-targeting | 카드 손패 부채꼴 + 타겟 화살표 | E (입력 쪽은 G) | screen | 장르 + 백로그 | low |
| 8 | red-dot-badge-tree | 레드닷 알림 배지 트리 | C | meta | 모바일 | low |

### 1. virtual-joystick-touch-layout — 가상 조이스틱·터치 배치 편집 (G)
- **설명**: 고정·플로팅·다이내믹 조이스틱을 비교하고, 버튼을 끌어 위치·크기·투명도를 바꾸는 배치 편집 모드를 둔다. 기기 프레임(노치, 화면비)을 토글해 세이프 에어리어도 시연한다.
- **추천 이유**: 3개 관점이 모두 강도 5로 추천했고 백로그와도 일치한다. 모바일 반반 팀 프로젝트에서 가장 실용적인 빈칸이다. 지금 갤러리에는 터치 입력 표본이 없다.
- **교육 포인트**: ① 데드존·최대 반경·벡터 정규화, OnScreenStick과 EnhancedTouch의 포인터 ID별 멀티터치 ② Screen.safeArea를 앵커로 변환(UITK는 y축 뒤집기 함정) ③ 배치 결과를 정규화 좌표 JSON으로 저장해 화면비가 바뀌어도 유지
- **대표 게임**: 브롤스타즈, 배틀그라운드 모바일
- **근거**: https://docs.unity3d.com/Packages/com.unity.inputsystem@1.8/manual/OnScreen.html · https://docs.unity.com/en-us/engine/6000.3/script-reference/unityengine/screen/safearea
- 범위가 크면 세이프 에어리어 시뮬레이터를 별도 표본으로 떼어낸다.

### 2. popup-stack-modal — 팝업 스택·확인 모달 (D)
- **설명**: 팝업이 여러 겹 쌓이고 ESC나 안드로이드 뒤로가기로 위에서부터 닫힌다. 딤 배경으로 뒤 화면 입력을 막고, 파괴적 행동에는 확인 모달을 띄운다(기본 포커스는 '취소', 확정은 길게 누르기).
- **추천 이유**: 교육(국내 Q&A 최다 주제, 공고의 "UI 구조 이해")과 분류체계(XAG 115 파괴적 행동)가 추천했다. 다른 메뉴 표본이 깔고 쓰는 기반 구조라 먼저 만들면 튜토리얼·뽑기 확인창이 재사용한다.
- **교육 포인트**: ① UIManager에서 Stack과 LinkedList 중 무엇을 쓸지(중간 팝업을 닫는 경우) ② 입력 차단: UGUI는 딤 Image의 Raycast Target과 CanvasGroup, UITK는 pickingMode와 focus ③ UI/Cancel 액션 하나로 ESC와 Back 처리, 트랜지션 중 중복 클릭 방지
- **대표 게임**: 원신, Destiny 2
- **근거**: https://learn.microsoft.com/en-us/gaming/accessibility/guidelines · https://www.inflearn.com/community/questions/1798042/baseui-uimanager

### 3. radial-quick-select — 방사형 선택 휠 (G)
- **설명**: 버튼을 누르는 동안 8~16칸 휠이 열리고 스틱·마우스·터치 방향으로 칸을 고른다. 열린 동안 시간이 느려진다. 확장 모드로 대량 목록 대안(가속 스크롤, 즐겨찾기 링)을 비교한다.
- **추천 이유**: 호평작과 분류체계가 강도 5·4로 추천했다. 장르 관점의 핑 휠도 같은 기술이고, 백로그의 무기 휠을 검증해 준다. GMTK가 Unity로 재구현한 글이 있어 갤러리 콘셉트와 가장 잘 맞는다.
- **교육 포인트**: ① Atan2로 각도를 섹터 인덱스로 변환, 데드존과 경계 히스테리시스 ② Time.timeScale 감속 중 UI는 unscaledDeltaTime ③ UGUI Image fillAmount와 UITK Painter2D 부채꼴 비교, 누르고 있기·토글 옵션(접근성)
- **대표 게임**: Zelda: Tears of the Kingdom, Red Dead Redemption 2
- **근거**: https://gmtk.substack.com/p/can-i-fix-zeldas-ui-using-unity · https://300mind.studio/blog/radial-menus-in-game-design/

### 4. tutorial-spotlight — 튜토리얼 스포트라이트·코치마크 (D)
- **설명**: 화면을 어둡게 덮고 눌러야 할 대상만 구멍으로 보여 준다. 그 구멍만 클릭이 통과한다. 말풍선, 단계 진행(1/5), 유휴 시 조작 리마인더가 붙는다.
- **추천 이유**: 분류체계(GAG 인지: 상호작용형 튜토리얼, 리마인더)와 교육(팀 발표에서 늘 지적받는 부분)이 추천했고 백로그와도 일치한다. 적은 비용으로 완성도가 크게 오른다.
- **교육 포인트**: ① ICanvasRaycastFilter.IsRaycastLocationValid로 구멍 영역만 클릭 통과 ② 컷아웃 구현 비교: UGUI는 SDF 셰이더나 스텐실, UITK는 Painter2D ③ GetWorldCorners로 대상 추적, 단계를 ScriptableObject 시퀀스와 완료 조건 이벤트로 정의
- **대표 게임**: Clash Royale, Hearthstone
- **근거**: https://github.com/codewriter-packages/TutorialMaskForUGUI · https://gameaccessibilityguidelines.com/full-list/

### 5. subtitles-sound-cues — 자막·효과음 캡션 + 소리 방향 링 (F/G)
- **설명**: 화자 라벨과 크기·배경 불투명도 조절이 있는 자막 상자, [폭발음 ←] 같은 효과음 캡션, 화면 중앙 링에 소리 방향을 호로 표시하는 HUD를 한 표본에서 보여 준다.
- **추천 이유**: 분류체계는 자막(강도 5, GAG 청각 항목이 가장 많이 몰린 영역, XAG 104)과 소리 시각화(4)를, 호평작은 소리 시각화(Fortnite 기본값 전환, Spider-Man 2 캡션)를 추천했다. 비어 있는 F 그룹과 청각 대체 채널을 함께 채운다. 링의 방향 계산은 offscreen-waypoint 로직을 재사용한다.
- **교육 포인트**: ① 자막과 캡션의 차이, 글자 수 기반 표시 시간, 최대 2줄, 한국어 줄바꿈 ② Vector3.SignedAngle로 링에 배치, 사운드 이벤트 버스에서 같은 방향 합치기·수명 관리 ③ UITK USS 변수로 자막 설정 실시간 반영, 색만으로 구분하지 않기(아이콘 모양을 함께 사용)
- **대표 게임**: The Last of Us Part II, Fortnite
- **근거**: https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/104 · https://caniplaythat.com/?p=14083
- 범위가 크면 자막(F)과 소리 링(G)으로 나눈다.

### 6. upgrade-draft-choice — 레벨업 3택 업그레이드 (E)
- **설명**: 레벨업하면 게임이 멈추고 카드 3~4장이 뜬다. 희귀도 색, 슬롯 한도, 리롤·추방 버튼이 있다.
- **추천 이유**: 장르 관점 강도 5. 서바이버류는 부트캠프에서 아주 흔한 장르다. results-reward(판이 끝난 뒤)와 달리 판 도중에 내리는 결정이라 겹치지 않는다.
- **교육 포인트**: ① timeScale=0 상태의 UI 연출(Animator Unscaled Time, unscaledDeltaTime) ② 중복 없는 가중치 뽑기, 슬롯이 차면 강화만 제시하는 필터, ScriptableObject 데이터 ③ 횟수가 정해진 자원(리롤·추방)의 비활성 상태 표현, 패드 탐색
- **대표 게임**: Vampire Survivors, Hades
- **근거**: https://gmdq.substack.com/p/vampire-survivors-banish-mechanic · https://www.tuni.fi/playlab/?p=11048

### 7. card-hand-targeting — 카드 손패 부채꼴 + 타겟 화살표 + 적 의도 (E/G)
- **설명**: 손패를 원호 공식으로 부채꼴 배치한다. 호버하면 카드가 튀어나오고 이웃 카드가 비킨다. 대상 지정 카드를 끌면 베지어 화살표가 따라가고, 적 머리 위에 의도 아이콘이 뜬다.
- **추천 이유**: 장르 강도 5에 백로그 '카드 손패'와도 일치한다. LayoutGroup으로는 만들 수 없어 직접 배치 계산을 해야 하므로 원리 교육 가치가 크다. 드래그 기술은 보류한 수사 보드의 핵심 기술도 대신 다룬다.
- **교육 포인트**: ① 각도 = lerp(-max, max, i/(n-1)), 원호 위 위치와 회전 ② 호버 시 정렬 순서 올리기·이웃 벌림 보간, Drag 핸들러와 대상 레이캐스트 ③ UITK는 absolute 배치에 rotate·translate, PointerManipulator 사용. 적 의도 공개가 전략성을 만든다는 설계 원리
- **대표 게임**: Slay the Spire, Hearthstone
- **근거**: https://github.com/richardschneider/cardsJS/blob/master/README.md · https://www.construct.net/fr/tutorials/hearthstone-unit-move-orders-532

### 8. red-dot-badge-tree — 레드닷 알림 배지 트리 (C, meta)
- **설명**: 로비 → 탭 → 항목으로 이어진 레드닷이 트리로 위로 전파된다. 가장 깊은 항목을 확인하면 부모 점이 차례로 꺼진다. 보조 패널에 트리 상태를 보여 준다.
- **추천 이유**: 모바일 관점 강도 5. 한국 모바일 로비에 빠짐없이 들어가고 팀 프로젝트에서 반드시 꼬이는 기능이다. "옵저버로 설계했다"는 면접 소재가 되고, 비용이 가장 낮다. 백로그의 'meta 독립 표본' 수요도 채운다.
- **교육 포인트**: ① 경로 키('Lobby/Mail/Gift') 트리에서 자식 합산을 부모로 전파 ② 옵저버 패턴으로 데이터 노드와 배지 UI 분리(UGUI는 이벤트 구독, UITK는 USS 클래스 토글) ③ 남발 방지(우선순위, 본 적 있음 처리)와 저장 위치(로컬 또는 서버)
- **대표 게임**: 블루 아카이브, 쿠키런: 킹덤
- **근거**: https://awesome.ecosyste.ms/projects/github.com%2Fblacksentrydevxo%2Funity-ui-badge-notification-system · https://www.besthub.dev/tags/red-dot
- 원리를 다룬 글이 약하다. 실무 상식에 기대는 후보다.

## 2. 2순위 (8개)

> **2026-11-02 완료** — 8개 모두 갤러리에 들어갔다. 범위를 바꾼 곳: 재활용 스크롤은 랭킹만(우편함은 red-dot 과 겹침), 건설 배치는 2D 탑다운, 배틀패스 UITK 판은 결과를 토스트로, 리듬의 '오프셋' 은 조절 값이 아니라 탭 테스트로 재서 적용.

| # | id | 이름 | 그룹 | 한 줄 설명 | 관점 | 핵심 교육 포인트 | 대표 게임 | 비용 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| 9 | gacha-reveal-odds | 뽑기 연출 + 확률표·천장 카운터 | E (meta) | 10연차 2단계 공개, 건너뛰기, 확률 정보 표, 천장까지 남은 횟수 | 모바일(5) + 백로그 | 확률 테이블 하나를 추첨과 표시가 같이 읽기(넥슨 116억 과징금 사례); 결과는 서버, 연출은 클라이언트; 등급 예고와 공개를 분리한 타이밍, 건너뛰기 필수 | 원신, 블루 아카이브 | medium (확률표·천장만 먼저 만들면 low) | https://www.ajunews.com/view/20240102104711033 · https://www.fenwick.com/insights/publications/apple-now-requires-disclosure-of-loot-box-odds |
| 10 | turn-order-timeline | 턴 순서 타임라인 | A | 행동 순서 초상 바, 버프·지연 시 미끄러지는 재정렬, 끼어들기 표시 | 호평작(5) | 행동값 = 기준값/속도 정렬; LayoutGroup 대신 수동 배치 + 보간; 전투 큐와 뷰 분리, 숨긴 수치를 노출할지 토론 | Honkai: Star Rail, Baldur's Gate 3 | low | https://www.icy-veins.com/honkai-star-rail/combat-basics · https://primagames.com/gaming/honkai-star-rail-turn-based-combat-system-guide |
| 11 | input-rebinding | 입력 재설정(키 리바인딩) | G | 키 입력 대기, 충돌 경고와 맞바꾸기, 기본값 복원, 장치별 글리프 | 분류체계(5) | PerformInteractiveRebinding, 결과를 JSON으로 저장·불러오기; 충돌 시 맞바꾸기 UX; GetBindingDisplayString과 마지막 사용 장치 감지 | The Last of Us Part II, Celeste | low | https://docs.unity.cn/Packages/com.unity.inputsystem@1.8/api/UnityEngine.InputSystem.InputActionRebindingExtensions.html · https://learn.microsoft.com/en-us/gaming/accessibility/guidelines |
| 12 | recycled-scroll-list | 재활용 스크롤 리스트(랭킹·우편함) | E | 1,000개 데이터를 셀 십여 개로 돌려쓰기, 생성 셀 수 카운터, 재활용 끄기 비교 | 교육(5) | 보이는 인덱스 범위 계산과 셀 재배치; LayoutGroup 미사용·서브 캔버스 분리·Profiler 확인; UITK ListView 가상화 비교 | 모바일 RPG 우편함, 클래시 로얄 클랜 목록 | low | https://learn.unity.com/tutorial/optimizing-unity-ui · https://docs.unity3d.com/Manual/UIE-runtime-binding-list-view.html |
| 13 | battle-pass-track | 배틀패스 보상 트랙 | E (meta) | 무료·프리미엄 2단 가로 트랙, 칸 상태, 현재 레벨 스냅, 모두 받기 | 모바일(5) | Locked → Claimable → Claimed 상태 머신; 가로 가상화(12번과 공유); 서버 UTC 기준 카운트다운 | Fortnite, 브롤스타즈 | low | https://www.gamedeveloper.com/game-platforms/let-s-talk-battle-passes-part-1 · https://docs.unity.com/ugs/en-us/solutions/manual/BattlePasses |
| 14 | loading-screen | 로딩 화면·진행률 | D | 실제 진행률(계단식, 0.9에서 멈춤)과 표시 진행률을 겹쳐 비교, 팁 순환 | 분류체계·교육 + 백로그 | LoadSceneAsync와 allowSceneActivation 때문에 0.9에서 멈춤; MoveTowards 보간과 최소 노출 시간; 대기 길이별로 스피너 또는 진행 바 | 원신, Bayonetta | low | https://uxmovement.com/buttons/how-to-make-progress-bars-feel-faster-to-users/ · https://discussions.unity.com/t/percentagecomplete-differs-to-underlying-asyncoperation/764706 |
| 15 | build-placement-preview | 건설 배치 미리보기 | G (spatial) | 그리드 스냅 고스트, 유효(초록)·무효(빨강) 틴트, 사거리 원, 무효 사유 문구 | 장르(5) | ScreenPointToRay와 그리드 스냅; 유효성 검사가 사유 enum을 돌려줌; 모바일은 드래그 후 확인 버튼으로 2단계 배치 | Bloons TD 6, Kingdom Rush | medium (2D 탑다운이면 low) | https://fairytalesgames.itch.io/justd/devlog/817232/range-indicator-added-to-placement-indicator · https://syntaxsurfers.itch.io/wave-breakers-firstperson-strategy-hybrid-tower-defense/devlog/1035728/lines-and-boxes-everything-has-its-place |
| 16 | rhythm-timing-feedback | 박자 표시·판정 피드백 | C | 판정선으로 흐르는 노트, PERFECT/GOOD/MISS, EARLY/LATE, 오프셋 보정, 관대한 판정 모드 | 호평작·장르 | AudioSettings.dspTime 하나만 기준 시계로; 판정 창(ms)과 입력 지연 보정 UI; 실패 없는 판정 옵션(접근성) | Hi-Fi Rush, DJMAX RESPECT V | low (소리는 WebAudio 합성) | https://kotaku.com/hi-fi-rush-game-pass-rhythm-game-visual-options-1850053933 · https://dev.to/skywalker_2de7de5f97df567/building-fair-rhythm-game-judgement-windows-in-javascript-1og9 |

## 3. 3순위 후보 풀 (다음다음 배치)

| id | 이름 | 그룹 | 관점 | 비용 | 메모 · 근거 |
|---|---|---|---|---|---|
| branching-route-map | 분기 경로 맵 | D (meta) | 장르(4) | low | 로그라이크 런 구조, DAG 절차 생성 + 선 그리기 · https://www.muddasheep.com/blog/416 |
| score-cascade-tally | 단계별 점수 계산 연출 | C | 호평작(4) | low | Balatro식 순차 효과 큐와 롤링 숫자. results-reward 확장으로도 가능 · https://gmtk.substack.com/p/balatros-cursed-design-problem |
| skill-tree | 스킬트리·성장 노드 | E | 분류체계(4) + 백로그 | medium | 팬·줌, 연결선, 색에만 의존하지 않는 상태 표시 · https://www.icy-veins.com/forums/topic/52508-official-response-to-feedback-regarding-the-diablo-4-skill-tree/ |
| killfeed-scoreboard | 킬 피드 + 탭 스코어보드 | C | 장르(4) + 백로그 | low | 큐 로직이 quest-tracker-toasts와 비슷하므로 차별점(훑어 읽기, 홀드 표)을 강조 · https://gosugamers.net/overwatch/features/38572-suggested-fixes-to-the-overwatch-ui |
| crafting-recipe-panel | 제작 패널 | E | 장르(4) | low | 보유/필요 수량 표시, 제작 큐, 선택 복원. inventory 슬롯 재사용 · https://7daystodie.wiki.gg/wiki/Crafting_Window |
| context-lore-glossary | 맥락 용어집·중첩 툴팁 | F | 호평작(4) | low | FF16 Active Time Lore, TMP link 태그 · https://gdcvault.com/play/1034185/Designing-Active-Time-Lore-for |
| focus-narration | 포커스 표시·화면 낭독 | G | 분류체계(4) | low | Unity 6.3 데스크톱 화면 낭독 지원 · https://discussions.unity.com/t/native-desktop-screen-reader-support-now-available-in-unity-6-3/1681788 |
| worldspace-nameplate | 월드스페이스 이름표 | A (spatial) | 교육(4) + 백로그 | medium | 3D 필요. diegetic-vitals 장면을 재사용하면 비용이 준다. 6.2 UITK World Space · https://unity.com/resources/how-to-create-world-space-ui-toolkit |
| currency-bar-shop | 재화 바·상점·구매 확인 | E (meta) | 모바일(4) + 백로그 | low | 9·13번의 공용 부품. 정직한 UI와 다크패턴 비교 · https://www.gamemeca.com/view.php?gid=100991 |
| time-gated-meta | 출석 캘린더 + 에너지 회복 타이머 | E/A (meta) | 모바일(4·3) | low | 둘 다 서버 시간과 오프라인 경과 계산이 핵심이라 한 표본으로 묶는다 · https://docs.unity.com/en-us/services/solutions/daily-rewards |
| directional-combo-input | 방향 커맨드 입력 HUD | G | 호평작(3) | low | Helldivers 2. 접두사 매칭과 입력 버퍼 · https://www.shacknews.com/article/138705/all-stratagems-codes-helldivers-2 |
| match3-goal-hud | 퍼즐 목표 HUD | A | 장르(3) | low | 보드에서 UI로 날아가는 연출, 별 임계 마커 · https://www.raywenderlich.com/673-how-to-make-a-match-3-game-in-unity/page/4 |

## 4. 기존 표본 확장 아이디어

| 기존 표본 | 확장 내용 | 출처 관점 | 비용 |
|---|---|---|---|
| inventory-grid-tooltip | 드래그앤드롭 퀵슬롯·장착(고스트 아이콘, blocksRaycasts, 교환·버리기 확인) | 교육 | low |
| inventory-grid-tooltip | 장비 비교(+12/-5) + UITK 런타임 데이터 바인딩과 "직접 갱신" 비교 탭 | 교육(data-bound-stat-panel) | low |
| inventory-grid-tooltip | 키워드 중첩 툴팁(툴팁 안의 키워드에 다시 툴팁, 고정) | 호평작(context-lore-glossary 일부) | low |
| main-pause-menu | 스타일 메뉴 전환(사선 컷, 스태거, 모션 줄이기 옵션, 전환 스킵) | 호평작 | medium |
| settings-accessibility | 다국어 전환·가변 텍스트(Smart Strings, 텍스트 확장률 슬라이더) | 교육 | low |
| settings-accessibility | 조작 탭에서 input-rebinding으로 연결, 포커스 표시 경량판 | 분류체계 | low |
| health-bar-trail | 대전 격투 미러 HUD(대칭 바, 칸 게이지, 콤보 보정 표시) + 보스 체력(다단 바, 백로그) | 장르 + 백로그 | low |
| offscreen-waypoint | 상황 인식 핑(조준 대상 판별, 화면 가장자리 클램프, 수명 상태). 휠은 radial-quick-select 재사용 | 장르 | medium |
| skill-cooldown-prompt | 월드 상호작용 프롬프트("E 줍기", 길게 누르기 링) | 백로그 | low (3D 앵커가 필요하면 medium) |

## 5. 보류

| 후보 | 보류 이유 |
|---|---|
| customization-workbench (커스터마이즈 작업대) | 3D 미리보기와 카메라 전환이 필요해 비용이 high다. 남은 용량 예산과 맞지 않는다. GDC 근거는 좋으므로 용량 구조를 바꾼 뒤 재검토한다. |
| investigation-board (수사 보드) | 비용 medium이고 추리 장르는 팀 프로젝트에서 드물다. 핵심 기술(드래그, 선 연결)은 카드 손패와 드래그앤드롭 확장이 다룬다. |
| auto-battle-speed-toggle (자동 전투·배속) | 원리 근거가 국내 논문 1편 정도로 약하고 UI 깊이가 얕다. turn-order-timeline에 배속 토글로 흡수할 수 있다. |
| 레이싱 HUD, RTS 박스 선택·커맨드 카드 | 근거가 커뮤니티·모드 자료 위주이고 수강생 장르 빈도가 낮다(장르 관점이 직접 낮춤). |
| 시뮬레이션·경영 UI | 글로 된 원리 자료를 찾지 못했다(장르 관점). |
| 백로그 "meta 독립 표본" | 별도 항목이 아니다. red-dot, gacha, battle-pass, route-map으로 해소된다. |

**근거 품질 메모**: 호평작 관점은 검색 한도를 2회 넘겼고, BG3·Hades II는 커뮤니티 근거만 있다. red-dot과 card-hand는 원리를 다룬 글이 약하다. 미러로 보이는 사이트(territoriali.olinfo.it, cleverlibre, tilnote)는 근거 URL에서 뺐다.

## 6. 갤러리 구조 측면 제안

- **그룹 균형**: 1·2순위를 반영하면 G가 1개에서 5~6개로 급증하고 B는 포화 상태(이번에 신규 없음)다. G를 "G 입력(터치·휠·배치)"과 "H 접근성(자막·리바인딩·포커스)"으로 나누거나, 접근성을 그룹이 아닌 **태그 필터**로 두기를 권한다.
  - **→ 2026-11-02 결정**: 그룹은 그대로 두고 **주제 태그 '접근성'**(`meta.tags: ['accessibility']`)과 홈 '주제' 필터를 추가했다. 자막 표본이 F 로 가서 G 는 3개, 2순위 뒤에도 5개라 나눌 만큼 크지 않다. 2순위에서는 input-rebinding · rhythm-timing-feedback(실패 없는 판정)이 태그를 단다.
- **새 필터**: 플랫폼(PC/모바일/패드)과 장르 태그(서바이버·덱빌딩·TD·모바일 수집형 RPG)를 추가하면 수강생이 "우리 팀 장르"로 바로 찾을 수 있다. meta 패러다임 표본이 4~6개로 늘어나므로 "라이브서비스" 묶음 표시도 필요하다.
- **용량 예산**: 남은 용량은 약 0.2MB다. 1순위 8개는 모두 2D이고 three.js 추가가 없지만, 기존 2D 표본의 평균 크기를 실측해 8개가 들어가는지 먼저 확인해야 한다. 공용 부품(오버레이 스택, 방사형 Painter, 드래그 매니퓰레이터, 가상화 리스트)을 먼저 만들어 표본 간 증분을 줄이고, build-placement는 2D 탑다운으로 제한한다.
- **제작 순서**: popup-stack(오버레이·입력 차단 기반) → tutorial-spotlight와 red-dot → 나머지 순서가 효율적이다. 2순위의 recycled-scroll과 battle-pass는 가상화 리스트를 공유하므로 같이 만든다.
- 예산이 계속 막히면 "HTML 1개" 전제를 유지한 채 3D 표본만 지연 로드(동적 import)하는 방식이나 예산 상향을 별도로 결정해야 한다.
  - **→ 2026-10-23 결정**: 예산을 원본 5MB · gzip 1.5MB로 올렸다(근거는 [plan.md](plan.md) 4절 '용량 예산'). 평균 크기 표본 기준 약 20개 여유가 생겨 1·2순위까지 들어간다.