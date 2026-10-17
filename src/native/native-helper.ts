/**
 * Spike: a HelperLike that runs the commands it knows in-process through the
 * koffi.node DSH ships (see worker.ts) and hands every other command to the
 * C# helper. Not wired into the plugin yet.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { HelperEvent, HelperLike } from '../helper-client.js'
import { findKoffi } from './koffi-path.js'

export const NATIVE_COMMANDS = new Set(['ping', 'displays', 'cursor', 'move', 'click', 'keys', 'screenshot'])

interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }

/** worker.js next to this module: lib/native-worker.js when bundled, lib/types/native/worker.js otherwise. */
function workerPath(): string {
  const candidates = ['./native-worker.js', './worker.js'].map(rel => fileURLToPath(new URL(rel, import.meta.url)))
  return candidates.find(path => existsSync(path)) ?? candidates[1]!
}

export class NativeHelper implements HelperLike {
  private worker: Worker | undefined
  private ready: Promise<Worker> | undefined
  private readonly pending = new Map<number, Pending>()
  private nextId = 0

  constructor(private readonly fallback: HelperLike, private readonly koffiPath = findKoffi()) {}

  get available(): boolean { return this.koffiPath !== undefined }

  call<T = unknown>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<T> {
    if (!this.koffiPath || !NATIVE_COMMANDS.has(cmd)) return this.fallback.call<T>(cmd, args, timeoutMs)
    return this.ensure().then(worker => new Promise<T>((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`native helper timed out on "${cmd}"`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      worker.postMessage({ id, cmd, args })
    }))
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

  private ensure(): Promise<Worker> {
    this.ready ??= new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(workerPath(), { workerData: { koffiPath: this.koffiPath } })
      worker.unref()
      worker.on('message', (message: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string }) => {
        if (message.event === 'ready') { this.worker = worker; resolve(worker); return }
        if (typeof message.id !== 'number') return
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.ok) entry.resolve(message.result ?? null)
        else entry.reject(new Error(message.error ?? 'native helper error'))
      })
      worker.on('error', error => {
        this.ready = undefined
        reject(error)
        for (const [id, entry] of this.pending) { clearTimeout(entry.timer); entry.reject(error); this.pending.delete(id) }
      })
    })
    return this.ready
  }
}
