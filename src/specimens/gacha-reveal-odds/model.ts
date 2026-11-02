/* 뽑기 테이블 · 추첨 · 확률표 문장 — 모두 같은 표(GachaTable) 하나를 읽는다.
 * 표시(확률표)와 실제(추첨)가 서로 다른 데이터를 읽으면 표시가 거짓이 된다. 그래서 둘 다 이 파일의 함수만 쓴다. */

export type Grade = 'hero' | 'rare' | 'common'
export const GRADES: Grade[] = ['hero', 'rare', 'common']
export const GRADE_LABEL: Record<Grade, string> = { hero: '영웅', rare: '희귀', common: '일반' }

export interface Item {
  id: string
  name: string
  grade: Grade
  /** 등급 안에서의 몫 (상대값) */
  share: number
}

/** 이 갤러리 고유의 보급품 12종 (외곽 탐사대 세계관) */
export const ITEMS: Item[] = [
  { id: 'anchor', name: '중력 닻 발사기', grade: 'hero', share: 2 },
  { id: 'aurora', name: '오로라 방벽 모듈', grade: 'hero', share: 1 },
  { id: 'antenna', name: '심우주 안테나', grade: 'hero', share: 1 },
  { id: 'kit-plus', name: '강화 수리 키트', grade: 'rare', share: 1 },
  { id: 'jammer', name: '드론 교란기', grade: 'rare', share: 1 },
  { id: 'core', name: '냉각 코어', grade: 'rare', share: 1 },
  { id: 'board', name: '정밀 회로판', grade: 'rare', share: 1 },
  { id: 'kit', name: '수리 키트', grade: 'common', share: 1 },
  { id: 'cell', name: '냉각 셀', grade: 'common', share: 1 },
  { id: 'chip', name: '회로 조각', grade: 'common', share: 1 },
  { id: 'o2', name: '산소 캔', grade: 'common', share: 1 },
  { id: 'credit', name: '크레딧 꾸러미', grade: 'common', share: 1 },
]
/** 교환형 천장에서 고르는 항목 */
export const EXCHANGE_ITEM = 0

export type PityMode = 'guarantee' | 'exchange'

export interface GachaTable {
  /** 항목마다 정수 가중치 (합 = TOTAL). 추첨과 확률표가 함께 읽는 유일한 값 */
  weights: number[]
  total: number
  pityMode: PityMode
  pityCount: number
}

export const TOTAL = 100000
const RARE_PCT = 13

/** 등급 확률(%) × 등급 안의 몫 → 항목 가중치. 가중치 합은 늘 TOTAL */
export function buildTable(heroRatePct: number, pityMode: PityMode, pityCount: number): GachaTable {
  const rate: Record<Grade, number> = { hero: heroRatePct, rare: RARE_PCT, common: 100 - heroRatePct - RARE_PCT }
  const weights = ITEMS.map(it => {
    const sum = ITEMS.filter(x => x.grade === it.grade).reduce((a, x) => a + x.share, 0)
    return Math.round((rate[it.grade] / 100) * (it.share / sum) * TOTAL)
  })
  // 반올림 오차는 마지막 일반 항목이 흡수 — 합이 TOTAL 이 아니면 확률표 합계가 100% 가 아니게 된다
  weights[weights.length - 1] += TOTAL - weights.reduce((a, w) => a + w, 0)
  return { weights, total: TOTAL, pityMode, pityCount }
}

/** 나쁜 예: '운영 중 몰래 바꾼' 추첨 표. 확률표는 원래 표를 그대로 보여 준다 */
export function skewTable(t: GachaTable): GachaTable {
  const weights = t.weights.map((w, i) => (ITEMS[i].grade === 'hero' ? (ITEMS[i].id === 'aurora' ? 0 : Math.round(w * 0.3)) : w))
  weights[weights.length - 1] += TOTAL - weights.reduce((a, w) => a + w, 0)
  return { ...t, weights }
}

export const itemPct = (t: GachaTable, i: number) => (t.weights[i] / t.total) * 100
export const gradePct = (t: GachaTable, g: Grade) => ITEMS.reduce((a, it, i) => a + (it.grade === g ? itemPct(t, i) : 0), 0)

