import { type AccessControl, type AccessMode, type WindowLike } from './access.js';
import { type Display, type Point, type Size } from './coords.js';
import type { HelperLike } from './helper-client.js';
import { type UiElement } from './target.js';
import type { CancellableAgent, HostWindowMode, OverlayController } from './overlay.js';
export interface Settings {
    accessMode: AccessMode;
    blockedApps: string[];
    overlay: boolean;
    overlayLabel: string;
    hostWindow: HostWindowMode;
    /** Card opacity in percent while controlling (it turns opaque when the pointer rests on it). */
    cardOpacity: number;
    maxLongEdge: number;
    maxPixels: number;
    jpegQuality: number;
    autoScreenshot: boolean;
    settleMs: number;
    /** Pause while the user types on the physical keyboard. */
    pauseOnUserInput: boolean;
    /** How long the keyboard must be quiet before resuming. */
    userIdleMs: number;
    /** How text is entered: stream = paste block by block, type = key by key, paste = at once. */
    typingMode: TypingMode;
    /** Run the model at its lowest reasoning effort for the requests in the middle of operating the computer. */
    quickSteps: boolean;
    /** Run screenshots, display / window queries and idle input in-process through DSH's koffi instead of the C# helper. */
    nativeHelper: boolean;
}
export type TypingMode = 'stream' | 'type' | 'paste';
export interface WindowInfo extends WindowLike {
    hwnd: number;
    pid: number;
    className: string;
    path: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
    maximized: boolean;
    foreground?: boolean;
}
export interface Shot {
    data: Uint8Array;
    width: number;
    height: number;
}
/** What a tool call knows about its caller. */
export interface CallContext {
    session: string;
    agent: CancellableAgent | undefined;
    signal: AbortSignal;
    /** Whether the conversation model can look at images. */
    vision: boolean;
    /** The session never prompts for approval (full access / auto review): access requests are granted as they come. */
    autoApprove?: boolean;
}
export declare const ACTIONS: readonly ["screenshot", "left_click", "right_click", "middle_click", "double_click", "triple_click", "mouse_move", "left_click_drag", "left_mouse_down", "left_mouse_up", "scroll", "type", "key", "hold_key", "wait", "zoom", "cursor_position"];
export type Action = typeof ACTIONS[number];
export interface ActionInput {
    action: Action;
    coordinate?: number[];
    start_coordinate?: number[];
    text?: string;
    modifiers?: string;
    scroll_direction?: 'up' | 'down' | 'left' | 'right';
    scroll_amount?: number;
    duration?: number;
    region?: number[];
    /** A control named by what it says, instead of a coordinate. */
    target?: string;
    /** wait: what to wait for ("window:记事本", "target:保存"). */
    until?: string;
    /** wait: wait for it to disappear instead. */
    gone?: boolean;
}
export interface ActionOutcome {
    text: string;
    /** A screenshot or zoom image to return to the model. */
    image?: Shot;
    /** The action was not performed because the user took over the keyboard. */
    skipped?: boolean;
}
/** Text returned instead of an identical screenshot. */
export declare const UNCHANGED_TEXT = "The screen looks exactly as in your previous screenshot: the action had no visible effect.";
/** Longest adaptive wait for the screen to settle after an action. */
export declare const MAX_SETTLE_MS = 2500;
export declare class Computer {
    readonly helper: HelperLike;
    readonly access: AccessControl;
    readonly overlay: OverlayController;
    readonly settings: () => Settings;
    private displays;
    private displayIndex;
    private heldButton;
    /** The agent that last wrote the clipboard; when it goes idle the user's clipboard comes back. */
    clipboardAgent: CancellableAgent | undefined;
    constructor(helper: HelperLike, access: AccessControl, overlay: OverlayController, settings: () => Settings);
    refreshDisplays(): Promise<Display[]>;
    display(): Promise<Display>;
    selectDisplay(index: number): Promise<Display>;
    get currentIndex(): number;
    shotSize(display: Display): Size;
    private point;
    toModel(point: Point): Promise<Point & {
        offscreen: boolean;
    }>;
    screenshot(): Promise<Shot>;
    /**
     * A fresh screenshot, or 'unchanged' when the screen looks the same as in
     * the last one the model saw (saves an image and tells it the action had no
     * visible effect).
     */
    freshShot(): Promise<Shot | 'unchanged'>;
    /** The foreground window as of the model's latest look at the screen. */
    private seen;
    /** The latest foreground window that was not DeepSeek Harness itself. */
    private lastTarget;
    /** A new turn starts: the user may have rearranged things while chatting. */
    resetLook(): void;
    private remember;
    /**
     * Did another window come to the front since the model last looked, without
     * the agent acting in between? Then the user (or a popup) changed the screen.
     */
    private foregroundChanged;
    private capture;
    zoom(region: number[] | undefined): Promise<Shot>;
    foreground(): Promise<WindowInfo | undefined>;
    /**
     * The user clicked into the DeepSeek Harness card (to read or scroll the
     * chat): keys would go there. Put the window the agent was working in back
     * in front instead of refusing.
     */
    private refocusFromHost;
    /** Wait at most `maxMs`, returning once the screen has been still for ~0.8 s. Returns the time waited. */
    waitForQuiet(maxMs: number, signal: AbortSignal): Promise<number>;
    /** Wait until the screen stops changing (bounded), instead of a fixed delay. */
    settle(signal: AbortSignal): Promise<void>;
    windowAt(point: Point): Promise<WindowInfo | undefined>;
    windows(): Promise<WindowInfo[]>;
    /** Windows when control started (hwnd -> minimized), and windows brought back from the tray since. */
    private before;
    private readonly fromTray;
    /** Remember the window layout at the start of a task, to tell what the agent opened or restored. */
    noteStart(): Promise<void>;
    noteFromTray(hwnd: number): void;
    /** How a window relates to the layout before the task: opened by the agent, or restored from minimized / tray. */
    origin(win: WindowInfo): 'opened' | 'minimized' | 'tray' | undefined;
    /** Programs running without any visible window (closed to the system tray); `tray` = has a tray icon. */
    backgroundApps(tray?: boolean): Promise<Array<WindowInfo & {
        tray: boolean;
    }>>;
    cursor(): Promise<Point>;
    /** Short description of the frontmost window, for result text. */
    describeForeground(): Promise<string>;
    private assertAllowed;
    private checkPointer;
    private checkKeyboard;
    /** Overlay status line for an action (Chinese, shown to the user). */
    static statusOf(input: ActionInput): string;
    /**
     * Controls of the foreground window, in physical pixels. `where` picks the
     * window itself or its popups (open menus and flyouts are windows of their
     * own). They are read separately because scanning both costs a second or
     * more on a file dialog, and the control is nearly always in the window.
     */
    elements(where?: 'window' | 'popups'): Promise<UiElement[]>;
    /** Look for a named control in the window, and only if it is not there in its popups. */
    private find;
    /**
     * Where a named control is. It may still be appearing (the menu just
     * opened), so look again for a few seconds before giving up; an ambiguous
     * name fails at once, with the candidates, rather than clicking a guess.
     */
    locate(target: string, signal: AbortSignal, waitMs?: number): Promise<{
        point: Point;
        element: UiElement;
    }>;
    /** The point an action aims at: a named control, a coordinate, or nothing (the cursor). */
    private aim;
    /** wait with `until`: done as soon as the window or control is there (or gone). */
    private waitUntil;
    /** Run one action. Returns text plus an image for screenshot/zoom. */
    run(input: ActionInput, call: CallContext): Promise<ActionOutcome>;
    /**
     * Enter text the way the settings ask. Long text is pasted (literally: typing
     * Markdown key by key trips editors' auto-formatting); in stream mode block
     * by block so the user watches it appear. Between pieces the user can pause
     * (Esc / typing); if another window comes to the front meanwhile, stop.
     */
    private enterText;
    /** Run `step` per piece; between pieces yield to the user and make sure the target window is still in front. */
    private pieces;
    /** Release a mouse button left down by an aborted run. */
    releaseHeld(): Promise<void>;
    /**
     * After a mutating action: wait for the screen to settle, then capture
     * (vision models only). A wait already waited, so it is captured at once:
     * "wait, then look" should be one step, not two.
     */
    after(inputs: readonly ActionInput[], call: CallContext): Promise<Shot | 'unchanged' | undefined>;
    /** Bring a window forward and verify it is the foreground window. */
    focus(win: WindowInfo): Promise<WindowInfo & {
        focused: boolean;
    }>;
    /** Window rectangle in screenshot coordinates, for listings. */
    windowBox(win: WindowInfo): Promise<string>;
}
