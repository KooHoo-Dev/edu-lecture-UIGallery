/* 글자 복사. file:// 처럼 클립보드 API 가 막힌 환경에서는 textarea 로 대신한다. */
export async function writeText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    if (!copied) throw new Error('클립보드를 쓸 수 없습니다')
  }
}
