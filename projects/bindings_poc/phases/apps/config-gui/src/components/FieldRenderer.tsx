import { useState } from 'react';
import { ConfigField } from '../types/configuration';

interface FieldRendererProps {
  name: string;
  field: ConfigField;
  path: string[];
  deviceId: string;
  updateValue: (path: string[], value: unknown) => void;
  getValueAtPath: (path: string[]) => unknown;
  getFieldAtPath: (path: string[]) => ConfigField | null;
  disabled: boolean;
  disabledReason?: string;
}

const styles = {
  field: {
    marginBottom: '15px',
  },
  fieldDisabled: {
    opacity: 0.5,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '5px',
    fontWeight: 'bold' as const,
    fontSize: '14px',
  },
  description: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '5px',
  },
  input: {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  inputDisabled: {
    background: '#f5f5f5',
    cursor: 'not-allowed',
  },
  select: {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: 'white',
  },
  checkbox: {
    width: '20px',
    height: '20px',
  },
  struct: {
    marginLeft: '20px',
    paddingLeft: '15px',
    borderLeft: '3px solid #ddd',
  },
  structHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    padding: '8px 0',
    userSelect: 'none' as const,
  },
  expandIcon: {
    fontSize: '12px',
    color: '#666',
    transition: 'transform 0.2s',
  },
  required: {
    color: '#dc3545',
    fontSize: '12px',
  },
  disabledBadge: {
    background: '#f8d7da',
    color: '#721c24',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
  },
  platformOps: {
    background: '#e7f3ff',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'monospace',
  },
  unconfigureBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px',
    color: '#666',
    cursor: 'pointer',
    marginLeft: '8px',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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

