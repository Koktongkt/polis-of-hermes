import {
  host,
  useQuery,
  useValue,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  PALETTE_AREA,
  STATUSBAR_AREAS,
  Button,
  Codicon,
  StatusDot,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  haptic
} from '@hermes/plugin-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'polis-of-hermes'
const ROUTE = '/polis-of-hermes'
const PROFILE_REFRESH_MS = 5000
const ACTIVE_WINDOW_MS = 90_000
const RECENT_WINDOW_MS = 15 * 60_000
const OCCUPATIONS = ['herald', 'blacksmith', 'scholar', 'merchant', 'warrior', 'scribe']
const TERMINAL_PHASES = new Set(['complete', 'failed'])
const LIVE_ACTIVITY_TTL_MS = 20 * 60_000
const SETTLED_ACTIVITY_TTL_MS = 18_000
let pluginContext = null

const DEFAULT_OCCUPATIONS = {
  default: 'herald',
  cody: 'blacksmith',
  aivory: 'scholar',
  alpha_sage: 'merchant'
}

const OCCUPATION_META = {
  herald: { label: 'Herald of the Agora', building: 'The Agora', verb: 'coordinating the polis' },
  blacksmith: { label: 'Hephaestian Smith', building: 'The Bronze Forge', verb: 'working at the anvil' },
  scholar: { label: 'Scholar of the Mouseion', building: 'The Mouseion', verb: 'studying mechanisms' },
  merchant: { label: 'Keeper of the Stoa', building: 'The Market Stoa', verb: 'reading the ledgers' },
  warrior: { label: 'Guardian of the Polis', building: 'The Training Yard', verb: 'training with the blade' },
  scribe: { label: 'Scribe of the Archive', building: 'The Archive', verb: 'inscribing a scroll' }
}

const SITE_LAYOUTS = [
  { x: 60, y: 18 },
  { x: 29, y: 43 },
  { x: 91, y: 42 },
  { x: 61, y: 58 },
  { x: 22, y: 18 },
  { x: 100, y: 18 },
  { x: 18, y: 61 },
  { x: 104, y: 61 }
]

const cx = (...values) => values.filter(Boolean).join(' ')
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const sessionIds = profile => [
  profile?.canonical_session?.id,
  profile?.canonical_session?.resolved_id,
  profile?.last_session?.id,
  profile?.worker_session?.id
].filter(Boolean).map(String)

function timestampMs(value) {
  const n = Number(value || 0)
  if (!n) return 0
  return n < 10_000_000_000 ? n * 1000 : n
}

function profileActivity(profile, busyBySession, gateway) {
  if (gateway !== 'open') return 'offline'
  const ids = sessionIds(profile)
  if (ids.some(id => Boolean(busyBySession?.[id]))) return 'working'
  const workerAge = Date.now() - timestampMs(profile?.worker_session?.last_active)
  if (workerAge >= 0 && workerAge < ACTIVE_WINDOW_MS) return 'working'
  const latest = Math.max(
    timestampMs(profile?.canonical_session?.last_active),
    timestampMs(profile?.last_session?.last_active)
  )
  if (latest && Date.now() - latest < ACTIVE_WINDOW_MS) return 'working'
  if (latest && Date.now() - latest < RECENT_WINDOW_MS) return 'recent'
  return 'idle'
}

function activityLabel(status) {
  if (status === 'working') return 'Working now'
  if (status === 'waiting') return 'Needs your attention'
  if (status === 'failed') return 'Task failed'
  if (status === 'complete') return 'Task completed'
  if (status === 'recent') return 'Recently active'
  if (status === 'offline') return 'Gateway offline'
  return 'At rest'
}

function relativeTime(value) {
  const time = timestampMs(value)
  if (!time) return 'No recent activity'
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 15) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function toolCategory(name = '') {
  const value = String(name).toLowerCase()
  if (/(terminal|execute_code|patch|git|code|index|generate)/.test(value)) return 'forge'
  if (/(write_file|read_file|search_files|memory|skill)/.test(value)) return 'scroll'
  if (/(web|browser|search|extract|fetch)/.test(value)) return 'observatory'
  if (/(computer|preview|annotate|tour)/.test(value)) return 'mechanism'
  if (/(delegate|agent|group|message|clarify|approval)/.test(value)) return 'messenger'
  if (/(image|vision|media)/.test(value)) return 'mosaic'
  if (/(cron|job|schedule|todo)/.test(value)) return 'hourglass'
  return 'craft'
}

function toolCategoryLabel(category) {
  return ({ forge: 'At the forge', scroll: 'Consulting the archives', observatory: 'Scanning distant shores', mechanism: 'Turning the mechanism', messenger: 'Dispatching a messenger', mosaic: 'Setting mosaic tiles', hourglass: 'Tending the water clock', craft: 'At work' })[category] || 'At work'
}

function toolFailed(payload) {
  const result = payload?.result
  return Boolean(payload?.is_error || result?.error || result?.success === false || result?.ok === false)
}

function eventProfileName(event, profiles) {
  const explicit = event?.profile
  if (explicit && profiles.some(profile => profile.name === explicit)) return explicit
  const sid = String(event?.session_id || '')
  const matched = profiles.find(profile => sessionIds(profile).includes(sid))
  if (matched) return matched.name
  const current = host.state.profile?.get?.()
  return profiles.some(profile => profile.name === current) ? current : profiles[0]?.name
}

function useLiveActivities(profiles, soundEnabled) {
  const [activities, setActivities] = useState({})
  const profilesRef = useRef(profiles)
  const soundRef = useRef(soundEnabled)
  profilesRef.current = profiles
  soundRef.current = soundEnabled
  useEffect(() => {
    const update = event => {
      const type = String(event?.type || '')
      const relevant = type.startsWith('tool.') || type === 'message.complete' || type === 'error' || type === 'approval.request' || type === 'mcp.setup.request' || type === 'clarify.request'
      if (!relevant) return
      const profileName = eventProfileName(event, profilesRef.current)
      if (!profileName) return
      const payload = event?.payload || {}
      const sessionId = String(event?.session_id || payload.session_id || 'current')
      const now = Date.now()
      setActivities(currentState => {
        const profileState = currentState[profileName] || { sessions: {} }
        const previous = profileState.sessions[sessionId] || {}
        let next = previous
        if (type === 'tool.start') next = { phase: 'working', tool: payload.name || 'tool', category: toolCategory(payload.name), context: payload.context || '', toolId: payload.tool_id, sessionId, startedAt: now, updatedAt: now }
        else if (type === 'tool.progress') next = { ...previous, phase: 'working', tool: payload.name || previous.tool || 'tool', category: previous.category || toolCategory(payload.name), context: payload.context || payload.message || previous.context || '', sessionId, updatedAt: now }
        else if (type === 'tool.complete') next = { ...previous, phase: toolFailed(payload) ? 'failed' : 'complete', tool: payload.name || previous.tool || 'tool', category: previous.category || toolCategory(payload.name), context: payload.summary || previous.context || '', sessionId, updatedAt: now, duration: payload.duration_s }
        else if (type === 'approval.request' || type === 'clarify.request' || type === 'mcp.setup.request') next = { ...previous, phase: 'waiting', tool: previous.tool || 'question', category: previous.category || 'messenger', context: payload.description || payload.question || 'Waiting for your response', sessionId, updatedAt: now }
        else if (type === 'error') next = { ...previous, phase: 'failed', tool: previous.tool || 'task', category: previous.category || 'craft', context: payload.message || payload.error || 'The task failed', sessionId, updatedAt: now }
        else if (type === 'message.complete') next = { ...previous, phase: 'complete', tool: previous.tool || 'response', category: previous.category || 'scroll', context: previous.context || 'Commission completed', sessionId, updatedAt: now }
        const history = type === 'tool.progress' ? (profileState.history || []) : [{ type, phase: next.phase, tool: next.tool, category: next.category, context: next.context, sessionId, at: now }, ...(profileState.history || [])].slice(0, 24)
        if (soundRef.current && ['complete', 'failed', 'waiting'].includes(next.phase) && next.phase !== previous.phase) playActivityTone(next.phase)
        return { ...currentState, [profileName]: { sessions: { ...profileState.sessions, [sessionId]: next }, history, updatedAt: now } }
      })
    }
    const dispose = host.onEvent('*', update)
    const cleanup = setInterval(() => {
      const now = Date.now()
      setActivities(currentState => {
        let changed = false
        const nextState = {}
        for (const [profile, state] of Object.entries(currentState)) {
          const sessions = {}
          for (const [sid, item] of Object.entries(state.sessions || {})) {
            const ttl = TERMINAL_PHASES.has(item.phase) ? SETTLED_ACTIVITY_TTL_MS : LIVE_ACTIVITY_TTL_MS
            if (now - (item.updatedAt || 0) <= ttl) sessions[sid] = item
            else changed = true
          }
          const history = (state.history || []).filter(item => now - (item.at || 0) <= 60 * 60_000)
          if (history.length !== (state.history || []).length) changed = true
          if (Object.keys(sessions).length || history.length) nextState[profile] = { ...state, sessions, history }
          else changed = true
        }
        return changed ? nextState : currentState
      })
    }, 4000)
    return () => { dispose?.(); clearInterval(cleanup) }
  }, [])
  return activities
}

function strongestActivity(profileState) {
  const rank = { failed: 5, waiting: 4, working: 3, complete: 2 }
  return Object.values(profileState?.sessions || {}).sort((a, b) => (rank[b.phase] || 0) - (rank[a.phase] || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null
}

function useRoster() {
  return useQuery({
    queryKey: [ID, 'profiles'],
    queryFn: () => host.request('profiles.list', { include_sessions: true }),
    refetchInterval: PROFILE_REFRESH_MS,
    staleTime: 3500,
    retry: 2
  })
}

function useOccupations() {
  const [occupations, setOccupations] = useState(DEFAULT_OCCUPATIONS)
  useEffect(() => {
    let live = true
    Promise.resolve(pluginContext?.storage?.get('occupations'))
      .then(value => {
        if (live && value && typeof value === 'object') {
          setOccupations({ ...DEFAULT_OCCUPATIONS, ...value })
        }
      })
      .catch(() => undefined)
    return () => { live = false }
  }, [])
  const assign = useCallback((profile, occupation) => {
    setOccupations(current => {
      const next = { ...current, [profile]: occupation }
      Promise.resolve(pluginContext?.storage?.set('occupations', next)).catch(() => undefined)
      return next
    })
  }, [])
  return [occupations, assign]
}

function useSoundSetting() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let live = true
    Promise.resolve(pluginContext?.storage?.get('soundEnabled')).then(value => {
      if (live && typeof value === 'boolean') setEnabled(value)
    }).catch(() => undefined)
    return () => { live = false }
  }, [])
  const toggle = useCallback(() => setEnabled(current => {
    const next = !current
    Promise.resolve(pluginContext?.storage?.set('soundEnabled', next)).catch(() => undefined)
    return next
  }), [])
  return [enabled, toggle]
}

function playActivityTone(phase) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    const audio = new Audio()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = phase === 'failed' ? 150 : phase === 'waiting' ? 310 : 520
    gain.gain.setValueAtTime(0.025, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.12)
    oscillator.addEventListener('ended', () => audio.close())
  } catch {}
}

function colorResolver(root) {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  root.appendChild(probe)
  return expression => {
    probe.style.color = expression
    const value = getComputedStyle(probe).color
    return value || getComputedStyle(root).color
  }
}

function paletteFor(root) {
  const color = colorResolver(root)
  const p = {
    sky: color('#20323a'),
    skySoft: color('#36525b'),
    ground: color('#8f754f'),
    groundLight: color('#ad9060'),
    groundDark: color('#17252a'),
    marble: color('#eadfc8'),
    marbleShade: color('#a99574'),
    terracotta: color('#b85b3e'),
    bronze: color('#c18a43'),
    dark: color('#1b211e'),
    text: color('#f7f0df'),
    muted: color('#c4b69b'),
    olive: color('#607748'),
    water: color('#4c91a4'),
    active: color('#f0b84e'),
    success: color('#65bb83'),
    danger: color('#e4605f'),
    shadow: color('rgba(10, 16, 15, 0.72)'),
    sand: color('#a98a5a'),
    sandLight: color('#c5a66c'),
    limestone: color('#e6d7ba'),
    limestoneShade: color('#8f7858'),
    roof: color('#9e4936'),
    roofLight: color('#d4774f'),
    lapis: color('#39788f'),
    foliage: color('#345b3f'),
    foliageLight: color('#6f854e')
  }
  root.lastChild?.remove()
  return p
}

function px(ctx, unit, x, y, w, h, fill) {
  ctx.fillStyle = fill
  ctx.fillRect(Math.round(x * unit), Math.round(y * unit), Math.max(1, Math.round(w * unit)), Math.max(1, Math.round(h * unit)))
}

