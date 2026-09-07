import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';

const LOCK_STALE_MS = 30_000;
const LOCK_UPDATE_MS = 10_000;
const LOCK_WAIT_MS = 50;
const LOCK_ACQUIRE_TIMEOUT_MS = 31_500;
const waiter = new Int32Array(new SharedArrayBuffer(4));

export function withFileLock<T>(filePath: string, run: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true });
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  let release: (() => void) | undefined;

  while (!release) {
    try {
      release = lockfile.lockSync(filePath, {
        realpath: false,
        stale: LOCK_STALE_MS,
        update: LOCK_UPDATE_MS
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== 'ELOCKED' || Date.now() >= deadline) throw error;
      Atomics.wait(waiter, 0, 0, LOCK_WAIT_MS);
    }
  }

  try {
    return run();
  } finally {
    release();
  }
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
