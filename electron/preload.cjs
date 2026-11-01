// Ponte mínima entre o renderer e o steamworks.js (que roda no processo principal).
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('steam:info');
if (info && info.available) {
  const inbox = []; // [from, data]
  const invites = [];
  const handlers = { members: [], invite: [], 'peer-fail': [] };

  ipcRenderer.on('steam:p2p', (_e, batch) => {
    for (const p of batch) inbox.push(p);
    if (inbox.length > 4096) inbox.splice(0, inbox.length - 4096);
  });
  ipcRenderer.on('steam:members', (_e, id) => handlers.members.forEach((cb) => cb(id)));
  ipcRenderer.on('steam:peer-fail', (_e, id) => handlers['peer-fail'].forEach((cb) => cb(id)));
  ipcRenderer.on('steam:invite', (_e, id) => {
    if (handlers.invite.length) handlers.invite.forEach((cb) => cb(id));
    else invites.push(id);
  });

  contextBridge.exposeInMainWorld('steam', {
    available: true,
    selfId: info.id,
    name: info.name,
    createLobby: (max) => ipcRenderer.invoke('steam:lobby-create', max),
    joinLobby: (id) => ipcRenderer.invoke('steam:lobby-join', id),
    findLobby: (key, code) => ipcRenderer.invoke('steam:lobby-find', key, code),
    leaveLobby: (id) => ipcRenderer.send('steam:lobby-leave', id),
    members: (id) => ipcRenderer.sendSync('steam:lobby-members', id),
    getData: (id, key) => ipcRenderer.sendSync('steam:lobby-get', id, key),
    setData: (id, key, value) => ipcRenderer.sendSync('steam:lobby-set', id, key, value),
    setJoinable: (id, open) => ipcRenderer.send('steam:lobby-joinable', id, open),
    openInvite: (id) => ipcRenderer.send('steam:lobby-invite', id),
    send: (to, data, reliable) => ipcRenderer.send('steam:send', to, data, reliable),
    poll: () => inbox.splice(0, inbox.length),
    on: (event, cb) => {
      if (!handlers[event]) return;
      handlers[event].push(cb);
      if (event === 'invite') while (invites.length) cb(invites.shift());
    },
  });
}