function text(ctx, unit, value, x, y, fill, size = 1.55, align = 'center') {
  ctx.fillStyle = fill
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.max(10, Math.floor(size * unit))}px ui-monospace, monospace`
  ctx.fillText(value, Math.round(x * unit), Math.round(y * unit))
}

function drawCloud(ctx, u, x, y, p, drift) {
  const xx = x + drift
  px(ctx, u, xx + 2, y, 8, 2, p.skySoft)
  px(ctx, u, xx, y + 2, 13, 2, p.skySoft)
  px(ctx, u, xx + 4, y - 1, 4, 1, p.skySoft)
}

function drawTree(ctx, u, x, y, p, t) {
  const sway = Math.sin(t * 0.0014 + x) > 0.4 ? 1 : 0
  px(ctx, u, x, y + 4, 1, 4, p.bronze)
  px(ctx, u, x - 3 + sway, y, 6, 2, p.olive)
  px(ctx, u, x - 4, y + 2, 8, 2, p.olive)
  px(ctx, u, x - 2, y - 2, 5, 2, p.olive)
  px(ctx, u, x + 2, y + 1, 1, 1, p.marble)
}

function drawPath(ctx, u, ax, ay, bx, by, p) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
  for (let i = 0; i <= steps; i += 2) {
    const q = steps ? i / steps : 0
    const x = Math.round(ax + (bx - ax) * q)
    const y = Math.round(ay + (by - ay) * q)
    px(ctx, u, x - 1, y - 1, 3, 3, i % 4 ? p.marbleShade : p.marble)
  }
}

function drawBuilding(ctx, u, site, occupation, p, selected, status, t) {
  const { x, y } = site
  const pulse = status === 'working' && Math.floor(t / 350) % 2 === 0
  ctx.globalAlpha = 0.32
  px(ctx, u, x - 13, y + 8, 27, 3, p.shadow)
  ctx.globalAlpha = 1

  if (occupation === 'blacksmith') {
    px(ctx, u, x - 12, y - 6, 24, 15, p.marbleShade)
    px(ctx, u, x - 10, y - 9, 20, 3, p.terracotta)
    px(ctx, u, x - 7, y - 12, 14, 3, p.terracotta)
    px(ctx, u, x - 7, y + 1, 6, 8, p.dark)
    px(ctx, u, x + 5, y - 13, 3, 9, p.marbleShade)
    if (status === 'working') {
      px(ctx, u, x + 5, y - 15 - (pulse ? 1 : 0), 3, 2, p.muted)
      px(ctx, u, x + 7, y - 18 - (pulse ? 1 : 0), 3, 2, p.muted)
    }
  } else if (occupation === 'scholar') {
    px(ctx, u, x - 12, y - 5, 24, 14, p.marbleShade)
    px(ctx, u, x - 10, y - 10, 20, 5, p.marble)
    px(ctx, u, x - 8, y - 13, 16, 3, p.marble)
    for (let i = -8; i <= 8; i += 5) px(ctx, u, x + i, y - 5, 2, 14, p.marble)
    px(ctx, u, x - 3, y + 2, 6, 7, p.dark)
    px(ctx, u, x + 7, y - 13, 1, 3, p.active)
  } else if (occupation === 'merchant') {
    px(ctx, u, x - 13, y - 4, 26, 13, p.marbleShade)
    px(ctx, u, x - 14, y - 8, 28, 4, p.terracotta)
    for (let i = -11; i <= 11; i += 5) px(ctx, u, x + i, y - 4, 2, 13, p.marble)
    px(ctx, u, x - 5, y + 2, 10, 7, p.dark)
    px(ctx, u, x - 14, y - 10, 4, 2, p.active)
  } else if (occupation === 'warrior') {
    px(ctx, u, x - 13, y + 5, 26, 4, p.marbleShade)
    px(ctx, u, x - 11, y - 3, 2, 8, p.marble)
    px(ctx, u, x + 9, y - 3, 2, 8, p.marble)
    px(ctx, u, x - 12, y - 5, 24, 2, p.terracotta)
    px(ctx, u, x + 5, y - 1, 2, 6, p.bronze)
    px(ctx, u, x + 3, y + 1, 6, 1, p.bronze)
  } else if (occupation === 'scribe') {
    px(ctx, u, x - 12, y - 5, 24, 14, p.marbleShade)
    px(ctx, u, x - 10, y - 10, 20, 5, p.terracotta)
    px(ctx, u, x - 7, y - 3, 5, 7, p.dark)
    px(ctx, u, x + 2, y - 3, 5, 7, p.dark)
    px(ctx, u, x - 2, y + 1, 4, 8, p.marble)
  } else {
    px(ctx, u, x - 12, y - 3, 24, 12, p.marbleShade)
    px(ctx, u, x - 10, y - 7, 20, 4, p.marble)
    px(ctx, u, x - 7, y - 11, 14, 4, p.marble)
    px(ctx, u, x - 3, y - 14, 6, 3, p.bronze)
    for (let i = -8; i <= 8; i += 5) px(ctx, u, x + i, y - 3, 2, 12, p.marble)
    px(ctx, u, x - 3, y + 2, 6, 7, p.dark)
  }

  if (selected) {
    ctx.strokeStyle = p.active
    ctx.lineWidth = Math.max(1, u * 0.35)
    ctx.setLineDash([u, u])
    ctx.strokeRect(Math.round((x - 15) * u), Math.round((y - 16) * u), Math.round(30 * u), Math.round(27 * u))
    ctx.setLineDash([])
  }
}

function drawCharacter(ctx, u, site, occupation, status, p, t) {
  const { x, y } = site
  const working = status === 'working'
  const frame = Math.floor(t / 260) % 2
  const bob = working ? frame : Math.floor(t / 900) % 2
  const cx = x
  const cy = y + 8 - bob
  const body = status === 'offline' ? p.muted : occupation === 'blacksmith' ? p.terracotta : occupation === 'scholar' ? p.water : occupation === 'merchant' ? p.bronze : p.active

  ctx.globalAlpha = status === 'offline' ? 0.46 : 1
  px(ctx, u, cx - 2, cy - 5, 4, 3, p.marble)
  px(ctx, u, cx - 3, cy - 2, 6, 5, body)
  px(ctx, u, cx - 2, cy + 3, 1, 3, p.dark)
  px(ctx, u, cx + 1, cy + 3, 1, 3, p.dark)
  px(ctx, u, cx - 1, cy - 4, 1, 1, p.dark)
  px(ctx, u, cx + 1, cy - 4, 1, 1, p.dark)

  if (occupation === 'blacksmith') {
    px(ctx, u, cx + 3, cy - 1 - frame, 1, 4, p.bronze)
    px(ctx, u, cx + 2, cy - 2 - frame, 4, 1, p.bronze)
    px(ctx, u, cx + 5, cy + 3, 5, 2, p.dark)
    if (working && frame) {
      px(ctx, u, cx + 9, cy + 1, 1, 1, p.active)
      px(ctx, u, cx + 11, cy - 1, 1, 1, p.active)
    }
  } else if (occupation === 'scholar') {
    px(ctx, u, cx + 3, cy, 5, 3, p.marble)
    px(ctx, u, cx + 4, cy + 1, 1, 1, p.active)
    px(ctx, u, cx + 7, cy + (working ? frame : 1), 1, 1, p.active)
  } else if (occupation === 'merchant') {
    for (let i = 0; i < 4; i++) px(ctx, u, cx + 4 + i, cy + (i % 2), 1, 1, working && i === frame ? p.active : p.marble)
    px(ctx, u, cx + 3, cy + 3, 6, 1, p.bronze)
  } else if (occupation === 'warrior') {
    px(ctx, u, cx + 3, cy - 3 - frame, 1, 7, p.marble)
    px(ctx, u, cx + 2, cy + 1, 3, 1, p.bronze)
  } else if (occupation === 'scribe') {
    px(ctx, u, cx + 3, cy, 6, 4, p.marble)
    px(ctx, u, cx + 4 + frame * 2, cy, 1, 3, p.active)
  } else {
    px(ctx, u, cx + 3, cy - 1, 4, 3, p.marble)
    px(ctx, u, cx + 4, cy, 2, 1, p.active)
  }

  if (status === 'working') {
    px(ctx, u, cx - 5, cy - 9, 10, 2, p.active)
    px(ctx, u, cx - 4, cy - 8, 8, 1, p.dark)
  } else if (status === 'recent') {
    px(ctx, u, cx + 4, cy - 7, 2, 2, p.success)
  } else if (status === 'idle') {
    if (Math.floor(t / 1000 + x) % 5 === 0) text(ctx, u, '·', cx + 4, cy - 7, p.muted, 1.2)
  }
  ctx.globalAlpha = 1
}

function drawToolCue(ctx, u, site, activity, sessionCount, p, t) {
  if (!activity) return
  const { x, y } = site
  const frame = Math.floor(t / 220) % 3
  const category = activity.category || 'craft'
  const phase = activity.phase
  const pulse = Math.floor(t / 360) % 2

  if (category === 'forge') {
    px(ctx, u, x + 7, y + 9, 7, 2, p.dark)
    px(ctx, u, x + 9, y + 7, 3, 2, p.bronze)
    if (phase === 'working') {
      px(ctx, u, x + 12 + frame, y + 5 - frame, 1, 1, p.active)
      px(ctx, u, x + 10 - frame, y + 4, 1, 1, p.active)
    }
  } else if (category === 'scroll') {
    px(ctx, u, x + 6, y + 5, 8, 6, p.marble)
    px(ctx, u, x + 7, y + 7, 5, 1, p.muted)
    px(ctx, u, x + 7, y + 9, 4 + (phase === 'working' ? frame : 0), 1, p.active)
  } else if (category === 'observatory') {
    px(ctx, u, x + 7, y + 2, 2, 8, p.bronze)
    px(ctx, u, x + 8, y + 1 - pulse, 7, 2, p.water)
    px(ctx, u, x + 13, y - pulse, 2, 2, p.active)
  } else if (category === 'mechanism') {
    px(ctx, u, x + 8, y + 3, 7, 7, p.bronze)
    px(ctx, u, x + 10, y + 5, 3, 3, p.dark)
    px(ctx, u, x + 11 + (frame === 1 ? 1 : 0), y + 3, 1, 7, p.marble)
  } else if (category === 'messenger') {
    px(ctx, u, x + 8 + frame, y + 4, 3, 4, p.marble)
    px(ctx, u, x + 9 + frame, y + 5, 2, 1, p.active)
    px(ctx, u, x + 7 + frame, y + 8, 1, 2, p.dark)
    px(ctx, u, x + 11 + frame, y + 8, 1, 2, p.dark)
  } else if (category === 'mosaic') {
    for (let i = 0; i < 9; i++) px(ctx, u, x + 7 + (i % 3) * 2, y + 3 + Math.floor(i / 3) * 2, 1, 1, i === frame * 3 ? p.active : i % 2 ? p.water : p.bronze)
  } else if (category === 'hourglass') {
    px(ctx, u, x + 9, y + 2, 6, 1, p.bronze)
    px(ctx, u, x + 10, y + 3, 4, 6, p.marble)
    px(ctx, u, x + 9, y + 9, 6, 1, p.bronze)
    px(ctx, u, x + 11, y + 4 + frame, 2, 1, p.active)
  } else {
    px(ctx, u, x + 8, y + 4 - pulse, 6, 5, p.marble)
    px(ctx, u, x + 10, y + 5 - pulse, 2, 1, p.active)
  }

  if (phase === 'waiting') text(ctx, u, '?', x + 12, y - 8 - pulse, p.active, 1.8)
  if (phase === 'failed') text(ctx, u, '×', x + 12, y - 8, p.danger, 1.8)
  if (phase === 'complete') text(ctx, u, '✓', x + 12, y - 8, p.success, 1.5)
  if (sessionCount > 1) {
    px(ctx, u, x - 14, y - 12, 7, 5, p.dark)
    text(ctx, u, String(sessionCount), x - 10.5, y - 9.5, p.text, 0.9)
  }
}

function drawWorld(ctx, canvas, profiles, selectedName, p, t, hitMap) {
  const width = canvas.width
  const height = canvas.height
  const u = clamp(Math.floor(Math.min(width / 122, height / 78)), 4, 13)
  const ox = Math.floor((width - 122 * u) / 2)
  const oy = Math.floor((height - 78 * u) / 2)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = p.sky
  ctx.fillRect(0, 0, 122 * u, 78 * u)
  for (let y = 11; y < 78; y += 4) {
    px(ctx, u, 0, y, 122, 4, y % 8 ? p.ground : p.groundLight)
  }
  for (let x = 0; x < 122; x += 8) {
    ctx.globalAlpha = 0.08
    px(ctx, u, x, 11, 1, 67, p.marble)
  }
  ctx.globalAlpha = 1

  drawCloud(ctx, u, 12, 5, p, (t * 0.0008) % 25)
  drawCloud(ctx, u, 84, 7, p, (t * 0.0005) % 18)

  for (const site of SITE_LAYOUTS.slice(0, profiles.length)) drawPath(ctx, u, 60, 37, site.x, site.y + 8, p)

  px(ctx, u, 52, 30, 17, 14, p.marbleShade)
  px(ctx, u, 54, 32, 13, 10, p.marble)
  px(ctx, u, 57, 34, 7, 6, p.water)
  px(ctx, u, 59, 31, 3, 3, p.bronze)
  if (Math.floor(t / 350) % 2) {
    px(ctx, u, 58, 30, 1, 2, p.water)
    px(ctx, u, 62, 30, 1, 2, p.water)
  }

  ;[[8,19],[14,67],[111,28],[110,68],[42,13],[80,68],[40,65],[82,14]].forEach(([x,y]) => drawTree(ctx, u, x, y, p, t))

  hitMap.current = []
  profiles.forEach((profile, index) => {
    const site = SITE_LAYOUTS[index % SITE_LAYOUTS.length]
    drawBuilding(ctx, u, site, profile.occupation, p, profile.name === selectedName, profile.status, t)
    drawCharacter(ctx, u, site, profile.occupation, profile.status, p, t)
    drawToolCue(ctx, u, site, profile.activity, profile.activeSessionCount, p, t)
    const name = profile.display_name || (profile.name === 'default' ? 'Hermes' : profile.name)
    text(ctx, u, name, site.x, site.y + 14, p.text, 1.35)
    text(ctx, u, profile.activity?.phase === 'working' ? toolCategoryLabel(profile.activity.category) : activityLabel(profile.status), site.x, site.y + 17, ['working', 'waiting', 'failed'].includes(profile.status) ? p.active : p.muted, 0.95)
    hitMap.current.push({
      name: profile.name,
      x: ox + (site.x - 15) * u,
      y: oy + (site.y - 17) * u,
      w: 30 * u,
      h: 38 * u
    })
  })

  text(ctx, u, 'THE POLIS OF HERMES', 61, 3.5, p.text, 1.4)
  text(ctx, u, 'A living city of minds', 61, 6.2, p.muted, 0.9)
  ctx.restore()
}

const POLIS_LAYOUTS_V2 = [
  { x: 43, y: 34 }, { x: 117, y: 34 },
  { x: 43, y: 72 }, { x: 117, y: 72 },
  { x: 20, y: 53 }, { x: 140, y: 53 },
  { x: 80, y: 20 }, { x: 80, y: 86 }
]

function shapeV2(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath()
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

function lineV2(ctx, points, stroke, width = 1) {
  ctx.beginPath()
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.strokeStyle = stroke
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function ellipseV2(ctx, x, y, rx, ry, fill, stroke, width = 1) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
}

function isoBlockV2(ctx, x, y, w, d, h, top, left, right, edge) {
  const t = [x, y - d / 2 - h]
  const r = [x + w / 2, y - h]
  const b = [x, y + d / 2 - h]
  const l = [x - w / 2, y - h]
  shapeV2(ctx, [l, b, [b[0], b[1] + h], [l[0], l[1] + h]], left, edge)
  shapeV2(ctx, [b, r, [r[0], r[1] + h], [b[0], b[1] + h]], right, edge)
  shapeV2(ctx, [t, r, b, l], top, edge)
  return { t, r, b, l }
}

function drawOliveV2(ctx, x, y, p, t, seed = 0) {
  const sway = Math.sin(t * 0.001 + seed) * 0.45
  ctx.globalAlpha = 0.18
  ellipseV2(ctx, x + 2, y + 1, 6, 2, p.shadow)
  ctx.globalAlpha = 1
  lineV2(ctx, [[x, y], [x + sway, y - 9]], p.bronze, 1.4)
  ellipseV2(ctx, x - 2 + sway, y - 9, 4.7, 3.2, p.foliage, p.dark, 0.6)
  ellipseV2(ctx, x + 2 + sway, y - 10, 4.2, 3, p.foliageLight, p.dark, 0.6)
  ellipseV2(ctx, x + sway, y - 13, 3.6, 2.8, p.foliage, p.dark, 0.6)
  ellipseV2(ctx, x + 3 + sway, y - 9, 0.6, 0.6, p.limestone)
  ellipseV2(ctx, x - 1 + sway, y - 11, 0.6, 0.6, p.limestone)
}

function drawCypressV2(ctx, x, y, p) {
  ctx.globalAlpha = 0.16
  ellipseV2(ctx, x + 1, y + 1, 4, 1.5, p.shadow)
  ctx.globalAlpha = 1
  lineV2(ctx, [[x, y], [x, y - 13]], p.bronze, 1)
  shapeV2(ctx, [[x, y - 17], [x + 3.3, y - 6], [x, y - 2], [x - 3.3, y - 6]], p.foliage, p.dark, 0.7)
  shapeV2(ctx, [[x, y - 15], [x + 1.5, y - 7], [x, y - 4], [x - 1.2, y - 8]], p.foliageLight)
}

function drawPathV2(ctx, ax, ay, bx, by, p) {
  const angle = Math.atan2(by - ay, bx - ax)
  const nx = Math.sin(angle) * 2.4
  const ny = -Math.cos(angle) * 2.4
  shapeV2(ctx, [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]], p.limestoneShade)
  ctx.globalAlpha = 0.48
  const steps = Math.max(2, Math.floor(Math.hypot(bx - ax, by - ay) / 5))
  for (let i = 1; i < steps; i++) {
    const q = i / steps
    const x = ax + (bx - ax) * q
    const y = ay + (by - ay) * q
    lineV2(ctx, [[x + nx * .7, y + ny * .7], [x - nx * .7, y - ny * .7]], p.limestone, .65)
  }
  ctx.globalAlpha = 1
}

function drawAgoraV2(ctx, p, t) {
  isoBlockV2(ctx, 80, 54, 31, 17, 2.2, p.limestone, p.limestoneShade, p.marbleShade, p.dark)
  ellipseV2(ctx, 80, 47, 9.5, 4.7, p.water, p.dark, 0.8)
  ellipseV2(ctx, 80, 47, 6.8, 3.2, p.skySoft, p.lapis, 0.8)
  isoBlockV2(ctx, 80, 47, 4.5, 3, 6.5, p.bronze, p.marbleShade, p.limestoneShade, p.dark)
  ellipseV2(ctx, 80, 37.6, 1.8, .8, p.water)
  const splash = Math.sin(t * .006) * .6
  lineV2(ctx, [[80, 40.2], [80, 36.2 + splash]], p.water, 1.1)
  lineV2(ctx, [[80, 39.4], [77.8, 37.8 + splash]], p.water, .7)
  lineV2(ctx, [[80, 39.4], [82.2, 37.8 - splash]], p.water, .7)
  textV2(ctx, 'AGORA', 80, 57.5, p.muted, 2.1, 'center', 700)
}

function drawRoofTilesV2(ctx, x, y, w, p) {
  ctx.globalAlpha = .42
  for (let i = -w / 2 + 2; i < w / 2; i += 3.4) lineV2(ctx, [[x + i, y], [x + i + 5, y + 4]], p.roofLight, .55)
  ctx.globalAlpha = 1
}

function drawBuildingV2(ctx, site, occupation, p, selected, status, t) {
  const { x, y } = site
  const pulse = Math.sin(t * .006) * .5
  ctx.globalAlpha = .22
  ellipseV2(ctx, x + 1.5, y + 1.5, 21, 6.5, p.shadow)
  ctx.globalAlpha = status === 'offline' ? .48 : 1

  if (occupation === 'blacksmith') {
    isoBlockV2(ctx, x, y, 31, 16, 13, p.roof, p.limestoneShade, p.limestone, p.dark)
    shapeV2(ctx, [[x - 16, y - 13], [x, y - 23], [x + 16, y - 13], [x, y - 6]], p.roof, p.dark)
    lineV2(ctx, [[x - 13, y - 13], [x, y - 21], [x + 13, y - 13]], p.roofLight, 1)
    drawRoofTilesV2(ctx, x, y - 16, 25, p)
    isoBlockV2(ctx, x + 9, y - 14, 5, 4, 11, p.limestone, p.marbleShade, p.limestoneShade, p.dark)
    ctx.globalAlpha = .3
    ellipseV2(ctx, x + 10 + pulse, y - 33 - pulse, 2.5, 1.5, p.muted)
    ellipseV2(ctx, x + 12 - pulse, y - 37 - pulse, 3.2, 1.8, p.muted)
    ctx.globalAlpha = 1
    shapeV2(ctx, [[x - 8, y - 9], [x - 2, y - 6], [x - 2, y + 2], [x - 8, y - 1]], p.dark, p.bronze)
    isoBlockV2(ctx, x + 14, y + 4, 8, 5, 3.5, p.bronze, p.dark, p.marbleShade, p.dark)
  } else if (occupation === 'scholar') {
    isoBlockV2(ctx, x, y, 32, 17, 12, p.limestone, p.limestoneShade, p.marble, p.dark)
    shapeV2(ctx, [[x - 17, y - 12], [x, y - 23], [x + 17, y - 12], [x, y - 4]], p.lapis, p.dark)
    lineV2(ctx, [[x - 14, y - 12], [x, y - 21], [x + 14, y - 12]], p.marble, .8)
    for (let i = -10; i <= 10; i += 6.7) {
      lineV2(ctx, [[x + i, y - 7], [x + i, y + 1]], p.marble, 1.5)
      ellipseV2(ctx, x + i, y - 7.5, 1.2, .7, p.limestone)
    }
    lineV2(ctx, [[x + 11, y - 18], [x + 17, y - 25 + pulse]], p.bronze, 1.3)
    lineV2(ctx, [[x + 15, y - 24 + pulse], [x + 21, y - 27 + pulse]], p.lapis, 2.3)
    ellipseV2(ctx, x + 21, y - 27 + pulse, 1.8, 1.2, p.active)
  } else if (occupation === 'merchant') {
    isoBlockV2(ctx, x, y, 38, 15, 10, p.roof, p.limestoneShade, p.limestone, p.dark)
    shapeV2(ctx, [[x - 20, y - 10], [x, y - 19], [x + 20, y - 10], [x, y - 2]], p.roof, p.dark)
    for (let i = -14; i <= 14; i += 7) lineV2(ctx, [[x + i, y - 5], [x + i, y + 2]], p.marble, 1.5)
    shapeV2(ctx, [[x - 12, y - 7], [x + 12, y - 7], [x + 10, y - 2], [x - 10, y - 2]], p.terracotta, p.dark)
    for (let i = -8; i <= 8; i += 8) {
      ellipseV2(ctx, x + i, y + 2, 2.2, 3.1, p.roofLight, p.dark, .7)
      lineV2(ctx, [[x + i - 1, y], [x + i + 1, y]], p.marble, .55)
    }
  } else if (occupation === 'warrior') {
    isoBlockV2(ctx, x, y, 37, 19, 2.1, p.sandLight, p.sand, p.limestoneShade, p.dark)
    for (const side of [-1, 1]) {
      lineV2(ctx, [[x + side * 16, y - 6], [x + side * 16, y - 16]], p.bronze, 1.5)
      shapeV2(ctx, [[x + side * 19, y - 16], [x + side * 16, y - 19], [x + side * 13, y - 16]], p.terracotta, p.dark)
    }
    lineV2(ctx, [[x - 15, y - 5], [x + 15, y - 5]], p.bronze, 1.2)
    lineV2(ctx, [[x - 11, y - 9], [x - 11, y]], p.bronze, 1)
    lineV2(ctx, [[x + 11, y - 9], [x + 11, y]], p.bronze, 1)
    lineV2(ctx, [[x + 8, y - 6], [x + 8, y - 15]], p.bronze, 1.3)
    ellipseV2(ctx, x + 8, y - 13, 2.8, 3.3, p.terracotta, p.dark)
    lineV2(ctx, [[x + 4, y - 10], [x + 12, y - 8]], p.bronze, 1.2)
  } else if (occupation === 'scribe') {
    isoBlockV2(ctx, x, y, 32, 17, 14, p.limestone, p.limestoneShade, p.marble, p.dark)
    shapeV2(ctx, [[x - 17, y - 14], [x, y - 23], [x + 17, y - 14], [x, y - 6]], p.roof, p.dark)
    for (let i = -10; i <= 10; i += 6.7) {
      shapeV2(ctx, [[x + i - 2.2, y - 8], [x + i + 2.2, y - 8], [x + i + 2.2, y - 2], [x + i - 2.2, y - 2]], p.dark, p.bronze, .6)
      lineV2(ctx, [[x + i - 1.3, y - 6], [x + i + 1.3, y - 6]], p.marble, .6)
      lineV2(ctx, [[x + i - 1.3, y - 4], [x + i + 1.3, y - 4]], p.roofLight, .6)
    }
    shapeV2(ctx, [[x - 3, y - 18], [x, y - 21], [x + 3, y - 18], [x, y - 15]], p.bronze, p.dark)
  } else {
    isoBlockV2(ctx, x, y, 32, 17, 12, p.limestone, p.limestoneShade, p.marble, p.dark)
    shapeV2(ctx, [[x - 17, y - 12], [x, y - 22], [x + 17, y - 12], [x, y - 4]], p.lapis, p.dark)
    for (let i = -10; i <= 10; i += 6.7) lineV2(ctx, [[x + i, y - 7], [x + i, y + 1]], p.marble, 1.6)
    lineV2(ctx, [[x, y - 22], [x, y - 31]], p.bronze, 1.2)
    shapeV2(ctx, [[x, y - 31], [x + 7, y - 28], [x, y - 25]], p.terracotta, p.dark)
  }

  if (selected) {
    ctx.globalAlpha = .9
    ctx.beginPath()
    ctx.ellipse(x, y + 2, 22, 8, 0, 0, Math.PI * 2)
    ctx.strokeStyle = p.active
    ctx.lineWidth = 1.5
    ctx.setLineDash([2.2, 1.7])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  ctx.globalAlpha = 1
}

function drawCharacterV2(ctx, site, occupation, status, p, t) {
  const x = site.x - 8
  const working = status === 'working'
  const frame = Math.floor(t / 280) % 2
  const bob = working ? frame * .55 : Math.sin(t * .002 + site.x) * .25
  const y = site.y + 3 - bob
  const garment = occupation === 'blacksmith' ? p.terracotta : occupation === 'scholar' ? p.lapis : occupation === 'merchant' ? p.bronze : occupation === 'warrior' ? p.roof : occupation === 'scribe' ? p.water : p.active
  ctx.globalAlpha = status === 'offline' ? .42 : 1
  ellipseV2(ctx, x + 1, y + 2.5, 4.3, 1.4, p.shadow)
  shapeV2(ctx, [[x - 3.6, y - 8], [x + 3.6, y - 8], [x + 5, y + 1], [x - 5, y + 1]], garment, p.dark, .8)
  lineV2(ctx, [[x - 2.2, y + 1], [x - 2.4 + frame, y + 4]], p.dark, 1.4)
  lineV2(ctx, [[x + 2.2, y + 1], [x + 2.4 - frame, y + 4]], p.dark, 1.4)
  ellipseV2(ctx, x, y - 11, 3.4, 3.8, p.marble, p.dark, .8)
  shapeV2(ctx, [[x - 3.5, y - 12.5], [x, y - 16], [x + 3.5, y - 12.5], [x + 2.5, y - 9.5], [x - 2.5, y - 9.5]], occupation === 'warrior' ? p.bronze : p.dark, p.dark)
  ellipseV2(ctx, x - 1.2, y - 11.2, .35, .35, p.dark)
  ellipseV2(ctx, x + 1.2, y - 11.2, .35, .35, p.dark)

  if (occupation === 'blacksmith') {
    lineV2(ctx, [[x + 2.8, y - 6], [x + 8 - frame, y - 12 + frame * 3]], p.bronze, 1.4)
    shapeV2(ctx, [[x + 5 - frame, y - 14 + frame * 3], [x + 10 - frame, y - 14 + frame * 3], [x + 10 - frame, y - 12 + frame * 3], [x + 5 - frame, y - 12 + frame * 3]], p.dark)
    if (working && frame) { ellipseV2(ctx, x + 10, y - 3, .8, .8, p.active); ellipseV2(ctx, x + 12, y - 5, .55, .55, p.active) }
  } else if (occupation === 'scholar') {
    shapeV2(ctx, [[x + 2, y - 7], [x + 9, y - 9], [x + 9, y - 3], [x + 2, y - 2]], p.marble, p.bronze, .7)
    lineV2(ctx, [[x + 5.5, y - 8], [x + 5.5, y - 3]], p.active, .65)
  } else if (occupation === 'merchant') {
    ellipseV2(ctx, x + 7, y - 4, 3.2, 4.2, p.roof, p.dark, .8)
    lineV2(ctx, [[x + 5, y - 6], [x + 9, y - 6]], p.marble, .7)
  } else if (occupation === 'warrior') {
    lineV2(ctx, [[x + 2.8, y - 6], [x + 10, y - 15 + frame * 2]], p.marble, 1.1)
    lineV2(ctx, [[x + 7, y - 14 + frame * 2], [x + 11, y - 10 + frame * 2]], p.bronze, .8)
    ellipseV2(ctx, x - 4.2, y - 5, 3.5, 4.5, p.roof, p.bronze, .8)
  } else if (occupation === 'scribe') {
    shapeV2(ctx, [[x + 2, y - 7], [x + 9, y - 8], [x + 9, y - 2], [x + 2, y - 2]], p.marble, p.bronze, .7)
    lineV2(ctx, [[x + 4 + frame * 2, y - 7], [x + 5 + frame * 2, y - 3]], p.active, .8)
  } else {
    lineV2(ctx, [[x + 3, y - 6], [x + 9, y - 10 + frame]], p.bronze, 1)
    shapeV2(ctx, [[x + 9, y - 12 + frame], [x + 14, y - 10 + frame], [x + 9, y - 8 + frame]], p.terracotta, p.dark)
  }
  ctx.globalAlpha = 1
}

function drawActivityV2(ctx, site, activity, sessionCount, p, t) {
  if (!activity) return
  const x = site.x + 14
  const y = site.y - 4
  const pulse = Math.sin(t * .008)
  ctx.globalAlpha = .92
  ellipseV2(ctx, x, y, 6.4, 4.2, p.dark, p.limestone, .7)
  ctx.globalAlpha = 1
  const category = activity.category || 'craft'
  if (category === 'forge') {
    isoBlockV2(ctx, x, y + 2, 7, 4, 2.3, p.bronze, p.dark, p.marbleShade, p.dark)
    if (activity.phase === 'working') { ellipseV2(ctx, x + 4, y - 2 - pulse, .7, .7, p.active); ellipseV2(ctx, x + 5.5, y - 4 + pulse, .45, .45, p.active) }
  } else if (category === 'scroll') {
    shapeV2(ctx, [[x - 4, y - 2], [x + 4, y - 2], [x + 3, y + 3], [x - 3, y + 3]], p.marble, p.bronze, .7)
    lineV2(ctx, [[x - 2, y], [x + 2, y]], p.active, .6)
  } else if (category === 'observatory') {
    lineV2(ctx, [[x - 2, y + 3], [x + 1, y - 2]], p.bronze, 1)
    lineV2(ctx, [[x, y - 2], [x + 5, y - 4 + pulse]], p.lapis, 2)
  } else if (category === 'mechanism') {
    ellipseV2(ctx, x, y, 3.5, 3.5, p.bronze, p.marble, .8)
    lineV2(ctx, [[x, y - 3], [x, y + 3]], p.dark, .8)
    lineV2(ctx, [[x - 3, y], [x + 3, y]], p.dark, .8)
  } else if (category === 'messenger') {
    shapeV2(ctx, [[x - 3, y - 2], [x + 3, y - 2], [x + 4, y + 2], [x - 4, y + 2]], p.marble, p.bronze, .7)
  } else if (category === 'mosaic') {
    for (let i = 0; i < 9; i++) ellipseV2(ctx, x - 2.6 + (i % 3) * 2.6, y - 2.6 + Math.floor(i / 3) * 2.6, .7, .7, i % 2 ? p.lapis : p.bronze)
  } else if (category === 'hourglass') {
    shapeV2(ctx, [[x - 3, y - 3], [x + 3, y - 3], [x + 1, y], [x + 3, y + 3], [x - 3, y + 3], [x - 1, y]], p.marble, p.bronze, .7)
  } else ellipseV2(ctx, x, y, 2.5 + pulse * .3, 2.5 + pulse * .3, p.active)
  if (activity.phase === 'waiting') textV2(ctx, '?', x + 6, y - 6 - pulse, p.active, 4.2, 'center', 800)
  if (activity.phase === 'failed') textV2(ctx, '×', x + 6, y - 6, p.danger, 4.2, 'center', 800)
  if (activity.phase === 'complete') textV2(ctx, '✓', x + 6, y - 6, p.success, 3.5, 'center', 800)
  if (sessionCount > 1) {
    ellipseV2(ctx, x - 7, y - 6, 3.3, 3.3, p.active, p.text, .6)
    textV2(ctx, String(sessionCount), x - 7, y - 5.8, p.dark, 2.3, 'center', 800)
  }
}

function textV2(ctx, value, x, y, fill, size = 2.6, align = 'center', weight = 600) {
  ctx.fillStyle = fill
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(value, x, y)
}

function drawLabelV2(ctx, profile, site, p) {
  const name = profile.display_name || (profile.name === 'default' ? 'Hermes' : profile.name)
  const detail = profile.activity?.phase === 'working' ? toolCategoryLabel(profile.activity.category) : activityLabel(profile.status)
  const width = Math.max(26, Math.min(43, name.length * 2.1 + 10))
  ctx.globalAlpha = .84
  ctx.fillStyle = p.dark
  ctx.beginPath()
  ctx.roundRect(site.x - width / 2, site.y + 9, width, 9, 2.3)
  ctx.fill()
  ctx.globalAlpha = 1
  textV2(ctx, name, site.x, site.y + 12.1, p.text, 2.65, 'center', 750)
  textV2(ctx, detail, site.x, site.y + 15.5, ['working', 'waiting', 'failed'].includes(profile.status) ? p.active : p.muted, 1.65, 'center', 600)
}

function drawWorldV2(ctx, canvas, profiles, selectedName, p, t, hitMap) {
  const width = canvas.width
  const height = canvas.height
  const u = Math.max(3.2, Math.min(width / 160, height / 100))
  const ox = (width - 160 * u) / 2
  const oy = (height - 100 * u) / 2
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(u, u)
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, 160, 100)
  const sky = ctx.createLinearGradient(0, 0, 0, 100)
  sky.addColorStop(0, p.skySoft)
  sky.addColorStop(1, p.groundDark)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 160, 100)

  shapeV2(ctx, [[80, 8], [154, 47], [80, 94], [6, 47]], p.sand, p.limestoneShade, .8)
  ctx.globalAlpha = .16
  for (let i = 0; i < 26; i++) {
    const x = 13 + ((i * 37) % 135)
    const y = 20 + ((i * 19) % 62)
    ellipseV2(ctx, x, y, .45, .25, i % 2 ? p.limestone : p.olive)
  }
  ctx.globalAlpha = 1

  for (const site of POLIS_LAYOUTS_V2.slice(0, profiles.length)) drawPathV2(ctx, 80, 52, site.x, site.y + 2, p)
  drawAgoraV2(ctx, p, t)
  ;[[13,43],[25,24],[145,44],[135,22],[18,72],[143,73]].forEach(([x,y],i) => drawCypressV2(ctx,x,y,p,i))
  ;[[31,86],[126,87],[12,55],[149,58],[60,91],[101,91]].forEach(([x,y],i) => drawOliveV2(ctx,x,y,p,t,i))

  hitMap.current = []
  const ordered = profiles.map((profile, index) => ({ profile, site: POLIS_LAYOUTS_V2[index % POLIS_LAYOUTS_V2.length] })).sort((a, b) => a.site.y - b.site.y)
  ordered.forEach(({ profile, site }) => {
    drawBuildingV2(ctx, site, profile.occupation, p, profile.name === selectedName, profile.status, t)
    drawCharacterV2(ctx, site, profile.occupation, profile.status, p, t)
    drawActivityV2(ctx, site, profile.activity, profile.activeSessionCount, p, t)
    drawLabelV2(ctx, profile, site, p)
    hitMap.current.push({ name: profile.name, x: ox + (site.x - 23) * u, y: oy + (site.y - 34) * u, w: 46 * u, h: 54 * u })
  })

  ctx.globalAlpha = .82
  ctx.fillStyle = p.dark
  ctx.beginPath(); ctx.roundRect(52, 2.5, 56, 10, 3); ctx.fill()
  ctx.globalAlpha = 1
  textV2(ctx, 'THE POLIS OF HERMES', 80, 6.4, p.text, 3.1, 'center', 800)
  textV2(ctx, 'A living Hellenistic city of minds', 80, 9.4, p.muted, 1.65, 'center', 600)
  ctx.restore()
}

const POLIS_W_V3 = 320
const POLIS_H_V3 = 180
const POLIS_LAYOUTS_V3 = [
  { x: 76, y: 86 }, { x: 244, y: 86 },
  { x: 82, y: 154 }, { x: 238, y: 154 },
  { x: 28, y: 121 }, { x: 292, y: 121 },
  { x: 143, y: 75 }, { x: 177, y: 75 }
]

function pxV3(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
}

function outlineRectV3(ctx, x, y, w, h, fill, edge) {
  pxV3(ctx, x, y, w, h, edge)
  pxV3(ctx, x + 1, y + 1, w - 2, h - 2, fill)
}

function roofV3(ctx, x, y, w, h, a, b, edge) {
  shapeV2(ctx, [[x - w / 2, y], [x, y - h], [x + w / 2, y]], a, edge, 1)
  shapeV2(ctx, [[x, y - h], [x + w / 2, y], [x, y]], b, edge, 1)
  for (let row = 3; row < h; row += 4) {
    const half = Math.floor((w / 2) * row / h)
    for (let xx = x - half + 2; xx < x + half; xx += 6) {
      pxV3(ctx, xx, y - h + row, 4, 1, row % 8 ? pV3.roofGlint : pV3.roofShade)
    }
  }
  pxV3(ctx, x - 1, y - h, 2, h + 1, pV3.roofGlint)
}

let pV3 = null

function facadeTextureV3(ctx, x, y, w, h, p) {
  ctx.globalAlpha = .34
  for (let row = 3; row < h - 2; row += 5) {
    const offset = row % 10 ? 2 : 6
    for (let xx = offset; xx < w - 3; xx += 12) pxV3(ctx, x + xx, y + row, 5, 1, p.limestoneShade)
  }
  ctx.globalAlpha = 1
}

function windowV3(ctx, x, y, p, shutter = false) {
  outlineRectV3(ctx, x, y, 8, 11, p.lapis, p.dark)
  pxV3(ctx, x + 2, y + 2, 2, 7, p.sky)
  pxV3(ctx, x + 5, y + 2, 1, 7, p.water)
  if (shutter) { pxV3(ctx, x - 3, y, 2, 11, p.roof); pxV3(ctx, x + 9, y, 2, 11, p.roof) }
}

function doorV3(ctx, x, y, p) {
  outlineRectV3(ctx, x, y, 11, 18, p.terracotta, p.dark)
  for (let xx = 2; xx < 10; xx += 3) pxV3(ctx, x + xx, y + 2, 1, 14, p.roofLight)
  pxV3(ctx, x + 8, y + 9, 1, 1, p.bronze)
}

function columnV3(ctx, x, y, h, p) {
  pxV3(ctx, x - 2, y, 6, 2, p.marble)
  pxV3(ctx, x - 1, y + 2, 4, h - 4, p.limestone)
  pxV3(ctx, x, y + 3, 1, h - 6, p.marble)
  pxV3(ctx, x - 2, y + h - 2, 6, 2, p.marbleShade)
}

function potV3(ctx, x, y, p, color = p.terracotta) {
  pxV3(ctx, x + 1, y, 5, 1, p.dark)
  pxV3(ctx, x, y + 1, 7, 2, color)
  pxV3(ctx, x + 1, y + 3, 5, 5, color)
  pxV3(ctx, x + 2, y + 4, 1, 3, p.roofLight)
  pxV3(ctx, x + 2, y + 8, 3, 1, p.dark)
}

function cypressV3(ctx, x, y, p, t, seed) {
  const sway = Math.round(Math.sin(t * .001 + seed) * 1)
  pxV3(ctx, x, y - 3, 2, 12, p.bronze)
  for (let row = 0; row < 27; row += 4) {
    const half = Math.max(2, Math.floor(row / 4) + 1)
    shapeV2(ctx, [[x + 1 + sway, y - 31 + row], [x + half + sway, y - 25 + row], [x + 1 + sway, y - 22 + row], [x - half + sway, y - 25 + row]], row % 8 ? p.foliage : p.foliageLight, p.dark, 1)
  }
}

function oliveV3(ctx, x, y, p) {
  pxV3(ctx, x, y - 8, 3, 18, p.bronze)
  ;[[-8,-16],[-3,-22],[4,-20],[9,-14],[0,-14]].forEach(([dx,dy],i) => {
    pxV3(ctx, x + dx, y + dy, 10, 7, i % 2 ? p.foliageLight : p.foliage)
    pxV3(ctx, x + dx + 2, y + dy - 2, 6, 3, p.foliage)
  })
  pxV3(ctx, x - 5, y - 15, 2, 2, p.sandLight)
  pxV3(ctx, x + 8, y - 17, 2, 2, p.sandLight)
}

function templeV3(ctx, x, y, occupation, p, t) {
  const w = occupation === 'herald' ? 62 : 72
  const wallX = x - w / 2 + 5
  const wallY = y - 43
  outlineRectV3(ctx, wallX, wallY, w - 10, 37, p.limestone, p.dark)
  facadeTextureV3(ctx, wallX, wallY, w - 10, 37, p)
  const roofA = occupation === 'scholar' ? p.lapis : p.roof
  pV3 = { roofGlint: occupation === 'scholar' ? p.water : p.roofLight, roofShade: occupation === 'scholar' ? p.sky : p.terracotta }
  roofV3(ctx, x, wallY + 2, w, 21, roofA, occupation === 'scholar' ? p.water : p.terracotta, p.dark)
  shapeV2(ctx, [[x - 30, wallY + 8], [x, wallY - 6], [x + 30, wallY + 8]], p.marble, p.dark, 1)
  pxV3(ctx, x - 28, wallY + 8, 56, 5, p.marbleShade)
  for (let cx = x - 23; cx <= x + 23; cx += 15) columnV3(ctx, cx, wallY + 13, 24, p)
  outlineRectV3(ctx, x - 9, wallY + 16, 18, 21, p.dark, p.bronze)
  pxV3(ctx, x - 6, wallY + 19, 12, 2, p.lapis)
  for (let s = 0; s < 3; s++) {
    outlineRectV3(ctx, x - 35 - s * 2, y - 6 + s * 3, 70 + s * 4, 4, p.marbleShade, p.dark)
  }
  if (occupation === 'scholar') {
    pxV3(ctx, x + 31, wallY + 7, 2, 28, p.bronze)
    lineV2(ctx, [[x + 32, wallY + 10], [x + 43, wallY + 1]], p.bronze, 2)
    pxV3(ctx, x + 40, wallY - 2, 10, 4, p.lapis)
    pxV3(ctx, x + 48, wallY - 1, 2, 2, p.active)
  } else {
    pxV3(ctx, x, wallY - 7, 2, -10, p.bronze)
    shapeV2(ctx, [[x + 1, wallY - 16], [x + 15, wallY - 11], [x + 1, wallY - 5]], p.terracotta, p.dark, 1)
  }
}

function houseV3(ctx, x, y, occupation, p, t) {
  const w = occupation === 'merchant' ? 76 : 68
  const wallX = x - w / 2 + 4
  const wallY = y - 44
  outlineRectV3(ctx, wallX, wallY, w - 8, 38, p.sandLight, p.dark)
  facadeTextureV3(ctx, wallX, wallY, w - 8, 38, p)
  let roofA = p.roof
  let roofB = p.terracotta
  if (occupation === 'scribe') { roofA = p.lapis; roofB = p.water }
  if (occupation === 'merchant') { roofA = p.olive; roofB = p.foliageLight }
  pV3 = { roofGlint: occupation === 'scribe' ? p.water : p.roofLight, roofShade: occupation === 'merchant' ? p.foliage : p.terracotta }
  roofV3(ctx, x, wallY + 2, w, 22, roofA, roofB, p.dark)
  doorV3(ctx, x - 5, y - 24, p)
  windowV3(ctx, x - 26, wallY + 12, p, true)
  windowV3(ctx, x + 19, wallY + 12, p, true)

  if (occupation === 'blacksmith') {
    outlineRectV3(ctx, x + 22, wallY - 15, 9, 27, p.limestoneShade, p.dark)
    pxV3(ctx, x + 24, wallY - 17, 5, 3, p.dark)
    const smoke = Math.floor(t / 360) % 3
    pxV3(ctx, x + 25 + smoke, wallY - 23 - smoke * 2, 6, 4, p.muted)
    pxV3(ctx, x - 32, y - 24, 24, 3, p.lapis)
    pxV3(ctx, x - 30, y - 21, 20, 8, p.roof)
    pxV3(ctx, x + 24, y - 7, 12, 4, p.dark)
    pxV3(ctx, x + 27, y - 11, 6, 5, p.bronze)
  } else if (occupation === 'merchant') {
    pxV3(ctx, x - 33, y - 25, 27, 3, p.lapis)
    for (let xx = 0; xx < 27; xx += 6) pxV3(ctx, x - 33 + xx, y - 25, 3, 3, xx % 12 ? p.marble : p.lapis)
    pxV3(ctx, x - 31, y - 22, 2, 17, p.bronze)
    pxV3(ctx, x - 9, y - 22, 2, 17, p.bronze)
    pxV3(ctx, x - 31, y - 8, 24, 5, p.terracotta)
    potV3(ctx, x + 27, y - 15, p)
    potV3(ctx, x + 35, y - 12, p, p.bronze)
  } else if (occupation === 'scribe') {
    outlineRectV3(ctx, x - 20, wallY + 9, 40, 12, p.dark, p.bronze)
    for (let xx = x - 16; xx < x + 16; xx += 8) {
      pxV3(ctx, xx, wallY + 12, 5, 2, p.marble)
      pxV3(ctx, xx + 1, wallY + 16, 4, 2, p.roofLight)
    }
  }
  outlineRectV3(ctx, x - w / 2, y - 7, w, 6, p.marbleShade, p.dark)
}

function trainingYardV3(ctx, x, y, p) {
  outlineRectV3(ctx, x - 37, y - 28, 74, 27, p.sandLight, p.dark)
  pxV3(ctx, x - 34, y - 25, 68, 21, p.sand)
  for (const cx of [x - 31, x + 29]) columnV3(ctx, cx, y - 51, 24, p)
  pxV3(ctx, x - 33, y - 52, 66, 4, p.marbleShade)
  pxV3(ctx, x + 10, y - 23, 3, 18, p.bronze)
  pxV3(ctx, x + 5, y - 18, 13, 3, p.bronze)
  pxV3(ctx, x + 7, y - 28, 9, 9, p.terracotta)
  ellipseV2(ctx, x - 17, y - 15, 7, 9, p.roof, p.bronze, 1)
  lineV2(ctx, [[x - 26, y - 24], [x - 12, y - 7]], p.marble, 2)
}

function buildingV3(ctx, site, profile, p, t, selected) {
  const { x, y } = site
  ctx.globalAlpha = profile.status === 'offline' ? .55 : 1
  pxV3(ctx, x - 39, y + 1, 78, 4, p.shadow)
  if (profile.occupation === 'scholar' || profile.occupation === 'herald') templeV3(ctx, x, y, profile.occupation, p, t)
  else if (profile.occupation === 'warrior') trainingYardV3(ctx, x, y, p)
  else houseV3(ctx, x, y, profile.occupation, p, t)
  ctx.globalAlpha = 1
  if (selected) {
    ctx.strokeStyle = p.active
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x - 41.5, y - 70.5, 83, 76)
    ctx.setLineDash([])
  }
}

function characterV3(ctx, site, profile, p, t) {
  const frame = profile.status === 'working' ? Math.floor(t / 260) % 2 : 0
  const x = site.x - 25
  const y = site.y + 6 - frame
  const garment = profile.occupation === 'scholar' ? p.lapis : profile.occupation === 'blacksmith' ? p.roof : profile.occupation === 'merchant' ? p.olive : profile.occupation === 'warrior' ? p.terracotta : profile.occupation === 'scribe' ? p.water : p.active
  pxV3(ctx, x - 5, y, 12, 3, p.shadow)
  pxV3(ctx, x - 3, y - 15, 8, 7, p.marble)
  pxV3(ctx, x - 4, y - 17, 10, 4, profile.occupation === 'warrior' ? p.bronze : p.dark)
  pxV3(ctx, x - 1, y - 13, 1, 1, p.dark)
  pxV3(ctx, x + 3, y - 13, 1, 1, p.dark)
  shapeV2(ctx, [[x - 5, y - 8], [x + 7, y - 8], [x + 9, y], [x - 7, y]], garment, p.dark, 1)
  pxV3(ctx, x - 4 + frame, y, 3, 5, p.dark)
  pxV3(ctx, x + 4 - frame, y, 3, 5, p.dark)
  if (profile.occupation === 'blacksmith') {
    lineV2(ctx, [[x + 6, y - 6], [x + 16 - frame * 3, y - 15 + frame * 9]], p.bronze, 2)
    pxV3(ctx, x + 14 - frame * 3, y - 17 + frame * 9, 7, 3, p.dark)
    if (frame) { pxV3(ctx, x + 18, y - 3, 2, 2, p.active); pxV3(ctx, x + 21, y - 6, 1, 1, p.active) }
  } else if (profile.occupation === 'scholar' || profile.occupation === 'scribe') {
    outlineRectV3(ctx, x + 5, y - 9, 10, 8, p.marble, p.bronze)
    pxV3(ctx, x + 9, y - 8, 1, 6, p.active)
  } else if (profile.occupation === 'warrior') {
    lineV2(ctx, [[x + 6, y - 6], [x + 18, y - 20 + frame * 6]], p.marble, 2)
    ellipseV2(ctx, x - 5, y - 5, 5, 6, p.roof, p.bronze, 1)
  } else if (profile.occupation === 'merchant') potV3(ctx, x + 9, y - 8, p)
  else {
    pxV3(ctx, x + 5, y - 15, 2, 14, p.bronze)
    shapeV2(ctx, [[x + 7, y - 16], [x + 18, y - 12], [x + 7, y - 8]], p.terracotta, p.dark, 1)
  }
}

function activityV3(ctx, site, profile, p, t) {
  const activity = profile.activity
  if (!activity) return
  const x = site.x + 29
  const y = site.y - 9
  outlineRectV3(ctx, x - 9, y - 14, 19, 15, p.dark, p.marble)
  pxV3(ctx, x - 5, y + 1, 5, 3, p.dark)
  const category = activity.category || 'craft'
  if (category === 'forge') { pxV3(ctx, x - 5, y - 7, 11, 4, p.bronze); pxV3(ctx, x - 2, y - 10, 5, 4, p.dark) }
  else if (category === 'scroll') { outlineRectV3(ctx, x - 6, y - 10, 12, 8, p.marble, p.bronze); pxV3(ctx, x - 3, y - 7, 6, 1, p.lapis) }
  else if (category === 'observatory') { lineV2(ctx, [[x - 5,y - 3],[x+3,y-11]],p.bronze,2); pxV3(ctx,x+1,y-12,8,3,p.lapis) }
  else if (category === 'mechanism') { ellipseV2(ctx,x,y-7,5,5,p.bronze,p.marble,1); pxV3(ctx,x-1,y-11,2,8,p.dark) }
  else if (category === 'messenger') outlineRectV3(ctx,x-6,y-10,12,8,p.marble,p.bronze)
  else if (category === 'hourglass') { shapeV2(ctx,[[x-5,y-11],[x+5,y-11],[x+2,y-7],[x+5,y-2],[x-5,y-2],[x-2,y-7]],p.marble,p.bronze,1) }
  else pxV3(ctx, x - 3, y - 10, 7, 7, p.active)
  if (activity.phase === 'waiting') textV3(ctx, '?', x + 9, y - 14, p.active, 7)
  if (activity.phase === 'failed') textV3(ctx, '×', x + 9, y - 14, p.danger, 7)
  if (activity.phase === 'complete') textV3(ctx, '✓', x + 9, y - 14, p.success, 7)
  if (profile.activeSessionCount > 1) {
    outlineRectV3(ctx, x - 12, y - 18, 9, 9, p.active, p.dark)
    textV3(ctx, String(profile.activeSessionCount), x - 8, y - 13, p.dark, 6)
  }
}

function textV3(ctx, value, x, y, fill, size = 6, align = 'center') {
  ctx.fillStyle = fill
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`
  ctx.fillText(value, Math.round(x), Math.round(y))
}

