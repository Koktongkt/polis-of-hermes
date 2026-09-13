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

// Approved production LPC community runtime.
const CANONICAL_CITIZEN_ANCHORS = [
  { name: 'default', x: 414, y: 190, home: 'agora-dais', route: ['agora-dais', 'agora-pause', 'agora-view', 'agora-pause'] },
  { name: 'aivory', x: 272, y: 508, home: 'mouseion-steps', route: ['mouseion-steps', 'mouseion-path', 'lower-crossing', 'mouseion-path'] },
  { name: 'cody', x: 784, y: 300, home: 'forge-yard', route: ['forge-yard', 'forge-turn', 'forge-overlook', 'forge-turn'] },
  { name: 'alpha_sage', x: 330, y: 758, home: 'stoa-ledger', route: ['stoa-ledger', 'stoa-turn', 'bazaar-rest', 'stoa-turn'] }
]
const CANONICAL_NAV_NODES = [
  { id: 'agora-dais', x: 414, y: 190, kind: 'workplace', facing: 'south', links: ['agora-pause'] },
  { id: 'agora-pause', x: 430, y: 185, kind: 'road', facing: 'east', links: ['agora-dais', 'agora-view'] },
  { id: 'agora-view', x: 446, y: 195, kind: 'viewpoint', facing: 'south', links: ['agora-pause'] },
  { id: 'mouseion-steps', x: 272, y: 508, kind: 'doorway', facing: 'north', links: ['mouseion-path'] },
  { id: 'mouseion-path', x: 302, y: 548, kind: 'road', facing: 'south', links: ['mouseion-steps', 'lower-crossing'] },
  { id: 'lower-crossing', x: 338, y: 590, kind: 'crossroads', facing: 'south', links: ['mouseion-path'] },
  { id: 'forge-yard', x: 784, y: 300, kind: 'workplace', facing: 'south', links: ['forge-turn'] },
  { id: 'forge-turn', x: 820, y: 270, kind: 'road', facing: 'east', links: ['forge-yard', 'forge-overlook'] },
  { id: 'forge-overlook', x: 860, y: 292, kind: 'viewpoint', facing: 'south', links: ['forge-turn'] },
  { id: 'stoa-ledger', x: 330, y: 758, kind: 'market-station', facing: 'north', links: ['stoa-turn'] },
  { id: 'stoa-turn', x: 358, y: 735, kind: 'plaza', facing: 'north', links: ['stoa-ledger', 'bazaar-rest'] },
  { id: 'bazaar-rest', x: 404, y: 710, kind: 'market', facing: 'east', links: ['stoa-turn'] }
]
const CITIZEN_CLEARANCE = { footRadius: 12 }
const CANONICAL_WORLD_GEOMETRY = {
  walkable: [
    { id: 'agora-pocket', x: 395, y: 165, w: 70, h: 45, kind: 'road' },
    { id: 'mouseion-lane', x: 250, y: 480, w: 115, h: 135, kind: 'road' },
    { id: 'forge-yard', x: 750, y: 245, w: 135, h: 70, kind: 'road' },
    { id: 'stoa-plaza', x: 300, y: 690, w: 130, h: 80, kind: 'plaza' }
  ],
  obstacles: [
    { id: 'west-house', x: 130, y: 80, w: 235, h: 295, kind: 'building' },
    { id: 'west-barrel-crates', x: 352, y: 200, w: 75, h: 205, kind: 'ornament', sideClearance: 52 },
    { id: 'north-crates', x: 525, y: 85, w: 290, h: 170, kind: 'ornament' },
    { id: 'east-house', x: 580, y: 315, w: 290, h: 345, kind: 'building' },
    { id: 'west-produce-stall', x: 75, y: 500, w: 175, h: 170, kind: 'ornament', sideClearance: 18 },
    { id: 'central-produce', x: 470, y: 400, w: 115, h: 145, kind: 'ornament', sideClearance: 36 },
    { id: 'central-pottery', x: 480, y: 525, w: 150, h: 155, kind: 'monument', sideClearance: 36 },
    { id: 'east-barrels', x: 865, y: 475, w: 115, h: 155, kind: 'ornament', sideClearance: 28 }
  ],
  occluders: [
    { id: 'west-house-roof', x: 130, y: 80, w: 235, h: 130, kind: 'awning' },
    { id: 'east-house-roof', x: 580, y: 315, w: 290, h: 180, kind: 'awning' },
    { id: 'northwest-tree-canopy', x: 0, y: 0, w: 130, h: 460, kind: 'canopy' },
    { id: 'northeast-tree-canopy', x: 900, y: 0, w: 101, h: 470, kind: 'canopy' }
  ]
}
const CURRENT_CITIZENS = {
  default: { key: 'lpcHermes', label: 'Hermes' },
  aivory: { key: 'lpcAivory', label: 'Aivory' },
  cody: { key: 'lpcCody', label: 'Cody' },
  alpha_sage: { key: 'lpcAlphaSage', label: 'Alpha Sage' }
}
const LPC_DIRECTION_ROWS = { north: 0, west: 1, south: 2, east: 3 }
const LPC_ACTIONS = {
  idle: { row: 0, frames: [0, 0, 1], frameMs: 700 },
  walk: { row: 4, frames: [1, 2, 3, 4, 5, 6, 7, 8], frameMs: 95 },
  spellcast: { row: 8, frames: [0, 1, 2, 3, 4, 5, 6], frameMs: 120 },
  emote: { row: 12, frames: [0, 0, 0, 1, 1, 2, 2], frameMs: 260 },
  jump: { row: 16, frames: [0, 1, 2, 3, 4, 1], frameMs: 130 },
  sit: { row: 20, frames: [0, 0, 1, 1, 2, 2], frameMs: 420 },
  hurt: { row: 24, frames: [0, 1, 2, 3, 4, 5], frameMs: 180, directional: false }
}

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
      canonicalCommunity: 'lpc-builder/sources/polis-bright-bazaar-combined.png',
      lpcHermes: 'lpc-hermes-example/hermes-lpc-polis-atlas.png',
      lpcAivory: 'lpc-review-batch/aivory/aivory-polis-atlas.png',
      lpcCody: 'lpc-review-batch/cody/cody-polis-atlas.png',
      lpcAlphaSage: 'lpc-review-batch/alpha-sage/alpha-sage-polis-atlas.png'
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

