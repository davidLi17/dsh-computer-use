import type { HelperEvent, HelperLike } from '../helper-client.js';
export declare class NativeHelper implements HelperLike {
    private readonly fallback;
    private readonly log;
    /** The nativeHelper setting, read on every call. */
    private readonly enabled;
    /** null: no koffi.node, every command goes to the C# helper. */
    private readonly koffiPath;
    private worker;
    private ready;
    private readonly pending;
    private nextId;
    private broken;
    private overlay;
    private readonly cards;
    constructor(fallback: HelperLike, log?: (message: string) => void, 
    /** The nativeHelper setting, read on every call. */
    enabled?: () => boolean, 
    /** null: no koffi.node, every command goes to the C# helper. */
    koffiPath?: string | null);
    get available(): boolean;
    /** Whether a command would run through koffi right now. */
    routesNative(cmd: string): boolean;
    call<T = unknown>(cmd: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    onEvent(listener: (event: HelperEvent) => void): () => void;
    dispose(): void;
    /** Follow what the C# helper shows: count it as shown from the request on, hidden once it is done. */
    private shows;
    private hides;
    private ensure;
}
