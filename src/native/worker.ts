/**
 * Spike: part of the helper's command set done in-process through koffi, on a
 * worker thread so that Sleep-style pauses and GDI work never block the host's
 * event loop. Replies use the same shapes as helper/CuHelper.cs.
 */
import { createRequire } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'
import type * as KoffiModule from 'koffi'

type Koffi = typeof KoffiModule
type Args = Record<string, unknown>

const koffi = createRequire(import.meta.url)((workerData as { koffiPath: string }).koffiPath) as Koffi

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')
const shcore = koffi.load('shcore.dll')
const gdiplus = koffi.load('gdiplus.dll')
const ole32 = koffi.load('ole32.dll')
const kernel32 = koffi.load('kernel32.dll')

const RECT = koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' })
const POINT = koffi.struct('POINT', { x: 'int32_t', y: 'int32_t' })
const MONITORINFOEXW = koffi.struct('MONITORINFOEXW', {
  cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t', szDevice: koffi.array('char16_t', 32, 'String'),
})
const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
  biSize: 'uint32_t', biWidth: 'int32_t', biHeight: 'int32_t', biPlanes: 'uint16_t', biBitCount: 'uint16_t',
  biCompression: 'uint32_t', biSizeImage: 'uint32_t', biXPelsPerMeter: 'int32_t', biYPelsPerMeter: 'int32_t',
  biClrUsed: 'uint32_t', biClrImportant: 'uint32_t',
})
const GUID = koffi.struct('GUID', { Data1: 'uint32_t', Data2: 'uint16_t', Data3: 'uint16_t', Data4: koffi.array('uint8_t', 8, 'Array') })
const EncoderParameter = koffi.struct('EncoderParameter', { Guid: GUID, NumberOfValues: 'uint32_t', Type: 'uint32_t', Value: 'void *' })
const EncoderParameters = koffi.struct('EncoderParameters', { Count: 'uint32_t', Parameter: koffi.array(EncoderParameter, 1) })
const GdiplusStartupInput = koffi.struct('GdiplusStartupInput', {
  GdiplusVersion: 'uint32_t', DebugEventCallback: 'void *', SuppressBackgroundThread: 'int', SuppressExternalCodecs: 'int',
})
const MonitorEnumProc = koffi.proto('int __stdcall MonitorEnumProc(void *monitor, void *hdc, RECT *rect, intptr_t data)')
const ReleaseProc = koffi.proto('uint32_t __stdcall ReleaseProc(void *self)')

const SetThreadDpiAwarenessContext = user32.func('intptr_t __stdcall SetThreadDpiAwarenessContext(intptr_t context)')
const EnumDisplayMonitors = user32.func('int __stdcall EnumDisplayMonitors(void *hdc, RECT *clip, MonitorEnumProc *proc, intptr_t data)')
const GetMonitorInfoW = user32.func('int __stdcall GetMonitorInfoW(void *monitor, _Inout_ MONITORINFOEXW *info)')
const GetCursorPos = user32.func('int __stdcall GetCursorPos(_Out_ POINT *point)')
const SetCursorPos = user32.func('int __stdcall SetCursorPos(int x, int y)')
const SendInput = user32.func('uint32_t __stdcall SendInput(uint32_t count, void *inputs, int size)')
const MapVirtualKeyW = user32.func('uint32_t __stdcall MapVirtualKeyW(uint32_t code, uint32_t type)')
const GetDC = user32.func('void * __stdcall GetDC(void *hwnd)')
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *hwnd, void *hdc)')
const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()')
const GetDpiForMonitor = shcore.func('int32_t __stdcall GetDpiForMonitor(void *monitor, int type, _Out_ uint32_t *x, _Out_ uint32_t *y)')
const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)')
const CreateDIBSection = gdi32.func('void * __stdcall CreateDIBSection(void *hdc, BITMAPINFOHEADER *info, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)')
const SelectObject = gdi32.func('void * __stdcall SelectObject(void *hdc, void *object)')
const BitBlt = gdi32.func('int __stdcall BitBlt(void *dst, int x, int y, int w, int h, void *src, int sx, int sy, uint32_t rop)')
const DeleteObject = gdi32.func('int __stdcall DeleteObject(void *object)')
const DeleteDC = gdi32.func('int __stdcall DeleteDC(void *hdc)')
const GdiFlush = gdi32.func('int __stdcall GdiFlush()')
const GdiplusStartup = gdiplus.func('int __stdcall GdiplusStartup(_Out_ uintptr_t *token, GdiplusStartupInput *input, void *output)')
const GdipCreateBitmapFromScan0 = gdiplus.func('int __stdcall GdipCreateBitmapFromScan0(int w, int h, int stride, int format, void *scan0, _Out_ void **bitmap)')
const GdipGetImageGraphicsContext = gdiplus.func('int __stdcall GdipGetImageGraphicsContext(void *image, _Out_ void **graphics)')
const GdipSetInterpolationMode = gdiplus.func('int __stdcall GdipSetInterpolationMode(void *graphics, int mode)')
const GdipSetPixelOffsetMode = gdiplus.func('int __stdcall GdipSetPixelOffsetMode(void *graphics, int mode)')
const GdipSetCompositingQuality = gdiplus.func('int __stdcall GdipSetCompositingQuality(void *graphics, int quality)')
const GdipCreateImageAttributes = gdiplus.func('int __stdcall GdipCreateImageAttributes(_Out_ void **attrs)')
const GdipSetImageAttributesWrapMode = gdiplus.func('int __stdcall GdipSetImageAttributesWrapMode(void *attrs, int wrap, uint32_t argb, int clamp)')
const GdipDrawImageRectRectI = gdiplus.func('int __stdcall GdipDrawImageRectRectI(void *graphics, void *image, int dx, int dy, int dw, int dh, int sx, int sy, int sw, int sh, int unit, void *attrs, void *callback, void *data)')
const GdipSaveImageToStream = gdiplus.func('int __stdcall GdipSaveImageToStream(void *image, void *stream, GUID *clsid, EncoderParameters *params)')
const GdipDisposeImage = gdiplus.func('int __stdcall GdipDisposeImage(void *image)')
const GdipDeleteGraphics = gdiplus.func('int __stdcall GdipDeleteGraphics(void *graphics)')
const GdipDisposeImageAttributes = gdiplus.func('int __stdcall GdipDisposeImageAttributes(void *attrs)')
const CreateStreamOnHGlobal = ole32.func('int32_t __stdcall CreateStreamOnHGlobal(void *global, int deleteOnRelease, _Out_ void **stream)')
const GetHGlobalFromStream = ole32.func('int32_t __stdcall GetHGlobalFromStream(void *stream, _Out_ void **global)')
const GlobalSize = kernel32.func('size_t __stdcall GlobalSize(void *global)')
const GlobalLock = kernel32.func('void * __stdcall GlobalLock(void *global)')
const GlobalUnlock = kernel32.func('int __stdcall GlobalUnlock(void *global)')