function buildCanonicalSceneEntries(profiles) {
  return CANONICAL_CITIZEN_ANCHORS.map(anchor => {
    const profile = profiles.find(item => item.name === anchor.name)
    return profile ? { profile, anchor, scale: 2 } : null
  }).filter(Boolean)
}

function profileSeed(name) {
  return [...String(name || '')].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 2166136261)
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function worldPointAllowed(x, y) {
  const point = { x, y, w: 0, h: 0 }
  const onSafeGround = CANONICAL_WORLD_GEOMETRY.walkable.some(area => (
    x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h
  ))
  const foot = {
    x: x - CITIZEN_CLEARANCE.footRadius,
    y: y - CITIZEN_CLEARANCE.footRadius / 2,
    w: CITIZEN_CLEARANCE.footRadius * 2,
    h: CITIZEN_CLEARANCE.footRadius
  }
  const hitsObstacle = CANONICAL_WORLD_GEOMETRY.obstacles.some(area => rectsOverlap(foot, area))
  const lacksSideClearance = CANONICAL_WORLD_GEOMETRY.obstacles.some(area => (
    area.sideClearance
    && point.y >= area.y
    && point.y <= area.y + area.h
    && point.x >= area.x - area.sideClearance
    && point.x <= area.x + area.w + area.sideClearance
  ))
  return onSafeGround && !hitsObstacle && !lacksSideClearance
}

