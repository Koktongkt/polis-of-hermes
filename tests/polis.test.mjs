import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function declaration(name) {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`))
  if (start < 0) throw new Error(`Missing production function: ${name}`)
  const brace = source.indexOf('{', start)
  let depth = 0
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`Unterminated production function: ${name}`)
}

function constant(name) {
  const start = source.search(new RegExp(`const\\s+${name}\\s*=`))
  if (start < 0) throw new Error(`Missing production constant: ${name}`)
  const open = source.slice(start).search(/[\[{]/) + start
  const pairs = { '[': ']', '{': '}' }
  const stack = []
  for (let index = open; index < source.length; index += 1) {
    if (pairs[source[index]]) stack.push(pairs[source[index]])
    else if (source[index] === stack.at(-1)) stack.pop()
    if (!stack.length) return source.slice(start, index + 1)
  }
  throw new Error(`Unterminated production constant: ${name}`)
}

function load(names, constants = []) {
  const context = vm.createContext({ Math })
  const code = [
    ...constants.map(constant),
    ...names.map(declaration),
    `globalThis.loaded = { ${names.join(', ')} }`
  ].join('\n')
  vm.runInContext(code, context)
  return context.loaded
}


test('pointer mapping respects CSS-to-backing-store scaling', () => {
  const { canvasPoint } = load(['canvasPoint'])
  const canvas = {
    width: 960,
    height: 540,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 480, height: 270 })
  }
  assert.deepEqual({ ...canvasPoint({ clientX: 340, clientY: 185 }, canvas) }, { x: 480, y: 270 })
})

test('hit testing chooses the first topmost matching character and rejects blank space', () => {
  const { hitTest } = load(['hitTest'])
  const map = [
    { name: 'top', x: 10, y: 10, w: 20, h: 20 },
    { name: 'under', x: 10, y: 10, w: 20, h: 20 }
  ]
  assert.equal(hitTest({ x: 15, y: 15 }, map)?.name, 'top')
  assert.equal(hitTest({ x: 100, y: 100 }, map), undefined)
})

test('canonical community assigns detached citizens to approved native-image foot anchors', () => {
  const { buildCanonicalSceneEntries } = load(
    ['buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS']
  )
  const profiles = ['default', 'aivory', 'cody', 'alpha_sage', 'ignored'].map(name => ({ name }))
  const entries = buildCanonicalSceneEntries(profiles)

  assert.deepEqual(
    JSON.parse(JSON.stringify(entries.map(entry => [entry.profile.name, entry.anchor.x, entry.anchor.y]))),
    [
      ['default', 414, 190],
      ['aivory', 272, 508],
      ['cody', 784, 300],
      ['alpha_sage', 330, 758]
    ]
  )
  assert.equal(entries.every(entry => entry.scale === 2), true)
})

test('ambient citizens alternate between meaningful stations and safe authored travel edges', () => {
  const { citizenMotionAt, buildCanonicalSceneEntries, profileSeed } = load(
    ['profileSeed', 'rectsOverlap', 'worldPointAllowed', 'citizenMotionAt', 'buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS', 'CANONICAL_NAV_NODES', 'CITIZEN_CLEARANCE', 'CANONICAL_WORLD_GEOMETRY']
  )
  const [entry] = buildCanonicalSceneEntries([{ name: 'default', status: 'idle' }])
  const samples = Array.from({ length: 241 }, (_, index) => citizenMotionAt(entry.profile, entry.anchor, index * 500))
  const stationed = samples.find(sample => sample.mode === 'stationed')
  const roaming = samples.find(sample => sample.mode === 'roaming')

  assert.ok(stationed, 'citizen should spend time stationed in the environment')
  assert.ok(roaming, 'citizen should occasionally roam')
  assert.ok(stationed.station?.kind, 'stations should describe the environment object or place')
  assert.ok(roaming.from?.links.includes(roaming.to.id), 'roaming must follow an authored safe edge')
  assert.ok(roaming.progress > 0 && roaming.progress < 1)
  assert.equal(Number.isInteger(profileSeed('default')), true)
})

test('every idle citizen reaches the lower bazaar without teleporting', () => {
  const { citizenMotionAt, buildCanonicalSceneEntries } = load(
    ['profileSeed', 'rectsOverlap', 'worldPointAllowed', 'citizenMotionAt', 'buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS', 'CANONICAL_NAV_NODES', 'CITIZEN_CLEARANCE', 'CANONICAL_WORLD_GEOMETRY']
  )
  const entries = buildCanonicalSceneEntries(
    ['default', 'aivory', 'cody', 'alpha_sage'].map(name => ({ name, status: 'idle' }))
  )

  for (const entry of entries) {
    const samples = Array.from({ length: 721 }, (_, index) => citizenMotionAt(entry.profile, entry.anchor, index * 1_000))
    assert.ok(samples.some(sample => sample.y > 1200), `${entry.profile.name} should traverse the lower bazaar`)
    assert.equal(samples.every(sample => sample.x !== undefined && sample.y !== undefined), true)
  }
})

test('roaming citizens use true directional walk rows instead of facing forward', () => {
  const { citizenAnimationAt } = load(
    ['profileSeed', 'citizenAnimationAt'],
    ['LPC_DIRECTION_ROWS', 'LPC_ACTIONS']
  )
  const expectedRows = { north: 4, west: 5, south: 6, east: 7 }

  for (const [facing, row] of Object.entries(expectedRows)) {
    const animation = citizenAnimationAt(
      { name: 'default', status: 'idle' },
      { mode: 'roaming', facing },
      1_250
    )
    assert.equal(animation.action, 'walk')
    assert.equal(animation.row, row)
    assert.ok(animation.frame >= 1 && animation.frame <= 8)
  }
})

test('citizens react to Hermes activity states with distinct action loops', () => {
  const { citizenAnimationAt } = load(
    ['profileSeed', 'citizenAnimationAt'],
    ['LPC_DIRECTION_ROWS', 'LPC_ACTIONS']
  )
  const motion = { mode: 'stationed', facing: 'east' }
  const expected = {
    working: 'spellcast',
    waiting: 'emote',
    failed: 'hurt',
    complete: 'jump'
  }

  for (const [status, action] of Object.entries(expected)) {
    const animation = citizenAnimationAt({ name: 'default', status }, motion, 2_500)
    assert.equal(animation.action, action)
  }
  assert.notEqual(
    citizenAnimationAt({ name: 'default', status: 'working' }, motion, 2_500).row,
    citizenAnimationAt({ name: 'default', status: 'waiting' }, motion, 2_500).row
  )
})

test('directional movement does not mirror or rotate forward-facing artwork', () => {
  assert.doesNotMatch(source, /motion\.facing === 'west'[\s\S]{0,160}scale\(-1, 1\)/)
  assert.match(source, /citizenAnimationAt\(profile, motion, t\)/)
})

test('non-orchestrator work and attention states keep citizens at their home object', () => {
  const { citizenMotionAt, buildCanonicalSceneEntries } = load(
    ['profileSeed', 'citizenMotionAt', 'buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS', 'CANONICAL_NAV_NODES']
  )
  for (const status of ['working', 'waiting', 'failed']) {
    const name = status === 'working' ? 'aivory' : 'default'
    const [entry] = buildCanonicalSceneEntries([{ name, status }])
    const motion = citizenMotionAt(entry.profile, entry.anchor, 93_000)
    assert.equal(motion.mode, 'stationed')
    assert.deepEqual([motion.x, motion.y], [entry.anchor.x, entry.anchor.y])
    assert.equal(motion.station.id, entry.anchor.home)
  }
})

test('the working default orchestrator patrols beyond the upper layout', () => {
  const { citizenMotionAt, buildCanonicalSceneEntries } = load(
    ['profileSeed', 'rectsOverlap', 'worldPointAllowed', 'citizenMotionAt', 'buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS', 'CANONICAL_NAV_NODES', 'CITIZEN_CLEARANCE', 'CANONICAL_WORLD_GEOMETRY']
  )
  const [entry] = buildCanonicalSceneEntries([{ name: 'default', status: 'working' }])
  const samples = Array.from({ length: 241 }, (_, index) => citizenMotionAt(entry.profile, entry.anchor, index * 500))

  assert.ok(samples.some(sample => sample.mode === 'roaming'))
  assert.ok(samples.some(sample => sample.y > 817), 'default should patrol into the grass and lower map while working')
})

test('citizen routes reference real semantic navigation nodes', () => {
  const anchorsSource = constant('CANONICAL_CITIZEN_ANCHORS')
  const nodesSource = constant('CANONICAL_NAV_NODES')
  const context = vm.createContext({})
  vm.runInContext(`${anchorsSource}\n${nodesSource}\nglobalThis.data = { anchors: CANONICAL_CITIZEN_ANCHORS, nodes: CANONICAL_NAV_NODES }`, context)
  const ids = new Set(context.data.nodes.map(node => node.id))
  const byId = new Map(context.data.nodes.map(node => [node.id, node]))

  assert.equal(context.data.nodes.every(node => node.kind && Array.isArray(node.links)), true)
  assert.equal(context.data.nodes.every(node => ['stone', 'grass'].includes(node.surface)), true)
  assert.equal(context.data.anchors.every(anchor => anchor.home && anchor.route.length >= 3), true)
  assert.equal(context.data.anchors.every(anchor => anchor.route.every(id => ids.has(id))), true)
  assert.equal(
    context.data.anchors.every(anchor => anchor.route.some(id => byId.get(id)?.y > 1200)),
    true,
    'every citizen should eventually visit the lower bazaar'
  )
})

test('every roaming segment follows a declared environment edge', () => {
  const { citizenMotionAt, buildCanonicalSceneEntries } = load(
    ['profileSeed', 'rectsOverlap', 'worldPointAllowed', 'citizenMotionAt', 'buildCanonicalSceneEntries'],
    ['CANONICAL_CITIZEN_ANCHORS', 'CANONICAL_NAV_NODES', 'CITIZEN_CLEARANCE', 'CANONICAL_WORLD_GEOMETRY']
  )
  const profiles = ['default', 'aivory', 'cody', 'alpha_sage'].map(name => ({ name, status: 'idle' }))
  const entries = buildCanonicalSceneEntries(profiles)

  for (const entry of entries) {
    for (let time = 0; time <= 240_000; time += 250) {
      const motion = citizenMotionAt(entry.profile, entry.anchor, time)
      if (motion.mode === 'roaming') assert.ok(motion.from.links.includes(motion.to.id), `${entry.profile.name}: ${motion.from.id} -> ${motion.to.id}`)
    }
  }
})

test('world geometry marks buildings monuments ornaments and safe ground separately', () => {
  const context = vm.createContext({})
  vm.runInContext(`${constant('CANONICAL_WORLD_GEOMETRY')}\nglobalThis.geometry = CANONICAL_WORLD_GEOMETRY`, context)
  const { geometry } = context

  assert.ok(geometry.walkable.length >= 4)
  assert.equal(geometry.walkable.every(area => ['stone', 'grass'].includes(area.surface)), true)
  assert.ok(geometry.obstacles.some(area => area.kind === 'building'))
  assert.ok(geometry.obstacles.some(area => area.kind === 'monument'))
  assert.ok(geometry.obstacles.some(area => area.kind === 'ornament'))
  assert.ok(geometry.obstacles.some(area => area.kind === 'fence'))
  assert.ok(geometry.obstacles.some(area => area.kind === 'stall'))
  assert.ok(geometry.obstacles.some(area => area.kind === 'crate'))
  assert.ok(geometry.occluders.some(area => area.kind === 'canopy'))
})

test('lower bazaar walking rejects fences stalls crates and objects', () => {
  const { worldPointAllowed } = load(
    ['rectsOverlap', 'worldPointAllowed'],
    ['CANONICAL_WORLD_GEOMETRY', 'CITIZEN_CLEARANCE']
  )
  const blocked = [
    [300, 956],
    [710, 1070],
    [650, 1200],
    [500, 1330],
    [370, 1475],
    [610, 1490]
  ]
  for (const point of blocked) assert.equal(worldPointAllowed(...point), false, `blocked lower-bazaar point ${point}`)

  const safe = [[500, 900], [505, 1050], [500, 1160], [438, 1320], [350, 1380], [300, 1530], [500, 1660]]
  for (const point of safe) assert.equal(worldPointAllowed(...point), true, `safe stone/grass point ${point}`)
})

test('circled roof and ornament overlap positions are rejected', () => {
  const { worldPointAllowed } = load(
    ['rectsOverlap', 'worldPointAllowed'],
    ['CANONICAL_WORLD_GEOMETRY', 'CITIZEN_CLEARANCE']
  )

  assert.equal(worldPointAllowed(470, 330), false, 'upper crossing overlaps the barrel and crate stack')
  assert.equal(worldPointAllowed(700, 350), false, 'east road is on the large building roof')
})

test('authored roaming edges keep character feet on safe geometry', () => {
  const { worldPointAllowed } = load(
    ['rectsOverlap', 'worldPointAllowed'],
    ['CITIZEN_CLEARANCE', 'CANONICAL_WORLD_GEOMETRY']
  )
  const context = vm.createContext({})
  vm.runInContext(`${constant('CANONICAL_CITIZEN_ANCHORS')}\n${constant('CANONICAL_NAV_NODES')}\nglobalThis.data = { anchors: CANONICAL_CITIZEN_ANCHORS, nodes: CANONICAL_NAV_NODES }`, context)
  const byId = new Map(context.data.nodes.map(node => [node.id, node]))

  for (const anchor of context.data.anchors) {
    for (let index = 0; index < anchor.route.length; index += 1) {
      const from = byId.get(anchor.route[index])
      const to = byId.get(anchor.route[(index + 1) % anchor.route.length])
      const steps = Math.max(20, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2))
      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps
        const x = from.x + (to.x - from.x) * progress
        const y = from.y + (to.y - from.y) * progress
        assert.equal(worldPointAllowed(x, y), true, `${anchor.name}: ${from.id} -> ${to.id} at ${x.toFixed(1)},${y.toFixed(1)}`)
      }
    }
  }
})

test('Polis exposes a user-toggleable world geometry overlay', () => {
  assert.match(source, /showGeometry/)
  assert.match(source, /World geometry/)
  assert.match(source, /drawWorldGeometryOverlay/)
})

test('canonical community is the only renderer and loads only current art', () => {
  assert.match(source, /canonicalCommunity:\s*'lpc-builder\/sources\/polis-bright-bazaar-combined\.png'/)
  assert.match(source, /const worldH = 1765/)
  assert.match(source, /drawCanonicalCommunity/)
  assert.doesNotMatch(source, /USE_CANONICAL_LPC_COMMUNITY|USE_LPC_CHARACTER_TEST/)
  assert.doesNotMatch(source, /drawWorldV[234]?|drawWorld\s*\(/)
  assert.doesNotMatch(source, /polis-terraces|environment-animation|building-herald|character-animation-herald/)
})

test('canonical asset failures use a neutral error canvas, never an older city design', () => {
  assert.match(source, /function drawCanonicalError/)
  assert.match(source, /drawCanonicalError\(ctx, canvas, palette, polisArtError\)/)
})