function labelV3(ctx, site, profile, p) {
  const name = profile.display_name || (profile.name === 'default' ? 'Hermes' : profile.name)
  const detail = profile.activity?.phase === 'working' ? toolCategoryLabel(profile.activity.category) : activityLabel(profile.status)
  const w = Math.max(58, Math.min(86, name.length * 6 + 16))
  outlineRectV3(ctx, site.x - w / 2, site.y + 10, w, 19, p.dark, profile.status === 'working' ? p.active : p.limestoneShade)
  textV3(ctx, name, site.x, site.y + 16, p.text, 7)
  textV3(ctx, detail, site.x, site.y + 24, ['working','waiting','failed'].includes(profile.status) ? p.active : p.muted, 5)
}

function worldBaseV3(ctx, p, t) {
  pxV3(ctx, 0, 0, 320, 180, p.sky)
  pxV3(ctx, 0, 44, 320, 32, p.skySoft)
  shapeV2(ctx, [[0,70],[46,42],[96,70],[150,37],[216,70],[270,45],[320,68],[320,95],[0,95]], p.groundDark)
  pxV3(ctx, 0, 75, 320, 19, p.water)
  for (let i = 0; i < 14; i++) {
    const yy = 77 + ((i * 7 + Math.floor(t / 280)) % 15)
    pxV3(ctx, (i * 29) % 320, yy, 13, 1, i % 2 ? p.lapis : p.marble)
  }
  pxV3(ctx, 0, 93, 320, 31, p.sandLight)
  pxV3(ctx, 0, 120, 320, 7, p.limestoneShade)
  pxV3(ctx, 0, 124, 320, 56, p.sand)
  for (let xx = 0; xx < 320; xx += 16) {
    pxV3(ctx, xx, 121, 11, 2, p.marbleShade)
    pxV3(ctx, xx + 7, 128, 7, 2, p.limestoneShade)
    pxV3(ctx, xx, 169, 13, 2, p.limestoneShade)
  }
  for (let s = 0; s < 5; s++) outlineRectV3(ctx, 153 - s * 2, 119 + s * 5, 14 + s * 4, 5, p.marbleShade, p.dark)
  cypressV3(ctx, 12, 111, p, t, 1)
  cypressV3(ctx, 304, 112, p, t, 2)
  oliveV3(ctx, 24, 172, p)
  oliveV3(ctx, 292, 171, p)
}