// Per-monitor v2 for this thread only: physical pixels, like the C# helper.
SetThreadDpiAwarenessContext(-4)

const MARKER = 0x44534843n // "DSHC", lets the Esc hook tell our input from the user's
const INPUT_SIZE = 40
const sleeper = new Int32Array(new SharedArrayBuffer(4))
function sleep(ms: number): void { if (ms > 0) Atomics.wait(sleeper, 0, 0, ms) }

function int(args: Args, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' ? Math.trunc(value) : fallback
}

// ---- displays / cursor ----

function displays(): unknown[] {
  const list: unknown[] = []
  const callback = koffi.register((monitor: bigint) => {
    const info = { cbSize: MONITORINFOEXW.size } as Record<string, any>
    GetMonitorInfoW(monitor, info)
    const dx = [96], dy = [96]
    GetDpiForMonitor(monitor, 0, dx, dy)
    const m = info.rcMonitor, w = info.rcWork
    list.push({
      x: m.left, y: m.top, width: m.right - m.left, height: m.bottom - m.top,
      workX: w.left, workY: w.top, workWidth: w.right - w.left, workHeight: w.bottom - w.top,
      primary: (info.dwFlags & 1) !== 0, dpi: dx[0], name: info.szDevice,
    })
    return 1
  }, koffi.pointer(MonitorEnumProc))
  try { EnumDisplayMonitors(null, null, callback, 0) } finally { koffi.unregister(callback) }
  return list
}

function cursor(): { x: number; y: number } {
  const point = {} as { x: number; y: number }
  GetCursorPos(point)
  return { x: point.x, y: point.y }
}

// ---- input ----

const EXTENDED = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2C, 0x2D, 0x2E, 0x5B, 0x5C, 0x5D, 0x6F, 0x90, 0xA3, 0xA5])

/** One INPUT (x64 layout, 40 bytes) for a mouse event. */
function mouse(flags: number, data = 0): Buffer {
  const b = Buffer.alloc(INPUT_SIZE)
  b.writeUInt32LE(0, 0) // INPUT_MOUSE
  b.writeUInt32LE(data >>> 0, 16)
  b.writeUInt32LE(flags, 20)
  b.writeBigUInt64LE(MARKER, 32)
  return b
}

function key(vk: number, up: boolean): Buffer {
  const b = Buffer.alloc(INPUT_SIZE)
  b.writeUInt32LE(1, 0) // INPUT_KEYBOARD
  b.writeUInt16LE(vk, 8)
  b.writeUInt16LE(MapVirtualKeyW(vk, 0) as number, 10)
  b.writeUInt32LE((up ? 0x2 : 0) | (EXTENDED.has(vk) ? 0x1 : 0), 12)
  b.writeBigUInt64LE(MARKER, 24)
  return b
}

