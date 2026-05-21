import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// Paths relative to server directory (config-gui/server/)
// server/ -> config-gui/ -> apps/ -> phases/ -> bindings_poc/
const BINDINGS_DIR = path.resolve(__dirname, '../../../..');
const PHASES_DIR = path.resolve(BINDINGS_DIR, 'phases');
const SCHEMAS_DIR = path.resolve(BINDINGS_DIR, 'schemas_v2');
const DEFAULTS_FILE = path.resolve(PHASES_DIR, 'rules/default_makefile_metadata.json');

// Temp files for current session
let currentConfigPath: string | null = null;
let currentContext: { device: string; platform: string; target: string } | null = null;

// GET /api/devices - List available devices
app.get('/api/devices', async (_req, res) => {
  try {
    const devicesDir = path.join(SCHEMAS_DIR, 'devices');
    const files = fs.readdirSync(devicesDir);
    const devices = files
      .filter(f => f.startsWith('adi,') && f.endsWith('.yaml'))
      .map(f => f.replace('.yaml', ''));
    res.json({ devices });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/platforms - List available platforms
app.get('/api/platforms', async (_req, res) => {
  try {
    const platformsDir = path.join(SCHEMAS_DIR, 'platforms');
    const platforms = fs.readdirSync(platformsDir)
      .filter(f => fs.statSync(path.join(platformsDir, f)).isDirectory());
    res.json({ platforms });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/generate-config - Generate configuration from device + platform
app.post('/api/generate-config', async (req, res) => {
  try {
    const { device, platform, target } = req.body;

    if (!device || !platform) {
      return res.status(400).json({ error: 'Missing device or platform' });
    }

    // Create temp directory for this session
    const tempDir = fs.mkdtempSync('/tmp/config-gui-');
    const contextPath = path.join(tempDir, 'context.json');
    const loadRulesPath = path.join(tempDir, 'load_rules.json');
    const configPath = path.join(tempDir, 'configuration.json');

    // Write context.json
    const context = {
      platform: {
        target: platform,
        vendor: platform,
        prefix: platform
      },
      devices: [{ name: device }],
      extra_init: ['uart']
    };
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));

    // Step 1: context2rules
    const context2rulesDir = path.join(PHASES_DIR, 'apps/context2rules');
    const context2rulesCmd = `cd "${context2rulesDir}" && npx ts-node context2rules.ts --schemas "${SCHEMAS_DIR}" --context "${contextPath}" --output "${loadRulesPath}"`;
    await execAsync(context2rulesCmd);

    // Step 2: rules2configuration
    const rules2configDir = path.join(PHASES_DIR, 'apps/rules2configuration');
    const rules2configCmd = `cd "${rules2configDir}" && npx ts-node rules2configuration.ts --schemas "${SCHEMAS_DIR}" --rules "${loadRulesPath}" --context "${contextPath}" --defaults "${DEFAULTS_FILE}" --level 2 --output "${configPath}"`;
    await execAsync(rules2configCmd);

    // Read generated configuration
    const configuration = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Save state for later operations
    currentConfigPath = configPath;
    currentContext = { device, platform, target: target || platform };

    res.json({ configuration, configPath });
  } catch (error) {
    console.error('Error generating config:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/update-config - Save configuration changes
app.post('/api/update-config', async (req, res) => {
  try {
    const { configuration } = req.body;

    if (!currentConfigPath) {
      return res.status(400).json({ error: 'No configuration loaded. Generate configuration first.' });
    }

    // Write configuration to file
    fs.writeFileSync(currentConfigPath, JSON.stringify(configuration, null, 2));

    res.json({ success: true, path: currentConfigPath });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/generate-makefile - Generate src.mk from configuration
app.post('/api/generate-makefile', async (_req, res) => {
  try {
    if (!currentConfigPath) {
      return res.status(400).json({ error: 'No configuration loaded. Generate configuration first.' });
    }

    // Get the temp directory from currentConfigPath
    const tempDir = path.dirname(currentConfigPath);
    const makefilePath = path.join(tempDir, 'src.mk');

    // Run metadata2makefile
    const metadata2makefileDir = path.join(PHASES_DIR, 'apps/metadata2makefile');
    const metadata2makefileCmd = `cd "${metadata2makefileDir}" && npx ts-node metadata2makefile.ts --configuration "${currentConfigPath}" --output "${makefilePath}"`;
    await execAsync(metadata2makefileCmd);

    // Read the generated makefile
    const makefile = fs.readFileSync(makefilePath, 'utf-8');

    res.json({ makefile, makefilePath });
  } catch (error) {
    console.error('Error generating makefile:', error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/current-config - Get current configuration
app.get('/api/current-config', async (_req, res) => {
  try {
    if (!currentConfigPath || !fs.existsSync(currentConfigPath)) {
      return res.status(404).json({ error: 'No configuration loaded' });
    }

    const configuration = JSON.parse(fs.readFileSync(currentConfigPath, 'utf-8'));
    res.json({ configuration, context: currentContext });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Config GUI server running on http://localhost:${PORT}`);
  console.log(`Schemas directory: ${SCHEMAS_DIR}`);
  console.log(`Phases directory: ${PHASES_DIR}`);
});
