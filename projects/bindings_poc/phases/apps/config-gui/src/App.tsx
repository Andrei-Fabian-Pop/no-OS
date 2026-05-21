import { useState, useCallback } from 'react';
import { Configuration, DEVICES, PLATFORMS, DeviceInfo, PlatformInfo } from './types/configuration';
import { ConfigForm } from './components/ConfigForm';

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
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [output, setOutput] = useState<string>('');

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
      setConfigPath(data.configPath);
      setStatus({ type: 'success', message: `Configuration generated! Saved to: ${data.configPath}` });
      setOutput('');
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, [device, platform]);

  const updateConfig = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setStatus({ type: 'info', message: 'Saving configuration...' });
    try {
      const response = await fetch('/api/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: config }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setStatus({ type: 'success', message: `Configuration saved to: ${data.path}` });
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, [config]);

  const generateMakefile = useCallback(async () => {
    setLoading(true);
    setStatus({ type: 'info', message: 'Generating makefile...' });
    try {
      const response = await fetch('/api/generate-makefile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setOutput(data.makefile);
      setStatus({ type: 'success', message: `Makefile generated! Saved to: ${data.makefilePath}` });
    } catch (err) {
      setStatus({ type: 'error', message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfigChange = useCallback((newConfig: Configuration) => {
    setConfig(newConfig);
  }, []);

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
        <button
          style={{ ...styles.button, ...styles.secondaryButton, ...(loading || !config ? styles.disabledButton : {}) }}
          onClick={updateConfig}
          disabled={loading || !config}
        >
          Save Configuration
        </button>
        <button
          style={{ ...styles.button, ...styles.successButton, ...(loading || !config ? styles.disabledButton : {}) }}
          onClick={generateMakefile}
          disabled={loading || !config}
        >
          Generate Makefile
        </button>
      </div>

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