function citizenMotionAt(profile, anchor, time) {
  const home = CANONICAL_NAV_NODES.find(node => node.id === anchor.home) || { ...anchor, id: anchor.home, kind: 'station' }
  if (!['idle', 'recent'].includes(profile.status)) return { ...home, mode: 'stationed', station: home, facing: home.facing || 'south' }
  const route = anchor.route.map(id => CANONICAL_NAV_NODES.find(node => node.id === id)).filter(Boolean)
  if (route.length < 2) return { ...home, mode: 'stationed', station: home, facing: home.facing || 'south' }
  const seed = profileSeed(profile.name)
  const dwellMs = 20_000 + (seed % 14_000)
  const travelMs = 5_000 + (seed % 2_500)
  const cycleMs = dwellMs + travelMs
  const clock = Math.max(0, Number(time) || 0) + (seed % cycleMs)
  const leg = Math.floor(clock / cycleMs) % route.length
  const elapsed = clock % cycleMs
  const from = route[leg]
  const to = route[(leg + 1) % route.length]
  if (elapsed < dwellMs) return { ...from, mode: 'stationed', station: from, facing: from.facing || 'south' }
  const rawProgress = (elapsed - dwellMs) / travelMs
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const x = from.x + dx * progress
  const y = from.y + dy * progress
  if (!worldPointAllowed(x, y)) return { ...home, mode: 'stationed', station: home, facing: home.facing || 'south' }
  return {
    x,
    y,
    mode: 'roaming',
    from,
    to,
    progress,
    facing: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south')
  }
}

function citizenAnimationAt(profile, motion, time) {
  const seed = profileSeed(profile.name)
  let action = 'idle'
  if (motion.mode === 'roaming') action = 'walk'
  else if (profile.status === 'working') action = 'spellcast'
  else if (profile.status === 'waiting') action = 'emote'
  else if (profile.status === 'failed') action = 'hurt'
  else if (profile.status === 'complete') action = 'jump'
  else if (['idle', 'recent'].includes(profile.status) && Math.floor((Math.max(0, Number(time) || 0) + seed) / 8_000) % 5 === 4) action = 'emote'

  const config = LPC_ACTIONS[action]
  const direction = LPC_DIRECTION_ROWS[motion.facing] ?? LPC_DIRECTION_ROWS.south
  const row = config.row + (config.directional === false ? 0 : direction)
  const step = Math.floor((Math.max(0, Number(time) || 0) + (seed % 997)) / config.frameMs)
  return { action, row, frame: config.frames[step % config.frames.length] }
}

