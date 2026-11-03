/* ──────────────────────────────────────────────────────────────
 * 방향 커맨드 — 데이터와 판정 (화면을 모르는 순수 로직)
 * 커맨드 정의(이름 · 시퀀스 · 재사용 대기)는 데이터로 두고, 판정기는 입력 버퍼와 접두사 매칭만 한다.
 * Unity 판 ComboCommandSet.cs(ComboMatcher 포함)와 같은 규칙이다.
 * 시간은 모두 '게임 시간' 초.
 * ────────────────────────────────────────────────────────────── */

export type Dir = 'U' | 'D' | 'L' | 'R'
export const ARROW: Record<Dir, string> = { U: '↑', D: '↓', L: '←', R: '→' }
export const DIR_WORD: Record<Dir, string> = { U: '위', D: '아래', L: '왼쪽', R: '오른쪽' }

export interface ComboCommand {
  id: string
  name: string
  /** 한 줄 효과 */
  desc: string
  seq: Dir[]
  /** 재사용 대기 (게임 시간 초) */
  cooldown: number
}

const seq = (s: string) => s.split('') as Dir[]

/** 외곽 탐사대 지원 요청. '정찰 드론' 은 '정찰 드론 편대' 의 접두사 — 완성 즉시 발동하면 편대에는 닿을 수 없다 */
export const COMMANDS: ComboCommand[] = [
  { id: 'scout', name: '정찰 드론', desc: '주변 잔해 드론 표시', seq: seq('LUR'), cooldown: 8 },
  { id: 'wing', name: '정찰 드론 편대', desc: '넓은 구역을 오래 표시', seq: seq('LURUD'), cooldown: 20 },
  { id: 'supply', name: '보급 투하', desc: '수리 키트 · 산소 캔 상자', seq: seq('ULDD'), cooldown: 15 },
  { id: 'coolant', name: '냉각 셀 지원', desc: '과열한 장비를 식힌다', seq: seq('LLDR'), cooldown: 10 },
  { id: 'repair', name: '수리 키트 투하', desc: '근처 동료 체력 회복', seq: seq('RULD'), cooldown: 12 },
  { id: 'shield', name: '방어막 발생기', desc: '10초 동안 피해 막기', seq: seq('DRUL'), cooldown: 20 },
  { id: 'relay', name: '통신 중계기', desc: '세라와의 통신 복구', seq: seq('URLLU'), cooldown: 30 },
]

/** 다른 커맨드의 접두사인가 (완성해도 더 긴 후보가 남는다) */
export const prefixOf = (cmds: ComboCommand[], i: number) =>
  cmds.some((c, j) => j !== i && c.seq.length > cmds[i].seq.length && cmds[i].seq.every((d, k) => c.seq[k] === d))

export interface MatchConfig {
  /** 다른 커맨드의 접두사인 커맨드를 완성했을 때 기다리는 시간. 0 = 완성 즉시 발동 */
  prefixWait: number
  /** 입력 사이 제한 시간. 0 = 끔 */
  stepTimeout: number
  /** 관대한 모드: 틀린 입력은 버리고 그 칸만 다시 받는다 */
  lenient: boolean
}

export type PushResult =
  | { kind: 'progress' }
  | { kind: 'pending'; cmd: number }
  | { kind: 'fired'; cmd: number }
  /** slot = 틀린 칸(0부터). 기다리던 커맨드가 먼저 발동했으면 새 시퀀스의 칸 */
  | { kind: 'wrong'; kept: boolean; cooling: number; slot: number }

export class ComboMatcher {
  buffer: Dir[] = []
  /** 완성했지만 더 긴 후보 때문에 기다리는 커맨드 (-1 = 없음) */
  pending = -1
  pendingAt = 0
  lastAt = 0
  readyAt: number[]

  constructor(readonly commands: ComboCommand[]) {
    this.readyAt = commands.map(() => 0)
  }

  ready(i: number, now: number) {
    return now >= this.readyAt[i]
  }
  cooldownLeft(i: number, now: number) {
    return Math.max(0, this.readyAt[i] - now)
  }
  /** buf 가 커맨드 i 의 앞부분인가 */
  matches(i: number, buf: Dir[] = this.buffer) {
    const s = this.commands[i].seq
    return buf.length <= s.length && buf.every((d, k) => s[k] === d)
  }
  /** 지금 버퍼로 남은 후보 (재사용 대기 중인 것은 뺀다) */
  isCandidate(i: number, now: number) {
    return this.ready(i, now) && this.matches(i)
  }

