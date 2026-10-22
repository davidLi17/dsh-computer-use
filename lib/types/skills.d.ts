import { type WindowLike } from './access.js';
/** Notes longer than this must be condensed before more is added. */
export declare const SKILL_MAX_CHARS = 4000;
export interface Skill {
    id: string;
    app: string;
    /** Names / exe names this skill applies to. */
    match: string[];
    summary: string;
    content: string;
    source: 'builtin' | 'user';
    /** A user file replaces a built-in skill of the same id. */
    overrides: boolean;
    updatedAt: number;
}
export interface SkillInput {
    app: string;
    match?: string[];
    summary?: string;
    content: string;
}
interface Parsed {
    app: string;
    match: string[];
    summary: string;
    content: string;
    disabled: boolean;
    extend: boolean;
}
export declare function skillId(app: string): string;
export declare function parseSkill(text: string, fallbackApp: string): Parsed;
export declare function formatSkill(skill: {
    app: string;
    match: string[];
    summary: string;
    content: string;
}, disabled?: boolean, extend?: boolean): string;
export declare class SkillStore {
    private readonly builtinDir;
    readonly userDir: string;
    constructor(builtinDir: string, userDir?: string);
    private load;
    /** Every active skill, user files first in precedence, sorted by app name. */
    list(): Skill[];
    get(id: string): Skill | undefined;
    /** The skill for an app by name, or for a window by its executable. */
    find(name: string, win?: WindowLike): Skill | undefined;
    /** One line per skill for the system prompt. */
    catalog(): string;
    save(input: SkillInput, id?: string, extend?: boolean): Skill;
    append(app: string, text: string, extra?: {
        match?: string[];
        summary?: string;
    }): Skill;
    /** Delete a user skill; a built-in one is hidden by a disabled override. */
    remove(id: string): void;
    /** Drop the user's override so the built-in skill applies again. */
    reset(id: string): void;
}
export {};
