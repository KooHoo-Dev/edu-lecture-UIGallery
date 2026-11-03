import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, zstdCompressSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// UIG_ONLY=<표본id> 로 빌드하면 그 표본만 등록한다 (tools/shot.py 가 사용).
// 여러 표본을 동시에 만들 때 다른 표본의 미완성 파일이 내 빌드를 깨뜨리지 않게 하려는 것.
const only = process.env.UIG_ONLY
const onlySpecimen: Plugin = {
  name: 'uig-only-specimen',
  enforce: 'pre',
  transform(code, id) {
    if (!only || !/[\\/]src[\\/]core[\\/]registry\.ts$/.test(id.split('?')[0])) return
    return code.replace(`'../specimens/*/index.tsx'`, `'../specimens/${only}/index.tsx'`)
  },
}

// Unity 코드 원문(src/unity/<id>/<ugui|uitk>/<파일>)을 zstd 한 덩어리로 묶는다 (화면에서는 core/registry.ts 가 처음 쓸 때 한 번 푼다).
// 원문 그대로 넣으면 HTML 의 1/3(1.6MB)을 차지한다. 표본마다 비슷한 코드가 많아 큰 창(8MB)으로 압축하면 약 0.3MB 가 되고,
// gzip 의 32KB 창으로는 못 줄이는 표본 사이 중복까지 줄어 gzip 전송량도 0.1MB 줄어든다. 새 파일을 추가하면 개발 서버를 다시 켠다.
const UNITY_PACK = 'virtual:unity-pack'
const unityPack: Plugin = {
  name: 'uig-unity-pack',
  resolveId: id => (id === UNITY_PACK ? `\0${UNITY_PACK}` : undefined),
  load(id) {
    if (id !== `\0${UNITY_PACK}`) return
    const dir = fileURLToPath(new URL('./src/unity/', import.meta.url))
    const index: [string, number, number][] = []
    const parts: Buffer[] = []
    let at = 0
    for (const sid of readdirSync(dir).sort()) {
      if (only && sid !== only) continue
      for (const kind of readdirSync(join(dir, sid)).sort()) {
        for (const name of readdirSync(join(dir, sid, kind)).sort()) {
          const file = join(dir, sid, kind, name)
          this.addWatchFile(file)
          const buf = readFileSync(file)
          index.push([`${sid}/${kind}/${name}`, at, at + buf.length])
          parts.push(buf)
          at += buf.length
        }
      }
    }
    const packed = zstdCompressSync(Buffer.concat(parts), {
      params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_windowLog]: 23 },
    })
    return `export const index = ${JSON.stringify(index)}\nexport const data = ${JSON.stringify(packed.toString('base64'))}\n`
  },
}

// 결과물은 dist/index.html 한 개 — 더블클릭(file://)과 GitHub Pages에서 똑같이 동작한다.
export default defineConfig({
  base: './',
  plugins: [onlySpecimen, unityPack, react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, strictPort: true },
})
