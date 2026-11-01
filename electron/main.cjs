// Processo principal do app desktop do BOSS KEY: janela + Steam (AppID 480, Spacewar).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const APP_ID = 480;

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

let steam = null;
let client = null;
try {
  steam = require('steamworks.js');
  client = steam.init(APP_ID);
  steam.electronEnableSteamOverlay(); // precisa rodar antes do app ficar pronto
} catch (e) {
  console.warn('[steam] indisponível:', e && e.message ? e.message : e);
  client = null;
}

let win = null;
let rendererReady = false;
const pendingInvites = [];
const lobbies = new Map(); // id (string) -> Lobby do steamworks.js

function pushInvite(id) {
  const s = String(id);
  if (rendererReady && win && !win.isDestroyed()) win.webContents.send('steam:invite', s);
  else pendingInvites.push(s);
}

function inviteFromArgv(argv) {
  const i = argv.indexOf('+connect_lobby');
  if (i >= 0 && argv[i + 1] && /^\d+$/.test(argv[i + 1])) pushInvite(argv[i + 1]);
}

function sendToRenderer(channel, payload) {
  if (rendererReady && win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'BOSS KEY',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.maximize();
  win.show();
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    while (pendingInvites.length) win.webContents.send('steam:invite', pendingInvites.shift());
  });
  win.on('closed', () => {
    win = null;
    rendererReady = false;
  });

  const devUrl = process.env.BOSSKEY_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function setupSteam() {
  ipcMain.on('steam:info', (e) => {
    if (!client) {
      e.returnValue = { available: false };
      return;
    }
    e.returnValue = {
      available: true,
      id: String(client.localplayer.getSteamId().steamId64),
      name: client.localplayer.getName(),
    };
  });
  if (!client) return;

  const { matchmaking, networking, callback, overlay } = client;
  const SC = steam.SteamCallback;
  const lobbyOf = (id) => lobbies.get(String(id));

  ipcMain.handle('steam:lobby-create', async (_e, max) => {
    const l = await matchmaking.createLobby(matchmaking.LobbyType.FriendsOnly, max);
    lobbies.set(String(l.id), l);
    return String(l.id);
  });
  ipcMain.handle('steam:lobby-join', async (_e, id) => {
    try {
      const l = await matchmaking.joinLobby(BigInt(id));
      lobbies.set(String(l.id), l);
      return { ok: true, id: String(l.id) };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  // Procura o lobby cujo dado `code` bate (entre os que a Steam lista: salas de amigos).
  ipcMain.handle('steam:lobby-find', async (_e, key, code) => {
    try {
      const list = await matchmaking.getLobbies();
      for (const l of list) {
        const d = l.getFullData();
        if (d.game === key && String(d.code).toUpperCase() === String(code).toUpperCase()) return String(l.id);
      }
    } catch {
      /* sem resultado */
    }
    return null;
  });
  ipcMain.on('steam:lobby-leave', (_e, id) => {
    const l = lobbyOf(id);
    if (l) {
      try {
        l.leave();
      } catch {}
      lobbies.delete(String(id));
    }
  });
  ipcMain.on('steam:lobby-members', (e, id) => {
    const l = lobbyOf(id);
    if (!l) {
      e.returnValue = null;
      return;
    }
    e.returnValue = {
      owner: String(l.getOwner().steamId64),
      members: l.getMembers().map((m) => String(m.steamId64)),
      limit: Number(l.getMemberLimit() ?? 0),
    };
  });
  ipcMain.on('steam:lobby-get', (e, id, key) => {
    const l = lobbyOf(id);
    e.returnValue = l ? l.getData(key) : null;
  });
  ipcMain.on('steam:lobby-set', (e, id, key, value) => {
    const l = lobbyOf(id);
    e.returnValue = l ? l.setData(key, value) : false;
  });
  ipcMain.on('steam:lobby-joinable', (_e, id, open) => {
    const l = lobbyOf(id);
    if (l) l.setJoinable(!!open);
  });
  ipcMain.on('steam:lobby-invite', (_e, id) => {
    try {
      overlay.activateInviteDialog(BigInt(id));
    } catch {}
  });

  // ---- P2P ----
  ipcMain.on('steam:send', (_e, to, data, reliable) => {
    const buf = Buffer.from(String(data), 'utf8');
    // pacotes não confiáveis da Steam são limitados a ~1200 bytes
    const type = reliable || buf.length > 1100 ? networking.SendType.Reliable : networking.SendType.UnreliableNoDelay;
    try {
      networking.sendP2PPacket(BigInt(to), type, buf);
    } catch {}
  });

  callback.register(SC.P2PSessionRequest, (r) => {
    try {
      networking.acceptP2PSession(r.remote);
    } catch {}
  });
  callback.register(SC.P2PSessionConnectFail, (r) => sendToRenderer('steam:peer-fail', String(r.remote)));
  callback.register(SC.LobbyChatUpdate, (r) => sendToRenderer('steam:members', String(r.lobby)));
  callback.register(SC.LobbyDataUpdate, (r) => sendToRenderer('steam:members', String(r.lobby)));
  callback.register(SC.GameLobbyJoinRequested, (r) => pushInvite(r.lobby_steam_id));

  // Esvazia a fila P2P e entrega ao renderer em lote (o preload guarda até o poll()).
  setInterval(() => {
    if (!rendererReady || !win || win.isDestroyed()) return;
    const batch = [];
    let size;
    while ((size = networking.isP2PPacketAvailable()) > 0 && batch.length < 512) {
      const p = networking.readP2PPacket(size);
      batch.push([String(p.steamId.steamId64), p.data.toString('utf8')]);
    }
    if (batch.length) win.webContents.send('steam:p2p', batch);
  }, 1000 / 60);
}

app.whenReady().then(() => {
  setupSteam();
  inviteFromArgv(process.argv);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
