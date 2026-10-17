/**
 * A HelperLike that runs some commands in-process through the koffi.node DSH
 * ships (see worker.ts) and hands everything else to the C# helper.
 *
 * What may go native depends on what the C# helper has on screen:
 * - displays / cursor: always.
 * - screenshot: unless a window card is up (the C# side captures under it).
 * - move / click / keys: only while no overlay is shown, since the C# side
 *   dodges the pill, lets input through its cards and waits for the
 *   instruction box around every pointer or key action.
 * If the worker fails to start, every command goes to the C# helper.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { HelperEvent, HelperLike } from '../helper-client.js'
import { findKoffi } from './koffi-path.js'

const ALWAYS = new Set(['displays', 'cursor'])
const NO_CARD = new Set(['screenshot'])
const NO_OVERLAY = new Set(['move', 'click', 'keys'])

interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }

/** The worker next to this module: lib/native-worker.js when bundled, lib/types/native/worker.js otherwise. */
function workerPath(): string {
  const candidates = ['./native-worker.js', './worker.js'].map(rel => fileURLToPath(new URL(rel, import.meta.url)))
  return candidates.find(path => existsSync(path)) ?? candidates[1]!
}

export class NativeHelper implements HelperLike {
  private worker: Worker | undefined
  private ready: Promise<Worker> | undefined
  private readonly pending = new Map<number, Pending>()
  private nextId = 0
  private broken = false
  private overlay = false
  private readonly cards = new Set<string>()

  constructor(
    private readonly fallback: HelperLike,
    private readonly log: (message: string) => void = () => {},
    /** null: no koffi.node, every command goes to the C# helper. */
    private readonly koffiPath: string | null = findKoffi() ?? null,
  ) {}

  get available(): boolean { return this.koffiPath !== null && !this.broken }

  /** Whether a command would run through koffi right now. */
  routesNative(cmd: string): boolean {
    if (!this.available) return false
    if (ALWAYS.has(cmd)) return true
    if (NO_CARD.has(cmd)) return this.cards.size === 0
    if (NO_OVERLAY.has(cmd)) return !this.overlay && this.cards.size === 0
    return false
  }

  async call<T = unknown>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
    if (!this.routesNative(cmd)) {
      this.shows(cmd, args)
      const result = await this.fallback.call<T>(cmd, args, timeoutMs)
      this.hides(cmd, args)
      return result
    }
    let worker: Worker
    try {
      worker = await this.ensure()
    } catch (error) {
      this.broken = true
      this.log(`koffi helper unavailable, using the C# helper only: ${error instanceof Error ? error.message : String(error)}`)
      return this.fallback.call<T>(cmd, args, timeoutMs)
    }
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`computer-use helper timed out on "${cmd}"`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      worker.postMessage({ id, cmd, args })
    })
  }

  onEvent(listener: (event: HelperEvent) => void): () => void {
    return this.fallback.onEvent(listener)
  }

  dispose(): void {
    void this.worker?.terminate()
    this.worker = undefined
    this.ready = undefined
    this.fallback.dispose()
  }

  /** Follow what the C# helper shows: count it as shown from the request on, hidden once it is done. */
  private shows(cmd: string, args: Record<string, unknown>): void {
    if (cmd === 'overlay_show') this.overlay = true
    else if (cmd === 'window_card') this.cards.add(String(args.hwnd))
  }

  // pet_finish hides the pet on its own after a while; it counts as shown until overlay_hide.
  private hides(cmd: string, args: Record<string, unknown>): void {
    if (cmd === 'overlay_hide') { this.overlay = false; this.cards.clear() }
    else if (cmd === 'window_uncard') this.cards.delete(String(args.hwnd))
  }

  private ensure(): Promise<Worker> {
    this.ready ??= new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(workerPath(), { workerData: { koffiPath: this.koffiPath } })
      worker.unref()
      worker.on('message', (message: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string }) => {
        if (message.event === 'ready') {
          this.worker = worker
          this.log(`computer-use: koffi helper ready (${String(this.koffiPath)})`)
          resolve(worker)
          return
        }
        if (typeof message.id !== 'number') return
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.ok) entry.resolve(message.result ?? null)
        else entry.reject(new Error(message.error ?? 'helper error'))
      })
      worker.on('error', error => {
        this.worker = undefined
        this.ready = undefined
        reject(error)
        for (const [id, entry] of this.pending) { clearTimeout(entry.timer); entry.reject(error); this.pending.delete(id) }
      })
      worker.on('exit', () => { if (this.worker === worker) { this.worker = undefined; this.ready = undefined } })
    })
    return this.ready
  }
}
