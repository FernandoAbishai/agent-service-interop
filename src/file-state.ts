import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCK_WAIT_MS = 25;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 40_000;
const waiter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

type LockOwner = {
  version: 1;
  pid: number;
  token: string;
};

type LockPathKind = 'missing' | 'file' | 'directory' | 'other';

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as { code?: string }).code === 'EPERM';
  }
}

function pathKind(path: string): LockPathKind {
  try {
    const stat = lstatSync(path);
    if (stat.isFile()) return 'file';
    if (stat.isDirectory()) return 'directory';
    return 'other';
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'ENOENT') return 'missing';
    throw error;
  }
}

function parseOwner(serialized: string, label: string): LockOwner {
  const owner = JSON.parse(serialized) as Partial<LockOwner>;
  if (
    owner.version !== 1 ||
    typeof owner.pid !== 'number' ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.token !== 'string' ||
    owner.token.length === 0
  ) {
    throw new Error(`Malformed file-state lock owner: ${label}`);
  }
  return owner as LockOwner;
}

function readFileOwner(path: string): LockOwner | undefined {
  try {
    return parseOwner(readFileSync(path, 'utf8'), path);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

function directoryOwnerPath(directoryPath: string): string {
  return join(directoryPath, 'owner.json');
}

function readDirectoryOwner(directoryPath: string): LockOwner | undefined {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return parseOwner(readFileSync(directoryOwnerPath(directoryPath), 'utf8'), directoryPath);
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      if (!existsSync(directoryPath)) return undefined;
      Atomics.wait(waiter, 0, 0, 1);
    }
  }
  throw new Error(`Malformed file-state lock owner: ${directoryPath}`);
}

function fsyncFile(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function prepareOwnerFile(candidatePath: string, owner: LockOwner): string {
  writeFileSync(candidatePath, `${JSON.stringify(owner)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  });
  fsyncFile(candidatePath);
  return candidatePath;
}

function prepareOwnedDirectory(candidatePath: string, owner: LockOwner): string {
  mkdirSync(candidatePath);
  const metadataPath = directoryOwnerPath(candidatePath);
  writeFileSync(metadataPath, `${JSON.stringify(owner)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  });
  fsyncFile(metadataPath);
  return candidatePath;
}

function contentionError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'EEXIST' || code === 'EISDIR' || code === 'ENOTEMPTY' || code === 'EPERM' || code === 'EACCES';
}

function recoverDeadRecoveryClaim(recoveryPath: string, observed: LockOwner): boolean {
  if (processIsAlive(observed.pid)) return false;

  const tombstonePath = `${recoveryPath}.dead.${observed.token}`;
  try {
    renameSync(recoveryPath, tombstonePath);
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') return true;
    if (code === 'EEXIST' || code === 'ENOTEMPTY') return true;
    if (code === 'EPERM' && existsSync(tombstonePath)) return true;
    throw error;
  }
}

function claimDeadOwnerRecovery(lockPath: string, observed: LockOwner): LockOwner | undefined {
  const recoveryPath = `${lockPath}.recover-${observed.token}`;
  const recoveryOwner: LockOwner = { version: 1, pid: process.pid, token: randomUUID() };
  const candidatePath = prepareOwnedDirectory(
    `${recoveryPath}.candidate.${recoveryOwner.pid}.${recoveryOwner.token}`,
    recoveryOwner
  );

  try {
    while (true) {
      try {
        renameSync(candidatePath, recoveryPath);
        return recoveryOwner;
      } catch (error: unknown) {
        if (!contentionError(error)) {
          if ((error as { code?: string }).code === 'ENOENT') return undefined;
          throw error;
        }
      }

      const existing = readDirectoryOwner(recoveryPath);
      if (!existing) continue;
      if (recoverDeadRecoveryClaim(recoveryPath, existing)) continue;
      return undefined;
    }
  } finally {
    if (existsSync(candidatePath)) rmSync(candidatePath, { recursive: true, force: true });
  }
}

