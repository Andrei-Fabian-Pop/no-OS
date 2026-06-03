/**
 * Override Evaluator
 *
 * Evaluates $override rules in the configuration and applies dynamic constraints
 * based on current field values. Supports:
 * - $mutex: mutual exclusion between fields
 * - $if/$then with $this/$parent: conditional modifications
 * - $parent block: direct overrides on parent fields
 * - $switch/$cases: multi-case conditionals
 */

interface ConfigField {
  $type?: string;
  $values?: string[];
  $activeValues?: string[];
  $options?: Array<{ id: string; symbol: string; include: string; $sources?: unknown }>;
  $activeOptions?: string[];
  $override?: OverrideRule[] | { $parent: OverrideRule[] };
  $disabled?: boolean;
  $disabledReason?: string;
  value?: unknown;
  [key: string]: unknown;
}

interface Configuration {
  configuration: Record<string, ConfigField>;
  makefile: unknown;
}

interface ConditionValue {
  value: unknown;
}

interface Condition {
  $this?: Record<string, ConditionValue>;
  $parent?: Record<string, ConditionValue>;
  [field: string]: ConditionValue | Record<string, ConditionValue> | undefined;
}

interface Action {
  value?: unknown | unknown[];
  disabled?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  platforms?: Array<{ include: string }>;
}

interface Actions {
  $this?: Record<string, Action>;
  $parent?: Record<string, Action>;
  [field: string]: Action | Record<string, Action> | undefined;
}

interface IfThenRule {
  $if: Condition;
  $then: Actions;
  _parentScope?: boolean;
}

interface MutexRule {
  $mutex: string[];
}

interface SwitchRule {
  $switch: {
    $on: string;
    $cases: Record<string, Record<string, Action>>;
  };
}

interface DirectOverrideRule {
  [field: string]: Action;
}

type OverrideRule = IfThenRule | MutexRule | SwitchRule | DirectOverrideRule;

interface EvaluationContext {
  config: Configuration;
  deviceId: string;
  parentPath: string[];
  thisPath: string[];
}

export class OverrideEvaluator {
  /**
   * Evaluate all $override rules in the configuration
   */
  evaluate(config: Configuration): Configuration {
    // Deep clone to avoid mutating the original
    const result = JSON.parse(JSON.stringify(config)) as Configuration;

    // Reset all $activeValues and $activeOptions to their full sets
    this.resetActiveFields(result);

    // Evaluate overrides for each device
    for (const [deviceId, deviceConfig] of Object.entries(result.configuration)) {
      this.evaluateDevice(result, deviceId, deviceConfig);
    }

    return result;
  }

  /**
   * Reset all $activeValues to $values and $activeOptions to all options
   */
  private resetActiveFields(config: Configuration): void {
    const walk = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;

      const field = obj as ConfigField;

      // Reset enum activeValues
      if (field.$values && Array.isArray(field.$values)) {
        field.$activeValues = [...field.$values];
      }

      // Reset platform_ops activeOptions
      if (field.$options && Array.isArray(field.$options)) {
        field.$activeOptions = field.$options.map(o => o.id);
      }

      // Reset disabled state
      field.$disabled = false;
      delete field.$disabledReason;

      // Recurse into child fields
      for (const [key, value] of Object.entries(field)) {
        if (!key.startsWith('$') && key !== 'value' && typeof value === 'object') {
          walk(value);
        }
      }
    };

