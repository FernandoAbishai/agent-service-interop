import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const LOCK_STALE_MS = envMs('THI_FILE_LOCK_STALE_MS', 30_000);
const LOCK_UPDATE_MS = envMs('THI_FILE_LOCK_UPDATE_MS', 10_000);
const LOCK_RETRY_MS = 50;
const LOCK_RETRY_COUNT = 700;
const ACQUIRE_WAIT_MS = 40_000;
const RELEASE_WAIT_MS = 10_000;
const waiter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const moduleRequire = createRequire(import.meta.url);
const PROPER_LOCKFILE_MODULE = moduleRequire.resolve('proper-lockfile');

// The helper owns the lease so its heartbeat keeps running even while the caller's
// synchronous read/modify/write section blocks the caller event loop.
const LOCK_HELPER_SOURCE = String.raw`
  const fs = require('node:fs');
  const path = require('node:path');
  const lockfile = require(process.env.THI_LOCK_MODULE);
  const filePath = process.env.THI_LOCK_FILE;
  const controlPath = process.env.THI_LOCK_CONTROL;
  const parentPid = Number(process.env.THI_LOCK_PARENT_PID);
  const stale = Number(process.env.THI_LOCK_STALE_MS);
  const update = Number(process.env.THI_LOCK_UPDATE_MS);
  const retryMs = Number(process.env.THI_LOCK_RETRY_MS);
  const retryCount = Number(process.env.THI_LOCK_RETRY_COUNT);

  function statusPath(name) {
    return path.join(controlPath, name);
  }

  function writeStatus(name, value = '') {
    try {
      fs.writeFileSync(statusPath(name), value, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
    }
  }

  function parentIsAlive() {
    if (process.ppid !== parentPid) return false;
    try {
      process.kill(parentPid, 0);
      return true;
    } catch (error) {
      return Boolean(error && error.code === 'EPERM');
    }
  }

  (async () => {
    try {
      const release = await lockfile.lock(filePath, {
        realpath: false,
        stale,
        update,
        retries: {
          retries: retryCount,
          factor: 1,
          minTimeout: retryMs,
          maxTimeout: retryMs
        }
      });

      writeStatus('acquired');
      let releasing = false;
      const timer = setInterval(async () => {
        if (releasing) return;
        const parentAlive = parentIsAlive();
        if (parentAlive && !fs.existsSync(statusPath('release'))) return;
        releasing = true;
        clearInterval(timer);
        try {
          await release();
          writeStatus('released');
        } catch (error) {
          writeStatus('error', error && error.message ? error.message : String(error));
        } finally {
          if (!parentAlive) {
            try { fs.rmSync(controlPath, { recursive: true, force: true }); } catch {}
          }
        }
      }, 25);
    } catch (error) {
      writeStatus('error', error && error.message ? error.message : String(error));
    }
  })();
`;

function waitForStatus(controlPath: string, successName: string, timeoutMs: number): void {
  const successPath = `${controlPath}/${successName}`;
  const errorPath = `${controlPath}/error`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(successPath)) return;
    if (existsSync(errorPath)) {
      throw new Error(readFileSync(errorPath, 'utf8') || `File-state lock helper failed during ${successName}`);
    }
    Atomics.wait(waiter, 0, 0, 25);
  }
  throw new Error(`Timed out waiting for file-state lock helper status: ${successName}`);
}

export function withFileLock<T>(filePath: string, run: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true });
  const controlPath = `${filePath}.lock-control.${process.pid}.${randomUUID()}`;
  mkdirSync(controlPath, { recursive: true });
  const helper = spawn(process.execPath, ['-e', LOCK_HELPER_SOURCE], {
    stdio: 'ignore',
    env: {
      ...process.env,
      THI_LOCK_FILE: filePath,
      THI_LOCK_CONTROL: controlPath,
      THI_LOCK_PARENT_PID: String(process.pid),
      THI_LOCK_MODULE: PROPER_LOCKFILE_MODULE,
      THI_LOCK_STALE_MS: String(LOCK_STALE_MS),
      THI_LOCK_UPDATE_MS: String(LOCK_UPDATE_MS),
      THI_LOCK_RETRY_MS: String(LOCK_RETRY_MS),
      THI_LOCK_RETRY_COUNT: String(LOCK_RETRY_COUNT)
    }
  });

  let result: T | undefined;
  let runError: unknown;
  let acquired = false;
  try {
    waitForStatus(controlPath, 'acquired', ACQUIRE_WAIT_MS);
    acquired = true;
    result = run();
  } catch (error) {
    runError = error;
    if (!acquired) helper.kill('SIGTERM');
  }

  let releaseError: unknown;
  try {
    if (existsSync(`${controlPath}/acquired`)) {
      writeFileSync(`${controlPath}/release`, '', { flag: 'wx' });
      waitForStatus(controlPath, 'released', RELEASE_WAIT_MS);
    }
  } catch (error) {
    releaseError = error;
    helper.kill('SIGTERM');
  } finally {
    rmSync(controlPath, { recursive: true, force: true });
    helper.unref();
  }

  if (runError !== undefined && releaseError !== undefined) {
    throw new AggregateError([runError, releaseError], 'File-state operation and lock release both failed');
  }
  if (releaseError !== undefined) throw releaseError;
  if (runError !== undefined) throw runError;
  return result as T;
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const tempFd = openSync(tempPath, 'r');
    try {
      fsyncSync(tempFd);
    } finally {
      closeSync(tempFd);
    }
    renameSync(tempPath, filePath);

    // Persist the rename where the platform supports directory fsync.
    try {
      const dirFd = openSync(directory, 'r');
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      // Some filesystems/platforms do not support fsync on directory handles.
    }
  } finally {
    rmSync(tempPath, { force: true });
  }
}
