# koffi 可行性原型（spike/koffi-helper）

起因：[#1](https://github.com/copylee711/dsh-computer-use/issues/1)。智能应用控制（SAC）拒绝运行现场编译的 `cu-helper.exe`。0.7.7 的回退办法是在 powershell.exe 里加载它；这个分支验证另一条路：在宿主进程里通过 FFI 直接调 Win32，不再需要 csc 和 exe。

## 做法

- **koffi 的来源**：用 DSH 自带的 `koffi.node`（`resources/app.asar.unpacked/dsh/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node`，3.1.1），**不**用 npm 上的 koffi。前者有 DeepSeek 的 Authenticode 签名（`Get-AuthenticodeSignature` 为 Valid），SAC 下能加载；后者没有签名，和 cu-helper.exe 一样会被拦。npm 上的 `koffi@3.1.1` 只作为 devDependency 提供类型。
- **查找路径**（`src/native/koffi-path.ts`）：`DSH_KOFFI_PATH` → `process.resourcesPath` → `dirname(process.execPath)/resources`（宿主以 `DeepSeek Harness.exe` + `ELECTRON_RUN_AS_NODE` 运行，没有 resourcesPath）→ `%LOCALAPPDATA%\Programs\DeepSeek Harness`。
- **线程**（`src/native/worker.ts`）：所有调用放在一个 worker_thread 里，线程级 `SetThreadDpiAwarenessContext(-4)`（每显示器 v2，和 C# helper 一样用物理像素）；Sleep 用 `Atomics.wait`，不阻塞宿主的事件循环。
- **混合**（`src/native/native-helper.ts`）：`NativeHelper` 实现 `HelperLike`，`ping / displays / cursor / move / click / keys / screenshot` 走 koffi，其余命令转给原来的 C# helper。**还没接进插件。**
- **截图**：GDI `BitBlt` 拷到 32 位 DIB，再用 GDI+ flat API 缩放（HighQualityBicubic + TileFlipXY，和 C# 的设置一样），然后 `GdipSaveImageToStream` 编码成 JPEG，经 `CreateStreamOnHGlobal` 拿到字节，最后通过 vtable 调 `IUnknown::Release` 释放流。`mark` / `compare` 的采样算法照搬 C#。

## 结果（本机，2560×1600 @192dpi，SAC 关闭）

`node scripts/native-smoke.mjs`，在 DSH 运行时下执行：`ELECTRON_RUN_AS_NODE=1 "<DSH>\DeepSeek Harness.exe" scripts/native-smoke.mjs`

| 项目 | C# helper | koffi |
|---|---|---|
| 启动 | 170–520 ms（exe 已编译好） | 35–43 ms |
| `displays` | — | 与 C# 输出逐字段一致 |
| 截图 2560×1600 → 1280×800，q80 | 中位数 127 ms | 中位数 107–117 ms |
| JPEG 大小 | 128.7 KB | 129.4 KB（同一画面，肉眼无差别） |
| 全尺寸截图（不缩放） | — | 约 40–50 ms |
| `mark` 后立即 `compare` | — | `{ unchanged: true }` |
| `move` 后 `cursor` | C# 读到同一位置 | 正确 |

worker 截图期间，事件循环的 5 ms 定时器仍在跳动，宿主没有被阻塞。

## 踩到的坑

- **Electron 禁止外部 ArrayBuffer**：`koffi.view()` 在普通 node 下正常，在 DSH 运行时下直接 `FATAL ERROR` 让进程崩溃。原生内存一律用 `koffi.decode(ptr, offset, koffi.array('uint8_t', n, 'Buffer'))` 拷出来。以后测试必须在 DSH 运行时下跑，不能只用 node。
- koffi 3 去掉了 `koffi.sizeof()`，改用 `TypeObject.size`；指针一律是 BigInt。

## 没验证的

- **SAC 开启时能否加载**：本机 SAC 是关闭的。依据只有签名（DeepSeek 签名的 koffi.node，加上 user32 / gdi32 / gdiplus 这些系统 DLL）。需要 #1 的报告者或一台开着 SAC 的机器确认。
- `click` / `keys` 没有实机发送（不往用户的应用里盲发输入），只写了代码。它们的 INPUT 结构是手工按 x64 布局（40 字节）填的，下一步要用 Notepad 冒烟验证，方法和 `helper-smoke.mjs --notepad` 一样。
- 只有 DSH 桌面版带 koffi.node；用纯 CLI 或其他方式安装的宿主找不到它，这种情况下必须保留 C# 路径。koffi.node 的路径属于 DSH 内部实现，升级后可能变化。

## 剩下的工作量（C# 2838 行）

| 模块 | 难度 | 说明 |
|---|---|---|
| Input 其余命令（drag / scroll / type / paste / key_state） | 低 | 都是 SendInput，照搬即可 |
| Windows / foreground / window_at / focus / window_cmd | 低–中 | EnumWindows、GetWindowText、进程路径 |
| Clipboard（文本） | 中 | Open/Get/SetClipboardData；“保留用户全部格式”的快照要逐个格式复制 |
| Apps（开始菜单搜索 / 启动） | 中 | .lnk 解析需要 IShellLink 的 COM vtable 调用 |
| MagCapture（截图时排除卡片） | 中 | Magnification API，需要一个隐藏窗口 |
| Overlay / 卡片 / 宠物 / 指令输入框 | **高** | 目前是 WinForms 分层窗口加动画，要改成自己的窗口过程和消息循环（放在单独的 worker 里），再用 GDI+ 自绘 |
| UI Automation（ui / text） | **高** | 全部是 COM vtable 调用（IUIAutomation、TreeWalker、Condition…），代码量最大 |

## 建议

1. 先把已有的命令接进插件：只要找到 koffi.node 就走 `NativeHelper`，其余命令仍交给 C#，在 SAC 机器上就是 C# 跑在 powershell 宿主里。截图和输入是调用最频繁的路径，启动快、少一次进程间往返，这部分收益最大。
2. 按上表从低到高逐步迁移；浮层和 UIA 最后做，或者一直留在 C# 里（powershell 宿主可以兜底）。
3. 一直保留 C# 路径，给没有 koffi.node 的宿主用。
