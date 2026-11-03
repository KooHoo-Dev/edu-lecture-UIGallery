import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { requestFlash } from '../../core/flash'
import { useAutoplay, useGameLoop, useTrigger } from '../../core/hooks'
import { KeyCap, PadButton, Shoulder, useLastInputDevice, type Device as InputDevice } from '../../core/input'
import { str } from '../../core/params'
import { stageKeyDown } from '../../core/stageKeys'
import type { SpecimenProps } from '../../core/types'
import { hintsFor, PresetIcon } from './Glyphs'
import {
  changedKeys,
  DEFAULTS,
  fromParams,
  IN_PRESETS,
  OPTIONS,
  optsOf,
  PARAM_KEYS,
  stepValue,
  TABS,
  valueLabel,
  type Device,
  type OptDef,
  type OptKey,
  type Settings,
  type TabId,
} from './model'
import { Preview, PV_H, PV_W, TARGET_LABEL } from './Preview'
import s from './style.module.css'

export { meta } from './meta'

interface UI {
  set: Settings
  tab: TabId
  row: number
  origin: { preset: string | null; modified: boolean }
  /** 자동 데모가 잠시 보여 주는 장치. 실제 입력이 들어오면 null 로 돌아가 마지막 입력 장치를 따른다 */
  demoDevice: Device | null
  /** 복원 확인 창: 0 현재 탭만 · 1 전체 · 2 취소 */
  dialog: null | { focus: 0 | 1 | 2 }
  line: number
  lineSeq: number
  hitSeq: number
  /** 피격 테두리 재생 번호 (번쩍임 제한기를 통과했을 때만 증가) */
  ringSeq: number
  flash: { seq: number; keys: OptKey[] }
  quickSeq: number
  lastHc: string
  toast: { seq: number; text: string; tone?: 'bad' }
  tabSeq: number
  /** 나쁜 예: 팝업 드롭다운이 열린 행 */
  drop: { seq: number; key: OptKey | null }
}

const initUI = (set: Settings): UI => ({
  set,
  tab: 'subtitle',
  row: 0,
  origin: { preset: null, modified: false },
  // 아직 아무 입력도 없을 때(썸네일·첫 화면)는 패드 안내부터 보여 준다
  demoDevice: 'pad',
  dialog: null,
  line: 0,
  lineSeq: 0,
  hitSeq: 0,
  ringSeq: 0,
  flash: { seq: 0, keys: [] },
  quickSeq: 0,
  lastHc: 'role-outline',
  toast: { seq: 0, text: '' },
  tabSeq: 0,
  drop: { seq: 0, key: null },
})

const DEVICE_LABEL: Record<Device, string> = { pad: '게임패드', kbm: '키보드·마우스', touch: '터치' }
/** 공통 훅(useLastInputDevice)의 장치 → 이 메뉴의 안내 묶음 */
const toMenuDevice = (d: InputDevice): Device => (d === 'gamepad' ? 'pad' : d === 'touch' ? 'touch' : 'kbm')

/* 자동 데모 대본 — 사람이 없어도 프리셋 → 개별 수정 → 미리보기 테스트 → 복원이 순환한다 */
const SCRIPT = [
  'dialogue',
  'down',
  'down',
  'right',
  'preset',
  'dialogue',
  'tab+',
  'right',
  'quick',
  'quick',
  'tab+',
  'hit',
  'touch',
  'dialogue',
  'pad',
  'reset',
  'dlgLeft',
  'confirm',
  'home',
] as const

/**
 * 설정·접근성 메뉴 — 카테고리 탭 + 유형별 프리셋 + 즉시 미리보기 + 변경 표시 + 복원 범위 확인.
 * 갤러리 조절 패널의 값 = 저장된 설정 데이터. 무대 안에서 바꾼 값은 그 위에 덮어쓴다.
 */
