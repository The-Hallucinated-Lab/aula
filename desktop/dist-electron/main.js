import { BrowserWindow as e, Menu as t, app as n, dialog as r, ipcMain as i, shell as a } from "electron";
import { mkdir as o, readFile as s, writeFile as c } from "node:fs/promises";
import { existsSync as l, readFileSync as u, writeFileSync as d } from "node:fs";
import { dirname as f, join as p } from "node:path";
import { fileURLToPath as m } from "node:url";
//#region electron/main.ts
var h = f(m(import.meta.url)), g = process.env.VITE_DEV_SERVER_URL, _ = !!g, v = {
	width: 1440,
	height: 920,
	maximized: !1
}, y = 1024, b = 680, x = null, S = () => p(n.getPath("userData"), "window-state.json");
function C() {
	try {
		let e = u(S(), "utf-8"), t = JSON.parse(e);
		return {
			width: Math.max(y, Number(t.width) || v.width),
			height: Math.max(b, Number(t.height) || v.height),
			x: typeof t.x == "number" ? t.x : void 0,
			y: typeof t.y == "number" ? t.y : void 0,
			maximized: !!t.maximized
		};
	} catch {
		return { ...v };
	}
}
function w(e) {
	try {
		let t = e.isMaximized() ? e._restoreBounds ?? e.getBounds() : e.getBounds(), n = {
			width: t.width,
			height: t.height,
			x: t.x,
			y: t.y,
			maximized: e.isMaximized()
		};
		d(S(), JSON.stringify(n), "utf-8");
	} catch {}
}
function T() {
	let t = C();
	x = new e({
		width: t.width,
		height: t.height,
		x: t.x,
		y: t.y,
		minWidth: y,
		minHeight: b,
		show: !1,
		backgroundColor: "#f2f1ec",
		title: "Aula — Timetable Studio",
		autoHideMenuBar: !0,
		titleBarStyle: "hidden",
		titleBarOverlay: !1,
		frame: !1,
		icon: p(h, "../build/icon.png"),
		webPreferences: {
			preload: p(h, "preload.cjs"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !1,
			spellcheck: !1
		}
	}), t.maximized && x.maximize(), x.once("ready-to-show", () => x?.show()), x.webContents.on("preload-error", (e, t, n) => {
		console.error("[Aula] preload failed to load:", t, n);
	});
	let n = () => x?.webContents.send("window:maximized", x.isMaximized());
	x.on("maximize", n), x.on("unmaximize", n), x.on("close", () => {
		x && w(x);
	}), x.on("closed", () => {
		x = null;
	}), x.webContents.setWindowOpenHandler(({ url: e }) => (/^https?:/.test(e) && a.openExternal(e), { action: "deny" })), x.webContents.on("will-navigate", (e, t) => {
		g && t.startsWith(g) || (e.preventDefault(), /^https?:/.test(t) && a.openExternal(t));
	}), g ? x.loadURL(g) : x.loadFile(p(h, "../dist/index.html"));
}
function E(e) {
	x?.webContents.send("menu:action", e);
}
function D() {
	let e = t.buildFromTemplate([
		{
			label: "&File",
			submenu: [
				{
					label: "New institution…",
					accelerator: "CmdOrCtrl+N",
					click: () => E("new")
				},
				{
					label: "Open project…",
					accelerator: "CmdOrCtrl+O",
					click: () => E("open")
				},
				{
					label: "Save project…",
					accelerator: "CmdOrCtrl+S",
					click: () => E("save")
				},
				{ type: "separator" },
				{
					label: "Export timetable (CSV)",
					accelerator: "CmdOrCtrl+E",
					click: () => E("export-timetable")
				},
				{
					label: "Export constraint register (CSV)",
					click: () => E("export-constraints")
				},
				{ type: "separator" },
				{
					role: "quit",
					label: "Exit"
				}
			]
		},
		{
			label: "&Schedule",
			submenu: [
				{
					label: "Generate timetable",
					accelerator: "CmdOrCtrl+G",
					click: () => E("generate")
				},
				{
					label: "Constraint catalogue",
					accelerator: "CmdOrCtrl+K",
					click: () => E("constraints")
				},
				{
					label: "Institution setup",
					accelerator: "CmdOrCtrl+,",
					click: () => E("setup")
				},
				{
					label: "Academic calendar",
					accelerator: "CmdOrCtrl+L",
					click: () => E("calendar")
				}
			]
		},
		{
			label: "&View",
			submenu: [
				{ role: "reload" },
				{
					role: "toggleDevTools",
					visible: _
				},
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" }
			]
		},
		{
			label: "&Help",
			submenu: [{
				label: "About Aula",
				click: () => {
					r.showMessageBox(x, {
						type: "info",
						title: "About Aula",
						message: "Aula — Timetable Studio",
						detail: `Version ${n.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\nA constraint-driven timetable planner. The scheduling engine runs locally; no data leaves this machine.`,
						buttons: ["Close"]
					});
				}
			}]
		}
	]);
	t.setApplicationMenu(e);
}
i.handle("file:save", async (e, t) => {
	if (!x) return {
		ok: !1,
		error: "No window"
	};
	try {
		let e = await r.showSaveDialog(x, {
			title: "Save",
			defaultPath: p(n.getPath("documents"), t.suggestedName),
			filters: t.filters,
			properties: ["createDirectory", "showOverwriteConfirmation"]
		});
		return e.canceled || !e.filePath ? {
			ok: !1,
			canceled: !0
		} : (await o(f(e.filePath), { recursive: !0 }), await c(e.filePath, t.data, "utf-8"), {
			ok: !0,
			path: e.filePath
		});
	} catch (e) {
		return {
			ok: !1,
			error: e instanceof Error ? e.message : String(e)
		};
	}
}), i.handle("file:open", async (e, t) => {
	if (!x) return {
		ok: !1,
		error: "No window"
	};
	try {
		let e = await r.showOpenDialog(x, {
			title: "Open",
			filters: t,
			properties: ["openFile"]
		});
		if (e.canceled || e.filePaths.length === 0) return {
			ok: !1,
			canceled: !0
		};
		let n = e.filePaths[0];
		return l(n) ? {
			ok: !0,
			data: await s(n, "utf-8"),
			path: n
		} : {
			ok: !1,
			error: "That file no longer exists"
		};
	} catch (e) {
		return {
			ok: !1,
			error: e instanceof Error ? e.message : String(e)
		};
	}
});
var O = "http://localhost:11434";
i.handle("assistant:probe", async () => {
	try {
		let e = new AbortController(), t = setTimeout(() => e.abort(), 2500), n = await fetch(`${O}/api/tags`, { signal: e.signal });
		return clearTimeout(t), n.ok ? {
			ok: !0,
			models: ((await n.json()).models ?? []).map((e) => e.name)
		} : {
			ok: !1,
			models: [],
			error: `Ollama returned ${n.status}`
		};
	} catch (e) {
		return {
			ok: !1,
			models: [],
			error: e instanceof Error ? e.message : "Could not reach Ollama"
		};
	}
});
var k = /* @__PURE__ */ new Map();
i.on("assistant:cancel", (e, t) => {
	k.get(t)?.abort(), k.delete(t);
}), i.on("assistant:chat", async (e, t) => {
	let { requestId: n, model: r, messages: i } = t, a = new AbortController();
	k.set(n, a);
	let o = (t, n) => {
		e.sender.isDestroyed() || e.sender.send(t, n);
	};
	try {
		let e = await fetch(`${O}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: r,
				messages: i,
				stream: !0,
				think: !1,
				options: {
					temperature: .2,
					num_ctx: 8192
				}
			}),
			signal: a.signal
		});
		if (!e.ok || !e.body) {
			o("assistant:error", {
				requestId: n,
				message: `Assistant request failed (${e.status})`
			});
			return;
		}
		let t = e.body.getReader(), s = new TextDecoder(), c = "";
		for (;;) {
			let { done: e, value: r } = await t.read();
			if (e) break;
			c += s.decode(r, { stream: !0 });
			let i = c.split("\n");
			c = i.pop() ?? "";
			for (let e of i) {
				let t = e.trim();
				if (t) try {
					let e = JSON.parse(t).message?.content;
					e && o("assistant:chunk", {
						requestId: n,
						text: e
					});
				} catch {}
			}
		}
		o("assistant:done", { requestId: n });
	} catch (e) {
		o(e instanceof Error && e.name === "AbortError" ? "assistant:done" : "assistant:error", {
			requestId: n,
			message: e instanceof Error ? e.message : String(e)
		});
	} finally {
		k.delete(n);
	}
}), i.on("window:minimize", () => x?.minimize()), i.on("window:toggle-maximize", () => {
	x && (x.isMaximized() ? x.unmaximize() : x.maximize());
}), i.on("window:close", () => x?.close()), i.handle("window:is-maximized", () => x?.isMaximized() ?? !1), n.requestSingleInstanceLock() ? (n.on("second-instance", () => {
	x && (x.isMinimized() && x.restore(), x.focus());
}), n.whenReady().then(() => {
	D(), T(), n.on("activate", () => {
		e.getAllWindows().length === 0 && T();
	});
}), n.on("window-all-closed", () => {
	process.platform !== "darwin" && n.quit();
})) : n.quit();
//#endregion
export {};
