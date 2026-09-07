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
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?)\\n\\]`))
  if (!match) throw new Error(`Missing production constant: ${name}`)
  return `const ${name} = ${match[1]}\n]`
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

test('scene plan paints upper citizens before lower architecture', () => {
  const { buildSceneEntriesV4, sceneRenderPlanV4 } = load(
    ['buildSceneEntriesV4', 'sceneRenderPlanV4'],
    ['POLIS_LAYOUTS_V4']
  )
  const profiles = ['upper-left', 'upper-right', 'lower-left', 'lower-right'].map(name => ({ name }))
  const entries = buildSceneEntriesV4(profiles)
  const plan = sceneRenderPlanV4(entries)

  const lastUpperCitizen = Math.max(
    ...plan.map((step, index) => step.row === 'upper' && step.layer === 'nameplate' ? index : -1)
  )
  const firstLowerArchitecture = plan.findIndex(step => step.row === 'lower' && step.layer === 'foundation')

  assert.ok(lastUpperCitizen >= 0)
  assert.ok(firstLowerArchitecture > lastUpperCitizen)
})

test('scene plan always paints foreground ambience before citizens in the deepest occupied row', () => {
  const { sceneRenderPlanV4 } = load(['sceneRenderPlanV4'])
  const oneCitizen = [{ row: 'upper', index: 0 }]
  const fourCitizens = [
    { row: 'upper', index: 0 }, { row: 'upper', index: 1 },
    { row: 'lower', index: 2 }, { row: 'lower', index: 3 }
  ]

  for (const entries of [oneCitizen, fourCitizens]) {
    const plan = sceneRenderPlanV4(entries)
    const ambience = plan.findIndex(step => step.layer === 'ambience')
    const deepestRow = entries.some(entry => entry.row === 'lower') ? 'lower' : 'upper'
    const firstDeepCitizen = plan.findIndex(step => step.layer === 'character' && step.row === deepestRow)
    const lastDeepArchitecture = plan.findLastIndex(step => step.layer === 'props' && step.row === deepestRow)
    assert.ok(ambience > lastDeepArchitecture)
    assert.ok(ambience < firstDeepCitizen)
  }
})

test('scene plan preserves path, architecture, citizen, activity and nameplate order within each terrace', () => {
  const { buildSceneEntriesV4, sceneRenderPlanV4 } = load(
    ['buildSceneEntriesV4', 'sceneRenderPlanV4'],
    ['POLIS_LAYOUTS_V4']
  )
  const entries = buildSceneEntriesV4(['a', 'b', 'c', 'd'].map(name => ({ name })))
  const plan = sceneRenderPlanV4(entries)

  for (const row of ['upper', 'lower']) {
    const layers = plan.filter(step => step.row === row).map(step => step.layer)
    const first = layer => layers.indexOf(layer)
    const last = layer => layers.lastIndexOf(layer)
    assert.ok(last('path') < first('foundation'), `${row}: paths must be behind architecture`)
    assert.ok(last('props') < first('character'), `${row}: architecture must be behind citizens`)
    assert.ok(last('character') < first('activity'), `${row}: activity cues must follow citizens`)
    assert.ok(last('activity') < first('nameplate'), `${row}: nameplates must be topmost in their row`)
  }
})

test('scene entries retain the approved two-by-two terrace assignment', () => {
  const { buildSceneEntriesV4 } = load(['buildSceneEntriesV4'], ['POLIS_LAYOUTS_V4'])
  const entries = buildSceneEntriesV4(['a', 'b', 'c', 'd', 'ignored'].map(name => ({ name })))
  assert.deepEqual(
    entries.map(entry => [entry.profile.name, entry.row, entry.site.x, entry.site.y]),
    [
      ['a', 'upper', 74, 76],
      ['b', 'upper', 246, 76],
      ['c', 'lower', 74, 146],
      ['d', 'lower', 246, 146]
    ]
  )
})

test('upper citizens move into the central walkway while lower citizens retain their anchors', () => {
  const { agentCenterV4 } = load(['agentCenterV4'])
  assert.equal(agentCenterV4({ x: 74, y: 76 }), 382)
  assert.equal(agentCenterV4({ x: 246, y: 76 }), 578)
  assert.equal(agentCenterV4({ x: 74, y: 146 }), 162)
  assert.equal(agentCenterV4({ x: 246, y: 146 }), 678)
})

test('upper site hit areas include both the workplace and relocated citizen', () => {
  const { agentCenterV4, siteHitBoxV4 } = load(['agentCenterV4', 'siteHitBoxV4'])

  for (const site of [{ x: 74, y: 76 }, { x: 246, y: 76 }]) {
    const box = siteHitBoxV4(site)
    const citizenCenter = agentCenterV4(site)
    const workplaceLeft = site.x * 3 - 135
    const workplaceRight = site.x * 3 + 135

    assert.ok(box.x <= workplaceLeft)
    assert.ok(box.x + box.w >= workplaceRight)
    assert.ok(citizenCenter >= box.x && citizenCenter <= box.x + box.w)
  }
})

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