export default function SettingsAccessibility(p: SpecimenProps) {
  const menuLayout = str(p.params, 'menuLayout', 'split-tabs')
  const touchLayout = p.aspect === '9:16' || menuLayout === 'single-list-touch'
  const portrait = p.aspect === '9:16'
  const juice = p.juice

  const [ui, setUi] = useState<UI>(() => initUI(fromParams(p.params, DEFAULTS)))
  const uiRef = useRef(ui)
  uiRef.current = ui

  // 갤러리 조절 패널 값이 바뀌면 = 저장된 설정이 바뀜 → 메뉴 상태를 다시 맞춘다
  const paramKey = PARAM_KEYS.map(k => String(p.params[k])).join('|')
  const firstSync = useRef(true)
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false
      return
    }
    setUi(u => ({ ...u, set: fromParams(p.params, u.set), origin: { preset: null, modified: false } }))
  }, [paramKey])

  // 마지막 입력 장치 (키보드·마우스·게임패드·터치) — 갤러리 공통 훅. 썸네일은 리스너 없이 패드로 고정
  const lastInput = useLastInputDevice(p.thumbnail ? 'gamepad' : 'auto')
  const firstInput = useRef(true)
  useEffect(() => {
    if (firstInput.current) {
      firstInput.current = false
      return
    }
    // 실제 입력이 들어오면 자동 데모의 장치 덮어쓰기를 푼다 → 패드를 누르면 패드 안내로 돌아온다
    setUi(u => (u.demoDevice ? { ...u, demoDevice: null } : u))
  }, [lastInput])
  // 터치 배치는 항상 터치 안내, 그 밖에는 자동 데모 단계 > 마지막 입력 장치
  const device: Device = touchLayout ? 'touch' : (ui.demoDevice ?? toMenuDevice(lastInput))

  /* ───── 동작 ───── */
  const patch = (fn: (u: UI) => Partial<UI>) => setUi(u => ({ ...u, ...fn(u) }))
  const opts = optsOf(ui.tab)
  const curOpt: OptDef = opts[Math.min(ui.row, opts.length - 1)]

  const setValue = (key: OptKey, v: Settings[OptKey]) =>
    patch(u => ({
      set: { ...u.set, [key]: v },
      origin: u.origin.preset ? { ...u.origin, modified: true } : u.origin,
    }))
  const moveRow = (dir: 1 | -1) =>
    patch(u => {
      const n = optsOf(u.tab).length
      return { row: Math.max(0, Math.min(n - 1, u.row + dir)) }
    })
  const changeTab = (dir: 1 | -1) =>
    patch(u => {
      const i = TABS.findIndex(t => t.id === u.tab)
      return { tab: TABS[(i + dir + TABS.length) % TABS.length].id, row: 0, tabSeq: u.tabSeq + 1 }
    })
  const gotoTab = (tab: TabId, row = 0) => patch(u => ({ tab, row, tabSeq: u.tab === tab ? u.tabSeq : u.tabSeq + 1 }))
  const changeValue = (dir: 1 | -1, key?: OptKey) => {
    const u = uiRef.current
    const o = key ? OPTIONS.find(x => x.key === key)! : curOpt
    setValue(o.key, stepValue(o, u.set[o.key], dir))
  }
  const applyPreset = (id: string) => {
    const pr = IN_PRESETS.find(x => x.id === id)!
    patch(u => {
      const next = { ...u.set, ...pr.values }
      if (!juice) return { set: next }
      return {
        set: next,
        origin: { preset: id, modified: false },
        flash: { seq: u.flash.seq + 1, keys: Object.keys(pr.values) as OptKey[] },
      }
    })
  }
  const quick = () => {
    if (!juice) {
      patch(u => ({ toast: { seq: u.toast.seq + 1, text: '빠른 전환 없음 — 옵션 목록에서 찾아 바꿔야 한다', tone: 'bad' } }))
      return
    }
    patch(u => {
      const on = u.set.highContrast === 'off'
      const hc = on ? u.lastHc : 'off'
      return {
        set: { ...u.set, highContrast: hc },
        lastHc: on ? u.lastHc : u.set.highContrast,
        quickSeq: u.quickSeq + 1,
        origin: u.origin.preset ? { ...u.origin, modified: true } : u.origin,
        toast: { seq: u.toast.seq + 1, text: on ? `고대비 켬 · ${valueLabel(OPTIONS.find(o => o.key === 'highContrast')!, hc)}` : '고대비 끔' },
      }
    })
  }
  const dialogue = () => patch(u => ({ line: u.line + 1, lineSeq: u.lineSeq + 1 }))
  const shake = useRef({ t: 0, amp: 0, time: 0 })
  const hit = () => {
    const u = uiRef.current
    shake.current.t = 0.3
    shake.current.amp = juice ? u.set.cameraShake * 2 : 26
    // 빨간 테두리는 미리보기 가장자리 전체가 번쩍이는 효과 → 제한기가 허락할 때만 새로 재생 (연타해도 초당 3회 이하)
    const ring = requestFlash()
    patch(x => ({ hitSeq: x.hitSeq + 1, ringSeq: ring ? x.ringSeq + 1 : x.ringSeq }))
  }
  const resetAll = () => patch(u => ({ set: { ...DEFAULTS }, origin: { preset: null, modified: false }, dialog: null, flash: { seq: u.flash.seq + 1, keys: changedKeys(u.set) } }))
  const resetTab = () =>
    patch(u => {
      const keys = optsOf(u.tab).map(o => o.key)
      const next = { ...u.set }
      keys.forEach(k => ((next as Record<OptKey, unknown>)[k] = DEFAULTS[k]))
      const changed = keys.filter(k => u.set[k] !== DEFAULTS[k])
      const origin = changedKeys(next).length === 0 ? { preset: null, modified: false } : u.origin.preset ? { ...u.origin, modified: true } : u.origin
      return { set: next, origin, dialog: null, flash: { seq: u.flash.seq + 1, keys: changed } }
    })
  const openReset = () => {
    if (!juice) {
      // 나쁜 예: 확인 없이 즉시 전체 초기화
      patch(u => ({ set: { ...DEFAULTS }, toast: { seq: u.toast.seq + 1, text: '모든 설정이 초기화되었습니다 (되돌릴 수 없음)', tone: 'bad' } }))
      return
    }
    patch(() => ({ dialog: { focus: 2 } }))
  }
  const dialogMove = (dir: 1 | -1) => patch(u => (u.dialog ? { dialog: { focus: Math.max(0, Math.min(2, u.dialog.focus + dir)) as 0 | 1 | 2 } } : {}))
  const dialogConfirm = (which?: 0 | 1 | 2) => {
    const f = which ?? uiRef.current.dialog?.focus ?? 2
    if (f === 0) resetTab()
    else if (f === 1) resetAll()
    else patch(() => ({ dialog: null }))
  }
  const tweak = () => {
    const u = uiRef.current
    if (!juice) {
      // 나쁜 예: 팝업 드롭다운 — 좌우 입력이 먹히지 않고 목록이 따로 열린다
      const o = OPTIONS.find(x => x.key === 'subtitleBg')!
      patch(x => ({ set: { ...x.set, subtitleBg: String(stepValue(o, x.set.subtitleBg, x.set.subtitleBg === 'heavy' ? -1 : 1)) }, drop: { seq: x.drop.seq + 1, key: 'subtitleBg' } }))
      return
    }
    // 프리셋을 적용한 뒤 글자 크기만 한 단계 줄인다 → '프리셋 · 수정됨'
    const o = OPTIONS.find(x => x.key === 'textScale')!
    gotoTab('display', 0)
    const dir = (u.set.textScale as number) > 120 ? -1 : 1
    setValue('textScale', stepValue(o, u.set.textScale, dir))
  }

  const handle = (id: string) => {
    if (id === 'apply-preset-vision') {
      applyPreset('vision')
    } else if (id === 'tweak-option') tweak()
    else if (id === 'play-dialogue') dialogue()
    else if (id === 'hit-shake') hit()
    else if (id === 'quick-contrast') quick()
    else if (id === 'reset-defaults') openReset()
  }
  useTrigger(p.trigger, handle)

  const step = useRef(0)
  useAutoplay(
    p.autoplay,
    p.playing,
    p.timeScale,
    1.5,
    () => {
      const a = SCRIPT[step.current % SCRIPT.length]
      step.current++
      if (a === 'dialogue') dialogue()
      else if (a === 'down') moveRow(1)
      else if (a === 'right') changeValue(1)
      else if (a === 'preset') applyPreset('vision')
      else if (a === 'tab+') changeTab(1)
      else if (a === 'quick') quick()
      else if (a === 'hit') hit()
      else if (a === 'touch') patch(() => ({ demoDevice: 'touch' }))
      else if (a === 'pad') patch(() => ({ demoDevice: 'pad' }))
      else if (a === 'reset') openReset()
      else if (a === 'dlgLeft') dialogMove(-1)
      else if (a === 'confirm') {
        if (uiRef.current.dialog) dialogConfirm()
      } else if (a === 'home') gotoTab('subtitle', 0)
    },
    p.trigger?.seq,
  )

  /* ───── 흔들림 (게임 시간, 감쇠 진동) ───── */
  const sceneRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useGameLoop(p.playing, p.timeScale, dt => {
    const x = shake.current
    if (x.t <= 0) return
    x.t = Math.max(0, x.t - dt)
    x.time += dt
    const k = x.t / 0.3
    const dx = Math.sin(x.time * 70) * x.amp * k
    const dy = Math.cos(x.time * 53) * x.amp * 0.6 * k
    const el = juice ? sceneRef.current : rootRef.current
    if (el) el.style.transform = x.t > 0 && x.amp > 0 ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : ''
  })

  /* ───── 입력 ───── */
  const onKeyDown = stageKeyDown<HTMLDivElement>(e => {
    const k = e.key
    // Tab 키로 버튼(프리셋·탭·복원·확인 창)에 포커스를 옮긴 상태의 Enter/Space 는 그 버튼이 받게 둔다
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return
    let used = true
    const u = uiRef.current
    if (u.dialog) {
      if (k === 'ArrowLeft' || k === 'ArrowUp') dialogMove(-1)
      else if (k === 'ArrowRight' || k === 'ArrowDown') dialogMove(1)
      else if (k === 'Enter') dialogConfirm()
      else if (k === 'Escape') patch(() => ({ dialog: null }))
      else used = false
    } else if (k === 'ArrowUp') moveRow(-1)
    else if (k === 'ArrowDown') moveRow(1)
    else if (k === 'ArrowLeft') changeValue(-1)
    else if (k === 'ArrowRight') changeValue(1)
    else if (k === 'Enter') {
      if (curOpt.kind === 'toggle') changeValue(1)
      else if (curOpt.kind === 'step') {
        const i = curOpt.values.findIndex(v => v.v === u.set[curOpt.key])
        setValue(curOpt.key, curOpt.values[(i + 1) % curOpt.values.length].v)
      } else used = false
    } else if (k === 'q' || k === 'Q' || k === 'PageUp') changeTab(-1)
    else if (k === 'e' || k === 'E' || k === 'PageDown') changeTab(1)
    else if (k === 'r' || k === 'R') openReset()
    else if (k === 'c' || k === 'C') quick()
    else used = false
    // 메뉴가 쓴 키만 먹는다(→ 갤러리 단축키 ←/→ 해설 넘김 등으로 번지지 않게). 매핑 안 된 키(Esc · Space · Enter(슬라이더) 등)는 갤러리로 흘린다
    if (!used) return
    if (u.demoDevice) patch(() => ({ demoDevice: null }))
    return true
  })
  const onPointerDown = () => {
    // 장치 종류는 공통 훅이 판별한다. 여기서는 자동 데모의 덮어쓰기만 푼다
    if (uiRef.current.demoDevice) patch(() => ({ demoDevice: null }))
  }

  /* ───── 목록 스크롤: 포커스 행이 보이게 ───── */
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const row = list.querySelector<HTMLElement>('[data-focus]')
    if (row) {
      const top = row.offsetTop - list.offsetTop
      const pad = 12
      if (top - pad < list.scrollTop) list.scrollTop = Math.max(0, top - pad)
      else if (top + row.offsetHeight + pad > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight + pad - list.clientHeight
    }
    list.toggleAttribute('data-more', list.scrollTop + list.clientHeight < list.scrollHeight - 4)
    list.toggleAttribute('data-less', list.scrollTop > 4)
  })

  const changed = changedKeys(ui.set)
  const k = ui.set.textScale / 100
  // 세로(휴대폰) 화면은 같은 논리 픽셀이라도 실제로 훨씬 작게 보이므로 기본 글자를 키운다
  const base = portrait ? 1.45 : 1
  const rootStyle = { '--ts': p.timeScale, '--k': k * base, '--k2': Math.min(k, 1.3) * base } as CSSProperties
  const common = {
    ref: rootRef,
    tabIndex: p.thumbnail ? -1 : 0,
    onKeyDown,
    onPointerDown,
    'data-paused': !p.playing || undefined,
    'data-device': device,
    'data-hc': ui.set.highContrast !== 'off' || undefined,
    'data-rm': ui.set.reduceMotion || undefined,
    style: rootStyle,
    'aria-label': '설정 메뉴 (클릭 후 방향키로 조작)',
  }

  if (!juice) return <BadMenu p={p} ui={ui} common={common} />
  const glyph = portrait ? 46 : 34

  /* ───── 상태 라벨 ───── */
  const presetName = ui.origin.preset ? IN_PRESETS.find(x => x.id === ui.origin.preset)!.label : null
  const status = presetName
    ? ui.origin.modified
      ? { kind: 'mod', text: `${presetName} 프리셋 · 수정됨` }
      : { kind: 'preset', text: `${presetName} 프리셋` }
    : changed.length === 0
      ? { kind: 'default', text: '기본' }
      : { kind: 'custom', text: '사용자 지정' }

  const tabCount = (t: TabId) => optsOf(t).filter(o => changed.includes(o.key)).length
  // 해설 5번(변경 표시): 보이는 탭의 첫 변경 행 → 없으면 변경이 있는 탭 배지 → 없으면 첫 행 자리
  const firstChangedRow = opts.find(o => changed.includes(o.key))?.key
  const firstChangedTab = !firstChangedRow ? TABS.find(t => tabCount(t.id) > 0)?.id : undefined
  const flashKeys = ui.flash.keys
  const flashOrder = (key: OptKey) => opts.filter(o => flashKeys.includes(o.key)).findIndex(o => o.key === key)

  const presetBar = (
    <div className={s.presetBar}>
      <div className={s.presetHead}>
        <span className={s.secLabel}>빠른 프리셋</span>
        <span className={s.status} data-kind={status.kind} role="status">
          <i aria-hidden />
          {status.text}
        </span>
      </div>
      {/* 해설 1번은 버튼 줄에 — 번호가 위 미리보기(자막)를 덮지 않고 머리 줄 가운데 빈 곳에 놓인다 */}
      <div className={s.presetRow} data-part="preset-bar">
        {IN_PRESETS.map(pr => (
          <button key={pr.id} type="button" className={s.presetBtn} data-active={ui.origin.preset === pr.id || undefined} onClick={() => applyPreset(pr.id)}>
            <PresetIcon kind={pr.icon} />
            {pr.label}
          </button>
        ))}
      </div>
    </div>
  )

  const renderRow = (o: OptDef, i: number) => {
    const focus = i === ui.row
    const isChanged = changed.includes(o.key)
    const fi = flashKeys.includes(o.key) && ui.flash.seq > 0 ? flashOrder(o.key) : -1
    const markerPart = firstChangedRow ? (o.key === firstChangedRow ? 'change-marker' : undefined) : !firstChangedTab && i === 0 ? 'change-marker' : undefined
    return (
      <div
        key={o.key}
        className={s.row}
        data-focus={focus || undefined}
        data-changed={isChanged || undefined}
        onClick={() => patch(() => ({ row: i }))}
      >
        {fi >= 0 && <span key={ui.flash.seq} className={s.rowFlash} style={{ animationDelay: `calc(${fi * 40}ms / var(--ts, 1))` }} aria-hidden />}
        {/* 아직 바뀐 값이 없으면 해설 5번 자리에 점선 고리(빈 표시)를 보여 '여기에 점이 생긴다'를 알린다 */}
        <span className={s.dot} data-part={markerPart} data-empty={(markerPart && !isChanged) || undefined} aria-label={isChanged ? '기본값에서 바뀜' : undefined} />
        <span className={s.rowLabel}>{o.label}</span>
        <Control o={o} v={ui.set[o.key]} onStep={d => changeValue(d, o.key)} onSet={v => setValue(o.key, v)} />
        {touchLayout && focus && <p className={s.rowDesc}>{o.desc}</p>}
      </div>
    )
  }

  const footer = (
    <div className={s.footer}>
      {hintsFor(device, glyph).map(h => (
        <span key={h.id} className={s.hint} data-id={h.id} data-part={h.id === 'quick' ? 'footer-hints' : undefined}>
          {h.id === 'quick' && ui.quickSeq > 0 && <span key={ui.quickSeq} className={s.hintPulse} aria-hidden />}
          <span className={s.hintIcon}>{h.icon}</span>
          {h.text}
        </span>
      ))}
    </div>
  )

  const preview = (width: number) => (
    <div className={s.pvBlock} style={{ width }}>
      <div className={s.pvCaption}>
        <span className={s.liveDot} aria-hidden />
        실시간 미리보기
        {!p.thumbnail && <em>바뀌는 곳: {TARGET_LABEL[curOpt.target]}</em>}
        <span>값을 바꾸면 같은 프레임에 반영</span>
      </div>
    <div className={s.pvFrame} data-part="live-preview" style={{ width, height: (width * PV_H) / PV_W }}>
      <div className={s.pvScaler} style={{ transform: `scale(${width / PV_W})` }}>
        <Preview
          settings={ui.set}
          line={ui.line}
          lineSeq={ui.lineSeq}
          target={p.thumbnail ? null : curOpt.target}
          hitSeq={ui.hitSeq}
          ringSeq={ui.ringSeq}
          sceneRef={sceneRef}
          device={device}
          touchQuick={device === 'touch'}
          onQuick={quick}
          quickSeq={ui.quickSeq}
          parts
        />
      </div>
    </div>
    </div>
  )

  const dialog = ui.dialog && (
    <div className={s.scrim}>
      <div className={s.dialog} role="dialog" aria-label="기본값 복원">
        <h3>기본값으로 되돌릴까요?</h3>
        <p>
          되돌릴 범위를 고르세요. 지금 탭 <b>{TABS.find(t => t.id === ui.tab)!.label}</b> 에서 {tabCount(ui.tab)}개, 전체에서 {changed.length}개가 바뀌어 있습니다.
        </p>
        <div className={s.dlgBtns}>
          {[`현재 탭만 (${tabCount(ui.tab)})`, `전체 (${changed.length})`, '취소'].map((label, i) => (
            <button
              key={i}
              type="button"
              className={s.dlgBtn}
              data-focus={ui.dialog!.focus === i || undefined}
              data-empty={(i === 0 ? tabCount(ui.tab) === 0 : i === 1 ? changed.length === 0 : false) || undefined}
              onClick={() => dialogConfirm(i as 0 | 1 | 2)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={s.dlgNote}>기본 선택은 &lsquo;취소&rsquo; — 실수로 눌러도 아무것도 사라지지 않는다</p>
      </div>
    </div>
  )

  const toast = ui.toast.seq > 0 && (
    <div key={ui.toast.seq} className={s.toast} role="status">
      {ui.toast.text}
    </div>
  )

  const deviceChip = (
    <div className={s.headRight}>
      {ui.set.highContrast !== 'off' && <span className={s.assistChip}>◐ 고대비</span>}
      {ui.set.reduceMotion && <span className={s.assistChip}>≋ 모션 줄임</span>}
      {ui.set.cameraShake === 0 && <span className={s.assistChip}>흔들림 없음</span>}
      <span className={s.deviceChip}>
        <span className={s.deviceDot} aria-hidden />
        입력: {DEVICE_LABEL[device]}
      </span>
    </div>
  )

  /* ───── 세로·터치 배치: 위 미리보기 + 접히는 섹션 목록 ───── */
  if (touchLayout) {
    return (
      <div className={s.root} data-layout={portrait ? 'portrait' : 'touch'} {...common}>
        <div className={s.bgDeco} aria-hidden />
        <header className={s.head}>
          <button type="button" className={s.backBtn}>
            ‹ 뒤로
          </button>
          <h1 className={s.title}>설정</h1>
          {deviceChip}
        </header>
        <div className={s.tGrid}>
          <div className={s.tTop}>
            {preview(portrait ? 992 : 900)}
            {presetBar}
          </div>
          <div className={s.tList} ref={listRef}>
            {TABS.map(t => {
              const open = t.id === ui.tab
              const n = tabCount(t.id)
              return (
                <section key={t.id} className={s.section} data-open={open || undefined}>
                  <button type="button" className={s.sectionHead} onClick={() => gotoTab(t.id)}>
                    <span>{t.label}</span>
                    <span className={s.badge} data-zero={n === 0 || undefined} data-part={t.id === firstChangedTab ? 'change-marker' : undefined}>
                      {n}
                    </span>
                    <span className={s.chev} aria-hidden />
                  </button>
                  {open && (
                    <div key={ui.tabSeq} className={s.sectionBody}>
                      {optsOf(t.id).map(renderRow)}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
          <div className={s.tBottom}>
            <button type="button" className={s.resetBtn} onClick={openReset}>
              <ResetIcon />
              기본값 복원
            </button>
            {footer}
          </div>
        </div>
        {dialog}
        {toast}
      </div>
    )
  }

  /* ───── 넓은 화면: 왼쪽 프리셋·탭·목록 + 오른쪽 미리보기 ───── */
  return (
    <div className={s.root} data-layout="split" {...common}>
      <div className={s.bgDeco} aria-hidden />
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>일시정지 · 옵션</p>
          <h1 className={s.title}>접근성 설정</h1>
        </div>
        {deviceChip}
      </header>
      <div className={s.left}>
        {presetBar}
        <div className={s.tabs} role="tablist">
          <span className={s.tabGlyph}>{device === 'pad' ? <Shoulder side="L" size={34} /> : <KeyCap label="Q" size={36} />}</span>
          {TABS.map(t => {
            const n = tabCount(t.id)
            return (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === ui.tab} className={s.tab} onClick={() => gotoTab(t.id)}>
                {t.label}
                <span className={s.badge} data-zero={n === 0 || undefined} data-part={t.id === firstChangedTab ? 'change-marker' : undefined}>
                  {n > 0 && ui.flash.seq > 0 && <span key={ui.flash.seq} className={s.badgePulse} aria-hidden />}
                  {n}
                </span>
              </button>
            )
          })}
          <span className={s.tabGlyph}>{device === 'pad' ? <Shoulder side="R" size={34} /> : <KeyCap label="E" size={36} />}</span>
        </div>
        <div className={s.list} ref={listRef}>
          <div key={`${ui.tab}-${ui.tabSeq}`} className={s.listInner}>
            {opts.map(renderRow)}
            <TabSummary tab={ui.tab} changed={changed} device={device} />
          </div>
        </div>
        <div className={s.leftFoot}>
          <button type="button" className={s.resetBtn} onClick={openReset}>
            <ResetIcon />
            기본값 복원
            <span className={s.resetKey}>{device === 'pad' ? <PadButton face="left" size={36} /> : <KeyCap label="R" size={36} />}</span>
          </button>
          <span className={s.ruleNote}>위아래로 항목 이동, 좌우로 값 변경 — 모든 옵션이 같은 규칙</span>
        </div>
      </div>
      <div className={s.right}>
        {preview(Math.round(928 - Math.max(0, k - 1) * 220))}
        <div className={s.desc}>
          <div className={s.descHead}>
            <b>{curOpt.label}</b>
            <span className={s.descVal}>
              {ui.set[curOpt.key] === DEFAULTS[curOpt.key] ? (
                <>
                  현재 값 <em>{valueLabel(curOpt, ui.set[curOpt.key])}</em> (기본값)
                </>
              ) : (
                <>
                  현재 값 <em>{valueLabel(curOpt, ui.set[curOpt.key])}</em> · 기본값 {valueLabel(curOpt, DEFAULTS[curOpt.key])}
                </>
              )}
            </span>
          </div>
          <p>{curOpt.desc}</p>
          <div className={s.who}>
            도움이 되는 플레이어
            {curOpt.who.map(w => (
              <span key={w}>{w}</span>
            ))}
          </div>
        </div>
      </div>
      {footer}
      {dialog}
      {toast}
    </div>
  )
}

/** 탭 요약 — 옵션이 적은 탭에서 남는 자리에 '이 탭이 무엇을 위한 곳인지'와 다음 탭 안내를 둔다 */
function TabSummary({ tab, changed, device }: { tab: TabId; changed: OptKey[]; device: Device }) {
  const list = optsOf(tab)
  const n = list.filter(o => changed.includes(o.key)).length
  const who = [...new Set(list.flatMap(o => o.who))]
  const i = TABS.findIndex(t => t.id === tab)
  const next = TABS[(i + 1) % TABS.length]
  return (
    <div className={s.tabSummary}>
      <p className={s.tabSumHead}>
        <b>{TABS[i].label}</b> 탭 · 옵션 {list.length}개 · 기본값에서 바뀐 항목 <em data-zero={n === 0 || undefined}>{n}</em>개
      </p>
      <div className={s.who}>
        이 탭이 돕는 플레이어
        {who.map(w => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <p className={s.tabSumNext}>
        다음 탭 <b>{next.label}</b>
        {device === 'pad' ? <Shoulder side="R" size={30} /> : device === 'kbm' ? <KeyCap label="E" size={32} /> : null}
      </p>
    </div>
  )
}

const ResetIcon = () => (
  <svg className={s.resetIcon} viewBox="0 0 24 24" aria-hidden>
    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ───── 값 조작 위젯: 모두 '좌우로 값 변경' 한 규칙 ───── */
function Control({ o, v, onStep, onSet }: { o: OptDef; v: Settings[OptKey]; onStep: (d: 1 | -1) => void; onSet: (v: Settings[OptKey]) => void }) {
  const arrows = (body: ReactNode, atMin: boolean, atMax: boolean) => (
    <div className={s.ctrl} data-kind={o.kind}>
      <button type="button" className={s.arrow} data-dir="l" disabled={atMin} onClick={e => (e.stopPropagation(), onStep(-1))} aria-label="이전 값" />
      {body}
      <button type="button" className={s.arrow} data-dir="r" disabled={atMax} onClick={e => (e.stopPropagation(), onStep(1))} aria-label="다음 값" />
    </div>
  )
  if (o.kind === 'slider') {
    const n = v as number
    const ratio = (n - o.min) / (o.max - o.min)
    const onTrack = (e: PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      onSet(o.min + Math.round((t * (o.max - o.min)) / o.step) * o.step)
    }
    return arrows(
      <>
        <div className={s.track} onPointerDown={onTrack}>
          <i className={s.trackFill} style={{ width: `${ratio * 100}%` }} />
          <i className={s.knob} style={{ left: `${ratio * 100}%` }} />
        </div>
        <span className={s.ctrlVal} data-num>
          {valueLabel(o, n)}
        </span>
      </>,
      n <= o.min,
      n >= o.max,
    )
  }
  if (o.kind === 'toggle') {
    return arrows(
      <span className={s.toggle} data-on={v ? true : undefined}>
        <span>끔</span>
        <span>켬</span>
      </span>,
      false,
      false,
    )
  }
  const i = o.values.findIndex(x => x.v === v)
  return arrows(
    <span className={s.stepper}>
      <span className={s.ctrlVal}>{valueLabel(o, v)}</span>
      <span className={s.pips} aria-hidden>
        {o.values.map((x, j) => (
          <i key={x.v} data-on={j === i || undefined} />
        ))}
      </span>
    </span>,
    i <= 0,
    i >= o.values.length - 1,
  )
}

/* ───── 효과 끄기 = 흔한 실수를 모은 나쁜 예 ───── */
const FILLER: [string, string][] = [
  ['밝기', '50'], ['감마', '2.2'], ['HDR', '끔'], ['해상도', '1920×1080'], ['프레임 제한', '60'], ['수직 동기화', '켬'], ['시야각', '90'], ['모션 블러', '켬'],
  ['필름 그레인', '켬'], ['피사계 심도', '켬'], ['마스터 볼륨', '80'], ['음악', '70'], ['효과음', '80'], ['음성', '90'], ['진동', '켬'], ['진동 세기', '보통'],
  ['상하 반전', '끔'], ['감도 X', '5'], ['감도 Y', '5'], ['자동 달리기', '끔'], ['앉기 방식', '누르기'], ['언어', '한국어'], ['음성 언어', '한국어'], ['HUD 투명도', '100'],
  ['미니맵 회전', '켬'], ['피해 숫자', '켬'], ['도움말 팁', '켬'], ['조준점 모양', '십자'], ['자동 저장 알림', '켬'], ['카메라 거리', '보통'],
]
/** 접근성 옵션이 일반 옵션 사이에 흩어져 있다 (찾기 어려움) */
const BAD_ORDER: (OptKey | number)[] = [0, 1, 2, 3, 4, 'centerDot', 5, 6, 7, 'cameraShake', 8, 9, 10, 11, 'speakerCues', 12, 13, 'subtitleBg', 14, 15, 'subtitleColor', 16, 17, 18, 'aimAssist', 19, 'holdToPress', 20, 21, 22, 23, 24, 'hudSize', 25, 26, 'colorMode', 27, 28, 'highContrast', 'reduceMotion', 29, 'textScale']

function BadMenu({ p, ui, common }: { p: SpecimenProps; ui: UI; common: Record<string, unknown> }) {
  // 미리보기 대신 '메뉴를 닫아야 반영되는' 게임 화면 — 저장된 설정(갤러리 값)만 보여 준다
  const saved = fromParams(p.params, { ...DEFAULTS })
  const pending = (Object.keys(DEFAULTS) as OptKey[]).filter(k => ui.set[k] !== saved[k]).length
  const { style, ...rest } = common as { style: CSSProperties }
  return (
    <div className={s.root} data-layout="bad" {...rest} style={{ ...style, '--k': 1 } as CSSProperties}>
      <div className={s.badPanel}>
        <div className={s.badTitle} data-part="preset-bar">
          옵션 <span>({BAD_ORDER.length})</span>
        </div>
        <div className={s.badList}>
          {BAD_ORDER.map((item, i) => {
            if (typeof item === 'number') {
              const [label, val] = FILLER[item]
              return (
                <div key={i} className={s.badRow} data-focus={i === 0 || undefined}>
                  <span>{label}</span>
                  <span className={s.badVal}>{val} ▾</span>
                </div>
              )
            }
            const o = OPTIONS.find(x => x.key === item)!
            return (
              <div key={i} className={s.badRow}>
                <span>{o.label}</span>
                <span className={s.badVal} data-part={item === 'subtitleBg' ? 'change-marker' : undefined}>
                  {valueLabel(o, ui.set[item])} ▾
                </span>
                {item === 'subtitleBg' && ui.drop.seq > 0 && (
                  <div key={ui.drop.seq} className={s.badDrop}>
                    {(o.kind === 'step' ? o.values : []).map(x => (
                      <span key={x.v} data-on={x.v === ui.set.subtitleBg || undefined}>
                        {x.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className={s.badFooter}>
          {/* 키보드 안내만 고정 — 장치가 바뀌어도 그대로, 빠른 전환 입력도 없다 */}
          <span className={s.badHints} data-part="footer-hints">
            <span>Enter 선택</span>
            <span>Esc 뒤로</span>
          </span>
          <span className={s.badBtns}>
            <b>적용</b>
            <b>초기화</b>
          </span>
        </div>
      </div>
      <div className={s.badSide}>
        <div className={s.badPv} data-part="live-preview">
          <div className={s.pvScaler} style={{ transform: `scale(${640 / PV_W})` }}>
            <Preview settings={saved} line={ui.line} lineSeq={ui.lineSeq} target={null} hitSeq={0} parts />
          </div>
          <div className={s.badPvShade}>
            <b>게임 화면</b>
            메뉴를 닫아야 바뀐 설정이 보입니다
          </div>
        </div>
        <p className={s.badPending}>
          적용 안 된 변경 <b>{pending}</b>개 · 무엇이 바뀌었는지 표시 없음
        </p>
        <div className={s.badHelp}>
          <b>밝기</b>
          <span>설명이 없습니다.</span>
        </div>
        {/* 흔한 실수: 무엇을 고르든 바뀌지 않는 긴 고정 도움말 + 의미가 겹치는 큰 버튼 */}
        <div className={s.badNotice}>
          <b>도움말</b>
          <p>
            일부 설정은 적용 버튼을 눌러야 반영되며, 일부 설정은 게임을 다시 시작해야 반영됩니다. 그래픽 관련 설정은 성능에 영향을 줄 수 있습니다. 설정을 변경한 뒤에는 저장하지 않고 나가면 변경 내용이
            사라집니다. 초기화를 누르면 모든 설정이 기본값으로 돌아갑니다. 자세한 내용은 설명서를 참고하십시오.
          </p>
        </div>
        <div className={s.badBigBtns}>
          <b>적용</b>
          <b>취소</b>
          <b>기본값</b>
        </div>
      </div>
      {ui.toast.seq > 0 && (
        <div key={ui.toast.seq} className={s.toast} data-tone={ui.toast.tone} role="status">
          {ui.toast.text}
        </div>
      )}
    </div>
  )
}