function agoraV3(ctx, p, t) {
  outlineRectV3(ctx, 137, 126, 46, 25, p.marbleShade, p.dark)
  pxV3(ctx, 141, 129, 38, 18, p.sandLight)
  ellipseV2(ctx, 160, 135, 13, 5, p.water, p.dark, 1)
  pxV3(ctx, 156, 124, 9, 10, p.bronze)
  pxV3(ctx, 158, 115, 5, 12, p.marble)
  pxV3(ctx, 154, 114, 13, 3, p.marbleShade)
  const splash = Math.floor(t / 220) % 2
  pxV3(ctx, 159, 108 - splash, 3, 7, p.water)
  pxV3(ctx, 155, 111 + splash, 3, 2, p.water)
  pxV3(ctx, 164, 110 + splash, 3, 2, p.water)
  textV3(ctx, 'AGORA', 160, 146, p.dark, 6)
}

function drawWorldV3(ctx, canvas, profiles, selectedName, p, t, hitMap) {
  const buffer = canvas.__polisBuffer || (canvas.__polisBuffer = document.createElement('canvas'))
  if (buffer.width !== POLIS_W_V3) buffer.width = POLIS_W_V3
  if (buffer.height !== POLIS_H_V3) buffer.height = POLIS_H_V3
  const g = buffer.getContext('2d')
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, POLIS_W_V3, POLIS_H_V3)
  worldBaseV3(g, p, t)
  agoraV3(g, p, t)
  const ordered = profiles.map((profile, index) => ({ profile, site: POLIS_LAYOUTS_V3[index % POLIS_LAYOUTS_V3.length] })).sort((a,b) => a.site.y - b.site.y)
  ordered.forEach(({ profile, site }) => {
    buildingV3(g, site, profile, p, t, profile.name === selectedName)
    characterV3(g, site, profile, p, t)
    activityV3(g, site, profile, p, t)
    labelV3(g, site, profile, p)
  })
  outlineRectV3(g, 87, 5, 146, 22, p.dark, p.bronze)
  textV3(g, 'THE POLIS OF HERMES', 160, 13, p.text, 9)
  textV3(g, 'A CITY OF MINDS AND CRAFT', 160, 22, p.muted, 5)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / POLIS_W_V3, canvas.height / POLIS_H_V3)))
  const dw = POLIS_W_V3 * scale
  const dh = POLIS_H_V3 * scale
  const ox = Math.floor((canvas.width - dw) / 2)
  const oy = Math.floor((canvas.height - dh) / 2)
  ctx.fillStyle = p.groundDark
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(buffer, ox, oy, dw, dh)
  hitMap.current = ordered.map(({ profile, site }) => ({
    name: profile.name,
    x: ox + (site.x - 43) * scale,
    y: oy + (site.y - 73) * scale,
    w: 86 * scale,
    h: 106 * scale
  }))
}