function drawWorldGeometryOverlay(g) {
  g.save()
  g.lineWidth = 3
  const drawAreas = (areas, fill, stroke) => {
    g.fillStyle = fill
    g.strokeStyle = stroke
    for (const area of areas) {
      g.fillRect(area.x, area.y, area.w, area.h)
      g.strokeRect(area.x, area.y, area.w, area.h)
    }
  }
  drawAreas(CANONICAL_WORLD_GEOMETRY.walkable, 'rgba(62, 211, 112, .18)', 'rgba(62, 211, 112, .9)')
  drawAreas(CANONICAL_WORLD_GEOMETRY.obstacles, 'rgba(244, 76, 76, .28)', 'rgba(255, 92, 92, .95)')
  drawAreas(CANONICAL_WORLD_GEOMETRY.occluders, 'rgba(173, 92, 255, .2)', 'rgba(190, 112, 255, .95)')
  g.strokeStyle = 'rgba(74, 172, 255, .95)'
  g.fillStyle = 'rgba(255, 211, 77, .95)'
  for (const node of CANONICAL_NAV_NODES) {
    for (const link of node.links) {
      const target = CANONICAL_NAV_NODES.find(item => item.id === link)
      if (!target) continue
      g.beginPath()
      g.moveTo(node.x, node.y)
      g.lineTo(target.x, target.y)
      g.stroke()
    }
    g.beginPath()
    g.arc(node.x, node.y, 8, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}


function drawCanonicalCommunity(ctx, canvas, profiles, selectedName, p, t, hitMap, characterHitMap, art, showGeometry = false) {
  const worldW = 1001
  const worldH = 1765
  const buffer = canvas.__canonicalPolisBuffer || (canvas.__canonicalPolisBuffer = document.createElement('canvas'))
  if (buffer.width !== worldW) buffer.width = worldW
  if (buffer.height !== worldH) buffer.height = worldH
  const g = buffer.getContext('2d')
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, worldW, worldH)
  g.drawImage(art.canonicalCommunity, 0, 0, worldW, worldH)
  if (showGeometry) drawWorldGeometryOverlay(g)

  const entries = buildCanonicalSceneEntries(profiles)
    .map(entry => ({ ...entry, motion: citizenMotionAt(entry.profile, entry.anchor, t) }))
    .sort((a, b) => a.motion.y - b.motion.y)
  for (const { profile, motion, scale } of entries) {
    const lpc = CURRENT_CITIZENS[profile.name]
    const image = lpc ? art[lpc.key] : null
    if (!image) continue
    const animation = citizenAnimationAt(profile, motion, t)
    const size = 64 * scale
    const x = motion.x - size / 2
    const y = motion.y - size

    g.save()
    g.globalAlpha = profile.status === 'offline' ? .55 : 1
    g.fillStyle = 'rgba(22, 26, 38, .28)'
    g.beginPath()
    g.ellipse(motion.x, motion.y - 2, 25, 7, 0, 0, Math.PI * 2)
    g.fill()
    if (profile.name === selectedName) {
      g.shadowColor = p.active
      g.shadowBlur = 18
    }
    g.imageSmoothingEnabled = false
    g.drawImage(image, animation.frame * 64, animation.row * 64, 64, 64, x, y, size, size)
    g.restore()
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cover = Math.max(canvas.width / worldW, canvas.height / worldH)
  const coverW = Math.round(worldW * cover)
  const coverH = Math.round(worldH * cover)
  const coverX = Math.floor((canvas.width - coverW) / 2)
  const coverY = Math.floor((canvas.height - coverH) / 2)
  ctx.save()
  ctx.globalAlpha = .5
  ctx.filter = 'blur(18px) brightness(.55)'
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, coverX, coverY, coverW, coverH)
  ctx.restore()

  const fit = Math.min(canvas.width / worldW, canvas.height / worldH)
  const dw = Math.round(worldW * fit)
  const dh = Math.round(worldH * fit)
  const ox = Math.floor((canvas.width - dw) / 2)
  const oy = Math.floor((canvas.height - dh) / 2)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(ox, oy, dw, dh, 8)
  ctx.clip()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, ox, oy, dw, dh)
  ctx.restore()

  const hits = entries.map(({ profile, motion }) => ({
    name: profile.name,
    x: ox + (motion.x - 64) * fit,
    y: oy + (motion.y - 128) * fit,
    w: 128 * fit,
    h: 128 * fit
  })).reverse()
  hitMap.current = hits
  characterHitMap.current = hits
}

function drawCanonicalError(ctx, canvas, p, message) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = p.groundDark
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = p.marble
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('The Polis artwork could not be loaded', canvas.width / 2, canvas.height / 2 - 10)
  ctx.fillStyle = p.gold
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(String(message || 'Check the current Polis assets and reload the plugin.'), canvas.width / 2, canvas.height / 2 + 16)
}

function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  }
}

function hitTest(point, map) {
  return map.find(hit => point.x >= hit.x && point.x <= hit.x + hit.w && point.y >= hit.y && point.y <= hit.y + hit.h)
}

