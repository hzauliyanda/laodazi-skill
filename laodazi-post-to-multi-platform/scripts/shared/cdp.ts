import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';

export interface ChromeSession {
  cdp: any;
  sessionId: string;
  targetId: string;
}

export interface CdpConnection {
  send: <T = any>(method: string, params?: any, context?: { sessionId?: string }) => Promise<T>;
  close: () => void;
}

export interface LaunchResult {
  cdp: CdpConnection;
  chrome: ChildProcess;
}

export async function launchChrome(url: string, customProfileDir?: string): Promise<LaunchResult> {
  const profileDir = customProfileDir || path.join(os.homedir(), '.local/share/multi-platform-publish-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  const chromePath = process.env.MULTI_PLATFORM_CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' :
     process.platform === 'linux' ? '/google-chrome' :
     'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

  let port = 9222;
  while (port < 9230) {
    const socket = new net.Socket();
    const tryConnect = () => new Promise<boolean>((resolve) => {
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        resolve(false);
      });
      socket.connect({ port, host: '127.0.0.1' });
      socket.setTimeout(100);
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    const inUse = await tryConnect();
    if (!inUse) break;
    port++;
  }

  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ], { detached: true });

  const cdp = await connectToCdp(port);
  return { cdp, chrome };
}

async function connectToCdp(port: number, retries = 30): Promise<CdpConnection> {
  const socket = new net.Socket();
  const connect = () => new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
    socket.connect({ port, host: '127.0.0.1' });
  });

  for (let i = 0; i < retries; i++) {
    try {
      await connect();
      break;
    } catch {
      if (i === retries - 1) throw new Error('Chrome debug port not ready');
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const messages: any[] = [];
  socket.on('data', (data) => {
    const text = data.toString();
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        messages.push(JSON.parse(line));
      } catch {}
    }
  });

  let id = 1;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();

  const checkMessages = () => {
    for (const msg of messages) {
      if (msg.id !== undefined) {
        const pendingItem = pending.get(msg.id);
        if (pendingItem && msg.result !== undefined || msg.error !== undefined) {
          pending.delete(msg.id);
          if (msg.error) pendingItem.reject(new Error(msg.error.message));
          else pendingItem.resolve(msg.result);
        }
      }
    }
  };

  setInterval(checkMessages, 10);

  return {
    send: async <T = any>(method: string, params?: any, context?: { sessionId?: string }): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const currentId = id++;
        pending.set(currentId, { resolve, reject });
        socket.write(JSON.stringify({
          id: currentId,
          method,
          params,
          ...context,
        }) + '\n');
        setTimeout(() => {
          if (pending.has(currentId)) {
            pending.delete(currentId);
            reject(new Error(`CDP timeout: ${method}`));
          }
        }, 30000);
      });
    },
    close: () => socket.destroy(),
  };
}

export async function getPageSession(cdp: CdpConnection, domain: string): Promise<ChromeSession> {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find((t: any) => t.url?.includes(domain));
  if (!target) throw new Error(`No target found for domain: ${domain}`);
  
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  return { cdp, sessionId, targetId: target.targetId };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function evaluate<T = any>(session: ChromeSession, expression: string): Promise<T> {
  const result = await session.cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  }, { sessionId: session.sessionId });
  return (result as any).result?.value as T;
}

export async function clickElement(session: ChromeSession, selector: string): Promise<void> {
  await evaluate(session, `document.querySelector('${selector}').click()`);
}

export async function typeText(session: ChromeSession, text: string): Promise<void> {
  await session.cdp.send('Input.insertText', { text }, { sessionId: session.sessionId });
}

export async function waitForElement(session: ChromeSession, selector: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const exists = await evaluate<boolean>(session, `!!document.querySelector('${selector}')`);
    if (exists) return;
    await sleep(200);
  }
  throw new Error(`Element not found within timeout: ${selector}`);
}
