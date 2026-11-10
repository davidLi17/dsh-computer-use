import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import * as zlib from "node:zlib";
import { Context, Service } from "@deepseek-ai/cordis";
//#region lib/types/access.js
/**
* Per-session application grants, modelled on Claude's computer use: the
* model asks for named apps with request_access, the user approves through
* DSH's own approval prompt, and input is only delivered to granted apps.
* The DSH window itself and configured blocked apps are never controllable.
*/
/** The DSH desktop host: the agent must never type into its own chat. */
const HOST_EXES = ["deepseek harness.exe"];
/** Common Chinese / product names → executable base names. */
const ALIASES = {
	"记事本": ["notepad"],
	"notepad": ["notepad"],
	"计算器": [
		"calculatorapp",
		"calc",
		"applicationframehost"
	],
	"calculator": [
		"calculatorapp",
		"calc",
		"applicationframehost"
	],
	"画图": ["mspaint"],
	"paint": ["mspaint"],
	"文件资源管理器": ["explorer"],
	"资源管理器": ["explorer"],
	"文件管理器": ["explorer"],
	"file explorer": ["explorer"],
	"finder": ["explorer"],
	"任务栏": ["explorer"],
	"桌面": ["explorer"],
	"desktop": ["explorer"],
	"taskbar": ["explorer"],
	"开始菜单": ["startmenuexperiencehost", "searchhost"],
	"start menu": ["startmenuexperiencehost", "searchhost"],
	"设置": ["systemsettings", "applicationframehost"],
	"settings": ["systemsettings", "applicationframehost"],
	"谷歌浏览器": ["chrome"],
	"google chrome": ["chrome"],
	"chrome": ["chrome"],
	"edge": ["msedge"],
	"microsoft edge": ["msedge"],
	"浏览器": [
		"chrome",
		"msedge",
		"firefox"
	],
	"firefox": ["firefox"],
	"火狐": ["firefox"],
	"微信": ["weixin", "wechat"],
	"wechat": ["weixin", "wechat"],
	"qq": ["qq"],
	"钉钉": ["dingtalk"],
	"飞书": ["feishu", "lark"],
	"vs code": ["code"],
	"vscode": ["code"],
	"visual studio code": ["code"],
	"终端": ["windowsterminal", "wt"],
	"terminal": ["windowsterminal", "wt"],
	"windows terminal": ["windowsterminal"],
	"powershell": ["powershell", "pwsh"],
	"命令提示符": ["cmd"],
	"cmd": ["cmd"],
	"word": ["winword"],
	"excel": ["excel"],
	"powerpoint": ["powerpnt"],
	"ppt": ["powerpnt"],
	"outlook": ["outlook", "olk"],
	"wps": [
		"wps",
		"et",
		"wpp"
	],
	"任务管理器": ["taskmgr"],
	"task manager": ["taskmgr"],
	"截图工具": ["snippingtool"],
	"snipping tool": ["snippingtool"],
	"照片": ["photos", "applicationframehost"],
	"photos": ["photos"]
};
const DEFAULT_BLOCKED = [
	"1password",
	"bitwarden",
	"keepass",
	"keepassxc",
	"lastpass",
	"dashlane",
	"enpass",
	"nordpass",
	"proton pass"
];
function normalizeApp(name) {
	return name.trim().toLowerCase().replace(/\.exe$/, "").replace(/\s+/g, " ");
}
function exeBase(win) {
	return normalizeApp(win.exe.split(/[\\/]/).pop() ?? "");
}
/** Executable names an app name stands for (UWP's shared frame host excluded). */
function exeNames(name) {
	const n = normalizeApp(name);
	return new Set([n.replace(/\s/g, ""), ...ALIASES[n] ?? []].filter((exe) => exe !== "applicationframehost"));
}
/** Do two app names refer to the same program ("explorer" and "文件资源管理器")? */
function sameApp(a, b) {
	const x = exeNames(a);
	for (const exe of exeNames(b)) if (x.has(exe)) return true;
	return false;
}
/**
* Windows shell surfaces that grab the foreground without being a place to
* work: the touch-keyboard / IME host and Snap Assist.
*/
function isTransientShell(win) {
	const exe = win.exe.toLowerCase();
	if (exe === "textinputhost.exe" || exe === "cu-helper.exe") return true;
	return exe === "explorer.exe" && (win.className === "XamlExplorerHostIslandWindow" || /贴靠助手|snap assist/i.test(win.title));
}
function isHostWindow(win) {
	return HOST_EXES.includes(win.exe.toLowerCase());
}
/** Does a granted (or requested) app name refer to this window? */
function appMatches(name, win) {
	const g = normalizeApp(name);
	const exe = exeBase(win);
	if (g === "" || exe === "") return false;
	const compactG = g.replace(/\s/g, "");
	if (exe === g || exe === compactG) return true;
	const aliases = ALIASES[g];
	if (aliases?.includes(exe) && exe !== "applicationframehost") return true;
	if (exe.length >= 3 && compactG.includes(exe)) return true;
	if (compactG.length >= 3 && exe.includes(compactG)) return true;
	if (exe === "applicationframehost") {
		const title = win.title.toLowerCase();
		return title.includes(g) || (aliases?.some((alias) => title.includes(alias)) ?? false);
	}
	return false;
}
var AccessControl = class {
	grants = /* @__PURE__ */ new Map();
	grant(session, names) {
		let set = this.grants.get(session);
		if (!set) this.grants.set(session, set = /* @__PURE__ */ new Set());
		const added = [];
		for (const name of names) {
			const n = normalizeApp(name);
			if (n && !set.has(n)) {
				set.add(n);
				added.push(n);
			}
		}
		return added;
	}
	granted(session) {
		return [...this.grants.get(session) ?? []];
	}
	isGranted(session, win) {
		return this.granted(session).some((name) => appMatches(name, win));
	}
	/** Names from `names` the session has not been granted yet (aliases count). */
	missing(session, names) {
		const set = this.grants.get(session) ?? /* @__PURE__ */ new Set();
		return names.filter((name) => !set.has(normalizeApp(name)) && ![...set].some((granted) => sameApp(granted, name)));
	}
	forget(session) {
		this.grants.delete(session);
	}
	/**
	* Why input may not go to `win`, or undefined when it may. `action` is a
	* short verb for the message ("click", "type into").
	*/
	denial(session, win, mode, blocked, action) {
		if (!win || win.exe === "") return void 0;
		const label = `${win.exe}${win.title ? ` ("${win.title.slice(0, 60)}")` : ""}`;
		if (isHostWindow(win)) return `Refused to ${action} ${label}: that is the DeepSeek Harness window you are chatting through. Bring the target app to the front first (open_application or windows focus), or minimize DeepSeek Harness.`;
		if ([...DEFAULT_BLOCKED, ...blocked].some((name) => appMatches(name, win))) return `Refused to ${action} ${label}: this app is blocked for computer use in the plugin settings. Ask the user to do this step themselves.`;
		if (mode === "allow-all" || this.isGranted(session, win)) return void 0;
		return `Refused to ${action} ${label}: the app is not granted for this session. Call request_access with this app's name first (granted so far: ${this.granted(session).join(", ") || "none"}).`;
	}
};
//#endregion
//#region lib/types/coords.js
/**
* The model only ever sees one coordinate space: pixels of the most recent
* screenshot of the current display. The plugin owns the conversion to
* physical virtual-screen pixels, so the model never does scale arithmetic.
*/
/** Screenshot size for a display: fit both limits, keep aspect, never upscale. */
function screenshotSize(display, limits) {
	const { width, height } = display;
	let scale = Math.min(1, limits.maxLongEdge / Math.max(width, height));
	if (width * height * scale * scale > limits.maxPixels) scale = Math.sqrt(limits.maxPixels / (width * height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}
/** Screenshot pixels → physical virtual-screen pixels. Throws when outside the image. */
function toPhysical(point, display, shot) {
	const { x, y } = point;
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Coordinates must be numbers.");
	if (x < 0 || y < 0 || x > shot.width || y > shot.height) throw new Error(`Coordinate (${x}, ${y}) is outside the screenshot (${shot.width}x${shot.height}). Use coordinates from the latest screenshot.`);
	const px = display.x + Math.round(x * display.width / shot.width);
	const py = display.y + Math.round(y * display.height / shot.height);
	return {
		x: Math.min(display.x + display.width - 1, px),
		y: Math.min(display.y + display.height - 1, py)
	};
}
/** Physical virtual-screen pixels → screenshot pixels (may fall outside for other displays). */
function toScreenshot(point, display, shot) {
	return {
		x: Math.round((point.x - display.x) * shot.width / display.width),
		y: Math.round((point.y - display.y) * shot.height / display.height)
	};
}
/** Screenshot-space region [x1, y1, x2, y2] → physical rect clamped to the display. */
function regionToPhysical(region, display, shot) {
	if (region.length !== 4) throw new Error("region must be [x1, y1, x2, y2].");
	const [x1, y1, x2, y2] = region;
	const a = toPhysical({
		x: Math.min(x1, x2),
		y: Math.min(y1, y2)
	}, display, shot);
	const b = toPhysical({
		x: Math.max(x1, x2),
		y: Math.max(y1, y2)
	}, display, shot);
	const width = b.x - a.x;
	const height = b.y - a.y;
	if (width < 4 || height < 4) throw new Error("region is too small; give a box at least a few pixels wide.");
	return {
		x: a.x,
		y: a.y,
		width,
		height
	};
}
/** Is a physical point on this display? */
function contains$1(display, point) {
	return point.x >= display.x && point.y >= display.y && point.x < display.x + display.width && point.y < display.y + display.height;
}
//#endregion
//#region lib/types/keys.js
/**
* xdotool-style key names (what the Anthropic computer tool and most models
* emit: "ctrl+shift+t", "Return", "super", "F5") mapped to Windows virtual-key
* codes. One combo is a list of VKs pressed in order and released in reverse.
*/
const NAMED = {
	ctrl: 17,
	control: 17,
	lctrl: 162,
	rctrl: 163,
	control_l: 162,
	control_r: 163,
	shift: 16,
	lshift: 160,
	rshift: 161,
	shift_l: 160,
	shift_r: 161,
	alt: 18,
	menu: 18,
	lalt: 164,
	ralt: 165,
	alt_l: 164,
	alt_r: 165,
	option: 18,
	altgr: 165,
	win: 91,
	super: 91,
	meta: 91,
	cmd: 91,
	command: 91,
	windows: 91,
	super_l: 91,
	super_r: 92,
	lwin: 91,
	rwin: 92,
	return: 13,
	enter: 13,
	kp_enter: 13,
	tab: 9,
	iso_left_tab: 9,
	space: 32,
	spacebar: 32,
	backspace: 8,
	back: 8,
	delete: 46,
	del: 46,
	insert: 45,
	ins: 45,
	escape: 27,
	esc: 27,
	home: 36,
	end: 35,
	pageup: 33,
	page_up: 33,
	prior: 33,
	pgup: 33,
	pagedown: 34,
	page_down: 34,
	next: 34,
	pgdn: 34,
	left: 37,
	up: 38,
	right: 39,
	down: 40,
	arrowleft: 37,
	arrowup: 38,
	arrowright: 39,
	arrowdown: 40,
	capslock: 20,
	caps_lock: 20,
	numlock: 144,
	num_lock: 144,
	scrolllock: 145,
	scroll_lock: 145,
	print: 44,
	printscreen: 44,
	print_screen: 44,
	prtsc: 44,
	pause: 19,
	break: 19,
	apps: 93,
	contextmenu: 93,
	context_menu: 93,
	volumeup: 175,
	audioraisevolume: 175,
	xf86audioraisevolume: 175,
	volumedown: 174,
	audiolowervolume: 174,
	xf86audiolowervolume: 174,
	volumemute: 173,
	audiomute: 173,
	xf86audiomute: 173,
	medianext: 176,
	audionext: 176,
	xf86audionext: 176,
	mediaprev: 177,
	audioprev: 177,
	xf86audioprev: 177,
	mediaplaypause: 179,
	audioplay: 179,
	xf86audioplay: 179,
	playpause: 179,
	browserback: 166,
	browserforward: 167,
	browserrefresh: 168,
	kp_0: 96,
	kp_1: 97,
	kp_2: 98,
	kp_3: 99,
	kp_4: 100,
	kp_5: 101,
	kp_6: 102,
	kp_7: 103,
	kp_8: 104,
	kp_9: 105,
	kp_multiply: 106,
	kp_add: 107,
	kp_subtract: 109,
	kp_decimal: 110,
	kp_divide: 111,
	minus: 189,
	equal: 187,
	equals: 187,
	plus: 187,
	comma: 188,
	period: 190,
	dot: 190,
	slash: 191,
	backslash: 220,
	semicolon: 186,
	apostrophe: 222,
	quote: 222,
	grave: 192,
	backquote: 192,
	tilde: 192,
	bracketleft: 219,
	bracketright: 221,
	leftbracket: 219,
	rightbracket: 221
};
const PUNCT = {
	"-": 189,
	"=": 187,
	"+": 187,
	",": 188,
	".": 190,
	"/": 191,
	"\\": 220,
	";": 186,
	"'": 222,
	"`": 192,
	"[": 219,
	"]": 221
};
/** One key name to a VK code, or undefined when unknown. */
function keyCode(name) {
	if (name.length === 1) {
		const ch = name.toUpperCase();
		if (/[A-Z0-9]/.test(ch)) return ch.charCodeAt(0);
		return PUNCT[name];
	}
	const lower = name.toLowerCase();
	const fn = /^f([1-9]|1\d|2[0-4])$/.exec(lower);
	if (fn) return 111 + Number(fn[1]);
	return NAMED[lower] ?? NAMED[lower.replace(/[\s-]/g, "_")] ?? NAMED[lower.replace(/[\s_-]/g, "")];
}
/**
* Parse "ctrl+shift+t" or a space-separated sequence "ctrl+a Delete" into
* combos. A lone "+" is the plus key. Throws with the unknown name.
*/
function parseKeys(text) {
	const combos = [];
	const joined = text.trim().replace(/\b(page|print|caps|num|scroll)\s+(up|down|screen|lock)\b/gi, "$1$2");
	for (const chord of joined.split(/\s+/).filter(Boolean)) {
		const parts = chord === "+" ? ["+"] : chord.split(/(?<!^)\+(?!$)/);
		const combo = [];
		for (const part of parts) {
			const code = keyCode(part);
			if (code === void 0) throw new Error(`Unknown key "${part}" in "${chord}". Use names like ctrl, shift, alt, super, Return, Tab, Escape, Delete, Up, F5, a, 1.`);
			combo.push(code);
		}
		if (combo.length > 0) combos.push(combo);
	}
	if (combos.length === 0) throw new Error("No key given.");
	return combos;
}
/** Modifier names accepted by the `modifiers` parameter of click/scroll actions. */
function parseModifiers(text) {
	if (text === void 0 || text.trim() === "") return [];
	return parseKeys(text.replace(/\s+/g, "")).flat();
}
//#endregion
//#region lib/types/target.js
/**
* Finding a control by what it says instead of where it is. A batch can then
* act on things that were not on screen in the model's last screenshot (the
* item of a menu it is about to open, the button of a dialog about to appear),
* which is what lets one call cover a whole sequence.
*/
/** Words a model may put before the colon, and the control types they stand for. */
const ROLES = {
	button: ["Button", "SplitButton"],
	按钮: ["Button", "SplitButton"],
	menu: ["MenuItem", "Menu"],
	menuitem: ["MenuItem"],
	菜单: ["MenuItem", "Menu"],
	菜单项: ["MenuItem"],
	edit: ["Edit", "Document"],
	input: ["Edit", "Document"],
	textbox: ["Edit", "Document"],
	输入框: ["Edit", "Document"],
	文本框: ["Edit", "Document"],
	tab: ["TabItem"],
	标签: ["TabItem"],
	标签页: ["TabItem"],
	选项卡: ["TabItem"],
	link: ["Hyperlink"],
	链接: ["Hyperlink"],
	checkbox: ["CheckBox"],
	复选框: ["CheckBox"],
	radio: ["RadioButton"],
	单选: ["RadioButton"],
	单选框: ["RadioButton"],
	combo: ["ComboBox"],
	combobox: ["ComboBox"],
	下拉框: ["ComboBox"],
	item: [
		"ListItem",
		"TreeItem",
		"DataItem"
	],
	listitem: ["ListItem"],
	列表项: ["ListItem", "DataItem"],
	treeitem: ["TreeItem"],
	text: ["Text"],
	文本: ["Text"],
	文字: ["Text"]
};
/** "按钮:保存" → Button named 保存; a colon that is not after a known role stays part of the name.
*  "id:NavTasksButton" / "#NavTasksButton" → match the UIA AutomationId instead of the name. */
function parseTarget(target) {
	const text = target.trim();
	if (text.startsWith("#") && text.length > 1) return {
		automationId: text.slice(1).trim(),
		name: text
	};
	const byId = /^(?:id|automationid|自动化id)\s*[:：]\s*(.+)$/i.exec(text);
	if (byId) return {
		automationId: byId[1].trim(),
		name: text
	};
	const colon = text.search(/[:：]/);
	if (colon > 0) {
		const roles = ROLES[text.slice(0, colon).trim().toLowerCase().replace(/[\s_-]/g, "")];
		const name = text.slice(colon + 1).trim();
		if (roles && name !== "") return {
			role: roles[0],
			roles,
			name
		};
	}
	return { name: text };
}
/**
* Names as people read them: without the accelerator ("保存(S)", "&File"),
* the trailing ellipsis of commands that open a dialog, and case.
*/
function normalizeName(name) {
	return name.replace(/\s*[(（]&?[A-Za-z0-9][)）]/g, "").replace(/&(?=\S)/g, "").replace(/(\.{3}|…)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}
const center = (el) => `${Math.round(el.x + el.width / 2)},${Math.round(el.y + el.height / 2)}`;
/**
* Pick the element a target means. An exact name beats a name that starts with
* the text, which beats one that merely contains it; within the best tier,
* enabled controls beat disabled ones and real controls beat static text.
* Several different places left after that is an ambiguity, not a guess.
*/
function matchTarget(elements, target) {
	const query = parseTarget(target);
	if (query.automationId) {
		const wantedId = query.automationId;
		const exact = elements.filter((el) => (el.automationId ?? "") === wantedId);
		const matches = exact.length > 0 ? exact : elements.filter((el) => (el.automationId ?? "").toLowerCase() === wantedId.toLowerCase());
		if (matches.length === 1) return {
			kind: "found",
			element: matches[0]
		};
		if (matches.length > 1) return {
			kind: "ambiguous",
			candidates: matches.slice(0, 8)
		};
	}
	const wanted = normalizeName(query.name);
	if (wanted === "") return {
		kind: "missing",
		suggestions: []
	};
	const pool = query.roles ? elements.filter((el) => query.roles.includes(el.role)) : elements;
	const tiers = [
		[],
		[],
		[]
	];
	for (const el of pool) {
		const name = normalizeName(el.name);
		if (name === "") continue;
		if (name === wanted) tiers[0].push(el);
		else if (name.startsWith(wanted)) tiers[1].push(el);
		else if (name.includes(wanted)) tiers[2].push(el);
	}
	let best = tiers.find((tier) => tier.length > 0);
	if (!best) return {
		kind: "missing",
		suggestions: suggest(elements, wanted)
	};
	const enabled = best.filter((el) => !el.disabled);
	if (enabled.length > 0) best = enabled;
	const controls = best.filter((el) => el.role !== "Text");
	if (controls.length > 0) best = controls;
	const places = /* @__PURE__ */ new Map();
	for (const el of best) if (!places.has(center(el))) places.set(center(el), el);
	const unique = [...places.values()].filter((el, _index, all) => !all.some((other) => other !== el && contains(other, el)));
	if (unique.length === 1) return {
		kind: "found",
		element: unique[0]
	};
	return {
		kind: "ambiguous",
		candidates: unique.slice(0, 8)
	};
}
/** `outer` strictly encloses `inner`: keep the inner, more specific one. */
function contains(inner, outer) {
	return outer !== inner && outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height && (outer.width > inner.width || outer.height > inner.height);
}
/** Names worth offering when nothing matched: those sharing characters first, then whatever is there. */
function suggest(elements, wanted) {
	const names = [...new Set(elements.filter((el) => el.role !== "Text" && el.name.trim() !== "").map((el) => el.name.trim()))];
	const chars = new Set(wanted);
	const score = (name) => [...new Set(normalizeName(name))].filter((char) => chars.has(char)).length;
	return names.sort((a, b) => score(b) - score(a)).slice(0, 12);
}
//#endregion
//#region lib/types/text.js
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
function splitBlocks(text, minChars = 80) {
	const lines = text.split(/(?<=\n)/);
	const byLine = !/\n[ \t]*\r?\n/.test(text) && !/^\s*(```|~~~|\|)/m.test(text);
	const blocks = [];
	let current = "";
	let fence;
	let previousBlank = false;
	for (const line of lines) {
		const bare = line.replace(/\r?\n$/, "");
		const marker = /^\s*(```+|~~~+)/.exec(bare)?.[1];
		if (marker !== void 0) {
			if (fence === void 0) fence = marker[0].repeat(marker.length);
			else if (marker.startsWith(fence)) fence = void 0;
		}
		const blank = bare.trim() === "";
		if (fence === void 0 && !blank && (previousBlank || byLine && current !== "") && current.length >= minChars) {
			blocks.push(current);
			current = "";
		}
		current += line;
		if (marker === void 0 || fence !== void 0) previousBlank = blank && fence === void 0;
		else previousBlank = false;
	}
	if (current !== "") blocks.push(current);
	return blocks;
}
/** Pieces of at most ~`size` characters, broken after whitespace where possible (for paced typing). */
function typingPieces(text, size = 60) {
	const out = [];
	let rest = text;
	while (rest.length > size) {
		let cut = Math.max(rest.lastIndexOf(" ", size), rest.lastIndexOf("\n", size));
		if (cut < size / 2) cut = size;
		else cut += 1;
		if (/[\uD800-\uDBFF]/.test(rest[cut - 1] ?? "")) cut += 1;
		out.push(rest.slice(0, cut));
		rest = rest.slice(cut);
	}
	if (rest !== "") out.push(rest);
	return out;
}
//#endregion
//#region lib/types/computer.js
/**
* The computer-use engine behind the tools: one coordinate space (the latest
* screenshot of the current display), access checks against the window that
* will receive the input, overlay status, and post-action screenshots.
*/
/** Visible typing pace (ms per character). */
const CHAR_DELAY_MS = 12;
/** Text longer than this is pasted (stream / paste modes). */
const PASTE_OVER = 200;
const ACTIONS = [
	"screenshot",
	"left_click",
	"right_click",
	"middle_click",
	"double_click",
	"triple_click",
	"mouse_move",
	"left_click_drag",
	"left_mouse_down",
	"left_mouse_up",
	"scroll",
	"type",
	"key",
	"hold_key",
	"wait",
	"zoom",
	"cursor_position"
];
/** Actions that change something on screen and deserve a fresh screenshot. */
const MUTATING = /* @__PURE__ */ new Set([
	"left_click",
	"right_click",
	"middle_click",
	"double_click",
	"triple_click",
	"left_click_drag",
	"left_mouse_down",
	"left_mouse_up",
	"scroll",
	"type",
	"key",
	"hold_key",
	"mouse_move"
]);
/** Actions that wait for the user to stop typing before they run. */
const INPUT = new Set([...MUTATING].filter((action) => action !== "mouse_move"));
/** Actions whose input goes to the foreground window. */
const KEYBOARD = /* @__PURE__ */ new Set([
	"type",
	"key",
	"hold_key"
]);
/** Below this fraction of changed sample pixels, the screen counts as unchanged. */
const UNCHANGED_DIFF = 5e-4;
/** Text returned instead of an identical screenshot. */
const UNCHANGED_TEXT = "The screen looks exactly as in your previous screenshot: the action had no visible effect.";
/** How long a named control may take to appear before the action gives up. */
const TARGET_WAIT_MS = 3e3;
/** Pause between looks while waiting for a control or a window. */
const POLL_MS = 200;
var Computer = class Computer {
	helper;
	access;
	overlay;
	settings;
	displays = [];
	displayIndex = -1;
	heldButton = false;
	/** The agent that last wrote the clipboard; when it goes idle the user's clipboard comes back. */
	clipboardAgent;
	constructor(helper, access, overlay, settings) {
		this.helper = helper;
		this.access = access;
		this.overlay = overlay;
		this.settings = settings;
		overlay.onStart = () => this.noteStart();
	}
	async refreshDisplays() {
		const rows = await this.helper.call("displays");
		if (rows.length === 0) throw new Error("No display found.");
		this.displays = rows;
		if (this.displayIndex < 0 || this.displayIndex >= rows.length) this.displayIndex = Math.max(0, rows.findIndex((row) => row.primary));
		return rows;
	}
	async display() {
		if (this.displays.length === 0) await this.refreshDisplays();
		return this.displays[this.displayIndex] ?? this.displays[0];
	}
	async selectDisplay(index) {
		const rows = await this.refreshDisplays();
		if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw new Error(`Display ${index} does not exist; there are ${rows.length} (0-${rows.length - 1}).`);
		this.displayIndex = index;
		return rows[index];
	}
	get currentIndex() {
		return Math.max(0, this.displayIndex);
	}
	shotSize(display) {
		const s = this.settings();
		return screenshotSize(display, {
			maxLongEdge: s.maxLongEdge,
			maxPixels: s.maxPixels
		});
	}
	async point(coordinate, field = "coordinate") {
		if (!Array.isArray(coordinate) || coordinate.length !== 2) throw new Error(`${field} must be [x, y] in screenshot pixels.`);
		const display = await this.display();
		return toPhysical({
			x: coordinate[0],
			y: coordinate[1]
		}, display, this.shotSize(display));
	}
	async toModel(point) {
		const display = await this.display();
		return {
			...toScreenshot(point, display, this.shotSize(display)),
			offscreen: !contains$1(display, point)
		};
	}
	async screenshot() {
		await this.refreshDisplays();
		const display = await this.display();
		const size = this.shotSize(display);
		const shot = await this.capture(display, size, { mark: true });
		await this.remember();
		return shot;
	}
	/**
	* A fresh screenshot, or 'unchanged' when the screen looks the same as in
	* the last one the model saw (saves an image and tells it the action had no
	* visible effect).
	*/
	async freshShot() {
		await this.refreshDisplays();
		const display = await this.display();
		const shot = await this.capture(display, this.shotSize(display), {
			compare: true,
			threshold: UNCHANGED_DIFF
		});
		await this.remember();
		return shot ?? "unchanged";
	}
	/** The foreground window as of the model's latest look at the screen. */
	seen;
	/** The latest foreground window that was not DeepSeek Harness itself. */
	lastTarget;
	/** A new turn starts: the user may have rearranged things while chatting. */
	resetLook() {
		this.seen = void 0;
	}
	async remember() {
		const now = await this.foreground().catch(() => void 0);
		if (!now || !isTransientShell(now)) this.seen = now;
	}
	/**
	* Did another window come to the front since the model last looked, without
	* the agent acting in between? Then the user (or a popup) changed the screen.
	*/
	async foregroundChanged() {
		const seen = this.seen;
		if (!seen) return void 0;
		const now = await this.foreground().catch(() => void 0);
		return now && now.hwnd !== seen.hwnd && now.pid !== seen.pid ? now : void 0;
	}
	async capture(rect, out, options = {}) {
		const result = await this.helper.call("screenshot", {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			outWidth: out.width,
			outHeight: out.height,
			quality: this.settings().jpegQuality,
			...options
		}, 3e4);
		if (result.unchanged || result.data === void 0) return void 0;
		return {
			data: Buffer.from(result.data, "base64"),
			width: result.width,
			height: result.height
		};
	}
	async zoom(region) {
		if (!Array.isArray(region)) throw new Error("zoom needs region: [x1, y1, x2, y2] in screenshot pixels.");
		const display = await this.display();
		const rect = regionToPhysical(region, display, this.shotSize(display));
		const s = this.settings();
		const out = screenshotSize(rect, {
			maxLongEdge: s.maxLongEdge,
			maxPixels: s.maxPixels
		});
		return await this.capture(rect, out);
	}
	async foreground() {
		const win = await this.helper.call("foreground");
		if (!win || typeof win.hwnd !== "number") return void 0;
		if (!isHostWindow(win) && !isTransientShell(win)) this.lastTarget = win;
		return win;
	}
	/**
	* The user clicked into the DeepSeek Harness card (to read or scroll the
	* chat): keys would go there. Put the window the agent was working in back
	* in front instead of refusing.
	*/
	async refocusFromHost() {
		const target = this.lastTarget;
		const fg = await this.foreground().catch(() => void 0);
		if (!fg || !(isHostWindow(fg) || isTransientShell(fg)) || !target || target.hwnd === fg.hwnd) return;
		if ((await this.focus(target).catch(() => void 0))?.focused) await setTimeout$1(80);
	}
	/** Wait at most `maxMs`, returning once the screen has been still for ~0.8 s. Returns the time waited. */
	async waitForQuiet(maxMs, signal) {
		const started = Date.now();
		if (maxMs <= 600) {
			await setTimeout$1(maxMs, void 0, { signal });
			return maxMs;
		}
		const display = await this.display();
		if (await this.helper.call("settle", {
			x: display.x,
			y: display.y,
			width: display.width,
			height: display.height,
			minMs: 300,
			maxMs,
			quietMs: 800
		}, maxMs + 1e4).catch(() => null) === null) await setTimeout$1(Math.max(0, maxMs - (Date.now() - started)), void 0, { signal });
		if (signal.aborted) throw new Error("Cancelled.");
		return Date.now() - started;
	}
	/** Wait until the screen stops changing (bounded), instead of a fixed delay. */
	async settle(signal) {
		const s = this.settings();
		const display = await this.display();
		if (await this.helper.call("settle", {
			x: display.x,
			y: display.y,
			width: display.width,
			height: display.height,
			minMs: s.settleMs,
			maxMs: Math.max(s.settleMs, 2500)
		}, 15e3).catch(() => null) === null) await setTimeout$1(s.settleMs, void 0, { signal });
		if (signal.aborted) throw new Error("Cancelled.");
	}
	async windowAt(point) {
		const win = await this.helper.call("window_at", { ...point });
		return typeof win.hwnd === "number" ? win : void 0;
	}
	async windows() {
		return this.helper.call("windows");
	}
	/** Windows when control started (hwnd -> minimized), and windows brought back from the tray since. */
	before;
	fromTray = /* @__PURE__ */ new Set();
	/** Remember the window layout at the start of a task, to tell what the agent opened or restored. */
	async noteStart() {
		const rows = await this.windows().catch(() => []);
		this.before = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.hwnd, row.minimized]));
		this.fromTray.clear();
	}
	noteFromTray(hwnd) {
		this.fromTray.add(hwnd);
	}
	/** How a window relates to the layout before the task: opened by the agent, or restored from minimized / tray. */
	origin(win) {
		if (this.fromTray.has(win.hwnd)) return win.minimized ? void 0 : "tray";
		if (!this.before) return void 0;
		const was = this.before.get(win.hwnd);
		if (was === void 0) return "opened";
		return was && !win.minimized ? "minimized" : void 0;
	}
	/** Programs running without any visible window (closed to the system tray); `tray` = has a tray icon. */
	async backgroundApps(tray = true) {
		const rows = await this.helper.call("background", { tray }, 15e3).catch(() => []);
		return Array.isArray(rows) ? rows : [];
	}
	async cursor() {
		return this.helper.call("cursor");
	}
	/** Short description of the frontmost window, for result text. */
	async describeForeground() {
		const win = await this.foreground().catch(() => void 0);
		this.seen = win;
		if (!win) return "Foreground window: none (desktop).";
		return `Foreground window: ${win.exe} — "${win.title.slice(0, 80)}".`;
	}
	assertAllowed(call, win, verb) {
		const s = this.settings();
		const reason = this.access.denial(call.session, win, s.accessMode, s.blockedApps, verb);
		if (reason) throw new Error(reason);
	}
	async checkPointer(call, point, verb) {
		const target = point ?? await this.cursor();
		this.assertAllowed(call, await this.windowAt(target), verb);
	}
	async checkKeyboard(call, verb) {
		this.assertAllowed(call, await this.foreground(), verb);
	}
	/** Overlay status line for an action (Chinese, shown to the user). */
	static statusOf(input) {
		const at = input.target ? ` “${input.target.slice(0, 20)}”` : input.coordinate ? ` (${input.coordinate.join(", ")})` : "";
		switch (input.action) {
			case "screenshot": return "查看屏幕";
			case "zoom": return "放大查看";
			case "left_click": return `点击${at}`;
			case "double_click": return `双击${at}`;
			case "triple_click": return `三击${at}`;
			case "right_click": return `右键${at}`;
			case "middle_click": return `中键${at}`;
			case "mouse_move": return `移动鼠标${at}`;
			case "left_click_drag": return `拖动到${at}`;
			case "left_mouse_down": return "按下鼠标";
			case "left_mouse_up": return "松开鼠标";
			case "scroll": return `滚动 ${input.scroll_direction ?? "down"}${at}`;
			case "type": return `输入 “${(input.text ?? "").slice(0, 16)}${(input.text ?? "").length > 16 ? "…" : ""}”`;
			case "key": return `按键 ${input.text ?? ""}`;
			case "hold_key": return `按住 ${input.text ?? ""}`;
			case "wait": return input.until ? `等待 ${input.until.slice(0, 24)}${input.gone ? " 消失" : ""}` : "等待";
			case "cursor_position": return "读取光标位置";
		}
	}
	/**
	* Controls of the foreground window, in physical pixels. `where` picks the
	* window itself or its popups (open menus and flyouts are windows of their
	* own). They are read separately because scanning both costs a second or
	* more on a file dialog, and the control is nearly always in the window.
	*/
	async elements(where = "window") {
		const result = await this.helper.call("ui", {
			includeText: true,
			maxNodes: 400,
			...where === "popups" ? { popupsOnly: true } : {}
		}, 2e4);
		return Array.isArray(result.elements) ? result.elements : [];
	}
	/** Look for a named control in the window, and only if it is not there in its popups. */
	async find(target) {
		const inWindow = await this.elements("window").catch(() => []);
		const match = matchTarget(inWindow, target);
		if (match.kind !== "missing") return match;
		const inPopups = await this.elements("popups").catch(() => []);
		if (inPopups.length === 0) return match;
		const second = matchTarget(inPopups, target);
		return second.kind === "missing" ? matchTarget([...inWindow, ...inPopups], target) : second;
	}
	/**
	* Where a named control is. It may still be appearing (the menu just
	* opened), so look again for a few seconds before giving up; an ambiguous
	* name fails at once, with the candidates, rather than clicking a guess.
	*/
	async locate(target, signal, waitMs = TARGET_WAIT_MS) {
		const started = Date.now();
		for (;;) {
			if (signal.aborted) throw new Error("Cancelled.");
			const match = await this.find(target);
			if (match.kind === "found") {
				const el = match.element;
				return {
					point: {
						x: Math.round(el.x + el.width / 2),
						y: Math.round(el.y + el.height / 2)
					},
					element: el
				};
			}
			if (match.kind === "ambiguous") {
				const list = await Promise.all(match.candidates.map(async (el) => {
					const at = await this.toModel({
						x: el.x + el.width / 2,
						y: el.y + el.height / 2
					});
					return `${el.role} "${el.name}" @ (${at.x}, ${at.y})`;
				}));
				throw new Error(`target "${target}" matches ${match.candidates.length} controls: ${list.join("; ")}. Use one of these coordinates, or a more specific name.`);
			}
			if (Date.now() - started >= waitMs) {
				const near = match.suggestions.length ? ` Controls there now: ${match.suggestions.map((name) => `"${name.slice(0, 40)}"`).join(", ")}.` : " The window exposes no named controls; use coordinates from a screenshot.";
				throw new Error(`No control named "${target}" in the foreground window.${near}`);
			}
			await setTimeout$1(POLL_MS, void 0, { signal });
		}
	}
	/** The point an action aims at: a named control, a coordinate, or nothing (the cursor). */
	async aim(input, call) {
		if (typeof input.target === "string" && input.target.trim() !== "") {
			const { point, element } = await this.locate(input.target, call.signal);
			return {
				point,
				label: ` on ${element.role} "${element.name.slice(0, 60)}"`
			};
		}
		if (input.coordinate) return {
			point: await this.point(input.coordinate),
			label: ` at (${input.coordinate.join(", ")})`
		};
		return {
			point: void 0,
			label: " at the cursor"
		};
	}
	/** wait with `until`: done as soon as the window or control is there (or gone). */
	async waitUntil(input, signal) {
		const until = (input.until ?? "").trim();
		const split = until.search(/[:：]/);
		const prefix = split > 0 ? until.slice(0, split).trim().toLowerCase() : "";
		const kind = prefix === "window" ? "window" : "target";
		const subject = (prefix === "window" || prefix === "target" ? until.slice(split + 1) : until).trim();
		if (subject === "") throw new Error("wait until needs \"window:<title or exe>\" or \"target:<control name>\".");
		const gone = input.gone === true;
		const timeout = Math.min(60, Math.max(.2, Number(input.duration ?? 10) || 10)) * 1e3;
		const needle = subject.toLowerCase();
		let suggestions = [];
		let firstSeen;
		const present = async () => {
			if (kind === "window") {
				const matches = (win) => win.title.toLowerCase().includes(needle) || win.exe.toLowerCase().includes(needle) || appMatches(subject, win);
				const fg = await this.foreground().catch(() => void 0);
				if (fg && matches(fg)) return true;
				const rows = await this.windows().catch(() => []);
				const found = (Array.isArray(rows) ? rows : []).filter((win) => !win.minimized && matches(win));
				if (gone || found.length === 0) return found.length > 0;
				if (found.some((win) => win.foreground === true)) return true;
				if (fg && found.some((win) => win.hwnd === fg.hwnd || win.pid === fg.pid)) return true;
				firstSeen ??= Date.now();
				return Date.now() - firstSeen > 1500;
			}
			const match = await this.find(subject);
			if (match.kind === "missing") suggestions = match.suggestions;
			return match.kind !== "missing";
		};
		const started = Date.now();
		for (;;) {
			if (signal.aborted) throw new Error("Cancelled.");
			if (await present() !== gone) {
				const text = `${kind === "window" ? "Window" : "Control"} "${subject}" ${gone ? "is gone" : "is there"} after ${((Date.now() - started) / 1e3).toFixed(1)}s.`;
				await this.settle(signal);
				return text;
			}
			if (Date.now() - started >= timeout) {
				const near = !gone && kind === "target" && suggestions.length ? ` Controls there now: ${suggestions.map((name) => `"${name.slice(0, 40)}"`).join(", ")}.` : "";
				throw new Error(`Timed out after ${Math.round(timeout / 1e3)}s waiting for ${kind === "window" ? "window" : "control"} "${subject}" to ${gone ? "disappear" : "appear"}.${near}`);
			}
			await setTimeout$1(POLL_MS, void 0, { signal });
		}
	}
	/** Run one action. Returns text plus an image for screenshot/zoom. */
	async run(input, call) {
		if (call.signal.aborted) throw new Error("Cancelled.");
		await this.overlay.begin(call.agent, Computer.statusOf(input));
		const { action } = input;
		const s = this.settings();
		const wasPaused = this.overlay.paused;
		if (await this.overlay.yieldToUser(call.signal, s.pauseOnUserInput && INPUT.has(action)) && INPUT.has(action)) {
			await this.overlay.begin(call.agent, Computer.statusOf(input));
			return {
				text: `Not done: ${wasPaused ? "the user paused computer use (Esc) and has now resumed" : "the user was typing on the keyboard, so you were paused until they stopped"}. ${action} was NOT performed. Look at the new screenshot and re-plan before acting.`,
				...call.vision ? { image: await this.screenshot() } : {},
				skipped: true
			};
		}
		if (s.pauseOnUserInput && INPUT.has(action)) {
			const changed = await this.foregroundChanged();
			if (changed && !isHostWindow(changed) && !isTransientShell(changed)) {
				await this.overlay.status("检测到窗口切换，重新查看屏幕");
				const image = call.vision ? await this.screenshot() : void 0;
				if (!image) this.seen = changed;
				return {
					text: `Not done: since your last look the foreground window changed to ${changed.exe} ("${changed.title.slice(0, 60)}") without you acting, most likely the user opened it. ${action} was NOT performed. Look at the new screenshot and decide whether to continue there, switch back, or ask the user.`,
					...image ? { image } : {},
					skipped: true
				};
			}
		}
		if (INPUT.has(action)) this.seen = void 0;
		if (KEYBOARD.has(action)) await this.refocusFromHost();
		switch (action) {
			case "screenshot": {
				const shot = await this.screenshot();
				return {
					text: `Screenshot ${shot.width}x${shot.height} of display ${this.currentIndex}.`,
					image: shot
				};
			}
			case "zoom": {
				const shot = await this.zoom(input.region);
				return {
					text: `Zoomed view of region [${(input.region ?? []).join(", ")}] at ${shot.width}x${shot.height}. Pixel positions in this image are NOT screen coordinates; keep using full-screenshot coordinates for actions.`,
					image: shot
				};
			}
			case "cursor_position": {
				const p = await this.toModel(await this.cursor());
				return { text: `Cursor at (${p.x}, ${p.y})${p.offscreen ? " — on another display" : ""}.` };
			}
			case "wait": {
				if (input.until) return { text: await this.waitUntil(input, call.signal) };
				const seconds = Math.min(30, Math.max(0, Number(input.duration ?? 1) || 0));
				const waited = await this.waitForQuiet(seconds * 1e3, call.signal);
				return { text: waited < seconds * 1e3 - 200 ? `Waited ${(waited / 1e3).toFixed(1)}s (the screen settled early).` : `Waited ${seconds}s.` };
			}
			case "mouse_move": {
				const { point: p, label } = await this.aim(input, call);
				if (!p) throw new Error("mouse_move needs coordinate or target.");
				await this.helper.call("move", { ...p });
				return { text: `Moved the mouse${label.replace(/^ (at|on)/, " to")}.` };
			}
			case "left_click":
			case "right_click":
			case "middle_click":
			case "double_click":
			case "triple_click": {
				const { point: p, label } = await this.aim(input, call);
				await this.checkPointer(call, p, "click");
				const button = action === "right_click" ? "right" : action === "middle_click" ? "middle" : "left";
				const count = action === "double_click" ? 2 : action === "triple_click" ? 3 : 1;
				const modifiers = parseModifiers(input.modifiers ?? input.text);
				await this.helper.call("click", {
					...p ?? {},
					button,
					count,
					modifiers
				});
				return { text: `${action.replace("_", " ")}${label}${modifiers.length ? ` holding ${input.modifiers ?? input.text}` : ""}.` };
			}
			case "left_click_drag": {
				const from = await this.point(input.start_coordinate, "start_coordinate");
				const to = await this.point(input.coordinate);
				await this.checkPointer(call, from, "drag in");
				await this.helper.call("drag", {
					x1: from.x,
					y1: from.y,
					x2: to.x,
					y2: to.y,
					button: "left"
				});
				return { text: `Dragged from (${input.start_coordinate.join(", ")}) to (${input.coordinate.join(", ")}).` };
			}
			case "left_mouse_down":
			case "left_mouse_up": {
				const p = input.coordinate ? await this.point(input.coordinate) : void 0;
				if (action === "left_mouse_down") await this.checkPointer(call, p, "press the mouse in");
				await this.helper.call("button", {
					...p ?? {},
					button: "left",
					up: action === "left_mouse_up"
				});
				this.heldButton = action === "left_mouse_down";
				return { text: `Left button ${action === "left_mouse_down" ? "down" : "up"}.` };
			}
			case "scroll": {
				const { point: p } = await this.aim(input, call);
				await this.checkPointer(call, p, "scroll");
				const amount = Math.max(1, Math.min(30, Math.round(input.scroll_amount ?? 3)));
				const direction = input.scroll_direction ?? "down";
				const dy = direction === "down" ? amount : direction === "up" ? -amount : 0;
				const dx = direction === "right" ? amount : direction === "left" ? -amount : 0;
				await this.helper.call("scroll", {
					...p ?? {},
					dx,
					dy,
					modifiers: parseModifiers(input.modifiers)
				});
				return { text: `Scrolled ${direction} ${amount}.` };
			}
			case "type": {
				const text = input.text ?? "";
				if (text === "") throw new Error("type needs text.");
				let into = "";
				if (input.target || input.coordinate) {
					const { point: p, label } = await this.aim(input, call);
					await this.checkPointer(call, p, "click");
					await this.helper.call("click", {
						...p ?? {},
						button: "left",
						count: 1,
						modifiers: []
					});
					await setTimeout$1(120, void 0, { signal: call.signal });
					into = ` (clicked${label} first)`;
				}
				await this.checkKeyboard(call, "type into");
				return { text: `${await this.enterText(text, call)}${into}` };
			}
			case "key": {
				const combos = parseKeys(input.text ?? "");
				await this.checkKeyboard(call, "send keys to");
				await this.helper.call("keys", { combos });
				return { text: `Pressed ${input.text}.` };
			}
			case "hold_key": {
				const combos = parseKeys(input.text ?? "");
				const seconds = Math.min(10, Math.max(.05, input.duration ?? .5));
				await this.checkKeyboard(call, "send keys to");
				await this.helper.call("keys", {
					combos,
					holdMs: Math.round(seconds * 1e3)
				}, 2e4);
				return { text: `Held ${input.text} for ${seconds}s.` };
			}
		}
	}
	/**
	* Enter text the way the settings ask. Long text is pasted (literally: typing
	* Markdown key by key trips editors' auto-formatting); in stream mode block
	* by block so the user watches it appear. Between pieces the user can pause
	* (Esc / typing); if another window comes to the front meanwhile, stop.
	*/
	async enterText(text, call) {
		const mode = this.settings().typingMode;
		if (mode === "paste" && text.length > PASTE_OVER) {
			await this.helper.call("paste", {
				text,
				restore: true
			});
			return `Typed ${text.length} characters (pasted).`;
		}
		if (mode === "stream" && text.length > PASTE_OVER) {
			const blocks = splitBlocks(text);
			await this.helper.call("clipboard_hold");
			try {
				await this.pieces(blocks, call, async (block, i) => {
					await this.overlay.status(`输入中 ${i + 1}/${blocks.length}`);
					await this.helper.call("paste", {
						text: block,
						restore: false,
						waitMs: 220
					});
				});
			} finally {
				await this.helper.call("clipboard_release").catch(() => {});
			}
			return `Typed ${text.length} characters (streamed in ${blocks.length} blocks).`;
		}
		const delay = mode === "paste" ? 0 : CHAR_DELAY_MS;
		await this.pieces(typingPieces(text), call, (part) => this.helper.call("type", {
			text: part,
			charDelay: delay
		}, 12e4).then(() => {}));
		return `Typed ${text.length} characters.`;
	}
	/** Run `step` per piece; between pieces yield to the user and make sure the target window is still in front. */
	async pieces(items, call, step) {
		const target = await this.foreground().catch(() => void 0);
		let done = 0;
		for (const [index, item] of items.entries()) {
			if (call.signal.aborted) throw new Error("Cancelled.");
			if (index > 0 && await this.overlay.yieldToUser(call.signal, this.settings().pauseOnUserInput)) {
				const now = await this.foreground().catch(() => void 0);
				if (target && now && now.hwnd !== target.hwnd) throw new Error(`Stopped after ${done} of ${items.join("").length} characters: the user paused and ${now.exe} is now in front. Check the screen and continue from where the text stops.`);
			}
			await step(item, index);
			done += item.length;
		}
	}
	/** Release a mouse button left down by an aborted run. */
	async releaseHeld() {
		if (!this.heldButton) return;
		this.heldButton = false;
		await this.helper.call("button", {
			button: "left",
			up: true
		}).catch(() => {});
	}
	/**
	* After a mutating action: wait for the screen to settle, then capture
	* (vision models only). A wait already waited, so it is captured at once:
	* "wait, then look" should be one step, not two.
	*/
	async after(inputs, call) {
		if (!this.settings().autoScreenshot || !call.vision) return void 0;
		const mutating = inputs.some((input) => MUTATING.has(input.action));
		if (!mutating && !inputs.some((input) => input.action === "wait")) return void 0;
		if (mutating) await this.settle(call.signal);
		return this.freshShot();
	}
	/** Bring a window forward and verify it is the foreground window. */
	async focus(win) {
		return this.helper.call("focus", { hwnd: win.hwnd });
	}
	/** Window rectangle in screenshot coordinates, for listings. */
	async windowBox(win) {
		const a = await this.toModel({
			x: win.x,
			y: win.y
		});
		const b = await this.toModel({
			x: win.x + win.width,
			y: win.y + win.height
		});
		return `(${a.x}, ${a.y})-(${b.x}, ${b.y})${a.offscreen && b.offscreen ? " other display" : ""}`;
	}
};
//#endregion
//#region lib/types/helper-client.js
/**
* Builds and drives the Windows helper (helper/CuHelper.cs): compiled once
* with the in-box .NET Framework csc.exe into a per-source-hash cache folder,
* then kept running and spoken to as JSON lines over stdio.
*/
const REFERENCES = [
	"System.dll",
	"System.Core.dll",
	"Microsoft.CSharp.dll",
	"System.Drawing.dll",
	"System.Windows.Forms.dll",
	"System.Web.Extensions.dll",
	"UIAutomationClient.dll",
	"UIAutomationTypes.dll",
	"WindowsBase.dll"
];
/** A file in helper/ at the package root: one level up from lib/ or src/, two from lib/types/. */
function helperAssetPath(name) {
	const candidates = [`../helper/${name}`, `../../helper/${name}`].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
	return candidates.find((path) => existsSync(path)) ?? candidates[0];
}
function helperSourcePath() {
	return helperAssetPath("CuHelper.cs");
}
function frameworkDir() {
	const windir = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
	for (const arch of ["Framework64", "Framework"]) {
		const dir = join(windir, "Microsoft.NET", arch, "v4.0.30319");
		if (existsSync(join(dir, "csc.exe"))) return dir;
	}
	throw new Error("The .NET Framework 4 C# compiler (csc.exe) was not found. It ships with Windows 10/11; enable \".NET Framework 4.8\" in Windows Features.");
}
function cacheRoot() {
	return join(process.env.LOCALAPPDATA ?? tmpdir(), "dsh-computer-use");
}
let building;
/** Compile the helper if this source version has no cached exe yet; returns the exe path. */
async function ensureHelperExe(source = helperSourcePath()) {
	building ??= (async () => {
		const code = await readFile(source);
		const hash = createHash("sha256").update(code).digest("hex").slice(0, 12);
		const dir = join(cacheRoot(), `helper-${hash}`);
		const exe = join(dir, "cu-helper.exe");
		if (existsSync(exe)) return exe;
		await mkdir(dir, { recursive: true });
		const fw = frameworkDir();
		const temp = join(dir, `build-${process.pid}-${Date.now()}.exe`);
		const args = [
			"-nologo",
			"-optimize+",
			"-target:exe",
			`-out:${temp}`,
			`-lib:${join(fw, "WPF")}`,
			...REFERENCES.map((ref) => `-r:${ref}`),
			source
		];
		await new Promise((resolve, reject) => {
			execFile(join(fw, "csc.exe"), args, {
				windowsHide: true,
				timeout: 12e4
			}, (error, stdout) => {
				if (error) reject(/* @__PURE__ */ new Error(`Compiling the computer-use helper failed: ${String(stdout).trim() || error.message}`));
				else resolve();
			});
		});
		try {
			await rename(temp, exe);
		} catch (error) {
			await rm(temp, { force: true });
			if (!existsSync(exe)) throw error;
		}
		return exe;
	})();
	try {
		return await building;
	} catch (error) {
		building = void 0;
		throw error;
	}
}
/**
* Set once the unsigned exe has been refused: Smart App Control blocks it with
* ERROR_ACCESS_DISABLED_BY_POLICY, which libuv reports as UNKNOWN. From then on
* the same assembly runs inside the signed powershell.exe (helper/host.ps1).
*/
let hostedHelper = false;
const POLICY_CODES = /* @__PURE__ */ new Set([
	"UNKNOWN",
	"EACCES",
	"EPERM"
]);
function isPolicyBlock(error) {
	return POLICY_CODES.has(String(error?.code)) && error.syscall?.startsWith("spawn") === true;
}
function powershellPath() {
	const windir = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
	return join(windir, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
var HelperClient = class {
	log;
	child;
	starting;
	pending = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	nextId = 0;
	disposed = false;
	constructor(log = () => {}) {
		this.log = log;
	}
	onEvent(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	async call(cmd, args = {}, timeoutMs = 2e4) {
		if (this.disposed) throw new Error("computer-use helper is shut down");
		const child = await this.ensure();
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error(`computer-use helper timed out on "${cmd}"`));
				this.kill();
			}, timeoutMs);
			this.pending.set(id, {
				resolve,
				reject,
				timer
			});
			child.stdin.write(`${JSON.stringify({
				...args,
				id,
				cmd
			})}\n`);
		});
	}
	dispose() {
		this.disposed = true;
		this.kill();
	}
	kill() {
		const child = this.child;
		this.child = void 0;
		this.starting = void 0;
		if (child && child.exitCode === null) {
			try {
				child.stdin.end();
			} catch {}
			setTimeout(() => {
				if (child.exitCode === null) child.kill();
			}, 800).unref();
		}
	}
	ensure() {
		if (this.child && this.child.exitCode === null) return Promise.resolve(this.child);
		this.starting ??= this.start().catch((error) => {
			this.starting = void 0;
			throw error;
		});
		return this.starting;
	}
	async start() {
		const exe = await ensureHelperExe();
		if (!hostedHelper) try {
			return await this.launch(exe, []);
		} catch (error) {
			if (!isPolicyBlock(error)) throw error;
			this.log(`starting cu-helper.exe was refused (${error.code ?? "unknown"}); running it inside powershell.exe instead`);
			hostedHelper = true;
		}
		try {
			return await this.launch(powershellPath(), [
				"-NoProfile",
				"-NonInteractive",
				"-STA",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				helperAssetPath("host.ps1"),
				exe
			]);
		} catch (error) {
			throw new Error(`The computer-use helper could not be started (${error instanceof Error ? error.message : String(error)}). Windows refused to run the helper this plugin compiles (cu-helper.exe), and running it inside powershell.exe failed too. Smart App Control or another application control policy is the usual cause: see Event Viewer > Applications and Services Logs > Microsoft > Windows > CodeIntegrity > Operational.`);
		}
	}
	async launch(command, args) {
		const child = spawn(command, args, {
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		let buffer = "";
		let ready;
		const readyPromise = new Promise((resolve, reject) => {
			ready = resolve;
			child.once("error", reject);
			setTimeout(() => reject(/* @__PURE__ */ new Error("computer-use helper did not start")), 15e3).unref();
		});
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			buffer += chunk;
			let index;
			while ((index = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (line) this.handle(line, () => ready?.());
			}
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => this.log(`helper stderr: ${chunk.trim()}`));
		child.on("exit", (code) => {
			if (this.child === child) this.child = void 0;
			this.starting = void 0;
			for (const [id, entry] of this.pending) {
				clearTimeout(entry.timer);
				entry.reject(/* @__PURE__ */ new Error(`computer-use helper exited (code ${String(code)})`));
				this.pending.delete(id);
			}
		});
		await readyPromise;
		this.child = child;
		return child;
	}
	handle(line, onReady) {
		let message;
		try {
			message = JSON.parse(line);
		} catch {
			this.log(`helper sent a non-JSON line: ${line.slice(0, 200)}`);
			return;
		}
		if (typeof message.event === "string") {
			if (message.event === "ready") {
				onReady();
				return;
			}
			for (const listener of this.listeners) try {
				listener({
					event: message.event,
					...message.reason === void 0 ? {} : { reason: message.reason }
				});
			} catch {}
			return;
		}
		if (typeof message.id !== "number") return;
		const entry = this.pending.get(message.id);
		if (!entry) return;
		this.pending.delete(message.id);
		clearTimeout(entry.timer);
		if (message.ok) entry.resolve(message.result ?? null);
		else entry.reject(new Error(message.error ?? "helper error"));
	}
};
//#endregion
//#region lib/types/native/koffi-path.js
/**
* Finds the koffi.node that DSH ships. It is signed by DeepSeek, so Smart App
* Control lets it load where our own compiled cu-helper.exe is refused; a koffi
* installed from npm would be unsigned and no better than the exe.
*/
const RELATIVE = join("app.asar.unpacked", "dsh", "node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node");
const IN_NODE_MODULES = join("node_modules", "@koromix", "koffi-win32-x64", "win32_x64", "koffi.node");
/** node_modules/@koromix/... in the folders above the host's entry script, nearest first. */
function besideHost(script) {
	if (!script) return [];
	const found = [];
	for (let dir = dirname(script);; dir = dirname(dir)) {
		found.push(join(dir, IN_NODE_MODULES));
		if (dirname(dir) === dir) return found;
	}
}
function koffiCandidates(env = process.env, script = process.argv[1]) {
	const resources = process.resourcesPath;
	return [
		env.DSH_KOFFI_PATH,
		resources && join(resources, RELATIVE),
		join(dirname(process.execPath), "resources", RELATIVE),
		env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs", "DeepSeek Harness", "resources", RELATIVE),
		...besideHost(script)
	].filter((path) => Boolean(path));
}
function findKoffi(env = process.env) {
	return koffiCandidates(env).find((path) => existsSync(path));
}
//#endregion
//#region lib/types/native/native-helper.js
/**
* A HelperLike that runs some commands in-process through the koffi.node DSH
* ships (see worker.ts) and hands everything else to the C# helper.
*
* What may go native depends on what the C# helper has on screen:
* - displays / cursor / foreground: always.
* - screenshot: unless a window card is up (the C# side captures under it).
* - move / click / keys / drag / scroll / type: only while no overlay is
*   shown, since the C# side dodges the pill, lets input through its cards
*   and waits for the instruction box around every pointer or key action.
* - windows / window_at: likewise, since the C# side leaves its own overlay
*   windows and the DSH card out of them.
* If the worker fails to start, every command goes to the C# helper.
*/
const ALWAYS = /* @__PURE__ */ new Set([
	"displays",
	"cursor",
	"foreground"
]);
const NO_CARD = /* @__PURE__ */ new Set(["screenshot"]);
const NO_OVERLAY = /* @__PURE__ */ new Set([
	"move",
	"click",
	"keys",
	"drag",
	"scroll",
	"type",
	"windows",
	"window_at"
]);
/** The worker next to this module: lib/native-worker.js when bundled, lib/types/native/worker.js otherwise. */
function workerPath() {
	const candidates = ["./native-worker.js", "./worker.js"].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
	return candidates.find((path) => existsSync(path)) ?? candidates[1];
}
var NativeHelper = class {
	fallback;
	log;
	enabled;
	koffiPath;
	worker;
	ready;
	pending = /* @__PURE__ */ new Map();
	nextId = 0;
	broken = false;
	overlay = false;
	cards = /* @__PURE__ */ new Set();
	constructor(fallback, log = () => {}, enabled = () => true, koffiPath = findKoffi() ?? null) {
		this.fallback = fallback;
		this.log = log;
		this.enabled = enabled;
		this.koffiPath = koffiPath;
	}
	get available() {
		return this.koffiPath !== null && !this.broken && this.enabled();
	}
	/** Whether a command would run through koffi right now. */
	routesNative(cmd) {
		if (!this.available) return false;
		if (ALWAYS.has(cmd)) return true;
		if (NO_CARD.has(cmd)) return this.cards.size === 0;
		if (NO_OVERLAY.has(cmd)) return !this.overlay && this.cards.size === 0;
		return false;
	}
	async call(cmd, args = {}, timeoutMs = 2e4) {
		if (!this.routesNative(cmd)) {
			this.shows(cmd, args);
			const result = await this.fallback.call(cmd, args, timeoutMs);
			this.hides(cmd, args);
			return result;
		}
		let worker;
		try {
			worker = await this.ensure();
		} catch (error) {
			this.broken = true;
			this.log(`koffi helper unavailable, using the C# helper only: ${error instanceof Error ? error.message : String(error)}`);
			return this.fallback.call(cmd, args, timeoutMs);
		}
		return new Promise((resolve, reject) => {
			const id = ++this.nextId;
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error(`computer-use helper timed out on "${cmd}"`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve,
				reject,
				timer
			});
			worker.postMessage({
				id,
				cmd,
				args
			});
		});
	}
	onEvent(listener) {
		return this.fallback.onEvent(listener);
	}
	dispose() {
		this.worker?.terminate();
		this.worker = void 0;
		this.ready = void 0;
		this.fallback.dispose();
	}
	/** Follow what the C# helper shows: count it as shown from the request on, hidden once it is done. */
	shows(cmd, args) {
		if (cmd === "overlay_show") this.overlay = true;
		else if (cmd === "window_card") this.cards.add(String(args.hwnd));
	}
	hides(cmd, args) {
		if (cmd === "overlay_hide") {
			this.overlay = false;
			this.cards.clear();
		} else if (cmd === "window_uncard") this.cards.delete(String(args.hwnd));
	}
	ensure() {
		this.ready ??= new Promise((resolve, reject) => {
			const worker = new Worker(workerPath(), { workerData: { koffiPath: this.koffiPath } });
			worker.unref();
			worker.on("message", (message) => {
				if (message.event === "ready") {
					this.worker = worker;
					this.log(`computer-use: koffi helper ready (${String(this.koffiPath)})`);
					resolve(worker);
					return;
				}
				if (typeof message.id !== "number") return;
				const entry = this.pending.get(message.id);
				if (!entry) return;
				this.pending.delete(message.id);
				clearTimeout(entry.timer);
				if (message.ok) entry.resolve(message.result ?? null);
				else entry.reject(new Error(message.error ?? "helper error"));
			});
			worker.on("error", (error) => {
				this.worker = void 0;
				this.ready = void 0;
				reject(error);
				for (const [id, entry] of this.pending) {
					clearTimeout(entry.timer);
					entry.reject(error);
					this.pending.delete(id);
				}
			});
			worker.on("exit", () => {
				if (this.worker === worker) {
					this.worker = void 0;
					this.ready = void 0;
				}
			});
		});
		return this.ready;
	}
};
//#endregion
//#region lib/types/overlay.js
/**
* The "AI is controlling your computer" indicator and the user's controls:
* an orange glow around every display plus a status pill, both excluded from
* screenshots. Shown on the first action of a run, hidden when that agent
* goes idle. A physical Esc pauses / resumes, the stop button cancels the
* agent, and typing on the keyboard makes the agent wait. While controlling,
* the DeepSeek Harness window can shrink into an always-on-top card.
*/
/** Markdown reduced to one plain line for the progress card. */
function plainLine(text) {
	return text.replace(/```[\s\S]*?(```|$)/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "").replace(/(\*\*|__|`|~~)/g, "").replace(/\s+/g, " ");
}
/** Friendly names of common tools on the card's activity line. */
const TOOL_NAMES = {
	computer: "操作电脑",
	computer_batch: "批量操作",
	open_application: "打开应用",
	windows: "窗口",
	ui_elements: "读取界面元素",
	clipboard: "剪贴板",
	request_access: "请求授权",
	pwsh: "运行命令",
	bash: "运行命令",
	shell: "运行命令",
	read: "读取文件",
	write: "写入文件",
	edit: "编辑文件",
	web_search: "搜索网页",
	web_fetch: "读取网页",
	todo_write: "更新待办"
};
/** How long the "done" card stays up after a run (longer while the pointer rests on it). */
const FINISH_HOLD_MS = 4e3;
/**
* Fallback only (the host normally reports the agent going idle): hide after
* this long without any sign of life from the agent. Model output and tool
* starts of any plugin count, so a slow shell command does not end the run.
*/
const IDLE_HIDE_MS = 6e5;
/**
* The agent stays busy but has stopped operating the computer (it looked at the screen once and went on with
* other tools): the glow and the card go after this long without a computer action, or sooner once it has
* started this many tools of other plugins in a row. The next computer action brings them back.
*/
const UNUSED_HIDE_MS = 9e4;
const UNUSED_AFTER_TOOLS = 3;
/** A pause longer than this ends the tool call with a message for the model. */
const MAX_PAUSE_MS = 15e5;
/** Card rectangle in the bottom-right corner of a display's work area. */
function cardRect(display) {
	const scale = display.dpi / 96;
	const margin = Math.round(16 * scale);
	const width = Math.round(Math.min(Math.max(display.workWidth * .28, 400 * scale), 560 * scale, display.workWidth - 2 * margin));
	const height = Math.round(Math.min(display.workHeight * .66, display.workHeight - 2 * margin));
	return {
		x: display.workX + display.workWidth - width - margin,
		y: display.workY + display.workHeight - height - margin,
		width,
		height
	};
}
var OverlayController = class {
	helper;
	settings;
	log;
	iconPath;
	agent;
	visible = false;
	idleTimer;
	unusedTimer;
	otherTools = 0;
	hostWindows = [];
	stopping = false;
	/** Progress card lines: the reply as it streams, and what the agent is doing. */
	streamAgent;
	text = "";
	thinking = "";
	/** Recent steps (tool actions), oldest first. */
	steps = [];
	/** Whether the agent is thinking now (newer than the last step). */
	thinkingLatest = false;
	freshAttempt = true;
	pushTimer;
	/** An instruction the user typed into the progress card. */
	onMessage;
	/** Called when control starts (before the first action), e.g. to remember the window layout. */
	onStart;
	/** Opacity the card was last given, to apply setting changes while it floats. */
	cardOpacity = 100;
	/** Paused by Esc or the pill; actions wait until resumed. */
	paused = false;
	/** When the user last typed on the physical keyboard while the overlay was up (ms epoch). */
	lastUserInput = 0;
	/** Which physical key that was (helper reason, e.g. "vk=0x41"), for the log. */
	lastUserKey = "";
	constructor(helper, settings, log, iconPath = "") {
		this.helper = helper;
		this.settings = settings;
		this.log = log;
		this.iconPath = iconPath;
		helper.onEvent((event) => {
			if (event.event === "stop") this.stop(event.reason ?? "user");
			else if (event.event === "pause") this.paused = true;
			else if (event.event === "resume") this.paused = false;
			else if (event.event === "user_input") {
				this.lastUserInput = Date.now();
				this.lastUserKey = event.reason ?? "";
			} else if (event.event === "message" && event.reason) {
				const agent = this.agent;
				if (!agent) return;
				this.step(`你：${event.reason}`);
				this.onMessage?.(agent, event.reason);
			}
		});
	}
	/** The agent currently driving the computer, if any. */
	get controller() {
		return this.agent;
	}
	/** Did the user type after `since`? */
	userTypedSince(since) {
		return this.lastUserInput > since;
	}
	/**
	* Hold the next action while the user has paused (Esc) or is typing.
	* Returns whether it had to wait, so the caller can re-check the screen.
	*/
	async yieldToUser(signal, waitForTyping) {
		const idleMs = this.settings().userIdleMs;
		const typing = () => waitForTyping && Date.now() - this.lastUserInput < idleMs;
		if (!this.paused && !typing()) return false;
		if (!this.paused) this.log(`computer use waits: the user is typing (${this.lastUserKey})`);
		const started = Date.now();
		while (this.paused || typing()) {
			if (signal.aborted) throw new Error("Cancelled.");
			if (Date.now() - started > MAX_PAUSE_MS) throw new Error("Computer use has been paused by the user for a long time. Stop here and ask the user whether to continue.");
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		return true;
	}
	/** Called before every action: shows the overlay once and updates its status line. */
	async begin(agent, status) {
		if (agent) this.agent = agent;
		this.armIdle();
		this.armUnused();
		const settings = this.settings();
		if (!this.visible) {
			this.visible = true;
			this.paused = false;
			await this.onStart?.().catch((error) => this.log(`overlay start: ${String(error)}`));
			await this.shrinkHost(settings.hostWindow);
			const pet = settings.hostWindow === "pet";
			if (settings.overlay || pet) {
				if (this.streamAgent !== agent) {
					this.text = "";
					this.thinking = "";
				}
				this.steps = status ? [status] : [];
				this.thinkingLatest = false;
				await this.helper.call("overlay_show", {
					label: pet ? `${settings.overlayLabel || "DeepSeek Harness"} 正在操控` : `${settings.overlayLabel || "DeepSeek Harness"} 正在操控你的电脑`,
					status,
					icon: this.iconPath,
					iconLight: this.iconPath.replace(/deepseek-white\.png$/, "deepseek-black.png"),
					idleMs: settings.userIdleMs,
					glow: settings.overlay,
					pet,
					petOpacity: settings.cardOpacity,
					text: this.text
				}).catch((error) => this.log(`overlay: ${String(error)}`));
			}
			return;
		}
		if (settings.hostWindow === "pet" && !this.hostWindows.some((win) => win.mode === "card")) await this.cardIfShown();
		if (this.hostWindows.some((win) => win.mode === "card") && settings.cardOpacity !== this.cardOpacity) {
			this.cardOpacity = settings.cardOpacity;
			await this.helper.call("card_opacity", { opacity: settings.cardOpacity }).catch(() => {});
		}
		await this.status(status);
	}
	async status(status) {
		const settings = this.settings();
		if (!this.visible) return;
		this.armUnused();
		if (settings.hostWindow === "pet") {
			this.step(status);
			return;
		}
		if (settings.overlay) await this.helper.call("overlay_status", { status }).catch(() => {});
	}
	/** One more step on the card's timeline. */
	step(text) {
		const line = plainLine(text).trim();
		if (line === "" || this.steps.at(-1) === line) return;
		this.steps = [...this.steps, line].slice(-8);
		this.thinkingLatest = false;
		this.schedulePush();
	}
	/** Live model output (DSH agent/assistant-stream) for the progress card. */
	stream(agent, frame) {
		if (agent !== this.streamAgent) {
			this.streamAgent = agent;
			this.text = "";
			this.thinking = "";
			this.steps = [];
		}
		if (frame.type === "start") {
			this.freshAttempt = true;
			this.thinking = "";
			return;
		}
		if (this.visible && agent === this.agent) this.armIdle();
		const chunk = frame.type === "chunk" ? frame.chunk : void 0;
		if (!chunk) return;
		if (chunk.type === "text-delta" && chunk.text) {
			if (this.freshAttempt) {
				this.text = "";
				this.freshAttempt = false;
			}
			this.text = plainLine(this.text + chunk.text).slice(-2e3);
		} else if (chunk.type === "reasoning-delta" && chunk.text) {
			this.thinking = plainLine(this.thinking + chunk.text).slice(-300);
			this.thinkingLatest = true;
		} else return;
		this.schedulePush();
	}
	/** A tool of another plugin started (computer-use tools report their own steps). */
	toolStarted(agent, name, detail) {
		if (agent !== this.streamAgent) return;
		if (this.visible && agent === this.agent) {
			this.armIdle();
			if (++this.otherTools >= UNUSED_AFTER_TOOLS && !this.paused) {
				this.log("computer use not used for a while (other tools running): overlay released");
				this.end();
				return;
			}
		}
		this.step(`${TOOL_NAMES[name] ?? name}${detail ? `：${detail}` : ""}`);
	}
	schedulePush() {
		if (!this.visible || this.settings().hostWindow !== "pet" || this.agent !== this.streamAgent || this.pushTimer) return;
		this.pushTimer = setTimeout(() => {
			this.pushTimer = void 0;
			if (!this.visible) return;
			this.helper.call("pet_update", {
				text: this.text,
				thinking: this.thinking.trim(),
				steps: this.steps,
				thinkingLatest: this.thinkingLatest
			}).catch(() => {});
		}, 80);
		this.pushTimer.unref?.();
	}
	/** Agent finished (idle), was cancelled, or the plugin is stopping. */
	async end(agent) {
		if (agent !== void 0 && this.agent !== void 0 && agent !== this.agent) return;
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = void 0;
		if (this.unusedTimer) clearTimeout(this.unusedTimer);
		this.unusedTimer = void 0;
		this.otherTools = 0;
		this.agent = void 0;
		this.paused = false;
		if (!this.visible) return;
		this.visible = false;
		if (this.pushTimer) {
			clearTimeout(this.pushTimer);
			this.pushTimer = void 0;
		}
		if (this.settings().hostWindow === "pet" && !this.stopping) await this.helper.call("pet_finish", {
			text: this.text,
			holdMs: FINISH_HOLD_MS
		}).catch(() => {});
		else await this.helper.call("overlay_hide").catch(() => {});
		await this.restoreHost();
	}
	stop(reason) {
		if (this.stopping) return;
		this.stopping = true;
		const agent = this.agent;
		this.log(`computer use stopped by the user (${reason})`);
		try {
			agent?.cancel({ kind: "user" });
		} catch (error) {
			this.log(`cancel failed: ${String(error)}`);
		}
		this.end().finally(() => {
			this.stopping = false;
		});
	}
	/** Counted from the last computer action only: model output and other tools do not keep the overlay up. */
	armUnused() {
		this.otherTools = 0;
		if (this.unusedTimer) clearTimeout(this.unusedTimer);
		this.unusedTimer = setTimeout(() => {
			if (this.paused) {
				this.armUnused();
				return;
			}
			this.log("computer use not used for a while: overlay released");
			this.end();
		}, UNUSED_HIDE_MS);
		this.unusedTimer.unref();
	}
	armIdle() {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			this.end();
		}, IDLE_HIDE_MS);
		this.idleTimer.unref();
	}
	/** Card: shrink the DSH window to an always-on-top corner card; minimize: get it out of the way. */
	async shrinkHost(mode) {
		if (mode === "keep") return;
		try {
			const rows = (await this.helper.call("windows")).filter((row) => isHostWindow(row) && !row.minimized);
			if (rows.length === 0) return;
			if (mode === "minimize" || mode === "pet") {
				for (const row of rows) await this.helper.call("window_cmd", {
					hwnd: row.hwnd,
					op: "minimize"
				});
				this.hostWindows = rows.map((row) => ({
					hwnd: row.hwnd,
					mode: "minimize"
				}));
				return;
			}
			const main = rows.find((row) => row.foreground) ?? rows.reduce((a, b) => a.width * a.height >= b.width * b.height ? a : b);
			const displays = await this.helper.call("displays");
			const cx = main.x + main.width / 2;
			const cy = main.y + main.height / 2;
			const display = displays.find((d) => cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height) ?? displays.find((d) => d.primary) ?? displays[0];
			if (!display) return;
			this.cardOpacity = this.settings().cardOpacity;
			await this.helper.call("window_card", {
				hwnd: main.hwnd,
				opacity: this.cardOpacity,
				...cardRect(display)
			});
			this.hostWindows = [{
				hwnd: main.hwnd,
				mode: "card"
			}];
		} catch (error) {
			this.log(`host window ${mode}: ${String(error)}`);
		}
	}
	/**
	* Pet mode minimizes DeepSeek Harness; if the user opens it again while the
	* agent works, it floats as the see-through card instead of covering the
	* screen (the agent neither sees nor clicks it).
	*/
	async cardIfShown() {
		try {
			if ((await this.helper.call("windows")).filter((row) => isHostWindow(row) && !row.minimized).length === 0) return;
			const before = this.hostWindows;
			await this.shrinkHost("card");
			this.hostWindows = [...this.hostWindows, ...before.filter((win) => !this.hostWindows.some((card) => card.hwnd === win.hwnd))];
		} catch (error) {
			this.log(`host window card: ${String(error)}`);
		}
	}
	async restoreHost() {
		const windows = this.hostWindows;
		this.hostWindows = [];
		for (const win of windows) if (win.mode === "card") {
			await this.helper.call("window_uncard", { hwnd: win.hwnd }).catch(() => {});
			setTimeout(() => {
				this.helper.call("windows").then((rows) => rows.some((row) => row.hwnd === win.hwnd) ? void 0 : this.helper.call("window_cmd", {
					hwnd: win.hwnd,
					op: "restore"
				})).catch(() => {});
			}, 1200).unref();
		} else await this.helper.call("window_cmd", {
			hwnd: win.hwnd,
			op: "restore"
		}).catch(() => {});
	}
};
//#endregion
//#region lib/types/prompt.js
function promptText(mode) {
	return `# Computer use (Windows)
- Read windows-computer-use before desktop actions; if unavailable, stop and report it.
${mode === "per-app" ? "- Before input to ungranted apps, request_access and wait for approval.\n" : "- App access is allow-all; blocked apps and DeepSeek Harness remain protected.\n"}- Respect pause, stop and user takeover: Esc pauses; wait during user input/window changes. After skipped input or a stopped batch, re-observe; never blindly retry.
- Let the user enter passwords, payment details, verification codes and CAPTCHAs. Sending, deleting and purchasing require clear user authorization.
- The DSH floating card is hidden in screenshots; clicks/scrolls pass through it. Never type into DeepSeek Harness: keys go to the working app.`;
}
//#endregion
//#region lib/types/skills.js
/**
* App skills: short notes on how to operate one application, kept by the agent
* (and editable by the user) as one Markdown file per app. Only a one-line
* catalog goes into the system prompt; the notes themselves are handed over
* when the app is opened, or read on demand.
*
* File format (front matter is optional):
*   ---
*   app: Obsidian
*   match: obsidian.exe, obsidian
*   summary: 打字规律、新建笔记
*   ---
*   - notes...
*
* The plugin ships a few built-in skills; a user file with the same id
* overrides one, and `disabled: true` hides it.
*/
/** Notes longer than this must be condensed before more is added. */
const SKILL_MAX_CHARS = 4e3;
/** Host processes shared by many apps: never a way to recognise one app. */
const GENERIC_HOSTS = /^(applicationframehost|explorer|msedgewebview2|javaw?|python\w*|electron)(\.exe)?$/i;
function skillId(app) {
	return app.trim().toLowerCase().replace(/\.exe$/, "").replace(/[\\/:*?"<>|\s.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "app";
}
function parseSkill(text, fallbackApp) {
	const out = {
		app: fallbackApp,
		match: [],
		summary: "",
		content: text.trim(),
		disabled: false,
		extend: false
	};
	const front = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!front) return out;
	out.content = text.slice(front[0].length).trim();
	for (const line of front[1].split(/\r?\n/)) {
		const pair = /^([a-z]+)\s*:\s*(.*)$/i.exec(line.trim());
		if (!pair) continue;
		const key = pair[1].toLowerCase();
		const value = pair[2].trim();
		if (key === "app" && value) out.app = value;
		else if (key === "match") out.match = value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
		else if (key === "summary") out.summary = value;
		else if (key === "disabled") out.disabled = value === "true";
		else if (key === "extends") out.extend = value === "builtin";
	}
	return out;
}
function formatSkill(skill, disabled = false, extend = false) {
	const head = [
		`app: ${skill.app}`,
		`match: ${skill.match.join(", ")}`,
		`summary: ${skill.summary.replace(/\r?\n/g, " ")}`
	];
	if (disabled) head.push("disabled: true");
	if (extend) head.push("extends: builtin");
	return `---\n${head.join("\n")}\n---\n${skill.content.trim()}\n`;
}
var SkillStore = class {
	builtinDir;
	userDir;
	constructor(builtinDir, userDir = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "computer-use-skills")) {
		this.builtinDir = builtinDir;
		this.userDir = userDir;
	}
	load(dir, source) {
		const map = /* @__PURE__ */ new Map();
		if (!existsSync(dir)) return map;
		for (const name of readdirSync(dir)) {
			if (!name.toLowerCase().endsWith(".md")) continue;
			try {
				const path = join(dir, name);
				const parsed = parseSkill(readFileSync(path, "utf8"), name.slice(0, -3));
				const id = skillId(name.slice(0, -3));
				map.set(id, {
					id,
					app: parsed.app,
					match: parsed.match.length > 0 ? parsed.match : [parsed.app],
					summary: parsed.summary,
					content: parsed.content,
					source,
					overrides: false,
					updatedAt: statSync(path).mtimeMs,
					disabled: parsed.disabled,
					extend: parsed.extend
				});
			} catch {}
		}
		return map;
	}
	/** Every active skill, user files first in precedence, sorted by app name. */
	list() {
		const builtin = this.load(this.builtinDir, "builtin");
		const user = this.load(this.userDir, "user");
		const out = [];
		for (const [id, skill] of user) {
			if (skill.disabled) continue;
			const { disabled: _disabled, extend, ...rest } = skill;
			const base = extend ? builtin.get(id) : void 0;
			if (base) out.push({
				...rest,
				app: base.app,
				match: [.../* @__PURE__ */ new Set([...base.match, ...rest.match])],
				summary: rest.summary || base.summary,
				content: `${base.content}\n${rest.content}`.trim(),
				overrides: true
			});
			else out.push({
				...rest,
				overrides: builtin.has(id)
			});
		}
		for (const [id, skill] of builtin) {
			if (user.has(id)) continue;
			const { disabled: _disabled, extend: _extend, ...rest } = skill;
			out.push(rest);
		}
		return out.sort((a, b) => a.app.localeCompare(b.app, "zh-CN"));
	}
	get(id) {
		const wanted = skillId(id);
		return this.list().find((skill) => skill.id === wanted);
	}
	/** The skill for an app by name, or for a window by its executable. */
	find(name, win) {
		const skills = this.list();
		const wanted = skillId(name);
		return skills.find((skill) => skill.id === wanted) ?? skills.find((skill) => skill.match.some((item) => skillId(item) === wanted)) ?? (win ? skills.find((skill) => skill.match.some((item) => !GENERIC_HOSTS.test(item) && appMatches(item, win))) : void 0);
	}
	/** One line per skill for the system prompt. */
	catalog() {
		return this.list().map((skill) => `${skill.app}${skill.summary ? ` (${skill.summary})` : ""}`).join("; ");
	}
	save(input, id = skillId(input.app), extend = false) {
		const app = input.app.trim();
		if (app === "") throw new Error("app is required.");
		const content = input.content.trim();
		if (content === "") throw new Error("content is empty.");
		const total = content.length + (extend ? (this.load(this.builtinDir, "builtin").get(skillId(id))?.content.length ?? 0) + 1 : 0);
		if (total > 4e3) throw new Error(`The skill would be ${total} characters; the limit is ${SKILL_MAX_CHARS}. Condense it (merge duplicates, drop one-off details) and write it again.`);
		const previous = this.get(id);
		const match = [...new Set([
			...input.match ?? [],
			...previous?.match ?? [],
			app
		].map((item) => item.trim()).filter((item) => item !== "" && !GENERIC_HOSTS.test(item)))];
		const summary = (input.summary ?? previous?.summary ?? "").trim().slice(0, 80);
		mkdirSync(this.userDir, { recursive: true });
		const path = join(this.userDir, `${skillId(id)}.md`);
		const tmp = `${path}.tmp`;
		writeFileSync(tmp, formatSkill({
			app,
			match,
			summary,
			content
		}, false, extend), "utf8");
		renameSync(tmp, path);
		return this.get(id);
	}
	append(app, text, extra = {}) {
		const previous = this.find(app);
		if (!previous) return this.save({
			app,
			content: text.trim(),
			...extra
		});
		const own = this.load(this.userDir, "user").get(previous.id);
		if (this.load(this.builtinDir, "builtin").has(previous.id) && (!own || own.extend)) return this.save({
			app: previous.app,
			content: own ? `${own.content}\n${text.trim()}` : text.trim(),
			...extra
		}, previous.id, true);
		return this.save({
			app: previous.app,
			content: `${previous.content}\n${text.trim()}`,
			...extra
		}, previous.id);
	}
	/** Delete a user skill; a built-in one is hidden by a disabled override. */
	remove(id) {
		const wanted = skillId(id);
		const path = join(this.userDir, `${wanted}.md`);
		const builtin = this.load(this.builtinDir, "builtin").get(wanted);
		if (builtin) {
			mkdirSync(this.userDir, { recursive: true });
			writeFileSync(path, formatSkill({
				app: builtin.app,
				match: builtin.match,
				summary: builtin.summary,
				content: ""
			}, true), "utf8");
		} else if (existsSync(path)) unlinkSync(path);
	}
	/** Drop the user's override so the built-in skill applies again. */
	reset(id) {
		const path = join(this.userDir, `${skillId(id)}.md`);
		if (existsSync(path)) unlinkSync(path);
	}
};
//#endregion
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
//#region lib/types/effort.js
/**
* Quick steps: while the agent is operating the computer, each model request
* is "look at the screenshot, pick the next click". Deliberating over that
* costs seconds per step and is what makes the motion feel halting, so those
* requests can run at the model's lowest reasoning effort. Requests that are
* not part of operating (planning from the user's message, turns that never
* touch the computer) keep the session's own setting.
*/
/**
* Has this turn started operating the computer: is there a result of one of
* this plugin's tools since the user's last message?
*
* It has to hold for the rest of the turn, not only right after such a result:
* the replies written at the lowered effort carry no reasoning, and a provider
* in thinking mode refuses a turn whose earlier tool-calling replies lack it
* (DeepSeek: "content[].thinking ... must be passed back"). So once a turn has
* a reply written without thinking, every later request of that turn goes
* without it too.
*/
function isOperating(messages, ownTools) {
	let start = messages.length;
	while (start > 0 && messages[start - 1]?.role !== "user") start--;
	const names = /* @__PURE__ */ new Map();
	for (let index = start; index < messages.length; index++) {
		const message = messages[index];
		if (message?.role === "assistant" && Array.isArray(message.content)) {
			for (const part of message.content) if (part.type === "tool-call" && typeof part.id === "string" && typeof part.name === "string") names.set(part.id, part.name);
		} else if (message?.role === "tool" && typeof message.toolCallId === "string") {
			const name = names.get(message.toolCallId);
			if (name !== void 0 && ownTools.has(name)) return true;
		}
	}
	return false;
}
/** Effort ids that mean "do not deliberate", best first. Only an exact, advertised id is ever used. */
const LOWEST = [
	"off",
	"none",
	"disabled",
	"minimal",
	"low"
];
/** The lowest reasoning effort a model offers, or undefined when it offers none we recognise. */
function lowestEffort(efforts) {
	if (!Array.isArray(efforts)) return void 0;
	const ids = new Set(efforts.map((effort) => String(effort.id).toLowerCase()));
	const pick = LOWEST.find((id) => ids.has(id));
	return pick === void 0 ? void 0 : efforts.find((effort) => String(effort.id).toLowerCase() === pick).id;
}
/**
* Without deliberation the model now and then writes a tool call whose
* arguments are not valid JSON, which the adapter raises as
* MALFORMED_RESPONSE and which would end the turn. Such a reply is thrown
* away and asked for again. The reply is held back until it is complete, as
* events already passed on could not be taken back.
*/
async function* retryMalformed(run, attempts = 3) {
	for (let attempt = 1;; attempt++) {
		const events = [];
		try {
			for await (const event of run()) events.push(event);
		} catch (error) {
			if (attempt < attempts && error?.code === "MALFORMED_RESPONSE") continue;
			throw error;
		}
		yield* events;
		return;
	}
}
//#endregion
//#region lib/types/routes.js
const STATUS_ROUTE = "/api/dsh-computer-use/status";
const PREVIEW_ROUTE = "/api/dsh-computer-use/preview";
const SCREENSHOTS_ROUTE = "/api/dsh-computer-use/screenshots";
const SCREENSHOTS_CLEAN_ROUTE = "/api/dsh-computer-use/screenshots/clean";
const SKILLS_ROUTE = "/api/dsh-computer-use/skills";
function json(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
function statusRoute(helper, settings, overlay) {
	return async (_req, res) => {
		const s = settings();
		try {
			const displays = await helper.call("displays", {}, 3e4);
			json(res, 200, {
				ok: true,
				platform: process.platform,
				helper: "ready",
				displays: displays.map((d) => ({
					...d,
					shot: screenshotSize(d, {
						maxLongEdge: s.maxLongEdge,
						maxPixels: s.maxPixels
					})
				})),
				controlling: overlay.controller !== void 0
			});
		} catch (error) {
			json(res, 200, {
				ok: true,
				platform: process.platform,
				helper: "error",
				error: error instanceof Error ? error.message : String(error),
				displays: [],
				controlling: false
			});
		}
	};
}
/** Show the overlay for a few seconds so the user can see how it looks (skipped while an agent is controlling). */
function previewRoute(helper, settings, overlay, iconPath) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, {
				ok: false,
				error: "POST only"
			});
			return;
		}
		if (overlay.controller !== void 0) {
			json(res, 409, {
				ok: false,
				error: "busy"
			});
			return;
		}
		const s = settings();
		const pet = s.hostWindow === "pet";
		await helper.call("overlay_show", {
			label: pet ? `${s.overlayLabel} 正在操控` : `${s.overlayLabel} 正在操控你的电脑`,
			status: pet ? "预览" : "预览 · 4 秒后消失",
			icon: iconPath,
			iconLight: iconPath.replace(/deepseek-white\.png$/, "deepseek-black.png"),
			idleMs: s.userIdleMs,
			glow: s.overlay,
			pet,
			petOpacity: s.cardOpacity,
			text: ""
		});
		if (pet) await helper.call("pet_update", {
			text: "这是预览：操控电脑时，这里滚动显示 AI 的回复正文。",
			thinking: "第二行显示思考过程和最近几步操作",
			steps: [
				"打开应用",
				"输入文字",
				"预览 · 4 秒后消失"
			],
			thinkingLatest: false
		}).catch(() => {});
		setTimeout(() => {
			if (overlay.controller === void 0) helper.call("overlay_hide").catch(() => {});
		}, 4e3).unref();
		json(res, 200, { ok: true });
	};
}
/** Screenshot cache size and how much of it is orphaned. */
function screenshotsRoute(cache) {
	return async (_req, res) => {
		try {
			json(res, 200, {
				ok: true,
				...await cache.stats()
			});
		} catch (error) {
			json(res, 200, {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};
}
/** Delete orphaned screenshots now. */
function screenshotsCleanRoute(cache) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, {
				ok: false,
				error: "POST only"
			});
			return;
		}
		try {
			json(res, 200, {
				ok: true,
				...await cache.clean(),
				...await cache.stats()
			});
		} catch (error) {
			json(res, 200, {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};
}
async function body(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 2e5) throw new Error("request too large");
		chunks.push(chunk);
	}
	const parsed = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8"));
	return parsed !== null && typeof parsed === "object" ? parsed : {};
}
/** App skills for the settings page: GET lists them; POST { op: 'save' | 'delete' | 'reset', ... } changes one. */
function skillsRoute(skills) {
	return async (req, res) => {
		if (req.method === "POST") {
			const input = await body(req);
			const id = typeof input.id === "string" ? input.id : "";
			try {
				if (input.op === "delete") skills.remove(id);
				else if (input.op === "reset") skills.reset(id);
				else if (input.op === "save") skills.save({
					app: String(input.app ?? ""),
					match: String(input.match ?? "").split(/[,，]/).map((item) => item.trim()).filter(Boolean),
					summary: String(input.summary ?? ""),
					content: String(input.content ?? "")
				}, id || void 0);
				else {
					json(res, 400, {
						ok: false,
						error: "unknown op"
					});
					return;
				}
			} catch (error) {
				json(res, 200, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
				return;
			}
		}
		json(res, 200, {
			ok: true,
			dir: skills.userDir,
			skills: skills.list()
		});
	};
}
//#endregion
//#region lib/types/screenshots.js
/**
* Screenshot cache housekeeping. Every screenshot is an image attachment in
* DeepSeek Harness's content-addressed store (<DSH_HOME>/attachments/v1/objects/<2>/<sha256>),
* which has no retention policy yet. Attachments still referenced by a session
* must stay byte-for-byte (DSH verifies their hash, and a missing one fails the
* whole turn), so only orphans are removed: screenshots this plugin made that
* no session, archive or plugin store references any more (e.g. the session
* was deleted).
*/
const HEX = /^[0-9a-f]{64}$/;
/** Newly saved screenshots may not be in a session log yet. */
const GRACE_MS = 864e5;
/** Places outside the session logs that can reference attachments. */
const OTHER_REFERENCE_DIRS = [
	"storages",
	"rewind-snapshots",
	"dsh-session-archive",
	"task-board"
];
const MAX_SCANNED_FILE = 67108864;
var ScreenshotCache = class {
	dshHome;
	indexFile;
	log;
	index;
	saving = Promise.resolve();
	busy = Promise.resolve();
	constructor(dshHome = process.env.DSH_HOME || join(homedir(), ".dsh"), indexFile = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "dsh-computer-use", "screenshots.json"), log = () => {}) {
		this.dshHome = dshHome;
		this.indexFile = indexFile;
		this.log = log;
	}
	get objects() {
		return join(this.dshHome, "attachments", "v1", "objects");
	}
	path(hex) {
		return join(this.objects, hex.slice(0, 2), hex);
	}
	/** Remember a screenshot attachment ("sha256:<hex>") this plugin saved. */
	record(attachmentId) {
		const hex = attachmentId.replace(/^sha256:/, "");
		if (!HEX.test(hex)) return;
		this.load().then((index) => {
			index.set(hex, Date.now());
			this.persist();
		}).catch(() => {});
	}
	async stats() {
		return this.exclusive(async () => {
			const { candidates, orphans } = await this.classify();
			const sizes = await Promise.all([...candidates].map((hex) => this.size(hex)));
			let count = 0, bytes = 0, orphanCount = 0, orphanBytes = 0;
			[...candidates].forEach((hex, i) => {
				const size = sizes[i];
				if (size === void 0) return;
				count++;
				bytes += size;
				if (orphans.has(hex)) {
					orphanCount++;
					orphanBytes += size;
				}
			});
			return {
				count,
				bytes,
				orphans: orphanCount,
				orphanBytes
			};
		});
	}
	/** Delete orphaned screenshots. */
	async clean() {
		return this.exclusive(async () => {
			const { orphans } = await this.classify();
			const index = await this.load();
			let removed = 0, bytes = 0;
			for (const hex of orphans) {
				const size = await this.size(hex);
				if (size !== void 0) try {
					const file = this.path(hex);
					await chmod(file, 438).catch(() => {});
					await unlink(file);
					removed++;
					bytes += size;
				} catch (error) {
					this.log(`screenshot cleanup: ${String(error)}`);
					continue;
				}
				index.delete(hex);
			}
			this.persist();
			await this.saving;
			if (removed > 0) this.log(`screenshot cleanup: removed ${removed} orphaned screenshots (${(bytes / 1048576).toFixed(1)} MB)`);
			return {
				removed,
				bytes
			};
		});
	}
	async classify() {
		const index = await this.load();
		const scan = await this.scan();
		let added = false;
		for (const hex of scan.ours) if (!index.has(hex)) {
			index.set(hex, 0);
			added = true;
		}
		if (added) this.persist();
		const now = Date.now();
		const candidates = new Set(index.keys());
		const orphans = /* @__PURE__ */ new Set();
		for (const [hex, savedAt] of index) {
			if (scan.referenced.has(hex)) continue;
			if (savedAt > 0 && now - savedAt < GRACE_MS) continue;
			orphans.add(hex);
		}
		return {
			candidates,
			orphans
		};
	}
	/** Every attachment id referenced anywhere DSH keeps conversation state. */
	async scan() {
		const zstd = zlib.zstdDecompressSync;
		if (typeof zstd !== "function") throw new Error("This runtime cannot read DeepSeek Harness session logs (no zstd); cleanup skipped.");
		const referenced = /* @__PURE__ */ new Set();
		const ours = /* @__PURE__ */ new Set();
		const sessions = join(this.dshHome, "sessions");
		for (const file of await walk(sessions)) {
			const text = await readText(file, zstd);
			if (text === void 0) throw new Error(`Could not read ${file}; cleanup skipped to stay safe.`);
			collect(text, referenced, ours);
		}
		for (const dir of OTHER_REFERENCE_DIRS) for (const file of await walk(join(this.dshHome, dir))) {
			const text = await readText(file, zstd);
			if (text !== void 0) collect(text, referenced, ours);
		}
		return {
			referenced,
			ours
		};
	}
	async size(hex) {
		try {
			return (await stat(this.path(hex))).size;
		} catch {
			return;
		}
	}
	async load() {
		if (this.index) return this.index;
		try {
			const raw = JSON.parse(await readFile(this.indexFile, "utf8"));
			this.index = new Map(Object.entries(raw.screenshots ?? {}).filter(([hex]) => HEX.test(hex)));
		} catch {
			this.index = /* @__PURE__ */ new Map();
		}
		return this.index;
	}
	persist() {
		const index = this.index;
		if (!index) return;
		this.saving = this.saving.then(async () => {
			await mkdir(join(this.indexFile, ".."), { recursive: true });
			const tmp = `${this.indexFile}.${process.pid}.tmp`;
			await writeFile(tmp, JSON.stringify({
				version: 1,
				screenshots: Object.fromEntries(index)
			}));
			await rename(tmp, this.indexFile);
		}).catch((error) => this.log(`screenshot index: ${String(error)}`));
	}
	exclusive(task) {
		const run = this.busy.then(task, task);
		this.busy = run.catch(() => {});
		return run;
	}
};
/** Ids in `text`; ids of our own screenshots (tool results named screenshot.jpg) also go to `ours`. */
function collect(text, referenced, ours) {
	for (const match of text.matchAll(/sha256:([0-9a-f]{64})/g)) referenced.add(match[1]);
	for (const line of text.split("\n")) {
		if (!line.includes("\"tool/result\"") || !line.includes("\"screenshot.jpg\"")) continue;
		for (const match of line.matchAll(/"attachmentId":"sha256:([0-9a-f]{64})"[^{}]*?"name":"screenshot\.jpg"/g)) ours.add(match[1]);
	}
}
async function walk(dir) {
	const out = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...await walk(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}
const ZSTD_MAGIC = Buffer.from([
	40,
	181,
	47,
	253
]);
/** File text; zstd logs are a sequence of frames (decoded one by one). */
async function readText(file, zstd) {
	try {
		if ((await stat(file)).size > MAX_SCANNED_FILE) return "";
		const data = await readFile(file);
		if (!file.endsWith(".zstd")) return data.toString("utf8");
		return decodeFrames(data, zstd);
	} catch {
		return;
	}
}
/** Split at frame magics; when a split falls inside a frame, merge with the next piece and retry. */
function decodeFrames(data, zstd) {
	const starts = [];
	for (let i = data.indexOf(ZSTD_MAGIC); i >= 0; i = data.indexOf(ZSTD_MAGIC, i + 1)) starts.push(i);
	if (starts.length === 0) return data.length === 0 ? "" : void 0;
	const parts = [];
	let from = 0;
	while (from < starts.length) {
		let decoded;
		let to = from + 1;
		for (; to <= starts.length; to++) try {
			decoded = zstd(data.subarray(starts[from], starts[to] ?? data.length));
			break;
		} catch {}
		if (decoded === void 0) return void 0;
		parts.push(decoded);
		from = to;
	}
	return Buffer.concat(parts).toString("utf8");
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
/** The one Remote failure class shared by owners, the Gateway, and consumers. */
/**
* One Remote call failure: a real Error carrying its stable code and typed
* details. Owners throw it at the failure point; the Host Gateway encodes it
* onto the wire unchanged; the Client face rebuilds an instance for the
* `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
* Discrimination is always by `code`, never by instanceof.
*/
var RemoteError = class extends Error {
	code;
	details;
	/** Structural marker: cross-realm/bundle identification never uses instanceof. */
	isDSHRemoteError = true;
	/**
	* @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
	* @param message - human diagnostic carried across the wire.
	* @param details - structured payload typed by the code.
	* @param options - standard Error options (`cause` survives in-process only).
	*/
	constructor(code, message, details, options) {
		super(message, options);
		this.code = code;
		this.details = details;
		this.name = "RemoteError";
	}
};
/**
* Remote decorators and explicit Gateway bindings backed by versioned
* descriptors carried on decorated class prototypes. Strict reflection
* remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/**
* Bind one visible Service field to a Cordis key and Remote namespace. A
* service that owns a Cordis Context also gives its tree `ctx.invocation`,
* `undefined` outside a Remote call, so no `TypertRemoteService` is needed for
* a Host composition to read it.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	const ctx = Reflect.get(service, "ctx");
	if (Context.is(ctx)) provideInvocationAccessor(ctx);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = class extends Service {
	/** Visible binding consumed by the Gateway's source-mode discovery. */
	typertRemote;
	/**
	* Register the Service and bind the same key to Typert Gateway.
	* @param ctx - owning Cordis Context.
	* @param serviceKey - exact Cordis service key and default wire namespace.
	* @param options - optional wire namespace.
	*/
	constructor(ctx, serviceKey, options = {}) {
		super(ctx, serviceKey);
		this.typertRemote = bindTypertRemote(this, this.name, options);
	}
};
/**
* Make `ctx.invocation` read as `undefined` outside a Remote call instead of the
* reflect service's "cannot get property" error; a call-derived Context shadows
* the accessor with its own property. The first Remote Service constructed in a
* tree registers it on the root, where it outlives any one Service.
*/
function provideInvocationAccessor(ctx) {
	if (Object.hasOwn(ctx.root.reflect.props, "invocation")) return;
	ctx.root.accessor("invocation", { get: () => void 0 });
}
function Remote(methodExportOrOptions, context) {
	if (typeof methodExportOrOptions === "string") {
		validateName("Remote export name", methodExportOrOptions);
		return remoteDecorator({ kind: "direct" }, { exportName: methodExportOrOptions });
	}
	if (typeof methodExportOrOptions === "object") return remoteDecorator({ kind: "direct" }, markerOptions(methodExportOrOptions, REMOTE_OPTION_KEYS, "Remote options require name, mode: \"stream\", or resources"));
	if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
	addMarkerInitializer(context, { kind: "direct" });
}
const REMOTE_OPTION_KEYS = /* @__PURE__ */ new Set([
	"name",
	"mode",
	"resources"
]);
/** Validate one decorator options object against its accepted keys and select the marker fields. */
function markerOptions(options, accepted, requirement) {
	const keys = Reflect.ownKeys(options);
	if (keys.length === 0 || keys.some((key) => typeof key !== "string" || !accepted.has(key)) || Object.hasOwn(options, "mode") && options.mode !== "stream") throw new TypeError(`typert-protocol: ${requirement}`);
	const { mode, name, resources } = options;
	if (name !== void 0) validateName("Remote export name", name);
	return {
		...mode === void 0 ? {} : { mode },
		...name === void 0 ? {} : { exportName: name },
		...resources === void 0 ? {} : { resources: resourceReaders(resources) }
	};
}
/** Freeze declared readers into the marker record; a misdeclared reader fails at decoration. */
function resourceReaders(resources) {
	const readers = {};
	for (const [kind, reader] of Object.entries(resources)) {
		if (typeof reader !== "function") throw new TypeError(`typert-protocol: Remote resource reader "${kind}" must be a function`);
		readers[kind] = reader;
	}
	if (Object.keys(readers).length === 0) throw new TypeError("typert-protocol: Remote resources require at least one reader");
	return Object.freeze(readers);
}
function remoteDecorator(invocation, options = {}) {
	return function(_method, context) {
		addMarkerInitializer(context, invocation, options);
	};
}
function readRemoteMethodDescriptor(prototype) {
	const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
	if (property === void 0) return void 0;
	const descriptor = property.value;
	if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
	const version = Reflect.get(descriptor, "version");
	if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
	const methods = Reflect.get(descriptor, "methods");
	if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
	return descriptor;
}
function addMarkerInitializer(context, invocation, options = {}) {
	if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
	const method = context.name;
	context.addInitializer(function() {
		const prototype = Object.getPrototypeOf(this);
		if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
		mark(prototype, method, invocation, options);
	});
}
function mark(prototype, method, invocation, { mode, exportName, resources }) {
	const descriptor = readRemoteMethodDescriptor(prototype);
	const marker = Object.freeze({
		method,
		...exportName === void 0 || exportName === method ? {} : { exportName },
		...mode === void 0 ? {} : { mode },
		invocation: Object.freeze(invocation),
		...resources === void 0 ? {} : { resources }
	});
	const current = descriptor?.methods.find((candidate) => candidate.method === method);
	if (current !== void 0) {
		if (current.exportName === marker.exportName && current.mode === marker.mode && current.resources === marker.resources && sameInvocation(current.invocation, invocation)) return;
		throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
	}
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...descriptor?.methods ?? [], marker])
		})
	});
}
function sameInvocation(left, right) {
	if (left.kind === "direct") return right.kind === "direct";
	if (right.kind === "direct") return false;
	return left.context === right.context;
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-util-values@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-util-values/lib/index.js
/**
* Lazily scanned view of one JSON object's top-level fields, built from text
* that may still be streaming or from an already parsed object. Nothing is
* scanned until a reader asks; the view remembers every question it answered
* and reports changed answers when the owner refreshes for publication.
* Used for model tool-call arguments: a row reads the fields it
* cares about at whatever granularity it displays, at every stage of the call.
* @module @deepseek-ai/dsh-util-values/src/partial-json
*/
const SIMPLE_ESCAPES = {
	"\"": "\"",
	"\\": "\\",
	"/": "/",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "	"
};
const CONTENT_ESCAPE = /[\\\u0000-\u001f]/u;
function isWhitespace(c) {
	return c === " " || c === "\n" || c === "\r" || c === "	";
}
function isHex(c) {
	return c >= "0" && c <= "9" || c >= "a" && c <= "f" || c >= "A" && c <= "F";
}
(class PartialArguments {
	/** The view of a call with no arguments available. */
	static EMPTY = PartialArguments.fromObject({});
	/**
	* View finished argument text without scanning it until a reader asks.
	* @param text - the complete argument JSON text.
	* @returns a sealed view.
	*/
	static fromText(text) {
		const view = new PartialArguments();
		view.append(text);
		view.sealed = true;
		return view;
	}
	/**
	* View an already parsed argument payload, such as a PTC dispatch object.
	* @param value - the parsed argument value.
	* @returns a sealed view; a non-object payload has no fields.
	*/
	static fromObject(value) {
		const view = new PartialArguments();
		view.object = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
		view.sealed = true;
		return view;
	}
	/**
	* The source: text so far or a parsed object, plus whether it can still grow.
	* These are the only enumerable fields, so two views over the same source
	* compare equal structurally however far each has been read.
	*/
	chunks = [];
	object;
	sealed = false;
	#ends = [];
	#size = 0;
	#consumed = 0;
	#mode = "root";
	#escape = false;
	#keyStart = 0;
	#keyEscaped = false;
	#key = "";
	#current = null;
	#nestedEnds = [];
	#nestedInString = false;
	#invalidAt;
	#invalidValue = false;
	#entries = /* @__PURE__ */ new Map();
	#order = [];
	#reads = /* @__PURE__ */ new Map();
	/** Whether this view rejects further appends; does not scan text or register reads. */
	get isSealed() {
		return this.sealed;
	}
	/** Whether indexing or a content read found invalid JSON; unread value contents are not validated. */
	get invalid() {
		this.scan();
		return this.#mode === "invalid" || this.#invalidValue;
	}
	/**
	* Retain streamed argument text without scanning or comparing observed answers.
	* @param fragment - the text following every fragment appended before.
	*/
	append(fragment) {
		if (this.sealed) throw new Error("PartialArguments: cannot append to a sealed view");
		if (fragment.length === 0) return;
		this.chunks.push(fragment);
		this.#size += fragment.length;
		this.#ends.push(this.#size);
	}
	/**
	* Reconcile a streamed prefix with authoritative complete text without joining the fragments.
	* @param text - the final argument text, which replaces missing or conflicting deltas.
	* @returns this view sealed with its caches retained when every character matches; otherwise a new sealed view.
	*/
	settle(text) {
		if (this.object !== void 0 || text.length !== this.#size) return PartialArguments.fromText(text);
		let offset = 0;
		for (const chunk of this.chunks) {
			if (!text.startsWith(chunk, offset)) return PartialArguments.fromText(text);
			offset += chunk.length;
		}
		this.chunks = text.length === 0 ? [] : [text];
		this.#ends = text.length === 0 ? [] : [text.length];
		this.sealed = true;
		return this;
	}
	/**
	* Compare observed answers and advance their publication baseline. Unread views remain unscanned.
	* @returns whether any observed answer changed since its first read or the preceding refresh.
	*/
	refresh() {
		if (this.#reads.size === 0) return false;
		this.scan();
		let changed = false;
		let completions = false;
		for (const read of this.#reads.values()) {
			if (read.completion) {
				completions = true;
				continue;
			}
			changed = this.refreshRead(read) || changed;
		}
		if (completions) {
			for (const read of this.#reads.values()) if (read.completion) changed = this.refreshRead(read) || changed;
		}
		if (this.sealed) this.#reads.clear();
		return changed;
	}
	refreshRead(read) {
		const now = read.answer();
		if (Object.is(now, read.last)) return false;
		read.last = now;
		return true;
	}
	/**
	* Check whether no further fields can arrive.
	* @returns whether the outer object closed, indexing failed, or the view is sealed; unread values are not validated.
	*/
	closed() {
		return this.remember("closed", "", () => this.closedNow());
	}
	/**
	* List discovered fields in first-appearance order.
	* @returns top-level keys seen so far, in first-appearance order.
	*/
	keys() {
		return this.remember("keys", "", () => this.keysNow(), (keys) => keys.length);
	}
	/**
	* Check whether a top-level field has appeared.
	* @param key - argument name.
	* @returns whether the field has appeared (a string opened or another value began).
	*/
	has(key) {
		return this.remember("has", key, () => this.hasNow(key));
	}
	/**
	* Check whether a field's closing delimiter has arrived, without validating its contents.
	* @param key - argument name.
	* @returns whether its delimiter arrived and no content reader has reported an error for this value.
	*/
	complete(key) {
		return this.remember("complete", key, () => this.completeNow(key));
	}
	/**
	* Read string length without materializing its text.
	* @param key - argument name.
	* @param options - change granularity for a streaming string.
	* @returns decoded UTF-16 length of the string field so far; undefined when absent or not a string.
	*/
	stringLength(key, options) {
		const step = Math.max(1, Math.floor(options?.step ?? 1));
		const offset = options?.offset ?? 0;
		return this.remember(`length:${step}:${offset}`, key, () => this.lengthNow(key), (length) => length === void 0 ? void 0 : Math.ceil((length + offset) / step));
	}
	/**
	* Check a string against a decoded UTF-16 length limit without materializing it.
	* @param key - argument name.
	* @param maxLength - decoded UTF-16 limit, floored to at least zero.
	* @returns whether the string is longer than the limit; false when absent or not a string.
	*/
	stringExceeds(key, maxLength) {
		const limit = Math.max(0, Math.floor(maxLength));
		return this.remember(`exceeds:${limit}`, key, () => (this.lengthNow(key, limit + 1) ?? 0) > limit);
	}
	/**
	* Read a decoded string, including a streaming prefix.
	* @param key - argument name.
	* @returns the string field's decoded text so far; undefined when absent or not a string.
	*/
	text(key) {
		return this.remember("text", key, () => this.textNow(key));
	}
	/**
	* Read at most the first decoded UTF-16 units of a string.
	* @param key - argument name.
	* @param maxLength - maximum decoded UTF-16 length, floored to at least one.
	* @returns the bounded string prefix; undefined when absent or not a string.
	*/
	textPrefix(key, maxLength) {
		const limit = Math.max(1, Math.floor(maxLength));
		return this.remember(`prefix:${limit}`, key, () => this.textPrefixNow(key, limit));
	}
	/**
	* Read a completed non-string argument.
	* @param key - argument name.
	* @returns the parsed non-string value once it closed; undefined while open, absent, or a string.
	*/
	value(key) {
		return this.remember("value", key, () => this.valueNow(key));
	}
	/** Answer a question and, on a streaming view, remember it for change detection. */
	remember(kind, key, read, comparison) {
		this.scan();
		const result = read();
		if (!this.sealed) {
			const id = `${kind}/${key}`;
			if (!this.#reads.has(id)) this.#reads.set(id, {
				completion: kind === "complete",
				answer: comparison === void 0 ? read : () => comparison(read()),
				last: comparison === void 0 ? result : comparison(result)
			});
		}
		return result;
	}
	closedNow() {
		return this.sealed || this.#mode === "closed" || this.#mode === "invalid";
	}
	keysNow() {
		return this.object === void 0 ? this.#order : Object.keys(this.object);
	}
	hasNow(key) {
		return this.object === void 0 ? this.#entries.has(key) : Object.hasOwn(this.object, key);
	}
	completeNow(key) {
		if (this.object !== void 0) return Object.hasOwn(this.object, key);
		const entry = this.#entries.get(key);
		return entry !== void 0 && entry.end >= 0 && (entry.kind === "string" ? entry.invalidAt === void 0 : !entry.invalid);
	}
	lengthNow(key, limit = Number.POSITIVE_INFINITY) {
		if (this.object !== void 0) {
			const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
			return typeof field === "string" ? field.length : void 0;
		}
		const entry = this.#entries.get(key);
		if (entry?.kind !== "string") return void 0;
		if (entry.text !== void 0 && entry.text.at === entry.end) return entry.text.length;
		const read = entry.length ??= {
			at: entry.start,
			length: 0,
			text: ""
		};
		this.readString(entry, read, limit, false);
		return read.length;
	}
	textNow(key) {
		if (this.object !== void 0) {
			const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
			return typeof field === "string" ? field : void 0;
		}
		const entry = this.#entries.get(key);
		if (entry?.kind !== "string") return void 0;
		if (entry.text === void 0 && entry.end >= 0 && entry.needsDecoding && entry.invalidAt === void 0) {
			let text;
			try {
				text = JSON.parse(`"${this.slice(entry.start, entry.end)}"`);
			} catch (_error) {}
			if (text !== void 0) entry.text = {
				at: entry.end,
				length: text.length,
				text
			};
		}
		const read = entry.text ??= {
			at: entry.start,
			length: 0,
			text: ""
		};
		this.readString(entry, read, Number.POSITIVE_INFINITY, true);
		return read.text;
	}
	textPrefixNow(key, maxLength) {
		if (this.object !== void 0) {
			const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
			return typeof field === "string" ? field.slice(0, maxLength) : void 0;
		}
		const entry = this.#entries.get(key);
		if (entry?.kind !== "string") return void 0;
		const prefixes = entry.prefixes ??= /* @__PURE__ */ new Map();
		let read = prefixes.get(maxLength);
		if (read === void 0) {
			read = {
				at: entry.start,
				length: 0,
				text: ""
			};
			prefixes.set(maxLength, read);
		}
		this.readString(entry, read, maxLength, true);
		return read.text;
	}
	valueNow(key) {
		if (this.object !== void 0) {
			if (!Object.hasOwn(this.object, key)) return void 0;
			const field = this.object[key];
			return typeof field === "string" ? void 0 : field;
		}
		const entry = this.#entries.get(key);
		if (entry?.kind !== "value" || entry.end < 0 || entry.invalid) return void 0;
		if (entry.parsed === void 0) try {
			entry.parsed = JSON.parse(this.slice(entry.start, entry.end));
		} catch (_error) {
			entry.invalid = true;
			this.#invalidValue = true;
		}
		return entry.parsed;
	}
	chunkAt(at) {
		let low = 0;
		let high = this.#ends.length;
		while (low < high) {
			const mid = low + high >>> 1;
			if (this.#ends[mid] <= at) low = mid + 1;
			else high = mid;
		}
		return low;
	}
	/** Materialize only a requested range, never the cumulative source. */
	slice(start, end) {
		if (start >= end) return "";
		const first = this.chunkAt(start);
		const last = this.chunkAt(end - 1);
		const base = first === 0 ? 0 : this.#ends[first - 1];
		if (first === last) return this.chunks[first].slice(start - base, end - base);
		const parts = [this.chunks[first].slice(start - base)];
		for (let i = first + 1; i < last; i++) parts.push(this.chunks[i]);
		parts.push(this.chunks[last].slice(0, end - this.#ends[last - 1]));
		return parts.join("");
	}
	readString(entry, read, limit, materialize) {
		const end = Math.min(entry.end < 0 ? this.#consumed : entry.end, entry.invalidAt ?? Number.POSITIVE_INFINITY, this.#invalidAt ?? Number.POSITIVE_INFINITY);
		if (!entry.needsDecoding) {
			const length = Math.min(end - read.at, limit - read.length);
			if (length <= 0) return;
			if (materialize) read.text += this.slice(read.at, read.at + length);
			read.at += length;
			read.length += length;
			return;
		}
		let chunkIndex = this.chunkAt(read.at);
		while (read.at < end && read.length < limit) {
			const base = chunkIndex === 0 ? 0 : this.#ends[chunkIndex - 1];
			const chunk = this.chunks[chunkIndex];
			const remaining = chunk.slice(read.at - base, Math.min(chunk.length, end - base));
			const boundary = remaining.search(CONTENT_ESCAPE);
			const length = Math.min(boundary < 0 ? remaining.length : boundary, limit - read.length);
			if (length > 0) {
				if (materialize) read.text += remaining.slice(0, length);
				read.at += length;
				read.length += length;
				if (read.at === base + chunk.length) chunkIndex++;
				continue;
			}
			const type = remaining.length > 1 ? remaining[1] : read.at + 1 < end ? this.chunks[chunkIndex + 1][0] : void 0;
			let decoded;
			let width = 2;
			if (remaining[0] === "\\" && type === void 0 && entry.end < 0) return;
			if (remaining[0] === "\\" && type === "u") {
				const hex = this.slice(read.at + 2, Math.min(end, read.at + 6));
				let valid = true;
				for (let i = 0; i < hex.length; i++) if (!isHex(hex[i])) valid = false;
				if (valid) {
					if (hex.length < 4 && entry.end < 0) return;
					if (hex.length === 4) decoded = String.fromCharCode(Number.parseInt(hex, 16));
				}
				width = 6;
			} else if (remaining[0] === "\\" && type !== void 0) decoded = SIMPLE_ESCAPES[type];
			if (decoded === void 0) {
				entry.invalidAt = read.at;
				this.#invalidValue = true;
				return;
			}
			if (materialize) read.text += decoded;
			read.length++;
			read.at += width;
			while (chunkIndex < this.chunks.length && read.at >= this.#ends[chunkIndex]) chunkIndex++;
		}
	}
	/** Locate new field ranges without decoding or parsing their contents. */
	scan() {
		if (this.object !== void 0 || this.#consumed === this.#size) return;
		for (let i = this.chunkAt(this.#consumed); i < this.chunks.length && this.#invalidAt === void 0; i++) {
			const pending = this.chunks[i];
			const base = i === 0 ? 0 : this.#ends[i - 1];
			for (let index = this.#consumed - base; index < pending.length && this.#mode !== "invalid"; index++) {
				if (this.#mode === "string" || this.#mode === "nested" && this.#nestedInString) {
					const end = this.stringBoundary(pending, index);
					this.#consumed += end - index;
					index = end;
					if (index === pending.length) break;
				}
				this.step(pending[index], this.#consumed);
				this.#consumed++;
			}
		}
	}
	/** Only raw quotes and their preceding backslash runs can terminate a string. */
	stringBoundary(fragment, start) {
		let at = start;
		while (true) {
			const quote = fragment.indexOf("\"", at);
			const end = quote < 0 ? fragment.length : quote;
			if (this.#mode === "string") {
				const entry = this.#current;
				if (!entry.needsDecoding && CONTENT_ESCAPE.test(fragment.slice(at, end))) entry.needsDecoding = true;
			}
			let slashStart = end;
			while (slashStart > at && fragment[slashStart - 1] === "\\") slashStart--;
			const escaped = (end - slashStart) % 2 === 1 !== (slashStart === at && this.#escape);
			this.#escape = quote < 0 && escaped;
			if (quote < 0 || !escaped) return end;
			at = quote + 1;
		}
	}
	step(c, at) {
		switch (this.#mode) {
			case "root":
				if (isWhitespace(c)) return;
				if (c === "{") {
					this.#mode = "key-or-end";
					return;
				}
				this.fail();
				return;
			case "key-or-end":
				if (isWhitespace(c)) return;
				if (c === "}") {
					this.#mode = "closed";
					return;
				}
				if (c === "\"") {
					this.beginKey(at);
					return;
				}
				this.fail();
				return;
			case "key-only":
				if (isWhitespace(c)) return;
				if (c === "\"") {
					this.beginKey(at);
					return;
				}
				this.fail();
				return;
			case "key":
				this.stepKey(c, at);
				return;
			case "colon":
				if (isWhitespace(c)) return;
				if (c === ":") {
					this.#mode = "value";
					return;
				}
				this.fail();
				return;
			case "value":
				this.beginValue(c, at);
				return;
			case "string": {
				const entry = this.#current;
				entry.end = at;
				this.#current = null;
				this.#mode = "comma-or-end";
				return;
			}
			case "scalar":
				this.stepScalar(c, at);
				return;
			case "nested":
				this.stepNested(c, at);
				return;
			case "comma-or-end":
				if (isWhitespace(c)) return;
				if (c === ",") {
					this.#mode = "key-only";
					return;
				}
				if (c === "}") {
					this.#mode = "closed";
					return;
				}
				this.fail();
				return;
			case "closed":
				if (isWhitespace(c)) return;
				this.fail();
				return;
			/* v8 ignore next 2 -- scan() stops stepping once the view is invalid. */
			case "invalid": return;
			/* v8 ignore next 2 -- Every scanner mode has a handler above. */
			default: assertNever(this.#mode);
		}
	}
	fail() {
		this.#invalidAt = this.#consumed;
		this.#mode = "invalid";
		this.#current = null;
	}
	beginKey(at) {
		this.#mode = "key";
		this.#keyStart = at + 1;
		this.#keyEscaped = false;
		this.#escape = false;
	}
	stepKey(c, at) {
		if (c < " ") {
			this.fail();
			return;
		}
		if (this.#escape) {
			this.#escape = false;
			return;
		}
		if (c === "\\") {
			this.#escape = true;
			this.#keyEscaped = true;
			return;
		}
		if (c !== "\"") return;
		const raw = this.slice(this.#keyStart, at);
		if (this.#keyEscaped) try {
			this.#key = JSON.parse(`"${raw}"`);
		} catch (_error) {
			this.fail();
			return;
		}
		else this.#key = raw;
		this.#mode = "colon";
	}
	open(entry) {
		if (!this.#entries.has(this.#key)) this.#order.push(this.#key);
		this.#entries.set(this.#key, entry);
		this.#current = entry;
	}
	beginValue(c, at) {
		if (isWhitespace(c)) return;
		if (c === "\"") {
			this.open({
				kind: "string",
				start: at + 1,
				end: -1,
				needsDecoding: false,
				invalidAt: void 0,
				length: void 0,
				text: void 0,
				prefixes: void 0
			});
			this.#escape = false;
			this.#mode = "string";
			return;
		}
		if (c === "}" || c === "," || c === ":" || c === "]") {
			this.fail();
			return;
		}
		this.open({
			kind: "value",
			start: at,
			end: -1,
			parsed: void 0,
			invalid: false
		});
		if (c === "{" || c === "[") {
			this.#mode = "nested";
			this.#nestedEnds = [c === "{" ? "}" : "]"];
			this.#nestedInString = false;
			this.#escape = false;
			return;
		}
		this.#mode = "scalar";
	}
	stepScalar(c, at) {
		if (c !== "," && c !== "}" && !isWhitespace(c)) return;
		this.closeValue(at);
		this.#mode = c === "," ? "key-only" : c === "}" ? "closed" : "comma-or-end";
	}
	stepNested(c, at) {
		if (this.#nestedInString) {
			this.#nestedInString = false;
			return;
		}
		if (c === "\"") {
			this.#nestedInString = true;
			return;
		}
		if (c === "{" || c === "[") {
			this.#nestedEnds.push(c === "{" ? "}" : "]");
			return;
		}
		if (c === "}" || c === "]") {
			if (this.#nestedEnds.pop() !== c) {
				this.fail();
				return;
			}
			if (this.#nestedEnds.length === 0) {
				this.closeValue(at + 1);
				this.#mode = "comma-or-end";
			}
		}
	}
	closeValue(end) {
		const entry = this.#current;
		entry.end = end;
		this.#current = null;
	}
});
/** Duplicate-install-safe JSON and immutable-value helpers. @module @deepseek-ai/dsh-util-values */
/**
* Mark an unreachable closed-union branch.
* @param value - impossible value; an unhandled typed variant fails at the call site.
* @param context - optional switch-site label included in the failure message.
* @returns never; a runtime value that escaped its type always throws.
*/
function assertNever(value, context) {
	const rendered = JSON.stringify(value) ?? String(value);
	throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}
/** Whether a realm-owned intrinsic prototype has a native constructor matching this engine's representation. */
function hasIntrinsicConstructor$1(prototype, name) {
	const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
	if (typeof constructor !== "function") return false;
	try {
		return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(name === "Array" ? Array : Object);
	} catch {
		return false;
	}
}
/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype$1(value) {
	return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor$1(value, "Object");
}
/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
function hasPlainArrayPrototype$1(value) {
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(prototype) || !hasIntrinsicConstructor$1(prototype, "Array")) return false;
	const objectPrototype = Object.getPrototypeOf(prototype);
	return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype$1(objectPrototype);
}
/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
function hasPlainObjectPrototype(value) {
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype$1(prototype);
}
/** Return every JSON-visible object key, or reject own data JSON would discard. */
function enumerableStringKeys(value) {
	const keys = Reflect.ownKeys(value);
	if (keys.some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) return void 0;
	return keys;
}
/** Validate lossless JSON iteratively, optionally materializing a detached snapshot. */
function walkJsonValue(value, detach) {
	const ancestors = /* @__PURE__ */ new Set();
	let root;
	let parent;
	const assign = (item) => {
		if (parent === void 0) {
			if (detach) root = item;
		} else if (parent.kind === "array") {
			if (parent.target !== void 0) parent.target[parent.key] = item;
		} else if (parent.target !== void 0) Object.defineProperty(parent.target, parent.key, {
			value: item,
			enumerable: true,
			configurable: true,
			writable: true
		});
	};
	const frames = [];
	let current = value;
	for (;;) {
		if (current === null) assign(null);
		else if (typeof current === "boolean" || typeof current === "string") assign(current);
		else if (typeof current === "number") {
			if (!Number.isFinite(current) || Object.is(current, -0)) return void 0;
			assign(current);
		} else {
			if (typeof current !== "object") return void 0;
			if (ancestors.has(current)) return void 0;
			if (Array.isArray(current)) {
				if (!hasPlainArrayPrototype$1(current)) return void 0;
				const length = current.length;
				if (Reflect.ownKeys(current).length !== length + 1) return void 0;
				const target = detach ? [] : void 0;
				if (target !== void 0) assign(target);
				let indices;
				if (!Number.isInteger(length)) {
					indices = [];
					for (let index = length - 1; index >= 0; index--) indices.push(index);
				}
				frames.push({
					kind: "array",
					source: current,
					length: indices?.length ?? length,
					index: 0,
					key: 0,
					indices,
					target
				});
			} else {
				if (!hasPlainObjectPrototype(current)) return void 0;
				const keys = enumerableStringKeys(current);
				if (keys === void 0) return void 0;
				const target = detach ? {} : void 0;
				if (target !== void 0) assign(target);
				frames.push({
					kind: "object",
					source: current,
					keys,
					index: 0,
					key: "",
					target
				});
			}
			ancestors.add(current);
		}
		for (;;) {
			const frame = frames.at(-1);
			if (frame === void 0) return detach ? root : true;
			const length = frame.kind === "array" ? frame.length : frame.keys.length;
			if (frame.index >= length) {
				ancestors.delete(frame.source);
				frames.pop();
				continue;
			}
			const index = frame.index++;
			parent = frame;
			if (frame.kind === "array") {
				const key = frame.indices === void 0 ? index : frame.indices[frame.indices.length - index - 1];
				/* v8 ignore next -- the loop is bounded by the captured index count. */
				if (key === void 0) return void 0;
				if (!Object.prototype.hasOwnProperty.call(frame.source, key)) return void 0;
				frame.key = key;
				current = frame.source[key];
			} else {
				const key = frame.keys[index];
				/* v8 ignore next -- the loop is bounded by the captured key count. */
				if (key === void 0) return void 0;
				frame.key = key;
				current = frame.source[key];
			}
			break;
		}
	}
}
/**
* Validate and detach lossless JSON in one read per property.
* @param value - candidate value to validate and detach.
* @returns the detached snapshot, or `undefined` when the value is not losslessly JSON-serializable.
*/
function snapshotJsonValue(value) {
	return walkJsonValue(value, true);
}
/**
* Test the same lossless JSON rules as {@link snapshotJsonValue} without detaching the value.
* @param value - candidate value to test.
* @returns whether the value survives a JSON round trip without loss.
*/
function isJsonValue(value) {
	return walkJsonValue(value, false) === true;
}
/**
* Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
* @param value - value to freeze.
* @returns the same value after every reachable enumerable child is frozen.
*/
function deepFreeze(value) {
	const seen = /* @__PURE__ */ new WeakSet();
	const pending = [{
		kind: "visit",
		node: value
	}];
	while (pending.length > 0) {
		const task = pending.pop();
		/* v8 ignore next -- the loop condition guarantees one pending task. */
		if (task === void 0) continue;
		if (task.kind === "property") {
			pending.push({
				kind: "visit",
				node: task.source[task.key]
			});
			continue;
		}
		const node = task.node;
		if (node === null || typeof node !== "object") continue;
		if (node instanceof AbortSignal) continue;
		if (seen.has(node)) continue;
		seen.add(node);
		Object.freeze(node);
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index--) {
			const key = keys[index];
			/* v8 ignore next -- the loop is bounded by the captured key count. */
			if (key === void 0) continue;
			pending.push({
				kind: "property",
				source: node,
				key
			});
		}
	}
	return value;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-timeout@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-timeout/lib/index.js
/** Largest delay Node schedules without clamping it to one millisecond. */
const MAX_TIMER_DELAY_MS = 2147483647;
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-llm@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-llm/lib/index.js
/**
* Detach and deep-freeze a message whose identity already exists.
* @param message - complete message, including its stable identity.
* @returns an immutable snapshot that preserves the identity.
*/
function freezeMessage(message) {
	return deepFreeze(structuredClone(message));
}
/**
* Harness error base with a stable machine-routable code and chained cause.
* Package errors extend it so tool results and replay can retain failure class.
* @module @deepseek-ai/dsh-llm/error
*/
/**
* Base class for all harness errors. Carries a `code` (stable, programmatic —
* e.g. `NO_ADAPTER`, `INVALID_ARGS`) distinct from the
* human-readable `message`, and supports `cause` chaining via the standard
* `ErrorOptions`. `name` defaults to the subclass constructor name.
*/
var HarnessError = class extends Error {
	/** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
	code;
	constructor(message, code, options) {
		super(message, options);
		this.code = code;
		this.name = new.target.name;
	}
};
/**
* Canonical provider-neutral code for a response that completed normally but
* carried no content blocks at all. Providers occasionally emit a degenerate
* completion (a terminal stop with zero output); adapters classify it as this
* failure instead of yielding an empty assistant message, because an empty
* message silently ends the turn with nothing for the user or the loop to act
* on. The attempt produced nothing durable, so retry policy treats it as safe
* to repeat.
*/
const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
/**
* Provider-owned request-retry policy configuration and resolution.
*
* Adapters expose one resolved policy per registered provider route; the
* optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
*
* @module @deepseek-ai/dsh-llm/retry-policy
*/
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1e4;
const DEFAULT_JITTER_RATIO = .1;
const DEFAULT_RETRYABLE_CODES = Object.freeze([
	EMPTY_RESPONSE_CODE,
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const backoffSchema = z.object({
	initialDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
	maxDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
	jitterRatio: z.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
const normalPolicySchema = z.object({
	mode: z.const("normal").required(),
	maxRetries: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
	retryableCodes: z.array(z.string()).default([...DEFAULT_RETRYABLE_CODES]),
	backoff: backoffSchema
});
const alwaysPolicySchema = z.object({
	mode: z.const("always").required(),
	backoff: backoffSchema
});
z.union([normalPolicySchema, alwaysPolicySchema]);
const NORMAL_POLICY_KEYS = /* @__PURE__ */ new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const ALWAYS_POLICY_KEYS = /* @__PURE__ */ new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const BACKOFF_KEYS = /* @__PURE__ */ new Set([
	"initialDelayMs",
	"maxDelayMs",
	"jitterRatio"
]);
function validateKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
}
function resolveBackoff(config, path) {
	if (config !== void 0) validateKeys(config, BACKOFF_KEYS, path);
	const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
	const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
	const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;
	if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > 2147483647) throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > 2147483647) throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (initialDelayMs > maxDelayMs) throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
	if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new Error(`${path}.jitterRatio must be between 0 and 1`);
	return Object.freeze({
		initialDelayMs,
		maxDelayMs,
		jitterRatio
	});
}
/**
* Validate, default, and detach one provider-owned retry policy.
* @param config - optional provider configuration; omission selects normal defaults.
* @param path - diagnostic path naming the provider config that owns the value.
* @returns an immutable policy safe to capture in provider registration state.
*/
function resolveRetryPolicy(config, path) {
	if (config === void 0) return Object.freeze({
		mode: "normal",
		maxRetries: DEFAULT_MAX_RETRIES,
		retryableCodes: DEFAULT_RETRYABLE_CODES,
		...resolveBackoff(void 0, `${path}.backoff`)
	});
	switch (config.mode) {
		case "normal": {
			validateKeys(config, NORMAL_POLICY_KEYS, path);
			const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
			const retryableCodes = config.retryableCodes ?? [...DEFAULT_RETRYABLE_CODES];
			if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error(`${path}.maxRetries must be a non-negative safe integer`);
			if (retryableCodes.length === 0) throw new Error(`${path}.retryableCodes must not be empty`);
			if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) throw new Error(`${path}.retryableCodes must contain only non-empty strings`);
			if (new Set(retryableCodes).size !== retryableCodes.length) throw new Error(`${path}.retryableCodes must not contain duplicates`);
			return Object.freeze({
				mode: "normal",
				maxRetries,
				retryableCodes: Object.freeze([...retryableCodes]),
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		}
		case "always":
			validateKeys(config, ALWAYS_POLICY_KEYS, path);
			return Object.freeze({
				mode: "always",
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		default: throw new Error(`${path}.mode must be "normal" or "always"`);
	}
}
/**
* Field-wise equality over {@link LlmCallConfig} — the comparison a caller
* runs to decide whether a proposed configuration is a real change (worth a
* logged header snapshot) or the held one restated.
* @param a - one configuration.
* @param b - the other.
* @returns whether every field (including the `stop` list, element-wise) matches.
*/
function callConfigEquals(a, b) {
	if (a.provider !== b.provider || a.model !== b.model || a.reasoningEffort !== b.reasoningEffort || a.temperature !== b.temperature || a.maxTokens !== b.maxTokens) return false;
	if (a.stop === void 0 || b.stop === void 0) return a.stop === b.stop;
	return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i]);
}
/**
* Normalization for values thrown by a final LLM adapter boundary.
*
* @module @deepseek-ai/dsh-llm/adapter-failure
*/
/**
* Detach serializable provider facts from a value thrown by an adapter.
* @param value - arbitrary value thrown during adapter dispatch or iteration.
* @returns immutable provider-neutral facts suitable for a terminal finish chunk.
* @internal
*/
function normalizeLlmFailure(value) {
	const error = value instanceof Error ? value : new HarnessError(thrownMessage(value), "UNKNOWN", { cause: value });
	const carried = ownFailureSnapshot(error);
	if (carried !== void 0 && carried.code === ownErrorCode(error)) return carried;
	return Object.freeze({
		message: errorMessage(error),
		code: harnessErrorCode(error)
	});
}
/** Render a non-Error throw without letting hostile coercion escape normalization. */
function thrownMessage(value) {
	try {
		const message = String(value);
		return message.length > 0 ? message : "LLM adapter failed";
	} catch (_hostileThrownValue) {
		return "LLM adapter failed";
	}
}
/** Read a foreign error's own data-backed `code` without invoking accessors. */
function ownErrorCode(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "code");
		return descriptor !== void 0 && "value" in descriptor ? descriptor.value : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Snapshot an own data property without invoking an SDK-defined accessor. */
function ownFailureSnapshot(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
		return descriptor !== void 0 && "value" in descriptor ? failureSnapshot(descriptor.value) : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Validate and detach an arbitrary serializable failure payload. */
function failureSnapshot(value) {
	if (typeof value !== "object" || value === null) return void 0;
	try {
		const candidate = value;
		const message = candidate.message;
		const code = candidate.code;
		const status = candidate.status;
		const providerRetryAfterMs = candidate.providerRetryAfterMs;
		const requestId = candidate.requestId;
		const offloadImages = candidate.offloadImages;
		if (typeof message !== "string" || message.length === 0 || typeof code !== "string" || code.length === 0 || status !== void 0 && (!Number.isInteger(status) || status < 100 || status > 599) || providerRetryAfterMs !== void 0 && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0) || requestId !== void 0 && (typeof requestId !== "string" || requestId.length === 0) || offloadImages !== void 0 && (!Number.isSafeInteger(offloadImages) || offloadImages <= 0)) return void 0;
		return Object.freeze({
			message,
			code,
			...status === void 0 ? {} : { status },
			...providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs },
			...requestId === void 0 ? {} : { requestId },
			...offloadImages === void 0 ? {} : { offloadImages }
		});
	} catch (_sdkFailureGetter) {
		return;
	}
}
/** Read an SDK error message without letting an accessor replace the primary failure. */
function errorMessage(error) {
	try {
		const message = error.message;
		if (typeof message === "string" && message.length > 0) return message;
	} catch (_sdkMessageGetter) {}
	return "LLM adapter failed";
}
/** Trust only Harness-owned codes; third-party SDK codes are not our taxonomy. */
function harnessErrorCode(error) {
	return error instanceof HarnessError ? error.code : "UNKNOWN";
}
function quoted(value) {
	return JSON.stringify(value);
}
/**
* Stable text shown to a model that cannot accept one durable image reference.
* @param ref - durable normalized attachment omitted from the request.
* @returns deterministic text-only placeholder.
*/
function textOnlyImageText(ref) {
	return `[image omitted because this model accepts text only; attachment sha256:${String(ref.attachmentId).slice(7, 15)}]`;
}
/**
* True when typed model content contains an image block. This is the one image
* walk shared by every image policy (capability gating, text-only
* serialization, compaction survey), so a consumer cannot silently diverge.
* @param content - typed model content blocks.
* @returns whether any block is an image.
*/
function contentHasImage(content) {
	return content.some((block) => block.type === "image");
}
/**
* True when typed model content contains a file block.
* Reads current content on every call without retaining scan results.
* @param content - typed model content blocks.
* @returns whether any block is a file.
*/
function contentHasFile(content) {
	for (const block of content) if (block.type === "file") return true;
	return false;
}
/**
* Stable model-facing handle for one durable file reference: the address of
* the verbatim stored copy and the instruction to read it on demand. This is
* the only representation a provider ever receives for a file.
* @param ref - durable verbatim file reference.
* @param readonlyPath - execution-world path of the stored copy, when resolvable.
* @returns deterministic handle text naming the file, its size, and its address.
*/
function fileHandleText(ref, readonlyPath) {
	const digest = String(ref.attachmentId).slice(7, 15);
	const identity = `File ${quoted(ref.name)} (${ref.bytes} bytes, sha256:${digest})`;
	if (readonlyPath === void 0) return `[${identity} was uploaded, but the current execution environment cannot access a readable path. Report that limitation if its contents are needed; do not claim to have read it.]`;
	return `[${identity}: verbatim read-only copy saved at ${quoted(readonlyPath)}. Read that path with your file tools when its contents are needed; copy it to a writable location before modifying it. When delegating file work, include this saved path in the delegation prompt; only subagents sharing this execution environment can read it.]`;
}
/** Replace every file occurrence with handle text. */
function replaceFilesWithHandles(blocks, resolvePath) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "file") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: fileHandleText(block.attachment, resolvePath(block.attachment))
			});
			continue;
		}
		next?.push(block);
	}
	return next ?? blocks;
}
function projectFilesToText(messages, resolvePath) {
	if (!messages.some((message) => contentHasFile(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceFilesWithHandles(message.content, resolvePath);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/** Replace every image occurrence for a text-only model. */
function replaceImagesForTextModel(blocks) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "image") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: textOnlyImageText(block.attachment)
			});
			continue;
		}
		next?.push(block);
	}
	return next ?? blocks;
}
function projectImagesForTextModel(messages) {
	if (!messages.some((message) => contentHasImage(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceImagesForTextModel(message.content);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
function withoutDeveloperMessages(messages) {
	const retained = messages.filter((message) => message.role !== "developer");
	return retained.length === messages.length ? messages : retained;
}
function toolDeclarations(tools, mode, history) {
	const declarations = new Map(history.tools.map((tool) => [tool.name, tool]));
	for (const update of history.updates) for (const tool of update.additions) if (!declarations.has(tool.name)) declarations.set(tool.name, {
		...tool,
		deferLoading: true
	});
	switch (mode) {
		case "in-history": return declarations;
		case "addition-only": {
			const activeNames = new Set(tools?.map((tool) => tool.name));
			for (const name of declarations.keys()) if (!activeNames.has(name)) declarations.delete(name);
			return declarations;
		}
		/* v8 ignore next 2 -- closed-union exhaustiveness guard */
		default: return assertNever(mode);
	}
}
/**
* Construct provider declarations from session-folded history without changing logged active tools.
* Unsupported routes and incomplete history use current declarations without developer updates.
* Explicitly deferred baseline tools become available only after their first retained addition.
* @param messages - complete request inputs, or the prefix selected for an auxiliary call.
* @param tools - currently active tool schemas.
* @param toolUpdate - the resolved route's update mode.
* @param history - immutable state folded from committed headers and developer messages.
* @returns provider declarations and the corresponding filtered history.
*/
function projectToolUpdates(messages, tools, toolUpdate, history) {
	if (toolUpdate === void 0) {
		let immediateTools = tools;
		if (tools?.some((tool) => tool.deferLoading === true)) immediateTools = tools.map(({ deferLoading: _loading, ...tool }) => tool);
		return {
			messages: withoutDeveloperMessages(messages),
			tools: immediateTools
		};
	}
	if (history === void 0) return {
		messages: withoutDeveloperMessages(messages),
		tools
	};
	const messageIds = new Set(messages.flatMap((message) => message.role === "developer" ? [message.id] : []));
	if (history.updates.some((update) => !messageIds.has(update.messageId))) return {
		messages: withoutDeveloperMessages(messages),
		tools
	};
	const declarations = toolDeclarations(tools, toolUpdate, history);
	const updateIds = new Set(history.updates.map((update) => update.messageId));
	const offered = new Set(history.tools.filter((tool) => !tool.deferLoading).map((tool) => tool.name));
	const projectedMessages = [];
	for (const message of messages) {
		if (message.role !== "developer") {
			projectedMessages.push(message);
			continue;
		}
		if (!updateIds.has(message.id)) continue;
		const content = message.content.filter((block) => {
			switch (block.type) {
				case "tool-addition":
					if (!declarations.has(block.toolName) || offered.has(block.toolName)) return false;
					offered.add(block.toolName);
					return true;
				case "tool-removal":
					if (toolUpdate !== "in-history") return false;
					return offered.delete(block.toolName);
				default: return true;
			}
		});
		if (content.length === 0) continue;
		if (content.length === message.content.length) projectedMessages.push(message);
		else projectedMessages.push({
			...message,
			content
		});
	}
	return {
		messages: projectedMessages.length === messages.length && projectedMessages.every((message, index) => message === messages[index]) ? messages : projectedMessages,
		tools: [...declarations.values()]
	};
}
/**
* Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
* adapters from drifting. See
* `docs/subsystems/llm-streaming.md#appidentity--app-attribution`.
*
* App-attribution vocabulary for provider requests.
* @module @deepseek-ai/dsh-llm/attribution
*/
const { version } = createRequire(import.meta.url)("../package.json");
/**
* LLM service: adapter registry with a waterfall-interceptable streaming call
* API. Exports the `LlmRuntime` default, the abstract `LlmAdapter` for
* provider backends, and `BlockAssembler` for chunk assembly.
*
* @module @deepseek-ai/dsh-llm
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Typed error for LLM-related failures. Extends {@link HarnessError}, so the
* `code` string (e.g. `AUTH`, `RATE_LIMIT`, `NO_ADAPTER`) is shared taxonomy.
*/
var LlmError = class extends HarnessError {
	/** Serializable facts retained beside this live Error. */
	failure;
	/**
	* @param message - non-empty human-readable failure summary.
	* @param code - non-empty stable provider-neutral machine code.
	* @param options - optional cause and validated serializable provider facts.
	*/
	constructor(message, code, options) {
		if (typeof message !== "string" || message.length === 0) throw new Error("LlmError message must be a non-empty string");
		if (typeof code !== "string" || code.length === 0) throw new Error("LlmError code must be a non-empty string");
		if (options?.status !== void 0 && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) throw new Error("LlmError status must be an integer from 100 through 599");
		if (options?.providerRetryAfterMs !== void 0 && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
		if (options?.requestId !== void 0 && (typeof options.requestId !== "string" || options.requestId.length === 0)) throw new Error("LlmError requestId must be a non-empty string");
		super(message, code, options);
		this.name = "LlmError";
		this.failure = Object.freeze({
			message,
			code,
			...options?.status === void 0 ? {} : { status: options.status },
			...options?.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
			...options?.requestId === void 0 ? {} : { requestId: options.requestId },
			...options?.offloadImages === void 0 ? {} : { offloadImages: options.offloadImages }
		});
	}
};
(() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _listProviders_decorators;
	let _listConfigurableProviders_decorators;
	let _remoteDiscoverModels_decorators;
	return class LlmRuntime extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_listProviders_decorators = [Remote];
			_listConfigurableProviders_decorators = [Remote];
			_remoteDiscoverModels_decorators = [Remote("discoverModels")];
			__esDecorate(this, null, _listProviders_decorators, {
				kind: "method",
				name: "listProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listProviders" in obj,
					get: (obj) => obj.listProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listConfigurableProviders_decorators, {
				kind: "method",
				name: "listConfigurableProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listConfigurableProviders" in obj,
					get: (obj) => obj.listConfigurableProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _remoteDiscoverModels_decorators, {
				kind: "method",
				name: "remoteDiscoverModels",
				static: false,
				private: false,
				access: {
					has: (obj) => "remoteDiscoverModels" in obj,
					get: (obj) => obj.remoteDiscoverModels
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		adapters = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
		directory = /* @__PURE__ */ new Map();
		discoveries = /* @__PURE__ */ new Map();
		constructor(ctx) {
			super(ctx, "llm");
		}
		/** Notify topology observers without letting one broken listener veto the commit. */
		emitAdaptersUpdated() {
			for (const listener of this.ctx.events.dispatch("emit", ["llm/adapters-updated"])) try {
				const returned = listener();
				if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
					this.warnAdaptersListenerFailure(error);
				});
			} catch (error) {
				this.warnAdaptersListenerFailure(error);
			}
		}
		/** Contained-listener diagnostic shared by the sync and async failure paths. */
		warnAdaptersListenerFailure(error) {
			this.ctx.logger.warn("llm: an llm/adapters-updated listener failed");
			this.ctx.logger.warn(error);
		}
		/**
		* Register an adapter for the given provider routes. Throws `LlmError` with code
		* `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
		* Disposed with the fiber.
		* @param providers - every provider route this adapter should serve.
		* @param adapter - the adapter that streams calls for those providers.
		* @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
		*/
		registerAdapter(providers, adapter) {
			const owned = /* @__PURE__ */ new Set();
			let released = false;
			const dispose = this.ctx.effect(function* () {
				if (providers.length === 0) throw new LlmError("an adapter must register at least one provider", "INVALID_ADAPTER");
				this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
				yield () => {
					released = true;
					for (const provider of owned) this.adapters.delete(provider);
					owned.clear();
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerAdapter()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (released) throw new LlmError("a disposed adapter registration cannot replace its routes", "REGISTRATION_DISPOSED");
				this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned));
			};
			return handle;
		}
		/**
		* Validate one candidate route set for `adapter`, treating routes this
		* registration already holds as available. Nothing is mutated: a rejected
		* candidate leaves the registry exactly as it was.
		*/
		prepareRoutes(providers, adapter, owned) {
			const unique = /* @__PURE__ */ new Set();
			const registrations = [];
			for (const provider of providers) {
				if (provider.length === 0) throw new LlmError("adapter provider names must be non-empty", "INVALID_ADAPTER");
				if (unique.has(provider) || this.adapters.has(provider) && !owned.has(provider)) throw new LlmError(`an adapter for provider "${provider}" is already registered`, "DUPLICATE_ADAPTER");
				const info = adapter.providerInfo(provider);
				if (typeof info.id !== "string" || info.id !== provider || typeof info.name !== "string" || info.name.length === 0) throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, "INVALID_ADAPTER");
				unique.add(provider);
				const retryPolicy = adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(void 0, `llm: provider "${provider}" retryPolicy`);
				registrations.push({
					adapter,
					provider: {
						id: info.id,
						name: info.name
					},
					retryPolicy
				});
			}
			return registrations;
		}
		/**
		* Swap this registration's routes for the prepared ones in one synchronous
		* section, so no observer can see the registry between the release and the
		* re-registration. The route set's one mutation point is also where
		* `llm/adapters-updated` is published, so a `replace` announces itself
		* exactly like a first registration.
		*/
		commitRoutes(owned, registrations) {
			for (const provider of owned) this.adapters.delete(provider);
			owned.clear();
			for (const registration of registrations) {
				this.adapters.set(registration.provider.id, registration);
				owned.add(registration.provider.id);
			}
			this.emitAdaptersUpdated();
		}
		/**
		* Describe provider routes with a registered adapter.
		* @returns detached provider metadata in registration order.
		*/
		listProviders() {
			return [...this.adapters.values()].map(({ provider }) => ({ ...provider }));
		}
		/**
		* Declare provider routes an adapter plugin can activate through
		* configuration. Registration is all-or-nothing: an empty list, invalid
		* entry, or a provider already declared by any registration throws
		* `LlmError` without registering the rest. Disposed with the fiber.
		* @param entries - every configurable provider this plugin owns.
		* @returns a handle that withdraws all of them, and can atomically replace them.
		*/
		registerConfigurableProviders(entries) {
			let held = [];
			let disposed = false;
			/**
			* Validate a candidate set in full against everything this registration
			* does not already hold, then publish it. Nothing is written until the
			* whole set passes, so a refused candidate leaves the current entries in
			* place — the property that makes `replace` a swap rather than a
			* delete-then-add that can strand the directory empty.
			*/
			const commit = (candidates) => {
				const detached = [];
				const own = new Set(held.map((entry) => entry.provider));
				for (const entry of candidates) {
					if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) throw new LlmError("configurable providers need a non-empty provider, displayName, and settingsNs", "INVALID_DIRECTORY");
					if (entry.settingsPath.some((segment) => segment.length === 0)) throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, "INVALID_DIRECTORY");
					if (this.directory.has(entry.provider) && !own.has(entry.provider) || detached.some((seen) => seen.provider === entry.provider)) throw new LlmError(`configurable provider "${entry.provider}" is already declared`, "DUPLICATE_DIRECTORY");
					detached.push(detachDirectoryEntry(entry));
				}
				for (const entry of held) this.directory.delete(entry.provider);
				for (const entry of detached) this.directory.set(entry.provider, entry);
				held = detached;
				this.emitAdaptersUpdated();
			};
			const dispose = this.ctx.effect(function* () {
				if (entries.length === 0) throw new LlmError("a configurable-provider registration must declare at least one provider", "INVALID_DIRECTORY");
				commit(entries);
				yield () => {
					disposed = true;
					for (const entry of held) this.directory.delete(entry.provider);
					held = [];
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerConfigurableProviders()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (disposed) throw new LlmError("this configurable-provider registration was disposed", "REGISTRATION_DISPOSED");
				commit(next);
			};
			return handle;
		}
		/**
		* List every declared configurable provider, registered or dormant.
		* @returns detached directory entries in declaration order.
		*/
		listConfigurableProviders() {
			return [...this.directory.values()].map(detachDirectoryEntry);
		}
		/**
		* Offer to interrogate provider endpoints on behalf of the settings
		* namespace this plugin owns. The namespace is the key because that is what
		* a configuration surface already holds from the configurable-provider
		* directory, and because a provider being *added* has no route to name yet.
		* Disposed with the fiber.
		* @param settingsNs - the namespace whose profiles this discovery serves.
		* @param discover - interrogates one endpoint and must honor the supplied signal.
		* @returns the disposer that withdraws the offer.
		*/
		registerModelDiscovery(settingsNs, discover) {
			const dispose = this.ctx.effect(function* () {
				if (settingsNs.length === 0) throw new LlmError("model discovery needs a non-empty settings namespace", "INVALID_DISCOVERY");
				if (this.discoveries.has(settingsNs)) throw new LlmError(`model discovery for "${settingsNs}" is already registered`, "DUPLICATE_DISCOVERY");
				this.discoveries.set(settingsNs, discover);
				yield () => {
					this.discoveries.delete(settingsNs);
				};
			}.bind(this), "llm.registerModelDiscovery()");
			return () => void dispose();
		}
		/**
		* Interrogate one provider endpoint for the models it advertises. The
		* request describes a draft, not a stored route, so nothing here reads or
		* writes settings or credentials — the caller owns both, and the reply is
		* candidate metadata a surface may offer for adoption.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - the endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation.
		* @returns the advertised models, deduplicated in endpoint order.
		*/
		async discoverModels(settingsNs, request, signal) {
			const discover = this.discoveries.get(settingsNs);
			if (discover === void 0) throw new LlmError(`no model discovery is registered for "${settingsNs}"`, "NO_DISCOVERY");
			if ((request.provider ?? "").length === 0 && (request.baseURL ?? "").length === 0) throw new LlmError("model discovery needs a provider route or a baseURL", "INVALID_DISCOVERY");
			const discovered = signal === void 0 ? await discover(request) : await discover(request, signal);
			const seen = /* @__PURE__ */ new Set();
			const models = [];
			for (const model of discovered) {
				if (typeof model.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
				seen.add(model.id);
				models.push({
					id: model.id,
					...model.name === void 0 ? {} : { name: model.name },
					...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
					...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
					...model.inputModalities === void 0 ? {} : { inputModalities: [...model.inputModalities] }
				});
			}
			return models;
		}
		/**
		* Remote adapter for one draft provider interrogation.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation supplied by the Remote carrier.
		* @returns advertised models in endpoint order.
		* @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
		*/
		async remoteDiscoverModels(settingsNs, request, signal) {
			try {
				return await this.discoverModels(settingsNs, request, signal);
			} catch (error) {
				throw new RemoteError("llm/model-discovery-rejected", error instanceof Error ? error.message : String(error), {
					settingsNs,
					...request.baseURL === void 0 ? {} : { baseURL: request.baseURL }
				}, { cause: error });
			}
		}
		/**
		* Resolve the retry policy captured when one provider route was registered.
		* @param provider - registered provider route to inspect.
		* @returns the provider-owned policy, with normal defaults already resolved.
		*/
		providerRetryPolicy(provider) {
			return this.registration(provider).retryPolicy;
		}
		/**
		* Resolve provider-side request-image pricing for one exact route, or
		* `undefined` when the provider is unregistered or declares none. Unknown
		* providers degrade to `undefined` rather than throwing because callers
		* price durable history whose route may no longer be mounted.
		* @param provider - provider route named by a request header.
		* @param model - exact model id named by the same header.
		* @returns the owning adapter's image pricing for the route, when declared.
		*/
		imageRequestPricing(provider, model) {
			return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
		}
		/**
		* Resolve the image projection for an exact registered model route.
		* @param provider - registered provider route.
		* @param model - exact model id.
		* @param image - normalized image reference.
		* @returns dimensions and byte target used by the adapter's request serializer.
		*/
		imageRequestTarget(provider, model, image) {
			return this.registration(provider).adapter.imageRequestTarget(provider, model, image);
		}
		/**
		* Resolve the exact text one durable file occurrence contributes to every
		* provider request in the current execution environment.
		* @param ref - durable verbatim file reference from model history.
		* @returns the same deterministic handle text used at adapter dispatch.
		*/
		fileRequestText(ref) {
			return fileHandleText(ref, this.fileReadPath(ref));
		}
		/** Detach typed adapter-owned modality metadata. */
		detachedModalities(modalities) {
			return modalities === void 0 ? void 0 : [...modalities];
		}
		/**
		* Discover models advertised by one registered provider. Catalog membership
		* does not constrain core routing. Catalog-driven entry points may restrict
		* selection and submission to the advertised models.
		* @param provider - registered provider route to inspect.
		* @returns detached model metadata in adapter-preferred order.
		*/
		async listModels(provider) {
			const models = await this.registration(provider).adapter.listModels(provider);
			const seen = /* @__PURE__ */ new Set();
			return models.map((model) => {
				if (typeof model.provider !== "string" || model.provider !== provider || typeof model.id !== "string" || model.id.length === 0 || typeof model.name !== "string" || model.name.length === 0 || model.description !== void 0 && typeof model.description !== "string" || seen.has(model.id)) throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, "INVALID_CATALOG");
				seen.add(model.id);
				const inputModalities = this.detachedModalities(model.inputModalities);
				const badge = model.badge;
				return {
					provider: model.provider,
					id: model.id,
					name: model.name,
					...model.description === void 0 ? {} : { description: model.description },
					...inputModalities === void 0 ? {} : { inputModalities },
					...badge === void 0 ? {} : { badge: {
						text: typeof badge.text === "string" ? badge.text : { ...badge.text },
						tone: badge.tone
					} }
				};
			});
		}
		/**
		* Resolve and validate all metadata from the adapter that owns one exact
		* route. The result is detached from adapter-owned objects; catalog
		* membership remains advisory and does not control request routing.
		* @param provider - registered provider route to inspect.
		* @param model - exact model id passed to the adapter.
		* @param signal - optional cancellation for adapter-owned asynchronous lookup.
		* @returns exact model identity plus available context and reasoning metadata.
		*/
		async resolveModelInfo(provider, model, signal) {
			return this.resolveModelInfoFor(this.registration(provider), model, signal);
		}
		async resolveModelInfoFor(registration, model, signal) {
			const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal);
			return this.normalizeModelInfo(registration, model, resolved);
		}
		/** Validate and detach one adapter-returned exact model result. */
		normalizeModelInfo(registration, model, resolved) {
			const provider = registration.provider.id;
			if (typeof resolved.provider !== "string" || resolved.provider !== provider || typeof resolved.id !== "string" || resolved.id !== model || typeof resolved.name !== "string" || resolved.name.length === 0 || resolved.description !== void 0 && typeof resolved.description !== "string") throw new LlmError(`adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const context = resolved.context;
			if (context !== void 0 && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) throw new LlmError(`adapter returned invalid context metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_CONTEXT");
			const inputModalities = this.detachedModalities(resolved.inputModalities);
			const systemPromptUpdate = resolved.systemPromptUpdate;
			if (systemPromptUpdate !== void 0 && systemPromptUpdate !== "in-history") throw new LlmError(`adapter returned invalid system prompt update mode for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const toolUpdate = resolved.toolUpdate;
			if (toolUpdate !== void 0 && toolUpdate !== "in-history" && toolUpdate !== "addition-only") throw new LlmError(`adapter returned invalid tool update mode for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const defaultMaxTokens = resolved.defaultMaxTokens;
			if (defaultMaxTokens !== void 0 && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) throw new LlmError(`adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`, "INVALID_MODEL_MAX_TOKENS");
			const info = {
				provider,
				id: model,
				name: resolved.name,
				...resolved.description === void 0 ? {} : { description: resolved.description },
				...inputModalities === void 0 ? {} : { inputModalities },
				...context === void 0 ? {} : { context: { contextWindow: context.contextWindow } },
				...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens },
				...resolved.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: resolved.systemPromptUpdate },
				...resolved.toolUpdate === void 0 ? {} : { toolUpdate: resolved.toolUpdate }
			};
			const reasoning = resolved.reasoning;
			if (reasoning === void 0) return info;
			if (reasoning.efforts.length === 0) throw new LlmError(`adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			const seen = /* @__PURE__ */ new Set();
			const efforts = reasoning.efforts.map((effort) => {
				if (typeof effort.id !== "string" || effort.id.length === 0 || typeof effort.name !== "string" || effort.name.length === 0 || effort.description !== void 0 && typeof effort.description !== "string" || seen.has(effort.id)) throw new LlmError(`adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
				seen.add(effort.id);
				return {
					id: effort.id,
					name: effort.name,
					...effort.description === void 0 ? {} : { description: effort.description }
				};
			});
			if (reasoning.defaultEffort !== void 0 && !seen.has(reasoning.defaultEffort)) throw new LlmError(`adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			return {
				...info,
				reasoning: {
					efforts,
					...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort }
				}
			};
		}
		/**
		* Validate a conversation call config against its exact model capability and
		* materialize adapter-configured defaults. Unsupported explicit efforts
		* reject before provider I/O; no clamping or aliasing is performed. This
		* standalone query does not bind a later dispatch; use {@link prepareCall}
		* when logging and streaming must share one adapter registration.
		* @param config - provider/model route and optional request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @returns a detached config only when a default must be materialized.
		*/
		async resolveCallConfig(config, signal) {
			return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config;
		}
		async resolveCallFor(registration, config, signal) {
			const info = await this.resolveModelInfoFor(registration, config.model, signal);
			return this.resolveCallWithInfo(config, info);
		}
		/** Validate request controls against one already-bound exact model result. */
		resolveCallWithInfo(config, info) {
			const defaulted = config.maxTokens === void 0 && info.defaultMaxTokens !== void 0 ? {
				...config,
				maxTokens: info.defaultMaxTokens
			} : config;
			const reasoning = info.reasoning;
			const requested = defaulted.reasoningEffort;
			let resolvedConfig = defaulted;
			if (reasoning === void 0) {
				if (requested !== void 0) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`, "UNSUPPORTED_REASONING_EFFORT");
			} else {
				const effective = requested ?? reasoning.defaultEffort;
				if (effective !== void 0) {
					if (!reasoning.efforts.some((effort) => effort.id === effective)) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`, "UNSUPPORTED_REASONING_EFFORT");
					if (requested !== effective) resolvedConfig = {
						...defaulted,
						reasoningEffort: effective
					};
				}
			}
			return {
				config: resolvedConfig,
				...info.context === void 0 ? {} : { context: info.context },
				modelInfo: info
			};
		}
		/**
		* Resolve one call under its current adapter registration. The returned
		* one-shot handle keeps that registration across header logging and dispatch,
		* so HMR cannot combine one adapter's capability result with another adapter.
		* An optional synchronous callback selects concrete controls using captured
		* model metadata. Defaults and validation apply to its result. Callback
		* failures and cancellation reject preparation before dispatch.
		* @param config - provider/model route and optional concrete request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @param configure - pure control selection, called once before defaults and validation.
		* @returns a prepared config and its registration-bound stream entry point.
		*/
		async prepareCall(config, signal, configure) {
			signal?.throwIfAborted();
			const { provider, model, ...controls } = config;
			const registration = this.registration(provider);
			const adapterCall = await registration.adapter.prepareCall(provider, model, signal);
			signal?.throwIfAborted();
			const modelInfo = this.normalizeModelInfo(registration, model, adapterCall.model);
			const proposed = configure === void 0 ? config : {
				...configure(deepFreeze(structuredClone(controls)), deepFreeze(modelInfo)),
				provider,
				model
			};
			signal?.throwIfAborted();
			const resolved = this.resolveCallWithInfo(proposed, modelInfo);
			const resolvedConfig = deepFreeze(structuredClone(resolved.config));
			const context = resolved.context === void 0 ? void 0 : deepFreeze(structuredClone(resolved.context));
			const adapterDefaults = deepFreeze({
				...proposed.reasoningEffort === void 0 && resolvedConfig.reasoningEffort !== void 0 ? { reasoningEffort: true } : {},
				...proposed.maxTokens === void 0 && resolvedConfig.maxTokens !== void 0 ? { maxTokens: true } : {}
			});
			let dispatched = false;
			return Object.freeze({
				config: resolvedConfig,
				retryPolicy: registration.retryPolicy,
				adapterDefaults,
				...context === void 0 ? {} : { context },
				...modelInfo.inputModalities === void 0 ? {} : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
				...modelInfo.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: modelInfo.systemPromptUpdate },
				...modelInfo.toolUpdate === void 0 ? {} : { toolUpdate: modelInfo.toolUpdate },
				stream: (options) => {
					if (dispatched) throw new LlmError("a prepared LLM call can only be dispatched once", "INVALID_PREPARED_CALL");
					if (!callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
					dispatched = true;
					return this.streamWithRegistration(options, {
						registration,
						config: resolvedConfig,
						modelInfo,
						dispatch: (options) => adapterCall.stream(options)
					});
				}
			});
		}
		registration(provider) {
			const registration = this.adapters.get(provider);
			if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, "NO_ADAPTER");
			return registration;
		}
		/** Remove replay state whose historical route is owned by another adapter. */
		forAdapter(options, adapter) {
			const messages = options.messages.map((message) => {
				if (message.role !== "assistant") return message;
				const source = message.source;
				if (source.replayState === void 0) return message;
				if (this.adapters.get(source.provider)?.adapter === adapter) return message;
				return freezeMessage({
					...message,
					source: {
						kind: "model",
						provider: source.provider,
						model: source.model
					}
				});
			});
			if (messages.every((message, index) => message === options.messages[index])) return options;
			const filtered = {
				...options,
				messages
			};
			return Object.isFrozen(options) ? deepFreeze(filtered) : filtered;
		}
		/**
		* Resolve the current execution-world read path of one durable file
		* reference through the mounted attachment and filesystem providers.
		*/
		fileReadPath(ref) {
			let hostPath;
			try {
				hostPath = this.ctx.get("attachments")?.fileHostPath(ref);
			} catch {
				return;
			}
			if (hostPath === void 0) return void 0;
			return this.ctx.get("fs")?.processPathFromHostPath(hostPath);
		}
		/**
		* Final adapter boundary. Adapter selection, dispatch, iterator construction,
		* and iteration failures become one terminal failure chunk. Middleware and
		* downstream consumer failures remain thrown plugin or consumer errors.
		*/
		async *adapterStream(options, prepared) {
			let iterator;
			try {
				const registration = prepared?.registration ?? this.registration(options.provider);
				const adapter = registration.adapter;
				let modelInfo;
				let resolvedConfig;
				let dispatch;
				if (prepared === void 0) {
					const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);
					modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model);
					resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
					dispatch = (options) => adapterCall.stream(options);
				} else {
					modelInfo = prepared.modelInfo;
					resolvedConfig = prepared.config;
					dispatch = prepared.dispatch;
				}
				if (prepared !== void 0 && !callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
				const resolvedOptions = callConfigEquals(options, resolvedConfig) ? options : Object.isFrozen(options) ? deepFreeze({
					...options,
					...resolvedConfig
				}) : {
					...options,
					...resolvedConfig
				};
				let projectedMessages = resolvedOptions.messages;
				if (projectedMessages.some((message) => contentHasFile(message.content))) projectedMessages = projectFilesToText(projectedMessages, (ref) => this.fileReadPath(ref));
				if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && projectedMessages.some((message) => contentHasImage(message.content))) projectedMessages = projectImagesForTextModel(projectedMessages);
				const projectedTools = projectToolUpdates(projectedMessages, resolvedOptions.tools, modelInfo.toolUpdate, resolvedOptions.toolHistory);
				projectedMessages = projectedTools.messages;
				let projectedOptions = resolvedOptions;
				if (projectedMessages !== resolvedOptions.messages || projectedTools.tools !== resolvedOptions.tools) {
					projectedOptions = {
						...resolvedOptions,
						messages: projectedMessages,
						...projectedTools.tools === void 0 ? {} : { tools: projectedTools.tools }
					};
					if (Object.isFrozen(resolvedOptions)) deepFreeze(projectedOptions);
				}
				iterator = dispatch(this.forAdapter(projectedOptions, adapter))[Symbol.asyncIterator]();
			} catch (error) {
				yield adapterFailureChunk(error, options.signal);
				return;
			}
			let completed = false;
			try {
				while (true) {
					let item;
					try {
						const next = await iterator.next();
						item = next.done ? { done: true } : {
							done: false,
							value: next.value
						};
					} catch (error) {
						completed = true;
						yield adapterFailureChunk(error, options.signal);
						return;
					}
					if (item.done) {
						completed = true;
						return;
					}
					yield item.value;
				}
			} finally {
				if (!completed) {
					const close = iterator.return?.bind(iterator);
					if (close) await close();
				}
			}
		}
		/**
		* Stream one model call as raw chunks (token-level deltas). Replay state is
		* retained only when the same adapter instance owns its historical provider
		* and the target provider. Final adapter selection remains fixed through
		* asynchronous exact-model resolution and dispatch. Adapter selection,
		* dispatch, and iteration failures become terminal `error` or `aborted`
		* finish chunks; middleware, nested-call, cleanup, and consumer failures
		* remain thrown.
		* @param options - the full request; `options.provider` selects the adapter.
		* @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
		*/
		stream(options) {
			return this.streamWithRegistration(options);
		}
		streamWithRegistration(options, prepared) {
			return this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(options, prepared));
		}
	};
})();
/** Convert one adapter throw into the stream protocol's terminal outcome. */
function adapterFailureChunk(error, signal) {
	const failure = normalizeLlmFailure(error);
	return {
		type: "finish",
		reason: signal?.aborted || failure.code === "ABORTED" ? {
			kind: "aborted",
			failure
		} : {
			kind: "error",
			failure
		}
	};
}
/** Copy a directory entry, including its arrays, so neither side can mutate the other's copy. */
function detachDirectoryEntry(entry) {
	const { nativeAuth } = entry;
	return {
		...entry,
		settingsPath: [...entry.settingsPath],
		...entry.baseURLEnv === void 0 ? {} : { baseURLEnv: [...entry.baseURLEnv] },
		...nativeAuth === void 0 ? {} : { nativeAuth: {
			...nativeAuth,
			env: [...nativeAuth.env]
		} }
	};
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-tools@0.2.2-rc.1_a13a0f05e8644f33708fe2540ec79e5a/node_modules/@deepseek-ai/dsh-tools/lib/shared-DTdn5dXO.js
/** The selected provider is missing or unloaded; another provider must not take its calls. */
var ToolExecutorUnavailableError = class extends HarnessError {
	constructor() {
		super("The selected tool executor is unavailable. Load an executor in this composition before running the agent.", "TOOL_EXECUTOR_UNAVAILABLE");
		this.name = "ToolExecutorUnavailableError";
	}
};
/**
* Enforced JSON Schema subset shared by tool outputs, generated PTC mode
* types, subagents, and workflows. The subset accepts any JSON root, an
* annotation-only schema for unconstrained JSON, one scalar `type`, object
* `properties`/`required`/boolean `additionalProperties`, array `items`,
* type-correct scalar `enum`/`const`, and exact-one `oneOf`.
*
* Unsupported or misplaced keywords reject rather than being accepted without
* enforcement. Consumers that require an object root apply
* {@link assertObjectJsonSchema} before accepting input.
* @module dsh-tools/json-schema
*/
/**
* Thrown when a raw schema falls outside the enforced subset. `violations`
* lists every offending path instead of stopping at the first author error.
*/
var JsonSchemaError = class extends HarnessError {
	/** Individual schema violations in walk order. */
	violations;
	constructor(violations) {
		super(`unsupported JSON schema: ${violations.join("; ")}`, "UNSUPPORTED_SCHEMA");
		this.name = "JsonSchemaError";
		this.violations = violations;
	}
};
const CONSTRAINT_KEYWORDS = /* @__PURE__ */ new Set([
	"type",
	"oneOf",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"enum",
	"const"
]);
const ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set([
	"description",
	"title",
	"default",
	"examples"
]);
const SCHEMA_TYPES = [
	"object",
	"array",
	"string",
	"number",
	"integer",
	"boolean",
	"null"
];
/** Whether a realm-owned intrinsic prototype is backed by its native constructor. */
function hasIntrinsicConstructor(prototype, name) {
	const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
	if (typeof constructor !== "function") return false;
	try {
		return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
	} catch {
		return false;
	}
}
/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype(value) {
	return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, "Object");
}
/**
* Test for a realm-agnostic plain JSON record without accepting arrays or
* exotic objects.
* @param value - candidate record from any JavaScript realm.
* @returns Whether the value has a plain-object prototype chain.
*/
function isPlainJsonRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype(prototype);
	} catch {
		return false;
	}
}
/** Whether an array uses one realm's intrinsic `Array.prototype`. */
function hasPlainArrayPrototype(value) {
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
	const objectPrototype = Object.getPrototypeOf(prototype);
	return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype);
}
/** Return whether a record contains only own enumerable string keys. */
function hasOnlyEnumerableStringKeys(value) {
	try {
		return Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.prototype.propertyIsEnumerable.call(value, key));
	} catch {
		return false;
	}
}
/**
* Test for an ordinary schema record whose keys survive JSON projection.
* @param value - candidate record from any JavaScript realm.
* @returns Whether the record has an intrinsic prototype and only own enumerable string keys.
*/
function isJsonSchemaRecord(value) {
	return isPlainJsonRecord(value) && hasOnlyEnumerableStringKeys(value);
}
/**
* Test for a dense ordinary array with no JSON-invisible decorations.
* @param value - candidate array from any JavaScript realm.
* @returns Whether the array is intrinsic, dense, and undecorated.
*/
function isPlainJsonArray(value) {
	if (!Array.isArray(value)) return false;
	try {
		if (!hasPlainArrayPrototype(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
		for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
		return true;
	} catch {
		return false;
	}
}
/** Lossless finite JSON number, excluding negative zero. */
function isJsonNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}
/** Whether a scalar is valid for one declared schema type. */
function scalarMatches(type, value) {
	switch (type) {
		case "string": return typeof value === "string";
		case "number": return isJsonNumber(value);
		case "integer": return isJsonNumber(value) && Number.isInteger(value);
		case "boolean": return typeof value === "boolean";
		case "null": return value === null;
		/* v8 ignore next -- JsonSchemaScalarType is closed; this retains compile-time exhaustiveness. */
		default: return assertNever(type, "JsonSchemaType");
	}
}
/** Keywords that are invalid beside `oneOf`. */
const ONE_OF_SIBLING_KEYWORDS = [
	"properties",
	"required",
	"additionalProperties",
	"items",
	"enum",
	"const"
];
/** Validate object-only fields after its property schemas have been visited. */
function checkObjectSchemaTail(node, path, properties, violations) {
	const hasRequired = Object.hasOwn(node, "required");
	const required = hasRequired ? node.required : void 0;
	if (hasRequired) if (!isPlainJsonArray(required) || required.some((entry) => typeof entry !== "string")) violations.push(`${path}.required must be an array of strings`);
	else {
		const declared = isJsonSchemaRecord(properties) ? properties : {};
		for (const key of required) if (!Object.hasOwn(declared, key)) violations.push(`${path}.required names "${key}" which is not in properties`);
	}
	if (Object.hasOwn(node, "additionalProperties") && typeof node.additionalProperties !== "boolean") violations.push(`${path}.additionalProperties must be a boolean`);
}
/** Collect every violation for one raw schema tree without using the JavaScript call stack. */
function checkSchemaNode(root, rootPath, violations, seen) {
	const tasks = [{
		kind: "enter",
		node: root,
		path: rootPath
	}];
	for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
		if (task.kind === "leave") {
			seen.delete(task.node);
			continue;
		}
		if (task.kind === "one-of-tail") {
			for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(task.node, key)) violations.push(`${task.path}.${key} is not supported beside oneOf`);
			continue;
		}
		if (task.kind === "object-tail") {
			checkObjectSchemaTail(task.node, task.path, task.properties, violations);
			continue;
		}
		const { node, path } = task;
		if (!isJsonSchemaRecord(node)) {
			violations.push(`${path} must be a schema object`);
			continue;
		}
		if (seen.has(node)) {
			violations.push(`${path} is circular`);
			continue;
		}
		seen.add(node);
		tasks.push({
			kind: "leave",
			node
		});
		for (const key of Object.keys(node)) {
			if (CONSTRAINT_KEYWORDS.has(key)) continue;
			if (ANNOTATION_KEYWORDS.has(key)) {
				try {
					if (!isJsonValue(node[key])) violations.push(`${path}.${key} annotation must be lossless JSON data`);
				} catch {
					violations.push(`${path}.${key} annotation must be lossless JSON data`);
				}
				continue;
			}
			violations.push(`${path}.${key} is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)`);
		}
		if (Object.hasOwn(node, "description") && typeof node.description !== "string") violations.push(`${path}.description must be a string`);
		if (Object.hasOwn(node, "title") && typeof node.title !== "string") violations.push(`${path}.title must be a string`);
		const hasType = Object.hasOwn(node, "type");
		const hasOneOf = Object.hasOwn(node, "oneOf");
		if (hasType && hasOneOf) {
			violations.push(`${path} cannot declare both type and oneOf`);
			continue;
		}
		if (!hasType && !hasOneOf) {
			for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(node, key)) violations.push(`${path}.${key} requires type or oneOf`);
			continue;
		}
		if (hasOneOf) {
			const oneOf = node.oneOf;
			tasks.push({
				kind: "one-of-tail",
				node,
				path
			});
			if (!isPlainJsonArray(oneOf) || oneOf.length < 2) violations.push(`${path}.oneOf must be an array of at least two schemas`);
			else for (let index = oneOf.length - 1; index >= 0; index--) tasks.push({
				kind: "enter",
				node: oneOf[index],
				path: `${path}.oneOf[${index}]`
			});
			continue;
		}
		const type = node.type;
		if (typeof type !== "string" || !SCHEMA_TYPES.includes(type)) {
			violations.push(Array.isArray(type) ? `${path}.type must be a single type string (type arrays are not supported)` : `${path}.type must be one of ${SCHEMA_TYPES.join("/")}`);
			continue;
		}
		const schemaType = type;
		for (const [key, types] of Object.entries({
			properties: ["object"],
			required: ["object"],
			additionalProperties: ["object"],
			items: ["array"],
			enum: [
				"string",
				"number",
				"integer",
				"boolean",
				"null"
			],
			const: [
				"string",
				"number",
				"integer",
				"boolean",
				"null"
			]
		})) if (Object.hasOwn(node, key) && !types.includes(schemaType)) violations.push(`${path}.${key} is not supported on type "${schemaType}"`);
		switch (schemaType) {
			case "object": {
				const properties = Object.hasOwn(node, "properties") ? node.properties : void 0;
				tasks.push({
					kind: "object-tail",
					node,
					path,
					properties
				});
				if (Object.hasOwn(node, "properties")) if (!isJsonSchemaRecord(properties)) violations.push(`${path}.properties must be an object of schemas`);
				else {
					const entries = Object.entries(properties);
					for (let index = entries.length - 1; index >= 0; index--) {
						const entry = entries[index];
						/* v8 ignore next -- the loop is bounded by the captured entry count. */
						if (entry === void 0) continue;
						tasks.push({
							kind: "enter",
							node: entry[1],
							path: `${path}.properties.${entry[0]}`
						});
					}
				}
				break;
			}
			case "array":
				if (Object.hasOwn(node, "items")) tasks.push({
					kind: "enter",
					node: node.items,
					path: `${path}.items`
				});
				break;
			case "string":
			case "number":
			case "integer":
			case "boolean":
			case "null": {
				const hasEnum = Object.hasOwn(node, "enum");
				const allowed = hasEnum ? node.enum : void 0;
				const enumValid = isPlainJsonArray(allowed) && allowed.length > 0 && allowed.every((entry) => scalarMatches(schemaType, entry));
				if (hasEnum && !enumValid) violations.push(`${path}.enum must be a non-empty array of ${schemaType} values`);
				const hasConst = Object.hasOwn(node, "const");
				const declaredConst = hasConst ? node.const : void 0;
				const constValid = scalarMatches(schemaType, declaredConst);
				if (hasConst) {
					if (!constValid) violations.push(`${path}.const must be a ${schemaType} value`);
					else if (enumValid && !allowed.includes(declaredConst)) violations.push(`${path}.const must be one of ${path}.enum when both are declared`);
				}
				break;
			}
			/* v8 ignore next -- schemaType was narrowed from the closed SCHEMA_TYPES table above. */
			default: assertNever(schemaType, "JsonSchemaType");
		}
	}
}
/**
* Assert that an arbitrary raw schema uses only the enforced subset.
* Annotation-only schemas are accepted as the standard unconstrained-JSON
* form; callers that require an object root use {@link assertObjectJsonSchema}.
* @param schema - untrusted raw JSON Schema.
* @returns Assertion that the schema belongs to the supported subset.
*/
function assertSupportedJsonSchema(schema) {
	const violations = [];
	checkSchemaNode(schema, "schema", violations, /* @__PURE__ */ new Set());
	if (violations.length > 0) throw new JsonSchemaError(violations);
}
/** Safely test the lossless JSON boundary when a getter may throw. */
function safelyIsJsonValue(value) {
	try {
		return isJsonValue(value);
	} catch {
		return false;
	}
}
/** Root-aware diagnostic path for the parameter validator's empty sentinel. */
function diagnosticPath(path) {
	return path === "" ? "arguments" : path;
}
/** Append one object property without a leading dot at an implicit root. */
function propertyPath(path, key) {
	return path === "" ? key : `${path}.${key}`;
}
/** The generic exception-containment diagnostic owned by one valid schema node. */
function losslessValueViolation(path) {
	return [`"${diagnosticPath(path)}" must be a lossless JSON value`];
}
/** Append diagnostics without spreading a potentially wide child result as call arguments. */
function appendViolations(target, source) {
	for (const violation of source) target.push(violation);
}
/** Initialize one validation frame with empty aggregation state. */
function valueFrame(node, value, path) {
	return {
		node,
		value,
		path,
		catches: false,
		phase: "start",
		children: [],
		childIndex: 0,
		violations: [],
		tailViolations: [],
		matches: 0
	};
}
/** Validate one scalar node after its primitive type check. */
function checkScalarValue(node, value, path) {
	const allowed = Object.hasOwn(node, "enum") ? node.enum : void 0;
	if (allowed !== void 0 && !allowed.includes(value)) return [`"${diagnosticPath(path)}" must be one of ${JSON.stringify(allowed)}`];
	if (Object.hasOwn(node, "const") && value !== node.const) return [`"${diagnosticPath(path)}" must be ${JSON.stringify(node.const)}`];
	return [];
}
/** Validate one trusted schema/value pair with explicit frames rather than recursive calls. */
function checkValue(schema, value, path) {
	const frames = [valueFrame(schema, value, path)];
	let rootResult;
	const receive = (result) => {
		const parent = frames.at(-1);
		if (parent === void 0) {
			rootResult = result;
			return;
		}
		if (parent.kind === "oneOf") {
			if (result.length === 0) parent.matches++;
		} else appendViolations(parent.violations, result);
	};
	const finish = (result) => {
		frames.pop();
		receive(result);
	};
	while (frames.length > 0) {
		const frame = frames.at(-1);
		/* v8 ignore next -- the loop condition guarantees a current frame. */
		if (frame === void 0) break;
		try {
			if (frame.phase === "children") {
				if (frame.childIndex < frame.children.length) {
					const child = frame.children[frame.childIndex];
					/* v8 ignore next -- childIndex is bounded by children.length. */
					if (child === void 0) throw new Error("missing schema-value child frame");
					frame.childIndex++;
					frames.push(valueFrame(child.node, child.value, child.path));
					continue;
				}
				if (frame.kind === "oneOf") {
					finish(frame.matches === 1 ? [] : [`"${diagnosticPath(frame.path)}" must match exactly one oneOf branch (matched ${frame.matches})`]);
					continue;
				}
				appendViolations(frame.violations, frame.tailViolations);
				if (frame.violations.length > 0) finish(frame.violations);
				else if (frame.kind === "object") finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a lossless JSON object`]);
				else finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a dense lossless JSON array`]);
				continue;
			}
			const nodeType = Object.hasOwn(frame.node, "type") ? frame.node.type : void 0;
			frame.catches = !(nodeType !== void 0 && !SCHEMA_TYPES.includes(nodeType));
			const oneOf = Object.hasOwn(frame.node, "oneOf") ? frame.node.oneOf : void 0;
			if (oneOf !== void 0) {
				frame.kind = "oneOf";
				frame.children = Array.from(oneOf, (branch) => ({
					node: branch,
					value: frame.value,
					path: frame.path
				}));
				frame.childIndex = 0;
				frame.matches = 0;
				frame.phase = "children";
				continue;
			}
			if (nodeType === void 0) {
				finish(safelyIsJsonValue(frame.value) ? [] : losslessValueViolation(frame.path));
				continue;
			}
			switch (nodeType) {
				case "object": {
					if (!isPlainJsonRecord(frame.value)) {
						finish([`"${diagnosticPath(frame.path)}" must be an object`]);
						break;
					}
					const properties = Object.hasOwn(frame.node, "properties") ? frame.node.properties ?? {} : {};
					const violations = [];
					const required = Object.hasOwn(frame.node, "required") ? frame.node.required ?? [] : [];
					for (const key of required) if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) violations.push(`missing required property "${propertyPath(frame.path, key)}"`);
					const children = [];
					for (const [key, child] of Object.entries(properties)) {
						if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) continue;
						children.push({
							node: child,
							value: frame.value[key],
							path: propertyPath(frame.path, key)
						});
					}
					const tailViolations = [];
					if (Object.hasOwn(frame.node, "additionalProperties") && frame.node.additionalProperties === false) {
						for (const key of Object.keys(frame.value)) if (!Object.hasOwn(properties, key)) tailViolations.push(`"${propertyPath(frame.path, key)}" is not a declared property (additionalProperties: false)`);
					}
					frame.kind = "object";
					frame.children = children;
					frame.childIndex = 0;
					frame.violations = violations;
					frame.tailViolations = tailViolations;
					frame.phase = "children";
					break;
				}
				case "array": {
					if (!Array.isArray(frame.value)) {
						finish([`"${diagnosticPath(frame.path)}" must be an array`]);
						break;
					}
					const items = Object.hasOwn(frame.node, "items") ? frame.node.items : void 0;
					const children = items === void 0 ? [] : frame.value.flatMap((entry, index) => [{
						node: items,
						value: entry,
						path: `${frame.path}[${index}]`
					}]);
					frame.kind = "array";
					frame.children = children;
					frame.childIndex = 0;
					frame.violations = [];
					frame.phase = "children";
					break;
				}
				case "string":
					finish(typeof frame.value === "string" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a string`]);
					break;
				case "number":
					finish(typeof frame.value !== "number" ? [`"${diagnosticPath(frame.path)}" must be a number`] : !isJsonNumber(frame.value) ? [`"${diagnosticPath(frame.path)}" must be a finite JSON number`] : checkScalarValue(frame.node, frame.value, frame.path));
					break;
				case "integer":
					finish(!isJsonNumber(frame.value) || !Number.isInteger(frame.value) ? [`"${diagnosticPath(frame.path)}" must be an integer`] : checkScalarValue(frame.node, frame.value, frame.path));
					break;
				case "boolean":
					finish(typeof frame.value === "boolean" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a boolean`]);
					break;
				case "null":
					finish(frame.value === null ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be null`]);
					break;
				default: finish(assertNever(nodeType, "JsonSchemaType"));
			}
		} catch (error) {
			let failed = frames.pop();
			while (failed !== void 0 && !failed.catches) failed = frames.pop();
			if (failed === void 0) throw error;
			receive(losslessValueViolation(failed.path));
		}
	}
	/* v8 ignore next -- every root frame finishes or throws. */
	return rootResult ?? losslessValueViolation(path);
}
/**
* Validate a candidate value against an asserted raw schema. The function is
* total for arbitrary values and returns path-qualified violations.
* @param schema - a schema accepted by {@link assertSupportedJsonSchema}.
* @param value - the candidate JSON value.
* @param path - root label used in diagnostics.
* @returns All violations in walk order; empty means valid.
*/
function validateJsonSchemaValue(schema, value, path = "value") {
	return checkValue(schema, value, path);
}
/** Tool definitions and invocation data shared by registries and executors. @module */
/** Reserved model-facing program transport name. */
const RUN_CODE_NAME = "run_code";
/** Failure to determine a tool's step-time availability. */
var ToolActivationError = class extends HarnessError {
	/**
	* Preserve a condition failure without treating it as normal unavailability.
	* @param name - tool whose condition rejected.
	* @param cause - underlying condition failure.
	*/
	constructor(name, cause) {
		super(`cannot resolve availability of tool "${name}"`, "TOOL_ACTIVATION_FAILED", { cause });
		this.name = "ToolActivationError";
	}
};
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-scope@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-scope/lib/index.js
/**
* Shared insertion-ordered storage and effect ownership for scope-aware registries.
*
* @module @deepseek-ai/dsh-scope
*/
/**
* Insertion-ordered named entries with caller-owned duplicate diagnostics.
*
* Values are borrowed. Iterators are live within one nonempty table
* generation; draining the table detaches them from later insertions. Each
* successful insertion returns an idempotent undo for that exact entry.
*/
var NamedEntries = class {
	duplicateError;
	data = /* @__PURE__ */ new Map();
	constructor(duplicateError) {
		this.duplicateError = duplicateError;
	}
	/**
	* Insert one unique name.
	* @param name - name unique within this table.
	* @param value - borrowed value to retain.
	* @returns an idempotent undo that removes only this insertion.
	*/
	insert(name, value) {
		const data = this.data;
		if (data.has(name)) throw this.duplicateError(name);
		data.set(name, value);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			data.delete(name);
			if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
		};
	}
	/**
	* Read one named value.
	* @param name - name to resolve.
	* @returns the retained value, or `undefined` when absent.
	*/
	get(name) {
		return this.data.get(name);
	}
	/**
	* Test one name for membership.
	* @param name - name to test.
	* @returns whether the table contains that name.
	*/
	has(name) {
		return this.data.has(name);
	}
	/**
	* Iterate live names in insertion order.
	* @returns the native live key iterator.
	*/
	keys() {
		return this.data.keys();
	}
	/**
	* Iterate live entries in insertion order.
	* @returns the native live entry iterator.
	*/
	entries() {
		return this.data.entries();
	}
	/**
	* Iterate live values in insertion order.
	* @returns the native live value iterator.
	*/
	values() {
		return this.data.values();
	}
	/**
	* Test whether this table has no entries.
	* @returns whether the table is empty.
	*/
	isEmpty() {
		return this.data.size === 0;
	}
};
/**
* Insertion-ordered anonymous entries with independent registration identity.
*
* Equal values remain separate registrations. Values are borrowed, and
* iterators are live within one nonempty table generation; draining the table
* detaches them from later appends.
*/
var AnonymousEntries = class {
	data = /* @__PURE__ */ new Map();
	/**
	* Append one independently owned value.
	* @param value - borrowed value to retain.
	* @returns an idempotent undo for this exact append.
	*/
	append(value) {
		const data = this.data;
		const key = Symbol();
		data.set(key, value);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			data.delete(key);
			if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
		};
	}
	/**
	* Iterate live values in insertion order.
	* @returns the native live value iterator.
	*/
	values() {
		return this.data.values();
	}
	/**
	* Test whether this table has no entries.
	* @returns whether the table is empty.
	*/
	isEmpty() {
		return this.data.size === 0;
	}
};
/**
* Own the global and exact-scope layers for one registry.
*
* Reads never create scoped layers. Registrations derive both visibility and
* effect ownership from the supplied Cordis context, collect undo before
* notification, and reclaim only a completely empty aggregate layer.
*/
var ScopedLayers = class {
	createLayer;
	onChange;
	/** The eagerly constructed context-global layer. */
	global;
	scoped = /* @__PURE__ */ new Map();
	constructor(createLayer, onChange) {
		this.createLayer = createLayer;
		this.onChange = onChange;
		this.global = createLayer(void 0);
	}
	/**
	* Read an existing exact-scope overlay. Deliberately chain-blind: callers
	* addressing one scope's OWN contributions (its restrictions, its guards)
	* must not silently pick up an ancestor's — use {@link chainLayers} where
	* inheritance is the point.
	* @param scope - exact scope key; `undefined` denotes no overlay.
	* @returns the existing scoped layer, or `undefined` without creating one.
	*/
	peek(scope) {
		if (scope === void 0) return void 0;
		return this.scoped.get(scope);
	}
	/**
	* Existing overlays along the scope's parent chain ({@link scopeChainOf}),
	* farthest ancestor first and the exact scope last, so a caller layering
	* them in order gives the nearest scope the final word.
	* @param scope - viewing scope, or `undefined` for no overlays.
	* @returns the existing layers, nearest last; absent overlays are skipped.
	*/
	chainLayers(scope) {
		const layers = [];
		for (const key of scopeChainOf(scope).reverse()) {
			const layer = this.scoped.get(key);
			if (layer !== void 0) layers.push(layer);
		}
		return layers;
	}
	/**
	* Materialize global named entries followed by scope-chain shadows,
	* farthest ancestor first, so the nearest scope's entry wins a name.
	* @param scope - viewing scope, or `undefined` for the global view.
	* @param pick - select the named table from a layer.
	* @returns an insertion-ordered effective map.
	*/
	merge(scope, pick) {
		const merged = new Map(pick(this.global).entries());
		for (const layer of this.chainLayers(scope)) for (const [name, value] of pick(layer).entries()) merged.set(name, value);
		return merged;
	}
	/**
	* Attach one synchronous layer mutation to its registration context.
	* @param ctx - context that determines both scope visibility and effect ownership.
	* @param action - atomic mutation returning its synchronous undo.
	* @param options - Cordis effect label and optional change notification.
	* @returns the exact disposer returned by `ctx.effect()`.
	*/
	effect(ctx, action, options) {
		const scope = scopeOf(ctx);
		const notify = options.notify ?? true;
		return ctx.effect(function* () {
			let layer;
			let created = false;
			if (scope === void 0) layer = this.global;
			else {
				const existing = this.scoped.get(scope);
				if (existing === void 0) {
					layer = this.createLayer(scope);
					this.scoped.set(scope, layer);
					created = true;
				} else layer = existing;
			}
			let undo;
			try {
				undo = action(layer);
			} catch (error) {
				if (scope !== void 0 && created && layer.isEmpty()) this.scoped.delete(scope);
				throw error;
			}
			yield () => {
				undo();
				if (scope !== void 0 && layer.isEmpty()) this.scoped.delete(scope);
				if (notify) this.onChange();
			};
			if (notify) this.onChange();
		}.bind(this), options.label);
	}
};
/**
* Scoped-context primitive: mint a Cordis context that tags registrations with
* an opaque identity and build routing-only event carriers for that identity.
*
* @module @deepseek-ai/dsh-scope
*/
/** Context tag written by {@link createScope}. */
const kScope = Symbol("dsh.scope");
/**
* The enclosing scope of each key. One relation powers both directions of
* scope nesting: registration views inherit DOWN the chain (a child scope
* sees its ancestors' layers — {@link ScopedLayers}), and event admission
* extends UP it (a listener tagged with an ancestor receives events dispatched
* to a descendant key — {@link scopeTarget}).
*/
const scopeParents = /* @__PURE__ */ new WeakMap();
/**
* The chain from a key to its root ancestor.
* @param key - the starting key, or `undefined` for the empty chain.
* @returns keys nearest-first: `[key, parent, grandparent, …]`.
*/
function scopeChainOf(key) {
	const chain = [];
	for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) chain.push(cursor);
	return chain;
}
/**
* Read the nearest scope tag inherited by a context.
* @param ctx - context to inspect.
* @returns its scope key, or `undefined` for an unscoped context.
*/
function scopeOf(ctx) {
	return ctx[kScope];
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-tools@0.2.2-rc.1_a13a0f05e8644f33708fe2540ec79e5a/node_modules/@deepseek-ai/dsh-tools/lib/index.js
/** Unified JSON-value schema DSL, inference, compilation, and tool definition helpers. @module dsh-tools/schema */
const ANNOTATION_KEYS = [
	"description",
	"title",
	"default",
	"examples"
];
/** Throw one author-schema violation through the shared schema error type. */
function authorError(message) {
	throw new JsonSchemaError([message]);
}
/** Copy own annotation fields for validation by the raw-schema boundary. */
function copyAnnotations(source, target) {
	if (Object.hasOwn(source, "description")) target.description = source.description;
	if (Object.hasOwn(source, "title")) target.title = source.title;
	if (Object.hasOwn(source, "default")) target.default = source.default;
	if (Object.hasOwn(source, "examples")) target.examples = source.examples;
}
/** Reject author-only keys outside one node's declared vocabulary. */
function assertAuthorKeys(source, path, allowed) {
	for (const key of Object.keys(source)) if (!allowed.includes(key)) authorError(`${path}.${key} is not supported by the value schema DSL`);
}
/** Install a compiled node without giving `__proto__` assignment semantics. */
function assignCompiledNode(destination, node) {
	switch (destination.kind) {
		case "root":
			destination.holder.value = node;
			break;
		case "property":
			Object.defineProperty(destination.target, destination.key, {
				value: node,
				enumerable: true,
				configurable: true,
				writable: true
			});
			break;
		case "item":
			destination.target.items = node;
			break;
		case "one-of": destination.target[destination.index] = node;
	}
}
/** Install a compiled property map at its root or containing object node. */
function assignCompiledPropertyMap(destination, compiled) {
	if (destination.kind === "root") destination.holder.value = compiled;
	else destination.target.properties = compiled.properties;
}
/** Execute an author-schema compilation task graph without recursive descent. */
function runSchemaCompiler(initial) {
	const seen = /* @__PURE__ */ new Set();
	const tasks = [initial];
	for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
		if (task.kind === "leave") {
			seen.delete(task.input);
			continue;
		}
		if (task.kind === "property-map-tail") {
			if (task.required.length > 0) {
				task.compiled.required = task.required;
				if (task.destination.kind === "object") task.destination.target.required = task.required;
			}
			continue;
		}
		if (task.kind === "property") {
			if (!isJsonSchemaRecord(task.property)) authorError(`${task.path} must be a value schema object`);
			if (Object.hasOwn(task.property, "required") && task.property.required !== true) authorError(`${task.path}.required must be true when present`);
			if (Object.hasOwn(task.property, "required") && task.property.required === true) task.required.push(task.key);
			tasks.push({
				kind: "value",
				input: task.property,
				path: task.path,
				allowRequired: true,
				destination: {
					kind: "property",
					target: task.properties,
					key: task.key
				}
			});
			continue;
		}
		if (task.kind === "property-map") {
			if (!isJsonSchemaRecord(task.input)) authorError(`${task.path} must be an object of value schemas`);
			if (seen.has(task.input)) authorError(`${task.path} is circular`);
			seen.add(task.input);
			const compiled = { properties: {} };
			const required = [];
			assignCompiledPropertyMap(task.destination, compiled);
			tasks.push({
				kind: "leave",
				input: task.input
			});
			tasks.push({
				kind: "property-map-tail",
				compiled,
				required,
				destination: task.destination
			});
			const entries = Object.entries(task.input);
			for (let index = entries.length - 1; index >= 0; index--) {
				const entry = entries[index];
				/* v8 ignore next -- the loop is bounded by the captured entry count. */
				if (entry === void 0) continue;
				tasks.push({
					kind: "property",
					property: entry[1],
					path: `${task.path}.${entry[0]}`,
					key: entry[0],
					properties: compiled.properties,
					required
				});
			}
			continue;
		}
		const { input, path } = task;
		if (!isJsonSchemaRecord(input)) authorError(`${path} must be a value schema object`);
		if (seen.has(input)) authorError(`${path} is circular`);
		seen.add(input);
		const authorKeys = [...ANNOTATION_KEYS, ...task.allowRequired ? ["required"] : []];
		const node = {};
		assignCompiledNode(task.destination, node);
		tasks.push({
			kind: "leave",
			input
		});
		if (Object.hasOwn(input, "oneOf")) {
			assertAuthorKeys(input, path, [
				...authorKeys,
				"oneOf",
				"type"
			]);
			if (Object.hasOwn(input, "type")) authorError(`${path} cannot declare both type and oneOf`);
			if (!isPlainJsonArray(input.oneOf)) authorError(`${path}.oneOf must be an array of at least two value schemas`);
			const branches = [];
			node.oneOf = branches;
			copyAnnotations(input, node);
			for (let index = input.oneOf.length - 1; index >= 0; index--) tasks.push({
				kind: "value",
				input: input.oneOf[index],
				path: `${path}.oneOf[${index}]`,
				allowRequired: false,
				destination: {
					kind: "one-of",
					target: branches,
					index
				}
			});
			continue;
		}
		const inputType = Object.hasOwn(input, "type") ? input.type : void 0;
		switch (inputType) {
			case "json":
				assertAuthorKeys(input, path, [...authorKeys, "type"]);
				copyAnnotations(input, node);
				break;
			case "object":
				assertAuthorKeys(input, path, [
					...authorKeys,
					"type",
					"properties",
					"additionalProperties"
				]);
				if (!Object.hasOwn(input, "additionalProperties") || typeof input.additionalProperties !== "boolean") authorError(`${path}.additionalProperties must be explicitly true or false`);
				node.type = "object";
				copyAnnotations(input, node);
				node.additionalProperties = input.additionalProperties;
				if (Object.hasOwn(input, "properties")) tasks.push({
					kind: "property-map",
					input: input.properties,
					path: `${path}.properties`,
					destination: {
						kind: "object",
						target: node
					}
				});
				break;
			case "array":
				assertAuthorKeys(input, path, [
					...authorKeys,
					"type",
					"items"
				]);
				node.type = "array";
				copyAnnotations(input, node);
				if (Object.hasOwn(input, "items")) tasks.push({
					kind: "value",
					input: input.items,
					path: `${path}.items`,
					allowRequired: false,
					destination: {
						kind: "item",
						target: node
					}
				});
				break;
			case "string":
			case "number":
			case "integer":
			case "boolean":
			case "null":
				assertAuthorKeys(input, path, [
					...authorKeys,
					"type",
					"enum",
					"const"
				]);
				node.type = inputType;
				copyAnnotations(input, node);
				if (Object.hasOwn(input, "enum")) {
					if (!isPlainJsonArray(input.enum)) authorError(`${path}.enum must be a non-empty array of scalar values`);
					node.enum = Array.from(input.enum, (entry) => entry);
				}
				if (Object.hasOwn(input, "const")) node.const = input.const;
				break;
			default: authorError(`${path}.type must be string/number/integer/boolean/null/array/object/json, or use oneOf`);
		}
	}
}
/** Compile one implicit property map, collecting per-property requiredness. */
function compilePropertyMap(input, path) {
	const holder = {};
	runSchemaCompiler({
		kind: "property-map",
		input,
		path,
		destination: {
			kind: "root",
			holder
		}
	});
	/* v8 ignore next -- the root task assigns before scheduling any descendants. */
	return holder.value ?? authorError(`${path} did not compile`);
}
/** Compile one author node without applying any consumer root restriction. */
function compileValueSchema(input, path) {
	const holder = {};
	runSchemaCompiler({
		kind: "value",
		input,
		path,
		allowRequired: false,
		destination: {
			kind: "root",
			holder
		}
	});
	/* v8 ignore next -- the root task assigns before scheduling any descendants. */
	return holder.value ?? authorError(`${path} did not compile`);
}
/**
* Compile one author-facing value schema to the enforced raw JSON Schema
* subset. The author-only `json` node becomes an annotation-only schema.
* @param spec - schema for any JSON-value root.
* @returns The asserted raw schema projection.
*/
function valueSchemaSpecToJsonSchema(spec) {
	const schema = compileValueSchema(spec, "schema");
	assertSupportedJsonSchema(schema);
	return schema;
}
/**
* Compile the implicit open parameter object into raw JSON Schema.
* @param spec - per-property parameter definitions.
* @returns An object-rooted raw schema with no implicit-root openness override.
*/
function parameterSchemaSpecToJsonSchema(spec) {
	const compiled = compilePropertyMap(spec, "parameters");
	const schema = {
		type: "object",
		properties: compiled.properties,
		...compiled.required === void 0 ? {} : { required: compiled.required }
	};
	assertSupportedJsonSchema(schema);
	return schema;
}
/** Invalid model-generated arguments for a typed tool. */
var ToolArgsError = class extends HarnessError {
	/** Individual violations in schema-walk order. */
	violations;
	constructor(violations) {
		super(`invalid arguments: ${violations.join("; ")}`, "INVALID_ARGS");
		this.name = "ToolArgsError";
		this.violations = violations;
	}
};
/**
* Define a first-party tool with inferred arguments and strict execution
* validation. Replay-only presenters validate softly and fall back to generic
* rendering for obsolete logged arguments.
* @param options - typed definition and optional finalizer and presenters.
* @returns A registry-ready definition.
*/
function defineTool(options) {
	const userExecute = options.execute;
	const userFinalizeContent = options.finalizeContent;
	const userProjectContent = options.projectContent;
	const userRender = options.output.render;
	const userPresentationMeta = options.output.presentationMeta;
	const userPresentCall = options.presentCall;
	const userPresentResult = options.presentResult;
	const userIsConcurrencySafe = options.isConcurrencySafe;
	if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error(`defineTool(${options.name}): timeoutMs must be a positive finite number`);
	const parameters = parameterSchemaSpecToJsonSchema(options.parameters);
	const outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);
	const validate = (args) => validateJsonSchemaValue(parameters, args, "");
	const tool = {
		name: options.name,
		description: options.description,
		parameters,
		output: {
			schema: outputSchema,
			render(args, value) {
				return userRender(args, value);
			},
			...userPresentationMeta !== void 0 ? { presentationMeta(args, value) {
				return userPresentationMeta(args, value);
			} } : {}
		},
		...options.deferLoading === true ? { deferLoading: options.deferLoading } : {},
		...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {},
		async execute(args, exec) {
			const violations = validate(args);
			if (violations.length > 0) throw new ToolArgsError(violations);
			return userExecute(args, exec);
		}
	};
	if (userProjectContent) tool.projectContent = (exec, result) => userProjectContent(exec, result);
	if (userFinalizeContent) tool.finalizeContent = (exec, result) => userFinalizeContent(exec, result);
	if (userPresentCall) tool.presentCall = (args) => {
		if (validate(args).length > 0) return void 0;
		return userPresentCall(args);
	};
	if (userPresentResult) tool.presentResult = (args, result) => {
		if (validate(args).length > 0) return void 0;
		return userPresentResult(args, result);
	};
	if (userIsConcurrencySafe) tool.isConcurrencySafe = (args) => {
		if (validate(args).length > 0) return false;
		return userIsConcurrencySafe(args);
	};
	return tool;
}
/**
* Omit execution and presentation callbacks from a tool definition.
* @param definition - visible capability or executor-owned transport.
* @param detachParameters - copy parameters for a caller-owned inspection result.
* @returns the model-facing schema fields.
*/
function projectToolSchema(definition, detachParameters) {
	const { name, description, parameters, deferLoading } = definition;
	const detached = detachParameters ? snapshotJsonValue(parameters) : parameters;
	if (detached === void 0) throw new Error(`tool "${name}" parameters must be lossless JSON before schema projection`);
	return {
		name,
		description,
		parameters: detached,
		...deferLoading === true ? { deferLoading } : {}
	};
}
/** Tool definitions and scoped dispatch to plugin-owned executors. @module */
/** One scope's complete tool-registry contribution. */
var ToolLayer = class {
	tools;
	restrictions = new AnonymousEntries();
	constructor(scope) {
		this.tools = new NamedEntries((name) => /* @__PURE__ */ new Error(scope === void 0 ? `tool "${name}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)` : `tool "${name}" is already registered in this scope`));
	}
	/** Whether every contribution table in this aggregate layer is empty. */
	isEmpty() {
		return this.tools.isEmpty() && this.restrictions.isEmpty();
	}
	/** Whether every compiled restriction in this layer admits a global tool name. */
	admits(name) {
		for (const filter of this.restrictions.values()) if (filter.allow !== void 0 && !filter.allow.has(name) || filter.deny !== void 0 && filter.deny.has(name)) return false;
		return true;
	}
};
var GuardLayer = class {
	guards = new AnonymousEntries();
	isEmpty() {
		return this.guards.isEmpty();
	}
};
/** Concrete tool registry and scoped executor dispatcher. */
var ToolsService = class extends Service {
	static inject = ["systemPrompt"];
	static Config = z.object({
		mode: z.never().description("Removed. Mount a native or PTC tool executor instead."),
		maxParallelSubCalls: z.never().description("Moved to the PTC tool executor configuration.")
	});
	layers = new ScopedLayers((scope) => new ToolLayer(scope), () => {
		this.ctx.emit("tools/change");
	});
	scoped = /* @__PURE__ */ new WeakMap();
	root;
	guards = new ScopedLayers(() => new GuardLayer(), () => {});
	constructor(ctx) {
		super(ctx, "tools");
		ctx.systemPrompt.tools(({ scope, toolSet }) => {
			const description = this.selectExecutor(scope).describe(this.definitions(scope, toolSet));
			return {
				...description,
				knownNames: description.knownNames ?? [...this.view(scope).knownNames]
			};
		});
	}
	/**
	* Register globally or in the calling agent scope. Scoped tools shadow
	* globals; duplicates within one layer and the reserved `run_code` name fail.
	* @param definition - tool schema, execution, and optional finalization/presentation callbacks.
	* @param options - optional step-time activation condition.
	* @returns the exact disposer that unregisters the tool.
	*/
	register(definition, options = {}) {
		const name = definition.name;
		const output = definition.output;
		if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || output.presentationMeta !== void 0 && typeof output.presentationMeta !== "function") throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`);
		assertSupportedJsonSchema(output.schema);
		const timeoutMs = definition.timeoutMs;
		if (timeoutMs !== void 0 && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new TypeError(`tool "${name}" timeoutMs must be a positive finite number`);
		if (name === "run_code") throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the PTC mode presentation transport and cannot be registered or shadowed`);
		return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name, {
			definition,
			when: options.when
		}), { label: "tools.register()" });
	}
	/**
	* Restrict global tools for the calling agent scope. Empty filters, unknown
	* names, scope-local names, and reserved transport names fail. Restrictions
	* intersect; scoped registrations remain visible.
	* @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
	* @returns the exact disposer that lifts this restriction.
	*/
	restrict(filter) {
		const scope = scopeOf(this.ctx);
		if (scope === void 0) throw new Error("tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead");
		const allow = filter.allow;
		const deny = filter.deny;
		if (allow === void 0 && deny === void 0) throw new Error("tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)");
		const compiled = {
			...allow !== void 0 ? { allow: new Set(allow) } : {},
			...deny !== void 0 ? { deny: new Set(deny) } : {}
		};
		if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(`tools.restrict() cannot name reserved PTC mode presentation transport "${RUN_CODE_NAME}"; restrict end-capability tools instead`);
		const known = this.view(scope).restrictableNames;
		const unknown = [...allow ?? [], ...deny ?? []].filter((name) => !known.has(name));
		if (unknown.length > 0) throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}; known global tools: ${[...known].sort().join(", ") || "(none)"}`);
		return this.layers.effect(this.ctx, (layer) => layer.restrictions.append(compiled), { label: "tools.restrict()" });
	}
	/**
	* Resolve visible tools and pre-restriction names. Restrictions across the
	* scope chain intersect over inherited global and ancestor tools; the viewing
	* scope's own registrations remain exempt. Nearer registrations shadow
	* farther ones. Pre-restriction names support restriction and prompt-order validation.
	* @param scope - the viewing scope (the agent), or undefined for the global view.
	* @returns the complete derived view for that scope.
	*/
	view(scope) {
		const layers = this.layers.chainLayers(scope);
		const own = this.layers.peek(scope);
		const inherited = new Map(this.layers.global.tools.entries());
		for (const layer of layers) {
			if (layer === own) continue;
			for (const [name, registration] of layer.tools.entries()) inherited.set(name, registration);
		}
		const visible = /* @__PURE__ */ new Map();
		const registrations = /* @__PURE__ */ new Map();
		const knownNames = /* @__PURE__ */ new Set();
		const restrictableNames = /* @__PURE__ */ new Set();
		for (const [name, registration] of inherited) {
			knownNames.add(name);
			restrictableNames.add(name);
			if (layers.every((layer) => layer.admits(name))) {
				visible.set(name, registration.definition);
				registrations.set(name, registration);
			}
		}
		if (own !== void 0) for (const [name, registration] of own.tools.entries()) {
			knownNames.add(name);
			visible.set(name, registration.definition);
			registrations.set(name, registration);
		}
		return {
			visible,
			registrations,
			knownNames,
			restrictableNames
		};
	}
	/**
	* Look up a tool as one scope sees it (scoped
	* shadows global; a restricted-away global reads as absent). Presenters pass
	* the calling agent so the rendered card matches the definition that
	* actually executed.
	* @param name - the tool name as registered.
	* @param scope - the viewing scope (the agent); omitted = the global view.
	* @param toolSet - step admission; omit only to inspect registered definitions.
	* @returns the definition the scope resolves, or undefined when none is visible.
	*/
	get(name, scope, toolSet) {
		return toolSet === void 0 ? this.view(scope).visible.get(name) : toolSet.view(scope).get(name);
	}
	/**
	* Resolve the definition a call may execute. With a step's admitted set, the
	* set decides; without one, conditional registrations are unavailable.
	* @param name - the tool name as registered.
	* @param scope - the calling agent; omitted = the global view.
	* @param toolSet - step admission, or omitted for a call outside a model step.
	* @returns the executable definition, or undefined when the call must fail as `UNKNOWN_TOOL`.
	*/
	executable(name, scope, toolSet) {
		if (toolSet !== void 0) return toolSet.view(scope).get(name);
		const view = this.view(scope);
		return view.registrations.get(name)?.when === void 0 ? view.visible.get(name) : void 0;
	}
	/**
	* Resolve conditions once for this step without changing shared registrations.
	* Cancellation or a rejected condition publishes no partial selection. Removed
	* registrations cannot be restored by a late condition result.
	* @param context - preparing agent, captured model selection, and cancellation.
	* @returns the complete selection; the caller disposes it after its tool batch settles.
	*/
	async resolve(context) {
		const { agent, signal } = context;
		signal.throwIfAborted();
		const view = this.view(agent);
		const admitted = /* @__PURE__ */ new Map();
		for (const [name, definition] of view.visible) {
			const registration = view.registrations.get(name);
			let enabled;
			try {
				enabled = registration?.when === void 0 || await registration.when(context);
			} catch (cause) {
				signal.throwIfAborted();
				throw new ToolActivationError(name, cause);
			}
			signal.throwIfAborted();
			if (enabled) admitted.set(name, definition);
		}
		let closed = false;
		return Object.freeze({
			dispose: () => {
				closed = true;
			},
			view: (scope) => {
				const visible = /* @__PURE__ */ new Map();
				if (closed || scope !== agent) return visible;
				const current = this.view(agent);
				for (const [name, definition] of admitted) if (current.visible.get(name) === definition && current.registrations.get(name) === view.registrations.get(name)) visible.set(name, definition);
				return visible;
			}
		});
	}
	/**
	* Read the visible capability definitions for descriptions and program bindings.
	* @param scope - viewing Agent or preset; omitted selects the global view.
	* @param toolSet - step admission; omit only to inspect registered definitions.
	* @returns definitions after scoped shadowing and restrictions, limited to the step's admission when given.
	*/
	definitions(scope, toolSet) {
		return toolSet === void 0 ? [...this.view(scope).visible.values()] : [...toolSet.view(scope).values()];
	}
	/**
	* Project visible definitions onto the allowlisted model-facing schema fields,
	* excluding execution and presentation callbacks.
	* @param scope - the viewing scope (the agent); omitted = the global view.
	* @param toolSet - step admission, or omitted for registered-definition inspection.
	* @returns one deep-cloned schema per visible tool.
	*/
	schemas(scope, toolSet) {
		return this.definitions(scope, toolSet).map((definition) => projectToolSchema(definition, true));
	}
	/**
	* Provide the executor for the calling scope; an unscoped contribution is the deployment default.
	* Rendering any executor-owned section requires the viewing scope's selection to remain available.
	* @param executor - initialized provider owned by the contributing plugin.
	* @returns the effect disposer. Unloading leaves the selection unavailable until it is replaced.
	*/
	setExecutor(executor) {
		const scope = scopeOf(this.ctx);
		if ((scope === void 0 ? this.root : this.scoped.get(scope))?.executor !== void 0) throw new Error("Only one tool executor may be registered in each scope");
		const record = { executor };
		return this.ctx.effect(function* () {
			for (const section of executor.sections ?? []) yield this.ctx.systemPrompt.section({
				name: section.name,
				order: section.order,
				...section.interpolate === void 0 ? {} : { interpolate: section.interpolate },
				text: ({ scope, toolSet }) => {
					if (this.selectExecutor(scope) !== executor) return "";
					return typeof section.text === "function" ? section.text(this.definitions(scope, toolSet)) : section.text;
				}
			});
			if (scope === void 0) this.root = record;
			else this.scoped.set(scope, record);
			yield () => {
				record.executor = void 0;
			};
		}.bind(this), "tools.setExecutor()");
	}
	/**
	* Resolve the nearest scoped provider, or the deployment default.
	* @param scope - Agent or preset scope; omitted selects only the root contribution.
	* @returns the selected executor; throws when it is missing or unloaded.
	*/
	selectExecutor(scope) {
		let record;
		for (const key of scopeChainOf(scope)) {
			record = this.scoped.get(key);
			if (record !== void 0) break;
		}
		record ??= this.root;
		const executor = record?.executor;
		if (executor === void 0) throw new ToolExecutorUnavailableError();
		return executor;
	}
	/**
	* Delegate a raw call batch to its Agent's provider or the deployment default.
	* Select at dispatch; accepted batches settle through that provider even if it unloads.
	* @param input - original calls, optional owning Agent, and optional logging step.
	* @returns the selected executor's settled batch; unavailable selections reject.
	*/
	async execute(input) {
		return this.selectExecutor(input.agent).execute(input);
	}
	/**
	* Register a monotonic denial in the calling scope.
	* @param guard - evaluated after extensible pre-execute policy by the shared pipeline.
	* @returns the effect disposer that removes this guard.
	*/
	guard(guard) {
		return this.guards.effect(this.ctx, (layer) => layer.guards.append(guard), { label: "tools.guard()" });
	}
	/**
	* Check global and inherited guards after pre-execute policy and approval resolve.
	* @param exec - invocation whose guards are checked before dispatch.
	* @returns the first denial reason, or undefined when no guard denies.
	*/
	checkGuards(exec) {
		for (const layer of [this.guards.global, ...this.guards.chainLayers(exec.agent)]) for (const guard of layer.guards.values()) {
			const reason = guard(exec);
			if (reason !== void 0) return reason;
		}
	}
};
//#endregion
//#region lib/types/tools.js
/**
* Model-facing tools. Kept few and terse on purpose: every schema is sent with
* every request, and the old plugin's ~20 verbose tools cost a lot of tokens.
*/
function attachmentSchema() {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			attachmentId: {
				type: "string",
				required: true
			},
			mediaType: {
				type: "string",
				required: true
			},
			bytes: {
				type: "integer",
				required: true
			},
			width: {
				type: "integer",
				required: true
			},
			height: {
				type: "integer",
				required: true
			},
			name: { type: "string" },
			originalDimensions: {
				type: "object",
				additionalProperties: false,
				properties: {
					width: {
						type: "integer",
						required: true
					},
					height: {
						type: "integer",
						required: true
					}
				}
			}
		}
	};
}
/** windows list notes about the layout before the task. */
const ORIGIN = {
	opened: " | opened during this task",
	minimized: " | was minimized before this task",
	tray: " | was in the system tray before this task"
};
const output = {
	schema: {
		type: "object",
		additionalProperties: false,
		properties: {
			text: {
				type: "string",
				required: true
			},
			image: attachmentSchema()
		}
	},
	render: (_args, value) => value.image === void 0 ? [{
		type: "text",
		text: value.text
	}] : [{
		type: "text",
		text: value.text
	}, {
		type: "image",
		attachment: value.image
	}]
};
function toJson(ref) {
	return {
		attachmentId: String(ref.attachmentId),
		mediaType: ref.mediaType,
		bytes: ref.bytes,
		width: ref.width,
		height: ref.height,
		...ref.name === void 0 ? {} : { name: ref.name },
		...ref.originalDimensions === void 0 ? {} : { originalDimensions: {
			width: ref.originalDimensions.width,
			height: ref.originalDimensions.height
		} }
	};
}
async function withShot(host, text, shot, call) {
	if (shot === void 0) return { text };
	if (shot === "unchanged") return { text: `${text}
