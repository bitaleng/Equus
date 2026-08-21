import {
  deleteAppMeta,
  exportArchiveThrough,
  getSettings,
  loadIdbMetaValue,
  previewArchivePurge,
  purgeDataThrough,
  saveIdbMetaValue,
  BACKUP_PREFIX,
} from '@/lib/localDb';
import { isDemoMode } from '@/lib/demoMode';

const DIR_HANDLE_KEY = 'auto_archive_dir_handle';

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

export function clampAutoArchiveKeepMonths(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(24, n));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 오늘 달 포함 keepMonths개월만 남길 때, 백업·삭제할 마지막 날짜(그 달의 말일) */
export function getAutoArchiveThroughDate(keepMonths: number, now = new Date()): string {
  const n = clampAutoArchiveKeepMonths(keepMonths);
  const lastOfDeletedMonth = new Date(now.getFullYear(), now.getMonth() - n + 1, 0);
  return formatYmd(lastOfDeletedMonth);
}

export function getAutoArchiveKeepRange(keepMonths: number, now = new Date()): {
  keepFromYm: string;
  keepToYm: string;
  throughDate: string;
} {
  const n = clampAutoArchiveKeepMonths(keepMonths);
  const keepStart = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  const keepEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    keepFromYm: `${keepStart.getFullYear()}-${pad2(keepStart.getMonth() + 1)}`,
    keepToYm: `${keepEnd.getFullYear()}-${pad2(keepEnd.getMonth() + 1)}`,
    throughDate: getAutoArchiveThroughDate(n, now),
  };
}

export function getArchiveBackupPrefix(): string {
  return BACKUP_PREFIX;
}

export function buildArchiveFilename(fromDate: string | undefined, throughDate: string): string {
  const from = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : throughDate;
  return `${getArchiveBackupPrefix()}-archive-${from}-to-${throughDate}.json`;
}

export function canPickArchiveDirectory(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

export async function pickAutoArchiveDirectory(): Promise<{
  ok: boolean;
  name?: string;
  error?: string;
}> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (typeof picker !== 'function') {
    return {
      ok: false,
      error: '이 브라우저는 폴더 지정을 지원하지 않습니다. Chrome/Edge에서 사용해 주세요.',
    };
  }
  try {
    const handle = await picker({
      id: 'ivansauna-auto-archive',
      mode: 'readwrite',
      startIn: 'documents',
    });
    const perm = await ensureDirectoryPermission(handle);
    if (!perm) {
      return { ok: false, error: '폴더 쓰기 권한이 거부되었습니다.' };
    }
    await saveIdbMetaValue(DIR_HANDLE_KEY, handle);
    return { ok: true, name: handle.name };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, error: 'cancelled' };
    return { ok: false, error: err?.message || '폴더를 지정하지 못했습니다.' };
  }
}

export async function getAutoArchiveDirectoryName(): Promise<string | null> {
  const handle = await loadIdbMetaValue<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
  return handle?.name || null;
}

export async function clearAutoArchiveDirectory(): Promise<void> {
  await deleteAppMeta(DIR_HANDLE_KEY);
}

async function ensureDirectoryPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const withPerm = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  try {
    if (typeof withPerm.queryPermission === 'function') {
      const current = await withPerm.queryPermission({ mode: 'readwrite' });
      if (current === 'granted') return true;
    }
    if (typeof withPerm.requestPermission === 'function') {
      const next = await withPerm.requestPermission({ mode: 'readwrite' });
      return next === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

async function writeJsonToDirectory(
  handle: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export type AutoArchiveResult = {
  status: 'skipped' | 'nothing' | 'needs-folder' | 'needs-permission' | 'purged' | 'error';
  message?: string;
  filename?: string;
  throughDate?: string;
  deleted?: number;
};

export async function runAutoArchiveIfNeeded(options?: {
  force?: boolean;
}): Promise<AutoArchiveResult> {
  if (isDemoMode()) {
    return { status: 'skipped', message: '체험판에서는 자동 백업을 하지 않습니다.' };
  }

  const settings = getSettings() as {
    autoArchiveEnabled?: boolean;
    autoArchiveKeepMonths?: number;
  };
  if (!options?.force && settings.autoArchiveEnabled !== true) {
    return { status: 'skipped' };
  }

  const keepMonths = clampAutoArchiveKeepMonths(settings.autoArchiveKeepMonths);
  const throughDate = getAutoArchiveThroughDate(keepMonths);
  const preview = previewArchivePurge(throughDate);
  if (preview.total <= 0) {
    return { status: 'nothing', throughDate, message: '백업할 이전 데이터가 없습니다.' };
  }

  const handle = await loadIdbMetaValue<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
  if (!handle) {
    return {
      status: 'needs-folder',
      throughDate,
      message: '자동 백업 폴더를 먼저 지정해 주세요.',
    };
  }

  const allowed = await ensureDirectoryPermission(handle);
  if (!allowed) {
    return {
      status: 'needs-permission',
      throughDate,
      message: '자동 백업 폴더 권한이 없습니다. 시스템설정에서 폴더를 다시 지정해 주세요.',
    };
  }

  const exported = exportArchiveThrough(throughDate);
  if (!exported.success || !exported.data) {
    return { status: 'error', throughDate, message: exported.error || '구간 백업에 실패했습니다.' };
  }

  const filename = buildArchiveFilename(exported.archiveFrom, throughDate);
  try {
    await writeJsonToDirectory(handle, filename, exported.data);
  } catch (err: any) {
    return {
      status: 'error',
      throughDate,
      filename,
      message: err?.message || '폴더에 파일을 저장하지 못했습니다.',
    };
  }

  const purged = purgeDataThrough(throughDate);
  if (!purged.success) {
    return {
      status: 'error',
      throughDate,
      filename,
      message:
        purged.error ||
        '파일은 저장되었지만 삭제에 실패했습니다. 백업 파일을 확인한 뒤 다시 시도하세요.',
    };
  }

  return {
    status: 'purged',
    throughDate,
    filename,
    deleted: purged.deleted,
    message: `${filename}에 ${purged.deleted.toLocaleString()}건을 저장한 뒤 앱에서 삭제했습니다. 매출리포트용 일별 집계는 유지됩니다.`,
  };
}