    for (const deviceConfig of Object.values(config.configuration)) {
      walk(deviceConfig);
    }
  }

  /**
   * Evaluate overrides for a single device
   */
  private evaluateDevice(
    config: Configuration,
    deviceId: string,
    deviceConfig: ConfigField
  ): void {
    // Walk the device config tree and evaluate overrides at each level
    this.walkAndEvaluate(config, deviceId, deviceConfig, [], []);
  }

  /**
   * Recursively walk the configuration tree and evaluate $override rules
   */
  private walkAndEvaluate(
    config: Configuration,
    deviceId: string,
    field: ConfigField,
    parentPath: string[],
    currentPath: string[]
  ): void {
    // Check for $override rules at this level
    if (field.$override) {
      const context: EvaluationContext = {
        config,
        deviceId,
        parentPath,
        thisPath: currentPath,
      };

      const rules = this.normalizeOverrideRules(field.$override);
      this.evaluateOverrides(context, rules);
    }

    // Recurse into child fields
    for (const [key, value] of Object.entries(field)) {
      if (key.startsWith('$') || key === 'value') continue;
      if (!value || typeof value !== 'object') continue;

      const childField = value as ConfigField;

      // For platform_extra and struct types, track parent-child relationship
      if (childField.$type === 'platform_extra' || childField.$type === 'struct') {
        this.walkAndEvaluate(
          config,
          deviceId,
          childField,
          currentPath,  // Current becomes parent for child
          [...currentPath, key]
        );
      } else {
        // Other types, just continue walking
        this.walkAndEvaluate(
          config,
          deviceId,
          childField,
          parentPath,
          [...currentPath, key]
        );
      }
    }

    // Also walk into $members for union types
    if (field.$members && typeof field.$members === 'object') {
      for (const [memberKey, memberValue] of Object.entries(field.$members)) {
        if (typeof memberValue === 'object') {
          for (const [fieldKey, fieldValue] of Object.entries(memberValue as Record<string, unknown>)) {
            if (fieldValue && typeof fieldValue === 'object') {
              this.walkAndEvaluate(
                config,
                deviceId,
                fieldValue as ConfigField,
                parentPath,
                [...currentPath, '$members', memberKey, fieldKey]
              );
            }
          }
        }
      }
    }

    // Walk into $elements for array types
    if (field.$elements && Array.isArray(field.$elements)) {
      field.$elements.forEach((element, index) => {
        if (element && typeof element === 'object') {
          this.walkAndEvaluate(
            config,
            deviceId,
            element as ConfigField,
            parentPath,
            [...currentPath, '$elements', String(index)]
          );
        }
      });
    }
  }

  /**
   * Normalize $override to always be an array of rules
   */
  private normalizeOverrideRules(override: unknown): OverrideRule[] {
    if (Array.isArray(override)) {
      return override;
    }

    // Handle $parent block format
    if (override && typeof override === 'object' && '$parent' in override) {
      const parentBlock = (override as { $parent: OverrideRule[] }).$parent;
      if (Array.isArray(parentBlock)) {
        // Mark each rule as targeting $parent
        return parentBlock.map((rule): OverrideRule => {
          if ('$if' in rule && '$then' in rule) {
            // Wrap conditions and actions in $parent context
            return {
              ...(rule as IfThenRule),
              _parentScope: true,
            };
          }
          return rule;
        });
      }
    }

    return [];
  }

  /**
   * Evaluate a list of override rules
   */
  private evaluateOverrides(
    context: EvaluationContext,
    rules: OverrideRule[]
  ): void {
    for (const rule of rules) {
      if (this.isMutexRule(rule)) {
        this.evaluateMutex(context, rule.$mutex);
      } else if (this.isIfThenRule(rule)) {
        this.evaluateIfThen(context, rule.$if, rule.$then, rule._parentScope);
      } else if (this.isSwitchRule(rule)) {
        this.evaluateSwitch(context, rule.$switch);
      } else {
        // Direct property override (e.g., { device_id: { default: 4 } })
        this.applyDirectOverrides(context, rule as DirectOverrideRule);
      }
    }
  }

  private isMutexRule(rule: OverrideRule): rule is MutexRule {
    return '$mutex' in rule && Array.isArray((rule as MutexRule).$mutex);
  }

  private isIfThenRule(rule: OverrideRule): rule is IfThenRule {
    return '$if' in rule && '$then' in rule;
  }

  private isSwitchRule(rule: OverrideRule): rule is SwitchRule {
    return '$switch' in rule && typeof (rule as SwitchRule).$switch === 'object';
  }

  /**
   * Evaluate $mutex rule - disable fields that conflict with set values
   */
  private evaluateMutex(context: EvaluationContext, fields: string[]): void {
    // Find which field in the mutex group has a value
    let setFieldName: string | null = null;

    for (const fieldName of fields) {
      const field = this.getFieldAtPath(context.config, context.deviceId, [...context.thisPath, fieldName]);
      if (field && this.hasValue(field)) {
        setFieldName = fieldName;
        break;
      }
    }

    // If one field is set, disable the others
    if (setFieldName) {
      for (const fieldName of fields) {
        if (fieldName !== setFieldName) {
          const field = this.getFieldAtPath(context.config, context.deviceId, [...context.thisPath, fieldName]);
          if (field) {
            field.$disabled = true;
            field.$disabledReason = `mutex with ${setFieldName}`;
          }
        }
      }
    }
  }

  /**
   * Evaluate $if/$then rule
   */
  private evaluateIfThen(
    context: EvaluationContext,
    condition: Condition,
    actions: Actions,
    parentScope?: boolean
  ): void {
    // Determine condition scope
    let conditionScope: 'this' | 'parent' = 'this';
    let conditionFields: Record<string, ConditionValue>;

    if (condition.$this) {
      conditionScope = 'this';
      conditionFields = condition.$this;
    } else if (condition.$parent) {
      conditionScope = 'parent';
      conditionFields = condition.$parent;
    } else if (parentScope) {
      // Inside $parent block, conditions refer to parent
      conditionScope = 'parent';
      conditionFields = condition as Record<string, ConditionValue>;
    } else {
      // Default: condition refers to $this
      conditionScope = 'this';
      conditionFields = condition as Record<string, ConditionValue>;
    }

    // Check if condition is met
    const conditionMet = this.checkCondition(context, conditionScope, conditionFields);

    if (!conditionMet) return;

    // Determine action scope and apply
    if (actions.$this) {
      this.applyActions(context, 'this', actions.$this);
    }
    if (actions.$parent) {
      this.applyActions(context, 'parent', actions.$parent);
    }

    // If no explicit scope and inside $parent block, actions target parent
    if (!actions.$this && !actions.$parent) {
      const scope = parentScope ? 'parent' : 'this';
      this.applyActions(context, scope, actions as Record<string, Action>);
    }
  }

  /**
   * Evaluate $switch/$cases rule
   */
  private evaluateSwitch(
    context: EvaluationContext,
    switchDef: { $on: string; $cases: Record<string, Record<string, Action>> }
  ): void {
    // Get the selector value
    const selectorField = this.getFieldAtPath(
      context.config,
      context.deviceId,
      [...context.parentPath, switchDef.$on]
    );

    if (!selectorField) return;

    const selectorValue = String(selectorField.value ?? '');

    // Find matching case or default
    const caseActions = switchDef.$cases[selectorValue] || switchDef.$cases['_'];

    if (caseActions) {
      this.applyActions(context, 'parent', caseActions);
    }
  }

  /**
   * Apply direct property overrides (from $parent block)
   */
  private applyDirectOverrides(
    context: EvaluationContext,
    overrides: Record<string, Action>
  ): void {
    for (const [fieldName, action] of Object.entries(overrides)) {
      if (fieldName.startsWith('$')) continue;

      const field = this.getFieldAtPath(
        context.config,
        context.deviceId,
        [...context.parentPath, fieldName]
      );

      if (field) {
        this.applyAction(field, action);
      }
    }
  }

  /**
   * Check if a condition is met
   */
  private checkCondition(
    context: EvaluationContext,
    scope: 'this' | 'parent',
    conditions: Record<string, ConditionValue>
  ): boolean {
    const basePath = scope === 'this' ? context.thisPath : context.parentPath;

    for (const [fieldName, condition] of Object.entries(conditions)) {
      if (fieldName.startsWith('$')) continue;

      const field = this.getFieldAtPath(context.config, context.deviceId, [...basePath, fieldName]);
      if (!field) return false;

      const expectedValue = condition.value;

      // Special value: $any matches any non-null value
      if (expectedValue === '$any') {
        if (!this.hasValue(field)) return false;
      } else {
        // Direct value comparison
        if (field.value !== expectedValue) return false;
      }
    }

    return true;
  }

  /**
   * Apply actions to fields
   */
  private applyActions(
    context: EvaluationContext,
    scope: 'this' | 'parent',
    actions: Record<string, Action>
  ): void {
    const basePath = scope === 'this' ? context.thisPath : context.parentPath;

    for (const [fieldName, action] of Object.entries(actions)) {
      if (fieldName.startsWith('$')) continue;

      const field = this.getFieldAtPath(context.config, context.deviceId, [...basePath, fieldName]);
      if (field) {
        this.applyAction(field, action);
      }
    }
  }

  /**
   * Apply a single action to a field
   */
  private applyAction(field: ConfigField, action: Action): void {
    // Narrow enum values
    if (action.value !== undefined && Array.isArray(action.value)) {
      if (field.$values) {
        field.$activeValues = action.value as string[];
      }
    }

    // Narrow platform_ops options
    if (action.platforms !== undefined && Array.isArray(action.platforms)) {
      if (field.$options) {
        const allowedIncludes = action.platforms.map(p => p.include);
        field.$activeOptions = field.$options
          .filter(o => allowedIncludes.includes(o.include))
          .map(o => o.id);

        // Update $resolved to first active option
        if (field.$activeOptions.length > 0) {
          const firstActive = field.$options.find(o => o.id === field.$activeOptions![0]);
          if (firstActive) {
            field.$resolved = {
              platform: (field.$resolved as any)?.platform,
              symbol: firstActive.symbol,
            };
          }
        }
      }
    }

    // Disable field
    if (action.disabled === true) {
      field.$disabled = true;
    }

    // Set default (only if no value is set)
    if (action.default !== undefined && field.value === null) {
      field.$default = action.default;
    }

    // Set constraints
    if (action.minimum !== undefined) {
      field.$minimum = action.minimum;
    }
    if (action.maximum !== undefined) {
      field.$maximum = action.maximum;
    }
  }

  /**
   * Get a field at a given path
   */
  private getFieldAtPath(
    config: Configuration,
    deviceId: string,
    path: string[]
  ): ConfigField | null {
    let current: unknown = config.configuration[deviceId];

    for (const key of path) {
      if (!current || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[key];
    }

    return current as ConfigField | null;
  }

  /**
   * Check if a field has a value set
   */
  private hasValue(field: ConfigField): boolean {
    if (field.value !== null && field.value !== undefined) {
      return true;
    }

    // Check nested fields
    for (const [key, value] of Object.entries(field)) {
      if (key.startsWith('$') || key === 'value') continue;
      if (value && typeof value === 'object') {
        if (this.hasValue(value as ConfigField)) {
          return true;
        }
      }
    }

    return false;
  }
}