${UNCHANGED_TEXT}` };
	if (!call.vision) return { text: `${text}\n(The current model cannot view images; use ui_elements to read the screen.)` };
	const ref = await host.saveImage(shot, "screenshot.jpg");
	return {
		text: `${text}\nScreenshot ${shot.width}x${shot.height} attached; use its pixel coordinates for the next actions.`,
		image: toJson(ref)
	};
}
function card(title) {
	return {
		card: "generic",
		title,
		kind: "other"
	};
}
const coordinate = {
	type: "array",
	items: { type: "number" },
	description: "[x, y] in pixels of the latest screenshot."
};
/** Reads what a window says through UI Automation: exact text, no image. */
async function windowText(computer, hwnd, tail) {
	const result = await computer.helper.call("text", {
		...hwnd === void 0 ? {} : { hwnd },
		tail: Math.min(2e4, Math.max(200, Math.round(tail ?? 4e3)))
	}, 2e4);
	const head = `${result.exe} — "${String(result.title ?? "").slice(0, 80)}"`;
	if (!result.text || result.source === "none") return `${head}: this window exposes no readable text; use a screenshot.`;
	return `${head}: ${result.truncated ? `last ${result.text.length} of ${result.length} characters` : `${result.length} characters`}${result.source === "labels" ? " (visible labels, top to bottom)" : ""}.\n${result.text}`;
}
const actionProperties = {
	action: {
		type: "string",
		enum: [...ACTIONS],
		required: true,
		description: "What to do."
	},
	coordinate,
	start_coordinate: {
		...coordinate,
		description: "Drag start [x, y] (left_click_drag)."
	},
	text: {
		type: "string",
		description: "type: text to enter. key/hold_key: xdotool-style keys, e.g. \"ctrl+s\", \"Return\", \"alt+Tab\", \"ctrl+a Delete\". Clicks: optional modifier keys like \"ctrl\"."
	},
	modifiers: {
		type: "string",
		description: "Modifier keys held during a click or scroll, e.g. \"shift\" or \"ctrl+shift\"."
	},
	scroll_direction: {
		type: "string",
		enum: [
			"up",
			"down",
			"left",
			"right"
		]
	},
	scroll_amount: {
		type: "integer",
		description: "Wheel notches (default 3)."
	},
	duration: {
		type: "number",
		description: "Seconds for wait / hold_key (with until: the timeout, default 10)."
	},
	target: {
		type: "string",
		description: "Instead of coordinate: the visible name of a control in the foreground window or its open menu, e.g. \"保存\" or \"按钮:保存\". Works for controls that were not in your last screenshot (the item of a menu the previous step opens); waits up to 3 s for it. With type: clicks the field first."
	},
	until: {
		type: "string",
		description: "wait: return as soon as this is there, \"window:<title or exe part>\" or \"target:<control name>\", instead of waiting a fixed time."
	},
	gone: {
		type: "boolean",
		description: "wait until: wait for it to disappear instead."
	},
	region: {
		type: "array",
		items: { type: "number" },
		description: "zoom: [x1, y1, x2, y2] in screenshot pixels."
	}
};
const BATCH_ACTIONS = ACTIONS.filter((action) => action !== "screenshot");
function createTools(host) {
	const { computer } = host;
	const tools = [];
	tools.push(defineTool({
		name: "computer",
		description: "Control the Windows desktop with the mouse and keyboard, like a person. Coordinates are pixels of the latest screenshot (the plugin handles DPI and scaling). Clicks, typing, keys, scrolls and wait return a fresh screenshot automatically (taken once the screen settles), so do not call screenshot again right after. Prefer keyboard shortcuts when they are reliable. zoom shows a region at full resolution for small text.",
		parameters: actionProperties,
		output,
		timeoutMs: 18e5,
		async execute(args, exec) {
			const call = await host.context(exec);
			const input = args;
			try {
				const outcome = await computer.run(input, call);
				if (outcome.image) return withShot(host, outcome.text, outcome.image, call);
				const shot = await computer.after([input], call);
				return withShot(host, shot === void 0 && input.action !== "wait" && input.action !== "cursor_position" ? `${outcome.text} ${await computer.describeForeground()}` : outcome.text, shot, call);
			} catch (error) {
				if (call.signal.aborted) await computer.releaseHeld();
				throw error;
			}
		},
		presentCall: (args) => card(`电脑操作 · ${Computer.statusOf(args)}`)
	}));
	tools.push(defineTool({
		name: "computer_batch",
		description: "Run ordered computer actions; returns one settled screenshot and stops on failure or user takeover. Use target/until for controls appearing mid-batch. Re-observe after partial completion. See windows-computer-use for batching procedures.",
		parameters: {
			actions: {
				type: "array",
				required: true,
				description: "Ordered actions, same fields as the computer tool. zoom is allowed only as the last action (you get the zoomed region instead of the full screenshot).",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						...actionProperties,
						action: {
							...actionProperties.action,
							enum: BATCH_ACTIONS
						}
					}
				}
			},
			finish: {
				type: "string",
				enum: [
					"screenshot",
					"text",
					"none"
				],
				description: "What to return after the actions: screenshot (default), text (what the foreground window says, read as text: cheaper and exact when you only need the words), or none."
			}
		},
		output,
		timeoutMs: 18e5,
		async execute(args, exec) {
			const call = await host.context(exec);
			const actions = args.actions;
			const finish = args.finish ?? "screenshot";
			let zoomed;
			if (!Array.isArray(actions) || actions.length === 0) throw new Error("actions must be a non-empty array.");
			if (actions.length > 30) throw new Error("At most 30 actions per batch.");
			const lines = [];
			let failure;
			for (const [index, input] of actions.entries()) {
				if (input.action === "screenshot" || input.action === "zoom" && index !== actions.length - 1) {
					failure = `#${index + 1} ${input.action}: ${input.action === "zoom" ? "only allowed as the last action of a batch" : "not allowed in a batch"}.`;
					break;
				}
				try {
					const stepStart = Date.now();
					if (input.action === "zoom" && index > 0) await computer.settle(call.signal);
					const outcome = await computer.run(input, call);
					if (input.action === "zoom") zoomed = outcome.image;
					if (outcome.skipped) {
						failure = `#${index + 1} ${input.action} skipped: the user was typing on the keyboard. Re-check the screen before continuing.`;
						break;
					}
					lines.push(`#${index + 1} ${outcome.text}`);
					await setTimeout$1(60, void 0, { signal: call.signal });
					if (computer.settings().pauseOnUserInput && computer.overlay.userTypedSince(stepStart - 1)) {
						failure = `#${index + 1} done, but the user typed on the keyboard meanwhile; remaining actions stopped. Re-check the screen before continuing.`;
						break;
					}
				} catch (error) {
					if (call.signal.aborted) {
						await computer.releaseHeld();
						throw error;
					}
					failure = `#${index + 1} ${input.action} failed: ${error instanceof Error ? error.message : String(error)}`;
					break;
				}
			}
			const done = lines.join("\n");
			const summary = failure === void 0 ? `All ${actions.length} actions done.\n${done}` : `Stopped: ${failure}${done ? `\nCompleted before it:\n${done}` : ""}\nRemaining actions were skipped.`;
			if (zoomed !== void 0 && failure === void 0) return withShot(host, summary, zoomed, call);
			if (failure === void 0 && finish === "none") return { text: `${summary}\n${await computer.describeForeground()}` };
			if (failure === void 0 && finish === "text") {
				await computer.settle(call.signal);
				return { text: `${summary}\n${await windowText(computer, void 0, void 0).catch((error) => `Could not read the window text: ${error instanceof Error ? error.message : String(error)}`)}` };
			}
			const waited = failure === void 0 && actions[actions.length - 1]?.action === "wait";
			const shot = call.vision && computer.settings().autoScreenshot ? await (waited ? Promise.resolve() : computer.settle(call.signal)).then(() => computer.freshShot()) : void 0;
			return withShot(host, shot === void 0 ? `${summary}\n${await computer.describeForeground()}` : summary, shot, call);
		},
		presentCall: (args) => card(`电脑操作 · 批量 ${args.actions?.length ?? 0} 步`)
	}));
	tools.push(defineTool({
		name: "open_application",
		description: "Open an app by name (e.g. \"Chrome\", \"记事本\", \"微信\", \"Excel\"), an .exe path, or a URL, or bring it to the front if it is already running. Faster and more reliable than clicking the taskbar or Start menu. Returns a screenshot.",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "App name as shown in the Start menu, an executable path, or an http(s) URL."
			},
			new_instance: {
				type: "boolean",
				description: "Start another copy even though the app is already running. Only when the user explicitly asks for a second window / instance / account."
			}
		},
		output,
		timeoutMs: 18e5,
		async execute(args, exec) {
			const call = await host.context(exec);
			const text = await openApp(String(args.name ?? ""), args.new_instance === true, call);
			await computer.settle(call.signal);
			return withShot(host, text, call.vision ? await computer.screenshot() : void 0, call);
		},
		presentCall: (args) => card(`打开应用 · ${args.name ?? ""}`)
	}));
	/** Open an app or bring it forward; returns what happened, the foreground window and the app's skill notes. */
	async function openApp(rawName, newInstance, call) {
		{
			const name = rawName.trim();
			if (name === "") throw new Error("name is required.");
			const settings = computer.settings();
			const isUrl = /^https?:\/\//i.test(name);
			const appName = /^ms-settings:/i.test(name) ? "设置" : name;
			if (settings.accessMode === "per-app" && !isUrl && computer.access.missing(call.session, [appName]).length > 0) {
				const running = (await computer.windows()).find((win) => appMatches(appName, win)) ?? (await computer.backgroundApps(false)).find((win) => appMatches(appName, win));
				if (!running || !computer.access.isGranted(call.session, running)) {
					if (call.autoApprove !== true || normalizeApp(appName).includes("deepseek harness")) throw new Error(`"${appName}" is not granted for this session. Call request_access with ["${appName}"] first.`);
					computer.access.grant(call.session, [appName]);
				}
			}
			await computer.overlay.begin(call.agent, `打开 ${name}`);
			await computer.overlay.yieldToUser(call.signal, false);
			const before = await computer.foreground();
			let how;
			const isUri = isUrl || /^[a-z][a-z0-9+.-]+:(?![\/])/i.test(name);
			const running = isUri || newInstance ? void 0 : (await computer.windows()).find((win) => !isHostWindow(win) && appMatches(name, win));
			const hidden = running || isUri || newInstance ? void 0 : (await computer.backgroundApps(false)).find((win) => !isHostWindow(win) && appMatches(name, win));
			if (running) how = (await computer.focus(running)).focused ? `Brought ${running.exe} ("${running.title.slice(0, 60)}") to the front.` : `Tried to bring ${running.exe} to the front, but Windows kept another window focused.`;
			else if (hidden) {
				const restored = await computer.helper.call("tray_restore", { exe: hidden.exe }, 2e4);
				if (restored.window) computer.noteFromTray(restored.window.hwnd);
				how = restored.window ? `${hidden.exe} was already running in the system tray: restored its window from the tray icon (no second instance started).` : `${hidden.exe} is already running in the background${restored.icon ? " (system tray)" : ""}, but its window did not come back automatically. Open it from its notification-area icon (click ^ "show hidden icons" on the taskbar first). Do not launch it again (that starts a second instance and login), and never force its hidden window visible from a shell (Electron / Qt apps freeze).`;
			} else {
				const app = (isUri ? [] : await computer.helper.call("apps", {
					query: name,
					limit: 5
				}, 3e4))[0];
				if (app) await computer.helper.call("launch", { appId: app.id });
				else await computer.helper.call("launch", { target: name });
				how = app ? `Launched "${app.name}".` : isUrl ? `Opened ${name} in the default browser.` : `Started "${name}".`;
				for (let i = 0; i < 80; i++) {
					await setTimeout$1(100, void 0, { signal: call.signal });
					const now = await computer.foreground();
					if (now && now.hwnd !== before?.hwnd && !isHostWindow(now) && !isTransientShell(now) && (now.exe.toLowerCase() !== "explorer.exe" || now.className === "CabinetWClass")) break;
					if (i >= 10 && i % 10 === 0 && !isUri) {
						const opened = (await computer.windows()).find((win) => !isHostWindow(win) && appMatches(name, win));
						if (opened) {
							await computer.focus(opened).catch(() => void 0);
							break;
						}
					}
				}
			}
			const fg = await computer.foreground();
			if (fg && !isHostWindow(fg) && settings.accessMode === "per-app" && (computer.access.missing(call.session, [appName]).length === 0 || isUrl)) computer.access.grant(call.session, [fg.exe]);
			return `${how} ${await computer.describeForeground()}${skillNote(call.session, name, fg)}`;
		}
	}
	/** Skills already handed to a session, so each is attached once. */
	const told = /* @__PURE__ */ new Map();
	/** The app's skill, appended to open_application's result the first time in a session. */
	function skillNote(session, name, win) {
		const skill = host.skills?.find(name, win && !isHostWindow(win) ? win : void 0);
		if (!skill) return host.skills ? "\n(No app skill for this app yet: if you have to work out how it behaves, record the reusable part with app_skill append when you are done.)" : "";
		let seen = told.get(session);
		if (!seen) told.set(session, seen = /* @__PURE__ */ new Set());
		if (seen.has(skill.id)) return "";
		seen.add(skill.id);
		return `\n\nYour skill notes for ${skill.app} (app_skill; correct them if they turn out wrong):\n${skill.content}`;
	}
	/** Put back what the task changed: re-minimize restored windows, report the ones it opened. */
	async function tidy(call) {
		await computer.overlay.begin(call.agent, "整理窗口");
		const rows = (await computer.windows()).filter((win) => !isHostWindow(win));
		const minimized = [];
		for (const win of rows) {
			const origin = computer.origin(win);
			if (origin !== "minimized" && origin !== "tray") continue;
			await computer.helper.call("window_cmd", {
				hwnd: win.hwnd,
				op: "minimize"
			}).catch(() => {});
			minimized.push(`${win.exe} ("${win.title.slice(0, 40)}")`);
		}
		const opened = rows.filter((win) => computer.origin(win) === "opened");
		return { text: [minimized.length ? `Minimized again (they were minimized or in the tray before): ${minimized.join(", ")}.` : "Nothing to minimize again.", opened.length ? `Opened during this task, still open:\n${opened.map((win) => `hwnd=${win.hwnd} | ${win.exe} | "${win.title.slice(0, 60)}"`).join("\n")}\nClose the ones the user does not need (windows close); keep any that shows the result they asked for.` : "No windows opened during this task are left."].join("\n") };
	}
	tools.push(defineTool({
		name: "windows",
		description: "List top-level windows (with process .exe names), or focus / minimize / maximize / restore / close one. Use it to find the right window instead of guessing from titles; the \"DeepSeek Harness.exe\" window is your own chat UI.",
		parameters: {
			action: {
				type: "string",
				enum: [
					"list",
					"focus",
					"minimize",
					"maximize",
					"restore",
					"close",
					"tidy"
				],
				required: true,
				description: "tidy: when the task is done, minimize again every window that was minimized or in the system tray before you started, and list the windows you opened."
			},
			hwnd: {
				type: "integer",
				description: "Window handle from list."
			},
			name: {
				type: "string",
				description: "Alternative to hwnd: exe or title fragment."
			}
		},
		output,
		async execute(args, exec) {
			const call = await host.context(exec);
			const { action, hwnd, name } = args;
			const rows = await computer.windows();
			if (action === "list") {
				const lines = await Promise.all(rows.map(async (win) => `hwnd=${win.hwnd} | ${win.exe} | "${win.title.slice(0, 70)}"${win.foreground ? " | FOREGROUND" : ""}${win.minimized ? " | minimized" : ` | ${await computer.windowBox(win)}`}${isHostWindow(win) ? " | (your own DeepSeek Harness chat window)" : ""}${ORIGIN[computer.origin(win) ?? ""] ?? ""}`));
				const tray = (await computer.backgroundApps()).filter((win) => win.tray && !isHostWindow(win));
				if (tray.length > 0) lines.push(`Running in the system tray without a window (open_application restores them; never relaunch them): ${tray.map((win) => `${win.exe} ("${win.title.slice(0, 30)}")`).join(", ")}`);
				return { text: lines.join("\n") || "No windows." };
			}
			if (action === "tidy") return tidy(call);
			const target = hwnd !== void 0 ? rows.find((win) => win.hwnd === hwnd) : name ? rows.find((win) => !isHostWindow(win) && appMatches(name, win)) ?? rows.find((win) => !isHostWindow(win) && win.title.toLowerCase().includes(name.toLowerCase())) ?? rows.find((win) => appMatches(name, win)) : void 0;
			if (!target) throw new Error("Window not found; call windows with action \"list\". An app closed to the system tray has no window: bring it back with open_application.");
			const settings = computer.settings();
			const denial = computer.access.denial(call.session, target, settings.accessMode, settings.blockedApps, action);
			if (denial && action !== "minimize") throw new Error(denial);
			await computer.overlay.begin(call.agent, `窗口 ${action}`);
			await computer.overlay.yieldToUser(call.signal, false);
			let text;
			if (action === "focus") text = (await computer.focus(target)).focused ? `Focused ${target.exe} ("${target.title.slice(0, 60)}").` : `Windows refused to focus ${target.exe}; try clicking it.`;
			else {
				await computer.helper.call("window_cmd", {
					hwnd: target.hwnd,
					op: action
				});
				text = `${action} ${target.exe} ("${target.title.slice(0, 60)}") done.`;
			}
			const shot = await computer.after([{ action: "key" }], call);
			return withShot(host, shot ? text : `${text} ${await computer.describeForeground()}`, shot, call);
		},
		presentCall: (args) => card(args.action === "tidy" ? "整理窗口" : `窗口 · ${args.action ?? ""}`)
	}));
	tools.push(defineTool({
		name: "ui_elements",
		description: "Read the foreground window (or a window by hwnd) through Windows UI Automation. Default: its clickable/editable elements with center coordinates in screenshot pixels (to click precisely, read values, or work without vision). With text: true: what the window says as plain text (a document, a web page, a chat reply, a log) — exact and far cheaper than scrolling and zooming screenshots. Some apps (games, canvas UIs) expose little.",
		parameters: {
			hwnd: {
				type: "integer",
				description: "Window handle; default foreground window."
			},
			text: {
				type: "boolean",
				description: "Return the window's text content instead of the element list."
			},
			tail: {
				type: "integer",
				description: "text: how many characters from the end to return (default 4000, max 20000); new content is usually at the end."
			},
			include_text: {
				type: "boolean",
				description: "Also list static text elements."
			},
			max: {
				type: "integer",
				description: "Max elements (default 120)."
			}
		},
		output,
		timeoutMs: 3e4,
		isConcurrencySafe: () => true,
		async execute(args) {
			const { hwnd, include_text: includeText, max, text, tail } = args;
			if (text === true) return { text: await windowText(computer, hwnd, tail) };
			const result = await computer.helper.call("ui", {
				...hwnd === void 0 ? {} : { hwnd },
				includeText: includeText === true,
				popups: true,
				maxNodes: Math.min(400, Math.max(10, max ?? 120))
			}, 2e4);
			const lines = [];
			for (const [index, el] of result.elements.entries()) {
				const center = await computer.toModel({
					x: el.x + el.width / 2,
					y: el.y + el.height / 2
				});
				const flags = [
					el.value !== void 0 ? `value="${el.value}"` : "",
					el.checked !== void 0 ? el.checked ? "checked" : "unchecked" : "",
					el.disabled ? "disabled" : "",
					el.automationId ? `automationId=${JSON.stringify(el.automationId)}` : "",
					el.focusable !== void 0 ? `focusable=${el.focusable}` : "",
					el.editable ? "editable" : "",
					center.offscreen ? "other display" : ""
				].filter(Boolean).join(" ");
				lines.push(`[${index}] ${el.role} "${el.name}" @ (${center.x}, ${center.y})${flags ? ` ${flags}` : ""}`);
			}
			const head = `${result.exe} — "${String(result.title ?? "").slice(0, 80)}": ${result.elements.length} elements.`;
			return { text: lines.length ? `${head}\n${lines.join("\n")}` : `${head} This window exposes no UI Automation elements; rely on screenshots.` };
		},
		presentCall: () => card("读取界面元素")
	}));
	tools.push(defineTool({
		name: "clipboard",
		description: "Read or write the clipboard text. Writes stay out of Windows clipboard history, and the user clipboard is restored when you finish. To enter long text, prefer computer type (it pastes for you); never set the clipboard from a shell.",
		parameters: {
			action: {
				type: "string",
				enum: ["read", "write"],
				required: true
			},
			text: {
				type: "string",
				description: "Text to write."
			}
		},
		output,
		async execute(args, exec) {
			const { action, text } = args;
			if (action === "write") {
				computer.clipboardAgent = (await host.context(exec)).agent;
				await computer.helper.call("clipboard_set", {
					text: text ?? "",
					agent: true
				});
				return { text: `Clipboard set (${(text ?? "").length} characters).` };
			}
			const result = await computer.helper.call("clipboard_get");
			return { text: result.text === "" ? "Clipboard has no text." : `Clipboard text:\n${result.text.slice(0, 2e4)}` };
		},
		presentCall: (args) => card(`剪贴板 · ${args.action === "write" ? "写入" : "读取"}`)
	}));
	tools.push(defineTool({
		name: "switch_display",
		description: "List displays or switch which display screenshots and coordinates refer to (multi-monitor setups).",
		parameters: { index: {
			type: "integer",
			description: "Display index to switch to; omit to just list."
		} },
		output,
		async execute(args, exec) {
			const call = await host.context(exec);
			const { index } = args;
			if (index !== void 0) await computer.selectDisplay(index);
			const list = (await computer.refreshDisplays()).map((d, i) => `${i}: ${d.width}x${d.height} at (${d.x}, ${d.y}), ${Math.round(d.dpi / 96 * 100)}% scale${d.primary ? ", primary" : ""}${i === computer.currentIndex ? " ← current" : ""}`).join("\n");
			if (index === void 0) return { text: list };
			const shot = call.vision ? await computer.screenshot() : void 0;
			return withShot(host, `Switched to display ${index}.\n${list}`, shot, call);
		},
		presentCall: () => card("切换显示器")
	}));
	tools.push(defineTool({
		name: "request_access",
		description: "Ask the user to let you control specific apps in this session (they approve in DeepSeek Harness). Call it before acting on an app, listing every app the task needs, e.g. [\"Chrome\", \"记事本\"]. Input to apps that are not granted is refused.",
		parameters: {
			apps: {
				type: "array",
				items: { type: "string" },
				required: true,
				description: "App names (Start-menu names or .exe names)."
			},
			reason: {
				type: "string",
				description: "One sentence on why, shown to the user."
			}
		},
		output,
		async execute(args, exec) {
			const call = await host.context(exec);
			const apps = (args.apps ?? []).map(String).filter((app) => app.trim() !== "");
			if (apps.length === 0) throw new Error("apps must list at least one app.");
			if (computer.settings().accessMode === "allow-all") return { text: "Access mode is \"allow all\": every app except DeepSeek Harness and blocked apps can be controlled. No approval needed." };
			if (apps.some((app) => normalizeApp(app).includes("deepseek harness"))) throw new Error("DeepSeek Harness itself cannot be controlled.");
			computer.access.grant(call.session, apps);
			return { text: `Granted for this session: ${computer.access.granted(call.session).join(", ")}. Open or focus them with open_application.` };
		},
		presentCall: (args) => card(`请求操控 · ${(args.apps ?? []).join("、")}`)
	}));
	if (host.skills) {
		const skills = host.skills;
		tools.push(defineTool({
			name: "app_skill",
			description: `Persistent per-app operating notes, separate from the bundled windows-computer-use guide. open_application returns matching notes. List/read or append/write reusable knowledge, never personal data, task content or coordinates. Maximum ${SKILL_MAX_CHARS} characters per app.`,
			parameters: {
				action: {
					type: "string",
					enum: [
						"list",
						"read",
						"append",
						"write"
					],
					required: true
				},
				app: {
					type: "string",
					description: "App name, e.g. \"Obsidian\" (read / append / write)."
				},
				content: {
					type: "string",
					description: "Markdown bullet points: the lines to add (append) or the whole skill (write)."
				},
				summary: {
					type: "string",
					description: "A few words on what the skill covers, shown in the list (write, or the first append)."
				}
			},
			output,
			isConcurrencySafe: () => false,
			async execute(args) {
				const { action, app, content, summary } = args;
				if (action === "list") {
					const rows = skills.list();
					return { text: rows.length === 0 ? "No app skills yet." : rows.map((skill) => `${skill.app}${skill.summary ? ` — ${skill.summary}` : ""} (${skill.content.length} chars)`).join("\n") };
				}
				const name = String(app ?? "").trim();
				if (name === "") throw new Error("app is required.");
				if (action === "read") {
					const skill = skills.find(name, await computer.foreground().catch(() => void 0));
					return { text: skill ? `Skill for ${skill.app}:\n${skill.content}` : `No skill for "${name}" yet. If you work out how this app behaves, record it with app_skill append.` };
				}
				const text = String(content ?? "").trim();
				if (text === "") throw new Error("content is required.");
				const fg = await computer.foreground().catch(() => void 0);
				const extra = {
					match: fg && !isHostWindow(fg) && appMatches(name, fg) && !/^applicationframehost/i.test(fg.exe) ? [fg.exe] : [],
					...summary ? { summary } : {}
				};
				const saved = action === "write" ? skills.save({
					app: name,
					content: text,
					...extra
				}, skills.find(name)?.id) : skills.append(name, text, extra);
				return { text: `Skill for ${saved.app} saved (${saved.content.length} of ${SKILL_MAX_CHARS} characters).` };
			},
			presentCall: (args) => card(`应用技能 · ${{
				list: "列表",
				read: "读取",
				append: "记录",
				write: "重写"
			}[args.action ?? ""] ?? ""}${args.app ? ` · ${args.app}` : ""}`)
		}));
	}
	tools.push(defineTool({
		name: "list_granted_applications",
		description: "List the apps you may control in this session.",
		parameters: {},
		output,
		isConcurrencySafe: () => true,
		async execute(_args, exec) {
			const call = await host.context(exec);
			if (computer.settings().accessMode === "allow-all") return { text: "Access mode is \"allow all\": every app except DeepSeek Harness and blocked apps." };
			const granted = computer.access.granted(call.session);
			return { text: granted.length ? `Granted: ${granted.join(", ")}` : "Nothing granted yet; call request_access." };
		},
		presentCall: () => card("已授权应用")
	}));
	return tools;
}
//#endregion
//#region lib/types/index.js
/**
* @copylee/dsh-computer-use host bundle: Claude-style computer use for the
* Windows desktop — screenshots in, mouse and keyboard out, per-app grants
* through DSH approvals, and an orange "DeepSeek is using your computer"
* overlay that a physical Esc dismisses.
*/
const name = "@copylee/dsh-computer-use";
const inject = ["tools", "attachments"];
const Config = z.object({
	accessMode: z.union([z.const("per-app").i18n({
		"zh-CN": { $description: "按应用授权（每个会话由你批准要操控的应用）" },
		"en-US": { $description: "Per app (approve the apps each session)" }
	}), z.const("allow-all").i18n({
		"zh-CN": { $description: "全部允许（不弹审批）" },
		"en-US": { $description: "Allow all apps (no approval)" }
	})]).default("per-app").volatile().i18n({
		"zh-CN": { $description: "授权方式。无论哪种，DeepSeek Harness 自身窗口和下方“禁止操控的应用”都不会被操作。" },
		"en-US": { $description: "Access mode. DeepSeek Harness itself and blocked apps are never controlled." }
	}),
	overlay: z.boolean().default(true).volatile().i18n({
		"zh-CN": { $description: "控制时显示橙色光晕边框和顶部提示条（不会出现在截图里，按 Esc 可停止）" },
		"en-US": { $description: "Show the orange glow and status pill while controlling (hidden from screenshots; Esc stops)" }
	}),
	overlayLabel: z.string().default("DeepSeek Harness").volatile().i18n({
		"zh-CN": { $description: "提示条名称：“<名称> 正在操控你的电脑”" },
		"en-US": { $description: "Name in the pill: \"<name> 正在操控你的电脑\"" }
	}),
	hostWindow: z.union([
		z.const("pet").i18n({
			"zh-CN": { $description: "最小化，改用右下角迷你进度卡片（两行滚动显示回复和思考 / 工具调用）" },
			"en-US": { $description: "Minimize it and show a mini progress card (reply + thinking / tool calls)" }
		}),
		z.const("card").i18n({
			"zh-CN": { $description: "缩成右下角置顶悬浮卡片" },
			"en-US": { $description: "Shrink to an always-on-top card" }
		}),
		z.const("minimize").i18n({
			"zh-CN": { $description: "最小化" },
			"en-US": { $description: "Minimize" }
		}),
		z.const("keep").i18n({
			"zh-CN": { $description: "保持不变" },
			"en-US": { $description: "Leave it as is" }
		})
	]).default("pet").volatile().i18n({
		"zh-CN": { $description: "操控期间 DeepSeek Harness 窗口怎么摆放（结束后自动恢复原尺寸和位置）" },
		"en-US": { $description: "What to do with the DeepSeek Harness window while controlling (restored afterwards)" }
	}),
	cardOpacity: z.natural().min(30).max(100).default(80).volatile().i18n({
		"zh-CN": { $description: "悬浮卡片不透明度（%）：调低可透过卡片看清下面的操作过程；鼠标停在卡片上时变为不透明" },
		"en-US": { $description: "Card opacity (%): lower lets you watch the work underneath; it turns opaque while the pointer rests on it" }
	}),
	typingMode: z.union([
		z.const("stream").i18n({
			"zh-CN": { $description: "流式：长文本按段落逐段粘贴，看得到一段段出现（推荐）" },
			"en-US": { $description: "Stream: paste long text paragraph by paragraph (recommended)" }
		}),
		z.const("type").i18n({
			"zh-CN": { $description: "逐字输入：像人打字，慢；Markdown 编辑器里可能被自动格式化打乱" },
			"en-US": { $description: "Type key by key: like a person, slow; Markdown editors may auto-format it" }
		}),
		z.const("paste").i18n({
			"zh-CN": { $description: "一次粘贴：最快" },
			"en-US": { $description: "Paste at once: fastest" }
		})
	]).default("stream").volatile().i18n({
		"zh-CN": { $description: "文字输入方式" },
		"en-US": { $description: "How text is entered" }
	}),
	quickSteps: z.boolean().default(false).volatile().i18n({
		"zh-CN": { $description: "（Beta）操作电脑的那一轮用模型的最低思考强度（每步更快）；其余沿用会话的思考强度" },
		"en-US": { $description: "(Beta) Use the model's lowest reasoning effort for the requests in the middle of operating the computer (faster steps); other requests keep the session's effort" }
	}),
	autoScreenshot: z.boolean().default(true).volatile().i18n({
		"zh-CN": { $description: "每次操作后自动回传截图（省去一轮调用）" },
		"en-US": { $description: "Return a screenshot after every action (saves a round trip)" }
	}),
	settleMs: z.natural().max(5e3).default(400).volatile().i18n({
		"zh-CN": { $description: "操作后至少等待的毫秒数；之后画面静止即截图（最多约 2.5 秒）" },
		"en-US": { $description: "Minimum wait after an action; then the screenshot is taken once the screen stops changing (up to ~2.5 s)" }
	}),
	maxLongEdge: z.natural().min(640).max(3840).default(1366).volatile().i18n({
		"zh-CN": { $description: "截图最长边像素（越大越清晰、越费 token）" },
		"en-US": { $description: "Screenshot long-edge limit in pixels" }
	}),
	maxPixels: z.natural().min(3e5).max(8e6).default(115e4).volatile().i18n({
		"zh-CN": { $description: "截图总像素上限" },
		"en-US": { $description: "Screenshot total pixel limit" }
	}),
	jpegQuality: z.natural().min(30).max(100).default(70).volatile().i18n({
		"zh-CN": { $description: "截图 JPEG 质量" },
		"en-US": { $description: "Screenshot JPEG quality" }
	}),
	pauseOnUserInput: z.boolean().default(true).volatile().i18n({
		"zh-CN": { $description: "检测到你在操作时让出控制：你用键盘打字时暂停、停手后继续；你切换或打开了新窗口时，AI 重新看屏幕再决定（鼠标移动不会触发）" },
		"en-US": { $description: "Yield to you: pause while you type, and re-check the screen when you bring up another window (mouse movement is ignored)" }
	}),
	userIdleMs: z.natural().min(300).max(1e4).default(1500).volatile().i18n({
		"zh-CN": { $description: "键盘停止多少毫秒后恢复操作" },
		"en-US": { $description: "Milliseconds of keyboard quiet before resuming" }
	}),
	nativeHelper: z.boolean().default(true).volatile().i18n({
		"zh-CN": { $description: "截图、显示器与窗口查询、无浮层时的输入改由 DeepSeek Harness 自带的 koffi 在进程内完成（更快，也不受智能应用控制拦截）；关闭则全部交给 C# 辅助程序" },
		"en-US": { $description: "Take screenshots, display and window queries, and input while no overlay is shown in-process through the koffi that DeepSeek Harness ships (faster, and not blocked by Smart App Control); off sends everything to the C# helper" }
	}),
	blockedApps: z.array(z.string()).default([]).volatile().i18n({
		"zh-CN": { $description: "禁止操控的应用（名称或 exe，如 “alipay”）。常见密码管理器默认已禁止。" },
		"en-US": { $description: "Apps that may never be controlled (names or exe). Common password managers are always blocked." }
	})
});
function apply(ctx, config = {}) {
	if (process.platform !== "win32") {
		ctx.logger.warn("dsh-computer-use only supports Windows; no tools registered.");
		return;
	}
	const settings = () => resolveConfig(config);
	const log = (message) => ctx.logger.info(message);
	const helper = new NativeHelper(new HelperClient((message) => ctx.logger.warn(message)), (message) => ctx.logger.warn(message), () => settings().nativeHelper);
	const access = new AccessControl();
	const iconPath = helperAssetPath("deepseek-white.png");
	const overlay = new OverlayController(helper, settings, log, iconPath);
	const computer = new Computer(helper, access, overlay, settings);
	ctx.effect(() => () => {
		overlay.end().finally(() => helper.dispose());
	}, "computer-use: helper");
	const visionCache = /* @__PURE__ */ new Map();
	const supportsVision = (agent, signal) => {
		const route = agent?.session.requestHeader?.()?.config ?? agent?.options;
		const provider = route?.provider;
		const model = route?.model;
		const llm = ctx.get("llm");
		if (!provider || !model || typeof llm?.resolveModelInfo !== "function") return Promise.resolve(true);
		const key = `${provider}\u0000${model}`;
		let cached = visionCache.get(key);
		if (!cached) {
			cached = llm.resolveModelInfo(provider, model, signal).then((info) => info.inputModalities === void 0 || info.inputModalities.includes("image")).catch(() => {
				visionCache.delete(key);
				return true;
			});
			visionCache.set(key, cached);
		}
		return cached;
	};
	const attachments = () => ctx.attachments;
	/** "never" comes from the full-access / auto presets: the user opted out of approval prompts. */
	const approvalPolicy = (agent) => {
		const approval = ctx.get("approval");
		try {
			return approval?.effectivePolicy?.(agent.session);
		} catch {
			return;
		}
	};
	const screenshots = new ScreenshotCache(void 0, void 0, log);
	ctx.effect(() => {
		const sweep = () => {
			screenshots.clean().catch((error) => log(`screenshot cleanup skipped: ${String(error)}`));
		};
		const first = setTimeout(sweep, 12e4);
		const every = setInterval(sweep, 432e5);
		first.unref();
		every.unref();
		return () => {
			clearTimeout(first);
			clearInterval(every);
		};
	}, "computer-use: screenshot cleanup");
	const skills = new SkillStore(helperAssetPath("skills"));
	const tools = createTools({
		computer,
		skills,
		async saveImage(shot, fileName) {
			const ref = await attachments().saveImage({
				data: shot.data,
				mediaType: "image/jpeg",
				name: fileName
			});
			screenshots.record(String(ref.attachmentId));
			return ref;
		},
		async context(raw) {
			const exec = raw;
			return {
				session: exec.agent?.session.id ?? "default",
				agent: exec.agent,
				signal: exec.signal,
				vision: await supportsVision(exec.agent, exec.signal),
				autoApprove: exec.agent !== void 0 && approvalPolicy(exec.agent) === "never"
			};
		}
	});
	for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `computer-use: tool ${tool.name}`);
	const OWN_TOOLS = new Set(tools.map((tool) => tool.name));
	ctx.on("tools/pre-execute", async (exec, next) => {
		if (exec.name !== "request_access" || settings().accessMode !== "per-app") return next();
		const agent = exec.agent;
		const names = (exec.arguments?.apps ?? []).map(String).filter((app) => app.trim() !== "" && !normalizeApp(app).includes("deepseek harness"));
		const session = agent?.session.id ?? "default";
		const missing = access.missing(session, names);
		if (missing.length === 0) return next();
		const approval = ctx.get("approval");
		if (agent && approval?.effectivePolicy?.(agent.session) === "never") return next();
		const reason = String(exec.arguments?.reason ?? "").slice(0, 200);
		return {
			kind: "ask",
			reason: `Control these apps with mouse and keyboard: ${missing.join(", ")}`,
			displayReason: {
				en: `Let DeepSeek control ${missing.join(", ")} on this computer for this session?${reason ? ` (${reason})` : ""}`,
				"zh-CN": `允许 DeepSeek 在本次会话中操控：${missing.join("、")}？${reason ? `（${reason}）` : ""}`
			}
		};
	});
	ctx.inject(["llm"], (llmCtx) => {
		const lowest = /* @__PURE__ */ new Map();
		const lowestFor = (provider, model) => {
			const key = `${provider}\u0000${model}`;
			let cached = lowest.get(key);
			if (!cached) {
				const llm = llmCtx.llm;
				cached = typeof llm.resolveModelInfo === "function" ? llm.resolveModelInfo(provider, model).then((info) => lowestEffort(info.reasoning?.efforts)).catch(() => {
					lowest.delete(key);
				}) : Promise.resolve(void 0);
				lowest.set(key, cached);
			}
			return cached;
		};
		const lowered = /* @__PURE__ */ new WeakSet();
		llmCtx.effect(() => llmCtx.on("llm/stream", ((options, next) => {
			if (!settings().quickSteps || !options.provider || !options.model || !Array.isArray(options.messages) || !isOperating(options.messages, OWN_TOOLS)) return next();
			if (lowered.has(options)) return next();
			const { provider, model } = options;
			return (async function* () {
				const effort = await lowestFor(provider, model);
				if (effort === void 0 || options.reasoningEffort === effort) {
					yield* next();
					return;
				}
				const copy = Object.freeze({
					...options,
					reasoningEffort: effort
				});
				lowered.add(copy);
				const llm = llmCtx.llm;
				yield* retryMalformed(() => llm.stream(copy));
			})();
		}), { global: true }), "computer-use: quick steps");
	});
	ctx.on("agent/assistant-stream", ({ agent, frame }) => {
		overlay.stream(agent, frame);
	});
	ctx.on("tools/pre-execute", (exec, next) => {
		if (!OWN_TOOLS.has(exec.name)) {
			const args = exec.arguments ?? {};
			const detail = [
				args.command,
				args.description,
				args.query,
				args.path,
				args.url
			].find((value) => typeof value === "string");
			overlay.toolStarted(exec.agent, exec.name, (detail ?? "").split("\n")[0].slice(0, 120));
		}
		return next();
	});
	overlay.onMessage = (agent, text) => {
		const steer = agent.steer;
		if (typeof steer !== "function") {
			log("progress card: this agent cannot take steering");
			return;
		}
		steer.call(agent, Object.freeze({
			id: randomUUID(),
			role: "user",
			content: [{
				type: "text",
				text
			}],
			source: { kind: "user" }
		}));
	};
	ctx.on("agent/status", ({ agent, status }) => {
		if (status === "running") computer.resetLook();
		if (status === "idle" && computer.clipboardAgent === agent) {
			computer.clipboardAgent = void 0;
			helper.call("clipboard_restore").catch(() => {});
		}
		if (status === "idle" && overlay.controller === agent) overlay.end(agent);
	});
	ctx.on("agent/disposed", ({ agent }) => {
		access.forget(agent.session.id);
		if (overlay.controller === agent) overlay.end();
	});
	ctx.inject(["webServer"], (webCtx) => {
		const route = (path, handler) => {
			const safe = async (req, res) => {
				try {
					await handler(req, res);
				} catch (error) {
					if (res.headersSent) {
						res.destroy();
						return;
					}
					res.writeHead(500, {
						"content-type": "application/json",
						"cache-control": "no-store"
					});
					res.end(JSON.stringify({
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					}));
				}
			};
			webCtx.effect(() => webCtx.webServer.register({
				kind: "exact",
				path,
				handler: safe
			}), `computer-use: ${path}`);
		};
		route(STATUS_ROUTE, statusRoute(helper, settings, overlay));
		route(PREVIEW_ROUTE, previewRoute(helper, settings, overlay, iconPath));
		route(SCREENSHOTS_ROUTE, screenshotsRoute(screenshots));
		route(SCREENSHOTS_CLEAN_ROUTE, screenshotsCleanRoute(screenshots));
		route(SKILLS_ROUTE, skillsRoute(skills));
	});
	ctx.inject(["systemPrompt"], (promptCtx) => {
		let registered;
		let dispose;
		const refresh = () => {
			const mode = settings().accessMode;
			if (mode === registered) return;
			dispose?.();
			registered = mode;
			dispose = promptCtx.systemPrompt.section({
				name: "computer-use:guide",
				order: 72,
				text: promptText(mode)
			});
		};
		promptCtx.effect(() => {
			refresh();
			return () => {
				dispose?.();
				dispose = void 0;
				registered = void 0;
			};
		}, "computer-use: prompt");
		promptCtx.on("loader/volatile-update", (() => refresh()));
	});
}
//#endregion
export { Config, DEFAULTS, ENTRY_ID, apply, inject, name, resolveConfig };
