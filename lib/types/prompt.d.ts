/** Always-on entry point and safety boundaries; operating context lives in the bundled skill. */
import type { AccessMode } from './access.js';
export declare function promptText(mode: AccessMode): string;