let polisArtCache = null
let polisArtPromise = null
let polisArtError = ''

function loadImageV4(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode a Polis art asset'))
    image.src = source
  })
}

function loadPolisArtV4() {
  if (polisArtCache) return Promise.resolve(polisArtCache)
  if (polisArtPromise) return polisArtPromise
  polisArtPromise = (async () => {
    polisArtError = 'loading: bridge'
    const desktop = window.hermesDesktop
    if (!desktop?.desktopPluginsRoot || !desktop?.readFileDataUrl) throw new Error('Desktop image bridge unavailable')
    polisArtError = 'loading: plugin root'
    const root = String(await desktop.desktopPluginsRoot()).replace(/[\\/]+$/, '')
    polisArtError = `loading: ${root}`
    const filePath = name => `${root}\\polis-of-hermes\\assets\\${name}`
    const files = {
      background: 'polis-terraces.webp',
      environment: 'environment-animation.webp', // v2: fixed terrace geometry, fixed-nozzle fountain spurts
      herald: 'building-herald.webp',
      blacksmith: 'building-blacksmith.webp',
      scholar: 'building-scholar.webp',
      merchant: 'building-merchant.webp',
      warrior: 'building-warrior.webp',
      scribe: 'building-scribe.webp',
      characterHerald: 'character-animation-herald.webp',
      characterBlacksmith: 'character-animation-blacksmith.webp',
      characterScholar: 'character-animation-scholar.webp',
      characterMerchant: 'character-animation-merchant.webp',
      characterWarrior: 'character-animation-warrior.webp',
      characterScribe: 'character-animation-scribe.webp'
    }
    const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => {
      polisArtError = `loading data: ${file}`
      const dataUrl = await desktop.readFileDataUrl(filePath(file))
      polisArtError = `decoding: ${file}`
      const response = await fetch(dataUrl)
      const bitmap = await createImageBitmap(await response.blob())
      return [key, bitmap]
    }))
    polisArtCache = Object.fromEntries(entries)
    polisArtError = ''
    return polisArtCache
  })().catch(error => {
    polisArtPromise = null
    polisArtError = error instanceof Error ? error.message : String(error)
    console.warn('[polis-of-hermes] generated art assets unavailable; using procedural fallback', error)
    return null
  })
  return polisArtPromise
}

