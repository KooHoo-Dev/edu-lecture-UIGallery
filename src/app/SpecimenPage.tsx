import { useCallback, useEffect, useMemo, useState } from 'react'
import { prefersReducedMotion } from '../core/flash'
import { applyOverrides, applyPreset, defaultParams } from '../core/params'
import type { UiSystem } from '../core/types'
import { findSpecimen, PLANNED, SPECIMENS } from '../core/registry'
import { GROUPS, INPUTS, PARADIGMS, PLATFORMS } from '../core/taxonomy'
import type { Aspect, ParamValues, StageTrigger } from '../core/types'
import { isTyping } from './App'
import { ControlPanel } from './ControlPanel'
import { PlayBar } from './PlayBar'
import { PromptPanel } from './PromptPanel'
import { Rich } from './Rich'
import { hrefSpecimen, type SpecimenUrlOptions } from './router'
import { Stage } from './Stage'
import { UnityPanel } from './UnityPanel'

const SPEEDS = [1, 0.5, 0.25]

export function SpecimenPage({ id, presetId, opts, presenter }: { id: string; presetId?: string; opts: SpecimenUrlOptions; presenter: boolean }) {
  const mod = findSpecimen(id)
  if (!mod) {
    return (
      <div className="notfound">
        <h1>표본을 찾을 수 없습니다</h1>
        <p>
          <code>{id}</code> — 주소가 바뀌었거나 아직 제작 중인 표본입니다. <a href="#/">갤러리로 돌아가기</a>
        </p>
      </div>
    )
  }
  return <SpecimenView mod={mod} presetId={presetId} opts={opts} presenter={presenter} />
}

