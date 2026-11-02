import type { ParamDef, ParamValue, ParamValues, SpecimenMeta, UiSystem, UnityGuide } from './types'

/* AI 지시 프롬프트. 특정 AI 도구에 묶지 않는 평범한 Markdown 이다.
 * 상세 페이지의 프롬프트 패널이 이 함수만 부른다. Shader 갤러리의 core/prompts.ts 를 UI 표본에 맞게 옮겼다. */

export type PromptKind = 'direct' | 'adapt' | 'troubleshoot'

export const PROMPT_LABELS: Record<PromptKind, { name: string; desc: string }> = {
  direct: { name: '그대로 넣기', desc: '코드를 바꾸지 않고 내 프로젝트에 추가한다' },
  adapt: { name: '내 프로젝트에 맞게 변형', desc: '대괄호 칸을 채워 원하는 방향으로 바꾼다' },
  troubleshoot: { name: '문제 해결', desc: '넣었는데 안 될 때 증상을 적어 맡긴다' },
}

export const SYSTEM_LABELS: Record<UiSystem, string> = { ugui: 'UGUI (Canvas)', uitk: 'UI Toolkit' }

export const otherSystem = (system: UiSystem): UiSystem => (system === 'ugui' ? 'uitk' : 'ugui')

const title = (verb: string, meta: SpecimenMeta, system: UiSystem) => `# Unity UI ${verb}: ${meta.title} — ${SYSTEM_LABELS[system]}`

const SYSTEM_ENV: Record<UiSystem, string> = {
  ugui: '- UI: UGUI (Canvas) + TextMeshPro',
  uitk: '- UI: UI Toolkit 런타임 UI (UIDocument + UXML + USS)',
}

function environment(system: UiSystem): string {
  return ['- Unity 6.3 LTS (6000.3)', '- 입력: 새 Input System 패키지 (구 Input Manager 는 쓰지 않음)', SYSTEM_ENV[system]].join('\n')
}

/** 프롬프트에 항상 들어가는 금지 사항. docs/specimen-guide.md 8절 · docs/agent-contract.md 의 Unity 코드 규칙에서 뽑았다 */
export function fixedRules(system: UiSystem): string {
  return [
    '- 입력은 새 Input System 으로만 받는다. `Input.GetKey`, `Input.GetAxis`, `Input.mousePosition` 같은 구 Input Manager API 는 쓰지 않는다.',
    '- `FindObjectOfType` 대신 `FindFirstObjectByType` 이나 `FindAnyObjectByType` 를, `Rigidbody.velocity` 대신 `linearVelocity` 를 쓴다.',
    system === 'ugui'
      ? '- 글자는 TextMeshPro(`TextMeshProUGUI`)로 그린다. 구 `UnityEngine.UI.Text` 는 쓰지 않는다.'
      : '- 화면은 `UIDocument` + UXML + USS 로 만든다. USS 에 없는 CSS 기능(gradient, filter, box-shadow 등)은 쓰지 않는다. 필요하면 이미지나 `Painter2D` 로 그린다.',
    '- 애니메이션과 타이머는 코루틴이나 `Update` 로 만든다. DOTween 같은 외부 패키지는 쓰지 않는다.',
    '- 각 파일 맨 위에 그 파일이 무엇을 하는지 한국어 주석을 둔다.',
    '- 형식은 파일에 있는 `namespace UIGallery.…` 블록 안에 둔다. 새 파일도 같은 namespace 를 쓴다. 다른 UI 와 이름이 겹쳐도 컴파일되게 하려는 것이다. Unity 6 은 C# 9 라 `namespace X;` 한 줄 형식은 쓰지 않는다.',
    '- 이 코드는 웹 갤러리의 표본을 Unity 로 옮긴 것이다. 웹 미리보기(React) 코드는 갤러리용이라 옮기지 않았고 이 프로젝트에는 없다. 웹 쪽 수정이나 주의 사항은 적지 않는다.',
  ].join('\n')
}

