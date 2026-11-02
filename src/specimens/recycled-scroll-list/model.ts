/* 랭킹 데이터 — 1,000명의 시즌 랭킹 (외곽 탐사대 · 잔해 드론 격추 점수).
 * 화면(셀)과 완전히 분리된 순수 데이터다. 셀은 이 배열의 index 하나를 잠깐 빌려 보여 줄 뿐이고,
 * '응원' 같은 상태도 여기(데이터)에 둔다 — 셀에 두면 셀을 돌려쓸 때 다른 대원에게 따라붙는다. */

export interface Row {
  id: number
  name: string
  squad: number
  level: number
  score: number
  /** 문장 모양 0~4 (색만으로 구분하지 않게 모양도 다르다) */
  crest: number
  cheers: number
  cheered: boolean
  /** 직전 갱신에서 오른 순위 (+ 오름, − 내림) */
  delta: number
  me?: boolean
}

/** 결정적 난수 (같은 씨앗 → 같은 목록) */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PRE = ['새벽', '북풍', '은빛', '붉은', '회색', '푸른', '작은', '고요한', '먼', '늦은', '날쌘', '검은', '맑은', '깊은', '빛나는', '외곽']
const SUF = ['매', '늑대', '별', '바람', '등대', '여우', '곰', '파도', '닻', '불꽃', '송골', '렌치', '나침반', '궤도', '안테나', '수리공']

export const CREST_PATHS = [
  'M0 -16 L13 -10 L12 4 Q8 12 0 16 Q-8 12 -12 4 L-13 -10 Z', // 방패
  'M0 -16 L4 -5 L16 -5 L6 2 L10 14 L0 7 L-10 14 L-6 2 L-16 -5 L-4 -5 Z', // 별
  'M0 -16 L14 0 L0 16 L-14 0 Z', // 마름모
  'M-8 -14 H8 L15 0 L8 14 H-8 L-15 0 Z', // 육각
  'M0 -15 A15 15 0 1 1 -0.1 -15 Z M0 -7 A7 7 0 1 0 0.1 -7 Z', // 고리
]

export const ME_RANK = 487

/** count 명의 랭킹. 하린(나)은 487위 근처, 도윤 · 세라도 목록 어딘가에 있다 */
export function generateRows(count: number, seed = 11): Row[] {
  const r = rng(seed)
  const rows: Row[] = []
  for (let i = 0; i < count; i++) {
    const k = i / Math.max(1, count - 1)
    const name = PRE[Math.floor(r() * PRE.length)] + SUF[Math.floor(r() * SUF.length)] + (r() < 0.45 ? String(Math.floor(r() * 90) + 10) : '')
    rows.push({
      id: i + 1,
      name,
      squad: 1 + Math.floor(r() * 9),
      level: Math.max(5, Math.round(70 - k * 55 + (r() - 0.5) * 10)),
      score: Math.round(1200 + 96000 * Math.pow(1 - k, 2.2) + r() * 40),
      crest: Math.floor(r() * CREST_PATHS.length),
      cheers: Math.floor(r() * r() * 60),
      cheered: false,
      delta: 0,
    })
  }
  rows.sort((a, b) => b.score - a.score)
  const put = (idx: number, name: string, extra: Partial<Row> = {}) => {
    if (idx < 0 || idx >= rows.length) return
    Object.assign(rows[idx], { name, ...extra })
  }
  const meIdx = Math.min(rows.length - 1, Math.round((ME_RANK - 1) * (count / 1000)))
  put(Math.min(11, rows.length - 1), '도윤', { squad: 2, cheered: true, cheers: 31 })
  put(Math.min(202, rows.length - 2), '세라', { squad: 2 })
  put(meIdx, '하린', { squad: 2, me: true, cheers: 4 })
  // 처음 화면에서 이미 응원해 둔 대원 (상태가 데이터에 있는지 셀에 있는지 비교할 거리)
  if (rows[1]) rows[1].cheered = true
  if (rows[4]) rows[4].cheered = true
  return rows
}

/** 순위 변동 — 일부 대원 점수가 오르고 다시 정렬. delta 는 오른 칸 수 */
export function reshuffle(rows: Row[], r: () => number): Row[] {
  const before = new Map(rows.map((row, i) => [row.id, i]))
  for (const row of rows) {
    if (row.me) row.score += 900 + Math.round(r() * 600) // 내 순위도 조금 오른다
    else if (r() < 0.35) row.score += Math.round(r() * r() * 9000)
  }
  const next = [...rows].sort((a, b) => b.score - a.score)
  next.forEach((row, i) => (row.delta = (before.get(row.id) ?? i) - i))
  return next
}