export function FieldRenderer({
  name,
  field,
  path,
  deviceId,
  updateValue,
  getValueAtPath,
  getFieldAtPath,
  disabled,
  disabledReason,
}: FieldRendererProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Track which array elements are expanded (default: all collapsed)
  const [expandedElements, setExpandedElements] = useState<Set<number>>(new Set());

  const toggleElement = (index: number) => {
    setExpandedElements(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const type = field.$type;
  const value = field.value;
  const isRequired = field.$required;
  const description = field.$description;

  if (disabled) {
    return (
      <div style={{ ...styles.field, ...styles.fieldDisabled }}>
        <label style={styles.label}>
          {name}
          <span style={styles.disabledBadge}>✕ {disabledReason || 'disabled'}</span>
        </label>
        {description && <div style={styles.description}>{description}</div>}
      </div>
    );
  }

  switch (type) {
    case 'enum': {
      const values = field.$values || [];
      const currentValue = value as string | null;
      const hasValue = currentValue !== null && currentValue !== undefined;
      return (
        <div style={styles.field}>
          <div style={styles.fieldRow}>
            <label style={{ ...styles.label, marginBottom: 0 }}>
              {name}
              {isRequired && <span style={styles.required}>*required</span>}
              {!hasValue && field.$default !== undefined && (
                <span style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                  (default: {String(field.$default)})
                </span>
              )}
            </label>
            {hasValue && (
              <button
                style={styles.unconfigureBtn}
                onClick={() => updateValue(path, null)}
                title="Reset to unconfigured"
              >
                ✕ clear
              </button>
            )}
          </div>
          {description && <div style={styles.description}>{description}</div>}
          <select
            style={styles.select}
            value={hasValue ? currentValue : ''}
            onChange={(e) => updateValue(path, e.target.value === '' ? null : e.target.value)}
          >
            <option value="">-- None --</option>
            {values.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      );
    }

    case 'uint8_t':
    case 'uint16_t':
    case 'uint32_t':
    case 'uint64_t':
    case 'int8_t':
    case 'int16_t':
    case 'int32_t':
    case 'int64_t':
    case 'size_t': {
      const hasValue = value !== null && value !== undefined;
      return (
        <div style={styles.field}>
          <div style={styles.fieldRow}>
            <label style={{ ...styles.label, marginBottom: 0 }}>
              {name}
              {isRequired && <span style={styles.required}>*required</span>}
              {!hasValue && field.$default !== undefined && (
                <span style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                  (default: {String(field.$default)})
                </span>
              )}
            </label>
            {hasValue && (
              <button
                style={styles.unconfigureBtn}
                onClick={() => updateValue(path, null)}
                title="Reset to unconfigured"
              >
                ✕ clear
              </button>
            )}
          </div>
          {description && <div style={styles.description}>{description}</div>}
          <input
            type="number"
            style={styles.input}
            value={hasValue ? String(value) : ''}
            placeholder="Not set"
            onChange={(e) => {
              const numVal = e.target.value === '' ? null : parseInt(e.target.value, 10);
              updateValue(path, numVal);
            }}
          />
        </div>
      );
    }

    case 'bool': {
      const hasValue = value !== null && value !== undefined;
      const isChecked = hasValue ? value === true : false;
      return (
        <div style={styles.field}>
          <div style={styles.fieldRow}>
            <label style={{ ...styles.label, cursor: 'pointer', marginBottom: 0 }}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={isChecked}
                onChange={(e) => updateValue(path, e.target.checked)}
              />
              {name}
              {isRequired && <span style={styles.required}>*required</span>}
              {!hasValue && field.$default !== undefined && (
                <span style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                  (default: {String(field.$default)})
                </span>
              )}
            </label>
            {hasValue && (
              <button
                style={styles.unconfigureBtn}
                onClick={() => updateValue(path, null)}
                title="Reset to unconfigured"
              >
                ✕ clear
              </button>
            )}
          </div>
          {description && <div style={styles.description}>{description}</div>}
        </div>
      );
    }

    case 'struct': {
      // Check for mutex - get sibling fields that might be in a mutex relationship
      const childEntries = Object.entries(field)
        .filter(([key]) => !key.startsWith('$') && key !== 'value');

      return (
        <div style={styles.field}>
          <div
            style={styles.structHeader}
            onClick={() => setCollapsed(!collapsed)}
          >
            <span style={{
              ...styles.expandIcon,
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
            }}>▼</span>
            <span style={{ fontWeight: 'bold' }}>{name}</span>
            {field.$struct_type && <span style={{ color: '#666', fontSize: '12px' }}>({field.$struct_type})</span>}
            {isRequired && <span style={styles.required}>*required</span>}
          </div>
          {description && <div style={styles.description}>{description}</div>}
          {!collapsed && (
            <div style={styles.struct}>
              {childEntries.map(([key, childField]) => {
                // Check mutex constraints from parent's $override
                let isDisabled = false;
                let disabledReason = '';

                const override = field.$override as Array<{ $mutex?: string[] }> | undefined;
                if (override) {
                  for (const rule of override) {
                    if (rule.$mutex && rule.$mutex.includes(key)) {
                      // Check if any other field in the mutex group has values
                      for (const otherKey of rule.$mutex) {
                        if (otherKey !== key) {
                          const otherField = field[otherKey] as ConfigField | undefined;
                          if (otherField && hasAnyValue(otherField)) {
                            isDisabled = true;
                            disabledReason = `mutex with ${otherKey}`;
                            break;
                          }
                        }
                      }
                    }
                  }
                }

                return (
                  <FieldRenderer
                    key={key}
                    name={key}
                    field={childField as ConfigField}
                    path={[...path, key]}
                    deviceId={deviceId}
                    updateValue={updateValue}
                    getValueAtPath={getValueAtPath}
                    getFieldAtPath={getFieldAtPath}
                    disabled={isDisabled}
                    disabledReason={disabledReason}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    }

    case 'union': {
      const selector = field.$selector;
      const members = field.$members || {};

      // Get selector value from sibling field
      const parentPath = path.slice(0, -1);
      const selectorPath = [...parentPath, selector as string];
      const selectorValue = getValueAtPath(selectorPath) as string || '';

      const activeMember = members[selectorValue];

      return (
        <div style={styles.field}>
          <div
            style={styles.structHeader}
            onClick={() => setCollapsed(!collapsed)}
          >
            <span style={{
              ...styles.expandIcon,
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
            }}>▼</span>
            <span style={{ fontWeight: 'bold' }}>{name}</span>
            <span style={{ color: '#666', fontSize: '12px' }}>(union, selector: {selector})</span>
          </div>
          {description && <div style={styles.description}>{description}</div>}
          {!collapsed && (
            <div style={styles.struct}>
              {selectorValue && activeMember ? (
                Object.entries(activeMember).map(([key, childField]) => (
                  <FieldRenderer
                    key={key}
                    name={key}
                    field={childField as ConfigField}
                    path={[...path, '$members', selectorValue, key]}
                    deviceId={deviceId}
                    updateValue={updateValue}
                    getValueAtPath={getValueAtPath}
                    getFieldAtPath={getFieldAtPath}
                    disabled={false}
                  />
                ))
              ) : (
                <div style={{ color: '#666', fontStyle: 'italic' }}>
                  Select a value for "{selector}" to configure this union
                </div>
              )}
              {/* Show disabled members */}
              {Object.keys(members)
                .filter(k => k !== selectorValue)
                .map(memberKey => (
                  <div key={memberKey} style={{ ...styles.field, ...styles.fieldDisabled }}>
                    <label style={styles.label}>
                      {Object.keys(members[memberKey])[0]}
                      <span style={styles.disabledBadge}>✕ {memberKey} not selected</span>
                    </label>
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    }

    case 'platform_ops': {
      const resolved = field.$resolved;
      return (
        <div style={styles.field}>
          <label style={styles.label}>
            {name}
            <span style={{ color: '#666', fontSize: '12px' }}>(platform ops)</span>
          </label>
          {description && <div style={styles.description}>{description}</div>}
          <div style={styles.platformOps}>
            {resolved?.symbol || 'Not resolved'}
          </div>
          <input
            type="hidden"
            value={resolved?.symbol || ''}
            onChange={(e) => updateValue(path, e.target.value)}
          />
        </div>
      );
    }

    case 'platform_extra': {
      return (
        <div style={styles.field}>
          <div
            style={styles.structHeader}
            onClick={() => setCollapsed(!collapsed)}
          >
            <span style={{
              ...styles.expandIcon,
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
            }}>▼</span>
            <span style={{ fontWeight: 'bold' }}>{name}</span>
            <span style={{ color: '#666', fontSize: '12px' }}>(platform extra)</span>
          </div>
          {description && <div style={styles.description}>{description}</div>}
          {!collapsed && (
            <div style={styles.struct}>
              {Object.entries(field)
                .filter(([key]) => !key.startsWith('$') && key !== 'value')
                .map(([key, childField]) => (
                  <FieldRenderer
                    key={key}
                    name={key}
                    field={childField as ConfigField}
                    path={[...path, key]}
                    deviceId={deviceId}
                    updateValue={updateValue}
                    getValueAtPath={getValueAtPath}
                    getFieldAtPath={getFieldAtPath}
                    disabled={false}
                  />
                ))}
            </div>
          )}
        </div>
      );
    }

    case 'array': {
      const elements = field.$elements as ConfigField[] || [];
      const elementType = field.$element_type as string || 'unknown';
      const size = field.$size as number || elements.length;

      return (
        <div style={styles.field}>
          <div
            style={styles.structHeader}
            onClick={() => setCollapsed(!collapsed)}
          >
            <span style={{
              ...styles.expandIcon,
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
            }}>▼</span>
            <span style={{ fontWeight: 'bold' }}>{name}</span>
            <span style={{ color: '#666', fontSize: '12px' }}>
              [{size}] {elementType}
            </span>
          </div>
          {description && <div style={styles.description}>{description}</div>}
          {!collapsed && (
            <div style={styles.struct}>
              {elements.map((element, index) => {
                // Check if this element has any configured values
                const elementHasValues = hasAnyValue(element);
                const isElementExpanded = expandedElements.has(index);

                return (
                  <div key={index} style={{ marginBottom: '10px' }}>
                    <div
                      style={{
                        ...styles.structHeader,
                        background: elementHasValues ? '#e8f5e9' : '#f5f5f5',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        marginBottom: '5px',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleElement(index)}
                    >
                      <span style={{
                        ...styles.expandIcon,
                        transform: isElementExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                      }}>▼</span>
                      <span style={{ fontWeight: 'bold', color: '#333' }}>
                        [{index}]
                      </span>
                      {elementHasValues && (
                        <span style={{ color: '#28a745', fontSize: '11px', marginLeft: '8px' }}>
                          ● configured
                        </span>
                      )}
                    </div>
                    {isElementExpanded && (element.$type === 'struct' || element.$struct_type) ? (
                      <div style={{ ...styles.struct, marginTop: 0 }}>
                        {Object.entries(element)
                          .filter(([key]) => !key.startsWith('$') && key !== 'value')
                          .map(([key, childField]) => (
                            <FieldRenderer
                              key={key}
                              name={key}
                              field={childField as ConfigField}
                              path={[...path, '$elements', String(index), key]}
                              deviceId={deviceId}
                              updateValue={updateValue}
                              getValueAtPath={getValueAtPath}
                              getFieldAtPath={getFieldAtPath}
                              disabled={false}
                            />
                          ))}
                      </div>
                    ) : isElementExpanded ? (
                      // Primitive or enum element
                      <FieldRenderer
                        name={`[${index}]`}
                        field={element}
                        path={[...path, '$elements', String(index)]}
                        deviceId={deviceId}
                        updateValue={updateValue}
                        getValueAtPath={getValueAtPath}
                        getFieldAtPath={getFieldAtPath}
                        disabled={false}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    default: {
      // Unknown type - show as text input
      return (
        <div style={styles.field}>
          <label style={styles.label}>
            {name}
            {type && <span style={{ color: '#666', fontSize: '12px' }}>({type})</span>}
            {isRequired && <span style={styles.required}>*required</span>}
          </label>
          {description && <div style={styles.description}>{description}</div>}
          <input
            type="text"
            style={styles.input}
            value={value !== null && value !== undefined ? String(value) : ''}
            onChange={(e) => updateValue(path, e.target.value || null)}
          />
        </div>
      );
    }
  }
}
