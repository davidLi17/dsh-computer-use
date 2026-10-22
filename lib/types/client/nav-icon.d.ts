/**
 * Give the "电脑控制" row in the DSH settings navigation a mouse-pointer icon
 * instead of the shell's fallback gear.
 *
 * `settings.section` registrations only carry `id`, `order` and `label`; the
 * shell picks icons for built-in ids only. So, like dsh-better-sidebar, we mark
 * our own row by its label and let CSS swap the glyph (Lucide mouse-pointer-2,
 * drawn as a currentColor mask so hover / active colors still apply).
 */
export declare const navIconCss = "\n[data-dsh-computer-use-settings-nav] > svg:first-child { display: none; }\n[data-dsh-computer-use-settings-nav]::before {\n  content: '';\n  flex: none;\n  width: 16px;\n  height: 16px;\n  background: currentColor;\n  -webkit-mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'/%3E%3C/svg%3E\") center / contain no-repeat;\n  mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'/%3E%3C/svg%3E\") center / contain no-repeat;\n}\n";
/** Keep the marker on the settings-nav button labelled `label`; returns a disposer. */
export declare function registerNavIcon(label: string): () => void;
