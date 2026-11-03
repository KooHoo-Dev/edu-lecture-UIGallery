import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { KINDS, MIX_WEIGHTS, checkSave, crossings, generate, reachable, saveRun, type Kind, type LoadCheck, type Mix, type RouteMap, type RouteNode, type RunSave } from './map'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 저장 → 지도 버림 → 불러오기 단계 (초) */
const SAVE_CLEAR = 0.7
const SAVE_LOAD = 1.5
const SAVE_DONE = 4.5
const MIXES = Object.keys(MIX_WEIGHTS) as Mix[]

const KIND_INFO: Record<Kind, { name: string; desc: string }> = {
  fight: { name: '교전', desc: '잔해 드론 무리 제압' },
  elite: { name: '강적', desc: '중장갑 잔해 드론' },
  rest: { name: '정비', desc: '도윤: 수리 키트로 장비 점검' },
  shop: { name: '보급', desc: '크레딧으로 냉각 셀 구매' },
  loot: { name: '회수', desc: '회로 조각 상자 회수' },
  signal: { name: '미확인 신호', desc: '세라: "정체불명 신호 포착"' },
  goal: { name: '최종 목표', desc: '북쪽 통신탑 복구' },
}

interface Run {
  key: string
  path: number[]
  kbSel: number
  follow: boolean
  pinKind: Kind | null
  rejectId: number
  rejectT: number
  toast: string
  toastTone: 'ok' | 'bad' | ''
  phase: '' | 'saved' | 'cleared' | 'loaded'
  phaseT: number
  saved: string
  /** 옛 생성 규칙으로 만든 저장을 흉내 냈는가 (지문 불일치 시연) */
  stale: boolean
  loadCheck: LoadCheck | ''
  goalWait: number
  startWait: number
  autoBad: boolean
  savedOnce: boolean
  hlAuto: number
  /** 이 런에서 실제로 옮긴 칸 수 (자동 데모가 저장 · 범례 강조를 끼워 넣는 시점. 첫 화면은 미리 걸어 둬서 path 길이로는 못 잰다) */
  moves: number
}

/** 화면 배치 (논리 px). 지도 창 · 오른쪽 레일 */
function frame(aspect: string) {
  return aspect === '9:16'
    ? { vx: 30, vy: 150, vw: 944, vh: 1290, rowH: 150, railX: 992 }
    : { vx: 470, vy: 30, vw: 930, vh: 1020, rowH: 132, railX: 1418 }
}
const PAD_T = 250
const PAD_B = 150
/** 흔들림(jx · jy, −0.5~0.5)을 그릴 때의 계수 — 열 폭 · 층 높이에 곱한다. 생성기는 그대로, 그리는 쪽만 정한다.
 * 위아래 이웃 층도 층 높이의 0.7 이상 떨어져 커진 노드와 현재 노드가 겹치지 않는다 */
const JX = 0.2
const JY = 0.3

/**
 * 분기 경로 맵.
 * 지도는 시드에서 만든 순수 데이터(map.ts), 진행 상태는 지나온 길(id 배열) 하나뿐이다.
 * 상태는 이동 · 이벤트 때만 바뀌므로 React 렌더, 스크롤 따라가기와 레일만 매 프레임 ref 로 갱신한다.
 */
