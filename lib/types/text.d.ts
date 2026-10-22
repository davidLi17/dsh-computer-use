/**
 * Split text for streamed entry: paste block by block so the user watches it
 * appear, while each block still goes in literally (typing Markdown key by key
 * into Typora / Obsidian / Word trips their auto-formatting).
 *
 * Blocks end after a blank-line separator, never inside a ``` / ~~~ fence and
 * never inside a paragraph (a half-pasted **bold** or link may not re-render).
 * Text with no blank line at all (a story written one paragraph per line) is
 * split at its line ends instead, or it would go in as a single block; a table
 * keeps its rows together. Joining the blocks gives back the original text exactly.
 */
export declare function splitBlocks(text: string, minChars?: number): string[];
/** Pieces of at most ~`size` characters, broken after whitespace where possible (for paced typing). */
export declare function typingPieces(text: string, size?: number): string[];
