const { contextBridge } = require("electron");
const fs = require("fs");
const path = require("path");

contextBridge.exposeInMainWorld("electronAPI", {
  readFile: (relativePath) => {
    const fullPath = path.join(__dirname, relativePath);
    return fs.readFileSync(fullPath, "utf-8");
  },
  isElectron: true,
});
