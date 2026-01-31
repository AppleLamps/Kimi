import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import { electronConfig } from './config';
import { logger } from './logger';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const getSessionsFilePath = () => {
  return path.join(app.getPath('userData'), 'sessions.json');
};

const readSessions = async (): Promise<unknown[]> => {
  try {
    const content = await fs.readFile(getSessionsFilePath(), 'utf-8');
    return JSON.parse(content) as unknown[];
  } catch {
    return [];
  }
};

const writeSessions = async (sessions: unknown[]): Promise<void> => {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getSessionsFilePath(), JSON.stringify(sessions, null, 2), 'utf-8');
};

function startBackend(): void {
  const backendPath = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath, 'backend');

  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: backendPath,
    shell: true,
    env: { ...process.env },
  });

  backendProcess.stdout?.on('data', (data) => {
    logger.info('backend_stdout', { message: String(data) });
  });

  backendProcess.stderr?.on('data', (data) => {
    logger.error('backend_stderr', { message: String(data) });
  });

  backendProcess.on('close', (code) => {
    logger.info('backend_exit', { code });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: electronConfig.window.width,
    height: electronConfig.window.height,
    minWidth: electronConfig.window.minWidth,
    minHeight: electronConfig.window.minHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: electronConfig.window.backgroundColor,
    titleBarStyle: electronConfig.window.titleBarStyle,
    frame: process.platform !== 'darwin',
  });

  if (isDev) {
    mainWindow.loadURL(electronConfig.devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Workspace Directory',
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('get-home-directory', () => {
  return app.getPath('home');
});

ipcMain.handle('sessions:list', async () => {
  return readSessions();
});

ipcMain.handle('sessions:upsert', async (_event, record: { id?: string }) => {
  if (!record?.id) return;
  const sessions = await readSessions();
  const index = sessions.findIndex((item) => (item as { id?: string }).id === record.id);
  if (index >= 0) {
    sessions[index] = record;
  } else {
    sessions.unshift(record);
  }
  await writeSessions(sessions);
});

ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
  const sessions = await readSessions();
  const next = sessions.filter((item) => (item as { id?: string }).id !== sessionId);
  await writeSessions(next);
});

ipcMain.handle('sessions:export', async (_event, record: unknown) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Session',
    defaultPath: 'kimi-session.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, JSON.stringify(record, null, 2), 'utf-8');
  return result.filePath;
});

ipcMain.handle('sessions:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Session',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  const parsed = JSON.parse(content);
  return parsed;
});

// App lifecycle
app.whenReady().then(() => {
  if (!isDev) {
    startBackend();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
