/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

/** Unity 코드 원문 묶음 (vite.config.ts 의 unity-pack 플러그인) */
declare module 'virtual:unity-pack' {
  /** [경로 '<id>/<ugui|uitk>/<파일>', 시작 바이트, 끝 바이트] — 풀어 낸 UTF-8 바이트 안의 위치 */
  export const index: [string, number, number][]
  /** 모든 파일을 이어 붙여 zstd 로 압축한 것 (base64) */
  export const data: string
}
