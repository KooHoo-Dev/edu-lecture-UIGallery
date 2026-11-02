/* 입력 잠금 — 새 선택지 · 결과 창이 막 나타난 직후 짧게 확정 입력을 막아, 직전 연타가 첫 항목을 고르는 실수를 막는다.
 * 판정은 '처리한 시각' 이 아니라 '누른 시각' 으로 한다. 프레임이 밀려 늦게 처리돼도 잠금 중에 누른 입력은 막힌다.
 * 시간 단위는 부르는 쪽 시계와 같으면 된다(게임 시간 ms 권장). 처음 쓴 곳: upgrade-draft-choice (그 표본은 같은 규칙을 직접 계산한다) */

export interface InputLock {
  /** 창이 나타난 시각을 기록하고 잠금을 시작한다 */
  open(now: number): void
  /** 이 시각에 누른 입력을 막아야 하는가 */
  blocks(pressedAt: number): boolean
  /** 잠금 진행 0 → 1 (1 = 풀림). 잠금 막대를 그릴 때 */
  progress(now: number): number
  /** 잠금 길이 바꾸기 (조절 값이 바뀔 때). 0 이면 잠금 없음 = 나쁜 예 */
  setDuration(ms: number): void
}

export function createInputLock(durationMs: number): InputLock {
  let duration = durationMs
  let openedAt = Number.NEGATIVE_INFINITY
  return {
    open(now) {
      openedAt = now
    },
    blocks: pressedAt => duration > 0 && pressedAt >= openedAt && pressedAt - openedAt < duration,
    progress: now => (duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - openedAt) / duration))),
    setDuration(ms) {
      duration = ms
    },
  }
}
