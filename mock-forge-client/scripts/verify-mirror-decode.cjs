const { app, BrowserWindow } = require('electron');
const { join } = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  await win.loadFile(join(__dirname, '..', 'tests', 'fixtures', 'mirror-decode-runner.html'));
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const result = await win.webContents.executeJavaScript('window.result');
  console.log(JSON.stringify(result, null, 2));
  app.exit(result?.pass ? 0 : 1);
});
