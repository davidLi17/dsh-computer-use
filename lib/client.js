window.__ModuleLoader__.load({
	id: "@copylee/dsh-computer-use",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region lib/types/settings.js
		/** The Loader entry id (settings namespace); see cordis.patch.yml. */
		const ENTRY_ID = "copylee-computer-use";
		const DEFAULTS = {
			accessMode: "per-app",
			overlay: true,
			overlayLabel: "DeepSeek Harness",
			hostWindow: "pet",
			cardOpacity: 80,
			autoScreenshot: true,
			settleMs: 400,
			maxLongEdge: 1366,
			maxPixels: 115e4,
			jpegQuality: 70,
			blockedApps: [],
			pauseOnUserInput: true,
			userIdleMs: 1500,
			typingMode: "stream",
			quickSteps: false,
			nativeHelper: true
		};
		/** Unwrap `.volatile()` refs (`{ get() }`) and fall back to defaults for bad values. */
		function resolveConfig(raw) {
			const out = {};
			if (raw !== null && typeof raw === "object") for (const [key, value] of Object.entries(raw)) out[key] = value !== null && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
			const num = (key, min, max) => {
				const value = out[key];
				return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : DEFAULTS[key];
			};
			const bool = (key) => typeof out[key] === "boolean" ? out[key] : DEFAULTS[key];
			return {
				accessMode: out.accessMode === "allow-all" || out.accessMode === "per-app" ? out.accessMode : DEFAULTS.accessMode,
				overlay: bool("overlay"),
				overlayLabel: typeof out.overlayLabel === "string" && out.overlayLabel.trim() !== "" ? out.overlayLabel.trim().slice(0, 40) : DEFAULTS.overlayLabel,
				hostWindow: out.hostWindow === "pet" || out.hostWindow === "card" || out.hostWindow === "minimize" || out.hostWindow === "keep" ? out.hostWindow : out.minimizeHostWindow === true ? "minimize" : DEFAULTS.hostWindow,
				cardOpacity: num("cardOpacity", 30, 100),
				autoScreenshot: bool("autoScreenshot"),
				settleMs: num("settleMs", 0, 5e3),
				maxLongEdge: num("maxLongEdge", 640, 3840),
				maxPixels: num("maxPixels", 3e5, 8e6),
				jpegQuality: num("jpegQuality", 30, 100),
				pauseOnUserInput: bool("pauseOnUserInput"),
				userIdleMs: num("userIdleMs", 300, 1e4),
				quickSteps: bool("quickSteps"),
				nativeHelper: bool("nativeHelper"),
				typingMode: out.typingMode === "stream" || out.typingMode === "type" || out.typingMode === "paste" ? out.typingMode : DEFAULTS.typingMode,
				blockedApps: Array.isArray(out.blockedApps) ? out.blockedApps.filter((item) => typeof item === "string" && item.trim() !== "") : []
			};
		}
		//#endregion
		//#region lib/types/client/accent.js
		/**
		* The accent colour shared by the copylee DSH plugins (docs/ui-spec.md).
		*
		* One choice — terracotta orange by default, blue or black — is kept in the
		* browser under a key every plugin reads, and painted as two CSS variables on
		* `<body>`, where the Host keeps its own theme variables. A plugin's styles
		* only ever write `var(--cl-accent)` / `var(--cl-accent-ink)`, so changing the
		* colour in any plugin's settings recolours all of them at once.
		*
		* This file is identical in every plugin; change it in all of them together.
		*/
		const ACCENTS = {
			orange: {
				name: "陶土橙",
				accent: "#D97757",
				ink: "#FFFFFF"
			},
			blue: {
				name: "蓝色",
				accent: "#3D63E6",
				ink: "#FFFFFF"
			},
			black: {
				name: "黑色",
				accent: "var(--dsw-alias-label-primary, #1F1E1D)",
				ink: "var(--dsw-alias-bg-base, #FFFFFF)"
			}
		};
		const ACCENT_IDS = Object.keys(ACCENTS);
		const DEFAULT_ACCENT = "orange";
		/** Use these in styles; the fallbacks cover the moment before the first paint. */
		const ACCENT = `var(--cl-accent, ${ACCENTS[DEFAULT_ACCENT].accent})`;
		const ACCENT_INK = `var(--cl-accent-ink, ${ACCENTS[DEFAULT_ACCENT].ink})`;
		const KEY = "copylee.dsh.accent";
		const EVENT = "copylee-dsh-accent";
		function isAccent(value) {
			return typeof value === "string" && Object.hasOwn(ACCENTS, value);
		}
		/** The choice made in this browser, or null while none has been made. */
		function storedAccent() {
			try {
				const stored = localStorage.getItem(KEY);
				return isAccent(stored) ? stored : null;
			} catch {
				return null;
			}
		}
		function readAccent() {
			return storedAccent() ?? "orange";
		}
		function paint() {
			const colors = ACCENTS[readAccent()];
			document.body?.style.setProperty("--cl-accent", colors.accent);
			document.body?.style.setProperty("--cl-accent-ink", colors.ink);
		}
		/** Choose the accent for every plugin. */
		function writeAccent(accent) {
			try {
				localStorage.setItem(KEY, accent);
			} catch {}
			paint();
			window.dispatchEvent(new Event(EVENT));
		}
		/** Paint the current accent and keep it current. Returns the undo for plugin disposal. */
		function installAccent() {
			if (typeof document === "undefined") return () => {};
			paint();
			if (document.body === null) document.addEventListener("DOMContentLoaded", paint, { once: true });
			window.addEventListener(EVENT, paint);
			window.addEventListener("storage", paint);
			return () => {
				window.removeEventListener(EVENT, paint);
				window.removeEventListener("storage", paint);
			};
		}
		function useAccent() {
			const [accent, setAccent] = react.useState(readAccent);
			react.useEffect(() => {
				const sync = () => setAccent(readAccent());
				window.addEventListener(EVENT, sync);
				window.addEventListener("storage", sync);
				return () => {
					window.removeEventListener(EVENT, sync);
					window.removeEventListener("storage", sync);
				};
			}, []);
			return [accent, writeAccent];
		}
		/** A row of round swatches: one of them is always chosen. */
		function AccentPicker({ label = "强调色", hint = "", names }) {
			const [accent, choose] = useAccent();
			const h = react.createElement;
			const name = (id) => names?.[id] ?? ACCENTS[id].name;
			return h("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: 10,
				fontSize: 13,
				flexWrap: "wrap"
			} }, h("span", { style: { fontWeight: 500 } }, label), h("span", {
				role: "radiogroup",
				"aria-label": label,
				style: {
					display: "inline-flex",
					gap: 8
				}
			}, ...ACCENT_IDS.map((id) => h("button", {
				key: id,
				type: "button",
				role: "radio",
				"aria-checked": accent === id,
				"aria-label": name(id),
				title: name(id),
				onClick: () => choose(id),
				style: {
					width: 18,
					height: 18,
					padding: 0,
					borderRadius: "50%",
					cursor: "pointer",
					background: ACCENTS[id].accent,
					border: "2px solid var(--dsw-alias-bg-base, #fff)",
					boxShadow: accent === id ? "0 0 0 2px var(--dsw-alias-label-primary, #1F1E1D)" : "0 0 0 1px var(--dsw-alias-border-l2, rgba(127,127,127,.35))"
				}
			}))), h("span", { style: {
				fontSize: 12,
				color: "var(--dsw-alias-label-tertiary, #888)"
			} }, hint ? `${name(accent)} · ${hint}` : name(accent)));
		}
		//#endregion
		//#region lib/types/client/nav-icon.js
		/**
		* Give the "电脑控制" row in the DSH settings navigation a mouse-pointer icon
		* instead of the shell's fallback gear.
		*
		* `settings.section` registrations only carry `id`, `order` and `label`; the
		* shell picks icons for built-in ids only. So, like dsh-better-sidebar, we mark
		* our own row by its label and let CSS swap the glyph (Lucide mouse-pointer-2,
		* drawn as a currentColor mask so hover / active colors still apply).
		*/
		const MARKER = "data-dsh-computer-use-settings-nav";
		const POINTER_SVG = "%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'/%3E%3C/svg%3E";
		const navIconCss = `
[${MARKER}] > svg:first-child { display: none; }
[${MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,${POINTER_SVG}") center / contain no-repeat;
  mask: url("data:image/svg+xml,${POINTER_SVG}") center / contain no-repeat;
}
`;
		/** Keep the marker on the settings-nav button labelled `label`; returns a disposer. */
		function registerNavIcon(label) {
			const style = document.createElement("style");
			style.setAttribute("data-dsh-computer-use", "nav-icon");
			style.textContent = navIconCss;
			document.head.appendChild(style);
			let disposed = false;
			let frame = 0;
			const sync = () => {
				frame = 0;
				if (disposed) return;
				const dialogs = document.querySelectorAll("[role=\"dialog\"]");
				if (dialogs.length === 0) return;
				for (const dialog of dialogs) for (const button of dialog.querySelectorAll("nav button")) {
					const mine = button.textContent?.trim() === label;
					if (mine && !button.hasAttribute(MARKER)) button.setAttribute(MARKER, "");
					else if (!mine && button.hasAttribute(MARKER)) button.removeAttribute(MARKER);
				}
			};
			sync();
			const observer = new MutationObserver(() => {
				if (frame === 0) frame = requestAnimationFrame(sync);
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			return () => {
				disposed = true;
				if (frame !== 0) cancelAnimationFrame(frame);
				observer.disconnect();
				style.remove();
				document.querySelectorAll(`[${MARKER}]`).forEach((element) => element.removeAttribute(MARKER));
			};
		}
		//#endregion
		//#region lib/types/client/select.js
		const h$2 = react.createElement;
		/** Menu appearance and fixed-position behavior follow dsh-free-search / dsh-proxy. */
		const selectCss = `
.dshcu-select{box-sizing:border-box;width:100%;height:36px;padding:0 12px;display:flex;align-items:center;gap:8px;text-align:left;border:1px solid var(--dsw-alias-border-l4,rgba(127,127,127,.3));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;font:inherit;font-size:13px;cursor:pointer}
.dshcu-select:hover{border-color:var(--dsw-alias-border-l3,#888)}
.dshcu-select:focus-visible,.dshcu-select[aria-expanded=true]{outline:2px solid var(--cl-accent,#D97757);outline-offset:2px}
.dshcu-select:disabled{opacity:.5;cursor:default}
.dshcu-menu{position:fixed;z-index:1100;box-sizing:border-box;padding:4px;overflow-y:auto;overscroll-behavior:contain;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#222);backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-prominent,0 10px 32px rgba(0,0,0,.16),0 0 0 .5px rgba(0,0,0,.1))}
.dshcu-option{display:flex;align-items:center;gap:8px;min-height:34px;padding:6px 8px;box-sizing:border-box;border-radius:var(--dsw-radius-md,8px);font-size:13px;line-height:20px;cursor:pointer;user-select:none}
.dshcu-option[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
`;
		function Select({ options, value, disabled, label, onChange }) {
			const id = react.useId();
			const trigger = react.useRef(null);
			const list = react.useRef(null);
			const [open, setOpen] = react.useState(false);
			const [active, setActive] = react.useState(0);
			const [pos, setPos] = react.useState({});
			const selected = options.findIndex((option) => option.value === value);
			const place = react.useCallback(() => {
				const r = trigger.current?.getBoundingClientRect();
				if (!r) return;
				const below = window.innerHeight - r.bottom - 12;
				const above = r.top - 12;
				const up = below < Math.min(options.length * 34 + 8, 220) && above > below;
				const width = Math.min(Math.max(r.width, 180), 440, window.innerWidth - 16);
				setPos({
					left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
					width,
					maxHeight: Math.max(0, Math.min(360, (up ? above : below) - 4)),
					...up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }
				});
			}, [options.length]);
			const close = (refocus = false) => {
				setOpen(false);
				if (refocus) trigger.current?.focus();
			};
			const choose = (index) => {
				if (!disabled && options[index]) onChange(options[index].value);
				close(true);
			};
			const show = () => {
				if (!disabled) {
					place();
					setActive(Math.max(0, selected));
					setOpen(true);
				}
			};
			react.useEffect(() => {
				if (disabled) setOpen(false);
			}, [disabled]);
			react.useEffect(() => {
				if (!open) return;
				const pointer = (e) => {
					if (!list.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false);
				};
				const scroll = (e) => {
					if (!list.current?.contains(e.target)) place();
				};
				document.addEventListener("pointerdown", pointer, true);
				window.addEventListener("scroll", scroll, true);
				window.addEventListener("resize", place);
				return () => {
					document.removeEventListener("pointerdown", pointer, true);
					window.removeEventListener("scroll", scroll, true);
					window.removeEventListener("resize", place);
				};
			}, [open, place]);
			react.useEffect(() => {
				list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
			}, [active, open]);
			return h$2("div", { style: { minWidth: 0 } }, h$2("button", {
				ref: trigger,
				type: "button",
				className: "dshcu-select",
				disabled,
				role: "combobox",
				"aria-label": label,
				"aria-haspopup": "listbox",
				"aria-expanded": open,
				"aria-controls": open ? `${id}-list` : void 0,
				"aria-activedescendant": open ? `${id}-${active}` : void 0,
				onBlur: () => close(),
				onClick: () => open ? close() : show(),
				onKeyDown: (e) => {
					if (disabled) return;
					if (!open) {
						if ([
							"ArrowDown",
							"ArrowUp",
							"Enter",
							" "
						].includes(e.key)) {
							e.preventDefault();
							show();
						}
					} else if (e.key === "Escape") {
						e.preventDefault();
						close(true);
					} else if (e.key === "Tab") close();
					else if ([
						"ArrowDown",
						"ArrowUp",
						"Home",
						"End"
					].includes(e.key)) {
						e.preventDefault();
						setActive((i) => e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
					} else if (["Enter", " "].includes(e.key)) {
						e.preventDefault();
						choose(active);
					}
				}
			}, h$2("span", { style: {
				flex: 1,
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, options[selected]?.label), h$2("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				"aria-hidden": true,
				style: { transform: open ? "rotate(180deg)" : void 0 }
			}, h$2("path", {
				d: "M4 6l4 4 4-4",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6
			}))), open ? h$2("div", {
				ref: list,
				id: `${id}-list`,
				role: "listbox",
				"aria-label": label,
				className: "dshcu-menu",
				style: pos
			}, ...options.map((option, i) => h$2("div", {
				key: option.value,
				id: `${id}-${i}`,
				role: "option",
				"aria-selected": i === selected,
				"data-index": i,
				"data-active": i === active,
				className: "dshcu-option",
				onPointerMove: () => setActive(i),
				onPointerDown: (e) => e.preventDefault(),
				onClick: () => choose(i)
			}, h$2("span", { style: { flex: 1 } }, option.label), h$2("span", { style: { width: 14 } }, i === selected ? h$2("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				"aria-hidden": true
			}, h$2("path", {
				d: "M3.5 8.5 6.5 11.5 12.5 4.5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})) : null)))) : null);
		}
		//#endregion
		//#region lib/types/client/skills-card.js
		/**
		* "应用技能" card: the per-app notes the agent keeps (see ../skills.ts). The
		* user can read, edit, add and delete them here; built-in skills can be
		* overridden and restored.
		*/
		const SKILLS_ROUTE = "/api/dsh-computer-use/skills";
		const MAX_CHARS = 4e3;
		const h$1 = react.createElement;
		function SkillsCard({ S }) {
			const [skills, setSkills] = react.useState(null);
			const [dir, setDir] = react.useState("");
			const [draft, setDraft] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [note, setNote] = react.useState(null);
			const call = react.useCallback(async (body) => {
				setBusy(true);
				try {
					const result = await (await fetch(SKILLS_ROUTE, body ? {
						method: "POST",
						credentials: "same-origin",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body)
					} : { credentials: "same-origin" })).json();
					if (!result.ok) throw new Error(result.error ?? "请求失败");
					setSkills(result.skills ?? []);
					setDir(result.dir ?? "");
					return true;
				} catch (error) {
					setNote({
						kind: "error",
						text: error.message
					});
					return false;
				} finally {
					setBusy(false);
				}
			}, []);
			react.useEffect(() => {
				call();
			}, [call]);
			const edit = (skill) => {
				setNote(null);
				setDraft({
					id: skill.id,
					app: skill.app,
					match: skill.match.join(", "),
					summary: skill.summary,
					content: skill.content,
					isNew: false
				});
			};
			const save = async () => {
				if (!draft) return;
				setNote(null);
				if (await call({
					op: "save",
					id: draft.isNew ? "" : draft.id,
					app: draft.app,
					match: draft.match,
					summary: draft.summary,
					content: draft.content
				})) {
					setDraft(null);
					setNote({
						kind: "ok",
						text: "已保存"
					});
				}
			};
			const remove = async (skill) => {
				setNote(null);
				if (await call({
					op: "delete",
					id: skill.id
				})) {
					if (draft?.id === skill.id) setDraft(null);
					setNote({
						kind: "ok",
						text: `已删除“${skill.app}”`
					});
				}
			};
			const reset = async (skill) => {
				setNote(null);
				if (await call({
					op: "reset",
					id: skill.id
				})) {
					if (draft?.id === skill.id) setDraft(null);
					setNote({
						kind: "ok",
						text: `已恢复“${skill.app}”的内置版本`
					});
				}
			};
			const row = {
				display: "flex",
				gap: 10,
				alignItems: "center",
				padding: "8px 0",
				borderTop: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18))"
			};
			const small = {
				...S.secondary,
				padding: "4px 10px",
				fontSize: 12
			};
			const tag = {
				fontSize: 11,
				padding: "1px 7px",
				borderRadius: 999,
				border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))",
				color: "var(--dsw-alias-label-tertiary, #888)",
				whiteSpace: "nowrap"
			};
			const invalid = draft !== null && (draft.app.trim() === "" || draft.content.trim() === "" || draft.content.length > MAX_CHARS);
			return h$1("section", { style: S.card }, h$1("h3", { style: S.cardTitle }, "应用技能"), h$1("p", { style: S.hint }, "AI 对各个应用的操作笔记：每个应用一份，AI 摸索清楚一个不熟悉的应用后会自己记下来，以后打开这个应用时自动读取，不占用系统提示。你可以在这里查看、修改、删除或新建。"), skills === null ? h$1("p", { style: S.hint }, busy ? "正在读取…" : "无法读取应用技能。") : skills.length === 0 ? h$1("p", { style: S.hint }, "还没有应用技能。") : h$1("div", null, ...skills.map((skill) => h$1("div", {
				key: skill.id,
				style: row
			}, h$1("div", { style: {
				flex: 1,
				minWidth: 0
			} }, h$1("div", { style: {
				fontSize: 13,
				fontWeight: 600,
				display: "flex",
				gap: 8,
				alignItems: "center"
			} }, skill.app, h$1("span", { style: tag }, skill.source === "builtin" ? "内置" : skill.overrides ? "已修改" : "AI / 自定义")), h$1("div", { style: {
				...S.hint,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, `${skill.summary || "（无摘要）"} · ${skill.content.length} 字`)), h$1("button", {
				type: "button",
				style: small,
				disabled: busy,
				onClick: () => edit(skill)
			}, "查看 / 编辑"), skill.overrides ? h$1("button", {
				type: "button",
				style: small,
				disabled: busy,
				onClick: () => {
					reset(skill);
				}
			}, "恢复内置") : null, h$1("button", {
				type: "button",
				style: small,
				disabled: busy,
				onClick: () => {
					remove(skill);
				}
			}, "删除")))), draft === null ? null : h$1("div", { style: {
				display: "grid",
				gap: 10,
				paddingTop: 4
			} }, h$1("div", { style: S.grid2 }, h$1("label", { style: S.label }, "应用名称", h$1("input", {
				style: S.input,
				value: draft.app,
				disabled: !draft.isNew,
				maxLength: 60,
				placeholder: "如 Obsidian",
				onChange: (e) => setDraft({
					...draft,
					app: e.target.value
				})
			})), h$1("label", { style: S.label }, "匹配的程序（逗号分隔）", h$1("input", {
				style: S.input,
				value: draft.match,
				maxLength: 200,
				placeholder: "如 Obsidian, obsidian.exe",
				onChange: (e) => setDraft({
					...draft,
					match: e.target.value
				})
			}))), h$1("label", { style: S.label }, "摘要", h$1("input", {
				style: S.input,
				value: draft.summary,
				maxLength: 80,
				placeholder: "几个词说明这份技能讲什么",
				onChange: (e) => setDraft({
					...draft,
					summary: e.target.value
				})
			})), h$1("label", { style: S.label }, `内容（${draft.content.length} / ${MAX_CHARS} 字）`, h$1("textarea", {
				style: {
					...S.input,
					minHeight: 200,
					resize: "vertical",
					fontFamily: "inherit",
					lineHeight: 1.55
				},
				value: draft.content,
				placeholder: "- 一条一条写操作规律：入口在哪、快捷键、容易踩的坑",
				onChange: (e) => setDraft({
					...draft,
					content: e.target.value
				})
			})), h$1("div", { style: S.actions }, h$1("button", {
				type: "button",
				style: {
					...S.primary,
					opacity: busy || invalid ? .5 : 1
				},
				disabled: busy || invalid,
				onClick: () => {
					save();
				}
			}, "保存技能"), h$1("button", {
				type: "button",
				style: S.secondary,
				disabled: busy,
				onClick: () => setDraft(null)
			}, "取消"), draft.content.length > MAX_CHARS ? h$1("span", { style: S.error }, "内容过长，请精简") : null)), h$1("div", { style: S.actions }, draft === null ? h$1("button", {
				type: "button",
				style: S.secondary,
				disabled: busy,
				onClick: () => {
					setNote(null);
					setDraft({
						id: "",
						app: "",
						match: "",
						summary: "",
						content: "",
						isNew: true
					});
				}
			}, "新建技能") : null, h$1("button", {
				type: "button",
				style: S.secondary,
				disabled: busy,
				onClick: () => {
					call();
				}
			}, "刷新"), note === null ? null : h$1("span", { style: note.kind === "ok" ? S.ok : S.error }, note.text)), dir ? h$1("p", { style: S.hint }, `保存位置：${dir}（每个应用一个 .md 文件，也可以直接用编辑器改）。删除内置技能后，新建同名技能即可重新启用。`) : null);
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Browser half: the "电脑控制" (Computer use) section in Settings. It reads the
		* plugin's own Loader entry through `remote.settings.describe()` and writes
		* with `remote.settings.mutate()`; every field is volatile, so a save reaches
		* the next action without a restart. Live status and the overlay preview come
		* from the host routes in ../routes.ts.
		*/
		const STATUS_ROUTE = "/api/dsh-computer-use/status";
		const SCREENSHOTS_ROUTE = "/api/dsh-computer-use/screenshots";
		const SCREENSHOTS_CLEAN_ROUTE = "/api/dsh-computer-use/screenshots/clean";
		const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
		const PREVIEW_ROUTE = "/api/dsh-computer-use/preview";
		const h = react.createElement;
		function draftFrom(value) {
			const s = resolveConfig(value);
			return {
				accessMode: s.accessMode,
				blockedApps: s.blockedApps.join("\n"),
				overlay: s.overlay,
				overlayLabel: s.overlayLabel,
				hostWindow: s.hostWindow,
				cardOpacity: s.cardOpacity,
				typingMode: s.typingMode,
				quickSteps: s.quickSteps,
				pauseOnUserInput: s.pauseOnUserInput,
				userIdleMs: String(s.userIdleMs),
				autoScreenshot: s.autoScreenshot,
				settleMs: String(s.settleMs),
				maxLongEdge: String(s.maxLongEdge),
				maxMegapixels: String(Math.round(s.maxPixels / 1e4) / 100),
				jpegQuality: String(s.jpegQuality)
			};
		}
		/** Range-checked numbers; returns field errors keyed by Draft field. */
		function validate(d) {
			const errors = {};
			const check = (key, min, max) => {
				const n = Number(d[key]);
				if (String(d[key]).trim() === "" || !Number.isFinite(n) || n < min || n > max) errors[key] = `${min} – ${max}`;
			};
			check("userIdleMs", 300, 1e4);
			check("settleMs", 0, 5e3);
			check("maxLongEdge", 640, 3840);
			check("maxMegapixels", .3, 8);
			check("jpegQuality", 30, 100);
			return errors;
		}
		function valuesFrom(d) {
			return {
				accessMode: d.accessMode,
				blockedApps: d.blockedApps.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean),
				overlay: d.overlay,
				overlayLabel: d.overlayLabel.trim() || DEFAULTS.overlayLabel,
				hostWindow: d.hostWindow,
				cardOpacity: d.cardOpacity,
				typingMode: d.typingMode,
				quickSteps: d.quickSteps,
				pauseOnUserInput: d.pauseOnUserInput,
				userIdleMs: Math.round(Number(d.userIdleMs)),
				autoScreenshot: d.autoScreenshot,
				settleMs: Math.round(Number(d.settleMs)),
				maxLongEdge: Math.round(Number(d.maxLongEdge)),
				maxPixels: Math.round(Number(d.maxMegapixels) * 1e6),
				jpegQuality: Math.round(Number(d.jpegQuality))
			};
		}
		const S = {
			page: {
				display: "grid",
				gap: 20,
				maxWidth: 880,
				paddingBottom: 32,
				color: "var(--dsw-alias-label-primary, inherit)"
			},
			title: {
				margin: 0,
				fontSize: 20,
				fontWeight: 600
			},
			subtitle: {
				margin: "6px 0 0",
				fontSize: 13,
				lineHeight: 1.6,
				color: "var(--dsw-alias-label-secondary, #666)"
			},
			card: {
				display: "grid",
				gap: 14,
				padding: 16,
				borderRadius: "var(--dsw-radius-lg, 12px)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))"
			},
			cardTitle: {
				margin: 0,
				fontSize: 15,
				fontWeight: 600
			},
			hint: {
				margin: 0,
				fontSize: 12,
				lineHeight: 1.55,
				color: "var(--dsw-alias-label-tertiary, #888)"
			},
			label: {
				display: "grid",
				gap: 6,
				fontSize: 13,
				fontWeight: 500
			},
			grid2: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
				gap: 14
			},
			input: {
				boxSizing: "border-box",
				width: "100%",
				padding: "8px 10px",
				fontSize: 13,
				borderRadius: "var(--dsw-radius-md, 8px)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))",
				background: "transparent",
				color: "inherit"
			},
			toggleRow: {
				display: "flex",
				gap: 12,
				alignItems: "flex-start",
				justifyContent: "space-between"
			},
			toggleText: {
				display: "grid",
				gap: 4,
				fontSize: 13,
				fontWeight: 500
			},
			error: {
				fontSize: 12,
				color: "var(--dsw-alias-state-error-primary, #d33)"
			},
			ok: {
				fontSize: 12,
				color: "var(--dsw-alias-state-success-primary, #2a2)"
			},
			actions: {
				display: "flex",
				gap: 10,
				alignItems: "center",
				flexWrap: "wrap"
			},
			primary: {
				padding: "7px 16px",
				fontSize: 13,
				borderRadius: "var(--dsw-radius-md, 8px)",
				border: `1px solid ${ACCENT}`,
				background: ACCENT,
				color: ACCENT_INK,
				cursor: "pointer"
			},
			secondary: {
				padding: "7px 14px",
				fontSize: 13,
				borderRadius: "var(--dsw-radius-md, 8px)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))",
				background: "transparent",
				color: "inherit",
				cursor: "pointer"
			},
			statusLine: {
				display: "flex",
				gap: 8,
				alignItems: "center",
				fontSize: 13
			},
			dot: {
				width: 8,
				height: 8,
				borderRadius: 4,
				flex: "0 0 auto"
			}
		};
		function Switch({ checked, disabled, label, onChange }) {
			return h("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				disabled,
				onClick: () => onChange(!checked),
				style: {
					flex: "0 0 auto",
					width: 40,
					height: 22,
					borderRadius: 11,
					border: "none",
					padding: 2,
					cursor: disabled ? "default" : "pointer",
					background: checked ? ACCENT : "var(--dsw-alias-border-l3, rgba(127,127,127,.35))",
					opacity: disabled ? .5 : 1,
					transition: "background .15s"
				}
			}, h("span", { style: {
				display: "block",
				width: 18,
				height: 18,
				borderRadius: 9,
				background: checked ? ACCENT_INK : "#fff",
				transform: checked ? "translateX(18px)" : "none",
				transition: "transform .15s"
			} }));
		}
		function ToggleRow({ title, hint, checked, disabled, onChange }) {
			return h("div", { style: S.toggleRow }, h("div", { style: S.toggleText }, title, h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, hint)), h(Switch, {
				checked,
				disabled,
				label: title,
				onChange
			}));
		}
		function NumberField({ label, unit, value, error, disabled, onChange }) {
			return h("label", { style: S.label }, label, h("div", { style: {
				display: "flex",
				gap: 8,
				alignItems: "center"
			} }, h("input", {
				style: S.input,
				inputMode: "decimal",
				value,
				disabled,
				onChange: (e) => onChange(e.target.value)
			}), h("span", { style: {
				...S.hint,
				whiteSpace: "nowrap"
			} }, unit)), error === void 0 ? null : h("span", { style: S.error }, `范围 ${error}`));
		}
		function ComputerUseSection({ ctx }) {
			const [loaded, setLoaded] = react.useState(false);
			const [writable, setWritable] = react.useState(false);
			const [view, setView] = react.useState(void 0);
			const [draft, setDraft] = react.useState(() => draftFrom(void 0));
			const [dirty, setDirty] = react.useState(false);
			const dirtyRef = react.useRef(false);
			dirtyRef.current = dirty;
			const draftRef = react.useRef(draft);
			draftRef.current = draft;
			const [saving, setSaving] = react.useState(false);
			/** The draft whose save failed: not retried until it is edited again. */
			const [failed, setFailed] = react.useState(null);
			const [message, setMessage] = react.useState(null);
			const [status, setStatus] = react.useState(null);
			const [cache, setCache] = react.useState(null);
			const [cacheBusy, setCacheBusy] = react.useState(false);
			const [cacheNote, setCacheNote] = react.useState(null);
			const load = react.useCallback(async (reset) => {
				try {
					const result = await ctx.remote.settings.describe();
					if (!result.ok) throw new Error(result.error.message);
					const found = result.value.namespaces.find((item) => item.ns === ENTRY_ID);
					setWritable(result.value.writable);
					setView(found);
					if (reset || !dirtyRef.current) {
						const stored = draftFrom(found?.value);
						if (reset || JSON.stringify(valuesFrom(stored)) !== JSON.stringify(valuesFrom(draftRef.current))) setDraft(stored);
						setDirty(false);
					}
				} catch (error) {
					setMessage({
						kind: "error",
						text: `读取设置失败：${error.message}`
					});
				} finally {
					setLoaded(true);
				}
			}, [ctx]);
			const refreshStatus = react.useCallback(async () => {
				try {
					const response = await fetch(STATUS_ROUTE, { credentials: "same-origin" });
					setStatus(await response.json());
				} catch {
					setStatus(null);
				}
			}, []);
			const refreshCache = react.useCallback(async () => {
				setCacheBusy(true);
				try {
					const response = await fetch(SCREENSHOTS_ROUTE, { credentials: "same-origin" });
					setCache(await response.json());
				} catch {
					setCache(null);
				} finally {
					setCacheBusy(false);
				}
			}, []);
			const cleanCache = async () => {
				setCacheBusy(true);
				setCacheNote(null);
				try {
					const result = await (await fetch(SCREENSHOTS_CLEAN_ROUTE, {
						method: "POST",
						credentials: "same-origin"
					})).json();
					if (!result.ok) throw new Error(result.error ?? "清理失败");
					setCacheNote({
						kind: "ok",
						text: result.removed ? `已清理 ${result.removed} 张截图` : "没有可清理的截图"
					});
					await refreshCache();
				} catch (error) {
					setCacheNote({
						kind: "error",
						text: `清理失败：${error.message}`
					});
				} finally {
					setCacheBusy(false);
				}
			};
			react.useEffect(() => {
				load(true);
				refreshStatus();
				refreshCache();
				return ctx.remote.$on?.("settings/document-updated", (ns) => {
					if (ns === "copylee-computer-use") {
						load(false);
						refreshStatus();
					}
				}) ?? void 0;
			}, [
				ctx,
				load,
				refreshStatus
			]);
			const edit = (key, value) => {
				setDraft((previous) => ({
					...previous,
					[key]: value
				}));
				setDirty(true);
				setMessage(null);
			};
			const errors = validate(draft);
			const invalid = Object.keys(errors).length > 0;
			const disabled = !writable || view === void 0;
			const save = async () => {
				if (view === void 0 || invalid) return;
				setSaving(true);
				const saved = draft;
				try {
					const values = valuesFrom(saved);
					const result = await ctx.remote.settings.mutate(ENTRY_ID, Object.entries(values).map(([key, value]) => ({
						op: "set",
						path: [key],
						value
					})), view.revision);
					if (!result.ok) throw new Error(result.error.message);
					setMessage({
						kind: "ok",
						text: "已自动保存，下一步操作即生效"
					});
					if (draftRef.current === saved) {
						dirtyRef.current = false;
						setDirty(false);
					}
					await load(false);
					refreshStatus();
				} catch (error) {
					setFailed(saved);
					setMessage({
						kind: "error",
						text: `保存失败：${error.message}`
					});
				} finally {
					setSaving(false);
				}
			};
			react.useEffect(() => {
				if (!dirty || invalid || disabled || saving || failed === draft) return;
				const timer = setTimeout(() => {
					save();
				}, 500);
				return () => clearTimeout(timer);
			}, [
				draft,
				dirty,
				invalid,
				disabled,
				saving,
				failed
			]);
			const preview = async () => {
				try {
					const response = await fetch(PREVIEW_ROUTE, {
						method: "POST",
						credentials: "same-origin"
					});
					if (response.status === 409) setMessage({
						kind: "error",
						text: "AI 正在操控电脑，暂时不能预览"
					});
					else if (!response.ok) setMessage({
						kind: "error",
						text: "预览失败"
					});
				} catch {
					setMessage({
						kind: "error",
						text: "预览失败"
					});
				}
			};
			if (!loaded) return h("div", { style: S.page }, "加载中…");
			const primary = status?.displays.find((d) => d.primary) ?? status?.displays[0];
			const helperOk = status?.helper === "ready";
			return h("div", { style: S.page }, h("style", null, selectCss), h("div", null, h("h2", { style: S.title }, "电脑控制"), h("p", { style: S.subtitle }, "让 AI 看屏幕、点鼠标、敲键盘操控这台 Windows 电脑。操控时屏幕四周泛起橙色光晕；按 Esc 暂停 / 继续，点提示条上的“停止”结束本轮。")), view === void 0 ? h("div", { style: S.error }, "没有找到本插件的设置项（插件可能未启用）。") : null, view !== void 0 && !writable ? h("div", { style: S.error }, "当前设置为只读。") : null, h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "运行状态"), h("div", { style: S.statusLine }, h("span", { style: {
				...S.dot,
				background: status === null ? "#999" : helperOk ? "#2a2" : "#d33"
			} }), status === null ? "无法获取状态" : helperOk ? status.controlling ? "正在操控电脑" : "就绪" : `控制组件不可用：${status.error ?? ""}`), primary ? h("p", { style: S.hint }, `主屏幕 ${primary.width}×${primary.height}（${Math.round(primary.dpi / 96 * 100)}% 缩放），发给模型的截图为 ${primary.shot.width}×${primary.shot.height}。`) : null, status && status.displays.length > 1 ? h("p", { style: S.hint }, `共 ${status.displays.length} 块显示器，模型可用 switch_display 切换。`) : null, h("div", { style: S.actions }, h("button", {
				type: "button",
				style: S.secondary,
				onClick: () => {
					preview();
				}
			}, "预览效果"), h("button", {
				type: "button",
				style: S.secondary,
				onClick: () => {
					refreshStatus();
				}
			}, "刷新状态"), h("span", { style: S.hint }, "预览 4 秒：按已保存的设置显示光晕，以及迷你进度卡片或提示条。"))), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "授权"), h("div", { style: S.label }, "授权方式", h(Select, {
				label: "授权方式",
				disabled,
				value: draft.accessMode,
				options: [{
					value: "per-app",
					label: "按应用授权（每个会话由你批准要操控的应用）"
				}, {
					value: "allow-all",
					label: "全部允许（不弹审批）"
				}],
				onChange: (value) => edit("accessMode", value)
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, "会话权限为“完全权限”或“自动审查”时不弹审批，按应用授权会自动批准。无论哪种方式，DeepSeek Harness 自己的窗口都不会被操作。")), h("label", { style: S.label }, "禁止操控的应用", h("textarea", {
				style: {
					...S.input,
					minHeight: 72,
					resize: "vertical"
				},
				value: draft.blockedApps,
				disabled,
				spellCheck: false,
				placeholder: "每行一个，名称或 exe，例如：\nalipay\n网银助手",
				onChange: (e) => edit("blockedApps", e.target.value)
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, "1Password、Bitwarden、KeePass 等常见密码管理器始终禁止。"))), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "操控时的显示"), h(ToggleRow, {
				title: "橙色光晕与提示条",
				hint: "不会出现在模型看到的截图里。",
				checked: draft.overlay,
				disabled,
				onChange: (value) => edit("overlay", value)
			}), h("div", { style: S.grid2 }, h("label", { style: S.label }, "提示条名称", h("input", {
				style: S.input,
				value: draft.overlayLabel,
				disabled,
				maxLength: 40,
				onChange: (e) => edit("overlayLabel", e.target.value)
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, `显示为“${draft.overlayLabel.trim() || DEFAULTS.overlayLabel} 正在操控你的电脑”`)), h("div", { style: S.label }, "DeepSeek Harness 窗口", h(Select, {
				label: "DeepSeek Harness 窗口",
				disabled,
				value: draft.hostWindow,
				options: [
					{
						value: "pet",
						label: "迷你进度卡片（推荐）"
					},
					{
						value: "card",
						label: "缩成右下角置顶悬浮卡片"
					},
					{
						value: "minimize",
						label: "最小化"
					},
					{
						value: "keep",
						label: "保持不变"
					}
				],
				onChange: (value) => edit("hostWindow", value)
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, draft.hostWindow === "pet" ? "DSH 最小化，右下角显示迷你卡片：一行滚动显示回复正文，一行显示思考和工具调用；可拖动，有暂停 / 停止按钮。结束后自动恢复。" : "操控结束后自动恢复原尺寸和位置。")), h("div", { style: S.label }, "悬浮卡片透明度", h(Select, {
				label: "悬浮卡片透明度",
				disabled: disabled || draft.hostWindow !== "card" && draft.hostWindow !== "pet",
				value: String(draft.cardOpacity),
				options: [
					{
						value: "100",
						label: "不透明"
					},
					{
						value: "90",
						label: "90%"
					},
					{
						value: "80",
						label: "80%（默认）"
					},
					{
						value: "70",
						label: "70%"
					},
					{
						value: "60",
						label: "60%"
					},
					{
						value: "50",
						label: "50%：最通透"
					}
				],
				onChange: (value) => edit("cardOpacity", Number(value))
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, "半透明卡片可以透过它看清下面的操作过程；鼠标停在卡片上会变回不透明，方便阅读和点击。AI 的截图本来就看不到卡片。")), h("div", { style: S.label }, "文字输入方式", h(Select, {
				label: "文字输入方式",
				disabled,
				value: draft.typingMode,
				options: [
					{
						value: "stream",
						label: "流式：长文本逐段出现（推荐）"
					},
					{
						value: "type",
						label: "逐字输入：像人打字，最慢"
					},
					{
						value: "paste",
						label: "一次粘贴：最快"
					}
				],
				onChange: (value) => edit("typingMode", value)
			}), h("span", { style: {
				...S.hint,
				fontWeight: 400
			} }, "短文字都会逐字打出来。长文本逐字输入在 Typora、Obsidian、Word 等编辑器里可能被自动补全括号、自动续列表打乱；流式按段落粘贴，既看得到过程又不会乱。")))), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "速度"), h(ToggleRow, {
				title: "操作时不深度思考（Beta）",
				hint: "试验功能，一般不用开。开始操作电脑后，本轮改用模型的最低思考强度，每一步快约 1 秒；任务开头的规划和之后的对话仍按会话里选的思考强度。代价：不思考时模型更容易出错、多走几步，本轮的回复文字会整段出现而不是逐字流出。目前只在 DeepSeek 官方模型上有效。",
				checked: draft.quickSteps,
				disabled,
				onChange: (value) => edit("quickSteps", value)
			})), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "让出控制"), h(ToggleRow, {
				title: "检测到你在操作时暂停",
				hint: "你用键盘打字时 AI 等你停手；你切换了窗口时 AI 先重新看屏幕。鼠标移动不会触发。",
				checked: draft.pauseOnUserInput,
				disabled,
				onChange: (value) => edit("pauseOnUserInput", value)
			}), h("div", { style: S.grid2 }, h(NumberField, {
				label: "停手多久后继续",
				unit: "毫秒",
				value: draft.userIdleMs,
				error: errors.userIdleMs,
				disabled: disabled || !draft.pauseOnUserInput,
				onChange: (value) => edit("userIdleMs", value)
			}))), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "截图"), h(ToggleRow, {
				title: "操作后自动回传截图",
				hint: "省去模型再截一次图的一轮调用；关闭可省 token。",
				checked: draft.autoScreenshot,
				disabled,
				onChange: (value) => edit("autoScreenshot", value)
			}), h("div", { style: S.grid2 }, h(NumberField, {
				label: "操作后至少等待（之后画面静止即截图，最多约 2.5 秒）",
				unit: "毫秒",
				value: draft.settleMs,
				error: errors.settleMs,
				disabled,
				onChange: (value) => edit("settleMs", value)
			}), h(NumberField, {
				label: "截图最长边",
				unit: "像素",
				value: draft.maxLongEdge,
				error: errors.maxLongEdge,
				disabled,
				onChange: (value) => edit("maxLongEdge", value)
			}), h(NumberField, {
				label: "截图总像素上限",
				unit: "百万像素",
				value: draft.maxMegapixels,
				error: errors.maxMegapixels,
				disabled,
				onChange: (value) => edit("maxMegapixels", value)
			}), h(NumberField, {
				label: "JPEG 质量",
				unit: "30–100",
				value: draft.jpegQuality,
				error: errors.jpegQuality,
				disabled,
				onChange: (value) => edit("jpegQuality", value)
			})), h("p", { style: S.hint }, "截图越大越清晰、点得越准，但每张图消耗的 token 也越多。默认值（最长边 1366、1.15 百万像素）适合大多数模型。")), h(SkillsCard, { S }), h("section", { style: S.card }, h("h3", { style: S.cardTitle }, "截图缓存"), h("p", { style: S.hint }, cache === null ? cacheBusy ? "正在统计…" : "无法统计截图缓存。" : !cache.ok ? `统计失败：${cache.error ?? ""}` : `本插件的截图共 ${cache.count} 张，占用 ${mb(cache.bytes)}；其中 ${cache.orphans} 张（${mb(cache.orphanBytes)}）所属会话已删除，可以安全清理。`), h("p", { style: S.hint }, "截图作为附件保存在会话历史里。仍在会话中的截图不会被删除：删除后继续那个会话会直接报错。删除会话后，它留下的截图会在启动 DeepSeek Harness 几分钟后及之后每 12 小时自动清理，也可以在这里立即清理。"), h("div", { style: S.actions }, h("button", {
				type: "button",
				style: {
					...S.secondary,
					opacity: cacheBusy || !cache?.orphans ? .5 : 1
				},
				disabled: cacheBusy || !cache?.orphans,
				onClick: () => {
					cleanCache();
				}
			}, "清理已删除会话的截图"), h("button", {
				type: "button",
				style: S.secondary,
				disabled: cacheBusy,
				onClick: () => {
					refreshCache();
				}
			}, cacheBusy ? "统计中…" : "重新统计"), cacheNote === null ? null : h("span", { style: cacheNote.kind === "ok" ? S.ok : S.error }, cacheNote.text))), h("div", { style: S.actions }, h("button", {
				type: "button",
				style: S.secondary,
				disabled,
				onClick: () => {
					setDraft(draftFrom({}));
					setDirty(true);
					setMessage(null);
				}
			}, "恢复默认"), saving ? h("span", { style: S.hint }, "保存中…") : dirty && invalid ? h("span", { style: S.error }, "有数值超出范围，改好后自动保存") : failed === draft && dirty ? h("button", {
				type: "button",
				style: S.secondary,
				onClick: () => {
					setFailed(null);
				}
			}, "重试保存") : null, message === null || dirty && invalid ? null : h("span", { style: message.kind === "ok" ? S.ok : S.error }, message.text)), h(AccentPicker, null));
		}
		const inject = [
			"slots",
			"remote",
			"remote.settings"
		];
		function apply(ctx) {
			ctx.effect(() => installAccent(), "computer-use: accent colour");
			ctx.effect(() => registerNavIcon("电脑控制"), "computer-use: settings nav icon");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: ENTRY_ID,
				order: 61,
				label: () => "电脑控制"
			}, () => h(ComputerUseSection, { ctx })));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