const POLIS_LAYOUTS_V4 = [
  { x: 74, y: 76 }, { x: 246, y: 76 },
  { x: 74, y: 146 }, { x: 246, y: 146 }
]

function drawCharacterArtV4(ctx, site, profile, selectedName, p, t, art) {
  const occupation = profile.occupation || 'herald'
  const key = `character${occupation.charAt(0).toUpperCase()}${occupation.slice(1)}`
  const image = art[key] || art.characterHerald
  if (!image) return

  // Pet-style atlas: four genuinely redrawn frames per state, not transforms.
  const frameW = 96
  const frameH = 118
  const row = profile.status === 'working' ? 1 : profile.status === 'waiting' ? 2 : 0
  const loopMs = row === 1 ? 760 : row === 2 ? 1750 : 2100
  const phase = [...profile.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 47
  const frame = Math.floor(((t + phase) % loopMs) / (loopMs / 4)) % 4
  const sx = frame * frameW
  const sy = row * frameH
  const targetH = occupation === 'warrior' ? 100 : 94
  const ratio = targetH / frameH
  const w = Math.round(frameW * ratio)
  const h = Math.round(frameH * ratio)
  const centerX = site.x * 3 - 60
  const baseline = site.y * 3 + 27
  const x = Math.round(centerX - w / 2)
  const y = Math.round(baseline - h)

  ctx.save()
  ctx.globalAlpha = profile.status === 'offline' ? .55 : 1
  ctx.fillStyle = 'rgba(22, 26, 38, .32)'
  ctx.beginPath()
  ctx.ellipse(centerX, baseline - 1, Math.max(16, w * .36), 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (profile.name === selectedName) {
    ctx.save()
    ctx.shadowColor = p.active
    ctx.shadowBlur = 18
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.drawImage(image, sx, sy, frameW, frameH, x, y, w, h)
    ctx.restore()
  }
  ctx.drawImage(image, sx, sy, frameW, frameH, x, y, w, h)
  ctx.globalAlpha = 1
  const statusColor = profile.status === 'working' ? p.active : profile.status === 'waiting' ? p.gold : profile.status === 'failed' ? p.red : p.oliveLight
  ctx.fillStyle = p.dark
  ctx.fillRect(x - 3, y - 3, 10, 10)
  ctx.fillStyle = statusColor
  ctx.fillRect(x, y, 4, 4)
  ctx.restore()
}

function drawAmbientBackV4(ctx, t) {
  const s = t * .001
  ctx.save()

  // Slow sky haze and small cloudlets; architecture remains perfectly still.
  const haze = ctx.createLinearGradient(0, 0, 0, 170)
  haze.addColorStop(0, `rgba(255, 238, 195, ${.035 + Math.sin(s * .14) * .012})`)
  haze.addColorStop(1, 'rgba(92, 199, 226, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, 960, 175)
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 223 + s * (4 + i * .45)) % 1120) - 80
    const y = 35 + (i % 3) * 18 + Math.sin(s * .17 + i) * 2
    ctx.fillStyle = `rgba(255, 249, 225, ${.10 + (i % 2) * .035})`
    ctx.beginPath()
    ctx.ellipse(x, y, 24, 5, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 18, y - 3, 17, 6, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 35, y + 1, 23, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Layered Aegean current: independent wave bands and glints.
  ctx.beginPath()
  ctx.rect(0, 88, 960, 72)
  ctx.clip()
  for (let band = 0; band < 5; band += 1) {
    const y = 101 + band * 11 + Math.sin(s * (.55 + band * .08) + band) * 2
    ctx.strokeStyle = band % 2 ? 'rgba(125, 229, 238, .20)' : 'rgba(240, 247, 207, .15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = -30; x < 990; x += 34) {
      const drift = (s * (9 + band * 2)) % 34
      const yy = y + Math.sin(x * .025 + s * .9 + band) * 2
      ctx.moveTo(x + drift, yy)
      ctx.lineTo(x + 14 + drift, yy + .5)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 16; i += 1) {
    const x = (i * 71 + s * 13) % 1000 - 20
    const y = 98 + (i * 17) % 51
    const pulse = .08 + Math.max(0, Math.sin(s * 1.3 + i * 1.7)) * .24
    ctx.fillStyle = `rgba(255, 246, 186, ${pulse})`
    ctx.fillRect(Math.round(x), y, 11 + (i % 3) * 4, 2)
  }
  ctx.restore()

  // Stable trunks with separately swaying olive/cypress tips.
  ctx.save()
  const groves = [[43, 145], [76, 126], [110, 156], [858, 150], [895, 124], [930, 159]]
  groves.forEach(([x, y], i) => {
    const breeze = .62 + Math.sin(s * .19 + i * .83) * .23
    const sway = Math.sin(s * (.58 + i * .026) + i * 1.3) * 2.05 * breeze
    const flutter = Math.sin(s * 1.17 + i * 2.1) * .82 * breeze
    ctx.fillStyle = 'rgba(28, 80, 62, .30)'
    ctx.beginPath()
    ctx.ellipse(x + sway, y - 26, 12, 27, sway * .012 - .08, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(111, 153, 83, .28)'
    ctx.beginPath()
    ctx.ellipse(x + sway * .75 + flutter - 3, y - 34, 6, 13, sway * .016, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(186, 190, 105, .15)'
    ctx.fillRect(Math.round(x + sway + flutter - 4), Math.round(y - 45 + flutter), 3, 5)
  })
  ctx.restore()
}

function drawAmbientFrontV4(ctx, t) {
  const s = t * .001
  ctx.save()

  // Secondary ambience stays procedural; the major sky, sea, tree and fountain
  // motion comes from the four-frame environment atlas above.
  // Chimney smoke, warm brazier sparks, birds and pollen.
  ;[[255, 205], [705, 209]].forEach(([x, y], i) => {
    for (let puff = 0; puff < 4; puff += 1) {
      const phase = (s * .09 + puff * .23 + i * .17) % 1
      ctx.fillStyle = `rgba(221, 213, 190, ${(1 - phase) * .18})`
      ctx.beginPath()
      ctx.arc(x + Math.sin(s * .35 + puff) * 5 + phase * 11, y - phase * 83, 5 + phase * 10, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  for (let i = 0; i < 9; i += 1) {
    const phase = (s * .11 + i * .137) % 1
    const x = 190 + ((i * 97 + s * 4) % 620)
    const y = 330 + Math.sin(s * .6 + i) * 18 - phase * 25
    ctx.fillStyle = `rgba(255, 218, 116, ${Math.sin(phase * Math.PI) * .30})`
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2)
  }
  for (let i = 0; i < 3; i += 1) {
    const x = ((s * (13 + i * 2) + i * 311) % 1120) - 80
    const y = 58 + i * 13 + Math.sin(s * .8 + i) * 5
    ctx.strokeStyle = 'rgba(31, 45, 61, .42)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 6, y)
    ctx.quadraticCurveTo(x - 2, y - 4, x + 1, y)
    ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y)
    ctx.stroke()
  }
  ctx.restore()
}

// Shared 2.5D construction guide for all workplaces. The terrace faces the
// viewer (+Y), sunlight comes from the upper left, and every sprite is set
// slightly behind the front paving edge so the floor can continue around it.
const BUILDING_INTEGRATION_V4 = {
  herald: { door: .04, accent: 'gold' },
  blacksmith: { door: -.29, accent: 'terracotta' },
  scholar: { door: -.08, accent: 'lapis' },
  merchant: { door: 0, accent: 'foliageLight' },
  warrior: { door: 0, accent: 'roof' },
  scribe: { door: .05, accent: 'water' }
}

function buildingPlacementV4(site, image) {
  const maxW = site.y < 100 ? 245 : 255
  const maxH = site.y < 100 ? 205 : 195
  const ratio = Math.min(maxW / image.width, maxH / image.height)
  const w = Math.round(image.width * ratio)
  const h = Math.round(image.height * ratio)
  const floorFront = site.y < 100 ? 243 : 440
  const baseline = floorFront - 12
  const foundationDepth = 8
  const x = site.x * 3 - Math.round(w / 2)
  const spriteBase = baseline - foundationDepth
  return { x, y: spriteBase - h, w, h, baseline, floorFront, spriteBase }
}

function drawApproachPathV4(ctx, placement, occupation, p) {
  const meta = BUILDING_INTEGRATION_V4[occupation] || BUILDING_INTEGRATION_V4.herald
  const doorX = placement.x + placement.w * (.5 + meta.door)
  const backY = placement.spriteBase - 1
  const frontY = placement.floorFront - 1
  ctx.save()
  ctx.globalAlpha = .48
  ctx.fillStyle = p.sandLight
  ctx.beginPath()
  ctx.moveTo(doorX - 8, backY)
  ctx.lineTo(doorX + 8, backY)
  ctx.lineTo(doorX + 18, frontY)
  ctx.lineTo(doorX - 18, frontY)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = .6
  ctx.strokeStyle = p.limestoneShade
  ctx.lineWidth = 1
  for (let y = placement.baseline + 3; y <= frontY; y += 7) {
    const spread = 10 + (y - placement.baseline) * .38
    ctx.beginPath(); ctx.moveTo(doorX - spread, y); ctx.lineTo(doorX + spread, y); ctx.stroke()
  }
  ctx.globalAlpha = .35
  ctx.beginPath(); ctx.moveTo(doorX, backY + 2); ctx.lineTo(doorX - 2, frontY); ctx.stroke()
  ctx.restore()
}

function drawZoneFoundationV4(ctx, placement, image, occupation, p) {
  const meta = BUILDING_INTEGRATION_V4[occupation] || BUILDING_INTEGRATION_V4.herald
  const accent = p[meta.accent] || p.bronze
  const { x, w, spriteBase, baseline } = placement
  ctx.save()

  // Derive the contact shadow from the sprite's lowest alpha-bearing pixels.
  // This follows columns, steps and wall corners instead of forming an ellipse.
  const sourceY = Math.floor(image.height * .76)
  const sourceH = Math.max(1, image.height - sourceY)
  ctx.globalAlpha = .3
  ctx.filter = 'brightness(0)'
  ctx.drawImage(image, 0, sourceY, image.width, sourceH, x + 5, spriteBase - 2, w, 11)
  ctx.filter = 'none'

  // A shallow perspective-matched top plane physically receives the building.
  ctx.globalAlpha = 1
  ctx.fillStyle = p.limestone
  ctx.beginPath()
  ctx.moveTo(x + 8, spriteBase - 4)
  ctx.lineTo(x + w - 8, spriteBase - 4)
  ctx.lineTo(x + w + 2, spriteBase + 2)
  ctx.lineTo(x - 2, spriteBase + 2)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = p.limestoneShade
  ctx.lineWidth = 2
  ctx.stroke()

  // A narrow lower-right grounding edge establishes the shared light direction
  // without turning the whole foundation into a dark geometric platform.
  ctx.globalAlpha = .2
  ctx.fillStyle = p.groundDark
  ctx.fillRect(x + 14, spriteBase + 2, Math.max(18, w - 28), 3)

  ctx.globalAlpha = .74
  ctx.fillStyle = accent
  ctx.fillRect(x + 14, spriteBase + 1, Math.max(20, w - 28), 2)
  ctx.restore()
}

function drawZoneForegroundV4(ctx, placement, occupation, p) {
  const meta = BUILDING_INTEGRATION_V4[occupation] || BUILDING_INTEGRATION_V4.herald
  const accent = p[meta.accent] || p.bronze
  const doorX = Math.round(placement.x + placement.w * (.5 + meta.door))
  const { x, w, spriteBase, baseline } = placement
  ctx.save()

  // The front plinth face overlaps the sprite by two pixels: that occlusion is
  // the cue that the building is seated inside, rather than pasted over, the floor.
  ctx.fillStyle = p.marbleShade
  ctx.beginPath()
  ctx.moveTo(x + 4, spriteBase - 1)
  ctx.lineTo(x + w - 4, spriteBase - 1)
  ctx.lineTo(x + w - 9, baseline)
  ctx.lineTo(x + 9, baseline)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = p.marble
  ctx.fillRect(x + 9, spriteBase - 2, Math.max(16, w - 18), 3)
  ctx.fillStyle = p.limestoneShade
  ctx.fillRect(x + 11, baseline - 2, Math.max(14, w - 22), 2)

  // Three widening treads connect the illustrated doorway to the approach path.
  ;[
    { width: 18, y: spriteBase - 1 },
    { width: 27, y: spriteBase + 2 },
    { width: 36, y: spriteBase + 5 }
  ].forEach((step, index) => {
    ctx.fillStyle = index === 1 ? p.marbleShade : p.marble
    ctx.fillRect(Math.round(doorX - step.width / 2), step.y, step.width, 3)
    ctx.fillStyle = p.limestoneShade
    ctx.fillRect(Math.round(doorX - step.width / 2), step.y + 2, step.width, 1)
  })

  // Broken foreground paving crosses the foundation edge instead of framing it.
  ctx.globalAlpha = .74
  ctx.fillStyle = p.groundLight
  for (let i = 0; i < 7; i += 1) {
    const stoneX = x + 12 + i * Math.max(12, (w - 30) / 7)
    if (Math.abs(stoneX - doorX) > 24) ctx.fillRect(Math.round(stoneX), baseline - 1 + (i % 2), 8, 3)
  }
  ctx.globalAlpha = .8
  ctx.fillStyle = accent
  ctx.fillRect(doorX - 2, baseline + 1, 4, 3)
  ctx.restore()
}

function drawZonePropsV4(ctx, site, occupation, p, t) {
  const cx = site.x * 3
  const baseline = site.y * 3 + (site.y < 100 ? 12 : 2)
  const pulse = Math.floor(t / 330) % 2
  ctx.save()
  ctx.lineWidth = 2
  if (occupation === 'blacksmith') {
    ctx.fillStyle = 'rgba(46, 36, 34, .38)'
    ctx.beginPath(); ctx.ellipse(cx + 70, baseline - 2, 25, 7, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.active
    ctx.fillRect(cx + 62 + pulse * 5, baseline - 13 - pulse * 3, 3, 3)
    ctx.fillRect(cx + 77 - pulse * 4, baseline - 9 - pulse * 5, 2, 2)
  } else if (occupation === 'merchant') {
    ;[-1, 1].forEach((side, index) => {
      ctx.fillStyle = index ? p.terracotta : p.bronze
      ctx.fillRect(cx + side * 74 - 7, baseline - 14, 14, 12)
      ctx.fillStyle = p.marble
      ctx.fillRect(cx + side * 74 - 4, baseline - 17, 8, 4)
    })
  } else if (occupation === 'scholar') {
    ctx.strokeStyle = p.lapis
    ctx.globalAlpha = .72
    ctx.beginPath(); ctx.arc(cx, baseline + 1, 25, Math.PI, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, baseline + 1, 16, Math.PI, Math.PI * 2); ctx.stroke()
  } else if (occupation === 'herald') {
    ctx.fillStyle = p.gold
    for (let i = -2; i <= 2; i += 1) ctx.fillRect(cx + i * 13 - 2, baseline + Math.abs(i) * 2, 5, 5)
  } else if (occupation === 'warrior') {
    ctx.strokeStyle = p.terracotta
    ctx.globalAlpha = .7
    ctx.beginPath(); ctx.ellipse(cx, baseline, 48, 11, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = p.bronze
    ctx.fillRect(cx + 55, baseline - 21, 4, 20)
  } else if (occupation === 'scribe') {
    ctx.fillStyle = p.water
    ctx.globalAlpha = .72
    for (let i = -2; i <= 2; i += 1) ctx.fillRect(cx + i * 12 - 4, baseline, 8, 4)
  }
  ctx.restore()
}

function drawNameplateV4(ctx, site, profile, p) {
  const name = profile.display_name || (profile.name === 'default' ? 'Hermes' : profile.name)
  const detail = profile.activity?.phase === 'working' ? toolCategoryLabel(profile.activity.category) : activityLabel(profile.status)
  const x = site.x * 3 - 60
  const y = site.y * 3 + 41
  const width = Math.max(104, Math.min(148, name.length * 8 + 30))
  ctx.save()
  ctx.fillStyle = 'rgba(24, 35, 55, .88)'
  ctx.strokeStyle = profile.status === 'working' ? p.active : p.bronze
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x - width / 2, y, width, 32, 5)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = p.gold
  ctx.fillRect(x - width / 2 + 8, y + 5, 3, 3)
  ctx.fillRect(x + width / 2 - 11, y + 5, 3, 3)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = p.marble
  ctx.font = '700 12px Georgia, Cambria, serif'
  ctx.fillText(name, x, y + 11)
  ctx.fillStyle = ['working', 'waiting', 'failed'].includes(profile.status) ? p.active : p.muted
  ctx.font = '600 9px Georgia, Cambria, serif'
  ctx.fillText(String(detail).toUpperCase(), x, y + 23)
  ctx.restore()
}

function drawPolisTitleV4(ctx, p) {
  const x = 480
  const y = 13
  ctx.save()
  ctx.fillStyle = 'rgba(24, 35, 55, .84)'
  ctx.strokeStyle = p.bronze
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(x - 147, y, 294, 49, 7); ctx.fill(); ctx.stroke()
  ctx.fillStyle = p.gold
  ctx.beginPath(); ctx.moveTo(x - 132, y + 24); ctx.lineTo(x - 126, y + 18); ctx.lineTo(x - 120, y + 24); ctx.lineTo(x - 126, y + 30); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x + 132, y + 24); ctx.lineTo(x + 126, y + 18); ctx.lineTo(x + 120, y + 24); ctx.lineTo(x + 126, y + 30); ctx.closePath(); ctx.fill()
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = p.marble
  ctx.font = '700 17px Georgia, Cambria, serif'
  ctx.fillText('THE POLIS OF HERMES', x, y + 19)
  ctx.fillStyle = p.gold
  ctx.font = '600 9px Georgia, Cambria, serif'
  ctx.fillText('A CITY OF MINDS AND CRAFT', x, y + 37)
  ctx.restore()
}

function drawWorldV4(ctx, canvas, profiles, selectedName, p, t, hitMap, art) {
  const buffer = canvas.__polisArtBuffer || (canvas.__polisArtBuffer = document.createElement('canvas'))
  if (buffer.width !== 960) buffer.width = 960
  if (buffer.height !== 540) buffer.height = 540
  const g = buffer.getContext('2d')
  g.imageSmoothingEnabled = true
  g.clearRect(0, 0, 960, 540)
  const environment = art.environment || art.background
  if (art.environment) {
    const environmentFrame = Math.floor(t / 780) % 4
    g.drawImage(environment, environmentFrame * 960, 0, 960, 540, 0, 0, 960, 540)
  } else {
    g.drawImage(environment, 0, 0, 960, 540)
    drawAmbientBackV4(g, t)
  }

  const ordered = profiles.slice(0, 4).map((profile, index) => {
    const site = POLIS_LAYOUTS_V4[index]
    const image = art[profile.occupation] || art.herald
    return { profile, site, image, placement: buildingPlacementV4(site, image) }
  })
  ordered.forEach(({ profile, placement }) => drawApproachPathV4(g, placement, profile.occupation, p))
  ordered.forEach(({ profile, site, image, placement }) => {
    const { x, y, w, h } = placement
    drawZoneFoundationV4(g, placement, image, profile.occupation, p)
    g.globalAlpha = profile.status === 'offline' ? .58 : 1
    if (profile.name === selectedName) {
      g.save()

      // Animated gold glow
      g.shadowColor = '#FFD54A'
      g.shadowBlur = 34 + Math.sin(t * 0.006) * 10
      g.shadowOffsetX = 0
      g.shadowOffsetY = 0

      // Make selected sprite visibly brighter
      g.filter = 'brightness(1.3) saturate(1.35)'

      // Draw once to create the glow
      g.drawImage(image, x, y, w, h)

      g.restore()
    }
    g.drawImage(image, x, y, w, h)
    g.globalAlpha = 1
    drawZoneForegroundV4(g, placement, profile.occupation, p)
    drawZonePropsV4(g, site, profile.occupation, p, t)
  })
  drawAmbientFrontV4(g, t)
  ordered.forEach(({ profile, site }) => drawCharacterArtV4(g, site, profile, selectedName, p, t, art))

  g.save()
  g.scale(3, 3)
  ordered.forEach(({ profile, site }) => activityV3(g, site, profile, p, t))
  g.restore()
  ordered.forEach(({ profile, site }) => drawNameplateV4(g, site, profile, p))
  drawPolisTitleV4(g, p)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const bgScale = Math.max(
    canvas.width / 960,
    canvas.height / 540
  )
  const bgW = Math.round(960 * bgScale)
  const bgH = Math.round(540 * bgScale)
  const bgX = Math.floor((canvas.width - bgW) / 2)
  const bgY = Math.floor((canvas.height - bgH) / 2)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 0.55
  ctx.filter = 'blur(18px) brightness(0.55)'

  ctx.drawImage(
    buffer,
    bgX,
    bgY,
    bgW,
    bgH
  )
  ctx.restore()

  const scale = Math.min(
    canvas.width / 960,
    canvas.height / 540
  )
  const dw = Math.round(960 * scale)
  const dh = Math.round(540 * scale)
  const ox = Math.floor((canvas.width - dw) / 2)
  const oy = Math.floor((canvas.height - dh) / 2)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(
    ox,
    oy,
    dw,
    dh,
    8 // corner radius in pixels
  )

  ctx.clip()

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(
    buffer,
    ox,
    oy,
    dw,
    dh
  )

  ctx.restore()
  hitMap.current = ordered.map(({ profile, site }) => ({
    name: profile.name,
    x: ox + (site.x * 3 - 135) * scale,
    y: oy + (site.y * 3 - 215) * scale,
    w: 270 * scale,
    h: 315 * scale
  }))
}

function PolisCanvas({ profiles, selectedName, onSelect, onOpen }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const hitMap = useRef([])
  const stateRef = useRef({ profiles, selectedName })
  stateRef.current = { profiles, selectedName }

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    let raf = 0
    let visible = true
    let palette = paletteFor(wrap)
    loadPolisArtV4()
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      canvas.width = Math.max(320, Math.floor(rect.width))
      canvas.height = Math.max(320, Math.floor(rect.height))
      palette = paletteFor(wrap)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    resize()
    const onVisibility = () => { visible = !document.hidden }
    document.addEventListener('visibilitychange', onVisibility)
    const frame = time => {
      if (visible) {
        const ctx = canvas.getContext('2d')
        if (polisArtCache) {
          try {
            drawWorldV4(ctx, canvas, stateRef.current.profiles, stateRef.current.selectedName, palette, time, hitMap, polisArtCache)
          } catch (error) {
            polisArtError = `render: ${error instanceof Error ? error.message : String(error)}`
            polisArtCache = null
            drawWorldV3(ctx, canvas, stateRef.current.profiles, stateRef.current.selectedName, palette, time, hitMap)
          }
        } else {
          drawWorldV3(ctx, canvas, stateRef.current.profiles, stateRef.current.selectedName, palette, time, hitMap)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const locate = event => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return hitMap.current.find(hit => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h)
  }

  return jsx('div', {
    ref: wrapRef,
    className: 'relative min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-l-xl',
    children: jsx('canvas', {
      ref: canvasRef,
      className: 'block h-full w-full cursor-crosshair',
      role: 'img',
      'aria-label': 'Animated pixel-art Greek polis showing Hermes agent activity',
      onClick: event => {
        const hit = locate(event)
        if (hit) { haptic('tap'); onSelect(hit.name) }
      },
      onDoubleClick: event => {
        const hit = locate(event)
        if (hit) onOpen(hit.name)
      }
    })
  })
}

function StatusBadge({ status }) {
  const tone = status === 'failed' ? 'bad' : status === 'waiting' ? 'warn' : status === 'offline' ? 'muted' : ['working', 'complete', 'recent'].includes(status) ? 'good' : 'muted'
  return jsxs('span', {
    className: 'inline-flex shrink-0 items-center gap-1.5 text-[0.625rem] text-muted-foreground',
    children: [jsx(StatusDot, { tone }), activityLabel(status)]
  })
}

function ActivityLogRow({ item }) {
  const icon = item.phase === 'failed' ? 'error' : item.phase === 'waiting' ? 'question' : item.phase === 'complete' ? 'check' : 'circle-small-filled'
  return jsxs('div', {
    className: 'group flex items-start gap-2 py-1.5 text-[0.6875rem]',
    children: [
      jsx(Codicon, { name: icon, className: cx('mt-0.5 shrink-0 text-muted-foreground/60', ['failed', 'waiting'].includes(item.phase) && 'text-primary') }),
      jsxs('div', {
        className: 'min-w-0 flex-1',
        children: [
          jsxs('div', { className: 'flex items-baseline justify-between gap-2', children: [jsx('span', { className: 'truncate font-medium text-foreground/85', children: String(item.tool || item.type || 'task').replaceAll('_', ' ') }), jsx('span', { className: 'shrink-0 text-[0.625rem] tabular-nums text-muted-foreground/70', children: relativeTime(item.at) })] }),
          item.context ? jsx('p', { className: 'mt-0.5 line-clamp-2 break-words leading-4 text-muted-foreground', children: item.context }) : jsx('div', { className: 'mt-0.5 text-[0.625rem] text-muted-foreground/70', children: toolCategoryLabel(item.category) })
        ]
      })
    ]
  })
}

function AgentActivityCard({ agent, selected, expanded, onSelect, onToggle }) {
  const history = agent.activityHistory || []
  return jsxs('section', {
    className: cx(
      'mx-2 mb-2 overflow-hidden rounded-md border bg-(--ui-bg-elevated) transition-colors',
      selected ? 'border-primary' : 'border-(--ui-stroke-tertiary)'
    ),
    children: [
      jsxs('button', {
        type: 'button',
        className: cx('flex w-full items-center gap-2 px-2.5 py-2.5 text-left transition-colors hover:bg-(--ui-control-hover-background)', selected && 'bg-(--ui-row-active-background)'),
        'aria-expanded': expanded,
        onClick: () => { onSelect(agent.name); onToggle(agent.name) },
        children: [
          jsx(Codicon, { name: expanded ? 'chevron-down' : 'chevron-right', className: 'shrink-0 text-muted-foreground/70' }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsx('div', { className: cx('truncate text-xs font-medium', selected ? 'text-foreground' : 'text-foreground/80'), children: agent.display_name || (agent.name === 'default' ? 'Hermes' : agent.name) }),
              jsx('div', { className: 'mt-0.5 truncate text-[0.625rem] text-muted-foreground', children: agent.activity ? `${toolCategoryLabel(agent.activity.category)} · ${String(agent.activity.tool || 'task').replaceAll('_', ' ')}` : history.length ? `${history.length} actions in the last hour` : 'No recent actions' })
            ]
          }),
          jsx(StatusBadge, { status: agent.status })
        ]
      }),
      expanded ? jsxs('div', {
        className: 'border-t border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) pb-3 pl-8 pr-3',
        children: [
          agent.activity ? jsxs('div', {
            className: 'py-2',
            children: [
              jsxs('div', { className: 'flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-primary', children: [jsx(Codicon, { name: agent.activity.phase === 'working' ? 'pulse' : 'history' }), agent.activity.phase === 'working' ? 'Live action' : 'Latest action'] }),
              jsx('div', { className: 'mt-1 break-words text-[0.6875rem] font-medium text-foreground/85', children: `${toolCategoryLabel(agent.activity.category)} · ${String(agent.activity.tool || 'task').replaceAll('_', ' ')}` }),
              agent.activity.context ? jsx('p', { className: 'mt-1 line-clamp-3 break-words text-[0.6875rem] leading-4 text-muted-foreground', children: agent.activity.context }) : null
            ]
          }) : null,
          history.length
            ? jsxs('div', { children: [jsx('div', { className: 'mb-0.5 text-[0.625rem] font-medium text-muted-foreground/70', children: 'RECENT' }), history.slice(0, 12).map((item, index) => jsx(ActivityLogRow, { item }, `${agent.name}-${item.at}-${index}`))] })
            : !agent.activity ? jsx('div', { className: 'py-2 text-[0.6875rem] text-muted-foreground', children: 'No recorded actions in the last hour.' }) : null
        ]
      }) : null
    ]
  })
}

function DetailPanel({ profiles, profile, onSelect, onOccupation, onOpen }) {
  const [width, setWidth] = useState(240)
  const widthRef = useRef(width)
  const [expandedAgents, setExpandedAgents] = useState(() => new Set(['default']))
  widthRef.current = width

  useEffect(() => {
    let live = true
    Promise.resolve(pluginContext?.storage?.get('detailPanelWidth'))
      .then(value => {
        if (value == null || value === '') return
        const saved = Number(value)
        if (live && Number.isFinite(saved)) setWidth(clamp(saved, 220, 480))
      })
      .catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!profile?.name) return
    setExpandedAgents(current => {
      if (current.has(profile.name)) return current
      const next = new Set(current)
      next.add(profile.name)
      return next
    })
  }, [profile?.name])

  const persistWidth = useCallback(next => {
    const adjusted = clamp(Math.round(next), 220, Math.min(480, Math.max(220, window.innerWidth * .45)))
    widthRef.current = adjusted
    setWidth(adjusted)
    Promise.resolve(pluginContext?.storage?.set('detailPanelWidth', adjusted)).catch(() => undefined)
  }, [])

  const beginResize = event => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const move = moveEvent => {
      const adjusted = clamp(startWidth + startX - moveEvent.clientX, 220, Math.min(480, Math.max(220, window.innerWidth * .45)))
      widthRef.current = adjusted
      setWidth(adjusted)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      Promise.resolve(pluginContext?.storage?.set('detailPanelWidth', Math.round(widthRef.current))).catch(() => undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
  }

  const toggleAgent = name => setExpandedAgents(current => {
    const next = new Set(current)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  const panelStyle = { width: `${width}px`, background: 'var(--ui-chat-surface-background, var(--ui-bg-chrome))' }
  const resizeHandle = jsx('div', {
    role: 'separator',
    'aria-label': 'Resize agent activity panel',
    'aria-orientation': 'vertical',
    tabIndex: 0,
    title: 'Drag to resize · Double-click to reset',
    onPointerDown: beginResize,
    onDoubleClick: () => persistWidth(240),
    onKeyDown: event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); persistWidth(widthRef.current + 16) }
      if (event.key === 'ArrowRight') { event.preventDefault(); persistWidth(widthRef.current - 16) }
    },
    className: 'absolute inset-y-0 left-0 z-20 w-1 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-primary focus:bg-primary focus:outline-none',
    style: { touchAction: 'none' }
  })

  if (!profile) {
    return jsxs('aside', {
      className: 'relative flex h-full min-h-0 shrink-0 flex-col items-center justify-center border-l border-(--ui-stroke-tertiary) p-5 text-center text-(--ui-text-primary)',
      style: panelStyle,
      children: [resizeHandle, jsx(Codicon, { name: 'organization', className: 'mb-3 text-3xl text-(--ui-text-quaternary)' }), jsx('div', { className: 'text-sm font-medium', children: 'Choose a citizen' })]
    })
  }

  const meta = OCCUPATION_META[profile.occupation]
  const session = profile.canonical_session || profile.last_session
  return jsxs('aside', {
    className: 'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-(--ui-stroke-tertiary) text-(--ui-text-primary)',
    style: panelStyle,
    children: [
      resizeHandle,
      jsxs('div', {
        className: 'shrink-0 px-3 pb-3 pt-3',
        children: [
          jsxs('div', {
            className: 'flex items-start justify-between gap-3',
            children: [
              jsxs('div', { className: 'min-w-0', children: [jsx('div', { className: 'truncate text-sm font-medium text-foreground', children: profile.display_name || (profile.name === 'default' ? 'Hermes' : profile.name) }), jsx('div', { className: 'mt-0.5 truncate text-[0.6875rem] text-muted-foreground', children: `@${profile.name} · ${meta.building}` })] }),
              jsx(StatusBadge, { status: profile.status })
            ]
          }),
          jsxs('div', {
            className: 'mt-3',
            children: [
              jsx('div', { className: 'mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80', children: 'Craft / character' }),
              jsx(Select, {
                value: profile.occupation,
                onValueChange: value => { haptic('tap'); onOccupation(profile.name, value) },
                children: [
                  jsx(SelectTrigger, {
                    size: 'sm',
                    'aria-label': 'Craft or character',
                    className: 'text-(--ui-text-primary)',
                    style: { background: 'var(--ui-bg-elevated)', borderColor: 'var(--ui-stroke-secondary)' },
                    children: jsx(SelectValue, {})
                  }),
                  jsx(SelectContent, {
                    className: 'border-(--ui-stroke-secondary) text-(--ui-text-primary)',
                    style: { background: 'var(--ui-bg-elevated)', color: 'var(--ui-text-primary)', borderColor: 'var(--ui-stroke-secondary)' },
                    children: OCCUPATIONS.map(occupation => jsx(SelectItem, { className: 'focus:bg-(--ui-control-hover-background) focus:text-(--ui-text-primary)', value: occupation, children: OCCUPATION_META[occupation].label }, occupation))
                  })
                ]
              })
            ]
          })
        ]
      }),
      jsxs('div', {
        className: 'flex min-h-0 flex-1 flex-col border-t border-(--ui-stroke-tertiary)',
        children: [
          jsxs('div', {
            className: 'flex shrink-0 items-center justify-between px-3 py-2',
            children: [jsx('div', { className: 'text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80', children: 'Agent actions' }), jsx('div', { className: 'text-[0.625rem] text-muted-foreground/70', children: 'Select to inspect' })]
          }),
          jsx('div', {
            className: 'min-h-0 flex-1 overflow-y-auto',
            children: profiles.map(agent => jsx(AgentActivityCard, { agent, selected: agent.name === profile.name, expanded: expandedAgents.has(agent.name), onSelect, onToggle: toggleAgent }, agent.name))
          })
        ]
      }),
      jsx('div', {
        className: 'shrink-0 border-t border-(--ui-stroke-tertiary) px-3 py-2.5',
        children: jsx(Button, {
          className: 'w-full justify-center',
          disabled: !session,
          onClick: () => onOpen(profile.name),
          size: 'sm',
          variant: 'secondary',
          children: jsxs('span', { className: 'inline-flex items-center gap-2', children: [jsx(Codicon, { name: 'comment-discussion' }), session ? 'Open conversation' : 'No conversation available'] })
        })
      })
    ]
  })
}

async function openProfileSession(profile) {
  const session = profile?.canonical_session || profile?.last_session
  const id = session?.resolved_id || session?.id
  if (!id) {
    host.notify({ kind: 'info', message: `${profile?.display_name || profile?.name || 'This agent'} has no conversation yet.` })
    return
  }
  if (typeof host.openSession !== 'function') {
    host.notify({ kind: 'error', message: 'This Hermes Desktop build cannot open a session from plugins.' })
    return
  }
  try {
    await host.openSession(String(id), { profile: profile.name, intent: 'main', keepAllProfilesScope: false })
  } catch (error) {
    host.notify({ kind: 'error', message: `Could not open the conversation: ${error?.message || error}` })
  }
}

function PolisPage() {
  const roster = useRoster()
  const busyBySession = useValue(host.state.busyBySession)
  const gateway = useValue(host.state.gateway)
  const [occupations, assignOccupation] = useOccupations()
  const [soundEnabled, toggleSound] = useSoundSetting()
  const liveActivities = useLiveActivities(roster.data?.profiles || [], soundEnabled)
  const [selectedName, setSelectedName] = useState('default')
  const profiles = useMemo(() => (roster.data?.profiles || []).map(profile => {
    const activityState = liveActivities[profile.name]
    const activity = strongestActivity(activityState)
    const liveStatus = activity?.phase
    return {
      ...profile,
      occupation: occupations[profile.name] || OCCUPATIONS[Math.abs([...profile.name].reduce((a, c) => a + c.charCodeAt(0), 0)) % OCCUPATIONS.length],
      status: ['working', 'waiting', 'failed', 'complete'].includes(liveStatus) ? liveStatus : profileActivity(profile, busyBySession, gateway),
      activity,
      activityHistory: activityState?.history || [],
      activeSessionCount: Object.keys(activityState?.sessions || {}).length
    }
  }), [roster.data, occupations, busyBySession, gateway, liveActivities])
  const selected = profiles.find(profile => profile.name === selectedName) || profiles[0] || null
  const openByName = useCallback(name => {
    const profile = profiles.find(item => item.name === name)
    if (profile) { haptic('tap'); void openProfileSession(profile) }
  }, [profiles])
  const counts = profiles.reduce((out, profile) => { out[profile.status] = (out[profile.status] || 0) + 1; return out }, {})

  if (roster.isLoading) {
    return jsxs('div', { className: 'flex h-full items-center justify-center gap-2 text-sm text-(--ui-text-tertiary)', children: [jsx(Codicon, { name: 'loading', className: 'animate-spin' }), 'Building the polis…'] })
  }
  if (roster.error) {
    return jsxs('div', {
      className: 'flex h-full flex-col items-center justify-center p-6 text-center',
      children: [jsx(Codicon, { name: 'warning', className: 'mb-3 text-3xl text-(--ui-accent)' }), jsx('div', { className: 'font-medium', children: 'The city gates are closed' }), jsx('p', { className: 'mt-1 max-w-md text-xs text-(--ui-text-tertiary)', children: roster.error.message }), jsx(Button, { className: 'mt-4', onClick: () => roster.refetch(), children: 'Try again' })]
    })
  }

  return jsxs('div', {
    className: 'flex h-full min-h-0 flex-col overflow-hidden bg-(--ui-bg-primary) text-(--ui-text-primary)',
    children: [
      jsxs('header', {
        className: 'flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2',
        children: [
          jsxs('div', { className: 'flex items-center gap-3', children: [jsx('div', { className: 'grid h-7 w-7 place-items-center rounded border border-(--ui-accent) text-(--ui-accent)', children: 'Ω' }), jsxs('div', { children: [jsx('div', { className: 'text-sm font-semibold', children: 'The Polis of Hermes' }), jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary)', children: 'A living city of your agent profiles' })] })] }),
          jsxs('div', { className: 'flex items-center gap-2 text-[0.6875rem]', children: [jsx('span', { className: 'rounded-full border border-(--ui-stroke-secondary) px-2 py-1', children: `${profiles.length} citizens` }), jsx('span', { className: 'rounded-full border border-(--ui-accent) px-2 py-1 text-(--ui-accent)', children: `${counts.working || 0} working` }), (counts.waiting || counts.failed) ? jsx('span', { className: 'rounded-full border border-(--ui-accent) px-2 py-1 text-(--ui-accent)', children: `${(counts.waiting || 0) + (counts.failed || 0)} need attention` }) : null, jsx('span', { className: 'rounded-full border border-(--ui-stroke-secondary) px-2 py-1 text-(--ui-text-tertiary)', children: `${counts.idle || 0} resting` }), jsx('button', { type: 'button', title: soundEnabled ? 'Mute polis sounds' : 'Enable polis sounds', onClick: toggleSound, className: cx('grid h-7 w-7 place-items-center rounded border', soundEnabled ? 'border-(--ui-accent) text-(--ui-accent)' : 'border-(--ui-stroke-secondary)'), children: jsx(Codicon, { name: soundEnabled ? 'unmute' : 'mute' }) }), jsx('button', { type: 'button', title: 'Refresh roster', onClick: () => roster.refetch(), className: 'grid h-7 w-7 place-items-center rounded border border-(--ui-stroke-secondary) hover:border-(--ui-accent)', children: jsx(Codicon, { name: roster.isFetching ? 'loading' : 'refresh', className: roster.isFetching ? 'animate-spin' : '' }) })] })
        ]
      }),
      jsxs('main', {
        className: 'm-3 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-(--ui-stroke-secondary)',
        children: [jsx(PolisCanvas, { profiles, selectedName: selected?.name, onSelect: setSelectedName, onOpen: openByName }), jsx(DetailPanel, { profiles, profile: selected, onSelect: setSelectedName, onOccupation: assignOccupation, onOpen: openByName })]
      })
    ]
  })
}

function PolisStatus() {
  const busy = useValue(host.state.busyBySession)
  const count = Object.values(busy || {}).filter(Boolean).length
  return jsx('button', {
    type: 'button',
    onClick: () => { haptic('tap'); host.navigate(ROUTE) },
    className: 'inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:text-foreground',
    title: 'Open the Polis of Hermes',
    children: jsxs('span', { className: 'inline-flex items-center gap-1.5', children: [jsx('span', { className: count ? 'text-(--ui-accent)' : '', children: 'Ω' }), count ? `${count} at work` : 'Polis' ] })
  })
}

export default {
  id: ID,
  name: 'The Polis of Hermes',
  register(ctx) {
    pluginContext = ctx
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(PolisPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: ROUTE, label: 'Polis', codicon: 'organization' } },
      { id: 'status', area: STATUSBAR_AREAS.right, order: 112, render: () => jsx(PolisStatus, {}) },
      { id: 'open', area: PALETTE_AREA, data: { id: 'polis.open', label: 'Open the Polis of Hermes', keywords: ['agents', 'bots', 'status', 'pixel', 'greek'], run: () => host.navigate(ROUTE) } }
    ])
  }
}
