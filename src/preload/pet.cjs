const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xiaoluPet", {
  getState: () => ipcRenderer.invoke("xiaolu:get-state"),
  toggleStudy: () => ipcRenderer.invoke("xiaolu:toggle-study"),
  petDoubleClick: () => ipcRenderer.invoke("xiaolu:pet-double-click"),
  respondPrompt: (id, action) => ipcRenderer.invoke("xiaolu:prompt-action", id, action),
  checkIn: (slot) => ipcRenderer.invoke("xiaolu:check-in", slot),
  openPanel: (view) => ipcRenderer.send("xiaolu:open-panel", view),
  dragStart: (point) => ipcRenderer.send("xiaolu:drag-start", point),
  dragEnd: () => ipcRenderer.send("xiaolu:drag-end"),
  setBubbleBounds: (bounds) => ipcRenderer.send("xiaolu:bubble-bounds", bounds),
  onCursor: (callback) => ipcRenderer.on("xiaolu:cursor", (_event, point) => callback(point)),
  onAction: (callback) => ipcRenderer.on("xiaolu:play-action", (_event, action) => callback(action)),
  onVoice: (callback) => ipcRenderer.on("xiaolu:play-voice", (_event, voice) => callback(voice)),
  onState: (callback) => ipcRenderer.on("xiaolu:state", (_event, state) => callback(state)),
  onPrompt: (callback) => ipcRenderer.on("xiaolu:prompt", (_event, prompt) => callback(prompt)),
  onClearPrompt: (callback) => ipcRenderer.on("xiaolu:clear-prompt", () => callback()),
  onStatusBubble: (callback) => ipcRenderer.on("xiaolu:status-bubble", (_event, message) => callback(message)),
  onClearStatusBubble: (callback) => ipcRenderer.on("xiaolu:clear-status-bubble", () => callback()),
  onDragDirection: (callback) => ipcRenderer.on("xiaolu:drag-direction", (_event, direction) => callback(direction)),
});
