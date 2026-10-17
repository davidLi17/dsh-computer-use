// Spike: compare the koffi path (src/native) with the C# helper on this machine.
//   pnpm run build && node scripts/native-smoke.mjs [--notepad]
// Uses DSH's own koffi.node (DSH_KOFFI_PATH overrides the lookup). Moves the
// cursor and puts it back; clicks and keys only with --notepad, into its own scratch file.
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
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
t = performance.now(); await native.call('cursor'); console.log(`koffi worker start: ${(performance.now() - t).toFixed(0)} ms`)

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
const again = await native.call('screenshot', { ...rect, compare: true })
console.log('compare right after mark:', again.unchanged === true ? 'unchanged' : 'changed (something on screen moved in between)')

const before = await native.call('cursor')
const target = { x: d.x + Math.round(d.width / 2), y: d.y + Math.round(d.height / 2) }
await native.call('move', target)
const [cn, cc] = [await native.call('cursor'), await csharp.call('cursor')]
await native.call('move', before)
console.log('cursor after move:', cn, 'C# sees', cc, 'expected', target)

// Window queries: same answers from both sides (no overlay is up, so the C# side hides nothing of its own).
const pick = w => ({ hwnd: w.hwnd, title: w.title, className: w.className, pid: w.pid, exe: w.exe, path: w.path, x: w.x, y: w.y, width: w.width, height: w.height, minimized: w.minimized, maximized: w.maximized, foreground: w.foreground })
const [wc, wn] = [await csharp.call('windows'), await native.call('windows')]
const same = JSON.stringify(wc.map(pick)) === JSON.stringify(wn.map(pick))
console.log(`windows: C# ${wc.length}, koffi ${wn.length}, equal: ${same}`)
if (!same) console.log({ csharp: wc.map(pick), native: wn.map(pick) })
await timed('windows C#      ', () => csharp.call('windows'))
await timed('windows koffi   ', () => native.call('windows'))
const [fc, fn] = [await csharp.call('foreground'), await native.call('foreground')]
console.log('foreground equal:', JSON.stringify(pick(fc)) === JSON.stringify(pick(fn)), `(${fn.exe} | ${fn.title})`)
const [ac, an] = [await csharp.call('window_at', target), await native.call('window_at', target)]
console.log('window_at equal:', JSON.stringify(pick(ac)) === JSON.stringify(pick(an)), `(${an.exe} | ${an.title})`)

if (process.argv.includes('--notepad')) {
  // click / keys through koffi into a scratch file of our own. The foreground
  // window is checked before every input: never send blind input to the user's apps.
  const file = new URL('native-notepad.txt', out)
  writeFileSync(file, '')
  await native.call('launch', { target: 'notepad.exe', args: `"${fileURLToPath(file)}"` })
  const ours = async () => {
    const fg = await native.call('foreground')
    return /notepad/i.test(fg.exe) && fg.title.includes('native-notepad') ? fg : undefined
  }
  const editor = async () => (await native.call('ui', {})).elements.find(e => e.role === 'Document' || e.role === 'Edit')
  let fg
  for (let i = 0; i < 40 && !(fg = await ours()); i++) await sleep(250)
  const doc = fg && await editor()
  if (!doc) {
    console.log('ABORT: native-notepad.txt is not the foreground window (or has no editor); no input sent.')
  } else {
    console.log('routes through koffi:', ['click', 'keys', 'type', 'scroll', 'drag', 'window_at'].map(c => `${c} ${native.routesNative(c)}`).join(', '))
    const at = { x: Math.round(doc.x + doc.width / 2), y: Math.round(doc.y + doc.height / 2) }
    const hit = await native.call('window_at', at)
    if (hit.hwnd !== fg.hwnd) {
      console.log('ABORT: the editor centre is not our Notepad window; no input sent.')
    } else {
      await native.call('click', { ...at, button: 'left', count: 1, modifiers: [] })
      const vk = text => [...text].map(c => (c >= 'A' && c <= 'Z' ? [0x10, c.charCodeAt(0)] : [c.toUpperCase().charCodeAt(0)]))
      if (await ours()) await native.call('keys', { combos: vk('koffi 42') })
      await sleep(300)
      const first = (await editor())?.value
      console.log(first === 'koffi 42' ? 'PASS: click + keys typed "koffi 42"' : `CHECK: editor holds ${JSON.stringify(first)}`)
      // ctrl+A, then shift+A shift+B: modifier combos replace the selection.
      if (await ours()) await native.call('keys', { combos: [[0x11, 0x41], ...vk('AB')] })
      await sleep(300)
      const second = (await editor())?.value
      console.log(second === 'AB' ? 'PASS: ctrl+A and shift combos' : `CHECK: editor holds ${JSON.stringify(second)}`)
      // type: Chinese, a surrogate pair, a tab and a line break, over the selection.
      const text = '第一行 ✓ 😀\n\tsecond'
      if (await ours()) await native.call('keys', { combos: [[0x11, 0x41]] })
      if (await ours()) await native.call('type', { text })
      await sleep(300)
      const third = (await editor())?.value?.replace(/\r\n?/g, '\n')
      console.log(third === text ? 'PASS: type (CJK, emoji, tab, newline)' : `CHECK: editor holds ${JSON.stringify(third)}`)
      // scroll and a drag in the empty part of the editor: no error, text untouched.
      if (await ours()) await native.call('scroll', { ...at, dx: 0, dy: 2, modifiers: [] })
      if (await ours()) await native.call('drag', { x1: at.x, y1: at.y, x2: at.x + 60, y2: at.y + 20, button: 'left' })
      await sleep(200)
      const fourth = (await editor())?.value?.replace(/\r\n?/g, '\n')
      console.log(fourth === text ? 'PASS: scroll + drag ran, text unchanged' : `CHECK: editor holds ${JSON.stringify(fourth)}`)
      const sel = await native.call('screenshot', { x: doc.x, y: doc.y, width: doc.width, height: doc.height, outWidth: Math.round(doc.width / 2), outHeight: Math.round(doc.height / 2), quality: 80 })
      writeFileSync(new URL('native-notepad.jpg', out), Buffer.from(sel.data, 'base64'))
    }
    if (await ours()) await native.call('keys', { combos: [[0x11, 0x53], [0x11, 0x57]] }) // ctrl+s, ctrl+w on our own file
    await sleep(500)
  }
}

native.dispose()
