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
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCK_WAIT_MS = 25;
const LOCK_WAIT_TIMEOUT_MS = 40_000;
const waiter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

type LockOwner = {
  version: 1;
  pid: number;
  token: string;
};

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as { code?: string }).code === 'EPERM';
  }
}

function ownerPath(lockPath: string): string {
  return join(lockPath, 'owner.json');
}

function readLockOwner(lockPath: string): LockOwner | undefined {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const owner = JSON.parse(readFileSync(ownerPath(lockPath), 'utf8')) as Partial<LockOwner>;
      if (owner.version !== 1 || !Number.isInteger(owner.pid) || typeof owner.token !== 'string' || owner.token.length === 0) {
        throw new Error(`Malformed file-state lock owner: ${lockPath}`);
      }
      return owner as LockOwner;
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      if (!existsSync(lockPath)) return undefined;
      // The previous owner may have disappeared between the owner-file lookup
      // and the directory check while a successor was published. Retry that
      // handoff window, but never reinterpret persistent malformed state.
      Atomics.wait(waiter, 0, 0, 1);
    }
  }
  throw new Error(`Malformed file-state lock owner: ${lockPath}`);
}

function prepareOwnedDirectory(candidatePath: string, owner: LockOwner): string {
  mkdirSync(candidatePath);
  const metadataPath = ownerPath(candidatePath);
  writeFileSync(metadataPath, `${JSON.stringify(owner)}\n`, { encoding: 'utf8', flag: 'wx' });

  // Make the owner record durable before atomically publishing the directory.
  const fd = openSync(metadataPath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return candidatePath;
}

function prepareCandidate(lockPath: string, owner: LockOwner): string {
  return prepareOwnedDirectory(`${lockPath}.candidate.${owner.pid}.${owner.token}`, owner);
}

function contentionError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM' || code === 'EACCES';
}

function recoverDeadRecoveryClaim(recoveryPath: string, observed: LockOwner): boolean {
  if (processIsAlive(observed.pid)) return false;

  // Retain one deterministic, non-empty tombstone for the observed recovery
  // generation. A delayed contender cannot rename a successor claim over it.
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
  const recoveryPath = join(lockPath, `.recover-${observed.token}`);
  const recoveryOwner: LockOwner = { version: 1, pid: process.pid, token: randomUUID() };
  // Prepare outside the volatile dead-lock directory. Another recovery may move
  // that whole generation while this contender is constructing its claim.
  const candidatePath = prepareOwnedDirectory(
    `${lockPath}.recovery-candidate.${observed.token}.${recoveryOwner.pid}.${recoveryOwner.token}`,
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

      const existing = readLockOwner(recoveryPath);
      if (!existing) continue;
      if (recoverDeadRecoveryClaim(recoveryPath, existing)) continue;
      return undefined;
    }
  } finally {
    if (existsSync(candidatePath)) rmSync(candidatePath, { recursive: true, force: true });
  }
}

function recoverDeadOwner(lockPath: string, observed: LockOwner): boolean {
  if (processIsAlive(observed.pid)) return false;

  // Recovery is itself PID+token owned. A crash after claiming recovery leaves a
  // recoverable claim rather than pinning the dead writer forever.
  const recoveryOwner = claimDeadOwnerRecovery(lockPath, observed);
  if (!recoveryOwner) return false;

  const current = readLockOwner(lockPath);
  if (!current || current.pid !== observed.pid || current.token !== observed.token) {
    // The fixed path advanced to a successor after our observation. The
    // old-owner-token recovery directory is irrelevant to that successor and
    // disappears when the successor lock generation is released/recovered.
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
  rmSync(quarantinePath, { recursive: true, force: true });
  return true;
}

function releaseOwnedLock(lockPath: string, owner: LockOwner): void {
  const current = readLockOwner(lockPath);
  if (!current || current.pid !== owner.pid || current.token !== owner.token) {
    throw new Error(`File-state lock ownership changed before release: ${lockPath}`);
  }

  // Move the complete generation away from the fixed path in one filesystem
  // operation. This never exposes an empty live-lock directory to contenders.
  const releasedPath = `${lockPath}.released.${owner.token}.${randomUUID()}`;
  renameSync(lockPath, releasedPath);
  rmSync(releasedPath, { recursive: true, force: true });
}

export function withFileLock<T>(filePath: string, run: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const owner: LockOwner = { version: 1, pid: process.pid, token: randomUUID() };
  const candidatePath = prepareCandidate(lockPath, owner);
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  let acquired = false;

  try {
    while (!acquired) {
      try {
        renameSync(candidatePath, lockPath);
        acquired = true;
        break;
      } catch (error: unknown) {
        if (!contentionError(error)) throw error;
      }

      const observed = readLockOwner(lockPath);
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
    if (!acquired) rmSync(candidatePath, { recursive: true, force: true });
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
