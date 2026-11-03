/* 제작 패널 데이터 — 레시피(무엇을 얼마나 써서 무엇을 만드나)와 인벤토리(지금 몇 개 있나)를 나눈다.
 * 레시피 상태(만들 수 있나 · 무엇이 모자라나)는 저장하지 않고, 인벤토리가 바뀔 때마다 전부 다시 계산한다. */

export type ResId = 'repair' | 'coolcell' | 'circuit' | 'oxygen'
export type TabId = 'all' | 'maint' | 'survive' | 'gear'
export type RecipeId =
  | 'kit'
  | 'cellpack'
  | 'tape'
  | 'relay'
  | 'o2pack'
  | 'flare'
  | 'mask'
  | 'blanket'
  | 'jammer'
  | 'visor'
  | 'cutter'
  | 'reactor'
/** 인벤토리에 들어가는 것 = 기본 자원 + 완성품(레시피 결과) */
export type ItemId = ResId | RecipeId
export type IconId = ItemId

export interface Need {
  id: ItemId
  n: number
}
export interface Recipe {
  id: RecipeId
  name: string
  tab: Exclude<TabId, 'all'>
  /** 기본 제작 시간(초) */
  time: number
  needs: Need[]
  desc: string
  /** 처음에는 잠겨 있다가 '새 레시피 해금' 으로 열린다 */
  locked?: boolean
}

export const RES_ORDER: ResId[] = ['repair', 'coolcell', 'circuit', 'oxygen']
export const RES_NAME: Record<ResId, string> = { repair: '수리 키트', coolcell: '냉각 셀', circuit: '회로 조각', oxygen: '산소 캔' }

export const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'maint', label: '정비' },
  { id: 'survive', label: '생존' },
  { id: 'gear', label: '장비' },
]

export const RECIPES: Recipe[] = [
  { id: 'kit', name: '보강 수리 키트', tab: 'maint', time: 6, needs: [{ id: 'repair', n: 2 }, { id: 'circuit', n: 1 }], desc: '선체 균열 두 곳을 한 번에 메운다.' },
  { id: 'cellpack', name: '냉각 셀 팩', tab: 'maint', time: 8, needs: [{ id: 'coolcell', n: 3 }, { id: 'circuit', n: 1 }], desc: '셀 셋을 묶어 오래 버티게 한 팩. 반응로 재료.' },
  { id: 'tape', name: '밀봉 테이프', tab: 'maint', time: 3, needs: [{ id: 'repair', n: 1 }], desc: '새는 배관을 임시로 감는다.' },
  { id: 'relay', name: '통신 중계기', tab: 'maint', time: 12, needs: [{ id: 'circuit', n: 4 }, { id: 'repair', n: 1 }, { id: 'coolcell', n: 1 }], desc: '북쪽 통신탑과 기지를 잇는다.' },
  { id: 'o2pack', name: '산소 팩', tab: 'survive', time: 7, needs: [{ id: 'oxygen', n: 3 }, { id: 'coolcell', n: 1 }], desc: '지표 탐사 한 번 분량의 산소.' },
  { id: 'flare', name: '조명탄', tab: 'survive', time: 4, needs: [{ id: 'oxygen', n: 1 }, { id: 'circuit', n: 1 }], desc: '구조 신호. 잔해 드론의 눈을 잠시 가린다.' },
  { id: 'mask', name: '응급 마스크', tab: 'survive', time: 6, needs: [{ id: 'oxygen', n: 2 }, { id: 'repair', n: 1 }], desc: '헬멧이 깨졌을 때 쓰는 예비 마스크.' },
  { id: 'blanket', name: '방열 덮개', tab: 'survive', time: 9, needs: [{ id: 'coolcell', n: 2 }, { id: 'repair', n: 2 }], desc: '한낮 지표의 열을 막는 덮개.', locked: true },
  { id: 'jammer', name: '드론 교란기', tab: 'gear', time: 10, needs: [{ id: 'circuit', n: 5 }, { id: 'coolcell', n: 1 }], desc: '잔해 드론의 추적을 10초 끊는다.' },
  { id: 'visor', name: '탐사 바이저', tab: 'gear', time: 14, needs: [{ id: 'circuit', n: 4 }, { id: 'coolcell', n: 2 }, { id: 'oxygen', n: 1 }], desc: '어두운 동굴의 지형을 윤곽선으로 보여 준다.' },
  { id: 'cutter', name: '절단기 개조', tab: 'gear', time: 10, needs: [{ id: 'circuit', n: 3 }, { id: 'repair', n: 2 }], desc: '두꺼운 잔해 장갑도 자른다.', locked: true },
  { id: 'reactor', name: '소형 반응로', tab: 'gear', time: 18, needs: [{ id: 'cellpack', n: 2 }, { id: 'circuit', n: 6 }], desc: '기지 전력을 하루 더 버틴다. 냉각 셀 팩이 먼저 필요하다.', locked: true },
]

export const RECIPE: Record<RecipeId, Recipe> = Object.fromEntries(RECIPES.map(r => [r.id, r])) as Record<RecipeId, Recipe>
export const itemName = (id: ItemId) => (id in RES_NAME ? RES_NAME[id as ResId] : RECIPE[id as RecipeId].name)
/** 해금 순서 (이벤트 '새 레시피 해금') */
export const UNLOCK_ORDER: RecipeId[] = ['cutter', 'reactor', 'blanket']

export type Inventory = Record<ItemId, number>

/** 기본 보유량 — '보유 재료량' 배율을 곱해 시작한다. 드론 교란기는 회로 조각이 3/5 로 모자란 상태에서 시작 */
const START: Record<ResId, number> = { repair: 4, coolcell: 5, circuit: 3, oxygen: 4 }
export function startInventory(scale: number): Inventory {
  const inv = {} as Inventory
  for (const r of RECIPES) inv[r.id] = 0
  for (const id of RES_ORDER) inv[id] = Math.round(START[id] * scale)
  return inv
}

/** '재료 획득' 이벤트가 차례로 넣는 묶음 */
export const GATHER: Partial<Record<ResId, number>>[] = [
  { circuit: 3, oxygen: 1 },
  { coolcell: 3, repair: 2 },
  { circuit: 4, oxygen: 2 },
  { coolcell: 2, repair: 1, circuit: 2 },
]

export interface Short {
  id: ItemId
  have: number
  need: number
}
export interface Status {
  craftable: boolean
  /** 지금 재료로 몇 개 만들 수 있나 */
  max: number
  short: Short[]
}

/** 레시피 하나의 상태 — 순수 함수 (인벤토리 조회만 한다) */
export function evaluate(r: Recipe, inv: Inventory): Status {
  let max = Infinity
  const short: Short[] = []
  for (const k of r.needs) {
    const have = inv[k.id] ?? 0
    max = Math.min(max, Math.floor(have / k.n))
    if (have < k.n) short.push({ id: k.id, have, need: k.n })
  }
  return { craftable: short.length === 0, max: Number.isFinite(max) ? max : 0, short }
}

/** 인벤토리가 바뀌면 모든 레시피를 다시 계산한다 (몇 개가 바뀌었는지 따지지 않는다 — 12개면 충분히 싸다) */
export const evaluateAll = (inv: Inventory) => Object.fromEntries(RECIPES.map(r => [r.id, evaluate(r, inv)])) as Record<RecipeId, Status>
