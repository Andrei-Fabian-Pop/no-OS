import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Configuration, DEVICES, PLATFORMS, DeviceInfo, PlatformInfo } from './types/configuration';
import { ConfigForm } from './components/ConfigForm';

// Simple debounce helper
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
  },
  header: {
    background: '#0066cc',
    color: 'white',
    padding: '20px',
    marginBottom: '20px',
    borderRadius: '8px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
  },
  subtitle: {
    margin: '5px 0 0 0',
    opacity: 0.8,
    fontSize: '14px',
  },
  selectors: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
  },
  selectorGroup: {
    flex: 1,
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold' as const,
  },
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: 'white',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '10px',
    marginTop: '10px',
  },
  primaryButton: {
    background: '#0066cc',
    color: 'white',
  },
  secondaryButton: {
    background: '#666',
    color: 'white',
  },
  successButton: {
    background: '#28a745',
    color: 'white',
  },
  disabledButton: {
    background: '#ccc',
    color: '#666',
    cursor: 'not-allowed',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  status: {
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  statusSuccess: {
    background: '#d4edda',
    color: '#155724',
  },
  statusError: {
    background: '#f8d7da',
    color: '#721c24',
  },
  statusInfo: {
    background: '#d1ecf1',
    color: '#0c5460',
  },
  output: {
    background: '#1e1e1e',
    color: '#d4d4d4',
    padding: '15px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '300px',
    overflow: 'auto',
  },
};

function App() {
  const [device, setDevice] = useState<DeviceInfo>(DEVICES[0]);
  const [platform, setPlatform] = useState<PlatformInfo>(PLATFORMS[0]);
  const [config, setConfig] = useState<Configuration | null>(null);
  const configRef = useRef<Configuration | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [output, setOutput] = useState<string>('');
  const [projectPath, setProjectPath] = useState<string>('/home/andrei-fabian/adi/no-OS/projects/bindings_poc');
  const [projectName, setProjectName] = useState<string>('');

  const generateConfig = useCallback(async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Generating configuration...' });
    try {
      const response = await fetch('/api/generate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: device.id,
          platform: platform.id,
          target: platform.target,
        }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setConfig(data.configuration);
      configRef.current = data.configuration;  // Also update ref
      setConfigPath(data.configPath);
      setStatus({ type: 'success', message: `Configuration generated! Saved to: ${data.configPath}` });
      setOutput('');
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, [device, platform]);

  const generateProject = useCallback(async () => {
    if (!projectName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a project name' });
      return;
    }
    // Use ref to get the latest config (avoids React async state timing issues)
    const currentConfig = configRef.current;
    if (!currentConfig) {
      setStatus({ type: 'error', message: 'No configuration loaded' });
      return;
    }

    // Debug: log the config being sent
    console.log('generateProject - config to send:', JSON.stringify(currentConfig, null, 2).slice(0, 2000));

    setLoading(true);
    setStatus({ type: 'info', message: 'Saving configuration and generating project...' });
    try {
      // Send current config state with the request - it will be saved in the project
      const response = await fetch('/api/generate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          projectName: projectName.trim(),
          configuration: currentConfig  // Include current config state from ref
        }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setStatus({ type: 'success', message: `Project generated at: ${data.path}` });
      setOutput(`Generated files:\n${data.files.map((f: string) => `  - ${f}`).join('\n')}`);
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, [projectPath, projectName]);

  const [buildStage, setBuildStage] = useState<string>('');

  const buildAndFlash = useCallback(async () => {
    if (!projectName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a project name' });
      return;
    }
    const fullPath = `${projectPath}/${projectName.trim()}`;
    setLoading(true);
    setBuildStage('clean');
    setStatus({ type: 'info', message: 'Cleaning...' });
    setOutput('');

    // Simulate stage updates (since we can't get real-time feedback easily)
    const stageTimer = setInterval(() => {
      setBuildStage(prev => {
        if (prev === 'clean') {
          setStatus({ type: 'info', message: 'Building...' });
          return 'build';
        } else if (prev === 'build') {
          setStatus({ type: 'info', message: 'Flashing...' });
          return 'flash';
        }
        return prev;
      });
    }, 3000);

    try {
      const response = await fetch('/api/build-and-flash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: fullPath }),
      });
      clearInterval(stageTimer);

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // Response wasn't JSON - show raw text
        setOutput(text || 'No response from server');
        setBuildStage('error');
        setStatus({ type: 'error', message: 'Server returned invalid response' });
        return;
      }

      if (data.output) {
        setOutput(data.output);
      }
      if (!response.ok || data.error) {
        setBuildStage('error');
        setStatus({ type: 'error', message: data.error || 'Build failed' });
      } else {
        setBuildStage('done');
        setStatus({ type: 'success', message: 'Build & Flash complete!' });
      }
    } catch (err) {
      clearInterval(stageTimer);
      setBuildStage('error');
      setStatus({ type: 'error', message: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, [projectPath, projectName]);

  // Debounced function to call /api/edit-config
  const debouncedEditConfig = useMemo(
    () =>
      debounce(async (path: string, configuration: Configuration) => {
        try {
          const response = await fetch('/api/edit-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configPath: path, configuration }),
          });
          const data = await response.json();
          if (data.configuration) {
            // Update with evaluated config (contains $activeOptions, $activeValues, etc.)
            setConfig(data.configuration);
            configRef.current = data.configuration;
          }
        } catch (err) {
          console.error('Error calling /api/edit-config:', err);
        }
      }, 300),
    []
  );

  const handleConfigChange = useCallback((newConfig: Configuration) => {
    // Update immediately for responsive UI
    configRef.current = newConfig;
    setConfig(newConfig);

    // Debounced call to server to evaluate overrides
    if (configPath) {
      debouncedEditConfig(configPath, newConfig);
    }
  }, [configPath, debouncedEditConfig]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>no-OS Configuration Tool</h1>
        <p style={styles.subtitle}>Configure device bindings and generate makefiles</p>
      </header>

      <div style={styles.selectors}>
        <div style={styles.selectorGroup}>
          <label style={styles.label}>Device</label>
          <select
            style={styles.select}
            value={device.id}
            onChange={(e) => {
              const d = DEVICES.find(d => d.id === e.target.value);
              if (d) setDevice(d);
              setConfig(null);
              setConfigPath(null);
              setOutput('');
            }}
          >
            {DEVICES.map(d => (
              <option key={d.id} value={d.id}>{d.name} - {d.description}</option>
            ))}
          </select>
        </div>
        <div style={styles.selectorGroup}>
          <label style={styles.label}>Platform</label>
          <select
            style={styles.select}
            value={platform.id}
            onChange={(e) => {
              const p = PLATFORMS.find(p => p.id === e.target.value);
              if (p) setPlatform(p);
              setConfig(null);
              setConfigPath(null);
              setOutput('');
            }}
          >
            {PLATFORMS.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.target})</option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.actions}>
        <button
          style={{ ...styles.button, ...styles.primaryButton, ...(loading ? styles.disabledButton : {}) }}
          onClick={generateConfig}
          disabled={loading}
        >
          Generate Configuration
        </button>
      </div>

      {config && (
        <div style={{
          background: '#f8f9fa',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>Generate Project</h3>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>Project Path</label>
              <input
                type="text"
                style={{ ...styles.select, padding: '8px' }}
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/projects"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Project Name</label>
              <input
                type="text"
                style={{ ...styles.select, padding: '8px' }}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={`${device.id.replace('adi,', '')}-${platform.id}-demo`}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
            <button
              style={{ ...styles.button, background: '#17a2b8', color: 'white', ...(loading || !config ? styles.disabledButton : {}) }}
              onClick={generateProject}
              disabled={loading || !config}
            >
              Save &amp; Generate Project
            </button>
            <button
              style={{ ...styles.button, background: '#fd7e14', color: 'white', ...(loading || !projectName.trim() ? styles.disabledButton : {}) }}
              onClick={buildAndFlash}
              disabled={loading || !projectName.trim()}
            >
              {loading && buildStage ? (
                buildStage === 'clean' ? '🧹 Cleaning...' :
                buildStage === 'build' ? '🔨 Building...' :
                buildStage === 'flash' ? '⚡ Flashing...' :
                'Build & Flash'
              ) : 'Build & Flash'}
            </button>
          </div>
        </div>
      )}

      {status && (
        <div style={{
          ...styles.status,
          ...(status.type === 'success' ? styles.statusSuccess :
              status.type === 'error' ? styles.statusError :
              styles.statusInfo)
        }}>
          {status.message}
        </div>
      )}

      {configPath && (
        <div style={{
          background: '#f8f9fa',
          padding: '10px 15px',
          borderRadius: '4px',
          marginBottom: '20px',
          fontSize: '13px',
          fontFamily: 'monospace',
          border: '1px solid #dee2e6'
        }}>
          <strong>Working directory:</strong> {configPath.replace('/configuration.json', '')}
        </div>
      )}

      {config && (
        <ConfigForm
          config={config}
          onChange={handleConfigChange}
        />
      )}

      {output && (
        <div>
          <h3>Generated src.mk</h3>
          <pre style={styles.output}>{output}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
