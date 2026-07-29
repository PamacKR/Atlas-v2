// Launches the compiled MCP server (dist/main/mcpServer.js) via Electron's
// own binary with ELECTRON_RUN_AS_NODE=1 — better-sqlite3's native binding
// is compiled against Electron's bundled Node ABI, so a plain `node
// dist/main/mcpServer.js` fails to load it (confirmed directly while
// building this feature). Setting the env var here, in Node itself, is
// portable across cmd.exe/PowerShell/bash — no shell-specific "VAR=x cmd"
// syntax needed.
const { spawnSync } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const result = spawnSync(electronPath, [path.join(__dirname, '..', 'dist', 'main', 'mcpServer.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(result.status ?? 1);
