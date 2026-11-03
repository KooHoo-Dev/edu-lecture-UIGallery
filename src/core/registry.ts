import { decompress } from 'fzstd'
import { data as unityPacked, index as unityIndex } from 'virtual:unity-pack'
import type { PlannedSpecimen, SpecimenModule } from './types'

/* 표본 자동 등록 — src/specimens/<id>/index.tsx 를 만들기만 하면 갤러리에 나타난다. */
const modules = import.meta.glob<SpecimenModule>('../specimens/*/index.tsx', { eager: true })

export const SPECIMENS: SpecimenModule[] = Object.entries(modules)
  .map(([path, mod]) => {
    const folder = path.split('/').at(-2)
    if (mod.meta.id !== folder) throw new Error(`표본 폴더명(${folder})과 meta.id(${mod.meta.id})가 다릅니다`)
    return mod
  })
  .sort((a, b) => a.meta.group.localeCompare(b.meta.group) || a.meta.order - b.meta.order)

export const findSpecimen = (id: string) => SPECIMENS.find(s => s.meta.id === id)

/* 옛 ID → 새 ID (ID는 영구 불변이 원칙. 이름을 바꿔야 할 때만 여기에 추가) */
export const ALIASES: Record<string, string> = {}

/* Unity 코드 — src/unity/<id>/<ugui|uitk>/<파일>. 빌드가 zstd 한 덩어리로 묶어 넣고(vite.config.ts 의 unity-pack),
   처음 쓸 때 한 번 풀어 둔다 (전체 1.6MB 를 푸는 데 20ms 안팎) */
let unitySources: Map<string, string> | null = null
function unityRaw() {
  if (unitySources) return unitySources
  const all = decompress(Uint8Array.from(atob(unityPacked), c => c.charCodeAt(0)))
  const utf8 = new TextDecoder()
  unitySources = new Map(unityIndex.map(([p, from, to]) => [p, utf8.decode(all.subarray(from, to))]))
  return unitySources
}

export interface UnityFile {
  name: string
  lang: 'csharp' | 'xml' | 'css'
  code: string
}

export function unityFiles(id: string, kind: 'ugui' | 'uitk'): UnityFile[] {
  const prefix = `${id}/${kind}/`
  return [...unityRaw()]
    .filter(([p]) => p.startsWith(prefix))
    .map(([p, code]) => {
      const name = p.slice(prefix.length)
      const ext = name.split('.').pop()
      const lang = ext === 'uxml' ? 'xml' : ext === 'uss' ? 'css' : 'csharp'
      return { name, lang, code } as UnityFile
    })
    .sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name))
}
/* 보여 주는 순서: UXML → USS → 본 스크립트 → 테스트용(Demo) 스크립트 */
const order = (n: string) => (n.endsWith('.uxml') ? 0 : n.endsWith('.uss') ? 1 : /demo/i.test(n) ? 3 : 2)

/* 아직 구현되지 않은 MVP 표본 — 구현되면 자동으로 목록에서 빠진다 */
const PLANNED_ALL: PlannedSpecimen[] = [
  { id: 'health-bar-trail', title: '체력 바: 잔상 + 저체력 화면 효과', group: 'A', order: 1, paradigms: ['non-diegetic', 'meta'], oneLiner: '얼마나 맞았는지 한눈에 보이는 체력 바' },
  { id: 'damage-numbers', title: '데미지 숫자', group: 'A', order: 2, paradigms: ['spatial'], oneLiner: '타격 지점에서 튀어 오르는 숫자의 위계' },
  { id: 'skill-cooldown-prompt', title: '스킬 쿨다운 + 버튼 안내', group: 'A', order: 3, paradigms: ['non-diegetic'], oneLiner: '언제 다시 쓸 수 있는지, 어떤 버튼인지' },
  { id: 'diegetic-vitals', title: '세계 안 체력 표시', group: 'A', order: 4, paradigms: ['diegetic'], oneLiner: 'HUD 없이 캐릭터 몸에 붙은 상태 표시' },
  { id: 'reticle-hitmarker', title: '조준점 + 적중 표시', group: 'B', order: 1, paradigms: ['non-diegetic'], oneLiner: '맞았는지, 치명타인지, 처치했는지' },
  { id: 'offscreen-waypoint', title: '화면 밖 목표 표시 + 나침반', group: 'B', order: 2, paradigms: ['spatial', 'non-diegetic'], oneLiner: '화면 밖 목표를 가장자리에 붙잡아 두기' },
  { id: 'circular-minimap', title: '원형 미니맵', group: 'B', order: 3, paradigms: ['non-diegetic'], oneLiner: '회전형과 북쪽 고정형의 차이' },
  { id: 'quest-tracker-toasts', title: '퀘스트 목록 + 알림 큐', group: 'C', order: 1, paradigms: ['non-diegetic'], oneLiner: '쏟아지는 알림을 줄 세우기' },
  { id: 'main-pause-menu', title: '메인 · 일시정지 메뉴', group: 'D', order: 1, paradigms: ['menu'], oneLiner: '포커스 이동과 뒤로가기의 일관성' },
  { id: 'results-reward', title: '결과 · 보상 화면', group: 'D', order: 2, paradigms: ['menu'], oneLiner: '숫자가 올라가고 보상이 하나씩 등장' },
  { id: 'inventory-grid-tooltip', title: '인벤토리 그리드 + 툴팁 비교', group: 'E', order: 1, paradigms: ['non-diegetic', 'menu'], oneLiner: '장착 중인 것과 바로 비교하기' },
  { id: 'dialogue-choices', title: '대화창 + 선택지', group: 'F', order: 1, paradigms: ['non-diegetic'], oneLiner: '타자기 효과, 스킵, 선택지 포커스' },
  { id: 'settings-accessibility', title: '설정 · 접근성', group: 'G', order: 1, paradigms: ['menu'], oneLiner: '바꾸는 즉시 미리 보이는 설정 화면' },
]

export const PLANNED: PlannedSpecimen[] = PLANNED_ALL.filter(p => !SPECIMENS.some(s => s.meta.id === p.id))
