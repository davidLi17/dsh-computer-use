export interface ScreenshotStats {
    /** Screenshots this plugin knows about that still exist on disk. */
    count: number;
    bytes: number;
    /** Of those, the ones no longer referenced anywhere (safe to delete). */
    orphans: number;
    orphanBytes: number;
}
export interface CleanResult {
    removed: number;
    bytes: number;
}
type ZstdDecompress = (data: Uint8Array) => Buffer;
export declare class ScreenshotCache {
    private readonly dshHome;
    private readonly indexFile;
    private readonly log;
    private index;
    private saving;
    private busy;
    constructor(dshHome?: string, indexFile?: string, log?: (message: string) => void);
    private get objects();
    private path;
    /** Remember a screenshot attachment ("sha256:<hex>") this plugin saved. */
    record(attachmentId: string): void;
    stats(): Promise<ScreenshotStats>;
    /** Delete orphaned screenshots. */
    clean(): Promise<CleanResult>;
    private classify;
    /** Every attachment id referenced anywhere DSH keeps conversation state. */
    private scan;
    private size;
    private load;
    private persist;
    private exclusive;
}
/** Ids in `text`; ids of our own screenshots (tool results named screenshot.jpg) also go to `ours`. */
export declare function collect(text: string, referenced: Set<string>, ours: Set<string>): void;
/** Split at frame magics; when a split falls inside a frame, merge with the next piece and retry. */
export declare function decodeFrames(data: Buffer, zstd: ZstdDecompress): string | undefined;
export {};
