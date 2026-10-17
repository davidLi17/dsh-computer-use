// Spike: compare the koffi path (src/native) with the C# helper on this machine.
//   pnpm run build && node scripts/native-smoke.mjs
// Uses DSH's own koffi.node (DSH_KOFFI_PATH overrides the lookup). Moves the
// cursor and puts it back; sends no clicks or keys.
import { mkdirSync, writeFileSync } from 'node:fs'
import { HelperClient } from '../lib/types/helper-client.js'
import { NativeHelper } from '../lib/types/native/native-helper.js'
import { findKoffi } from '../lib/types/native/koffi-path.js'

const out = new URL('../.smoke/', import.meta.url)
mkdirSync(out, { recursive: true })
console.log('koffi.node:', findKoffi() ?? '(not found)')

const csharp = new HelperClient(console.warn)
const native = new NativeHelper(csharp)
if (!native.available) process.exit(1)

async function timed(label, run, times = 5) {
  const ms = []
  let result
  for (let i = 0; i < times; i++) { const t = performance.now(); result = await run(); ms.push(performance.now() - t) }
  ms.sort((a, b) => a - b)
  console.log(`${label}: median ${ms[Math.floor(times / 2)].toFixed(1)} ms (first ${ms.length ? '' : ''}${ms[0].toFixed(1)}–${ms.at(-1).toFixed(1)})`)
  return result
}

// Start both once so startup cost is reported apart from the calls.
let t = performance.now(); await csharp.call('ping'); console.log(`C# helper start: ${(performance.now() - t).toFixed(0)} ms`)
t = performance.now(); await native.call('ping'); console.log(`koffi worker start: ${(performance.now() - t).toFixed(0)} ms`)

const [dc, dn] = [await csharp.call('displays'), await native.call('displays')]
console.log('displays equal:', JSON.stringify(dc) === JSON.stringify(dn))
if (JSON.stringify(dc) !== JSON.stringify(dn)) console.log({ csharp: dc, native: dn })

const d = dn.find(x => x.primary) ?? dn[0]
const rect = { x: d.x, y: d.y, width: d.width, height: d.height, outWidth: Math.round(d.width / 2), outHeight: Math.round(d.height / 2), quality: 80 }
const sc = await timed('screenshot C#   ', () => csharp.call('screenshot', rect))
const sn = await timed('screenshot koffi', () => native.call('screenshot', rect))
writeFileSync(new URL('csharp.jpg', out), Buffer.from(sc.data, 'base64'))
writeFileSync(new URL('koffi.jpg', out), Buffer.from(sn.data, 'base64'))
console.log(`jpeg bytes: C# ${Buffer.from(sc.data, 'base64').length}, koffi ${Buffer.from(sn.data, 'base64').length} (${sn.width}x${sn.height})`)
await timed('full-size koffi ', () => native.call('screenshot', { x: d.x, y: d.y, width: d.width, height: d.height }), 3)

// Event loop stays free while the worker captures?
let ticks = 0
const timer = setInterval(() => ticks++, 5)
await native.call('screenshot', rect)
clearInterval(timer)
console.log('event-loop ticks during one koffi screenshot:', ticks)

await native.call('screenshot', { ...rect, mark: true })
console.log('compare right after mark:', await native.call('screenshot', { ...rect, compare: true }))

const before = await native.call('cursor')
const target = { x: d.x + Math.round(d.width / 2), y: d.y + Math.round(d.height / 2) }
await native.call('move', target)
const [cn, cc] = [await native.call('cursor'), await csharp.call('cursor')]
await native.call('move', before)
console.log('cursor after move:', cn, 'C# sees', cc, 'expected', target)

native.dispose()