function SpecimenView({
  mod,
  presetId,
  opts,
  presenter,
}: {
  mod: NonNullable<ReturnType<typeof findSpecimen>>
  presetId?: string
  opts: SpecimenUrlOptions
  presenter: boolean
}) {
  const m = mod.meta
  const initialPreset = m.presets.find(p => p.id === presetId)
  const [params, setParams] = useState<ParamValues>(() =>
    applyOverrides(m.params, initialPreset ? applyPreset(m.params, initialPreset) : defaultParams(m.params), opts.params),
  )
  const [presetActive, setPresetActive] = useState<string | null>(initialPreset?.id ?? null)
  const [playing, setPlaying] = useState(true)
  const [juice, setJuice] = useState(opts.juice ?? true)
  const [speed, setSpeed] = useState(opts.speed ?? 1)
  const [autoplay, setAutoplay] = useState(() => opts.auto ?? (!prefersReducedMotion() && !opts.event))
  const [trigger, setTrigger] = useState<StageTrigger | null>(null)
  const [aspect, setAspect] = useState<Aspect>(opts.aspect && m.stage.aspect === 'both' ? opts.aspect : m.stage.aspect === '9:16' ? '9:16' : '16:9')
  const [showSpots, setShowSpots] = useState(opts.spots ?? true)
  const [activeSpot, setActiveSpot] = useState<number | null>(opts.spot ?? null)
  const [tab, setTab] = useState<'controls' | 'notes'>('controls')
  const [uiSystem, setUiSystem] = useState<UiSystem>('ugui')

  const fire = useCallback((eid: string) => setTrigger(t => ({ id: eid, seq: (t?.seq ?? 0) + 1 })), [])

  // ?event=<id> : 페이지가 열리고 잠시 뒤 이벤트를 한 번 발생 (수업 자료 링크·자동 검사용)
  useEffect(() => {
    if (!opts.event) return
    const t = setTimeout(() => fire(opts.event!), 400)
    return () => clearTimeout(t)
  }, [opts.event, fire])
  const stepSpot = useCallback(
    (dir: 1 | -1) => {
      setShowSpots(true)
      setActiveSpot(cur => {
        const ns = m.hotspots.map(h => h.n)
        if (!ns.length) return null
        if (cur == null) return dir > 0 ? ns[0] : ns[ns.length - 1]
        const i = ns.indexOf(cur) + dir
        return i < 0 || i >= ns.length ? null : ns[i]
      })
    },
    [m.hotspots],
  )

  // 수업용 단축키
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        setPlaying(v => !v)
      } else if (k === 'j') setJuice(v => !v)
      else if (k === 's') setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])
      else if (k === 'a') setAutoplay(v => !v)
      else if (k === 'h') setShowSpots(v => !v)
      else if (k === 'arrowright' && !(e.target instanceof HTMLInputElement)) stepSpot(1)
      else if (k === 'arrowleft' && !(e.target instanceof HTMLInputElement)) stepSpot(-1)
      else if (/^[1-9]$/.test(k)) {
        const ev = m.events[Number(k) - 1]
        if (ev) fire(ev.id)
      }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [fire, stepSpot, m.events])

  const idx = SPECIMENS.findIndex(s => s.meta.id === m.id)
  const prev = SPECIMENS[idx - 1]
  const next = SPECIMENS[idx + 1]
  const spotList = useMemo(() => m.hotspots, [m.hotspots])

  return (
    <article className="specimen" data-presenter={presenter || undefined}>
      <header className="spec-head">
        <a className="back" href="#/">
          ← 갤러리
        </a>
        <div className="spec-title">
          <p className="eyebrow">
            {m.group} · {GROUPS[m.group].name}
          </p>
          <h1>
            {m.title} <span className="en">{m.titleEn}</span>
          </h1>
          <p className="lead">{m.oneLiner}</p>
        </div>
        <div className="spec-tags">
          {m.paradigms.map(p => (
            <span key={p} className="chip" data-p={p} title={PARADIGMS[p].desc}>
              {PARADIGMS[p].name}
            </span>
          ))}
          {m.principles.map(p => (
            <span key={p} className="chip chip-outline">
              {p}
            </span>
          ))}
          <span className="chip chip-outline">Unity 난이도 {'★'.repeat(m.difficulty)}</span>
          <span className="chip chip-outline">Unity 6.3 LTS</span>
          {m.flashes && (
            <span className="chip chip-warn" title="번쩍이는 효과가 있습니다. 초당 3회 이하로 제한됩니다.">
              번쩍임 포함
            </span>
          )}
        </div>
      </header>

      <div className="spec-main">
        <div className="spec-stage-col">
          <Stage
            mod={mod}
            params={params}
            juice={juice}
            playing={playing}
            timeScale={speed}
            trigger={trigger}
            autoplay={autoplay}
            aspect={aspect}
            presenter={presenter}
            webglOff={opts.webgl === false}
            showBadges
            hotspots={{ list: spotList, active: activeSpot, visible: showSpots, onSelect: setActiveSpot }}
          />
          <PlayBar
            playing={playing}
            onPlaying={setPlaying}
            speed={speed}
            speeds={SPEEDS}
            onSpeed={setSpeed}
            juice={juice}
            onJuice={setJuice}
            autoplay={autoplay}
            onAutoplay={setAutoplay}
            events={m.events}
            onEvent={fire}
            showSpots={showSpots}
            onShowSpots={setShowSpots}
            onStep={stepSpot}
            spotLabel={activeSpot ? `${activeSpot} / ${m.hotspots.length}` : `– / ${m.hotspots.length}`}
            aspect={aspect}
            aspects={m.stage.aspect === 'both' ? ['16:9', '9:16'] : null}
            onAspect={setAspect}
          />
          {!juice && (
            <p className="juice-note" role="status">
              <b>나쁜 예:</b> <Rich text={m.juiceOff} />
            </p>
          )}
        </div>

        <aside className="spec-side" aria-label="조절과 해설">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'controls'} onClick={() => setTab('controls')}>
              값 조절
            </button>
            <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
              왜 좋은가 <span className="count">{m.hotspots.length}</span>
            </button>
          </div>
          {tab === 'controls' ? (
            <ControlPanel
              defs={m.params}
              presets={m.presets}
              values={params}
              activePreset={presetActive}
              onChange={(k, v) => {
                setParams(p => ({ ...p, [k]: v }))
                setPresetActive(null)
              }}
              onPreset={p => {
                setParams(applyPreset(m.params, p))
                setPresetActive(p.id)
                history.replaceState(null, '', hrefSpecimen(m.id, p.id))
              }}
              onReset={() => {
                setParams(defaultParams(m.params))
                setPresetActive(null)
                history.replaceState(null, '', hrefSpecimen(m.id))
              }}
            />
          ) : (
            <ol className="spot-list">
              {m.hotspots.map(h => (
                <li key={h.n}>
                  <button
                    className="spot-item"
                    aria-pressed={activeSpot === h.n}
                    onClick={() => {
                      setShowSpots(true)
                      setActiveSpot(activeSpot === h.n ? null : h.n)
                    }}
                  >
                    <span className="hotspot-num">{h.n}</span>
                    <span>
                      <b>{h.title}</b>
                      <span className="chip chip-sm">{h.principle}</span>
                      <span className="spot-body">
                        <Rich text={h.body} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="kbd-help" aria-label="단축키">
            <span><kbd>Space</kbd> 재생</span>
            <span><kbd>1</kbd>~<kbd>{Math.max(1, m.events.length)}</kbd> 이벤트</span>
            <span><kbd>J</kbd> 효과</span>
            <span><kbd>S</kbd> 배속</span>
            <span><kbd>A</kbd> 자동 데모</span>
            <span><kbd>H</kbd> 번호</span>
            <span><kbd>←</kbd><kbd>→</kbd> 해설</span>
            <span><kbd>P</kbd> 발표</span>
          </div>
        </aside>
      </div>

      <div className="spec-sections">
        <section className="sec">
          <h2>학습 목표</h2>
          <ul className="goals">
            {m.goals.map((g, i) => (
              <li key={i}>
                <Rich text={g} />
              </li>
            ))}
          </ul>
        </section>

        <section className="sec">
          <h2>흔한 실수</h2>
          <ul className="mistakes">
            {m.mistakes.map((x, i) => (
              <li key={i}>
                <b>{x.title}</b>
                <p>
                  <Rich text={x.body} />
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="sec sec-wide">
          <h2>타이밍</h2>
          <div className="table-wrap">
            <table className="timings">
              <thead>
                <tr>
                  <th>동작</th>
                  <th>시간</th>
                  <th>이징</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {m.timings.map((t, i) => (
                  <tr key={i}>
                    <td>{t.event}</td>
                    <td className="mono">{t.ms} ms</td>
                    <td className="mono">{t.easing}</td>
                    <td>{t.note && <Rich text={t.note} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sec sec-wide">
          <h2>Unity 구현</h2>
          <UnityPanel id={m.id} unity={m.unity} system={uiSystem} onSystem={setUiSystem} />
          <PromptPanel meta={m} system={uiSystem} values={params} />
        </section>

        <section className="sec">
          <h2>Inspired by</h2>
          <ul className="inspired">
            {m.inspiredBy.map((x, i) => (
              <li key={i}>
                <div className="inspired-head">
                  <b>{x.link ? <a href={x.link} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title}</b>
                  <span className="credit">{x.credit}</span>
                </div>
                <div className="borrowed">
                  빌린 것:{' '}
                  {x.borrowed.map(b => (
                    <span key={b} className="chip chip-sm chip-outline">
                      {b}
                    </span>
                  ))}
                </div>
                <p>
                  <Rich text={x.learned} />
                </p>
              </li>
            ))}
          </ul>
          <p className="original">
            <b>새로 만든 것:</b> <Rich text={m.original} />
          </p>
        </section>

        <section className="sec">
          <h2>더 보기</h2>
          {m.related && m.related.length > 0 && (
            <ul className="related">
              {m.related.map(r => {
                const done = findSpecimen(r.id)
                const title = done?.meta.title ?? PLANNED.find(p => p.id === r.id)?.title ?? r.id
                return (
                  <li key={r.id}>
                    {done ? <a href={hrefSpecimen(r.id)}>{title}</a> : <span>{title} (제작 중)</span>}
                    <span className="related-why"> — <Rich text={r.why} /></span>
                  </li>
                )
              })}
            </ul>
          )}
          <ul className="refs">
            {m.references.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
          <dl className="meta-list">
            <dt>플랫폼</dt>
            <dd>{m.platforms.map(p => PLATFORMS[p]).join(', ')}</dd>
            <dt>입력</dt>
            <dd>{m.inputs.map(p => INPUTS[p]).join(', ')}</dd>
            <dt>장르</dt>
            <dd>{m.genres.join(', ')}</dd>
          </dl>
        </section>
      </div>

      <nav className="spec-nav" aria-label="다른 표본">
        {prev ? <a href={hrefSpecimen(prev.meta.id)}>← {prev.meta.title}</a> : <span />}
        {next ? <a href={hrefSpecimen(next.meta.id)}>{next.meta.title} →</a> : <span />}
      </nav>
    </article>
  )
}
