// meta.ts 글에서 shot.py 상태 목록을 뽑는다 (prepare-review.sh 가 상태를 받지 않았을 때 쓴다).
//   node tools/workflow/shot-states.mjs <meta.ts 경로>   → default juice0 event:… preset:… aspect916 mobile spot:1
import fs from 'node:fs'

const text = fs.readFileSync(process.argv[2], 'utf8')
/** `  key: [` 부터 같은 들여쓰기의 `  ]` 까지에서 id 들 */
function ids(key) {
  const start = text.indexOf(`\n  ${key}: [`)
  if (start < 0) return []
  const end = text.indexOf('\n  ]', start)
  const block = text.slice(start, end < 0 ? undefined : end)
  return [...block.matchAll(/^\s{4,6}(?:\{ )?id: '([^']+)'/gm)].map(m => m[1])
}
const states = ['default', 'juice0', ...ids('events').slice(0, 4).map(id => `event:${id}`), ...ids('presets').slice(0, 2).map(id => `preset:${id}`), 'aspect916', 'mobile', 'spot:1']
console.log(states.join(' '))
