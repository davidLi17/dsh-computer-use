/**
 * Per-session application grants, modelled on Claude's computer use: the
 * model asks for named apps with request_access, the user approves through
 * DSH's own approval prompt, and input is only delivered to granted apps.
 * The DSH window itself and configured blocked apps are never controllable.
 */
export type AccessMode = 'per-app' | 'allow-all';
export interface WindowLike {
    exe: string;
    title: string;
}
/** The DSH desktop host: the agent must never type into its own chat. */
export declare const HOST_EXES: string[];
export declare function normalizeApp(name: string): string;
/** Do two app names refer to the same program ("explorer" and "文件资源管理器")? */
export declare function sameApp(a: string, b: string): boolean;
/**
 * Windows shell surfaces that grab the foreground without being a place to
 * work: the touch-keyboard / IME host and Snap Assist.
 */
export declare function isTransientShell(win: WindowLike & {
    className?: string;
}): boolean;
export declare function isHostWindow(win: WindowLike): boolean;
/** Does a granted (or requested) app name refer to this window? */
export declare function appMatches(name: string, win: WindowLike): boolean;
export declare class AccessControl {
    private readonly grants;
    grant(session: string, names: readonly string[]): string[];
    granted(session: string): string[];
    isGranted(session: string, win: WindowLike): boolean;
    /** Names from `names` the session has not been granted yet (aliases count). */
    missing(session: string, names: readonly string[]): string[];
    forget(session: string): void;
    /**
     * Why input may not go to `win`, or undefined when it may. `action` is a
     * short verb for the message ("click", "type into").
     */
    denial(session: string, win: WindowLike | undefined, mode: AccessMode, blocked: readonly string[], action: string): string | undefined;
}