export default function BranchingRouteMap(p: SpecimenProps) {
  const juice = p.juice
  const floors = Math.round(num(p.params, 'floors', 12))
  const cols = Math.round(num(p.params, 'cols', 7))
  const paths = Math.round(num(p.params, 'paths', 5))
  const mix = str(p.params, 'mix', 'balanced') as Mix
  const seedParam = Math.round(num(p.params, 'seed', 7))
  const preventCross = bool(p.params, 'preventCross', true)
  const followScroll = bool(p.params, 'followScroll', true)
  const reduce = prefersReducedMotion()

  /* 시드: 조절 값 + '새 지도' 로 더한 수. 조절 값이 바뀌면 더한 수는 0 으로 */
  const off = useRef({ seed: seedParam, add: 0 })
  if (off.current.seed !== seedParam) off.current = { seed: seedParam, add: 0 }
  const [, setVersion] = useState(0)
  const rerender = () => setVersion(v => v + 1)
  const seed = seedParam + off.current.add

  const map = useMemo(() => generate(seed, floors, cols, paths, mix, preventCross), [seed, floors, cols, paths, mix, preventCross])
  const mapKey = `${seed}/${floors}/${cols}/${paths}/${mix}/${preventCross}`

  const runRef = useRef<Run | null>(null)
  const fresh = (key: string, path: number[]): Run => ({
    key, path, kbSel: 0, follow: true, pinKind: null, rejectId: -1, rejectT: 0, toast: '', toastTone: '',
    phase: '', phaseT: 0, saved: '', stale: false, loadCheck: '', goalWait: 0, startWait: 0, autoBad: true, savedOnce: false, hlAuto: 0, moves: 0,
  })
  const mounted = useRef(false)
  if (!runRef.current || runRef.current.key !== mapKey) {
    runRef.current = fresh(mapKey, [])
    if (!mounted.current) {
      // 처음 화면(썸네일)만 미리 걸어 둔 런 — 지나온 길과 함께 '갈라지는' 순간(선택지 2개 이상)이 보이게.
      // 새 지도 · 조절 값 변경은 출발 전부터
      runRef.current.path = firstBranch(map)
    }
  }
  mounted.current = true
  const R = runRef.current
  const [hoverKind, setHoverKind] = useState<Kind | null>(null)
  const hlKind = hoverKind ?? R.pinKind

  const L = frame(p.aspect)
  const tall = p.aspect === '9:16'
  const colW = L.vw / cols
  const contentH = PAD_T + (floors - 1) * L.rowH + PAD_B
  /* 겹침 방지: 가로 흔들림은 열 폭의 ±0.1 (JX) → 이웃 노드 중심은 열 폭의 0.8 이상 떨어진다.
   * 노드는 열 폭의 0.56 이하라 갈 수 있는 노드(1.18배)끼리도 0.66 < 0.8 로 겹치지 않는다. Unity 두 판도 같은 계수 */
  const nodeSize = Math.round(Math.min(80, colW * 0.56))
  const px = (n: RouteNode) => (n.kind === 'goal' ? L.vw / 2 : (n.col + 0.5 + n.jx * JX) * colW)
  const py = (n: RouteNode) => (n.kind === 'goal' ? 105 : contentH - PAD_B - (n.floor + n.jy * JY) * L.rowH)
  const startY = contentH - PAD_B + 92

  const cur = R.path.length ? map.byId.get(R.path[R.path.length - 1])! : null
  const reach = reachable(map, R.path)
  const atGoal = cur?.kind === 'goal'
  /** 키보드 후보: 좋은 예는 갈 수 있는 노드, 나쁜 예는 위층 노드 전부(눌러 봐야 안다) */
  const nextFloor = cur ? cur.floor + 1 : 0
  const kbList = juice ? reach : map.nodes.filter(n => n.floor === nextFloor).map(n => n.id)
  const kbId = kbList.length ? kbList[clamp(R.kbSel, 0, kbList.length - 1)] : -1
  const visited = new Set(R.path)

  /* ───── 직접 조작 → 자동 데모 잠시 멈춤 ───── */
  const tRef = useRef(0)
  const realAt = useRef(-1e9)
  const real = () => {
    realAt.current = tRef.current
  }
  /** 키보드 후보 점선 고리는 키보드를 쓴 뒤에만 (:focus-visible 과 같은 생각). 마우스 · 터치를 쓰면 다시 숨긴다 */
  const kbUsed = useRef(false)
  const onPointerDown = () => {
    real()
    if (kbUsed.current) {
      kbUsed.current = false
      rerender()
    }
  }

  const busy = () => R.phase === 'saved' || R.phase === 'cleared'

  const tryMove = (id: number) => {
    if (busy() || atGoal) return
    const n = map.byId.get(id)
    if (!n) return
    if (reach.includes(id)) {
      R.path = [...R.path, id]
      R.moves++
      R.kbSel = 0
      R.follow = followScroll
      R.toast = `${KIND_INFO[n.kind].name} — ${KIND_INFO[n.kind].desc}`
      R.toastTone = n.kind === 'goal' ? 'ok' : ''
      R.rejectId = -1
      rerender()
    } else if (!juice) {
      // 나쁜 예: 눌러 본 뒤에야 막힌다
      R.rejectId = id
      R.rejectT = 0.6
      R.toast = '갈 수 없는 경로입니다'
      R.toastTone = 'bad'
      rerender()
    }
  }

  const newMap = () => {
    off.current.add++
    runRef.current = null
    rerender()
  }
  const restart = () => {
    // 같은 시드로 처음부터 — 지문이 그대로인 것으로 '같은 시드 = 같은 지도' 를 확인한다
    runRef.current = fresh(mapKey, [])
    runRef.current.toast = `같은 시드 ${seed} — 지문 ${map.print} 그대로`
    runRef.current.toastTone = 'ok'
    rerender()
  }
  const cycleLegend = () => {
    const order: (Kind | null)[] = [...KINDS, null]
    R.pinKind = order[(order.indexOf(R.pinKind) + 1) % order.length]
    rerender()
  }
  /** stale = 옛 생성 규칙으로 만든 저장을 흉내 낸다. 종류 비율만 달랐던 옛 생성기의 지문을 넣는다
   *  (간선은 같아 길 검사는 통과하지만 노드 종류가 다른 지도 — 지문만 잡아낸다) */
  const saveLoad = (stale = false) => {
    if (busy()) return
    const oldMix = MIXES[(MIXES.indexOf(map.mix) + 1) % MIXES.length]
    const oldPrint = stale ? generate(map.seed, map.floors, map.cols, map.paths, oldMix, preventCross).print : map.print
    R.saved = saveRun(map, R.path, oldPrint)
    R.stale = stale
    R.phase = 'saved'
    R.phaseT = 0
    R.loadCheck = ''
    R.savedOnce = true
    rerender()
  }
  /** 불러오기: 저장한 글자만 남기고 지도는 시드로 다시 만든다. 저장된 지문과 다시 만든 지도의 지문을 비교한다 */
  const load = () => {
    const sv = JSON.parse(R.saved) as RunSave
    const again = generate(sv.seed, sv.floors, sv.cols, sv.paths, sv.mix, preventCross)
    const check = checkSave(sv, again)
    R.path = check === 'ok' ? sv.path.slice() : []
    R.loadCheck = check
    R.follow = true
    R.toast =
      check === 'ok'
        ? `불러옴 — 저장 지문 ${sv.print} = 다시 만든 지도 ${again.print}, 길 ${sv.path.length}칸 검증`
        : check === 'print'
          ? `지문 불일치 (저장 ${sv.print} ≠ 지금 ${again.print}) — 생성 규칙이 바뀌었다. 처음부터`
          : '길 검증 실패 — 저장된 길이 이 지도에서 이어지지 않는다. 처음부터'
    R.toastTone = check === 'ok' ? 'ok' : 'bad'
  }

  const handle = (id: string) => {
    if (id === 'step') {
      if (atGoal) newMap()
      else if (!busy()) tryMove(autoChoice(map, R.path))
    } else if (id === 'new-map') newMap()
    else if (id === 'legend') cycleLegend()
    else if (id === 'save-load') saveLoad()
    else if (id === 'old-save') saveLoad(true)
    else if (id === 'restart') restart()
  }
  useTrigger(p.trigger, id => {
    real()
    handle(id)
  })

  /* 자동 데모: 한 칸씩 올라가다 목표에 닿으면 새 지도. 중간에 저장 · 불러오기와 범례 강조를 한 번씩 */
  useAutoplay(
    p.autoplay && !p.thumbnail,
    p.playing,
    p.timeScale,
    1.25,
    () => {
      if (tRef.current - realAt.current < MANUAL_PAUSE || busy()) return
      if (R.hlAuto === 1) {
        R.hlAuto = 2 // 한 런에 한 번만 (0 아직 · 1 켜 둠 · 2 끝)
        R.pinKind = null
        rerender()
        return
      }
      if (atGoal) {
        if (++R.goalWait >= 2) newMap()
        return
      }
      // 새 지도는 출발 전 화면(0층 노드가 모두 갈 수 있는 곳)을 한 박자 더 보여 준다
      if (!R.path.length && R.startWait++ < 1) return
      if (R.moves >= 2 && !R.savedOnce) return saveLoad()
      if (R.moves >= 4 && R.pinKind === null && R.hlAuto === 0) {
        R.pinKind = 'rest'
        R.hlAuto = 1
        rerender()
        return
      }
      if (!juice && R.autoBad) {
        // 나쁜 예: 못 가는 노드를 먼저 눌러 본다
        const bad = map.nodes.find(n => n.floor === nextFloor && !reach.includes(n.id))
        R.autoBad = false
        if (bad) return tryMove(bad.id)
      }
      R.autoBad = true
      tryMove(autoChoice(map, R.path))
    },
    p.trigger?.seq,
  )

  /* ───── 매 프레임: 스크롤 따라가기 · 레일 · 단계 타이머 ───── */
  const vpRef = useRef<HTMLDivElement>(null)
  const railWinRef = useRef<HTMLDivElement>(null)
  const railCurRef = useRef<HTMLDivElement>(null)
  const targetScroll = () => {
    const vp = vpRef.current
    if (!vp) return 0
    const y = cur ? py(cur) : startY
    // 현재 위치를 창 아래쪽 2/3 지점에 — 위쪽(앞으로 갈 길)이 더 많이 보이게
    return clamp(y - L.vh * 0.66, 0, Math.max(0, contentH - L.vh))
  }
  const paintRail = () => {
    const vp = vpRef.current
    if (!vp) return
    const k = L.vh / contentH
    if (railWinRef.current) {
      railWinRef.current.style.top = `${vp.scrollTop * k}px`
      railWinRef.current.style.height = `${Math.min(L.vh, L.vh * k)}px`
    }
    if (railCurRef.current) railCurRef.current.style.top = `${(cur ? py(cur) : startY) * k}px`
  }
  useGameLoop(p.playing, p.timeScale, dt => {
    tRef.current += dt
    const vp = vpRef.current
    if (vp && R.follow) {
      const tgt = targetScroll()
      const next = reduce ? tgt : damp(vp.scrollTop, tgt, 5, dt)
      vp.scrollTop = Math.abs(next - tgt) < 0.5 ? tgt : next
    }
    let dirty = false
    if (R.rejectT > 0) {
      R.rejectT -= dt
      if (R.rejectT <= 0) {
        R.rejectId = -1
        dirty = true
      }
    }
    if (R.phase) {
      R.phaseT += dt
      if (R.phase === 'saved' && R.phaseT >= SAVE_CLEAR) {
        R.phase = 'cleared'
        R.path = [] // 메모리의 진행 상태를 버린다 — 남은 것은 JSON 글자뿐
        dirty = true
      } else if (R.phase === 'cleared' && R.phaseT >= SAVE_LOAD) {
        load()
        R.phase = 'loaded'
        dirty = true
      } else if (R.phase === 'loaded' && R.phaseT >= SAVE_DONE) {
        R.phase = ''
        dirty = true
      }
    }
    if (dirty) rerender()
    paintRail()
  })

  // 지도가 바뀌면(새 지도 · 조절 값) 스크롤을 바로 현재 위치로. 정지 상태에서도 한 번 그린다
  useLayoutEffect(() => {
    const vp = vpRef.current
    if (vp) vp.scrollTop = targetScroll()
    paintRail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, p.aspect])
  useLayoutEffect(() => paintRail())

  const manualScroll = () => {
    R.follow = false
    real()
  }

  /* ───── 키보드: ←/→ 고르기, Enter · ↑ 이동 ─────
   * Space 는 갤러리 재생 키라 쓰지 않는다. ←/→/Enter/↑ 는 이 표본의 조작 키라
   * 잠깐 할 일이 없을 때(저장 · 불러오는 중, 목표 도착)도 먹는다 — 같은 ← 가 때로는 해설을 넘기면 안 된다 */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key
    if ((e.target as Element).closest?.('[data-legend]') && k === 'Enter') return // 범례 버튼의 Enter 는 버튼에게
    const control = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Enter' || k === 'ArrowUp'
    if (!control) return
    real()
    if (!kbUsed.current) {
      kbUsed.current = true
      rerender()
    }
    if (busy() || atGoal || !kbList.length) return true
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      R.kbSel = (clamp(R.kbSel, 0, kbList.length - 1) + (k === 'ArrowRight' ? 1 : kbList.length - 1)) % kbList.length
      rerender()
      return true
    }
    if (!e.repeat) tryMove(kbId) // Enter · ↑ — 누르고 있어도 한 칸만 (입력 소비)
    return true
  })

  /* ───── 그리기 ───── */
  const nodeState = (n: RouteNode) => {
    if (visited.has(n.id)) return n.id === cur?.id ? 'current' : 'visited'
    if (juice && reach.includes(n.id)) return 'next'
    if (juice && n.floor <= (cur?.floor ?? -1)) return 'past'
    return 'idle'
  }
  const edgeState = (a: RouteNode, b: RouteNode) => {
    const ia = R.path.indexOf(a.id)
    if (ia >= 0 && R.path[ia + 1] === b.id) return 'trail'
    if (juice && (cur ? a.id === cur.id : false) && reach.includes(b.id)) return 'next'
    if (juice && b.floor <= (cur?.floor ?? -1)) return 'past'
    return 'idle'
  }
  const curve = (a: RouteNode, b: RouteNode) => {
    const x1 = px(a), y1 = py(a), x2 = px(b), y2 = py(b)
    const my = (y1 + y2) / 2
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }
  const startEdges = !cur && juice ? reach.map(id => map.byId.get(id)!) : []

  /* 해설 번호용: 갈 수 있는 노드를 감싼 영역. 목표에 도착해 고를 곳이 없어도 DOM 에 남기고 visibility 로만 숨긴다.
   * 번호는 위쪽 대신 옆(같은 층의 이웃 칸이 빈 쪽)에 붙여 바로 위층 노드를 가리지 않게 한다 */
  const box = (() => {
    const list = (atGoal ? [] : juice ? reach : kbList).map(id => map.byId.get(id)!)
    // 커진 노드(1.18배) · 목표(1.7배)를 감쌀 만큼
    const pad = list.length && list[0].kind !== 'goal' ? nodeSize * 0.66 : nodeSize * 0.95
    if (!list.length) {
      const g = map.byId.get(map.goalId)!
      return { style: { left: px(g) - pad, top: py(g) - pad, width: pad * 2, height: pad * 2, visibility: 'hidden' } as CSSProperties, pin: 'left' }
    }
    const xs = list.map(px), ys = list.map(py)
    const fl = list[0].floor
    const cs = list.map(n => n.col)
    const lo = Math.min(...cs), hi = Math.max(...cs)
    const taken = (c: number) => map.nodes.some(n => n.floor === fl && n.col === c && n.kind !== 'goal')
    const pin = list[0].kind === 'goal' || (lo > 0 && !taken(lo - 1)) ? 'left' : hi < cols - 1 && !taken(hi + 1) ? 'right' : lo === 0 ? 'left' : 'top'
    return {
      style: { left: Math.min(...xs) - pad, top: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 },
      pin,
    }
  })()

  const cross = preventCross ? [] : crossings(map)
  const counts = Object.fromEntries(KINDS.map(k => [k, map.nodes.filter(n => n.kind === k).length])) as Record<Kind, number>
  const choiceKinds = [...new Set(reach.map(id => map.byId.get(id)!.kind))]
  const k = L.vh / contentH
  /** 목표 바로 앞 층(F−1)의 기준선 y */
  const restRowY = PAD_T
  /** 저장 · 불러오기 중에는 저장한 글자, 평소에는 지금 상태를 저장하면 나올 글자 */
  const shownJson = R.phase ? R.saved : saveRun(map, R.path)

  return (
    <div
      className={s.root}
      data-aspect={p.aspect}
      data-juice={juice || undefined}
      data-paused={!p.playing || undefined}
      data-phase={R.phase || undefined}
      data-hl={hlKind || undefined}
      style={{ '--ts': Math.max(0.05, p.timeScale), '--node': `${nodeSize}px` } as CSSProperties}
      tabIndex={p.thumbnail ? -1 : 0}
      aria-label="분기 경로 맵 (클릭 · 터치, 키보드: ←/→ 고르기 · Enter 이동)"
      onKeyDown={onKeyDown}
      onPointerDownCapture={onPointerDown}
    >
      <header className={s.head}>
        <div>
          <b>3구역 귀환 경로</b>
          <span>
            외곽 탐사대 · {atGoal ? '런 완료' : cur ? `${cur.floor + 1} / ${floors}층 · 남은 ${floors - cur.floor}칸` : `출발 전 · ${floors}층 지도`}
          </span>
          {!preventCross && <em className={s.crossNote}>교차 검사 꺼짐 · 엇갈린 곳 {cross.length}</em>}
        </div>
      </header>

      {/* 범례 — 올리거나 포커스를 두면 같은 종류가 모두 강조된다 */}
      <ul className={s.legend} data-part="legend" data-pin={tall ? 'top' : 'right'}>
        {KINDS.map(kind => (
          <li key={kind}>
            <button
              data-legend
              data-kind={kind}
              data-on={hlKind === kind || undefined}
              data-pinned={R.pinKind === kind || undefined}
              tabIndex={p.thumbnail ? -1 : 0}
              onPointerEnter={() => setHoverKind(kind)}
              onPointerLeave={() => setHoverKind(null)}
              onFocus={() => setHoverKind(kind)}
              onBlur={() => setHoverKind(null)}
              onClick={() => {
                R.pinKind = R.pinKind === kind ? null : kind
                rerender()
              }}
            >
              <KindIcon kind={kind} />
              <span>{KIND_INFO[kind].name}</span>
              <em className={s.num}>{counts[kind]}</em>
            </button>
          </li>
        ))}
      </ul>

      {/* 지도 — 세로 스크롤 */}
      <div
        ref={vpRef}
        className={s.viewport}
        style={{ left: L.vx, top: L.vy, width: L.vw, height: L.vh }}
        onWheel={manualScroll}
        onPointerDown={e => {
          if (!(e.target as Element).closest('button')) manualScroll()
        }}
      >
        <div className={s.content} style={{ height: contentH }}>
          <div className={s.restBand} style={{ top: restRowY - L.rowH * 0.42, height: L.rowH * 0.84 }}>
            <span>목표 앞 · 정비 보장</span>
          </div>
          <svg className={s.edges} width={L.vw} height={contentH} aria-hidden>
            {startEdges.map(b => (
              <path key={`s${b.id}`} d={`M${L.vw / 2} ${startY}L${px(b)} ${py(b)}`} data-state="next" />
            ))}
            {map.nodes.flatMap(a =>
              a.next.map(id => {
                const b = map.byId.get(id)!
                return <path key={`${a.id}-${id}`} d={curve(a, b)} data-state={edgeState(a, b)} />
              }),
            )}
            {/* 교차 막기를 끈 지도: 엇갈린 곳을 표시 (수업용) */}
            {cross.map(([a, b]) => {
              const ua = map.byId.get(a.id + cols)!
              const ub = map.byId.get(b.id + cols)!
              const cx = (px(a) + px(b) + px(ua) + px(ub)) / 4
              const cy = (py(a) + py(b) + py(ua) + py(ub)) / 4
              return (
                <g key={`x${a.id}`} className={s.cross} transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}>
                  <circle r="22" />
                  <path d="M-8 -8L8 8M8 -8L-8 8" />
                </g>
              )
            })}
          </svg>
          <div className={s.nextBox} data-part="next" data-pin={box.pin} style={box.style} />

          {map.nodes.map(n => {
            const st = nodeState(n)
            const can = reach.includes(n.id)
            return (
              <button
                key={n.id}
                className={s.node}
                data-kind={n.kind}
                data-state={st}
                data-hit={hlKind === n.kind || undefined}
                data-kb={n.id === kbId && kbUsed.current && !atGoal && !p.thumbnail ? true : undefined}
                data-reject={R.rejectId === n.id || undefined}
                data-goal={n.kind === 'goal' || undefined}
                style={{ left: px(n), top: py(n) }}
                tabIndex={-1}
                disabled={juice && !can && st !== 'current'}
                aria-label={`${KIND_INFO[n.kind].name} ${n.kind === 'goal' ? '' : `${n.floor + 1}층`}${can ? ' (갈 수 있음)' : ''}`}
                onClick={() => {
                  real()
                  tryMove(n.id)
                }}
              >
                <KindIcon kind={n.kind} />
                {st === 'visited' && <i className={s.check} aria-hidden />}
              </button>
            )
          })}
          <div className={s.start} style={{ left: L.vw / 2, top: startY }}>
            출발
          </div>
          <div
            className={s.me}
            style={{ left: (cur ? px(cur) : L.vw / 2) + (cur ? nodeSize * (cur.kind === 'goal' ? 0.95 : 0.62) : 70), top: (cur ? py(cur) : startY) + 20 }}
            aria-hidden
          >
            <i />
          </div>
        </div>
      </div>
      <div className={s.cleared} style={{ left: L.vx, top: L.vy, width: L.vw, height: L.vh }}>
        지도를 버렸다 — 남은 것은 저장한 JSON 뿐
      </div>

      {/* 레일 — 지도 전체에서 지금 보이는 곳과 현재 위치 */}
      <div className={s.rail} style={{ left: L.railX, top: L.vy, height: L.vh }} aria-hidden>
        <i className={s.railGoal} style={{ top: 105 * k }}>
          <KindIcon kind="goal" />
        </i>
        <i className={s.railRest} style={{ top: PAD_T * k }} data-part="rest-guard">
          <KindIcon kind="rest" />
        </i>
        <div ref={railWinRef} className={s.railWin} data-part="follow" />
        <div ref={railCurRef} className={s.railCur} />
      </div>

      {/* 현재 위치와 선택지 */}
      <section className={s.info}>
        <h4>현재 위치</h4>
        <div className={s.here} data-kind={cur?.kind ?? 'none'}>
          {cur ? <KindIcon kind={cur.kind} /> : <i className={s.dot} />}
          <div>
            <b>{cur ? KIND_INFO[cur.kind].name : '출발 지점'}</b>
            <span>{cur ? KIND_INFO[cur.kind].desc : '0층 노드 중 하나를 고른다'}</span>
          </div>
        </div>
        <div className={s.choices}>
          {atGoal ? (
            <span>도착. 다음 지도는 시드 + 1</span>
          ) : juice ? (
            <>
              <span>갈 수 있는 곳</span>
              {choiceKinds.map(kind => (
                <em key={kind} data-kind={kind}>
                  <KindIcon kind={kind} />
                  {KIND_INFO[kind].name}
                </em>
              ))}
            </>
          ) : (
            <span>위층 노드를 눌러 보세요</span>
          )}
        </div>
        <p className={s.toast} data-tone={R.toastTone || undefined} key={`${R.path.length}-${R.rejectId}-${R.toast}`}>
          {R.toast || '노드를 고르면 그 칸으로 이동한다'}
        </p>
        <div className={s.keys}>
          <KeyCap label="←" size={34} />
          <KeyCap label="→" size={34} />
          <span>고르기</span>
          <KeyCap label="Enter" size={34} />
          <span>이동</span>
        </div>
      </section>

      {/* 시드 · 저장 */}
      <section className={s.save} data-part="seed" data-pin={tall ? 'inside' : 'top'}>
        <div className={s.seedRow}>
          <span>
            시드 <b className={s.num}>{seed}</b>
          </span>
          <span>
            지문 <b className={s.num}>{map.print}</b>
          </span>
        </div>
        <p className={s.seedNote}>같은 시드 + 같은 조절 값 = 같은 지도. 지문을 Unity 판 콘솔 값과 비교한다</p>
        <code className={s.json} data-fresh={R.phase === 'saved' || undefined}>
          {shownJson}
        </code>
        <p className={s.saveState} data-phase={R.phase || undefined} data-bad={(R.phase === 'loaded' && R.loadCheck !== 'ok') || undefined}>
          {R.phase === 'saved'
            ? R.stale
              ? '① 옛 생성기(종류 비율이 달랐다)로 만든 저장'
              : '① 저장: 시드 + 지문 + 지나온 길만 JSON 으로'
            : R.phase === 'cleared'
              ? '② 지도와 진행을 메모리에서 버림'
              : R.phase === 'loaded'
                ? R.loadCheck === 'ok'
                  ? '③ 다시 만든 지도의 지문 = 저장된 지문, 길 검증 ✓'
                  : R.loadCheck === 'print'
                    ? '③ 지문 불일치 — 생성 규칙이 바뀌었다. 처음부터'
                    : '③ 길 검증 실패 — 처음부터'
                : '저장 내용 (지도 자체는 저장하지 않는다)'}
        </p>
      </section>
    </div>
  )
}

