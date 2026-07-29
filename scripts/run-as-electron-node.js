// Generic wrapper: runs the given script via Electron's own binary under
// ELECTRON_RUN_AS_NODE=1, matching the Node ABI better-sqlite3's native
// binding was actually compiled against — plain `node <script>` fails to
// load it (confirmed directly while building this feature; see
// run-mcp-server.js for the same reasoning). Used by verify-mcp.js, which
// needs better-sqlite3 itself to seed test data, on top of driving the MCP
// server (a separate child process) as a client.
const { spawnSync } = require('child_process');
const electronPath = require('electron');

const [, , scriptPath, ...rest] = process.argv;
const result = spawnSync(electronPath, [scriptPath, ...rest], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(result.status ?? 1);
