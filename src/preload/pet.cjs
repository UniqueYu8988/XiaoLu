const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xiaoluPet", {
  getState: () => ipcRenderer.invoke("xiaolu:get-state"),
  toggleStudy: () => ipcRenderer.invoke("xiaolu:toggle-study"),
  checkIn: (slot) => ipcRenderer.invoke("xiaolu:check-in", slot),
  openPanel: (view) => ipcRenderer.send("xiaolu:open-panel", view),
  dragStart: (point) => ipcRenderer.send("xiaolu:drag-start", point),
  dragEnd: () => ipcRenderer.send("xiaolu:drag-end"),
  onCursor: (callback) => ipcRenderer.on("xiaolu:cursor", (_event, point) => callback(point)),
  onAction: (callback) => ipcRenderer.on("xiaolu:play-action", (_event, action) => callback(action)),
  onState: (callback) => ipcRenderer.on("xiaolu:state", (_event, state) => callback(state)),
  onPrompt: (callback) => ipcRenderer.on("xiaolu:prompt", (_event, prompt) => callback(prompt)),
  onClearPrompt: (callback) => ipcRenderer.on("xiaolu:clear-prompt", () => callback()),
  onDragDirection: (callback) => ipcRenderer.on("xiaolu:drag-direction", (_event, direction) => callback(direction)),
});
