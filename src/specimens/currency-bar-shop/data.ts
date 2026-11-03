/* 재화 · 상품 데이터. 화면(진열 · 확인 창 · 재화 바)은 모두 이 표 하나를 읽는다. 가격은 원화 예시이고 실제 결제는 없다 */

export type Cur = 'credit' | 'gem' | 'energy'

export const CUR_NAME: Record<Cur, string> = { credit: '크레딧', gem: '궤도 결정', energy: '에너지' }
export const ENERGY_MAX = 60
/** 기본 충전 상품(결정 60개 = ₩1,200) 기준 결정 1개 값. 확인 창의 '원화 환산' 은 이 값 하나에서 계산한다 */
export const KRW_PER_GEM = 20

export interface Product {
  id: string
  name: string
  /** gem = 결정으로 사는 묶음, krw = 원화로 사는 결정 충전 */
  price: { cur: 'gem'; amount: number } | { krw: number }
  /** 할인 전 가격 (실제로 팔던 값) */
  was?: number
  gives: { cur: Cur; amount: number }[]
  items?: string
  /** 한정 판매 남은 시간(초) — 진열과 확인 창이 같은 값을 센다 */
  endsInSec?: number
  /** 청약철회 가능 여부를 단정하지 않고 약관으로 안내하는 상품 (바로 쓰이는 에너지) */
  refundCheck?: boolean
  /** 다크패턴 진열에서만 보이는 상품 (가격 앵커) */
  anchorOnly?: boolean
  /** 다크패턴 진열의 가짜 '원래 가격' */
  fakeWas?: number
  /** 상점 진열에 놓지 않는 상품 (재화 바의 + 버튼으로만 연다) */
  hidden?: boolean
}

const gems = (n: number, krw: number, extra?: Partial<Product>): Product => ({
  id: `gem${n}`,
  name: `궤도 결정 ${n.toLocaleString('ko-KR')}`,
  price: { krw },
  gives: [{ cur: 'gem', amount: n }],
  ...extra,
})

export const PRODUCTS: Product[] = [
  {
    id: 'kit',
    name: '정비 꾸러미',
    price: { cur: 'gem', amount: 300 },
    was: 375,
    fakeWas: 1000,
    gives: [
      { cur: 'credit', amount: 15000 },
      { cur: 'energy', amount: 30 },
    ],
    items: '수리 키트 ×5',
    endsInSec: 2 * 86400 + 13 * 3600 + 20 * 60,
  },
  { id: 'credits', name: '크레딧 묶음', price: { cur: 'gem', amount: 120 }, gives: [{ cur: 'credit', amount: 12000 }] },
  {
    id: 'crate',
    name: '탐사 보급 상자',
    price: { cur: 'gem', amount: 1200 },
    gives: [
      { cur: 'credit', amount: 80000 },
      { cur: 'energy', amount: 120 },
    ],
    items: '냉각 셀 ×10',
  },
  { id: 'energy', name: '에너지 충전', price: { cur: 'gem', amount: 50 }, gives: [{ cur: 'energy', amount: 60 }], refundCheck: true, hidden: true },
  gems(60, 1200),
  gems(330, 5900, { items: '기본 300 + 보너스 30' }),
  gems(1100, 19000, { fakeWas: 39000, items: '기본 1,000 + 보너스 100' }),
  gems(6000, 99000, { fakeWas: 199000, anchorOnly: true }),
]

export const product = (id: string) => PRODUCTS.find(p => p.id === id) ?? PRODUCTS[0]

export const START = { credit: 4200, gem: 680, energy: 42 }

export const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`
export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 결정 가격의 원화 환산 (기본 충전 기준, 100원 단위 반올림) */
export const gemToKrw = (gems: number) => Math.round((gems * KRW_PER_GEM) / 100) * 100

/** 남은 시간 '2일 13:20:05' */
export function remain(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86400)
  const t = [(s % 86400) / 3600, (s % 3600) / 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':')
  return d > 0 ? `${d}일 ${t}` : t
}

/** 다크패턴의 '자동 충전' 이 몰래 고르는 충전 묶음. 합이 부족분을 넘을 때까지 고른다
 * (남은 부족분을 채우는 가장 작은 묶음, 없으면 가장 큰 묶음을 하나 더) */
export function packsFor(short: number) {
  const packs = PRODUCTS.filter(p => 'krw' in p.price && !p.anchorOnly)
  const out = { names: [] as string[], gems: 0, krw: 0 }
  while (out.gems < short) {
    const p = packs.find(x => x.gives[0].amount >= short - out.gems) ?? packs[packs.length - 1]
    out.names.push(p.name)
    out.gems += p.gives[0].amount
    out.krw += 'krw' in p.price ? p.price.krw : 0
  }
  return out
}
