// 표본 구현 잡 파일(jobs/<id>.md)을 같은 틀로 만든다. JayDispatch 워커(API 크레딧)가 이 파일만 보고 표본 하나를 만든다.
//   node tools/workflow/make-jobs.mjs <명세.mjs> [id ...]
// 명세 형식은 tools/workflow/specs/ 의 파일. id 를 주면 그 잡만 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..')

/** 워커가 쓰는 명령. 검증(verify)도 같은 명령을 쓴다 */
export const ALLOWED = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  '"Bash(node tools/worktree-link.mjs)"', '"Bash(npx tsc --noEmit*)"',
  '"Bash(python tools/shot.py *)"', '"Bash(node tools/live.mjs *)"', '"Bash(node tools/size.mjs *)"',
  '"Bash(powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 *)"',
  '"Bash(git status*)"', '"Bash(git diff*)"', '"Bash(ls *)"',
]

export const verify = id => [
  'node tools/worktree-link.mjs',
  'npx tsc --noEmit',
  `powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen ${id}`,
  'npm run build',
  'python tools/check.py',
]

function job(spec) {
  const list = items => items.map(i => `- ${i}`).join('\n')
  return `---
# ${spec.batch} (plan ${spec.planSection}). tools/workflow/make-jobs.mjs 로 만들었다.
model: claude-opus-5-5
effort: high
budgetUsd: ${spec.budgetUsd ?? 15}
verify:
${verify(spec.id).map(c => `  - ${c}`).join('\n')}
allowedTools: [${ALLOWED.join(', ')}]
writePaths:
  - src/specimens/${spec.id}/**
  - src/unity/${spec.id}/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 90
maxRetries: 2
---

# 표본 구현: ${spec.id}

UI Gallery 에 표본 하나를 새로 만든다. 이 리포는 Vite + React 앱이다. 표본은 웹에서 직접 움직이는 화면과 Unity 구현(UGUI, UI Toolkit) 코드로 이루어진다.

## 처음에

이 작업 폴더는 git worktree 라 \`node_modules\` 가 없다. 맨 먼저 \`node tools/worktree-link.mjs\` 를 한 번 실행해 메인 폴더의 것을 잇는다. 그 전에는 \`npx\` 를 쓰지 않는다.

## 먼저 읽을 것

1. \`docs/specimen-guide.md\` 전체 (표본 계약 v1). 규격과 절차는 이 문서를 따른다.
2. \`docs/agent-contract.md\` (콘텐츠 정책, Unity 코드 규칙).
3. 기준 구현 \`src/specimens/health-bar-trail/\` 와 가까운 표본 ${spec.samples.map(s => `\`src/specimens/${s}/\`, \`src/unity/${s}/\``).join(', ')}.
4. meta 형식 \`src/core/types.ts\`, 공통 유틸(가이드 3절 표).
5. 후보 카드: \`research/next-batch-candidates.json\` 의 \`${spec.id}\` 항목, \`docs/next-specimens-research.md\` ${spec.cardSection}.

## 표본별

- ID \`${spec.id}\`, C# namespace \`UIGallery.${spec.pascal}\`.
- ${spec.meta}
${list(spec.items)}

## 범위

- 위 \`writePaths\` 밖은 고치지 않는다. 특히 \`src/app\`, \`src/core\`, \`tools\`, \`docs\`, \`research\`, 다른 표본.
- 공통 기능이 필요하면 표본 안에 두고, 마지막 보고에 '공통화 요청' 으로 적는다 (\`docs/plan.md\` 공통화 백로그로 간다).
- 웹 조사는 하지 않는다. 근거는 카드의 출처만 쓴다. 확인하지 못한 화면 묘사는 "미확인" 으로 밝힌다 (가이드 6절).
- 비트맵 파일을 만들지 않는다. 그래픽은 SVG, CSS 로 그린다.

## 끝내기 전에

1. \`npx tsc --noEmit\` 오류 0.
2. \`powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen ${spec.id}\` 가 \`exit 0\`.
3. \`python tools/shot.py ${spec.id} default juice0 <이벤트·프리셋> mobile\` 과 \`node tools/live.mjs\` 로 화면을 찍어 Read 로 직접 본다. 연출과 타이머는 실제 시간 캡처(\`live.mjs\`)로 본다.
4. 가이드 9절 체크리스트를 확인한다.

마지막 보고에는 만든 것, 직접 확인하지 못한 것, 공통화 요청을 적는다.
`
}

// make-fix-jobs.mjs 가 ALLOWED · verify 를 가져다 쓰므로 직접 실행할 때만 잡을 쓴다
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [specsPath, ...only] = process.argv.slice(2)
  if (!specsPath) {
    console.error('사용: node tools/workflow/make-jobs.mjs <명세.mjs> [id ...]')
    process.exit(1)
  }
  const { default: SPECS } = await import(pathToFileURL(path.resolve(specsPath)).href)
  for (const spec of SPECS.filter(s => !only.length || only.includes(s.id))) {
    fs.writeFileSync(path.join(REPO, 'jobs', `${spec.id}.md`), job(spec))
    console.log(`jobs/${spec.id}.md`)
  }
}
