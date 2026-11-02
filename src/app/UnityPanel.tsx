import hljs from 'highlight.js/lib/core'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import { useMemo, useState } from 'react'
import { SYSTEM_LABELS } from '../core/prompts'
import { unityFiles } from '../core/registry'
import type { SpecimenMeta, UiSystem } from '../core/types'
import { writeText } from './clipboard'
import { Rich } from './Rich'

hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)

/** 고른 UI 시스템은 페이지가 들고 있다. 아래 프롬프트 패널이 같은 시스템의 파일을 쓴다 */
export function UnityPanel({ id, unity, system, onSystem }: { id: string; unity: SpecimenMeta['unity']; system: UiSystem; onSystem: (s: UiSystem) => void }) {
  const guide = unity[system]
  const files = useMemo(() => unityFiles(id, system), [id, system])
  const [fileIdx, setFileIdx] = useState(0)
  const file = files[Math.min(fileIdx, files.length - 1)]

  return (
    <div className="unity">
      <div className="tabs" role="tablist" aria-label="Unity UI 시스템">
        {(['ugui', 'uitk'] as UiSystem[]).map(k => (
          <button
            key={k}
            role="tab"
            aria-selected={system === k}
            onClick={() => {
              onSystem(k)
              setFileIdx(0)
            }}
          >
            {SYSTEM_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="unity-body">
        <div className="unity-guide">
          <h3>하이어라키</h3>
          <pre className="hierarchy">{guide.hierarchy}</pre>
          <h3>만드는 순서</h3>
          <ol>
            {guide.steps.map((s, i) => (
              <li key={i}>
                <Rich text={s} />
              </li>
            ))}
          </ol>
          <h3>주의할 점</h3>
          <ul className="pitfalls">
            {guide.pitfalls.map((s, i) => (
              <li key={i}>
                <Rich text={s} />
              </li>
            ))}
          </ul>
        </div>
        <div className="unity-code">
          {files.length === 0 ? (
            <p className="empty">코드 준비 중</p>
          ) : (
            <>
              <div className="file-tabs" role="tablist" aria-label="파일">
                {files.map((f, i) => (
                  <button key={f.name} role="tab" aria-selected={file === f} onClick={() => setFileIdx(i)}>
                    {f.name}
                  </button>
                ))}
              </div>
              <CodeBlock code={file.code} lang={file.lang} name={file.name} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function CodeBlock({ code, lang, name }: { code: string; lang: string; name: string }) {
  const html = useMemo(() => hljs.highlight(code.replace(/\r\n/g, '\n').trimEnd(), { language: lang }).value, [code, lang])
  const [copied, setCopied] = useState(false)
  return (
    <div className="code">
      <button
        className="btn btn-ghost code-copy"
        onClick={async () => {
          try {
            await writeText(code)
          } catch {
            return
          }
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        }}
        aria-label={`${name} 복사`}
      >
        {copied ? '복사됨' : '복사'}
      </button>
      <pre>
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}