  clear() {
    this.buffer = []
    this.pending = -1
  }

  fire(i: number, now: number) {
    this.readyAt[i] = now + this.commands[i].cooldown
    this.clear()
  }

  /** 방향 하나. 기다리던 커맨드가 있으면 먼저 발동한 뒤 새 입력으로 다시 판정하므로 결과가 둘일 수 있다 */
  push(d: Dir, now: number, cfg: MatchConfig): PushResult[] {
    const len = this.buffer.length
    const next = [...this.buffer, d]
    const n = this.commands.length
    let any = false
    for (let i = 0; i < n; i++) if (this.ready(i, now) && this.matches(i, next)) any = true
    if (!any) {
      if (this.pending >= 0) {
        // 기다리던 커맨드를 이어 갈 수 없는 입력 — 그 커맨드를 발동하고, 이 입력은 새 시퀀스의 첫 칸으로 (입력 버퍼)
        const p = this.pending
        this.fire(p, now)
        return [{ kind: 'fired', cmd: p }, ...this.push(d, now, cfg)]
      }
      let cooling = -1
      for (let i = 0; i < n; i++) if (!this.ready(i, now) && this.matches(i, next)) cooling = i
      const kept = cfg.lenient && len > 0
      if (kept) this.lastAt = now // 관대한 모드: 그 칸만 다시 — 제한 시간도 다시 채운다
      else this.clear()
      return [{ kind: 'wrong', kept, cooling, slot: len }]
    }
    this.buffer = next
    this.lastAt = now
    this.pending = -1
    let exact = -1
    let longer = false
    for (let i = 0; i < n; i++) {
      if (!this.isCandidate(i, now)) continue
      if (this.commands[i].seq.length === next.length) exact = i
      else longer = true
    }
    if (exact < 0) return [{ kind: 'progress' }]
    if (longer && cfg.prefixWait > 0) {
      this.pending = exact
      this.pendingAt = now
      return [{ kind: 'pending', cmd: exact }]
    }
    this.fire(exact, now)
    return [{ kind: 'fired', cmd: exact }]
  }

  /** 매 프레임: 기다림이 끝나면 발동, 입력 사이가 너무 길면 처음부터 */
  tick(now: number, cfg: MatchConfig): { kind: 'fired'; cmd: number } | { kind: 'timeout' } | null {
    if (this.pending >= 0 && now - this.pendingAt >= cfg.prefixWait) {
      const p = this.pending
      this.fire(p, now)
      return { kind: 'fired', cmd: p }
    }
    if (this.pending < 0 && this.buffer.length && cfg.stepTimeout > 0 && now - this.lastAt >= cfg.stepTimeout) {
      this.clear()
      return { kind: 'timeout' }
    }
    return null
  }
}

/**
 * 나쁜 예(효과 끄기)의 흔한 구현: 입력을 모두 쌓아 두고 '끝부분이 어떤 커맨드와 같으면' 발동.
 * 틀려도 아무 일이 없고 버퍼는 계속 길어진다. 접두사인 커맨드가 먼저 걸려 긴 커맨드에 닿지 못한다.
 */
export function suffixMatch(raw: Dir[], m: ComboMatcher, now: number): number {
  for (let i = 0; i < m.commands.length; i++) {
    const s = m.commands[i].seq
    if (!m.ready(i, now) || raw.length < s.length) continue
    if (s.every((d, k) => raw[raw.length - s.length + k] === d)) return i
  }
  return -1
}

/** 자동 데모용: buf 의 끝부분에 이어 커맨드를 완성하려면 다음에 넣을 방향 */
export function nextFor(s: Dir[], buf: Dir[]): Dir {
  for (let k = Math.min(buf.length, s.length - 1); k > 0; k--) {
    if (s.slice(0, k).every((d, j) => buf[buf.length - k + j] === d)) return s[k]
  }
  return s[0]
}

/** 스와이프 벡터를 4방향으로 (화면 좌표: y 아래 +). 짧거나 대각선(두 축 차이 ÷ 길이 < band)이면 null */
export function quantize(dx: number, dy: number, min: number, band: number): Dir | null {
  const m = Math.hypot(dx, dy)
  if (m < min || Math.abs(Math.abs(dx) - Math.abs(dy)) / m < band) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U'
}
