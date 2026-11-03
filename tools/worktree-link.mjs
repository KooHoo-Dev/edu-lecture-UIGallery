// git worktree(JayDispatch 잡 폴더)에서 도구를 돌릴 때 쓴다. worktree 에는 무시 파일(node_modules)이 없으므로
// 메인 작업 폴더의 것을 정션으로 잇는다. 메인 작업 폴더에서는 아무 일도 하지 않는다.
//
//   node tools/worktree-link.mjs      # npx tsc · vite 를 쓰기 전에 한 번 (live.mjs · shot.py 는 알아서 부른다)

import { spawnSync } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** git 메인 작업 폴더. git 이 없거나 리포 밖이면 root 를 그대로 돌려준다 */
export function mainRoot(root = ROOT) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) return root
  return dirname(resolve(r.stdout.trim()))
}

/** worktree 의 node_modules 가 없으면 메인 작업 폴더의 것을 정션으로 연결한다. 연결했으면 true */
export function ensureNodeModules(root = ROOT) {
  const target = join(root, 'node_modules')
  if (existsSync(target)) return false
  const main = mainRoot(root)
  const source = join(main, 'node_modules')
  if (same(main, root) || !existsSync(source)) return false
  symlinkSync(source, target, 'junction')
  return true
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const linked = ensureNodeModules()
  const target = join(ROOT, 'node_modules')
  if (!existsSync(target)) {
    console.log('node_modules 없음 — 메인 작업 폴더에서 npm install 을 먼저 한다')
    process.exit(1)
  }
  console.log(linked ? `node_modules 연결: ${mainRoot()}` : 'node_modules 있음')
}