function PolisCanvas({ profiles, selectedName, showGeometry, onSelect, onOpen, onNewSession, onDirectMessage }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const hitMap = useRef([])
  const characterHitMap = useRef([])
  const [contextMenu, setContextMenu] = useState(null)
  const stateRef = useRef({ profiles, selectedName, showGeometry })
  stateRef.current = { profiles, selectedName, showGeometry }

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
        if (polisArtCache?.canonicalCommunity) {
          try {
            drawCanonicalCommunity(ctx, canvas, stateRef.current.profiles, stateRef.current.selectedName, palette, time, hitMap, characterHitMap, polisArtCache, stateRef.current.showGeometry)
          } catch (error) {
            polisArtError = `render: ${error instanceof Error ? error.message : String(error)}`
            hitMap.current = []
            characterHitMap.current = []
            drawCanonicalError(ctx, canvas, palette, polisArtError)
          }
        } else {
          hitMap.current = []
          characterHitMap.current = []
          drawCanonicalError(ctx, canvas, palette, polisArtError)
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

  useEffect(() => {
    const dismiss = () => setContextMenu(null)
    const onKey = event => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('blur', dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const locateInMap = (event, mapRef) => {
    const canvas = canvasRef.current
    return hitTest(canvasPoint(event, canvas), mapRef.current)
  }

  const locate = event => locateInMap(event, hitMap)
  const locateCharacter = event => locateInMap(event, characterHitMap)

  const submitDirectMessage = async () => {
    const menu = contextMenu
    const message = String(menu?.draft || '').trim()
    if (!menu?.name || !message || menu.sending) return
    setContextMenu({ ...menu, sending: true })
    try {
      await onDirectMessage(menu.name, message, Boolean(menu.newChat))
      setContextMenu(null)
    } catch {
      setContextMenu(current => current?.name === menu.name ? { ...current, sending: false } : current)
    }
  }

  return jsx('div', {
    ref: wrapRef,
    className: 'relative min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-l-xl',
    // Suppress the app-shell fallback menu across the canvas. Polis only
    // offers character actions after the hit test below succeeds.
    'data-context-menu-skip': 'true',
    children: [
      jsx('canvas', {
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
        },
        onContextMenu: event => {
          event.preventDefault()
          event.stopPropagation()
          const hit = locateCharacter(event)
          if (!hit) {
            setContextMenu(null)
            return
          }
          const rect = wrapRef.current.getBoundingClientRect()
          setContextMenu({
            name: hit.name,
            x: clamp(event.clientX - rect.left, 8, Math.max(8, rect.width - 296)),
            y: clamp(event.clientY - rect.top, 8, Math.max(8, rect.height - 220)),
            draft: '',
            composing: false,
            newChat: false,
            sending: false
          })
        }
      }),
      contextMenu ? jsxs('div', {
        role: 'menu',
        'aria-label': `${contextMenu.name} actions`,
        className: 'absolute z-40 w-72 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-1 text-(--ui-text-primary) shadow-xl',
        style: { left: contextMenu.x, top: contextMenu.y },
        onPointerDown: event => event.stopPropagation(),
        onContextMenu: event => { event.preventDefault(); event.stopPropagation() },
        children: contextMenu.composing ? [
          jsxs('div', {
            className: 'flex items-center justify-between gap-2 px-2 py-1.5',
            children: [
              jsx('span', { className: 'truncate text-xs font-medium', children: contextMenu.newChat ? `New chat with @${contextMenu.name}` : `Message @${contextMenu.name}` }),
              jsx('button', { type: 'button', title: 'Back', className: 'grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-(--ui-control-hover-background)', onClick: () => setContextMenu(current => ({ ...current, composing: false, sending: false })), children: jsx(Codicon, { name: 'close' }) })
            ]
          }),
          jsx('textarea', {
            autoFocus: true,
            rows: 4,
            value: contextMenu.draft,
            disabled: contextMenu.sending,
            placeholder: `Send a message to @${contextMenu.name} without leaving the Polis…`,
            'aria-label': `Message ${contextMenu.name}`,
            className: 'min-h-20 w-full resize-none rounded border border-(--ui-stroke-secondary) bg-(--ui-control-background) px-2.5 py-2 text-xs text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)',
            onChange: event => setContextMenu(current => ({ ...current, draft: event.target.value })),
            onKeyDown: event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void submitDirectMessage()
              }
            }
          }),
          jsxs('div', {
            className: 'flex items-center justify-between gap-2 px-1 pb-1 pt-2',
            children: [
              jsx('span', { className: 'text-[0.625rem] text-(--ui-text-quaternary)', children: 'Ctrl+Enter to send' }),
              jsx(Button, { size: 'sm', disabled: contextMenu.sending || !String(contextMenu.draft || '').trim(), onClick: () => void submitDirectMessage(), children: contextMenu.sending ? 'Sending…' : 'Send' })
            ]
          })
        ] : [
          jsxs('button', {
            type: 'button',
            role: 'menuitem',
            className: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)',
            onClick: () => { const name = contextMenu.name; setContextMenu(null); haptic('tap'); onSelect(name) },
            children: [jsx(Codicon, { name: 'account' }), 'Details']
          }),
          jsxs('button', {
            type: 'button',
            role: 'menuitem',
            className: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)',
            onClick: () => { haptic('tap'); setContextMenu(current => ({ ...current, composing: true, newChat: false })) },
            children: [jsx(Codicon, { name: 'send' }), 'Direct message']
          }),
          jsxs('button', {
            type: 'button',
            role: 'menuitem',
            className: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)',
            onClick: () => { haptic('tap'); setContextMenu(current => ({ ...current, composing: true, newChat: true })) },
            children: [jsx(Codicon, { name: 'comment-add' }), 'Direct message as new chat']
          }),
          jsxs('button', {
            type: 'button',
            role: 'menuitem',
            className: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)',
            onClick: () => { const name = contextMenu.name; setContextMenu(null); haptic('tap'); onNewSession(name) },
            children: [jsx(Codicon, { name: 'add' }), 'New session']
          })
        ]
      }) : null
    ]
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