export interface PromptFile {
  name: string
  lang: 'csharp' | 'xml' | 'css'
  code: string
}

export interface PromptSource {
  meta: SpecimenMeta
  system: UiSystem
  files: PromptFile[]
  /** 다른 UI 시스템 폴더에 있지만 이 시스템 코드가 같이 쓰는 파일 (sharedFiles 로 고른다) */
  shared?: PromptFile[]
}

/* ── C# 구조 읽기 ───────────────────────────────────────────────────
 * 컴파일러가 아니라 이 갤러리의 Unity 코드 정도를 읽는 가벼운 해석이다. 파일마다 한 번만 읽어 둔다(조절 값을 끌 때마다 다시 읽지 않게). */

interface CsType {
  name: string
  /** 첫 번째 부모 형식 (class A : MonoBehaviour → MonoBehaviour) */
  base: string | null
  kind: string
  /** 본문 중괄호 위치 */
  open: number
  close: number
  /** 감싸는 형식 (중첩 형식이면). namespace 는 형식이 아니다 */
  outer: CsType | null
}

interface CsField {
  owner: CsType
  name: string
  type: string
  init: string | null
  file: PromptFile
}

interface CsFile {
  code: string
  types: CsType[]
  fields: CsField[]
}

/** 주석과 문자열 · 문자 리터럴을 지운 C# (선언 · 중괄호를 셀 때 글자 속 기호에 속지 않게). 길이는 달라진다 */
function codeOnly(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|@"(?:""|[^"])*"|\$?"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])'/g, m => (m.startsWith('/') ? ' ' : '""'))
}

const TYPE_DECL = /\b(class|struct|enum|interface|record)\s+([A-Za-z_]\w*)([^{;]*)\{/g
// [특성]… 한정자… 형식 이름 (= 초기값)? ;   — 특성이 다른 줄에 있어도 된다
const FIELD_DECL =
  /((?:\[[^\]]*\]\s*)*)((?:(?:public|private|protected|internal|static|readonly|const|new|volatile)\s+)*)([A-Za-z_][\w.]*(?:<[^<>;=(){}]*>)?(?:\[\])?\??)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;{}]+?))?\s*;/g

const parsed = new WeakMap<PromptFile, CsFile>()

function parseCs(file: PromptFile): CsFile {
  const hit = parsed.get(file)
  if (hit) return hit
  const code = codeOnly(file.code)
  const pairs: [number, number][] = []
  const stack: number[] = []
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') stack.push(i)
    else if (code[i] === '}' && stack.length) pairs.push([stack.pop()!, i])
  }
  /** i 를 가장 가깝게 감싸는 중괄호의 여는 위치 */
  const enclosing = (i: number) => pairs.reduce<number>((best, [o, c]) => (o < i && i < c && o > best ? o : best), -1)
  const closeOf = new Map(pairs)

  const types: CsType[] = []
  for (const m of code.matchAll(TYPE_DECL)) {
    const open = m.index + m[0].length - 1
    const base = /:\s*([A-Za-z_][\w.]*)/.exec(m[3])?.[1] ?? null
    types.push({ name: m[2], base, kind: m[1], open, close: closeOf.get(open) ?? code.length, outer: null })
  }
  for (const t of types) t.outer = types.filter(o => o.open < t.open && t.open < o.close).sort((a, b) => b.open - a.open)[0] ?? null

  const fields: CsField[] = []
  for (const m of code.matchAll(FIELD_DECL)) {
    const [, attrs, mods, type, name, init] = m
    const owner = types.find(t => t.open === enclosing(m.index) && t.kind !== 'enum')
    if (!owner) continue // 메서드 안의 지역 변수 · using 문 등
    if (/\b(?:static|const|readonly)\b/.test(mods) || /\bNonSerialized\b/.test(attrs)) continue
    if (!/\bSerializeField\b/.test(attrs) && !/\bpublic\b/.test(mods)) continue
    fields.push({ owner, name, type, init: init?.trim() ?? null, file })
  }
  const result = { code, types, fields }
  parsed.set(file, result)
  return result
}

