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

test('canonical community is the only renderer and loads only current art', () => {
  assert.match(source, /canonicalCommunity:\s*'lpc-builder\/sources\/image_c76574\.png'/)
  assert.match(source, /drawCanonicalCommunity/)
  assert.doesNotMatch(source, /USE_CANONICAL_LPC_COMMUNITY|USE_LPC_CHARACTER_TEST/)
  assert.doesNotMatch(source, /drawWorldV[234]?|drawWorld\s*\(/)
  assert.doesNotMatch(source, /polis-terraces|environment-animation|building-herald|character-animation-herald/)
})

test('canonical asset failures use a neutral error canvas, never an older city design', () => {
  assert.match(source, /function drawCanonicalError/)
  assert.match(source, /drawCanonicalError\(ctx, canvas, palette, polisArtError\)/)
})
