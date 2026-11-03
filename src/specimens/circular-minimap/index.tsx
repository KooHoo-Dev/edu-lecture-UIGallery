import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../../core/flash'
import { clamp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap, MouseGlyph } from '../../core/input'
import { bool, num, str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import s from './style.module.css'
import { bearingTo, COLORS, dirName, DRONE_PATROLS, drawMinimapMap, drawWorld, HALF, OBJECTIVES, POIS, wrapAngle, type View } from './world'

export { meta } from './meta'

type Orient = 'rotate' | 'north-up' | 'none'

const DEG = Math.PI / 180
/** 축척 1× 일 때 미니맵 반지름이 담는 거리(m) */
const BASE_RANGE = 80
/** 축척 단계 순환 — 단계에 없는 값(기본 1.0)에서는 가장 먼 단계로 가서 첫 클릭부터 확실히 바뀐다 */
const ZOOM_STEPS = [0.7, 1.2, 2.5]
const nextZoomStep = (cur: number) => {
  const i = ZOOM_STEPS.findIndex(z => Math.abs(z - cur) < 0.05)
  if (i >= 0) return ZOOM_STEPS[(i + 1) % ZOOM_STEPS.length]
  return ZOOM_STEPS.reduce((a, b) => (Math.abs(b - cur) > Math.abs(a - cur) ? b : a))
}
const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const WALK = 7
/** 카메라 방위 스무딩 계수 (λ=3.2 → 시간 상수 약 0.31초). 월드 뷰·회전형 지도·원뿔이 모두 이 값 하나를 쓴다 */
const CAM_LAMBDA = 3.2
const CLAMP_FADE_MS = 150
/** 시작 목표 = 착륙장 (왼쪽 뒤, 범위 밖) — 첫 화면부터 가장자리 표시가 보이게 */
const START_OBJECTIVE = 4

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
/** 살짝 튀어나왔다 돌아오는 등장 (overshoot 약 1.15) */
const easeOutBack = (t: number) => {
  const c1 = 1.2
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
const dampAngle = (cur: number, target: number, lambda: number, dt: number) => wrapAngle(cur + wrapAngle(target - cur) * (1 - Math.exp(-lambda * dt)))

const SCRIPT = ['turn', 'enemy-ping', 'zoom-step', 'far-objective', 'zoom-step', 'turn-left', 'arrive', 'zoom-step'] as const

/**
 * 원형 미니맵 — 회전형 / 북쪽 고정 / 미니맵 없음(비교용).
 * 게임 화면(Canvas 2D 3/4 시점)과 미니맵이 같은 카메라 방위 값을 쓴다.
 * 매 프레임 바뀌는 값은 ref 로 DOM·Canvas 를 직접 갱신한다 (프레임마다 setState 없음).
 */
export default function CircularMinimap(p: SpecimenProps) {
  const orientParam = str(p.params, 'orientation', 'rotate') as Orient
  const zoomParam = num(p.params, 'zoomScale', 1)
  const D = Math.round(num(p.params, 'mapSize', 300))
  const edgeClamp = bool(p.params, 'edgeClamp', true)
  const edgeMargin = num(p.params, 'edgeMargin', 18)
  // 효과 끄기 = 위계 없는 아이콘 (같은 크기·같은 흰색·같은 모양)
  const flat = !p.juice || str(p.params, 'iconHierarchy', 'three-tier') === 'flat'
  const viewCone = bool(p.params, 'viewCone', true)
  const fovDeg = num(p.params, 'fovDeg', 70)
  const bgOpacity = num(p.params, 'bgOpacity', 0.75)
  const juice = p.juice
  const portrait = p.aspect === '9:16'
  const W = p.width
  const H = p.height
  const R = D / 2

  // 무대 안 '설정' 토글 — 갤러리 조절 값이 바뀌면 그 값으로 다시 맞춘다
  const [orient, setOrient] = useState<Orient>(orientParam)
  useEffect(() => setOrient(orientParam), [orientParam])

  const st = useRef({
    t: 0,
    px: 40,
    py: -70,
    heading: -60 * DEG,
    bodyYaw: -60 * DEG,
    camYaw: -60 * DEG,
    hold: 0,
    dash: null as null | { fx: number; fy: number; tx: number; ty: number; t: number; dur: number },
    zoom: zoomParam,
    zoomFrom: zoomParam,
    zoomTo: zoomParam,
    zoomT: 1,
    active: START_OBJECTIVE,
    popT: 9,
    done: { idx: -1, t: 9 },
    drones: DRONE_PATROLS.map((d, i) => ({ ...d, ph: i * 2.1, x: 0, y: 0, alert: 0, pingT: -1 })),
    pingIdx: 0,
    toastT: 0,
    tierHolder: null as Element | null,
    lastHeading: '',
    lastZoom: '',
  })

  const rootRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLDivElement>(null)
  const pivotRef = useRef<HTMLDivElement>(null)
  const coneRef = useRef<SVGGElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const ticksRef = useRef<SVGGElement>(null)
  const northRef = useRef<HTMLDivElement>(null)
  const primRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const primEdgeRef = useRef<HTMLDivElement>(null)
  const primWedgeRef = useRef<HTMLDivElement>(null)
  const distRef = useRef<HTMLDivElement>(null)
  const poiRefs = useRef<(HTMLDivElement | null)[]>([])
  const droneRefs = useRef<(HTMLDivElement | null)[]>([])
  const droneEdgeRefs = useRef<(HTMLDivElement | null)[]>([])
  const droneWedgeRefs = useRef<(HTMLDivElement | null)[]>([])
  const waveRefs = useRef<(HTMLDivElement | null)[]>([])
  const zoomLabelRef = useRef<HTMLSpanElement>(null)
  const headingRef = useRef<HTMLSpanElement>(null)
  const objLabelRef = useRef<HTMLSpanElement>(null)
  const toastRef = useRef<HTMLDivElement>(null)

  const objective = () => OBJECTIVES[st.current.active]
  const distTo = (x: number, y: number) => Math.hypot(x - st.current.px, y - st.current.py)

  const toast = (text: string, tone: 'info' | 'danger' | 'done' = 'info') => {
    st.current.toastT = 2.6
    const el = toastRef.current
    if (el) {
      el.textContent = text
      el.dataset.tone = tone
    }
  }

  const setActive = (i: number) => {
    const x = st.current
    x.active = i
    x.popT = 0
    if (objLabelRef.current) objLabelRef.current.textContent = OBJECTIVES[i].label
  }

  const complete = () => {
    const x = st.current
    const old = x.active
    x.done = { idx: old, t: 0 }
    let next = (old + 1) % OBJECTIVES.length
    for (let g = 0; g < OBJECTIVES.length && distTo(OBJECTIVES[next].x, OBJECTIVES[next].y) < 90; g++) next = (next + 1) % OBJECTIVES.length
    setActive(next)
    toast(`목표 완료 · ${OBJECTIVES[old].label}  →  다음: ${OBJECTIVES[next].label}`, 'done')
  }

  const setZoom = (z: number) => {
    const x = st.current
    const to = clamp(Math.round(z * 10) / 10, ZOOM_MIN, ZOOM_MAX)
    x.zoomFrom = x.zoom
    x.zoomTo = to
    // 효과 끄기: 한 프레임에 툭 바뀐다 (아이콘 순간이동)
    x.zoomT = juice ? 0 : 1
    if (!juice) x.zoom = to
  }

  // 갤러리에서 축척 값을 바꾸면 그 값으로 (보간하며) 이동
  const firstZoom = useRef(true)
  useEffect(() => {
    if (firstZoom.current) {
      firstZoom.current = false
      return
    }
    setZoom(zoomParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomParam])

  const turn = (dir: 1 | -1) => {
    const x = st.current
    x.heading = wrapAngle(x.heading + (dir * Math.PI) / 2)
    x.hold = 4.5
  }

  const handle = (id: string) => {
    const x = st.current
    if (id === 'turn') turn(1)
    else if (id === 'turn-left') turn(-1)
    else if (id === 'zoom-step') setZoom(nextZoomStep(x.zoomTo))
    else if (id === 'far-objective') {
      let best = -1
      let bestD = -1
      OBJECTIVES.forEach((o, i) => {
        const d = distTo(o.x, o.y)
        if (i !== x.active && d > bestD) {
          best = i
          bestD = d
        }
      })
      setActive(best)
      const o = objective()
      toast(`새 목표 · ${o.label} · ${dirName(bearingTo(x.px, x.py, o.x, o.y))}쪽 ${Math.round(bestD)} m`)
    } else if (id === 'enemy-ping') {
      const i = x.pingIdx++ % x.drones.length
      const dr = x.drones[i]
      // 카메라 기준 오른쪽 뒤 52m — 화면에는 안 보이지만 미니맵에는 잡히는 자리
      const b = x.camYaw + 128 * DEG
      const tx = x.px + Math.sin(b) * 52
      const ty = x.py + Math.cos(b) * 52
      dr.cx = tx - Math.cos(dr.ph) * dr.r
      dr.cy = ty - Math.sin(dr.ph) * dr.r
      dr.alert = 5
      dr.pingT = 0
      toast(`잔해 드론 감지 · ${dirName(bearingTo(x.px, x.py, tx, ty))}쪽 52 m`, 'danger')
    } else if (id === 'arrive') {
      if (x.dash) return
      const o = objective()
      const d = distTo(o.x, o.y)
      const ux = (o.x - x.px) / (d || 1)
      const uy = (o.y - x.py) / (d || 1)
      x.heading = bearingTo(x.px, x.py, o.x, o.y)
      x.dash = { fx: x.px, fy: x.py, tx: o.x - ux * 3, ty: o.y - uy * 3, t: 0, dur: clamp(d / 140, 0.5, 1.6) }
    }
  }
  useTrigger(p.trigger, handle)

  const step = useRef(0)
  useAutoplay(p.autoplay, p.playing, p.timeScale, 3.2, () => handle(SCRIPT[step.current++ % SCRIPT.length]), p.trigger?.seq)

  const reduced = prefersReducedMotion()

  useGameLoop(p.playing, p.timeScale, dt => {
    const x = st.current
    x.t += dt
    x.toastT = Math.max(0, x.toastT - dt)
    x.popT += dt
    x.done.t += dt
    for (const dr of x.drones) {
      dr.ph += dr.spd * dt
      dr.alert = Math.max(0, dr.alert - dt)
      if (dr.pingT >= 0) dr.pingT += dt
      if (dr.pingT > 1.2) dr.pingT = -1
    }
    // 축척 보간 (ease-out-cubic 250ms)
    if (x.zoomT < 1) {
      x.zoomT = Math.min(1, x.zoomT + dt / 0.25)
      x.zoom = x.zoomFrom + (x.zoomTo - x.zoomFrom) * easeOutCubic(x.zoomT)
    }
    // 이동: 목표 쪽으로 걸으며 좌우로 조금씩 흔들린다 (목표가 원 안팎을 오가게)
    if (x.dash) {
      const dsh = x.dash
      dsh.t += dt
      const k = easeInOut(Math.min(1, dsh.t / dsh.dur))
      x.px = dsh.fx + (dsh.tx - dsh.fx) * k
      x.py = dsh.fy + (dsh.ty - dsh.fy) * k
      if (dsh.t >= dsh.dur) {
        x.dash = null
        complete()
      }
    } else {
      x.hold = Math.max(0, x.hold - dt)
      const o = objective()
      if (x.hold <= 0) {
        const want = bearingTo(x.px, x.py, o.x, o.y) + 0.65 * Math.sin(x.t * 0.23)
        const diff = wrapAngle(want - x.heading)
        x.heading = wrapAngle(x.heading + clamp(diff, -0.5 * dt, 0.5 * dt))
      }
      // 맵 밖으로 나가지 않게
      if (Math.abs(x.px) > HALF - 40 || Math.abs(x.py) > HALF - 40) x.hold = 0
      x.px += Math.sin(x.heading) * WALK * dt
      x.py += Math.cos(x.heading) * WALK * dt
      if (distTo(o.x, o.y) < 6) complete()
    }
    // 몸 방향은 달리기 동작으로 좌우로 흔들린다. 카메라는 그것을 부드럽게 따라간다
    x.bodyYaw = x.heading + (reduced ? 0 : 0.05 * Math.sin(x.t * Math.PI * 2 * 1.7))
    x.camYaw = dampAngle(x.camYaw, x.heading, CAM_LAMBDA, dt)
    // 회전형 지도는 이미 스무딩된 카메라 방위를 그대로 쓴다 — 지도에서 한 번 더 거르면 화면보다 늦는다
    paint()
  })

  const paint = () => {
    const x = st.current
    const o = objective()
    // 효과 끄기: 등장 모션 없이 바로 나타난다. 동작 줄이기: 튀어나오는 크기 변화 없이 투명도만
    const motion = juice && !reduced
    const popS = motion && x.popT < 0.3 ? Math.max(0.001, easeOutBack(x.popT / 0.3)) : 1

    /* ───── 게임 화면 ───── */
    const ctx = worldRef.current?.getContext('2d')
    if (ctx) {
      const view: View = portrait
        ? { W, H, cx: W / 2, cy: H * 0.7, S: 25, q: 0.6, hv: 0.8, yaw: x.camYaw, px: x.px, py: x.py }
        : { W, H, cx: W / 2, cy: H * 0.66, S: 27, q: 0.6, hv: 0.8, yaw: x.camYaw, px: x.px, py: x.py }
      const dots: { x: number; y: number; b: number }[] = []
      if (orient === 'none') {
        // 미니맵 없음: 플레이어 → 목표 바닥 점열 (가까운 점부터 차례로 점등)
        const targets: { x: number; y: number }[] = [o]
        if (flat) [...POIS].sort((a, b) => distTo(a.x, a.y) - distTo(b.x, b.y)).slice(0, 2).forEach(q => targets.push(q))
        const wave = (x.t / 1.2) % 1
        for (const tg of targets) {
          const d = distTo(tg.x, tg.y)
          const ux = (tg.x - x.px) / (d || 1)
          const uy = (tg.y - x.py) / (d || 1)
          for (let i = 0; i < 16; i++) {
            const dd = 3.5 + i * 4.2
            if (dd > d - 2) break
            const b = juice && !reduced ? 0.2 + 0.8 * Math.exp(-(((i / 15 - wave) / 0.12) ** 2)) : juice ? 0.6 : 0.75
            dots.push({ x: x.px + ux * dd, y: x.py + uy * dd, b })
          }
        }
      }
      drawWorld(ctx, view, {
        t: x.t,
        heading: x.bodyYaw,
        objective: { x: o.x, y: o.y, scale: popS, alpha: juice ? Math.min(1, x.popT / 0.15) : 1 },
        drones: x.drones.map(dr => ({ x: dr.cx + Math.cos(dr.ph) * dr.r, y: dr.cy + Math.sin(dr.ph) * dr.r, alert: dr.alert > 0 })),
        dots,
      })
    }
    for (const dr of x.drones) {
      dr.x = dr.cx + Math.cos(dr.ph) * dr.r
      dr.y = dr.cy + Math.sin(dr.ph) * dr.r
    }

    /* ───── 정보 줄 ───── */
    const hd = (((Math.round(x.camYaw / DEG) % 360) + 360) % 360)
    const headTxt = `${String(hd).padStart(3, '0')}° ${dirName(x.camYaw)}`
    if (headingRef.current && headTxt !== x.lastHeading) {
      headingRef.current.textContent = headTxt
      x.lastHeading = headTxt
    }
    const zTxt = `×${x.zoomTo.toFixed(1)}`
    if (zoomLabelRef.current && zTxt !== x.lastZoom) {
      zoomLabelRef.current.textContent = zTxt
      x.lastZoom = zTxt
    }
    if (toastRef.current) {
      toastRef.current.style.opacity = String(clamp(x.toastT * 3, 0, 1))
      toastRef.current.style.translate = `0 ${x.toastT > 0 ? 0 : -12}px`
    }
    if (orient === 'none') {
      // 미니맵이 숨어 있어도 해설 번호 대상은 DOM 에 남겨 둔다
      const fallback = poiRefs.current[0]?.firstElementChild
      if (fallback && !x.tierHolder?.isConnected) {
        fallback.setAttribute('data-part', 'icon-tier')
        x.tierHolder = fallback
      }
      return
    }

    /* ───── 미니맵 ───── */
    const k = (R / BASE_RANGE) * x.zoom
    const mctx = mapRef.current?.getContext('2d')
    if (mctx) drawMinimapMap(mctx, D, k, x.px, x.py)

    // 효과 끄기: 스무딩 없이 '몸 방향' 원값을 그대로 쓴다 → 덜덜 떨리고 회전 때 툭 꺾인다
    const mapAngle = juice ? x.camYaw : x.bodyYaw
    const pivotAng = orient === 'rotate' ? -mapAngle : 0
    if (pivotRef.current) pivotRef.current.style.transform = `rotate(${pivotAng}rad)`
    // SVG 요소는 transform '속성'으로 돌린다 → 기준점이 viewBox 원점(= 원 중심)으로 확실하다
    if (ticksRef.current) ticksRef.current.setAttribute('transform', `rotate(${pivotAng / DEG})`)
    // 아이콘은 회전하지 않는 레이어에 두고 '위치만' 같은 각도로 돌린다 (효과 끄기는 지도 레이어의 자식 → 함께 돈다)
    const rot = juice ? pivotAng : 0
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)
    const off = (wx: number, wy: number): [number, number] => {
      const ox = (wx - x.px) * k
      const oy = -(wy - x.py) * k
      return [ox * cr - oy * sr, ox * sr + oy * cr]
    }
    // 시야 원뿔·화살표 = 게임 화면을 그린 카메라 방위와 같은 값
    // (회전형은 지도가 같은 값으로 돌았으므로 늘 위쪽 = 0)
    const coneAng = orient === 'rotate' ? 0 : juice ? x.camYaw : x.bodyYaw
    if (coneRef.current) coneRef.current.setAttribute('transform', `rotate(${coneAng / DEG})`)
    if (arrowRef.current) arrowRef.current.style.transform = `rotate(${coneAng}rad)`
    if (northRef.current) {
      const rn = R + 1
      northRef.current.style.transform = `translate(${rn * Math.sin(pivotAng)}px, ${-rn * Math.cos(pivotAng)}px)`
    }

    const edgeR = R - edgeMargin
    // 해설 3번 후보 순위: 0 = 아래쪽 반(번호가 비어 있는 곳) · 1 = 위쪽 반(N·원뿔 번호와 겹침) · 2 = 중심 근처(화살표에 가림)
    const spotRank = (oy: number, len: number) => (len < 56 ? 2 : oy > 0 ? 0 : 1)
    // N 배지와 각도가 가까우면(약 14° 이내, 24° 까지 서서히) 가장자리 표시를 한 단계 안쪽으로 — 둘이 겹쳐 읽히지 않게
    const nx = Math.sin(pivotAng)
    const ny = -Math.cos(pivotAng)
    const edgeRAt = (ux: number, uy: number) => edgeR - 32 * clamp((24 - Math.acos(clamp(ux * nx + uy * ny, -1, 1)) / DEG) / 10, 0, 1)
    const visible: { el: HTMLElement; len: number; tier: number; top: number }[] = []

    POIS.forEach((poi, i) => {
      const el = poiRefs.current[i]
      if (!el) return
      const [ox, oy] = off(poi.x, poi.y)
      const len = Math.hypot(ox, oy)
      const show = len < R + 24
      el.style.display = show ? '' : 'none'
      if (show) {
        el.style.transform = `translate(${ox}px, ${oy}px)`
        if (len < R - 10) visible.push({ el, len, tier: 3, top: spotRank(oy, len) })
      }
    })

    x.drones.forEach((dr, i) => {
      const el = droneRefs.current[i]
      const edge = droneEdgeRefs.current[i]
      const wedge = droneWedgeRefs.current[i]
      const wave = waveRefs.current[i]
      const [ox, oy] = off(dr.x, dr.y)
      const len = Math.hypot(ox, oy)
      // 위험은 경보 중일 때만 가장자리에 붙인다 — 평소 범위 밖 적까지 붙이면 테두리가 시끄럽다
      const clamped = juice && edgeClamp && dr.alert > 0 && len > edgeR
      const ux = ox / (len || 1)
      const uy = oy / (len || 1)
      const pulse = motion && dr.pingT >= 0 && dr.pingT < 0.4 ? 1 + 0.55 * Math.sin((Math.PI * dr.pingT) / 0.4) : 1
      if (el) {
        const show = !clamped && len < R + 24
        el.style.display = show ? '' : 'none'
        el.style.transform = `translate(${ox}px, ${oy}px) scale(${pulse})`
        if (show && len < R - 10) visible.push({ el, len, tier: 2, top: spotRank(oy, len) })
      }
      if (edge) {
        edge.dataset.on = String(clamped)
        const eR = edgeRAt(ux, uy)
        edge.style.transform = `translate(${ux * eR}px, ${uy * eR}px) scale(${pulse})`
      }
      if (wedge) wedge.style.transform = `rotate(${Math.atan2(uy, ux)}rad) translateX(24px)`
      if (wave) {
        const pt = dr.pingT / 0.6
        if (juice && dr.pingT >= 0 && pt <= 1) {
          const e = 1 - (1 - pt) * (1 - pt)
          const [wx, wy] = clamped ? [ux * edgeRAt(ux, uy), uy * edgeRAt(ux, uy)] : [ox, oy]
          // 동작 줄이기: 퍼지는 크기 변화 없이 고정 링이 짧게 보였다 사라진다
          wave.style.opacity = String(1 - pt)
          wave.style.transform = `translate(${wx}px, ${wy}px) scale(${reduced ? 0.7 : 0.4 + 1.2 * e})`
        } else wave.style.opacity = '0'
      }
    })

    // 주요 목표
    {
      const [ox, oy] = off(o.x, o.y)
      const len = Math.hypot(ox, oy)
      const ux = ox / (len || 1)
      const uy = oy / (len || 1)
      const clamped = juice && edgeClamp && len > edgeR
      const el = primRef.current
      if (el) {
        el.dataset.clamped = String(clamped)
        el.style.transform = `translate(${ox}px, ${oy}px) scale(${popS})`
        if (!clamped && len < R - 10) visible.push({ el, len, tier: 1, top: spotRank(oy, len) })
      }
      const eR = edgeRAt(ux, uy)
      const edge = primEdgeRef.current
      if (edge) {
        edge.dataset.on = String(clamped)
        edge.style.transform = `translate(${ux * eR}px, ${uy * eR}px) scale(${popS})`
      }
      if (primWedgeRef.current) primWedgeRef.current.style.transform = `rotate(${Math.atan2(uy, ux)}rad) translateX(30px)`
      const dEl = distRef.current
      if (dEl) {
        // 거리 글자는 원 중심 쪽으로 — 테두리 밖으로 삐져나가지 않게.
        // 단, 중심의 플레이어 화살표(반경 약 24px)와 닿을 만큼 들어가야 하면 고리 옆(접선 방향)으로 비켜 놓는다
        const txt = `${Math.round(distTo(o.x, o.y))} m`
        const w = txt.length * 16 + 24
        const h = 38
        const halfAlong = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2)
        const gapToArrow = (cx: number, cy: number) => Math.hypot(Math.max(Math.abs(cx) - w / 2, 0), Math.max(Math.abs(cy) - h / 2, 0))
        // 가장자리 표시(고리 반경 약 20px)와 겹치지 않는 가장 바깥 자리
        let cx = -ux * (24 + halfAlong)
        let cy = -uy * (24 + halfAlong)
        if (gapToArrow(ux * eR + cx, uy * eR + cy) < 34) {
          // 접선 방향 — 위쪽(N·알림)을 피해 아래쪽으로 비킨다
          let tx = -uy
          let ty = ux
          if (ty < 0 || (Math.abs(ty) < 0.01 && tx < 0)) {
            tx = -tx
            ty = -ty
          }
          const halfPerp = Math.abs(tx) * (w / 2) + Math.abs(ty) * (h / 2)
          const inward = Math.max(0, halfAlong - 10)
          cx = -ux * inward + tx * (22 + halfPerp)
          cy = -uy * inward + ty * (22 + halfPerp)
        }
        dEl.style.transform = `translate(calc(${cx}px - 50%), calc(${cy}px - 50%))`
        if (dEl.textContent !== txt) dEl.textContent = txt
      }
    }
    // 완료된 목표: 짧게 커지며 사라진다 (200ms)
    const gh = ghostRef.current
    if (gh) {
      const dn = x.done
      if (juice && dn.idx >= 0 && dn.t < 0.2) {
        const g = OBJECTIVES[dn.idx]
        const [ox, oy] = off(g.x, g.y)
        const u = dn.t / 0.2
        gh.style.display = ''
        gh.style.opacity = String(1 - u * u)
        gh.style.transform = `translate(${ox}px, ${oy}px) scale(${reduced ? 1 : 1 + 0.3 * u * u})`
      } else gh.style.display = 'none'
    }

    // 해설 3번(아이콘 위계): 지금 원 안에 보이는 아이콘 중 가장 중요한 것에 붙인다
    // (위쪽 반은 N·원뿔 번호와, 중심 근처는 플레이어 화살표와 겹치므로 아래쪽 반의 아이콘을 먼저 고른다)
    visible.sort((a, b) => a.top - b.top || a.tier - b.tier || a.len - b.len)
    // 0 크기 래퍼 대신 실제 모양(svg)에 붙여야 번호가 아이콘 위에 놓인다
    const holder = (visible[0]?.el ?? poiRefs.current[0])?.firstElementChild ?? null
    if (holder && holder !== x.tierHolder) {
      x.tierHolder?.removeAttribute('data-part')
      holder.setAttribute('data-part', 'icon-tier')
      x.tierHolder = holder
    }
  }

  useLayoutEffect(() => paint())

  // 휠로 확대·축소 (미니맵 위에서만, 페이지 스크롤은 막는다)
  useEffect(() => {
    const el = maskRef.current
    if (!el || p.thumbnail) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(st.current.zoomTo + (e.deltaY < 0 ? 0.2 : -0.2))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const toggleOrient = () => setOrient(o => (o === 'rotate' ? 'north-up' : o === 'north-up' ? 'rotate' : o))

  // 조작 키만 먹는다 (M 은 방향 방식이 '없음' 이면 쓰지 않는 키라 흘려보낸다)
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    const key = e.key
    if (key === 'q' || key === 'Q') turn(-1)
    else if (key === 'e' || key === 'E') turn(1)
    else if (key === 'ArrowUp' || key === '+' || key === '=') setZoom(st.current.zoomTo + 0.3)
    else if (key === 'ArrowDown' || key === '-') setZoom(st.current.zoomTo - 0.3)
    else if (key === 'm' || key === 'M') {
      if (orient === 'none') return
      toggleOrient()
    } else return
    return true
  })

  /* ───── 아이콘 모양 ───── */
  const pin = () => (
    <svg className={s.shape} width="30" height="38" viewBox="-15 -34 30 38" aria-hidden>
      <path d="M0 2 C-4 -8 -12 -13 -12 -21 A12 12 0 1 1 12 -21 C12 -13 4 -8 0 2 Z" fill="#e8edf2" stroke="#0b1117" strokeWidth="3" />
    </svg>
  )
  const primaryIcon = () =>
    flat ? (
      pin()
    ) : (
      <svg className={s.shape} width="52" height="52" viewBox="-26 -26 52 52" aria-hidden>
        <circle r="19" fill="none" stroke="#1d1405" strokeWidth="9" />
        <circle r="19" fill="none" stroke={COLORS.objective} strokeWidth="5" />
        <circle r="9.5" fill={COLORS.objective} stroke="#1d1405" strokeWidth="3" />
      </svg>
    )
  const dangerIcon = () =>
    flat ? (
      pin()
    ) : (
      <svg className={s.shape} width="34" height="32" viewBox="-17 -17 34 32" aria-hidden>
        <path d="M0 -14 L14 11 L-14 11 Z" fill={COLORS.danger} stroke="#2a0e0c" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    )
  const minorIcon = () =>
    flat ? (
      pin()
    ) : (
      <svg className={s.shape} width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
        <rect x="-6.5" y="-6.5" width="13" height="13" rx="2" fill={COLORS.minor} stroke="#0b1117" strokeWidth="2.5" />
      </svg>
    )

  const poiEls = POIS.map((_, i) => (
    <div
      key={`p${i}`}
      ref={el => {
        poiRefs.current[i] = el
      }}
      className={s.icon}
      data-tier="minor"
    >
      {minorIcon()}
    </div>
  ))
  const droneEls = DRONE_PATROLS.map((_, i) => (
    <div
      key={`d${i}`}
      ref={el => {
        droneRefs.current[i] = el
      }}
      className={s.icon}
      data-tier="danger"
    >
      {dangerIcon()}
    </div>
  ))
  const primEl = (
    <div key="prim" ref={primRef} className={s.icon} data-tier="primary">
      {primaryIcon()}
    </div>
  )
  // 그리기 순서 = 위계: 주변 정보(아래) → 위험 → 주요 목표(맨 위). 평면형은 순서도 뒤죽박죽
  const iconLayer = (
    <div className={s.icons}>
      {flat || !juice ? [primEl, ...droneEls, ...poiEls] : [...poiEls, ...droneEls, primEl]}
      <div ref={ghostRef} className={s.icon} data-tier="primary" style={{ display: 'none' }}>
        {primaryIcon()}
      </div>
      {DRONE_PATROLS.map((_, i) => (
        <div
          key={`w${i}`}
          ref={el => {
            waveRefs.current[i] = el
          }}
          className={s.wave}
        />
      ))}
    </div>
  )

  const gradId = `cm-cone-${useId().replace(/:/g, '')}`
  const half = (fovDeg * DEG) / 2
  const rc = R * 0.86
  const svgBox = `${-R} ${-R} ${D} ${D}`
  const conePath = `M0 0 L${rc * Math.sin(-half)} ${-rc * Math.cos(half)} A${rc} ${rc} 0 0 1 ${rc * Math.sin(half)} ${-rc * Math.cos(half)} Z`

  const center = portrait ? { x: W / 2, y: 112 + (R + 24) * 1.3 } : { x: 96 + R, y: 76 + R }
  const rootStyle = {
    '--ts': p.timeScale,
    '--R': `${R}px`,
    '--bg': bgOpacity,
    '--clampMs': `${CLAMP_FADE_MS}ms`,
  } as CSSProperties
  const toastTop = portrait ? center.y + (R + 190) * 1.3 : 56

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-orient={orient}
      data-flat={flat || undefined}
      data-portrait={portrait || undefined}
      data-paused={!p.playing || undefined}
      tabIndex={p.thumbnail ? -1 : 0}
      onKeyDown={onKeyDown}
      style={rootStyle}
      aria-label="원형 미니맵 무대 (클릭 후 Q·E 회전, 위아래 화살표 축척, M 방향 방식)"
    >
      <canvas ref={worldRef} className={s.world} width={W} height={H} />
      <div className={s.haze} aria-hidden />

      <div className={s.group} style={{ left: center.x, top: center.y, scale: portrait ? '1.3' : undefined }}>
        <div className={s.mm}>
          <div className={s.shadow} aria-hidden />
          <div ref={maskRef} className={s.mask} data-part="map-mask">
            <div ref={pivotRef} className={s.pivot}>
              <canvas ref={mapRef} className={s.map} width={D} height={D} />
              {!juice && iconLayer}
            </div>
            {/* 바깥 svg 의 크기가 0 이면 아예 그려지지 않는다 → 미니맵과 같은 크기 + 원 중심이 (0,0) 인 viewBox */}
            <svg className={s.cone} width={D} height={D} viewBox={svgBox} aria-hidden data-on={(juice && viewCone) || undefined}>
              <defs>
                <radialGradient id={gradId} cx="0" cy="0" r={rc} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
                  <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <g ref={coneRef}>
                <path d={conePath} fill={`url(#${gradId})`} />
                {/* 해설 번호 자리: 원뿔 축의 바깥쪽(0.68) — 테두리의 N 과 떨어뜨린다 */}
                <circle cx="0" cy={-rc * 0.68} r={Math.min(22, rc * 0.2)} fill="transparent" data-part="view-cone" />
                <path d={`M0 0 L${rc * Math.sin(-half)} ${-rc * Math.cos(half)} M0 0 L${rc * Math.sin(half)} ${-rc * Math.cos(half)}`} stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
              </g>
            </svg>
            {juice && iconLayer}
          </div>

          <svg className={s.ring} width={D} height={D} viewBox={svgBox} aria-hidden>
            <circle r={R + 1} fill="none" stroke="rgba(6,10,14,0.9)" strokeWidth="8" />
            <circle r={R - 2.5} fill="none" stroke="rgba(232,238,242,0.92)" strokeWidth="2.5" />
            <g ref={ticksRef}>
              {Array.from({ length: 24 }, (_, i) => {
                const a = i * 15 * DEG
                const major = i % 6 === 0
                const l = major ? 14 : 7
                return (
                  <line
                    key={i}
                    x1={Math.sin(a) * (R - 4)}
                    y1={-Math.cos(a) * (R - 4)}
                    x2={Math.sin(a) * (R - 4 - l)}
                    y2={-Math.cos(a) * (R - 4 - l)}
                    stroke={major ? 'rgba(240,244,248,0.9)' : 'rgba(240,244,248,0.45)'}
                    strokeWidth={major ? 3 : 2}
                  />
                )
              })}
            </g>
          </svg>

          <div ref={arrowRef} className={s.player} aria-hidden>
            <svg width="44" height="44" viewBox="-22 -22 44 44">
              <path d="M0 -17 L13 13 L0 6 L-13 13 Z" fill="#ffffff" stroke="#06222e" strokeWidth="3.5" strokeLinejoin="round" />
            </svg>
          </div>

          <div className={s.edge}>
            <div ref={primEdgeRef} className={s.edgeMark} data-tier="primary" data-on="false">
              <div className={s.hit} data-part="edge-marker" />
              <div ref={primWedgeRef} className={s.wedgeWrap}>
                <svg className={s.wedge} width="22" height="26" viewBox="-6 -13 22 26" aria-hidden>
                  <path d="M14 0 L-3 -11 L1 0 L-3 11 Z" fill={flat ? '#e8edf2' : COLORS.objective} stroke="#1d1405" strokeWidth="2.5" strokeLinejoin="round" />
                </svg>
              </div>
              {flat ? (
                pin()
              ) : (
                <svg className={s.shape} width="40" height="40" viewBox="-20 -20 40 40" aria-hidden>
                  <circle r="14" fill="rgba(13,17,10,0.75)" stroke="#1d1405" strokeWidth="8" />
                  <circle r="14" fill="none" stroke={COLORS.objective} strokeWidth="4" />
                  <circle r="5" fill={COLORS.objective} />
                </svg>
              )}
              <div ref={distRef} className={s.dist}>
                0 m
              </div>
            </div>
            {DRONE_PATROLS.map((_, i) => (
              <div
                key={i}
                ref={el => {
                  droneEdgeRefs.current[i] = el
                }}
                className={s.edgeMark}
                data-tier="danger"
                data-on="false"
              >
                <div
                  ref={el => {
                    droneWedgeRefs.current[i] = el
                  }}
                  className={s.wedgeWrap}
                >
                  <svg className={s.wedge} width="18" height="20" viewBox="-5 -10 18 20" aria-hidden>
                    <path d="M11 0 L-2 -8 L1 0 L-2 8 Z" fill={flat ? '#e8edf2' : COLORS.danger} stroke="#2a0e0c" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </div>
                {dangerIcon()}
              </div>
            ))}
          </div>

          <div ref={northRef} className={s.north}>
            <span data-part="north-indicator">N</span>
          </div>

          <div className={s.zoom} data-part="zoom-control">
            <button type="button" className={s.zoomBtn} onClick={() => setZoom(st.current.zoomTo + 0.3)} aria-label="확대">
              +
            </button>
            <span ref={zoomLabelRef} className={s.zoomVal}>
              ×{zoomParam.toFixed(1)}
            </span>
            <button type="button" className={s.zoomBtn} onClick={() => setZoom(st.current.zoomTo - 0.3)} aria-label="축소">
              −
            </button>
          </div>

          <div className={s.orient} data-part={orient !== 'none' ? 'orientation-setting' : undefined}>
            <KeyCap label="M" size={32} />
            <button type="button" className={s.seg} data-on={orient === 'rotate' || undefined} onClick={() => setOrient('rotate')}>
              회전형
            </button>
            <button type="button" className={s.seg} data-on={orient === 'north-up' || undefined} onClick={() => setOrient('north-up')}>
              북쪽 고정
            </button>
          </div>
        </div>

        <div className={s.info}>
          <div className={s.objRow}>
            <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden>
              <circle r="11" fill="none" stroke={COLORS.objective} strokeWidth="3.5" />
              <circle r="5" fill={COLORS.objective} />
            </svg>
            <span ref={objLabelRef}>{OBJECTIVES[st.current.active].label}</span>
          </div>
          <div className={s.headRow}>
            <span className={s.headKey}>방위</span>
            <span ref={headingRef} className={s.headVal}>
              000° 북
            </span>
          </div>
        </div>
      </div>

      {/* 미니맵 없음: 해설 1번(방향 방식)은 숨은 토글 대신 이 안내 칩에 붙는다 */}
      <div className={s.noneNote} data-portrait={portrait || undefined} data-part={orient === 'none' ? 'orientation-setting' : undefined}>
        <b>미니맵 없음</b>
        <span>바닥의 앰버 점열이 목표 방향만 알려 준다</span>
      </div>

      <div ref={toastRef} className={s.toast} style={{ top: toastTop }} role="status" />

      {!p.thumbnail && (
        <div className={s.hints}>
          <span>
            <KeyCap label="Q" size={34} />
            <KeyCap label="E" size={34} /> 회전
          </span>
          <span>
            <KeyCap label="↑" size={34} />
            <KeyCap label="↓" size={34} />
            <MouseGlyph button="wheel" size={34} /> 축척
          </span>
          <span>
            <KeyCap label="M" size={34} /> 방향 방식
          </span>
        </div>
      )}
    </div>
  )
}