function send(inputs: Buffer[]): void {
  if (inputs.length === 0) return
  const sent = SendInput(inputs.length, Buffer.concat(inputs), INPUT_SIZE) as number
  if (sent !== inputs.length) {
    throw new Error(`SendInput was blocked (error ${String(GetLastError())}). The target may be running elevated (as administrator) or the secure desktop (UAC / lock screen) is active.`)
  }
}

function move(x: number, y: number): void {
  SetCursorPos(x, y)
  send([mouse(0x0001)])
}

function buttonFlags(button: unknown): [number, number] {
  if (button === 'right') return [0x0008, 0x0010]
  if (button === 'middle') return [0x0020, 0x0040]
  return [0x0002, 0x0004]
}

function vkList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []
}

function click(args: Args): null {
  if (typeof args.x === 'number') { move(int(args, 'x', 0), int(args, 'y', 0)); sleep(30) }
  const [down, up] = buttonFlags(args.button)
  const count = Math.max(1, Math.min(3, int(args, 'count', 1)))
  const mods = vkList(args.modifiers)
  send(mods.map(vk => key(vk, false)))
  try {
    for (let i = 0; i < count; i++) {
      send([mouse(down)]); sleep(20); send([mouse(up)])
      if (i < count - 1) sleep(40)
    }
  } finally {
    send([...mods].reverse().map(vk => key(vk, true)))
  }
  return null
}

function keys(args: Args): null {
  const combos = Array.isArray(args.combos) ? args.combos.map(vkList) : []
  const hold = int(args, 'holdMs', 0)
  for (const combo of combos) {
    send(combo.map(vk => key(vk, false)))
    sleep(hold > 0 ? hold : 25)
    send([...combo].reverse().map(vk => key(vk, true)))
    sleep(30)
  }
  return null
}

// ---- screenshot ----

let gdiplusReady = false
const JPEG = { Data1: 0x557CF401, Data2: 0x1A04, Data3: 0x11D3, Data4: [0x9A, 0x73, 0x00, 0x00, 0xF8, 0x1E, 0xF3, 0x2E] }
const QUALITY = { Data1: 0x1D5BE4B5, Data2: 0xFA4A, Data3: 0x452D, Data4: [0x9C, 0xDD, 0x5D, 0xB3, 0x51, 0x05, 0xE7, 0xEB] }

function check(status: unknown, what: string): void {
  if (status !== 0) throw new Error(`${what} failed (GDI+ status ${String(status)})`)
}

function startGdiplus(): void {
  if (gdiplusReady) return
  const token: [bigint] = [0n]
  check(GdiplusStartup(token, { GdiplusVersion: 1, DebugEventCallback: null, SuppressBackgroundThread: 0, SuppressExternalCodecs: 0 }, null), 'GdiplusStartup')
  gdiplusReady = true
}

/**
 * Copy native memory into a Buffer. Not koffi.view(): Electron (the DSH host
 * runtime) forbids external ArrayBuffers and aborts the process on one.
 */
function copy(pointer: bigint, offset: number, length: number): Buffer {
  return koffi.decode(pointer, offset, koffi.array('uint8_t', length, 'Buffer')) as Buffer
}

/** Every 8th pixel of every 8th row, as BGR bytes (same sample the C# helper takes). */
function sample(bits: bigint, w: number, h: number): Uint8Array {
  const sx = Math.ceil(w / 8), sy = Math.ceil(h / 8)
  const out = new Uint8Array(sx * sy * 3)
  let k = 0
  for (let j = 0; j < sy; j++) {
    const row = copy(bits, j * 8 * w * 4, w * 4)
    for (let i = 0; i < sx; i++) { const o = i * 32; out[k++] = row[o]!; out[k++] = row[o + 1]!; out[k++] = row[o + 2]! }
  }
  return out
}

function changed(a: Uint8Array, b: Uint8Array): number {
  let diff = 0
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 30) diff++
  }
  return a.length === 0 ? 0 : diff / (a.length / 3)
}

let marked: Uint8Array | undefined
let markedRect = ''

