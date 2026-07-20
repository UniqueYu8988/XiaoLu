const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xiaoluHome", {
  getState: () => ipcRenderer.invoke("xiaolu:get-state"),
  toggleStudy: () => ipcRenderer.invoke("xiaolu:toggle-study"),
  checkIn: (slot) => ipcRenderer.invoke("xiaolu:check-in", slot),
  submitReport: (report) => ipcRenderer.invoke("xiaolu:submit-report", report),
  addTask: (title) => ipcRenderer.invoke("xiaolu:add-task", title),
  setBounty: (slot, title) => ipcRenderer.invoke("xiaolu:set-bounty", slot, title),
  editTask: (id, title) => ipcRenderer.invoke("xiaolu:edit-task", id, title),
  setTaskCompleted: (id, completed) => ipcRenderer.invoke("xiaolu:set-task-completed", id, completed),
  setTaskRecurring: (id, recurring) => ipcRenderer.invoke("xiaolu:set-task-recurring", id, recurring),
  deleteTask: (id) => ipcRenderer.invoke("xiaolu:delete-task", id),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("xiaolu:set-launch-at-login", enabled),
  hide: () => ipcRenderer.send("xiaolu:hide-panel"),
  onState: (callback) => ipcRenderer.on("xiaolu:state", (_event, state) => callback(state)),
  onAction: (callback) => ipcRenderer.on("xiaolu:play-action", (_event, action) => callback(action)),
  onView: (callback) => ipcRenderer.on("xiaolu:view", (_event, view) => callback(view)),
});
