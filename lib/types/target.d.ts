/**
 * Finding a control by what it says instead of where it is. A batch can then
 * act on things that were not on screen in the model's last screenshot (the
 * item of a menu it is about to open, the button of a dialog about to appear),
 * which is what lets one call cover a whole sequence.
 */
/** One UI Automation element as the helper reports it (physical pixels). */
export interface UiElement {
    role: string;
    name: string;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface TargetQuery {
    /** UI Automation control type, when the target named one ("按钮:保存"). */
    role?: string;
    name: string;
}
export type TargetMatch = {
    kind: 'found';
    element: UiElement;
} | {
    kind: 'ambiguous';
    candidates: UiElement[];
} | {
    kind: 'missing';
    suggestions: string[];
};
/** "按钮:保存" → Button named 保存; a colon that is not after a known role stays part of the name. */
export declare function parseTarget(target: string): TargetQuery & {
    roles?: string[];
};
/**
 * Names as people read them: without the accelerator ("保存(S)", "&File"),
 * the trailing ellipsis of commands that open a dialog, and case.
 */
export declare function normalizeName(name: string): string;
/**
 * Pick the element a target means. An exact name beats a name that starts with
 * the text, which beats one that merely contains it; within the best tier,
 * enabled controls beat disabled ones and real controls beat static text.
 * Several different places left after that is an ambiguity, not a guess.
 */
export declare function matchTarget(elements: readonly UiElement[], target: string): TargetMatch;
