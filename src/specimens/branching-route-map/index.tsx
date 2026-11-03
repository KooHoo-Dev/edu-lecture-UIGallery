import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { KINDS, crossings, generate, reachable, saveRun, validPath, type Kind, type Mix, type RouteMap, type RouteNode, type RunSave } from './map'
import s from './style.module.css'

export { meta } from './meta'

/** 사람이 직접 조작하면 자동 데모를 이만큼(게임 시간 초) 쉰다 */
const MANUAL_PAUSE = 6
/** 저장 → 지도 버림 → 불러오기 단계 (초) */
const SAVE_CLEAR = 0.7
const SAVE_LOAD = 1.5
const SAVE_DONE = 4.5

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
  loadedOk: boolean
  goalWait: number
  autoBad: boolean
  savedOnce: boolean
  hlAuto: number
}

/** 화면 배치 (논리 px). 지도 창 · 오른쪽 레일 */
function frame(aspect: string) {
  return aspect === '9:16'
    ? { vx: 30, vy: 150, vw: 944, vh: 1290, rowH: 150, railX: 992 }
    : { vx: 470, vy: 30, vw: 930, vh: 1020, rowH: 132, railX: 1418 }
}
const PAD_T = 250
const PAD_B = 150

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
    phase: '', phaseT: 0, saved: '', loadedOk: false, goalWait: 0, autoBad: true, savedOnce: false, hlAuto: 0,
  })
  if (!runRef.current || runRef.current.key !== mapKey) {
    // 처음 화면은 두 걸음 진행한 런 — 지나온 길과 다음 선택지가 함께 보이게
    const first = !runRef.current
    runRef.current = fresh(mapKey, [])
    if (first) for (let i = 0; i < 2; i++) runRef.current.path.push(autoChoice(map, runRef.current.path))
  }
  const R = runRef.current
  const [hoverKind, setHoverKind] = useState<Kind | null>(null)
  const hlKind = hoverKind ?? R.pinKind

  const L = frame(p.aspect)
  const tall = p.aspect === '9:16'
  const colW = L.vw / cols
  const contentH = PAD_T + (floors - 1) * L.rowH + PAD_B
  const nodeSize = Math.round(Math.min(80, colW * 0.62))
  const px = (n: RouteNode) => (n.kind === 'goal' ? L.vw / 2 : (n.col + 0.5 + n.jx * 0.5) * colW)
  const py = (n: RouteNode) => (n.kind === 'goal' ? 105 : contentH - PAD_B - (n.floor + n.jy * 0.36) * L.rowH)
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

  const busy = () => R.phase === 'saved' || R.phase === 'cleared'

  const tryMove = (id: number) => {
    if (busy() || atGoal) return
    const n = map.byId.get(id)
    if (!n) return
    if (reach.includes(id)) {
      R.path = [...R.path, id]
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
  const saveLoad = () => {
    if (busy()) return
    R.saved = saveRun(map, R.path)
    R.phase = 'saved'
    R.phaseT = 0
    R.loadedOk = false
    R.savedOnce = true
    rerender()
  }
  /** 불러오기: 저장한 글자만 남기고 지도는 시드로 다시 만든다 */
  const load = () => {
    const sv = JSON.parse(R.saved) as RunSave
    const again = generate(sv.seed, sv.floors, sv.cols, sv.paths, sv.mix, preventCross)
    const ok = again.print === map.print && validPath(again, sv.path)
    R.path = ok ? sv.path.slice() : []
    R.loadedOk = ok
    R.follow = true
    R.toast = ok ? `불러옴 — 지문 ${again.print} 일치, 길 ${sv.path.length}칸 검증` : '불러오기 실패 — 처음부터'
    R.toastTone = ok ? 'ok' : 'bad'
  }

  const handle = (id: string) => {
    if (id === 'step') {
      if (atGoal) newMap()
      else if (!busy()) tryMove(autoChoice(map, R.path))
    } else if (id === 'new-map') newMap()
    else if (id === 'legend') cycleLegend()
    else if (id === 'save-load') saveLoad()
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
      if (R.hlAuto > 0) {
        R.hlAuto = 0
        R.pinKind = null
        rerender()
        return
      }
      if (atGoal) {
        if (++R.goalWait >= 2) newMap()
        return
      }
      if (R.path.length === 4 && !R.savedOnce) return saveLoad()
      if (R.path.length === 6 && R.pinKind === null && !R.hlAuto) {
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
   * Space 는 갤러리 재생 키라 쓰지 않는다. 고를 것이 없을 때(목표 도착 · 불러오는 중)의 ←/→ 는 갤러리로 흘려보낸다 */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    if (p.thumbnail) return
    const k = e.key
    if ((e.target as Element).closest?.('[data-legend]') && k === 'Enter') return // 범례 버튼의 Enter 는 버튼에게
    if (busy() || atGoal || !kbList.length) return
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      R.kbSel = (clamp(R.kbSel, 0, kbList.length - 1) + (k === 'ArrowRight' ? 1 : kbList.length - 1)) % kbList.length
      real()
      rerender()
      return true
    }
    if (k === 'Enter' || k === 'ArrowUp') {
      if (!e.repeat) {
        real()
        tryMove(kbId)
      }
      return true
    }
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

  // 해설 번호용: 갈 수 있는 노드를 감싼 영역
  const box = (() => {
    const list = (juice ? reach : kbList).map(id => map.byId.get(id)!)
    if (!list.length) return null
    const xs = list.map(px), ys = list.map(py)
    const pad = nodeSize * 0.75
    return { left: Math.min(...xs) - pad, top: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + pad * 2 }
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
      onPointerDownCapture={real}
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
          {box && <div className={s.nextBox} data-part="next" style={box} />}
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
                data-kb={n.id === kbId && !p.thumbnail ? true : undefined}
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
        <p className={s.saveState} data-phase={R.phase || undefined}>
          {R.phase === 'saved'
            ? '① 저장: 시드 + 지나온 길만 JSON 으로'
            : R.phase === 'cleared'
              ? '② 지도와 진행을 메모리에서 버림'
              : R.phase === 'loaded'
                ? R.loadedOk
                  ? '③ 시드로 지도를 다시 만들고 길을 검증 ✓'
                  : '③ 검증 실패 — 처음부터'
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