const csFiles = (files: PromptFile[]) => files.filter(f => f.lang === 'csharp')

/* ── 다른 시스템 폴더에서 같이 쓰는 파일 ─────────────────────────── */

/** 형식으로 쓰였는지: 앞에 . 이 없고(멤버 접근 제외) 뒤에 ( 가 없거나(메서드 이름 제외) new 로 만든 것 */
const usesType = (code: string, type: string) => new RegExp(`(?<![\\w.])${type}\\b(?!\\s*\\()|\\bnew\\s+${type}\\b`).test(code)

/**
 * 이 시스템 코드가 쓰는데 다른 시스템 폴더에만 선언된 C# 형식의 파일. 그 파일이 또 쓰는 파일도 따라간다.
 * 예: UI Toolkit 판이 UGUI 폴더의 CardData · EnemyIntent 를 같이 쓴다. 빠뜨리면 그대로 넣어도 컴파일되지 않는다.
 * 중첩 형식(Outer.Line)은 바깥 형식 이름으로 쓰이므로 맨 바깥 형식만 본다.
 * guide 를 주면 그 설명(하이어라키 · 절차 · 주의)이 이름으로 가리키는 파일도 넣는다. 코드가 아니라 오브젝트에 붙여 쓰는 컴포넌트(예: BoneFollower)가 그렇다.
 */
export function sharedFiles(files: PromptFile[], others: PromptFile[], guide?: UnityGuide): PromptFile[] {
  const own = new Set(csFiles(files).flatMap(f => parseCs(f).types.map(t => t.name)))
  const text = guide ? [guide.hierarchy, ...guide.steps, ...guide.pitfalls].join('\n') : ''
  // `Name.cs` 또는 뒤에 다른 확장자가 붙지 않은 `Name` (HealthBarTrail.uxml 은 HealthBarTrail.cs 가 아니다)
  const named = (o: PromptFile) => new RegExp(`(?<![\\w.])${o.name.replace(/\.cs$/, '')}(?:\\.cs\\b|(?![\\w.]))`).test(text)
  const candidates = csFiles(others)
  const picked = candidates.filter(named)
  let frontier = [...csFiles(files), ...picked]
  while (frontier.length) {
    const used = frontier.map(f => parseCs(f).code).join('\n')
    const next = candidates.filter(
      o => !picked.includes(o) && parseCs(o).types.some(t => !t.outer && !own.has(t.name) && usesType(used, t.name)),
    )
    picked.push(...next)
    frontier = next
  }
  return picked
}

/* ── 글 변환 ───────────────────────────────────────────────────── */

/**
 * 갤러리 글의 서식(**굵게**, `코드`, [링크](...))을 Markdown 으로.
 * 갤러리 안 링크(#/s/...)는 밖에서 열리지 않으니 글자만 남기고, 코드 밖의 ~ 는 취소선이 되지 않게 \~ 로 바꾼다 ("1~5").
 */
