// 리뷰 반영 수정 잡(jobs/<id>-fix.md)을 같은 틀로 만든다. 구현 브랜치를 main 에 합친 뒤 만든다.
//   node tools/workflow/make-fix-jobs.mjs <수정 명세.mjs>
// 명세: [{ id, batch, keep, changed?, required: [], recommended?: [], shots?, budgetUsd? }]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ALLOWED, verify } from './make-jobs.mjs'

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..')
const { default: SPECS } = await import(pathToFileURL(path.resolve(process.argv[2])).href)

function job(spec) {
  const list = (items, from = 1) => items.map((t, i) => `${from + i}. ${t}`).join('\n')
  return `---
# ${spec.batch} 수정 잡. 독립 리뷰 지적을 반영한다. 구현 결과는 main 에 합쳐 두었다.
model: claude-opus-5-5
effort: high
budgetUsd: ${spec.budgetUsd ?? 8}
verify:
${verify(spec.id).map(c => `  - ${c}`).join('\n')}
allowedTools: [${ALLOWED.join(', ')}]
writePaths:
  - src/specimens/${spec.id}/**
  - src/unity/${spec.id}/**
allowProfiles: [org]
verifyTimeoutMinutes: 15
timeoutMinutes: 60
maxRetries: 2
---

# 표본 수정: ${spec.id} 리뷰 반영

\`${spec.id}\` 표본은 이미 있고 검사를 통과했다. 독립 리뷰에서 나온 아래 항목만 고친다. 규격은 \`docs/specimen-guide.md\` 를 따른다. ${spec.keep}

맨 먼저 \`node tools/worktree-link.mjs\` 를 한 번 실행한다 (worktree 에 \`node_modules\` 를 잇는다).
${spec.changed ? `\n리뷰 뒤 앱과 가이드에서 이미 바뀐 것 (다시 고치지 않는다):\n${spec.changed.map(c => `- ${c}`).join('\n')}\n` : ''}
## 필수

${list(spec.required)}
${spec.recommended?.length ? `\n## 권장\n\n${list(spec.recommended, spec.required.length + 1)}\n` : ''}
## 끝내기 전에

1. \`npx tsc --noEmit\` 오류 0, \`powershell -ExecutionPolicy Bypass -File tools/unity-compile.ps1 -Specimen ${spec.id}\` 가 \`exit 0\`.
2. \`python tools/shot.py\` 와 \`node tools/live.mjs\` 로 ${spec.shots ?? '기본, 효과 끄기, 바꾼 부분'} 화면을 찍어 Read 로 본다.
3. 바꾼 글이 해설과 Unity 탭에 들어갈 때 어색하지 않은지 \`meta.ts\` 를 다시 읽는다.

마지막 보고에는 고친 것과 직접 확인하지 못한 것을 적는다.
`
}

for (const spec of SPECS) {
  fs.writeFileSync(path.join(REPO, 'jobs', `${spec.id}-fix.md`), job(spec))
  console.log(`jobs/${spec.id}-fix.md`)
}
