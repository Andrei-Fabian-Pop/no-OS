import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateCommonDataC,
  generateCommonDataH,
  generateMainC,
  generateUserAppC,
  generateUserAppH,
  generateMakefile,
} from './codegen';

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// POST /api/generate-project - Generate full project with C source files
app.post('/api/generate-project', async (req, res) => {
  try {
    const { projectPath, projectName, configuration } = req.body;

    // Debug: log received configuration
    console.log('generate-project received config:',
      configuration?.configuration?.['adi,ad7124']?.power_mode ||
      configuration?.configuration?.['adi,adxl355']?.range ||
      'no power_mode/range field found');

    if (!currentContext) {
      return res.status(400).json({ error: 'No configuration loaded. Generate configuration first.' });
    }

    if (!projectPath || !projectName) {
      return res.status(400).json({ error: 'Missing projectPath or projectName' });
    }

    if (!configuration) {
      return res.status(400).json({ error: 'Missing configuration' });
    }

    const { device, platform, target } = currentContext;

    // Full project path
    const fullPath = path.join(projectPath, projectName);

    // Create directory structure
    fs.mkdirSync(path.join(fullPath, 'src/common'), { recursive: true });

    // Generate and write common_data.c
    const commonDataC = generateCommonDataC(configuration, device, platform);
    fs.writeFileSync(path.join(fullPath, 'src/common/common_data.c'), commonDataC);

    // Generate and write common_data.h
    const commonDataH = generateCommonDataH(configuration, device, platform);
    fs.writeFileSync(path.join(fullPath, 'src/common/common_data.h'), commonDataH);

    // Generate and write main.c
    const mainC = generateMainC(configuration, device, platform);
    fs.writeFileSync(path.join(fullPath, 'src/main.c'), mainC);

    // Generate user_app.c/h only if they don't exist
    const userAppCPath = path.join(fullPath, 'src/user_app.c');
    const userAppHPath = path.join(fullPath, 'src/user_app.h');
    if (!fs.existsSync(userAppCPath)) {
      const userAppC = generateUserAppC(device);
      fs.writeFileSync(userAppCPath, userAppC);
    }
    if (!fs.existsSync(userAppHPath)) {
      const userAppH = generateUserAppH(device);
      fs.writeFileSync(userAppHPath, userAppH);
    }

    // Generate Makefile
    const makefile = generateMakefile(platform, target, projectName);
    fs.writeFileSync(path.join(fullPath, 'Makefile'), makefile);

    // Save configuration.json in the project directory
    const projectConfigPath = path.join(fullPath, 'configuration.json');
    fs.writeFileSync(projectConfigPath, JSON.stringify(configuration, null, 2));

    // Generate src.mk using the saved configuration
    const srcMkPath = path.join(fullPath, 'src.mk');
    const metadata2makefileDir = path.join(PHASES_DIR, 'apps/metadata2makefile');
    const metadata2makefileCmd = `cd "${metadata2makefileDir}" && npx ts-node metadata2makefile.ts --configuration "${projectConfigPath}" --output "${srcMkPath}"`;
    await execAsync(metadata2makefileCmd);

    // Copy context.json for regeneration
    if (currentConfigPath) {
      const tempDir = path.dirname(currentConfigPath);
      const contextPath = path.join(tempDir, 'context.json');
      if (fs.existsSync(contextPath)) {
        fs.copyFileSync(contextPath, path.join(fullPath, 'context.json'));
      }
    }

    res.json({
      success: true,
      path: fullPath,
      files: [
        'Makefile',
        'src.mk',
        'configuration.json',
        'context.json',
        'src/main.c',
        'src/user_app.c',
        'src/user_app.h',
        'src/common/common_data.c',
        'src/common/common_data.h',
      ],
    });
  } catch (error) {
    console.error('Error generating project:', error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/build-and-flash - Run make clean, make, make run
app.post('/api/build-and-flash', async (req, res) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({ error: 'Missing projectPath' });
    }

    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({ error: `Project directory not found: ${projectPath}` });
    }

    console.log(`Building and flashing project at: ${projectPath}`);

    // Run make clean, make, make run in sequence
    const result = await new Promise<{ success: boolean; output: string; stage: string }>((resolve) => {
      exec(`cd "${projectPath}" && echo "=== CLEANING ===" && make clean 2>&1 && echo "\\n=== BUILDING ===" && make 2>&1 && echo "\\n=== FLASHING ===" && make run 2>&1`, {
        timeout: 300000, // 5 minute timeout for full build
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }, (error, stdout) => {
        if (error) {
          // Determine which stage failed
          let stage = 'unknown';
          if (!stdout.includes('=== BUILDING ===')) {
            stage = 'clean';
          } else if (!stdout.includes('=== FLASHING ===')) {
            stage = 'build';
          } else {
            stage = 'flash';
          }
          resolve({
            success: false,
            output: stdout || error.message,
            stage,
          });
        } else {
          resolve({
            success: true,
            output: stdout,
            stage: 'complete',
          });
        }
      });
    });

    // Truncate output if too large (keep last 50KB)
    const maxOutputSize = 50 * 1024;
    let output = result.output;
    if (output.length > maxOutputSize) {
      output = '... (truncated)\n' + output.slice(-maxOutputSize);
    }

    if (result.success) {
      res.json({
        success: true,
        output,
      });
    } else {
      res.status(500).json({
        error: `Failed at ${result.stage} stage`,
        output,
      });
    }
  } catch (error: unknown) {
    console.error('Error building/flashing project:', error);
    res.status(500).json({
      error: String(error),
      output: '',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Config GUI server running on http://localhost:${PORT}`);
  console.log(`Schemas directory: ${SCHEMAS_DIR}`);
  console.log(`Phases directory: ${PHASES_DIR}`);
});
