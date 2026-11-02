# 에이전트 작업 규칙 (v0)

UI Gallery 작업에 참여하는 모든 서브에이전트가 따르는 규칙. 근거와 배경은 [plan.md](plan.md) 참고.
0.5단계에서 표본 계약(컴포넌트 인터페이스)이 확정되면 v1로 갱신한다.

## 공통
- 사용자에게 보이는 글(UI 문구, 해설, 과제)은 **한국어**. 코드 식별자와 파일명은 영어.
- 파일명은 **소문자 kebab-case ASCII**만 쓴다. 공백, 한글, 괄호, 대문자는 쓰지 않는다. GitHub Pages는 대소문자를 구분한다.
- 자기에게 배정된 파일과 폴더만 만들거나 수정한다.

## 콘텐츠 정책 (요약, 원문은 plan.md 3절)
- 원작 에셋, 스크린샷, 로고, 캐릭터, 전용 폰트, 고유 문구는 **0**이다.
- 원작에서 빌리는 시각 축은 **최대 2개**. 나머지는 새로 만든다.
- 표본 ID와 제목은 **패턴 이름**으로 짓는다. 게임명은 `inspiredBy`에만 쓴다.
- 프리셋 이름은 장르나 원리로 짓는다. 게임명은 쓰지 않는다.

## 리서치
- **gameuidatabase.com, interfaceingame.com에는 접근하지 않는다.** 두 사이트는 AI 접근이나 스크래핑을 금지한다. 사람이 여는 참고 링크로만 기록한다.
- 출처 우선순위
  - T1: 개발자 강연(GDC, CEDEC, NDC) 초록과 슬라이드, 개발자 인터뷰, 공식 사이트, 공식 접근성 페이지
  - T2: 주요 매체 기사
  - T3: 커뮤니티 글
- **모든 주장에 출처 URL**을 붙인다. 인용은 15단어 이하로 하고, 나머지는 자기 말로 요약한다.
- 화면을 직접 보지 못한 시각 관련 주장(색, 위치, 모양)은 `confidence: "plausible"`로 표시한다. 기억에만 기댄 주장은 `"unverified"`다.
- 분석 대상 **버전**을 명시한다. 예: 리메이크와 원작은 따로 다룬다.
- 403이나 차단 응답을 받은 도메인은 다시 시도하지 않는다. User-Agent를 바꾸는 등 차단을 우회하지 않는다.

## 구현 (0.5단계에서 구체화)
- 실행 중에 외부 URL을 참조하지 않는다. CDN, 웹폰트 링크, 원격 이미지는 쓰지 않는다. 결과물은 file://에서 동작해야 한다.
- 비트맵 이미지 파일을 쓰지 않는다. 그래픽은 SVG, CSS, Canvas, three.js로 만든다.
- 3D는 공유 Canvas(drei `<View>`)만 쓴다. 표본이 자기 `<Canvas>`를 만들지 않는다.
- 화면 밖에 있거나 정지 상태일 때는 애니메이션 루프를 멈춘다. `prefers-reduced-motion`을 존중한다.
- 번쩍이는 효과는 공통 제한기를 거친다(초당 3회 이하).
- 색은 공통 토큰(CSS 변수)을 쓴다. 표본 고유의 색은 표본 CSS Module 안에서만 정의한다.

## Unity 코드
- 기준은 **Unity 6.3 LTS**와 **새 Input System**이다.
- UGUI와 UI Toolkit 둘 다 작성한다. UI Toolkit은 런타임 UI(`UIDocument` + UXML + USS) 기준이다.
- 쓰지 않는 API와 대신 쓸 것
  - `FindObjectOfType` → `FindFirstObjectByType` 또는 `FindAnyObjectByType`
  - `Rigidbody.velocity` → `linearVelocity`
  - `Input.GetKey`, `Input.GetAxis` 등 구 Input Manager → Input System
- 기본 코드는 코루틴이나 `Update`로 작성한다. DOTween 같은 외부 패키지는 '선택' 메모로만 언급한다.
- 모든 C# 는 표본별 `namespace UIGallery.<PascalCase 표본 id>` 블록 안에 둔다. 자세한 규칙은 [specimen-guide.md](specimen-guide.md) 8절.
- 스니펫은 실제 파일(`.cs`, `.uxml`, `.uss`)로 둔다. 강사가 Unity에서 컴파일을 확인한다.
