import { createRequire } from "node:module";
import { win32 } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
//#region lib/types/native/worker.js
/**
* Spike: part of the helper's command set done in-process through koffi, on a
* worker thread so that Sleep-style pauses and GDI work never block the host's
* event loop. Replies use the same shapes as helper/CuHelper.cs.
*/
const koffi = createRequire(import.meta.url)(workerData.koffiPath);
const user32 = koffi.load("user32.dll");
const gdi32 = koffi.load("gdi32.dll");
const shcore = koffi.load("shcore.dll");
const gdiplus = koffi.load("gdiplus.dll");
const ole32 = koffi.load("ole32.dll");
const kernel32 = koffi.load("kernel32.dll");
const dwmapi = koffi.load("dwmapi.dll");
const RECT = koffi.struct("RECT", {
	left: "int32_t",
	top: "int32_t",
	right: "int32_t",
	bottom: "int32_t"
});
koffi.struct("POINT", {
	x: "int32_t",
	y: "int32_t"
});
const MONITORINFOEXW = koffi.struct("MONITORINFOEXW", {
	cbSize: "uint32_t",
	rcMonitor: RECT,
	rcWork: RECT,
	dwFlags: "uint32_t",
	szDevice: koffi.array("char16_t", 32, "String")
});
koffi.struct("BITMAPINFOHEADER", {
	biSize: "uint32_t",
	biWidth: "int32_t",
	biHeight: "int32_t",
	biPlanes: "uint16_t",
	biBitCount: "uint16_t",
	biCompression: "uint32_t",
	biSizeImage: "uint32_t",
	biXPelsPerMeter: "int32_t",
	biYPelsPerMeter: "int32_t",
	biClrUsed: "uint32_t",
	biClrImportant: "uint32_t"
});
const GUID = koffi.struct("GUID", {
	Data1: "uint32_t",
	Data2: "uint16_t",
	Data3: "uint16_t",
	Data4: koffi.array("uint8_t", 8, "Array")
});
const EncoderParameter = koffi.struct("EncoderParameter", {
	Guid: GUID,
	NumberOfValues: "uint32_t",
	Type: "uint32_t",
	Value: "void *"
});
koffi.struct("EncoderParameters", {
	Count: "uint32_t",
	Parameter: koffi.array(EncoderParameter, 1)
});
koffi.struct("GdiplusStartupInput", {
	GdiplusVersion: "uint32_t",
	DebugEventCallback: "void *",
	SuppressBackgroundThread: "int",
	SuppressExternalCodecs: "int"
});
const MonitorEnumProc = koffi.proto("int __stdcall MonitorEnumProc(void *monitor, void *hdc, RECT *rect, intptr_t data)");
const ReleaseProc = koffi.proto("uint32_t __stdcall ReleaseProc(void *self)");
const EnumWindowsProc = koffi.proto("int __stdcall EnumWindowsProc(void *hwnd, intptr_t data)");
const SetThreadDpiAwarenessContext = user32.func("intptr_t __stdcall SetThreadDpiAwarenessContext(intptr_t context)");
const EnumDisplayMonitors = user32.func("int __stdcall EnumDisplayMonitors(void *hdc, RECT *clip, MonitorEnumProc *proc, intptr_t data)");
const GetMonitorInfoW = user32.func("int __stdcall GetMonitorInfoW(void *monitor, _Inout_ MONITORINFOEXW *info)");
const GetCursorPos = user32.func("int __stdcall GetCursorPos(_Out_ POINT *point)");
const SetCursorPos = user32.func("int __stdcall SetCursorPos(int x, int y)");
const SendInput = user32.func("uint32_t __stdcall SendInput(uint32_t count, void *inputs, int size)");
const MapVirtualKeyW = user32.func("uint32_t __stdcall MapVirtualKeyW(uint32_t code, uint32_t type)");
const GetDC = user32.func("void * __stdcall GetDC(void *hwnd)");
const ReleaseDC = user32.func("int __stdcall ReleaseDC(void *hwnd, void *hdc)");
const GetLastError = kernel32.func("uint32_t __stdcall GetLastError()");
const GetForegroundWindow = user32.func("void * __stdcall GetForegroundWindow()");
const IsWindow = user32.func("int __stdcall IsWindow(void *hwnd)");
const IsWindowVisible = user32.func("int __stdcall IsWindowVisible(void *hwnd)");
const IsIconic = user32.func("int __stdcall IsIconic(void *hwnd)");
const IsZoomed = user32.func("int __stdcall IsZoomed(void *hwnd)");
const GetWindow = user32.func("void * __stdcall GetWindow(void *hwnd, uint32_t cmd)");
const GetAncestor = user32.func("void * __stdcall GetAncestor(void *hwnd, uint32_t flags)");
const WindowFromPoint = user32.func("void * __stdcall WindowFromPoint(POINT point)");
const GetWindowLongW = user32.func("int32_t __stdcall GetWindowLongW(void *hwnd, int index)");
const GetWindowTextLengthW = user32.func("int __stdcall GetWindowTextLengthW(void *hwnd)");
const GetWindowTextW = user32.func("int __stdcall GetWindowTextW(void *hwnd, void *text, int max)");
const GetClassNameW = user32.func("int __stdcall GetClassNameW(void *hwnd, void *name, int max)");
const GetWindowRect = user32.func("int __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)");
const GetWindowThreadProcessId = user32.func("uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)");
const EnumWindows = user32.func("int __stdcall EnumWindows(EnumWindowsProc *proc, intptr_t data)");
const DwmGetWindowAttribute = dwmapi.func("int32_t __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attribute, void *value, uint32_t size)");
const OpenProcess = kernel32.func("void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)");
const QueryFullProcessImageNameW = kernel32.func("int __stdcall QueryFullProcessImageNameW(void *process, uint32_t flags, void *name, _Inout_ uint32_t *size)");
const CloseHandle = kernel32.func("int __stdcall CloseHandle(void *handle)");
const GetDpiForMonitor = shcore.func("int32_t __stdcall GetDpiForMonitor(void *monitor, int type, _Out_ uint32_t *x, _Out_ uint32_t *y)");
const CreateCompatibleDC = gdi32.func("void * __stdcall CreateCompatibleDC(void *hdc)");
const CreateDIBSection = gdi32.func("void * __stdcall CreateDIBSection(void *hdc, BITMAPINFOHEADER *info, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)");
const SelectObject = gdi32.func("void * __stdcall SelectObject(void *hdc, void *object)");
const BitBlt = gdi32.func("int __stdcall BitBlt(void *dst, int x, int y, int w, int h, void *src, int sx, int sy, uint32_t rop)");
const DeleteObject = gdi32.func("int __stdcall DeleteObject(void *object)");
const DeleteDC = gdi32.func("int __stdcall DeleteDC(void *hdc)");
const GdiFlush = gdi32.func("int __stdcall GdiFlush()");
const GdiplusStartup = gdiplus.func("int __stdcall GdiplusStartup(_Out_ uintptr_t *token, GdiplusStartupInput *input, void *output)");
const GdipCreateBitmapFromScan0 = gdiplus.func("int __stdcall GdipCreateBitmapFromScan0(int w, int h, int stride, int format, void *scan0, _Out_ void **bitmap)");
const GdipGetImageGraphicsContext = gdiplus.func("int __stdcall GdipGetImageGraphicsContext(void *image, _Out_ void **graphics)");
const GdipSetInterpolationMode = gdiplus.func("int __stdcall GdipSetInterpolationMode(void *graphics, int mode)");
const GdipSetPixelOffsetMode = gdiplus.func("int __stdcall GdipSetPixelOffsetMode(void *graphics, int mode)");
const GdipSetCompositingQuality = gdiplus.func("int __stdcall GdipSetCompositingQuality(void *graphics, int quality)");
const GdipCreateImageAttributes = gdiplus.func("int __stdcall GdipCreateImageAttributes(_Out_ void **attrs)");
const GdipSetImageAttributesWrapMode = gdiplus.func("int __stdcall GdipSetImageAttributesWrapMode(void *attrs, int wrap, uint32_t argb, int clamp)");
const GdipDrawImageRectRectI = gdiplus.func("int __stdcall GdipDrawImageRectRectI(void *graphics, void *image, int dx, int dy, int dw, int dh, int sx, int sy, int sw, int sh, int unit, void *attrs, void *callback, void *data)");
const GdipSaveImageToStream = gdiplus.func("int __stdcall GdipSaveImageToStream(void *image, void *stream, GUID *clsid, EncoderParameters *params)");
const GdipDisposeImage = gdiplus.func("int __stdcall GdipDisposeImage(void *image)");
const GdipDeleteGraphics = gdiplus.func("int __stdcall GdipDeleteGraphics(void *graphics)");
const GdipDisposeImageAttributes = gdiplus.func("int __stdcall GdipDisposeImageAttributes(void *attrs)");
const CreateStreamOnHGlobal = ole32.func("int32_t __stdcall CreateStreamOnHGlobal(void *global, int deleteOnRelease, _Out_ void **stream)");
const GetHGlobalFromStream = ole32.func("int32_t __stdcall GetHGlobalFromStream(void *stream, _Out_ void **global)");
const GlobalSize = kernel32.func("size_t __stdcall GlobalSize(void *global)");
const GlobalLock = kernel32.func("void * __stdcall GlobalLock(void *global)");
const GlobalUnlock = kernel32.func("int __stdcall GlobalUnlock(void *global)");
SetThreadDpiAwarenessContext(-4);
const MARKER = 1146308675n;
const INPUT_SIZE = 40;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
function sleep(ms) {
	if (ms > 0) Atomics.wait(sleeper, 0, 0, ms);
}
function int(args, key, fallback) {
	const value = args[key];
	return typeof value === "number" ? Math.trunc(value) : fallback;
}
function displays() {
	const list = [];
	const callback = koffi.register((monitor) => {
		const info = { cbSize: MONITORINFOEXW.size };
		GetMonitorInfoW(monitor, info);
		const dx = [96];
		GetDpiForMonitor(monitor, 0, dx, [96]);
		const m = info.rcMonitor, w = info.rcWork;
		list.push({
			x: m.left,
			y: m.top,
			width: m.right - m.left,
			height: m.bottom - m.top,
			workX: w.left,
			workY: w.top,
			workWidth: w.right - w.left,
			workHeight: w.bottom - w.top,
			primary: (info.dwFlags & 1) !== 0,
			dpi: dx[0],
			name: info.szDevice
		});
		return 1;
	}, koffi.pointer(MonitorEnumProc));
	try {
		EnumDisplayMonitors(null, null, callback, 0);
	} finally {
		koffi.unregister(callback);
	}
	return list;
}
function cursor() {
	const point = {};
	GetCursorPos(point);
	return {
		x: point.x,
		y: point.y
	};
}
const EXTENDED = /* @__PURE__ */ new Set([
	33,
	34,
	35,
	36,
	37,
	38,
	39,
	40,
	44,
	45,
	46,
	91,
	92,
	93,
	111,
	144,
	163,
	165
]);
/** One INPUT (x64 layout, 40 bytes) for a mouse event. */
function mouse(flags, data = 0) {
	const b = Buffer.alloc(INPUT_SIZE);
	b.writeUInt32LE(0, 0);
	b.writeUInt32LE(data >>> 0, 16);
	b.writeUInt32LE(flags, 20);
	b.writeBigUInt64LE(MARKER, 32);
	return b;
}
function key(vk, up) {
	const b = Buffer.alloc(INPUT_SIZE);
	b.writeUInt32LE(1, 0);
	b.writeUInt16LE(vk, 8);
	b.writeUInt16LE(MapVirtualKeyW(vk, 0), 10);
	b.writeUInt32LE((up ? 2 : 0) | (EXTENDED.has(vk) ? 1 : 0), 12);
	b.writeBigUInt64LE(MARKER, 24);
	return b;
}
function send(inputs) {
	if (inputs.length === 0) return;
	if (SendInput(inputs.length, Buffer.concat(inputs), INPUT_SIZE) !== inputs.length) throw new Error(`SendInput was blocked (error ${String(GetLastError())}). The target may be running elevated (as administrator) or the secure desktop (UAC / lock screen) is active.`);
}
function move(x, y) {
	SetCursorPos(x, y);
	send([mouse(1)]);
}
function buttonFlags(button) {
	if (button === "right") return [8, 16];
	if (button === "middle") return [32, 64];
	return [2, 4];
}
function vkList(value) {
	return Array.isArray(value) ? value.filter((v) => typeof v === "number") : [];
}
function click(args) {
	if (typeof args.x === "number") {
		move(int(args, "x", 0), int(args, "y", 0));
		sleep(30);
	}
	const [down, up] = buttonFlags(args.button);
	const count = Math.max(1, Math.min(3, int(args, "count", 1)));
	const mods = vkList(args.modifiers);
	send(mods.map((vk) => key(vk, false)));
	try {
		for (let i = 0; i < count; i++) {
			send([mouse(down)]);
			sleep(20);
			send([mouse(up)]);
			if (i < count - 1) sleep(40);
		}
	} finally {
		send([...mods].reverse().map((vk) => key(vk, true)));
	}
	return null;
}
function keys(args) {
	const combos = Array.isArray(args.combos) ? args.combos.map(vkList) : [];
	const hold = int(args, "holdMs", 0);
	for (const combo of combos) {
		send(combo.map((vk) => key(vk, false)));
		sleep(hold > 0 ? hold : 25);
		send([...combo].reverse().map((vk) => key(vk, true)));
		sleep(30);
	}
	return null;
}
function drag(args) {
	const x1 = int(args, "x1", 0), y1 = int(args, "y1", 0), x2 = int(args, "x2", 0), y2 = int(args, "y2", 0);
	const [down, up] = buttonFlags(args.button);
	move(x1, y1);
	sleep(40);
	send([mouse(down)]);
	try {
		sleep(60);
		const steps = Math.max(8, Math.min(40, Math.trunc(Math.hypot(x2 - x1, y2 - y1) / 20)));
		for (let i = 1; i <= steps; i++) {
			move(x1 + Math.trunc((x2 - x1) * i / steps), y1 + Math.trunc((y2 - y1) * i / steps));
			sleep(12);
		}
		sleep(60);
	} finally {
		send([mouse(up)]);
	}
	return null;
}
function scroll(args) {
	if (typeof args.x === "number") {
		move(int(args, "x", 0), int(args, "y", 0));
		sleep(30);
	}
	const dx = int(args, "dx", 0), dy = int(args, "dy", 0);
	const mods = vkList(args.modifiers);
	send(mods.map((vk) => key(vk, false)));
	try {
		for (let i = 0; i < Math.abs(dy); i++) {
			send([mouse(2048, dy > 0 ? -120 : 120)]);
			sleep(15);
		}
		for (let i = 0; i < Math.abs(dx); i++) {
			send([mouse(4096, dx > 0 ? 120 : -120)]);
			sleep(15);
		}
	} finally {
		send([...mods].reverse().map((vk) => key(vk, true)));
	}
	return null;
}
function unicode(unit, up) {
	const b = Buffer.alloc(INPUT_SIZE);
	b.writeUInt32LE(1, 0);
	b.writeUInt16LE(unit, 10);
	b.writeUInt32LE(4 | (up ? 2 : 0), 12);
	b.writeBigUInt64LE(MARKER, 24);
	return b;
}
/** charDelay > 0: one character at a time, like a person typing; otherwise fast batches. */
function typeText(args) {
	const text = typeof args.text === "string" ? args.text : "";
	const charDelay = int(args, "charDelay", 0), pause = charDelay > 0 ? charDelay : int(args, "chunkDelay", 8);
	let batch = [];
	const flush = () => {
		if (batch.length === 0) return;
		send(batch);
		batch = [];
		if (pause > 0) sleep(pause);
	};
	for (let i = 0; i < text.length; i++) {
		let c = text.charCodeAt(i);
		if (c === 13) {
			if (text.charCodeAt(i + 1) === 10) continue;
			c = 10;
		}
		if (c === 10) {
			flush();
			batch.push(key(13, false), key(13, true));
			flush();
			continue;
		}
		if (c === 9) {
			batch.push(key(9, false), key(9, true));
			continue;
		}
		batch.push(unicode(c, false), unicode(c, true));
		if (c >= 55296 && c <= 56319) continue;
		if (charDelay > 0 || batch.length >= 40) flush();
	}
	flush();
	return null;
}
function hwndOf(value) {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") return BigInt(Math.trunc(value));
	return 0n;
}
function utf16(read, max) {
	const buffer = Buffer.alloc(max * 2);
	const n = read(buffer, max);
	return n > 0 ? buffer.toString("utf16le", 0, n * 2) : "";
}
function exePath(pid) {
	const handle = OpenProcess(4096, 0, pid);
	if (!handle) return "";
	try {
		const size = [1024];
		const name = Buffer.alloc(2048);
		return QueryFullProcessImageNameW(handle, 0, name, size) ? name.toString("utf16le", 0, size[0] * 2) : "";
	} finally {
		CloseHandle(handle);
	}
}
function processOf(hwnd) {
	const pid = [0];
	GetWindowThreadProcessId(hwnd, pid);
	return pid[0];
}
function cloaked(hwnd) {
	const value = Buffer.alloc(4);
	return DwmGetWindowAttribute(hwnd, 14, value, 4) === 0 && value.readInt32LE(0) !== 0;
}
function windowRect(hwnd) {
	const rect = {};
	GetWindowRect(hwnd, rect);
	return rect;
}
/** The visible frame (without the invisible resize border), else the window rectangle. */
function bounds(hwnd) {
	const frame = Buffer.alloc(16);
	if (DwmGetWindowAttribute(hwnd, 9, frame, 16) !== 0) return windowRect(hwnd);
	return {
		left: frame.readInt32LE(0),
		top: frame.readInt32LE(4),
		right: frame.readInt32LE(8),
		bottom: frame.readInt32LE(12)
	};
}
/** Same fields as Windows.Describe in the C# helper; {} for no window. */
function describe(hwnd) {
	if (!hwnd || !IsWindow(hwnd)) return {};
	const pid = processOf(hwnd);
	const length = GetWindowTextLengthW(hwnd);
	const title = utf16((b, max) => GetWindowTextW(hwnd, b, max), Math.max(length + 1, 2));
	const className = utf16((b, max) => GetClassNameW(hwnd, b, max), 256);
	const rc = bounds(hwnd);
	const path = exePath(pid);
	return {
		hwnd: Number(hwnd),
		title,
		className,
		pid,
		exe: path ? win32.basename(path) : "",
		path,
		x: rc.left,
		y: rc.top,
		width: rc.right - rc.left,
		height: rc.bottom - rc.top,
		minimized: Boolean(IsIconic(hwnd)),
		maximized: Boolean(IsZoomed(hwnd))
	};
}
function enumWindows(visit) {
	const callback = koffi.register((hwnd) => visit(hwndOf(hwnd)) ? 1 : 0, koffi.pointer(EnumWindowsProc));
	try {
		EnumWindows(callback, 0);
	} finally {
		koffi.unregister(callback);
	}
}
function foreground() {
	return describe(hwndOf(GetForegroundWindow()));
}
/** Top-level app windows, as Windows.List in the C# helper. */
function windows() {
	const list = [];
	const fg = hwndOf(GetForegroundWindow());
	enumWindows((h) => {
		if (!IsWindowVisible(h) || GetWindowTextLengthW(h) === 0) return true;
		if (hwndOf(GetWindow(h, 4))) return true;
		const ex = GetWindowLongW(h, -20);
		if ((ex & 128) !== 0 && (ex & 262144) === 0) return true;
		if (cloaked(h)) return true;
		list.push({
			...describe(h),
			foreground: h === fg
		});
		return true;
	});
	return list;
}
/** Full-screen overlays that never take input themselves (NVIDIA / Xbox Game Bar...). */
const SEE_THROUGH = [
	"nvidia overlay.exe",
	"nvsphelper64.exe",
	"gamebar.exe",
	"gamebarftserver.exe"
];
function seeThrough(pid) {
	return pid !== 0 && SEE_THROUGH.includes(win32.basename(exePath(pid)).toLowerCase());
}
/** The top-level window under a point, as Windows.At in the C# helper. */
function windowAt(args) {
	const x = int(args, "x", 0), y = int(args, "y", 0);
	let h = hwndOf(WindowFromPoint({
		x,
		y
	}));
	if (h) h = hwndOf(GetAncestor(h, 2));
	if (!h || seeThrough(processOf(h))) {
		let found = 0n;
		enumWindows((w) => {
			if (!IsWindowVisible(w) || seeThrough(processOf(w))) return true;
			if ((GetWindowLongW(w, -20) & 32) !== 0) return true;
			if (IsIconic(w) || cloaked(w)) return true;
			const rc = windowRect(w);
			if (x >= rc.left && x < rc.right && y >= rc.top && y < rc.bottom) {
				found = w;
				return false;
			}
			return true;
		});
		h = found;
	}
	return describe(h);
}
let gdiplusReady = false;
const JPEG = {
	Data1: 1434252289,
	Data2: 6660,
	Data3: 4563,
	Data4: [
		154,
		115,
		0,
		0,
		248,
		30,
		243,
		46
	]
};
const QUALITY = {
	Data1: 492561589,
	Data2: 64074,
	Data3: 17709,
	Data4: [
		156,
		221,
		93,
		179,
		81,
		5,
		231,
		235
	]
};
function check(status, what) {
	if (status !== 0) throw new Error(`${what} failed (GDI+ status ${String(status)})`);
}
function startGdiplus() {
	if (gdiplusReady) return;
	check(GdiplusStartup([0n], {
		GdiplusVersion: 1,
		DebugEventCallback: null,
		SuppressBackgroundThread: 0,
		SuppressExternalCodecs: 0
	}, null), "GdiplusStartup");
	gdiplusReady = true;
}
/**
* Copy native memory into a Buffer. Not koffi.view(): Electron (the DSH host
* runtime) forbids external ArrayBuffers and aborts the process on one.
*/
function copy(pointer, offset, length) {
	return koffi.decode(pointer, offset, koffi.array("uint8_t", length, "Buffer"));
}
/** Every 8th pixel of every 8th row, as BGR bytes (same sample the C# helper takes). */
function sample(bits, w, h) {
	const sx = Math.ceil(w / 8), sy = Math.ceil(h / 8);
	const out = new Uint8Array(sx * sy * 3);
	let k = 0;
	for (let j = 0; j < sy; j++) {
		const row = copy(bits, j * 8 * w * 4, w * 4);
		for (let i = 0; i < sx; i++) {
			const o = i * 32;
			out[k++] = row[o];
			out[k++] = row[o + 1];
			out[k++] = row[o + 2];
		}
	}
	return out;
}
function changed(a, b) {
	let diff = 0;
	for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
	return a.length === 0 ? 0 : diff / (a.length / 3);
}
let marked;
let markedRect = "";
/** Encode a GDI+ image to JPEG in memory and return the bytes. */
function encodeJpeg(image, quality) {
	const value = koffi.alloc("uint32_t", 1);
	koffi.encode(value, "uint32_t", quality);
	const params = {
		Count: 1,
		Parameter: [{
			Guid: QUALITY,
			NumberOfValues: 1,
			Type: 4,
			Value: value
		}]
	};
	const stream = [0n];
	check(CreateStreamOnHGlobal(null, 1, stream), "CreateStreamOnHGlobal");
	try {
		check(GdipSaveImageToStream(image, stream[0], JPEG, params), "GdipSaveImageToStream");
		const global = [0n];
		check(GetHGlobalFromStream(stream[0], global), "GetHGlobalFromStream");
		const size = Number(GlobalSize(global[0]));
		const data = GlobalLock(global[0]);
		try {
			return copy(data, 0, size);
		} finally {
			GlobalUnlock(global[0]);
		}
	} finally {
		const vtable = koffi.decode(stream[0], "void *");
		koffi.call(koffi.decode(vtable, 16, "void *"), ReleaseProc, stream[0]);
		koffi.free(value);
	}
}
function screenshot(args) {
	const x = int(args, "x", 0), y = int(args, "y", 0), w = int(args, "width", 0), h = int(args, "height", 0);
	const ow = int(args, "outWidth", w), oh = int(args, "outHeight", h), quality = int(args, "quality", 80);
	if (w <= 0 || h <= 0 || ow <= 0 || oh <= 0) throw new Error("invalid capture size");
	startGdiplus();
	const screen = GetDC(null);
	const memory = CreateCompatibleDC(screen);
	const bits = [0n];
	const dib = CreateDIBSection(memory, {
		biSize: 40,
		biWidth: w,
		biHeight: -h,
		biPlanes: 1,
		biBitCount: 32,
		biCompression: 0,
		biSizeImage: 0,
		biXPelsPerMeter: 0,
		biYPelsPerMeter: 0,
		biClrUsed: 0,
		biClrImportant: 0
	}, 0, bits, null, 0);
	const previous = SelectObject(memory, dib);
	const images = [];
	let graphics = 0n, attrs = 0n;
	try {
		if (!BitBlt(memory, 0, 0, w, h, screen, x, y, 1087111200)) throw new Error(`BitBlt failed (error ${String(GetLastError())})`);
		GdiFlush();
		const compare = args.compare === true;
		if (args.mark === true || compare) {
			const key = `${x},${y},${w},${h}`;
			const now = sample(bits[0], w, h);
			const threshold = typeof args.threshold === "number" ? args.threshold : 5e-4;
			if (compare && marked && markedRect === key && changed(marked, now) < threshold) return { unchanged: true };
			marked = now;
			markedRect = key;
		}
		const source = [0n];
		check(GdipCreateBitmapFromScan0(w, h, w * 4, 139273, bits[0], source), "GdipCreateBitmapFromScan0");
		images.push(source[0]);
		let output = source[0];
		if (ow !== w || oh !== h) {
			const scaled = [0n];
			check(GdipCreateBitmapFromScan0(ow, oh, 0, 137224, null, scaled), "GdipCreateBitmapFromScan0");
			images.push(scaled[0]);
			const g = [0n], a = [0n];
			check(GdipGetImageGraphicsContext(scaled[0], g), "GdipGetImageGraphicsContext");
			graphics = g[0];
			GdipSetInterpolationMode(graphics, 7);
			GdipSetPixelOffsetMode(graphics, 2);
			GdipSetCompositingQuality(graphics, 2);
			check(GdipCreateImageAttributes(a), "GdipCreateImageAttributes");
			attrs = a[0];
			GdipSetImageAttributesWrapMode(attrs, 3, 0, 0);
			check(GdipDrawImageRectRectI(graphics, source[0], 0, 0, ow, oh, 0, 0, w, h, 2, attrs, null, null), "GdipDrawImageRectRectI");
			output = scaled[0];
		}
		return {
			data: encodeJpeg(output, quality).toString("base64"),
			via: "blt",
			width: ow,
			height: oh
		};
	} finally {
		if (attrs) GdipDisposeImageAttributes(attrs);
		if (graphics) GdipDeleteGraphics(graphics);
		for (const image of images) GdipDisposeImage(image);
		SelectObject(memory, previous);
		DeleteObject(dib);
		DeleteDC(memory);
		ReleaseDC(null, screen);
	}
}
const COMMANDS = {
	ping: () => ({ version: "koffi-spike" }),
	displays,
	cursor,
	move: (args) => {
		move(int(args, "x", 0), int(args, "y", 0));
		return null;
	},
	click,
	keys,
	drag,
	scroll,
	type: typeText,
	foreground,
	windows,
	window_at: windowAt,
	screenshot
};
parentPort?.on("message", (message) => {
	try {
		const run = COMMANDS[message.cmd];
		if (!run) throw new Error(`unknown command "${message.cmd}"`);
		parentPort.postMessage({
			id: message.id,
			ok: true,
			result: run(message.args) ?? null
		});
	} catch (error) {
		parentPort.postMessage({
			id: message.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}
});
parentPort?.postMessage({ event: "ready" });
//#endregion
export {};