async function sendProfileMessage(profile, message, newChat = false) {
  const text = String(message || '').trim()
  if (!profile?.name || !text) return
  if (typeof host.requestProfile !== 'function') {
    throw new Error('This Hermes Desktop build cannot send profile messages from plugins.')
  }

  let release = () => undefined
  try {
    let route = profile.name
    if (typeof host.profileRoutes === 'function') {
      const routes = await host.profileRoutes()
      const activeConnectionId = String(host.state.connectionId?.get?.() || '').trim()
      const candidates = (Array.isArray(routes) ? routes : []).filter(item => item?.profile === profile.name)
      route = candidates.find(item => activeConnectionId && item.connectionId === activeConnectionId)
        || (candidates.length === 1 ? candidates[0] : profile.name)
    }

    if (typeof host.retainProfile === 'function') {
      const retained = await host.retainProfile(route)
      release = typeof retained === 'function' ? retained : () => undefined
    }

    const targetProfile = typeof route === 'string' ? profile.name : route.targetProfile
    const request = (method, params) => host.requestProfile(route, method, params)
    // A profile rail switch and its Sessions list intentionally exclude the
    // hidden Bot Chat. Sending there succeeds but makes the message appear to
    // vanish when the user later visits that profile. Resolve the newest
    // visible conversation through the target backend instead of trusting the
    // roster's canonical/last-session preview; create one when none exists.
    const listed = newChat ? null : await request('session.list', {
      profile: targetProfile,
      limit: 1,
      include_hidden: false
    })
    const session = Array.isArray(listed?.sessions) ? listed.sessions[0] : null
    const storedId = session?.resolved_id || session?.id
    const opened = storedId
      ? await request('session.resume', {
          profile: targetProfile,
          session_id: String(storedId),
          omit_messages: true,
          source: 'desktop'
        })
      : await request('session.create', {
          profile: targetProfile,
          source: 'desktop'
        })
    const runtimeId = opened?.session_id
    if (!runtimeId) throw new Error('The profile did not return a live session.')
    await request('prompt.submit', {
      session_id: String(runtimeId),
      text,
      queued: true
    })
    host.notify({ kind: 'success', message: newChat ? `New chat started with @${profile.name}.` : `Message sent to @${profile.name}.` })
  } catch (error) {
    host.notify({ kind: 'error', message: `Could not message @${profile.name}: ${error?.message || error}` })
    throw error
  } finally {
    release()
  }
}