/** 천장을 포함한 실제 기대 비율(종합 확률). 보장형: 영웅 하나에 드는 평균 횟수 E = Σ(1−p)^k (k < N) */
export function consolidatedPct(t: GachaTable, g: Grade): number {
  const p = gradePct(t, 'hero') / 100
  if (t.pityMode !== 'guarantee' || p <= 0) return gradePct(t, g)
  const n = t.pityCount
  const e = (1 - Math.pow(1 - p, n)) / p
  const hero = 1 / e
  if (g === 'hero') return hero * 100
  return gradePct(t, g) * ((1 - hero) / (1 - p))
}

/** 천장 규칙 문장 — 숫자를 손으로 적지 않고 표에서 만든다 */
export function pityRuleText(t: GachaTable): string {
  return t.pityMode === 'guarantee'
    ? `영웅 없이 ${t.pityCount - 1}회 뽑으면 다음 1회는 영웅 확정 (${t.pityCount}회 안에 1개)`
    : `1회마다 교환 포인트 1점, ${t.pityCount}점이면 ${ITEMS[EXCHANGE_ITEM].name} 교환`
}

/** 시드 고정 난수 (mulberry32) — 서버 흉내 · 시뮬레이션용 */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** 가중치 추첨. only 를 주면 그 등급 안에서만 (천장 확정용 — 같은 표의 가중치 비율 그대로) */
export function drawIndex(t: GachaTable, rand: () => number, only?: Grade): number {
  const pool = ITEMS.map((it, i) => (only && it.grade !== only ? 0 : t.weights[i]))
  const sum = pool.reduce((a, w) => a + w, 0)
  let r = rand() * sum
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i]
    if (r < 0) return i
  }
  return pool.length - 1
}

export interface PityState {
  /** 마지막 영웅 이후 횟수 */
  sinceHero: number
  /** 교환 포인트 */
  points: number
}

/** 서버 흉내: 결과 n개와 천장 상태를 한 번에 정한다. 클라이언트는 이 결과를 받아 보여 주기만 한다 */
export function serverPull(t: GachaTable, st: PityState, count: number, rand: () => number): { items: number[]; forced: number[] } {
  const items: number[] = []
  const forced: number[] = []
  for (let k = 0; k < count; k++) {
    let idx: number
    if (t.pityMode === 'guarantee' && st.sinceHero >= t.pityCount - 1) {
      idx = drawIndex(t, rand, 'hero')
      forced.push(k)
    } else idx = drawIndex(t, rand)
    st.sinceHero = ITEMS[idx].grade === 'hero' ? 0 : st.sinceHero + 1
    st.points++
    items.push(idx)
  }
  return { items, forced }
}

export const pct = (v: number, d = 3) => `${v.toFixed(d)}%`

/** 관측 c 회가 기대 n·p 에서 그쪽으로 이만큼 이상 벗어날 확률 (한쪽 꼬리).
 * 기대 횟수가 작으면 포아송 정확값(정규 근사가 맞지 않는다), 크면 연속성 보정한 정규 근사 */
export function tailP(c: number, n: number, p: number): number {
  const lam = n * p
  if (lam <= 0) return c > 0 ? 0 : 1
  if (lam < 30) {
    const low = c <= lam
    const upto = low ? c : c - 1 // 위쪽 꼬리는 1 − P(X ≤ c − 1)
    let term = Math.exp(-lam)
    let cdf = 0
    for (let k = 0; k <= upto; k++) {
      cdf += term
      term *= lam / (k + 1)
    }
    return low ? Math.min(1, cdf) : Math.max(0, 1 - cdf)
  }
  const z = (Math.abs(c - lam) - 0.5) / Math.sqrt(lam * (1 - p))
  if (z <= 0) return 0.5
  // 정규 꼬리 Q(z) = erfc(z/√2)/2 (Abramowitz–Stegun 7.1.26 근사)
  const x = z / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  return (t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x)) / 2
}
