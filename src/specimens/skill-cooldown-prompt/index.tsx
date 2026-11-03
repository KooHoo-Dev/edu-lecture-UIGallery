import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { prefersReducedMotion, requestFlash } from '../../core/flash'
import { damp, useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { BindingGlyph, useLastInput } from '../../core/input'
import { num, str } from '../../core/params'
import { Silhouette } from '../../core/silhouettes'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { ClockIcon, DropIcon, EmptyPipsIcon, HasteIcon, SkillIcon } from './Icons'
import {
  baseDuration,
  computeLayout,
  ENERGY_GAIN,
  ENERGY_REGEN_PER_S,
  fmtSec,
  HASTE_MS,
  SLOT_IDS,
  SLOTS,
  timerText,
  type Dev,
  type Reason,
  type SlotDef,
  type SlotId,
  type Status,
} from './model'
import s from './style.module.css'

export { meta } from './meta'

const PRESS_S = 0.22
const DENY_S = 0.24
const POP_S = 0.18
const DEVICE_ORDER: Dev[] = ['keyboard', 'gamepad', 'touch']
const DEVICE_LABEL: Record<Dev, string> = { keyboard: '키보드 · 마우스', gamepad: '게임패드', touch: '터치' }
/** 패드 버튼 번호(표준 매핑) → 슬롯: 왼쪽 2 · 오른쪽 1 · 위 3 · 오른쪽 숄더 5 */
const PAD_MAP: [number, SlotId][] = [
  [2, 'primary'],
  [1, 'dash'],
  [3, 'utility'],
  [5, 'ult'],
]
/** 갤러리 조작 패널의 단축키 (Space · J · S · A · H · P · Esc · ← → · 숫자) — 게임 입력이 아니다 */
const PANEL_KEY = /^([1-9 ]|[jsahpJSAHP]|Escape|ArrowLeft|ArrowRight)$/
/** 패널 입력 직후 이 시간 안에 들어온 '마지막 입력' 변화는 그 패널 입력이 만든 것으로 보고 무시한다 */
const PANEL_GRACE_MS = 300

interface SlotSim {
  /** 남은 비율 1 → 0. 시간이 아니라 비율로 저장해서 가속 버프가 총 시간만 바꿔도 덮개가 튀지 않는다 */
  ratio: number
  charges: number
  pressT: number
  denyT: number
  denyReason: Reason | null
  popT: number
}

type Rec<T> = Record<SlotId, T>
const rec = <T,>(f: (id: SlotId) => T) => Object.fromEntries(SLOT_IDS.map(id => [id, f(id)])) as Rec<T>

interface UI {
  status: Rec<Status>
  charges: number
  cue: Rec<{ seq: number; kind: 'glint' | 'ring' }>
  deny: Rec<number>
  toast: { seq: number; reason: Reason; text: string } | null
  fx: { seq: number; slot: SlotId } | null
  gainSeq: number
  /** tags: 가속 시작 순간 쿨다운 중이던 슬롯의 '총 시간 변화' (한 줄 요약으로 칩에 표시) */
  haste: { seq: number; on: boolean; tags: Partial<Rec<string>> }
  /** 자동 데모·이벤트가 잠시 바꾼 장치. 무대에 실제 입력이 들어오면 null 로 돌아간다 */
  override: Dev | null
}

/* 자동 데모 — 사용 · 충전 소모 · 거부(충전 0 · 에너지 · 쿨다운) · 에너지 획득 · 가속 · 장치 전환이 순환한다 */
const SCRIPT = [
  'use-skill',
  'use-dash',
  'use-dash',
  'use-dash',
  'use-ult',
  'gain-energy',
  'use-ult',
  'use-utility',
  'device',
  'use-skill',
  'haste',
  'wait',
  'use-dash',
  'device',
  'wait',
  'use-skill',
  'use-ult',
  'use-dash',
  'wait',
  'device',
  'gain-energy',
  'wait',
] as const

export default function SkillCooldownPrompt(p: SpecimenProps) {
  const juice = p.juice
  const portrait = p.aspect === '9:16'
  const fillStyle = str(p.params, 'fillStyle', 'radial')
  const cooldownMs = num(p.params, 'cooldownMs', 8000)
  const numberMode = str(p.params, 'numberMode', 'smart')
  const numberMinMs = num(p.params, 'numberMinCooldownMs', 3000)
  const readyCue = str(p.params, 'readyCue', 'glint')
  const pulseHz = Math.min(2, num(p.params, 'pulseHz', 0))
  const paramDev = str(p.params, 'inputDevice', 'auto')
  const ultCost = num(p.params, 'ultCost', 40)
  const maxCharges = Math.round(num(p.params, 'dashCharges', 2))
  const hasteScale = num(p.params, 'hasteScale', 0.6)
  /** 움직임 줄이기: 흔들림·팝·이동·빛줄기 대신 테두리 강조와 정적인 고리 */
  const [reduced] = useState(() => prefersReducedMotion())

  /* ───── 시뮬레이션 (ref) ───── */
  const sim = useRef<{ slots: Rec<SlotSim>; energy: number; energyShown: number; hasteLeft: number; status: Rec<Status>; charges: number; pad: Rec<boolean> } | null>(null)
  if (!sim.current) {
    const slots = rec<SlotSim>(() => ({ ratio: 0, charges: 0, pressT: 0, denyT: 0, denyReason: null, popT: 0 }))
    // 첫 화면(썸네일)에서 모든 상태가 한 번에 보이게: 파동 준비 · 도약 충전 중 · 보호막 쿨다운 · 폭주 에너지 부족
    slots.dash.charges = Math.max(0, maxCharges - 1)
    slots.dash.ratio = 0.45
    slots.utility.ratio = 0.62
    sim.current = { slots, energy: 22, energyShown: 22, hasteLeft: 0, status: rec<Status>(() => 'ready'), charges: slots.dash.charges, pad: rec(() => false) }
  }
  const S = sim.current

  /** 충전형(횟수) 슬롯인가 — 2회 이상일 때만. 1회면 일반 쿨다운 슬롯과 같다 (Unity 와 같은 규칙) */
  const charged = (id: SlotId) => id === 'dash' && maxCharges >= 2

  const statusOf = (id: SlotId): Status => {
    const x = S.slots[id]
    if (charged(id)) return x.charges <= 0 ? 'empty' : 'ready'
    if (x.ratio > 0) return 'cooling'
    if (id === 'ult' && ultCost > 0 && S.energy < ultCost) return 'energy'
    return 'ready'
  }
  const effDuration = (id: SlotId) => baseDuration(id, cooldownMs) * (S.hasteLeft > 0 ? hasteScale : 1)

  const [ui, setUi] = useState<UI>(() => ({
    status: rec(statusOf),
    charges: S.slots.dash.charges,
    cue: rec(() => ({ seq: 0, kind: 'glint' as const })),
    deny: rec(() => 0),
    toast: null,
    fx: null,
    gainSeq: 0,
    haste: { seq: 0, on: false, tags: {} },
    override: null,
  }))
  const uiRef = useRef(ui)
  uiRef.current = ui
  useLayoutEffect(() => {
    S.status = { ...ui.status }
  }, [])

  /* ───── 입력 장치: 이벤트·데모 덮어쓰기 > 강제값 > 무대에 들어온 마지막 실제 입력 ─────
     조절 패널(이벤트 버튼 · 단축키)을 누른 입력은 '게임 입력'이 아니므로 장치 판정과 덮어쓰기 해제에서 뺀다.
     그러지 않으면 '입력 장치 바꾸기' 버튼을 누르는 마우스 입력이 방금 바꾼 장치를 곧바로 되돌린다. */
  const rootRef = useRef<HTMLDivElement>(null)
  const panelInputAt = useRef(-1e9)
  useEffect(() => {
    if (p.thumbnail) return
    const mark = (e: Event) => {
      const t = e.target
      if (t instanceof Node && rootRef.current?.contains(t)) return
      const formField = t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement
      if (e.type === 'keydown' && !formField && !PANEL_KEY.test((e as Event & { key: string }).key)) return
      panelInputAt.current = performance.now()
    }
    // 캡처 단계 — useLastInput 의 리스너보다 먼저 표시해 둔다
    addEventListener('pointerdown', mark, true)
    addEventListener('keydown', mark, true) // 입력 장치 표시만 — 키를 먹지 않음
    return () => {
      removeEventListener('pointerdown', mark, true)
      removeEventListener('keydown', mark, true)
    }
  }, [p.thumbnail])

  const last = useLastInput(p.thumbnail ? 'keyboard' : 'auto')
  const [realDev, setRealDev] = useState<Dev | null>(null)
  const firstSeq = useRef(last.seq)
  useEffect(() => {
    if (last.seq === firstSeq.current) return
    if (performance.now() - panelInputAt.current < PANEL_GRACE_MS) return
    setRealDev(last.device === 'gamepad' ? 'gamepad' : last.device === 'touch' ? 'touch' : 'keyboard')
    if (paramDev === 'auto') setUi(u => (u.override ? { ...u, override: null } : u))
  }, [last.seq])
  const firstParam = useRef(true)
  useEffect(() => {
    if (firstParam.current) {
      firstParam.current = false
      return
    }
    setUi(u => ({ ...u, override: null }))
  }, [paramDev])
  // 실제 입력이 아직 없으면: 세로(휴대폰)는 터치, 가로는 키보드
  const baseDev: Dev = paramDev !== 'auto' ? (paramDev as Dev) : (realDev ?? (portrait ? 'touch' : 'keyboard'))
  const baseDevRef = useRef(baseDev)
  baseDevRef.current = baseDev
  const target: Dev = ui.override ?? baseDev
  // 디바운스: 한 번 바뀌면 250ms 동안은 다시 바꾸지 않는다 (스틱 잡음으로 안내가 깜빡이지 않게)
  const [device, setDevice] = useState<Dev>(target)
  const lastSwitch = useRef(0)
  useEffect(() => {
    if (target === device) return
    const apply = () => {
      lastSwitch.current = performance.now()
      setDevice(target)
    }
    const wait = 250 - (performance.now() - lastSwitch.current)
    if (wait <= 0) {
      apply()
      return
    }
    const t = window.setTimeout(apply, wait)
    return () => clearTimeout(t)
  }, [target, device])
  const touch = device === 'touch'
  /** 나쁜 예: 장치와 상관없이 키보드 글자 고정 */
  const glyphDev: Dev = juice ? device : 'keyboard'
  const L = computeLayout(portrait, touch, juice)

  /* ───── 동작 ───── */
  const patch = (fn: (u: UI) => Partial<UI>) => setUi(u => ({ ...u, ...fn(u) }))

  /** 매 프레임 상태를 비교해 바뀐 것만 React 로 올린다 (준비 완료 순간 → 신호 1회) */
  const sync = () => {
    const next = rec(statusOf)
    const charges = S.slots.dash.charges
    const changed = SLOT_IDS.filter(id => next[id] !== S.status[id])
    if (!changed.length && charges === S.charges) return
    const cueIds = changed.filter(id => next[id] === 'ready' && juice && readyCue !== 'none')
    S.status = next
    S.charges = charges
    if (!reduced) for (const id of cueIds) S.slots[id].popT = POP_S
    // 빛줄기·고리는 번쩍임 제한기를 통과할 때만 (여러 슬롯이 한꺼번에 준비돼도 초당 3회 이하)
    const allowed = cueIds.filter(() => requestFlash())
    // 움직임 줄이기: 지나가는 빛줄기 대신 제자리에서 사라지는 고리
    const kind = readyCue === 'ring' || reduced ? 'ring' : 'glint'
    patch(u => ({
      status: next,
      charges,
      cue: allowed.length ? { ...u.cue, ...Object.fromEntries(allowed.map(id => [id, { seq: u.cue[id].seq + 1, kind }])) } : u.cue,
    }))
  }

  const deny = (id: SlotId, reason: Reason) => {
    if (!juice) return // 나쁜 예: 거부된 입력에 아무 반응 없음
    const x = S.slots[id]
    x.denyT = DENY_S
    x.denyReason = reason
    const def = SLOTS.find(d => d.id === id)!
    const text =
      reason === 'cooldown'
        ? `${def.name} · 재사용 대기 ${fmtSec(Math.max(100, Math.ceil((x.ratio * effDuration(id)) / 100) * 100))}초`
        : reason === 'energy'
          ? `${def.name} · 에너지 부족 — ${Math.ceil(ultCost - S.energy)} 더 필요`
          : `${def.name} · 충전 없음 — 다음 충전 ${fmtSec(Math.max(100, Math.ceil((x.ratio * effDuration(id)) / 100) * 100))}초`
    patch(u => ({ deny: { ...u.deny, [id]: u.deny[id] + 1 }, toast: { seq: (u.toast?.seq ?? 0) + 1, reason, text } }))
  }

  const use = (id: SlotId) => {
    const x = S.slots[id]
    const st = statusOf(id)
    if (st !== 'ready') {
      deny(id, st === 'cooling' ? 'cooldown' : st)
      return
    }
    if (charged(id)) {
      x.charges--
      if (x.ratio <= 0) x.ratio = 1
    } else x.ratio = 1
    if (id === 'ult' && ultCost > 0) S.energy = Math.max(0, S.energy - ultCost)
    if (juice) x.pressT = PRESS_S
    if (!juice) S.energyShown = S.energy
    patch(u => ({ fx: { seq: (u.fx?.seq ?? 0) + 1, slot: id } }))
    sync()
  }

  const gainEnergy = () => {
    S.energy = Math.min(100, S.energy + ENERGY_GAIN)
    if (!juice) S.energyShown = S.energy
    patch(u => ({ gainSeq: u.gainSeq + 1 }))
    sync()
  }

  const haste = () => {
    const on = S.hasteLeft > 0
    S.hasteLeft = HASTE_MS
    if (on) {
      patch(u => ({ haste: { ...u.haste, seq: u.haste.seq + 1 } }))
      return
    }
    // 남은 '비율'은 그대로 — 총 시간만 줄어든다. 덮개 위치는 변하지 않고 걷히는 속도만 빨라진다
    const tags: Partial<Rec<string>> = {}
    for (const id of SLOT_IDS) {
      if (S.slots[id].ratio > 0) tags[id] = `${fmtSec(baseDuration(id, cooldownMs))} → ${fmtSec(baseDuration(id, cooldownMs) * hasteScale)}초`
    }
    patch(u => ({ haste: { seq: u.haste.seq + 1, on: true, tags } }))
  }

  /** 지금 보이는(목표) 장치에서 다음 장치로: 키보드 → 게임패드 → 터치 → 키보드 */
  const switchDevice = () =>
    patch(u => {
      const cur = u.override ?? baseDevRef.current
      return { override: DEVICE_ORDER[(DEVICE_ORDER.indexOf(cur) + 1) % DEVICE_ORDER.length] }
    })

  const handle = (id: string) => {
    if (id === 'use-skill') use('primary')
    else if (id === 'use-dash') use('dash')
    else if (id === 'use-ult') use('ult')
    else if (id === 'gain-energy') gainEnergy()
    else if (id === 'haste') haste()
    else if (id === 'switch-device') switchDevice()
  }
  useTrigger(p.trigger, handle)

  const step = useRef(0)
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    1.25,
    () => {
      const a = SCRIPT[step.current % SCRIPT.length]
      step.current++
      if (a === 'use-utility') use('utility')
      else if (a === 'device') {
        // 장치를 강제로 고른 경우(프리셋 등)에는 자동 데모가 장치를 바꾸지 않는다
        if (paramDev === 'auto') switchDevice()
      } else if (a !== 'wait') handle(a)
    },
    p.trigger?.seq,
  )

  /* ───── 프레임 갱신 (ref + DOM 직접) ───── */
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const bind = (k: string) => (el: HTMLElement | null) => {
    refs.current[k] = el
  }
  const lastText = useRef<Record<string, string>>({})

  useGameLoop(p.playing, p.timeScale, dt => {
    const dtMs = dt * 1000
    S.energy = Math.min(100, S.energy + ENERGY_REGEN_PER_S * dt)
    S.energyShown = juice ? damp(S.energyShown, S.energy, 10, dt) : S.energy
    if (S.hasteLeft > 0) {
      S.hasteLeft -= dtMs
      if (S.hasteLeft <= 0) {
        S.hasteLeft = 0
        patch(u => ({ haste: { ...u.haste, on: false, tags: {} } }))
      }
    }
    const dash = S.slots.dash
    if (maxCharges >= 2) {
      if (dash.charges > maxCharges) dash.charges = maxCharges
      if (dash.charges < maxCharges && dash.ratio <= 0) dash.ratio = 1
      if (dash.charges >= maxCharges) dash.ratio = 0
    }
    for (const id of SLOT_IDS) {
      const x = S.slots[id]
      if (x.ratio > 0) {
        // linear — 남은 비율과 화면이 어긋나지 않게
        x.ratio -= dtMs / effDuration(id)
        if (x.ratio <= 0) {
          x.ratio = 0
          if (charged(id)) {
            x.charges = Math.min(maxCharges, x.charges + 1)
            if (x.charges < maxCharges) x.ratio = 1
          }
        }
      }
      x.pressT = Math.max(0, x.pressT - dt)
      x.denyT = Math.max(0, x.denyT - dt)
      x.popT = Math.max(0, x.popT - dt)
    }
    pollPad()
    sync()
    paint()
  })

  const pollPad = () => {
    if (p.thumbnail || typeof navigator.getGamepads !== 'function') return
    const pads = navigator.getGamepads()
    for (const [btn, id] of PAD_MAP) {
      let down = false
      for (const gp of pads) if (gp?.buttons[btn]?.pressed) down = true
      if (down && !S.pad[id]) use(id)
      S.pad[id] = down
    }
  }

  const paint = () => {
    for (const id of SLOT_IDS) {
      const x = S.slots[id]
      const coverR = charged(id) ? (x.charges <= 0 ? x.ratio : 0) : x.ratio
      const clip = refs.current[`${id}:clip`]
      if (clip) {
        clip.style.setProperty('--r', coverR.toFixed(4))
        clip.style.setProperty('--edge', coverR > 0.002 && coverR < 0.998 ? '1' : '0')
      }
      const ring = refs.current[`${id}:ring`]
      if (ring) ring.style.setProperty('--p', (1 - x.ratio).toFixed(4))
      // 숫자: 표시값이 바뀔 때만 텍스트를 다시 쓴다
      const timer = refs.current[`${id}:timer`]
      if (timer) {
        const remain = charged(id) && x.charges > 0 ? 0 : x.ratio * effDuration(id)
        // 숨김 판정은 '기본' 총 시간으로 — 가속 버프를 받아도 쿨다운 도중 숫자가 사라지지 않는다
        const t = timerText(remain, baseDuration(id, cooldownMs), numberMode, numberMinMs, juice)
        if (lastText.current[id] !== t.text) {
          lastText.current[id] = t.text
          timer.textContent = t.text
          timer.toggleAttribute('data-final', t.final)
        }
      }
      const body = refs.current[`${id}:body`]
      if (body) {
        let sc = 1
        if (x.pressT > 0) {
          const u = 1 - x.pressT / PRESS_S
          sc = u < 0.36 ? 1 - 0.08 * (u / 0.36) : 0.92 + 0.08 * ((u - 0.36) / 0.64)
        }
        if (x.popT > 0) sc *= 1 + 0.08 * Math.sin(Math.PI * (1 - x.popT / POP_S))
        const k = x.denyT / DENY_S
        // 움직임 줄이기: 흔들지 않고 테두리 강조(denyMark)와 이유 표시만
        const dx = x.denyT > 0 && !reduced ? Math.sin((DENY_S - x.denyT) * Math.PI * 2 * 14) * 6 * k : 0
        body.style.transform = sc !== 1 || dx !== 0 ? `translateX(${dx.toFixed(2)}px) scale(${sc.toFixed(4)})` : ''
      }
      const outer = refs.current[`${id}:outer`]
      if (outer) {
        const hot = x.denyT > 0 && x.denyReason ? x.denyReason : ''
        if (outer.dataset.hot !== hot) {
          if (hot) outer.dataset.hot = hot
          else delete outer.dataset.hot
        }
      }
    }
    const fill = refs.current['energy:fill']
    if (fill) fill.style.width = `${S.energyShown.toFixed(2)}%`
    const en = refs.current['energy:num']
    if (en) {
      const v = String(Math.floor(S.energy))
      if (lastText.current.energy !== v) {
        lastText.current.energy = v
        en.textContent = v
      }
    }
    const hb = refs.current['haste:bar']
    if (hb) hb.style.width = `${(S.hasteLeft / HASTE_MS) * 100}%`
  }
  useLayoutEffect(() => paint())

  /* ───── 키보드: 무대에 포커스가 있을 때만 (갤러리 단축키와 겹치지 않는 Q · Shift · E · R) ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const id: SlotId | null = k === 'q' ? 'primary' : k === 'Shift' ? 'dash' : k === 'e' ? 'utility' : k === 'r' ? 'ult' : null
    if (!id) return
    if (e.repeat) return true // 길게 눌러도 한 번만 쓴다 — 반복 키는 먹기만 한다
    // 이 키 입력은 전역으로 퍼지지 않으므로(useLastInput 이 못 본다) 직접 '키보드'로 표시한다
    if (paramDev === 'auto') {
      setRealDev('keyboard')
      patch(u => (u.override ? { override: null } : {}))
    }
    use(id)
    return true
  })

  /* ───── 그리기 ───── */
  const glyphSize = portrait ? 58 : 52
  const glyph = (d: SlotDef) => <BindingGlyph binding={glyphDev === 'gamepad' ? d.pad : { kind: 'key', key: d.key }} size={glyphSize} />

  const ultStatus = ui.status.ult
  const fx = ui.fx
  const hero = L.hero

  // 엄지 영역 글자 위치 (우하단 모서리에서 본 각도 · 반지름) — 버튼·스틱·에너지 바와 겹치지 않는 자리
  const farDeg = ((portrait ? 32 : 20) * Math.PI) / 180
  const nearDeg = ((portrait ? 10 : 4) * Math.PI) / 180
  const farR = L.thumb ? (L.thumb.r1 + L.thumb.r2) / 2 : 0
  const nearR = L.thumb ? L.thumb.r1 - 40 : 0
  const rootStyle = { '--ts': p.timeScale, '--hz': pulseHz || 1 } as CSSProperties
  const hasteSummary = SLOTS.filter(d => ui.haste.tags[d.id])
    .map(d => `${d.name} ${ui.haste.tags[d.id]}`)
    .join(' · ')

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-juice={juice || undefined}
      data-reduced={reduced || undefined}
      data-paused={!p.playing || undefined}
      data-layout={L.mode}
      data-portrait={portrait || undefined}
      data-device={device}
      data-fill={juice ? fillStyle : 'binary'}
      data-pulse={(juice && pulseHz > 0) || undefined}
      style={rootStyle}
      tabIndex={p.thumbnail ? -1 : 0}
      onKeyDown={onKeyDown}
      aria-label="스킬 바 (무대를 클릭한 뒤 Q · Shift · E · R 로 사용)"
    >
      {/* 세계: 하린과 잔해 드론, 스킬 효과 */}
      <svg className={s.world} viewBox={`0 0 ${p.width} ${p.height}`} aria-hidden>
        {L.drones.map((d, i) => (
          <Silhouette key={i} role="enemy" x={d.x} y={d.y} height={d.h} />
        ))}
        <Silhouette role="ally" x={hero.x} y={hero.y} height={hero.h} />
        <text x={hero.x} y={hero.y - hero.h - 22} className={s.heroName} textAnchor="middle">
          하린
        </text>
        {fx && !p.thumbnail && <SkillFx key={fx.seq} slot={fx.slot} x={hero.x} y={hero.y - hero.h * 0.5} h={hero.h} />}
      </svg>

      {/* 엄지 도달 범위 (터치 부채꼴에서만) */}
      {L.thumb && touch && (
        <svg className={s.thumb} viewBox={`0 0 ${p.width} ${p.height}`} aria-hidden>
          <circle cx={L.thumb.cx} cy={L.thumb.cy} r={L.thumb.r2} className={s.thumbFar} />
          <circle cx={L.thumb.cx} cy={L.thumb.cy} r={L.thumb.r1} className={s.thumbNear} />
          <text x={L.thumb.cx - farR * Math.cos(farDeg)} y={L.thumb.cy - farR * Math.sin(farDeg)} className={s.thumbLabel} textAnchor="middle">
            손을 뻗어야 닿는 곳
          </text>
          <text x={L.thumb.cx - nearR * Math.cos(nearDeg)} y={L.thumb.cy - nearR * Math.sin(nearDeg)} className={s.thumbLabel} data-near textAnchor="middle">
            엄지가 편한 곳
          </text>
        </svg>
      )}
      {L.stick && (
        <div className={s.stick} style={{ left: L.stick.x - L.stick.r, top: L.stick.y - L.stick.r, width: L.stick.r * 2, height: L.stick.r * 2 }} aria-hidden>
          <i />
        </div>
      )}

      {/* 상단: 임무 · 입력 장치 */}
      <div className={s.objective}>
        <span className={s.objTag}>임무</span>
        <b>북쪽 통신탑 복구</b>
        <span className={s.objSub}>잔해 드론 처치 2 / 5</span>
      </div>
      <div className={s.deviceChip}>
        <span>
          입력 장치 <b>{DEVICE_LABEL[device]}</b>
        </span>
        {L.mode === 'fan' && juice && <em>{portrait ? '휴대폰 세로 배치' : '태블릿 가로 배치'}</em>}
        {!juice && device !== 'keyboard' && <em data-bad>안내는 키보드 글자 그대로</em>}
      </div>

      {/* 에너지 바 + 궁극기 비용 눈금 */}
      <div className={s.energy} style={{ left: L.energy.x, top: L.energy.y, width: L.energy.w }}>
        <span className={s.haste} data-on={ui.haste.on || undefined}>
          <span className={s.hasteHead}>
            <HasteIcon className={s.hasteIcon} />
            쿨다운 가속 · 총 시간 ×{hasteScale.toFixed(2).replace(/0$/, '')}
            <i>
              <i ref={bind('haste:bar')} />
            </i>
          </span>
          {/* 슬롯마다 따로 붙이면 서로 겹치고 해설 번호에 가린다 → 한 줄 요약. 남은 비율은 그대로 */}
          <span className={s.hasteDetail}>{hasteSummary || '쿨다운 중인 슬롯 없음'}</span>
        </span>
        <div className={s.energyHead}>
          <DropIcon className={s.energyIcon} />
          <span className={s.energyLabel}>에너지</span>
          <b ref={bind('energy:num')} className={s.energyNum}>
            {Math.floor(S.energy)}
          </b>
        </div>
        <div className={s.energyBar}>
          <div ref={bind('energy:fill')} className={s.energyFill} style={{ width: `${S.energyShown}%` }} />
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} className={s.energyTick} style={{ left: `${(i + 1) * 10}%` }} />
          ))}
          {ultCost > 0 && (
            <div className={s.costMark} data-hot={(juice && ultStatus === 'energy') || undefined} style={{ left: `${ultCost}%` }}>
              <span>
                <SkillIcon id="ult" className={s.costIcon} />
                폭주 {ultCost}
              </span>
            </div>
          )}
          {ui.gainSeq > 0 && (
            <span key={ui.gainSeq} className={s.gainPop}>
              +{ENERGY_GAIN}
            </span>
          )}
        </div>
      </div>

      {/* 거부 안내: 이유마다 다른 기호 */}
      {ui.toast && (
        <div key={ui.toast.seq} className={s.toast} data-reason={ui.toast.reason} style={{ left: L.toast.x, top: L.toast.y }} role="status">
          {ui.toast.reason === 'cooldown' ? <ClockIcon className={s.toastIcon} /> : ui.toast.reason === 'energy' ? <DropIcon className={s.toastIcon} /> : <EmptyPipsIcon className={s.toastIcon} />}
          {ui.toast.text}
        </div>
      )}

      {/* 스킬 슬롯 */}
      {SLOTS.map(d => {
        const b = L.slots[d.id]
        const st = ui.status[d.id]
        const charging = charged(d.id) && ui.charges > 0 && ui.charges < maxCharges
        const cue = ui.cue[d.id]
        // 해설 5: 키보드·패드면 도약의 버튼 안내, 터치면 안내 대신 '버튼이 된 슬롯' (엄지 바로 위의 큰 기본 버튼)
        const promptPart = !touch && d.id === 'dash' ? 'input-prompt' : undefined
        const touchPart = touch && d.id === 'primary' ? 'input-prompt' : undefined
        return (
          <div
            key={d.id}
            ref={bind(`${d.id}:outer`)}
            className={s.slot}
            data-id={d.id}
            data-status={st}
            data-round={b.round || undefined}
            data-charging={(juice && charging) || undefined}
            data-part={touchPart}
            style={{ left: b.x - b.size / 2, top: b.y - b.size / 2, width: b.size, height: b.size, '--sz': b.size } as CSSProperties}
            onPointerDown={() => use(d.id)}
          >
            <div className={s.chargeRing} ref={bind(`${d.id}:ring`)} aria-hidden />
            <div className={s.glow} aria-hidden />
            <div className={s.body} ref={bind(`${d.id}:body`)}>
              <div className={s.frame} />
              <div className={s.clip} ref={bind(`${d.id}:clip`)} data-part={d.id === 'utility' ? 'sweep' : d.id === 'primary' ? 'ready-glint' : undefined}>
                <SkillIcon id={d.id} className={s.icon} />
                <div className={s.coverR} />
                <div className={s.coverV} />
                <div className={s.coverB} />
                {cue.seq > 0 && cue.kind === 'glint' && <span key={cue.seq} className={s.glint} aria-hidden />}
              </div>
              {d.id === 'ult' && (
                <div className={s.lock} data-part="block-reason">
                  <DropIcon className={s.lockIcon} />
                  {ultCost}
                </div>
              )}
              <span className={s.timer} ref={bind(`${d.id}:timer`)} data-part={d.id === 'utility' ? 'timer' : undefined} />
            </div>
            {cue.seq > 0 && cue.kind === 'ring' && <span key={cue.seq} className={s.readyRing} aria-hidden />}
            {ui.deny[d.id] > 0 && <span key={ui.deny[d.id]} className={s.denyMark} aria-hidden />}
            <div className={s.prompt} data-part={promptPart}>
              <span key={glyphDev} className={s.promptIn}>
                {glyph(d)}
              </span>
            </div>
            {/* 가속 버프를 받은 슬롯 표시 — 글자는 에너지 바 옆 칩에 한 줄로 모았다 */}
            {ui.haste.on && ui.haste.tags[d.id] && (
              <span key={ui.haste.seq} className={s.hasteBadge} aria-label={`${d.name} 가속 중`}>
                <HasteIcon className={s.hasteBadgeIcon} />
              </span>
            )}
            <div className={s.below}>
              <span className={s.pips} aria-label={charged(d.id) ? `충전 ${ui.charges} / ${maxCharges}` : undefined}>
                {charged(d.id) &&
                  Array.from({ length: maxCharges }, (_, i) => <i key={i < ui.charges ? `f${i}-${ui.charges}` : `e${i}`} data-empty={i >= ui.charges || undefined} />)}
              </span>
              <span className={s.name}>{d.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 스킬을 쓰면 세계 쪽에서도 반응 — 입력이 받아들여졌다는 두 번째 확인 */
function SkillFx({ slot, x, y, h }: { slot: SlotId; x: number; y: number; h: number }) {
  if (slot === 'primary')
    return (
      <g className={s.fxWave} transform={`translate(${x} ${y})`}>
        {[0, 1, 2].map(i => (
          <path key={i} d={`M${40 + i * 34} ${-60 - i * 22} A${80 + i * 40} ${80 + i * 40} 0 0 1 ${40 + i * 34} ${60 + i * 22}`} style={{ animationDelay: `calc(${i * 70}ms / var(--ts, 1))` }} />
        ))}
      </g>
    )
  if (slot === 'dash')
    return (
      <g className={s.fxDash} transform={`translate(${x} ${y})`}>
        {[0, 1, 2].map(i => (
          <path key={i} d={`M${-70 - i * 46} -40 L${-40 - i * 46} 0 L${-70 - i * 46} 40`} style={{ animationDelay: `calc(${i * 50}ms / var(--ts, 1))` }} />
        ))}
      </g>
    )
  if (slot === 'utility')
    return (
      <g className={s.fxShield} transform={`translate(${x} ${y})`}>
        <path d={`M0 ${-h * 0.72} L${h * 0.62} ${-h * 0.36} V${h * 0.36} L0 ${h * 0.72} L${-h * 0.62} ${h * 0.36} V${-h * 0.36} Z`} />
      </g>
    )
  return (
    <g className={s.fxUlt} transform={`translate(${x} ${y})`}>
      <path d="M0 -150 L22 -40 L106 -106 L40 -22 L150 0 L40 22 L106 106 L22 40 L0 150 L-22 40 L-106 106 L-40 22 L-150 0 L-40 -22 L-106 -106 L-22 -40 Z" />
    </g>
  )
}
