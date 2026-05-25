import { Configuration, ConfigField, DeviceConfig } from '../types/configuration';
import { FieldRenderer } from './FieldRenderer';

interface ConfigFormProps {
  config: Configuration;
  onChange: (config: Configuration) => void;
}

const styles = {
  form: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  deviceSection: {
    marginBottom: '20px',
  },
  deviceTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    marginBottom: '15px',
    paddingBottom: '10px',
    borderBottom: '2px solid #0066cc',
  },
};

// Check if a field or any of its children have a value set
function hasAnyValue(field: ConfigField): boolean {
  if (field.value !== null && field.value !== undefined) {
    return true;
  }
  for (const [key, val] of Object.entries(field)) {
    if (key.startsWith('$') || key === 'value') continue;
    if (typeof val === 'object' && val !== null) {
      if (hasAnyValue(val as ConfigField)) {
        return true;
      }
    }
  }
  return false;
}

// Get mutex constraints for a field from device-level $override
function getMutexDisabledReason(
  deviceConfig: DeviceConfig,
  fieldName: string
): string | null {
  const override = deviceConfig.$override as Array<{
    $mutex?: string[];
    $if?: Record<string, { value: unknown }>;
    $then?: Record<string, { disabled?: boolean }>;
  }> | undefined;

  if (!override) return null;

  for (const rule of override) {
    // Check $mutex rules
    if (rule.$mutex && rule.$mutex.includes(fieldName)) {
      for (const otherKey of rule.$mutex) {
        if (otherKey !== fieldName) {
          const otherField = deviceConfig[otherKey] as ConfigField | undefined;
          if (otherField && hasAnyValue(otherField)) {
            return `mutex with ${otherKey}`;
          }
        }
      }
    }

    // Check $if/$then rules
    if (rule.$if && rule.$then) {
      for (const [conditionField, condition] of Object.entries(rule.$if)) {
        const condField = deviceConfig[conditionField] as ConfigField | undefined;
        if (!condField) continue;

        // Check if condition is met
        let conditionMet = false;
        if (condition.value === '$any') {
          conditionMet = hasAnyValue(condField);
        } else {
          conditionMet = condField.value === condition.value;
        }

        if (conditionMet) {
          // Check if this field should be disabled
          const thenRule = rule.$then[fieldName];
          if (thenRule?.disabled === true) {
            return `${conditionField} is configured`;
          }
        }
      }
    }
  }

  return null;
}

export function ConfigForm({ config, onChange }: ConfigFormProps) {
  const updateValue = (deviceId: string, path: string[], value: unknown) => {
    console.log('updateValue called:', { deviceId, path, value });
    const newConfig = JSON.parse(JSON.stringify(config)) as Configuration;
    let current: Record<string, unknown> = newConfig.configuration[deviceId] as Record<string, unknown>;

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      console.log(`  traversing path[${i}] = "${key}", current keys:`, Object.keys(current));
      if (current[key] === undefined) {
        console.error(`  ERROR: key "${key}" not found!`);
        return;
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = path[path.length - 1];
    console.log(`  lastKey = "${lastKey}", current[lastKey]:`, current[lastKey]);
    if (current[lastKey] && typeof current[lastKey] === 'object') {
      (current[lastKey] as Record<string, unknown>).value = value;
      console.log('  value set successfully');
    } else {
      console.error('  ERROR: target field not found or not an object');
    }

    onChange(newConfig);
  };

  const getValueAtPath = (deviceId: string, path: string[]): unknown => {
    let current: Record<string, unknown> = config.configuration[deviceId] as Record<string, unknown>;
    for (const key of path) {
      if (!current) return null;
      current = current[key] as Record<string, unknown>;
    }
    return (current as ConfigField)?.value ?? null;
  };

  const getFieldAtPath = (deviceId: string, path: string[]): ConfigField | null => {
    let current: Record<string, unknown> = config.configuration[deviceId] as Record<string, unknown>;
    for (const key of path) {
      if (!current) return null;
      current = current[key] as Record<string, unknown>;
    }
    return current as ConfigField || null;
  };

  return (
    <div style={styles.form}>
      {Object.entries(config.configuration).map(([deviceId, deviceConfig]) => {
        const dc = deviceConfig as DeviceConfig;
        return (
          <div key={deviceId} style={styles.deviceSection}>
            <h2 style={styles.deviceTitle}>{deviceId}</h2>
            {Object.entries(dc)
              .filter(([key]) => !key.startsWith('$'))
              .map(([key, field]) => {
                // Check device-level mutex/override constraints
                const disabledReason = getMutexDisabledReason(dc, key);
                const isDisabled = disabledReason !== null;

                return (
                  <FieldRenderer
                    key={key}
                    name={key}
                    field={field as ConfigField}
                    path={[key]}
                    deviceId={deviceId}
                    updateValue={(path, value) => updateValue(deviceId, path, value)}
                    getValueAtPath={(path) => getValueAtPath(deviceId, path)}
                    getFieldAtPath={(path) => getFieldAtPath(deviceId, path)}
                    disabled={isDisabled}
                    disabledReason={disabledReason || undefined}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