/** Encode a GDI+ image to JPEG in memory and return the bytes. */
function encodeJpeg(image: bigint, quality: number): Buffer {
  const value = koffi.alloc('uint32_t', 1)
  koffi.encode(value, 'uint32_t', quality)
  const params = { Count: 1, Parameter: [{ Guid: QUALITY, NumberOfValues: 1, Type: 4, Value: value }] }
  const stream: [bigint] = [0n]
  check(CreateStreamOnHGlobal(null, 1, stream), 'CreateStreamOnHGlobal')
  try {
    check(GdipSaveImageToStream(image, stream[0], JPEG, params), 'GdipSaveImageToStream')
    const global: [bigint] = [0n]
    check(GetHGlobalFromStream(stream[0], global), 'GetHGlobalFromStream')
    const size = Number(GlobalSize(global[0]))
    const data = GlobalLock(global[0])
    try { return copy(data as bigint, 0, size) } finally { GlobalUnlock(global[0]) }
  } finally {
    // IUnknown::Release is the third slot of the stream's vtable.
    const vtable = koffi.decode(stream[0], 'void *') as bigint
    koffi.call(koffi.decode(vtable, 16, 'void *'), ReleaseProc, stream[0])
    koffi.free(value)
  }
}

function screenshot(args: Args): Record<string, unknown> {
  const x = int(args, 'x', 0), y = int(args, 'y', 0), w = int(args, 'width', 0), h = int(args, 'height', 0)
  const ow = int(args, 'outWidth', w), oh = int(args, 'outHeight', h), quality = int(args, 'quality', 80)
  if (w <= 0 || h <= 0 || ow <= 0 || oh <= 0) throw new Error('invalid capture size')
  startGdiplus()
  const screen = GetDC(null)
  const memory = CreateCompatibleDC(screen)
  const bits: [bigint] = [0n]
  const dib = CreateDIBSection(memory, { biSize: 40, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32, biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 }, 0, bits, null, 0)
  const previous = SelectObject(memory, dib)
  const images: bigint[] = []
  let graphics = 0n, attrs = 0n
  try {
    if (!BitBlt(memory, 0, 0, w, h, screen, x, y, 0x00CC0020 | 0x40000000)) throw new Error(`BitBlt failed (error ${String(GetLastError())})`)
    GdiFlush()
    const compare = args.compare === true, mark = args.mark === true || compare
    if (mark) {
      const key = `${x},${y},${w},${h}`
      const now = sample(bits[0], w, h)
      const threshold = typeof args.threshold === 'number' ? args.threshold : 0.0005
      if (compare && marked && markedRect === key && changed(marked, now) < threshold) return { unchanged: true }
      marked = now
      markedRect = key
    }
    const source: [bigint] = [0n]
    check(GdipCreateBitmapFromScan0(w, h, w * 4, 0x00022009 /* 32bppRGB */, bits[0], source), 'GdipCreateBitmapFromScan0')
    images.push(source[0])
    let output = source[0]
    if (ow !== w || oh !== h) {
      const scaled: [bigint] = [0n]
      check(GdipCreateBitmapFromScan0(ow, oh, 0, 0x00021808 /* 24bppRGB */, null, scaled), 'GdipCreateBitmapFromScan0')
      images.push(scaled[0])
      const g: [bigint] = [0n], a: [bigint] = [0n]
      check(GdipGetImageGraphicsContext(scaled[0], g), 'GdipGetImageGraphicsContext')
      graphics = g[0]
      GdipSetInterpolationMode(graphics, 7) // HighQualityBicubic
      GdipSetPixelOffsetMode(graphics, 2) // HighQuality
      GdipSetCompositingQuality(graphics, 2) // HighQuality
      check(GdipCreateImageAttributes(a), 'GdipCreateImageAttributes')
      attrs = a[0]
      GdipSetImageAttributesWrapMode(attrs, 3 /* TileFlipXY */, 0, 0)
      check(GdipDrawImageRectRectI(graphics, source[0], 0, 0, ow, oh, 0, 0, w, h, 2 /* pixel */, attrs, null, null), 'GdipDrawImageRectRectI')
      output = scaled[0]
    }
    return { data: encodeJpeg(output, quality).toString('base64'), via: 'blt', width: ow, height: oh }
  } finally {
    if (attrs) GdipDisposeImageAttributes(attrs)
    if (graphics) GdipDeleteGraphics(graphics)
    for (const image of images) GdipDisposeImage(image)
    SelectObject(memory, previous)
    DeleteObject(dib)
    DeleteDC(memory)
    ReleaseDC(null, screen)
  }
}

const COMMANDS: Record<string, (args: Args) => unknown> = {
  ping: () => ({ version: 'koffi-spike' }),
  displays,
  cursor,
  move: args => { move(int(args, 'x', 0), int(args, 'y', 0)); return null },
  click,
  keys,
  screenshot,
}

parentPort?.on('message', (message: { id: number; cmd: string; args: Args }) => {
  try {
    const run = COMMANDS[message.cmd]
    if (!run) throw new Error(`unknown command "${message.cmd}"`)
    parentPort!.postMessage({ id: message.id, ok: true, result: run(message.args) ?? null })
  } catch (error) {
    parentPort!.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
parentPort?.postMessage({ event: 'ready' })