function releaseRecoveryClaim(lockPath: string, observed: LockOwner, recoveryOwner: LockOwner): void {
  const recoveryPath = `${lockPath}.recover-${observed.token}`;
  const current = readDirectoryOwner(recoveryPath);
  if (!current) return;
  if (current.pid !== recoveryOwner.pid || current.token !== recoveryOwner.token) return;

  const releasedPath = `${recoveryPath}.released.${recoveryOwner.token}.${randomUUID()}`;
  try {
    renameSync(recoveryPath, releasedPath);
    rmSync(releasedPath, { recursive: true, force: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
}

function recoverDeadOwner(lockPath: string, observed: LockOwner): boolean {
  if (processIsAlive(observed.pid)) return false;

  const recoveryOwner = claimDeadOwnerRecovery(lockPath, observed);
  if (!recoveryOwner) return false;

  try {
    const current = readFileOwner(lockPath);
    if (!current || current.pid !== observed.pid || current.token !== observed.token) {
      return true;
    }
    if (processIsAlive(current.pid)) return false;

    const quarantinePath = `${lockPath}.dead.${observed.token}.${recoveryOwner.token}`;
    try {
      renameSync(lockPath, quarantinePath);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'ENOENT') return true;
      throw error;
    }
    rmSync(quarantinePath, { force: true });
    return true;
  } finally {
    releaseRecoveryClaim(lockPath, observed, recoveryOwner);
  }
}

function releaseOwnedLock(lockPath: string, owner: LockOwner): void {
  const current = readFileOwner(lockPath);
  if (!current || current.pid !== owner.pid || current.token !== owner.token) {
    throw new Error(`File-state lock ownership changed before release: ${lockPath}`);
  }
  unlinkSync(lockPath);
}

export function withFileLock<T>(filePath: string, run: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const owner: LockOwner = { version: 1, pid: process.pid, token: randomUUID() };
  const candidatePath = prepareOwnerFile(`${lockPath}.candidate.${owner.pid}.${owner.token}`, owner);
  const deadline = Date.now() + envMs('THI_FILE_LOCK_WAIT_TIMEOUT_MS', DEFAULT_LOCK_WAIT_TIMEOUT_MS);
  let acquired = false;

  try {
    while (!acquired) {
      try {
        linkSync(candidatePath, lockPath);
        acquired = true;
        rmSync(candidatePath, { force: true });
        break;
      } catch (error: unknown) {
        if (!contentionError(error)) throw error;
      }

      const kind = pathKind(lockPath);
      if (kind === 'missing') continue;
      if (kind === 'directory') {
        if (Date.now() >= deadline) {
          throw new Error(`Legacy file-state lock directory is still present; refusing to replace it: ${lockPath}`);
        }
        Atomics.wait(waiter, 0, 0, LOCK_WAIT_MS);
        continue;
      }
      if (kind !== 'file') {
        throw new Error(`Unsupported file-state lock path type: ${lockPath}`);
      }

      const observed = readFileOwner(lockPath);
      if (!observed) continue;
      if (recoverDeadOwner(lockPath, observed)) continue;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for live file-state lock owner ${observed.pid}: ${lockPath}`);
      }
      Atomics.wait(waiter, 0, 0, LOCK_WAIT_MS);
    }

    let result: T | undefined;
    let runError: unknown;
    try {
      result = run();
    } catch (error) {
      runError = error;
    }

    let releaseError: unknown;
    try {
      releaseOwnedLock(lockPath, owner);
    } catch (error) {
      releaseError = error;
    }

    if (runError !== undefined && releaseError !== undefined) {
      throw new AggregateError([runError, releaseError], 'File-state operation and lock release both failed');
    }
    if (releaseError !== undefined) throw releaseError;
    if (runError !== undefined) throw runError;
    return result as T;
  } finally {
    if (existsSync(candidatePath)) rmSync(candidatePath, { force: true });
  }
}

function existingFileMode(filePath: string): number {
  try {
    return statSync(filePath).mode & 0o777;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'ENOENT') return 0o600;
    throw error;
  }
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const mode = existingFileMode(filePath);

  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode
    });
    chmodSync(tempPath, mode);
    fsyncFile(tempPath);
    renameSync(tempPath, filePath);

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
