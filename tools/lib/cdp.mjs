// Tiny Chrome DevTools Protocol client for the APP tools (Node 24: global fetch + WebSocket).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ width = 1280, height = 720, extraArgs = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'armchair-cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--remote-debugging-port=0',
    ...extraArgs, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start')), 30000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error('Chrome exited ' + code)); });
  });
  const port = new URL(wsUrl).port;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((x) => x.type === 'page');
  const client = await connect(page.webSocketDebuggerUrl);
  client.close = async () => {
    try { client.ws.close(); } catch { /* ignore */ }
    proc.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return client;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    const client = {
      ws,
      send(method, params = {}) {
        const msgId = ++id;
        ws.send(JSON.stringify({ id: msgId, method, params }));
        return new Promise((res, rej) => pending.set(msgId, { res, rej, method }));
      },
      on(method, fn) {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(fn);
      },
      async eval(expr) {
        const r = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
        return r.result.value;
      },
    };
    ws.onopen = () => resolve(client);
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
        else p.res(msg.result);
      } else if (msg.method && listeners.has(msg.method)) {
        for (const fn of listeners.get(msg.method)) fn(msg.params);
      }
    };
  });
}

// Open url at the given viewport, collect errors, wait for window.__armchair.readyForShot().
export async function openPage(client, url, { width = 1280, height = 720, mobile = false, timeoutMs = 120000, settleFrames = 4 } = {}) {
  const errors = [];
  if (!client._hooked) {
    client._hooked = true;
    client._errors = errors;
    client.on('Runtime.exceptionThrown', (p) => client._errors.push('exception: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
    client.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') client._errors.push('console.' + p.type + ': ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
      if (p.type === 'warning') (client._warnings = client._warnings || []).push(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    client.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) client._errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : ''));
    });
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
  }
  client._errors = errors;
  client._warnings = [];
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  else await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.send('Page.navigate', { url });
  const t0 = Date.now();
  let state = null;
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      state = await client.eval('window.__armchair && window.__armchair.readyForShot ? JSON.stringify(window.__armchair.readyForShot()) : null');
      state = state ? JSON.parse(state) : null;
    } catch { state = null; }
    if (state && state.ready) break;
  }
  // let a few more frames render after everything is in
  if (state && state.ready) {
    const f0 = state.frames;
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      await new Promise((r) => setTimeout(r, 250));
      const f = await client.eval('window.__armchair.frames');
      if (f - f0 >= settleFrames) break;
    }
  }
  return { state, errors: client._errors, warnings: client._warnings || [], ms: Date.now() - t0 };
}

export async function screenshot(client, file) {
  const r = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}
