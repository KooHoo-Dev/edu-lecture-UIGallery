/* 시간으로 잠긴 메타 — 화면과 분리된 순수 모델. Unity 판 TimeGatedModel.cs · ServerClock.cs 와 같은 규칙이다.
 * 핵심: 현재값을 '저장' 하지 않고 '마지막 기록 + 지금 시각' 에서 계산한다. 시각은 늘 같은 시계(서버 시각)에서 읽는다. */

export const MIN = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000
/** 서버 지역 시간대 (UTC+9). 하루 경계 = 이 시간대의 초기화 시각 */
export const TZ_H = 9
/** 시뮬레이션 시작 서버 시각 = 2026-11-03 13:47:27 (UTC+9) */
export const SERVER_START = Date.UTC(2026, 10, 3, 4, 47, 27)

/* ───── 서버 시각 (battle-pass-track 의 ServerClock 을 이 표본 안에 다시 씀 — 공통화 요청) ─────
 * 서버 시각 = 접속 때 받은 서버 시각 + (지금 단조 시계 − 받은 순간의 단조 시계). 기기 시계는 쓰지 않는다. */
export interface ServerClock {
  syncedServer: number
  syncedMono: number
  synced: boolean
}
export const syncClock = (c: ServerClock, server: number, mono: number) => {
  c.syncedServer = server
  c.syncedMono = mono
  c.synced = true
}
export const serverNow = (c: ServerClock, mono: number) => c.syncedServer + (mono - c.syncedMono)

/* ───── 에너지 (탐사 연료) ───── */
export interface Energy {
  /** 마지막으로 확정한 값 (최대치를 넘을 수 있다 = 초과) */
  value: number
  /** 마지막 회복 시각 — 여기서부터 interval 마다 +1. value ≥ max 이면 의미 없음(회복 정지) */
  lastAt: number
}
export interface EnergyView {
  value: number
  /** 다음 +1 까지 ms (가득 · 초과면 -1) */
  next: number
  /** 가득 찰 때까지 ms (가득 · 초과면 0) */
  full: number
  over: boolean
}

/** 지금 값 = 마지막 값 + floor(경과 / 간격), 최대치에서 멈춘다. 시계가 뒤로 가도 경과는 0 아래로 내려가지 않는다 */
export function energyAt(e: Energy, now: number, max: number, interval: number): EnergyView {
  if (e.value >= max) return { value: e.value, next: -1, full: 0, over: e.value > max }
  const el = Math.max(0, now - e.lastAt)
  const value = Math.min(max, e.value + Math.floor(el / interval))
  if (value >= max) return { value, next: -1, full: 0, over: false }
  const next = interval - (el % interval)
  return { value, next, full: next + (max - value - 1) * interval, over: false }
}

/** 계산값을 기록으로 확정한다. 남은 부분 간격(다음 +1 까지 쌓인 시간)은 버리지 않는다 */
export function settle(e: Energy, now: number, max: number, interval: number): Energy {
  if (e.value >= max) return { value: e.value, lastAt: now }
  const gained = Math.floor(Math.max(0, now - e.lastAt) / interval)
  const value = e.value + gained
  if (value >= max) return { value: max, lastAt: now }
  return { value, lastAt: e.lastAt + gained * interval }
}

/** 쓰기. 가득(또는 초과)이던 값이 최대치 아래로 내려가면 회복 시계는 '지금' 부터 */
export function spend(e: Energy, cost: number, now: number, max: number, interval: number): Energy | null {
  const s = settle(e, now, max, interval)
  if (s.value < cost) return null
  return { value: s.value - cost, lastAt: s.value >= max ? now : s.lastAt }
}

/** 더하기 (보상). 최대치를 넘겨도 자르지 않는다 — 초과분은 남고 그동안 회복이 멈춘다 */
export function addEnergy(e: Energy, n: number, now: number, max: number, interval: number): Energy {
  const s = settle(e, now, max, interval)
  return { value: s.value + n, lastAt: s.lastAt }
}

/** cost 만큼 모일 때까지 ms (이미 있으면 0). 최대치보다 크면 회복으로는 오지 않는다 → -1 (보상으로만) */
export function untilEnough(v: EnergyView, cost: number, max: number, interval: number) {
  if (v.value >= cost) return 0
  if (cost > max) return -1
  return v.next + (cost - v.value - 1) * interval
}

/* ───── 출석 ───── */
export type Rule = 'cumulative' | 'streak'
export type SlotState = 'claimed' | 'today' | 'next' | 'future'

/** 하루 번호. 하루는 서버 지역 시간의 초기화 시각(resetHour)에 바뀐다 — 자정이 아니다 */
export const dayOf = (ms: number, resetHour: number) => Math.floor((ms + (TZ_H - resetHour) * HOUR) / DAY)
/** 다음 초기화 시각 */
export const nextReset = (ms: number, resetHour: number) => (dayOf(ms, resetHour) + 1) * DAY - (TZ_H - resetHour) * HOUR

export interface Attendance {
  /** 이번 주기에 받은 날의 하루 번호 (칸 1, 2, 3 … 순서) */
  claimed: number[]
  /** 연속 규칙에서 끊긴 기록 — 몇 칸을 잃었는지 · 놓친 첫날 */
  broke: { lost: number; day: number } | null
}

