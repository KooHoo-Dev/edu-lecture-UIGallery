# UI Gallery — 게임 UI 패턴 해부

유니티 개발자 양성과정 수업용 게임 UI 갤러리. 잘 만든 게임 UI를 분석해 **원리를 해부하고, 새 코드로 다시 만들어** 직접 조작해 보고, **Unity(UGUI · UI Toolkit) 구현법**까지 연결합니다.

- 원작 게임의 이미지·폰트·사운드·로고는 하나도 포함하지 않습니다. 모든 그래픽은 SVG·CSS·three.js로 새로 그렸습니다.
- 결과물은 **HTML 파일 하나**입니다. 더블클릭(인터넷 없이)과 GitHub Pages 양쪽에서 똑같이 동작합니다.

## 쓰는 법

| 하고 싶은 일 | 방법 |
|---|---|
| 웹에서 보기 | **https://koohoo-dev.github.io/edu-lecture-UIGallery/** |
| 인터넷 없는 강의실에서 보기 | 사이트 상단 **오프라인용 HTML 받기** 또는 Releases 의 `UIGallery-vX.html` 을 받아 더블클릭 |
| 수업 중 시연 | 표본 화면에서 `P` 발표 모드, `Space` 재생, `1~9` 이벤트, `J` 효과 끄기(나쁜 예), `S` 슬로모션, `←/→` 해설 |
| 특정 장면을 링크로 | 주소 뒤에 옵션을 붙입니다 (아래 표) |

### 링크 옵션

`#/s/<표본>?` 뒤에 `&` 로 이어 붙입니다. 예: `#/s/health-bar-trail?juice=0&event=combo&present=1`

| 옵션 | 뜻 |
|---|---|
| `preset=<id>` | 프리셋 적용 |
| `p.<값이름>=<값>` | 조절 값 하나를 지정 (예: `p.fovDeg=120`, `p.showDistance=0`) |
| `juice=0` | 효과 끄기(나쁜 예)로 열기 |
| `event=<id>` | 열리자마자 이벤트 한 번 |
| `speed=0.25` | 슬로모션 (0.25 · 0.5 · 1) |
| `spot=<번호>` / `spots=0` | 해설 번호 펼치기 / 숨기기 |
| `auto=0` | 자동 데모 끄기 |
| `aspect=9:16` | 세로 화면 (지원 표본만) |
| `webgl=0` | 3D 표본을 2D 대체 화면으로 (저사양 PC) |
| `present=1` | 발표 모드로 열기 |

## 강사가 직접 고칠 수 있는 것 (Node 설치 불필요)

해설·학습 목표·흔한 실수·프리셋 이름 등 **모든 글**은 표본 폴더의 `meta.ts` 한 파일에 있습니다.

1. GitHub 웹에서 `src/specimens/<표본>/meta.ts` 를 열고 연필(Edit) 버튼을 누릅니다.
2. 따옴표 `'...'` 안의 글만 고칩니다. `**굵게**`, `` `코드` `` 서식을 쓸 수 있습니다.
3. Commit 하면 GitHub Actions 가 자동으로 빌드·검사 후 Pages 에 반영합니다 (약 2분). 문법이 틀리면 빌드가 실패하고 기존 사이트는 그대로 유지됩니다.

Unity 코드는 `src/unity/<표본>/ugui|uitk/` 의 실제 `.cs` · `.uxml` · `.uss` 파일입니다. 이 폴더를 Unity 6.3 프로젝트에 넣어 컴파일을 확인할 수 있습니다.

## 개발

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/index.html 한 개 생성
python tools/check.py           # 오프라인 실행·용량·파일명 검사
python tools/check.py --links   # + 출처 링크 생존 확인
python tools/shot.py <id> default juice0 event:<id>   # 빠른 스크린샷 (가상 시간)
node tools/live.mjs <id> wait:3000 stage:a            # 실제 시간으로 흘려 보며 캡처 (연출 확인용)
powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 [-Specimen <id>]   # Unity C# 컴파일 확인 (Unity 6.3 과 한 번 연 Unity 프로젝트 필요)
```

### 표본 추가하기

`src/specimens/<kebab-id>/` 폴더를 만들면 갤러리에 자동으로 나타납니다.

```
src/specimens/<id>/
  index.tsx          export { meta } from './meta' + HUD 컴포넌트(default) [+ 3D Scene]
  meta.ts            SpecimenMeta — 제목·해설·조절 값·프리셋·핫스팟·Unity 가이드
  style.module.css
src/unity/<id>/ugui/*.cs
src/unity/<id>/uitk/*.uxml|*.uss|*.cs
```

표본 규격은 [`src/core/types.ts`](src/core/types.ts), 작업 규칙은 [`docs/agent-contract.md`](docs/agent-contract.md), 전체 계획과 콘텐츠 정책은 [`docs/plan.md`](docs/plan.md) 에 있습니다.

## 라이선스

코드와 새로 그린 그래픽은 MIT. 언급된 게임명·상표·원작은 각 권리자의 소유이며 이 라이선스의 대상이 아닙니다. 이 프로젝트는 해당 권리자와 제휴하거나 보증받지 않았습니다.
