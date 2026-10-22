/**
 * Small HTTP bridge for the settings page: live status (helper, displays,
 * resulting screenshot size) and a short overlay preview.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Display } from './coords.js';
import type { Settings } from './computer.js';
import type { HelperLike } from './helper-client.js';
import type { OverlayController } from './overlay.js';
import type { ScreenshotCache } from './screenshots.js';
import type { SkillStore } from './skills.js';
export declare const STATUS_ROUTE = "/api/dsh-computer-use/status";
export declare const PREVIEW_ROUTE = "/api/dsh-computer-use/preview";
export declare const SCREENSHOTS_ROUTE = "/api/dsh-computer-use/screenshots";
export declare const SCREENSHOTS_CLEAN_ROUTE = "/api/dsh-computer-use/screenshots/clean";
export declare const SKILLS_ROUTE = "/api/dsh-computer-use/skills";
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export interface StatusBody {
    ok: true;
    platform: string;
    helper: 'ready' | 'error';
    error?: string;
    displays: Array<Display & {
        shot: {
            width: number;
            height: number;
        };
    }>;
    controlling: boolean;
}
export declare function statusRoute(helper: HelperLike, settings: () => Settings, overlay: OverlayController): Handler;
/** Show the overlay for a few seconds so the user can see how it looks (skipped while an agent is controlling). */
export declare function previewRoute(helper: HelperLike, settings: () => Settings, overlay: OverlayController, iconPath: string): Handler;
/** Screenshot cache size and how much of it is orphaned. */
export declare function screenshotsRoute(cache: ScreenshotCache): Handler;
/** Delete orphaned screenshots now. */
export declare function screenshotsCleanRoute(cache: ScreenshotCache): Handler;
/** App skills for the settings page: GET lists them; POST { op: 'save' | 'delete' | 'reset', ... } changes one. */
export declare function skillsRoute(skills: SkillStore): Handler;
export {};
