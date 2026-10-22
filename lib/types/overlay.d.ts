import type { HelperLike } from './helper-client.js';
export interface CancellableAgent {
    cancel(cause: {
        kind: 'user';
    }): void;
}
export type HostWindowMode = 'pet' | 'card' | 'minimize' | 'keep';
/** The slice of a DSH assistant-stream frame the progress card reads. */
export interface StreamFrame {
    type: string;
    chunk?: {
        type: string;
        text?: string;
        name?: string;
    };
}
/** Markdown reduced to one plain line for the progress card. */
export declare function plainLine(text: string): string;
export interface OverlaySettings {
    overlay: boolean;
    overlayLabel: string;
    hostWindow: HostWindowMode;
    cardOpacity: number;
    userIdleMs: number;
}
interface DisplayRow {
    x: number;
    y: number;
    width: number;
    height: number;
    workX: number;
    workY: number;
    workWidth: number;
    workHeight: number;
    primary: boolean;
    dpi: number;
}
/** Card rectangle in the bottom-right corner of a display's work area. */
export declare function cardRect(display: DisplayRow): {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare class OverlayController {
    private readonly helper;
    private readonly settings;
    private readonly log;
    /** Absolute path of the pill icon (PNG). */
    private readonly iconPath;
    private agent;
    private visible;
    private idleTimer;
    private unusedTimer;
    private otherTools;
    private hostWindows;
    private stopping;
    /** Progress card lines: the reply as it streams, and what the agent is doing. */
    private streamAgent;
    private text;
    private thinking;
    /** Recent steps (tool actions), oldest first. */
    private steps;
    /** Whether the agent is thinking now (newer than the last step). */
    private thinkingLatest;
    private freshAttempt;
    private pushTimer;
    /** An instruction the user typed into the progress card. */
    onMessage: ((agent: CancellableAgent, text: string) => void) | undefined;
    /** Called when control starts (before the first action), e.g. to remember the window layout. */
    onStart: (() => Promise<void>) | undefined;
    /** Opacity the card was last given, to apply setting changes while it floats. */
    private cardOpacity;
    /** Paused by Esc or the pill; actions wait until resumed. */
    paused: boolean;
    /** When the user last typed on the physical keyboard while the overlay was up (ms epoch). */
    lastUserInput: number;
    /** Which physical key that was (helper reason, e.g. "vk=0x41"), for the log. */
    private lastUserKey;
    constructor(helper: HelperLike, settings: () => OverlaySettings, log: (message: string) => void, 
    /** Absolute path of the pill icon (PNG). */
    iconPath?: string);
    /** The agent currently driving the computer, if any. */
    get controller(): CancellableAgent | undefined;
    /** Did the user type after `since`? */
    userTypedSince(since: number): boolean;
    /**
     * Hold the next action while the user has paused (Esc) or is typing.
     * Returns whether it had to wait, so the caller can re-check the screen.
     */
    yieldToUser(signal: AbortSignal, waitForTyping: boolean): Promise<boolean>;
    /** Called before every action: shows the overlay once and updates its status line. */
    begin(agent: CancellableAgent | undefined, status: string): Promise<void>;
    status(status: string): Promise<void>;
    /** One more step on the card's timeline. */
    private step;
    /** Live model output (DSH agent/assistant-stream) for the progress card. */
    stream(agent: unknown, frame: StreamFrame): void;
    /** A tool of another plugin started (computer-use tools report their own steps). */
    toolStarted(agent: unknown, name: string, detail: string): void;
    private schedulePush;
    /** Agent finished (idle), was cancelled, or the plugin is stopping. */
    end(agent?: CancellableAgent): Promise<void>;
    private stop;
    /** Counted from the last computer action only: model output and other tools do not keep the overlay up. */
    private armUnused;
    private armIdle;
    /** Card: shrink the DSH window to an always-on-top corner card; minimize: get it out of the way. */
    private shrinkHost;
    /**
     * Pet mode minimizes DeepSeek Harness; if the user opens it again while the
     * agent works, it floats as the see-through card instead of covering the
     * screen (the agent neither sees nor clicks it).
     */
    private cardIfShown;
    private restoreHost;
}
export {};
