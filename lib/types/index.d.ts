import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type AccessMode } from './access.js';
import { type TypingMode } from './computer.js';
import { type HostWindowMode } from './overlay.js';
export { DEFAULTS, ENTRY_ID, resolveConfig } from './settings.js';
export declare const name = "@copylee/dsh-computer-use";
export declare const inject: string[];
export interface Config {
    accessMode?: AccessMode;
    overlay?: boolean;
    overlayLabel?: string;
    hostWindow?: HostWindowMode;
    cardOpacity?: number;
    /** @deprecated replaced by hostWindow: 'minimize' */
    minimizeHostWindow?: boolean;
    autoScreenshot?: boolean;
    settleMs?: number;
    maxLongEdge?: number;
    maxPixels?: number;
    jpegQuality?: number;
    blockedApps?: string[];
    pauseOnUserInput?: boolean;
    userIdleMs?: number;
    typingMode?: TypingMode;
    quickSteps?: boolean;
    nativeHelper?: boolean;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
