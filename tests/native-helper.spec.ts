import { describe, expect, it } from 'vitest'
import type { HelperLike } from '../src/helper-client.js'
import { NativeHelper } from '../src/native/native-helper.js'

function fake(): HelperLike & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    call: async <T>(cmd: string) => { calls.push(cmd); return null as T },
    onEvent: () => () => {},
    dispose: () => {},
  }
}

describe('NativeHelper routing', () => {
  it('sends everything to the C# helper when koffi.node is missing', () => {
    const helper = new NativeHelper(fake(), () => {}, undefined)
    expect(helper.routesNative('displays')).toBe(false)
    expect(helper.routesNative('screenshot')).toBe(false)
  })

  it('keeps pointer and key input on the C# side while the overlay is shown', async () => {
    const csharp = fake()
    const helper = new NativeHelper(csharp, () => {}, 'koffi.node')
    expect(helper.routesNative('click')).toBe(true)
    await helper.call('overlay_show', {})
    expect(helper.routesNative('click')).toBe(false)
    expect(helper.routesNative('keys')).toBe(false)
    expect(helper.routesNative('screenshot')).toBe(true)
    await helper.call('overlay_hide')
    expect(helper.routesNative('keys')).toBe(true)
    expect(csharp.calls).toEqual(['overlay_show', 'overlay_hide'])
  })

  it('captures through the C# helper while a window card is up', async () => {
    const helper = new NativeHelper(fake(), () => {}, 'koffi.node')
    await helper.call('window_card', { hwnd: 42 })
    expect(helper.routesNative('screenshot')).toBe(false)
    expect(helper.routesNative('displays')).toBe(true)
    await helper.call('window_uncard', { hwnd: 42 })
    expect(helper.routesNative('screenshot')).toBe(true)
  })

  it('never takes overlay, UI Automation or clipboard commands', () => {
    const helper = new NativeHelper(fake(), () => {}, 'koffi.node')
    for (const cmd of ['ping', 'overlay_show', 'ui', 'text', 'type', 'paste', 'clipboard_get', 'settle']) expect(helper.routesNative(cmd)).toBe(false)
  })
})