function PolisPage() {
  const roster = useRoster()
  const busyBySession = useValue(host.state.busyBySession)
  const gateway = useValue(host.state.gateway)
  const [occupations, assignOccupation] = useOccupations()
  const [soundEnabled, toggleSound] = useSoundSetting()
  const [showGeometry, setShowGeometry] = useState(false)
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
  const newSessionByName = useCallback(name => {
    if (typeof host.newChat !== 'function') {
      host.notify({ kind: 'error', message: 'This Hermes Desktop build cannot open a profile session.' })
      return
    }
    Promise.resolve(host.newChat(name)).catch(error => {
      host.notify({ kind: 'error', message: `Could not start a new session: ${error?.message || error}` })
    })
  }, [])
  const directMessageByName = useCallback((name, message, newChat = false) => {
    const profile = profiles.find(item => item.name === name)
    if (!profile) return Promise.reject(new Error(`Profile ${name} is no longer available.`))
    return sendProfileMessage(profile, message, newChat)
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
          jsxs('div', { className: 'flex items-center gap-2 text-[0.6875rem]', children: [jsx('span', { className: 'rounded-full border border-(--ui-stroke-secondary) px-2 py-1', children: `${profiles.length} citizens` }), jsx('span', { className: 'rounded-full border border-(--ui-accent) px-2 py-1 text-(--ui-accent)', children: `${counts.working || 0} working` }), (counts.waiting || counts.failed) ? jsx('span', { className: 'rounded-full border border-(--ui-accent) px-2 py-1 text-(--ui-accent)', children: `${(counts.waiting || 0) + (counts.failed || 0)} need attention` }) : null, jsx('span', { className: 'rounded-full border border-(--ui-stroke-secondary) px-2 py-1 text-(--ui-text-tertiary)', children: `${counts.idle || 0} resting` }), jsx('button', { type: 'button', title: 'World geometry: green walkable, red blocked, purple occlusion, blue routes', onClick: () => setShowGeometry(value => !value), className: cx('inline-flex h-7 items-center gap-1 rounded border px-2', showGeometry ? 'border-(--ui-accent) text-(--ui-accent)' : 'border-(--ui-stroke-secondary) text-(--ui-text-tertiary)'), children: [jsx(Codicon, { name: 'map' }), 'World geometry'] }), jsx('button', { type: 'button', title: soundEnabled ? 'Mute polis sounds' : 'Enable polis sounds', onClick: toggleSound, className: cx('grid h-7 w-7 place-items-center rounded border', soundEnabled ? 'border-(--ui-accent) text-(--ui-accent)' : 'border-(--ui-stroke-secondary)'), children: jsx(Codicon, { name: soundEnabled ? 'unmute' : 'mute' }) }), jsx('button', { type: 'button', title: 'Refresh roster', onClick: () => roster.refetch(), className: 'grid h-7 w-7 place-items-center rounded border border-(--ui-stroke-secondary) hover:border-(--ui-accent)', children: jsx(Codicon, { name: roster.isFetching ? 'loading' : 'refresh', className: roster.isFetching ? 'animate-spin' : '' }) })] })
        ]
      }),
      jsxs('main', {
        className: 'm-3 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-(--ui-stroke-secondary)',
        children: [jsx(PolisCanvas, { profiles, selectedName: selected?.name, showGeometry, onSelect: setSelectedName, onOpen: openByName, onNewSession: newSessionByName, onDirectMessage: directMessageByName }), jsx(DetailPanel, { profiles, profile: selected, onSelect: setSelectedName, onOccupation: assignOccupation, onOpen: openByName })]
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
