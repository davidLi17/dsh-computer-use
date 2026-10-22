/**
 * Plugin settings shared by the host and the settings page: defaults and the
 * tolerant reader for the Loader entry config. No schemastery here so the
 * browser bundle stays small.
 */
import type { Settings } from './computer.js';
/** The Loader entry id (settings namespace); see cordis.patch.yml. */
export declare const ENTRY_ID = "copylee-computer-use";
export declare const DEFAULTS: Settings;
/** Unwrap `.volatile()` refs (`{ get() }`) and fall back to defaults for bad values. */
export declare function resolveConfig(raw: unknown): Settings;
