/**
 * xdotool-style key names (what the Anthropic computer tool and most models
 * emit: "ctrl+shift+t", "Return", "super", "F5") mapped to Windows virtual-key
 * codes. One combo is a list of VKs pressed in order and released in reverse.
 */
/** One key name to a VK code, or undefined when unknown. */
export declare function keyCode(name: string): number | undefined;
/**
 * Parse "ctrl+shift+t" or a space-separated sequence "ctrl+a Delete" into
 * combos. A lone "+" is the plus key. Throws with the unknown name.
 */
export declare function parseKeys(text: string): number[][];
/** Modifier names accepted by the `modifiers` parameter of click/scroll actions. */
export declare function parseModifiers(text: string | undefined): number[];
