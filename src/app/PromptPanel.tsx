import { useMemo, useRef, useState } from 'react'
import { buildPrompt, otherSystem, PROMPT_LABELS, sharedFiles, SYSTEM_LABELS, type PromptKind } from '../core/prompts'
import { unityFiles } from '../core/registry'
import type { ParamValues, SpecimenMeta, UiSystem } from '../core/types'
import { writeText } from './clipboard'

const PROMPT_KINDS: PromptKind[] = ['direct', 'adapt', 'troubleshoot']

/** AI 프롬프트 3종. 위 Unity 패널에서 고른 UI 시스템의 파일과 지금 조절 값을 담는다 */
export function PromptPanel({ meta, system, values }: { meta: SpecimenMeta; system: UiSystem; values: ParamValues }) {
  const [kind, setKind] = useState<PromptKind>('direct')
  const files = useMemo(() => unityFiles(meta.id, system), [meta.id, system])
  const shared = useMemo(() => sharedFiles(files, unityFiles(meta.id, otherSystem(system)), meta.unity[system]), [files, meta.id, meta.unity, system])
  const text = useMemo(() => buildPrompt(kind, { meta, system, files, shared }, values), [kind, meta, system, files, shared, values])
  const [status, setStatus] = useState<string | null>(null)
  const timer = useRef(0)

  const copy = async () => {
    let result = '복사됨'
    try {
      await writeText(text)
    } catch {
      result = '복사 실패 — 글을 직접 선택하세요'
    }
    setStatus(result)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus(null), 1600)
  }

  return (
    <div className="prompt-panel">
      <div className="prompt-head">
        <h3>AI 프롬프트</h3>
        <span className="prompt-system">{SYSTEM_LABELS[system]} 기준</span>
      </div>
      <div className="tabs" role="tablist" aria-label="프롬프트 종류">
        {PROMPT_KINDS.map(k => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {PROMPT_LABELS[k].name}
          </button>
        ))}
      </div>
      <p className="prompt-hint">
        {PROMPT_LABELS[kind].desc}. 지금 조절 값과 위에서 고른 UI 시스템의 파일 {files.length}개
        {shared.length > 0 && `, 같이 쓰는 ${SYSTEM_LABELS[otherSystem(system)]} 파일 ${shared.length}개`}가 들어 있습니다.
      </p>
      <textarea className="prompt-text" readOnly value={text} aria-label={`${PROMPT_LABELS[kind].name} 프롬프트`} />
      <div className="prompt-actions">
        <button className="btn btn-primary" onClick={copy}>
          {status ?? '프롬프트 복사'}
        </button>
        <span className="prompt-hint">{text.length.toLocaleString()}자 · 어떤 AI 채팅에든 붙여 넣으면 됩니다</span>
      </div>
    </div>
  )
}
