/* 가상화 리스트 (재활용 스크롤) — 데이터 1,000개를 셀 십여 개로 돌려 쓴다.
 * 같은 크기 항목이 한 줄로 늘어선 목록(세로 랭킹 · 우편함, 가로 보상 트랙)용. 크기가 제각각인 항목은 다루지 않는다.
 * Unity 의 재활용 스크롤과 같은 두 단계다: ① 스크롤 위치로 보이는 인덱스 범위 계산 ② 범위를 벗어난 셀을 새로 들어온 항목에 다시 배정. */

export interface IndexRange {
  /** 첫 항목 (포함). 빈 목록이면 0 */
  first: number
  /** 마지막 항목 (포함). 빈 목록이면 -1 */
  last: number
}

/**
 * 스크롤 위치(scroll)와 보이는 길이(viewport)로 그려야 할 항목 범위. 단위는 px 처럼 itemSize 와 같으면 된다.
 * overscan 만큼 양 끝에 더 그려 빠르게 굴릴 때 빈칸이 보이지 않게 한다.
 */
export function visibleRange(scroll: number, viewport: number, itemSize: number, count: number, overscan = 1): IndexRange {
  if (count <= 0 || itemSize <= 0) return { first: 0, last: -1 }
  const first = Math.max(0, Math.floor(scroll / itemSize) - overscan)
  const last = Math.min(count - 1, Math.ceil((scroll + viewport) / itemSize) - 1 + overscan)
  return { first, last: Math.max(first - 1, last) }
}

/** index 번째 항목이 놓일 위치 (목록 시작부터). 셀은 이 위치로 옮기기만 하고 다시 만들지 않는다 */
export const itemOffset = (index: number, itemSize: number, gap = 0) => index * (itemSize + gap)

export interface RecyclerStats {
  /** 지금까지 새로 만든 셀 수 = 화면에 동시에 필요한 최대 셀 수 */
  created: number
  /** 이미 있던 셀을 다른 항목에 다시 쓴 횟수 */
  reused: number
  /** 지금 항목이 붙어 있는 셀 수 */
  active: number
}

export interface Recycler {
  /** 범위가 바뀔 때마다 부른다. 항목 index → 셀 번호. 범위 안에 계속 있던 항목은 같은 셀을 유지한다 */
  layout(range: IndexRange): Map<number, number>
  stats(): RecyclerStats
  /** 셀을 모두 버리고 처음부터 (목록 데이터가 통째로 바뀔 때) */
  reset(): void
}

/**
 * 셀 재활용기. recycle=false 면 '재활용 끄기' 비교용: 셀을 돌려쓰지 않고 항목마다 새 셀을 만든다(만든 셀을 버리지도 않는다).
 */
export function createRecycler(recycle = true): Recycler {
  let byIndex = new Map<number, number>()
  let free: number[] = []
  let created = 0
  let reused = 0
  const kept = new Map<number, number>() // recycle=false: 한 번 만든 항목의 셀은 계속 남는다

  return {
    layout({ first, last }) {
      const next = new Map<number, number>()
      if (!recycle) {
        for (let i = first; i <= last; i++) {
          if (!kept.has(i)) kept.set(i, created++)
          next.set(i, kept.get(i)!)
        }
        byIndex = next
        return next
      }
      // ① 범위를 벗어난 항목의 셀을 반납
      for (const [index, cell] of byIndex) {
        if (index < first || index > last) free.push(cell)
        else next.set(index, cell)
      }
      // ② 새로 들어온 항목에 반납된 셀부터 배정, 모자랄 때만 새로 만든다
      for (let i = first; i <= last; i++) {
        if (next.has(i)) continue
        if (free.length) {
          next.set(i, free.pop()!)
          reused++
        } else next.set(i, created++)
      }
      byIndex = next
      return next
    },
    stats: () => ({ created, reused, active: byIndex.size }),
    reset() {
      byIndex = new Map()
      free = []
      kept.clear()
      created = 0
      reused = 0
    },
  }
}