export function richToMarkdown(text: string): string {
  return text
    .replace(/\[(.+?)\]\((#\/[^)\s]+)\)/g, '$1')
    .split(/(`[^`]*`)/)
    .map(part => (part.startsWith('`') ? part : part.replace(/~/g, '\\~')))
    .join('')
}

/** 프롬프트에 파일을 둘 폴더 */
export function unityFolder(id: string, system: UiSystem): string {
  return `Assets/UIGallery/${id}/${system}/`
}

/* ── 조절 값 → Unity 필드 ───────────────────────────────────────────
 * 웹 조절 값과 이름이 같은(ms 값은 …Seconds 등도) 직렬화 필드를 찾고, 형(型)과 단위가 확인될 때만 짝을 짓는다.
 * 단위를 확인하지 못하면 짝짓지 않는다. 틀린 값을 넣게 하느니 값 표만 두는 편이 낫다.
 * 필드가 [Serializable] 설정 묶음 안에 있으면 그 묶음을 들고 있는 컴포넌트부터 경로를 적는다 (ToastStackView.config.maxVisible). */

export interface FieldMatch {
  /** 인스펙터에서 찾아가는 경로 (컴포넌트 또는 에셋 형식부터) */
  path: string
  /** ScriptableObject 에셋의 값인가 */
  asset: boolean
  /** 인스펙터에 넣을 값 (인스펙터에 보이는 표기) */
  value: string
}

const NUMBER_TYPES = new Set(['float', 'int', 'long', 'double'])
/** 인스펙터에 직접 나타나는 Unity 형식 */
const COMPONENT_BASES = new Set(['MonoBehaviour', 'BaseMeshEffect', 'UIBehaviour', 'Graphic', 'MaskableGraphic', 'Selectable', 'StateMachineBehaviour'])

const lastName = (type: string) => type.replace(/<.*$/, '').split('.').pop()!

/** 형식이 인스펙터의 뿌리(컴포넌트 · 에셋)인지. 부모를 따라 올라간다 */
function rootKind(type: CsType, types: CsType[], seen = new Set<CsType>()): 'component' | 'asset' | null {
  if (!type.base || seen.has(type)) return null
  if (type.base === 'ScriptableObject') return 'asset'
  if (COMPONENT_BASES.has(type.base)) return 'component'
  seen.add(type)
  const parent = types.find(t => t.name === lastName(type.base!))
  return parent ? rootKind(parent, types, seen) : null
}

/** 인스펙터에서 이 형식의 값까지 가는 경로. 설정 묶음이면 그것을 들고 있는 필드를 거슬러 오른다 */
function inspectorPath(type: CsType, types: CsType[], fields: CsField[], depth = 0): { path: string[]; asset: boolean } | null {
  const root = rootKind(type, types)
  if (root) return { path: [type.name], asset: root === 'asset' }
  if (depth > 3 || type.kind === 'interface') return null
  for (const holder of fields) {
    if (holder.owner === type || lastName(holder.type) !== type.name) continue
    const up = inspectorPath(holder.owner, types, fields, depth + 1)
    if (up) return { path: [...up.path, holder.name], asset: up.asset }
  }
  return null
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** 인스펙터의 enum 표기 (CategoryPages → Category Pages) */
const nicify = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')

function enumMembers(files: PromptFile[], type: string): string[] | null {
  for (const f of csFiles(files)) {
    const { code, types } = parseCs(f)
    const e = types.find(t => t.kind === 'enum' && t.name === lastName(type))
    if (e) return code.slice(e.open + 1, e.close).split(',').map(s => s.trim().split(/\s|=/)[0]).filter(Boolean)
  }
  return null
}

function inspectorNumber(v: number, type: string): string {
  return type === 'float' || type === 'double' ? String(v) : String(Math.round(v))
}

/** 웹 단위 → 코드에서 흔히 쓰는 단위로 나눌 값 (ms → 초, % → 0~1 비율) */
const CONVERTIBLE: Record<string, { factor: number; to: string }> = {
  ms: { factor: 1000, to: '초' },
  '%': { factor: 100, to: '0~1 비율' },
  '%/초': { factor: 100, to: '비율/초' },
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-6
const isPow10 = (r: number) => [10, 100, 1000, 0.1, 0.01, 0.001].some(p => near(r, p))

/** 찾아볼 필드 이름. ms 값은 단위를 뺀 이름과 …Seconds 도 본다 (queueGapMs → queueGap, queueGapSeconds) */
function candidateNames(def: ParamDef): string[] {
  if (def.type !== 'range' || def.unit !== 'ms' || !/Ms$/.test(def.key)) return [def.key]
  const stem = def.key.slice(0, -2)
  return [def.key, stem, `${stem}Seconds`]
}

/**
 * 웹 값을 코드 필드 단위로 바꾸는 배율. 1 = 그대로, null = 단위를 확인하지 못해 짝짓지 않음.
 * ms · % 는 기본값끼리의 비율(1 또는 변환 배율)로, 기본값이 없거나 0 이면 이름 꼬리(…Ms · …Seconds)로 확인한다.
 * 그 밖의 단위(px · ° · 배율)는 이름이 같으면 같은 단위로 본다. 기본값은 달라도 되지만 10의 거듭제곱만큼 어긋나면 뺀다.
 */
function unitFactor(def: Extract<ParamDef, { type: 'range' }>, field: string, codeDefault: number): number | null {
  const conv = def.unit ? CONVERTIBLE[def.unit] : undefined
  const renamed = field !== def.key
  const known = Number.isFinite(codeDefault) && codeDefault !== 0 && def.default !== 0
  if (!conv) {
    if (renamed) return null
    return known && isPow10(def.default / codeDefault) ? null : 1
  }
  if (known) {
    const ratio = def.default / codeDefault
    if (near(ratio, conv.factor)) return conv.factor
    return near(ratio, 1) && !renamed ? 1 : null
  }
  if (def.unit !== 'ms') return null
  if (/Ms$/.test(field)) return 1
  return /Seconds$/.test(field) ? conv.factor : null
}

/** 색 선택 창의 Hexadecimal 칸에 넣는 표기 */
function inspectorHex(hex: string): string | null {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h.slice(0, 6)
  return /^[0-9a-f]{6}$/i.test(full) ? full.toUpperCase() : null
}

function fieldValue(def: ParamDef, value: ParamValue, field: CsField, files: PromptFile[]): string | null {
  const { type } = field
  if (def.type === 'range' && NUMBER_TYPES.has(type) && typeof value === 'number') {
    const factor = unitFactor(def, field.name, field.init ? parseFloat(field.init) : NaN)
    if (factor === null) return null
    if (factor === 1) return inspectorNumber(value, type)
    const converted = +(value / factor).toFixed(4)
    return `${inspectorNumber(converted, type)} (${CONVERTIBLE[def.unit!].to} 단위: ${value} ${def.unit} ÷ ${factor})`
  }
  if (def.type === 'toggle' && type === 'bool' && typeof value === 'boolean') return value ? '체크' : '체크 해제'
  if (def.type === 'color' && type === 'Color' && typeof value === 'string') {
    const hex = inspectorHex(value)
    return hex ? `Hexadecimal ${hex}` : null
  }
  if (def.type === 'select' && typeof value === 'string') {
    const member = enumMembers(files, type)?.find(n => norm(n) === norm(value))
    return member ? `${nicify(member)} (\`${lastName(type)}.${member}\`)` : null
  }
  return null
}

/**
 * 조절 값과 짝이 되는 인스펙터 필드. 이 시스템 컴포넌트에서 시작하는 경로를 먼저 고른다.
 * 같이 쓰는 파일(shared)의 형식은 설정 묶음 · 에셋으로는 쓰지만, 컴포넌트로는 설명(guide)이 이름을 부를 때만 쓴다.
 * (UI Toolkit 판이 UGUI 의 EnemyView.cs 를 형식 때문에 같이 쓰더라도 EnemyView 컴포넌트를 씬에 두지는 않는다)
 */
export function matchField(def: ParamDef, value: ParamValue, files: PromptFile[], shared: PromptFile[] = [], guide?: UnityGuide): FieldMatch | null {
  const all = csFiles([...files, ...shared]).map(parseCs)
  const types = all.flatMap(f => f.types)
  const fields = all.flatMap(f => f.fields)
  const own = new Set(csFiles(files).flatMap(f => parseCs(f).types))
  const text = guide ? [guide.hierarchy, ...guide.steps, ...guide.pitfalls].join('\n') : ''
  const rootType = (path: string[]) => types.find(t => t.name === path[0] && !t.outer)
  let fallback: FieldMatch | null = null
  for (const name of candidateNames(def)) {
    for (const field of fields) {
      if (field.name !== name) continue
      const shown = fieldValue(def, value, field, [...files, ...shared])
      if (shown === null) continue
      const at = inspectorPath(field.owner, types, fields)
      if (!at) continue
      const root = rootType(at.path)
      const match = { path: [...at.path, field.name].join('.'), asset: at.asset, value: shown }
      if (root && own.has(root)) return match
      if (!fallback && (at.asset || usesType(text, at.path[0]))) fallback = match
    }
  }
  return fallback
}

function displayValue(def: ParamDef, value: ParamValue): string {
  if (def.type === 'toggle') return value ? '켬' : '끔'
  if (def.type === 'select') return def.options.find(o => o.value === value)?.label ?? String(value)
  if (def.type === 'range') return `${value}${def.unit ? ` ${def.unit}` : ''}`
  return String(value)
}

const cell = (s: string) => richToMarkdown(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** 지금 조절 값 표. 짝이 되는 Unity 필드가 하나라도 있으면 열을 둘 더 둔다 */
export function valueTable(source: PromptSource, values: ParamValues): { table: string; matched: number } {
  const guide = source.meta.unity[source.system]
  const rows = source.meta.params.map(def => {
    const value = values[def.key] ?? def.default
    return { def, value, match: matchField(def, value, source.files, source.shared, guide) }
  })
  const matched = rows.filter(r => r.match).length
  const head = matched ? '| 조절 값 | 지금 값 | Unity 필드 | 인스펙터 값 |\n|---|---|---|---|' : '| 조절 값 | 지금 값 |\n|---|---|'
  const body = rows.map(({ def, value, match }) => {
    const name = `${cell(def.label)} (\`${def.key}\`)`
    const shown = cell(displayValue(def, value))
    if (!matched) return `| ${name} | ${shown} |`
    if (!match) return `| ${name} | ${shown} | 없음 |  |`
    return `| ${name} | ${shown} | \`${match.path}\`${match.asset ? ' (에셋)' : ''} | ${cell(match.value)} |`
  })
  return { table: [head, ...body].join('\n'), matched }
}

/* ── 조립 ─────────────────────────────────────────────────────── */

function fenceFor(code: string): string {
  const longest = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map(s => s.length))
  return '`'.repeat(longest + 1)
}

function fileBlock(folder: string, f: PromptFile): string {
  const code = f.code.replace(/\r\n/g, '\n').trimEnd()
  const fence = fenceFor(code)
  return `### ${folder}${f.name}\n\n${fence}${f.lang}\n${code}\n${fence}`
}

function codeSection(source: PromptSource): string {
  const { meta, system, files, shared = [] } = source
  const own = files.map(f => fileBlock(unityFolder(meta.id, system), f))
  if (!shared.length) return own.join('\n\n')
  const other = otherSystem(system)
  const note = `아래 ${shared.length}개는 ${SYSTEM_LABELS[other]} 폴더의 파일이지만 이 ${SYSTEM_LABELS[system]} 판도 같이 쓴다(데이터 · 계산 · 시험용 스크립트 등). 함께 만들어야 컴파일되고 설명대로 동작한다.`
  return [...own, note, ...shared.map(f => fileBlock(unityFolder(meta.id, other), f))].join('\n\n')
}

const numbered = (lines: string[]) => lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
const bullets = (lines: string[]) => lines.map(line => `- ${line}`).join('\n')

function purpose(meta: SpecimenMeta): string {
  return `${richToMarkdown(meta.oneLiner)}\n\n이 표본의 학습 목표:\n${bullets(meta.goals.map(richToMarkdown))}`
}

/** 해설 글 중 갤러리 화면을 조작하라는 말 ("꺼 보자", "프리셋") — 프롬프트에서는 뜻이 없다 */
const GALLERY_ONLY = /보자|눌러 보|꺼 보|켜 보|바꿔 보|프리셋|갤러리|번호가 붙은/

/** 문제 해결의 기준: 화면의 각 부분이 무엇을 해야 하는지. 해설 번호의 제목과 첫 문장을 쓴다 ("비교:" 번호는 다른 방식 소개라 뺀다) */
function expected(meta: SpecimenMeta): string {
  const parts = meta.hotspots
    .filter(h => !/^비교/.test(h.title))
    .map(h => {
      const first = richToMarkdown(h.body).split(/(?<=[다요]\.)\s+/)[0]
      const head = `**${richToMarkdown(h.title)}**`
      return GALLERY_ONLY.test(first) ? head : `${head}: ${first}`
    })
  return `각 부분이 이렇게 동작해야 한다:\n${bullets(parts)}`
}

function hierarchy(meta: SpecimenMeta, system: UiSystem): string {
  return `\`\`\`text\n${meta.unity[system].hierarchy.replace(/\r\n/g, '\n').trimEnd()}\n\`\`\``
}

function tableNote(matched: number): string {
  return matched
    ? '갤러리에서 맞춘 값이다. Unity 필드가 적힌 값은 "인스펙터 값" 열대로 넣는다(단위가 다르면 바꾼 값이 적혀 있다). 경로는 컴포넌트(또는 에셋)부터 적었다. "없음" 은 이름과 단위가 맞는 인스펙터 필드가 없다는 뜻이다. 웹 미리보기 전용이거나 코드 상수 · USS 에 들어 있는 값이다.'
    : '갤러리에서 맞춘 값이다. 이 표본의 Unity 코드에는 이름과 단위가 맞는 인스펙터 필드가 없다. 코드의 상수나 USS 값과 비교할 기준으로만 쓴다.'
}

export function buildPrompt(kind: PromptKind, source: PromptSource, values: ParamValues): string {
  const { meta, system } = source
  const guide = meta.unity[system]
  const folder = unityFolder(meta.id, system)
  const sharedNote = source.shared?.length ? ` 같이 쓰는 ${SYSTEM_LABELS[otherSystem(system)]} 파일은 \`${unityFolder(meta.id, otherSystem(system))}\` 에 둔다.` : ''
  const { table, matched } = valueTable(source, values)
  const code = codeSection(source)
  const steps = guide.steps.map(richToMarkdown)
  const pitfalls = guide.pitfalls.map(richToMarkdown)
  const mistakes = meta.mistakes.map(m => `**${richToMarkdown(m.title)}**: ${richToMarkdown(m.body)}`)
  const valuesSection = (heading: string) => `## ${heading}\n${tableNote(matched)}\n\n${table}`

  if (kind === 'direct') {
    const todo = [
      `아래 파일을 \`${folder}\` 에 그대로 만든다.${sharedNote} 코드는 바꾸지 않는다.`,
      '"설치 절차" 대로 씬과 인스펙터를 구성한다. 코드 동작을 설명하는 항목은 이미 파일에 들어 있으니 다시 만들지 말고 확인만 한다.',
      ...(matched ? ['"지금 조절 값" 표에서 Unity 필드가 적힌 값을 인스펙터에 넣는다.'] : []),
      'Play 모드에서 위 목적대로 동작하는지, Console 에 오류가 없는지 확인한다.',
    ]
    return [
      title('추가', meta, system),
      purpose(meta),
      `## 환경\n${environment(system)}`,
      `## 할 일\n${numbered(todo)}`,
      `## 계층 구조\n${hierarchy(meta, system)}`,
      `## 설치 절차\n${numbered(steps)}`,
      valuesSection('지금 조절 값'),
      `## 지킬 것\n${fixedRules(system)}`,
      `## 주의할 점\n${bullets(pitfalls)}`,
      `## 이 UI 가 피하는 흔한 실수\n${bullets(mistakes)}`,
      `## 파일\n\n${code}`,
    ].join('\n\n')
  }

  if (kind === 'adapt') {
    const ideas = meta.presets.filter(p => p.look).map(p => `${richToMarkdown(p.name)}: ${richToMarkdown(p.look!)}`)
    return [
      title('변형', meta, system),
      '아래 UI 를 기준으로 내 프로젝트에 맞게 바꿔 줘.',
      `## 원래 목적\n${purpose(meta)}`,
      `## 환경\n${environment(system)}\n- 기준 해상도: [예: 1920×1080 가로 또는 1080×1920 세로]\n- 플랫폼과 입력 장치: [PC 키보드 · 마우스, 게임패드, 모바일 터치 중 해당]`,
      `## 바꾸고 싶은 점\n[여기에 적는다. 예: ${ideas[0] ?? '우리 게임의 색과 글꼴에 맞추고 게임패드로도 조작하고 싶다'}]`,
      `## 바꾸는 규칙\n${bullets([
        '바꾼 파일은 일부가 아니라 전체 내용을 출력한다. 바꾸지 않은 파일은 출력하지 않는다.',
        '새 조절 값은 인스펙터에서 바꿀 수 있게 `[SerializeField]` 필드로 둔다.',
        '아래 "이 UI 가 피하는 흔한 실수" 를 다시 만들지 않는다.',
        '하이어라키나 인스펙터 연결이 달라지면 바뀐 부분을 적는다.',
        '무엇을 왜 바꿨는지 세 줄 이내로 설명하고, 확인 방법을 적는다.',
      ])}`,
      `## 지킬 것\n${fixedRules(system)}`,
      ...(ideas.length ? [`## 변형 예시 (갤러리 프리셋)\n${bullets(ideas)}`] : []),
      `## 이 UI 가 피하는 흔한 실수\n${bullets(mistakes)}`,
      `## 현재 계층 구조\n${hierarchy(meta, system)}`,
      `## 현재 설치 절차\n${numbered(steps)}`,
      `## 주의할 점\n${bullets(pitfalls)}`,
      valuesSection('현재 조절 값'),
      `## 현재 파일\n\n${code}`,
    ].join('\n\n')
  }

  return [
    title('문제 해결', meta, system),
    '이 UI 를 넣었는데 제대로 동작하지 않아. 원인을 찾아 고쳐 줘.',
    `## 이 UI 의 목적\n${purpose(meta)}`,
    `## 환경\n${environment(system)}\n- 플랫폼과 입력 장치: [PC 키보드 · 마우스, 게임패드, 모바일 터치 중 해당]`,
    '## 증상\n- 보이는 모습: [여기에 적는다]\n- Console 오류: [있으면 그대로 붙인다]\n- 내가 넣은 곳과 순서: [여기에 적는다]',
    `## 먼저 확인할 것\n${bullets([...pitfalls, ...mistakes])}`,
    `## 고치는 규칙\n${bullets([
      '가능성이 높은 원인부터 하나씩 확인하게 안내한다. 한 번에 여러 곳을 바꾸지 않는다.',
      '설정 문제면 어느 오브젝트의 어느 컴포넌트, 어느 항목인지 적는다. 코드 문제면 바꾼 파일 전체를 출력한다.',
      '고친 뒤 확인 방법을 적는다.',
    ])}`,
    `## 지킬 것\n${fixedRules(system)}`,
    `## 정상 동작 기준\n${expected(meta)}`,
    `## 기준 계층 구조\n${hierarchy(meta, system)}`,
    `## 기준 설치 절차\n${numbered(steps)}`,
    valuesSection('기준 조절 값'),
    `## 기준 파일\n\n${code}`,
  ].join('\n\n')
}