/** 자동 선택 — 갈 수 있는 노드 중 하나를 걸음 수 · 시드로 정한다 (같은 지도면 같은 길) */
function autoChoice(map: RouteMap, path: number[]): number {
  const list = reachable(map, path)
  return list[(path.length * 3 + map.seed) % list.length]
}

/** 첫 화면용 길 — 1층 이상에서 갈래가 둘 이상인 가장 낮은 노드까지, prev 를 따라 0층으로 거슬러 만든다.
 *  없으면(드묾) 자동 선택으로 두 걸음 */
function firstBranch(map: RouteMap): number[] {
  for (let f = 1; f < map.floors - 1; f++) {
    let n = map.nodes.find(m => m.floor === f && m.next.length >= 2)
    if (!n) continue
    const path = [n.id]
    while (n.prev.length) {
      n = map.byId.get(n.prev[0])!
      path.unshift(n.id)
    }
    return path
  }
  const path: number[] = []
  for (let i = 0; i < 2; i++) path.push(autoChoice(map, path))
  return path
}

/** 종류 아이콘 — 색 없이 모양만으로도 구분된다 (삼각 · 겹삼각 · 십자 · 상자 · 마름모 · 전파 · 깃발) */
function KindIcon({ kind }: { kind: Kind }) {
  return (
    <svg className={s.icon} viewBox="0 0 24 24" aria-hidden data-kind={kind}>
      {kind === 'fight' && <path d="M12 4l8 15H4z M12 10v4" />}
      {kind === 'elite' && <path d="M12 2l10 19H2z M12 9l4.5 8.5h-9z" />}
      {kind === 'rest' && <path d="M5 5h14v14H5z M12 8.5v7 M8.5 12h7" />}
      {kind === 'shop' && <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9" />}
      {kind === 'loot' && <path d="M12 3l8 9-8 9-8-9z M4 12h16 M9 7l3 5 3-5" />}
      {kind === 'signal' && <path d="M12 13.5a1.5 1.5 0 1 0 0-.1z M8 9.5a5.5 5.5 0 0 0 0 8 M16 9.5a5.5 5.5 0 0 1 0 8 M5 6.5a10 10 0 0 0 0 14 M19 6.5a10 10 0 0 1 0 14" />}
      {kind === 'goal' && <path d="M6 22V3 M6 4h12l-3 4 3 4H6" />}
    </svg>
  )
}