export const lastClaim = (a: Attendance) => (a.claimed.length ? a.claimed[a.claimed.length - 1] : -Infinity)
/** 오늘 받았나. 기기 시계를 되돌리면 '오늘' 이 마지막 기록보다 앞설 수 있어 ≥ 로 본다 */
export const claimedToday = (a: Attendance, today: number) => lastClaim(a) >= today

/** 날짜가 바뀐 뒤 규칙을 적용한다: 7칸을 다 채웠으면 새 주기, 연속 규칙에서 하루라도 비면 처음부터 */
export function settleDay(a: Attendance, today: number, rule: Rule): Attendance {
  if (claimedToday(a, today) || !a.claimed.length) return a
  if (a.claimed.length >= 7) return { claimed: [], broke: null }
  const last = lastClaim(a)
  if (rule === 'streak' && last < today - 1) return { claimed: [], broke: { lost: a.claimed.length, day: last + 1 } }
  return a
}

export function slotState(a: Attendance, k: number, today: number): SlotState {
  const n = a.claimed.length
  if (k < n) return 'claimed'
  if (k === n) return claimedToday(a, today) ? 'next' : 'today'
  return 'future'
}

/** 칸 k 앞에서 놓친 날 수 (누적 규칙은 놓쳐도 다음 칸이라 칸 사이에 표시한다) */
export function missedBefore(a: Attendance, k: number, today: number) {
  if (k === 0 || k > a.claimed.length) return 0
  const prev = a.claimed[k - 1]
  const cur = k < a.claimed.length ? a.claimed[k] : claimedToday(a, today) ? prev + 1 : today
  return Math.max(0, cur - prev - 1)
}

/** 시작 기록: 오늘이 4일째. 누적 규칙은 중간에 하루를 놓친 기록으로 시작한다 */
export function initialAttendance(today: number, rule: Rule): Attendance {
  return { claimed: rule === 'streak' ? [today - 3, today - 2, today - 1] : [today - 4, today - 2, today - 1], broke: null }
}

export type RewardKind = 'credit' | 'oxygen' | 'cell' | 'fuel' | 'kit' | 'chip' | 'crate'
export interface Reward {
  kind: RewardKind
  name: string
  count: number
  /** 7일차 큰 보상의 내용 */
  detail?: string
}
export const REWARDS: Reward[] = [
  { kind: 'credit', name: '크레딧', count: 500 },
  { kind: 'oxygen', name: '산소 캔', count: 2 },
  { kind: 'cell', name: '냉각 셀', count: 3 },
  { kind: 'fuel', name: '탐사 연료', count: 30 },
  { kind: 'kit', name: '수리 키트', count: 2 },
  { kind: 'chip', name: '회로 조각', count: 10 },
  { kind: 'crate', name: '정비 보급 상자', count: 1, detail: '수리 키트 ×5 · 크레딧 3,000' },
]

/** 보상 아이콘 (24×24, 선 그림) */
export const KIND_PATH: Record<RewardKind, string> = {
  credit: 'M12 3a9 9 0 1 0 0.01 0Z M12 7v10 M9 9.5h4.5a2 2 0 0 1 0 4H9.5a2 2 0 0 0 0 4H15',
  oxygen: 'M8 7a4 4 0 0 1 8 0v13H8Z M10 3h4v2 M8 12h8',
  cell: 'M8 4h8v16H8Z M10 2h4v2 M8 9h8 M8 14h8',
  fuel: 'M6 5h9l3 3v12H6Z M9 5V3h4v2 M9 11l3 5 3-5 M12 9v2',
  kit: 'M4 7h16v12H4Z M9 7V4h6v3 M12 10v6 M9 13h6',
  chip: 'M7 7h10v10H7Z M10 7V3 M14 7V3 M10 21v-4 M14 21v-4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  crate: 'M3 8l9-5 9 5v9l-9 5-9-5Z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5',
}

/* ───── 표시 ───── */
const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
/** 남은 시간 → 1시간 안쪽은 "04:12", 넘으면 "1:23:00", 하루 넘으면 "1일 02:00:00" */
export function formatDur(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const d = Math.floor(t / 86400)
  const h = Math.floor((t % 86400) / 3600)
  const ms2 = `${two((t % 3600) / 60)}:${two(t % 60)}`
  if (d > 0) return `${d}일 ${two(h)}:${ms2}`
  return h > 0 ? `${h}:${ms2}` : ms2
}
/** 시각 → "11.03 13:47:27" (서버 지역 시간) */
export function formatClock(ms: number) {
  const d = new Date(ms + TZ_H * HOUR)
  return `${two(d.getUTCMonth() + 1)}.${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
}
/** 시각 → "16:03" (서버 지역 시간) */
export function formatHm(ms: number) {
  const d = new Date(ms + TZ_H * HOUR)
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}
/** 하루 번호 → 그날 날짜 "11/03" */
export function formatDay(day: number, resetHour: number) {
  const d = new Date(day * DAY + resetHour * HOUR)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
