/**
 * Code generation module for no-OS configuration GUI.
 * Generates C source files from configuration.json.
 */

interface ConfigField {
  $type?: string;
  $struct_type?: string;
  $enum_type?: string;
  $values?: string[];
  $default?: unknown;
  $required?: boolean;
  $description?: string;
  $selector?: string;
  $members?: Record<string, Record<string, ConfigField>>;
  $resolved?: { platform: string; symbol: string };
  $sources?: {
    headers?: string[];
    sources?: string[];
    platform?: { headers?: string[]; sources?: string[] };
  };
  $pointer?: boolean;
  // Array support
  $size?: number;
  $element_type?: string;
  $elements?: ConfigField[];
  value?: unknown;
  [key: string]: unknown;
}

interface DeviceConfig {
  $sources?: { headers?: string[] };
  [key: string]: ConfigField | unknown;
}

interface Configuration {
  configuration: Record<string, DeviceConfig>;
  metadata?: {
    platform?: string;
    target?: string;
    device?: string;
  };
}

const ADI_LICENSE = `********************************************************************************
 * Copyright 2024(c) Analog Devices, Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Analog Devices, Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY ANALOG DEVICES, INC. "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL ANALOG DEVICES, INC. BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*******************************************************************************/`;

function resolveValue(field: ConfigField): unknown {
  if (field.value !== null && field.value !== undefined) {
    return field.value;
  }
  if (field.$default !== undefined) {
    return field.$default;
  }
  return null;
}

function formatValue(value: unknown, type: string | undefined): string {
  if (value === null || value === undefined) {
    if (type === 'bool') return 'false';
    if (type?.startsWith('uint') || type?.startsWith('int') || type === 'size_t') return '0';
    return 'NULL';
  }

  if (type === 'bool') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `{ ${value.map(v => formatValue(v, undefined)).join(', ')} }`;
  }

  return String(value);
}

function getStructFields(field: ConfigField): [string, ConfigField][] {
  return Object.entries(field)
    .filter(([key]) => !key.startsWith('$') && key !== 'value')
    .map(([key, val]) => [key, val as ConfigField]);
}

// Check if a struct field has any configured children (values set)
function hasConfiguredChildren(field: ConfigField): boolean {
  for (const [key, val] of Object.entries(field)) {
    if (key.startsWith('$') || key === 'value') continue;
    const child = val as ConfigField;
    // Check if this child has a value set
    if (child.value !== null && child.value !== undefined) {
      return true;
    }
    // Recursively check nested objects
    if (typeof child === 'object' && child !== null) {
      if (hasConfiguredChildren(child)) {
        return true;
      }
    }
  }
  return false;
}

// For include files (e.g., maxim_spi.h)
function getPlatformPrefix(platform: string): string {
  const prefixes: Record<string, string> = {
    maxim: 'maxim',
    stm32: 'stm32',
    xilinx: 'xil',
    aducm: 'aducm',
    pico: 'pico',
    mbed: 'mbed',
  };
  return prefixes[platform] || platform;
}

// Collect all headers from $sources in a configuration tree
function collectHeadersFromConfig(node: ConfigField, collected: Set<string>): void {
  // Collect headers from this node's $sources
  if (node.$sources) {
    const sources = node.$sources as { headers?: string[] };
    if (sources.headers) {
      for (const h of sources.headers) {
        // Extract just the filename from paths like "include/no_os_spi.h"
        const filename = h.split('/').pop();
        if (filename) collected.add(filename);
      }
    }
  }

  // Recursively walk children
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$') || key === 'value') continue;
    if (typeof value === 'object' && value !== null) {
      // Handle arrays ($elements)
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            collectHeadersFromConfig(item as ConfigField, collected);
          }
        }
      } else {
        collectHeadersFromConfig(value as ConfigField, collected);
      }
    }
  }
}


interface ExtraDef {
  varName: string;
  structType: string;
  init: string;
  comment: string;
}

// Find all platform_extra fields in the config tree and create variable definitions
function collectExtraDefs(
  deviceId: string,
  deviceConfig: DeviceConfig,
  platform: string
): ExtraDef[] {
  const defs: ExtraDef[] = [];
  const platformPrefix = getPlatformPrefix(platform);
  const deviceName = deviceId.replace('adi,', '').replace(/-/g, '_');

  function addExtraDef(field: ConfigField, contextName: string): void {
    const structType = field.$struct_type || `${platformPrefix}_${contextName}_init_param`;
    const varName = `${contextName}_extra_ip`;
    const init = generateExtraInit(field, '\t');
    if (init.trim()) {
      // Avoid duplicates
      if (!defs.find(d => d.varName === varName)) {
        defs.push({
          varName,
          structType,
          init,
          comment: `${contextName.toUpperCase()} extra parameters`,
        });
      }
    }
  }

  // Add a struct definition for pointer struct fields
  function addPointerStructDef(field: ConfigField, contextName: string): void {
    const structType = field.$struct_type || `no_os_${contextName}_init_param`;
    const varName = `${contextName}_init_ip`;
    const init = generateInlineStructInit(field, '\t', defs, contextName);
    if (init.trim()) {
      // Avoid duplicates
      if (!defs.find(d => d.varName === varName)) {
        defs.push({
          varName,
          structType,
          init,
          comment: `${contextName.toUpperCase()} initialization parameters`,
        });
      }
    }
  }

  function walkField(field: ConfigField, contextName: string): void {
    const type = field.$type;

    if (type === 'platform_extra') {
      addExtraDef(field, contextName);
    }

    if (type === 'struct') {
      // If this is a pointer struct field with configured children, create a separate variable
      if (field.$pointer && hasConfiguredChildren(field)) {
        addPointerStructDef(field, contextName);
      }
      // Check for extra field
      const extraField = field.extra as ConfigField | undefined;
      if (extraField && extraField.$type === 'platform_extra') {
        addExtraDef(extraField, contextName);
      }
      // Check other nested structs
      for (const [key, childField] of getStructFields(field)) {
        if (key !== 'extra' && childField.$type === 'struct') {
          walkField(childField, key.replace('_init', ''));
        }
      }
    }

    if (type === 'union') {
      const selector = field.$selector as string;
      const members = field.$members || {};
      const parentFields = Object.entries(deviceConfig)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, v]) => [k, v as ConfigField] as [string, ConfigField]);
      const selectorField = parentFields.find(([k]) => k === selector)?.[1];
      const selectorValue = selectorField ? resolveValue(selectorField) as string : null;

      if (selectorValue && members[selectorValue]) {
        const activeMember = members[selectorValue];
        for (const [memberKey, memberField] of Object.entries(activeMember)) {
          walkField(memberField as ConfigField, memberKey.replace('_init', ''));
        }
      }
    }
  }

  // Check for top-level extra field (like in uart)
  const topLevelExtra = deviceConfig.extra as ConfigField | undefined;
  if (topLevelExtra && topLevelExtra.$type === 'platform_extra') {
    addExtraDef(topLevelExtra, deviceName);
  }

  // Walk all other fields - only process structs that have configured children
  for (const [key, field] of Object.entries(deviceConfig)) {
    if (key.startsWith('$') || key === 'extra') continue;
    const configField = field as ConfigField;
    if (configField.$type === 'union') {
      walkField(configField, key.replace('_init', ''));
    } else if (configField.$type === 'struct') {
      // Only walk structs that have configured children (for $mutex fields)
      if (hasConfiguredChildren(configField)) {
        // If this is a pointer struct, create a separate variable for it
        if (configField.$pointer) {
          addPointerStructDef(configField, key.replace('_init', ''));
        }
        walkField(configField, key.replace('_init', ''));
      }
    }
  }

  return defs;
}

function generateExtraInit(field: ConfigField, indent: string): string {
  const lines: string[] = [];

  for (const [key, childField] of getStructFields(field)) {
    const type = childField.$type;

    // Handle pointer fields - set to NULL for now (complex pointer target handling TBD)
    if (childField.$pointer) {
      lines.push(`${indent}.${key} = NULL,`);
      continue;
    }

    if (type === 'struct' || type === 'platform_extra') {
      const nestedInit = generateExtraInit(childField, indent + '\t');
      if (nestedInit.trim()) {
        lines.push(`${indent}.${key} = {`);
        lines.push(nestedInit);
        lines.push(`${indent}},`);
      }
    } else if (type === 'platform_ops') {
      const resolved = childField.$resolved;
      if (resolved?.symbol) {
        lines.push(`${indent}.${key} = &${resolved.symbol},`);
      }
    } else {
      const value = resolveValue(childField);
      if (value !== null && value !== undefined) {
        lines.push(`${indent}.${key} = ${formatValue(value, type)},`);
      }
    }
  }

  return lines.join('\n');
}

// Generate the device init struct with all nested structs inlined
function generateDeviceInit(
  deviceId: string,
  deviceConfig: DeviceConfig,
  extraDefs: ExtraDef[]
): string {
  // Handle both "adi,device" and plain "uart" style names
  const deviceName = deviceId.replace('adi,', '').replace(/-/g, '_');
  const lines: string[] = [];

  // Determine struct type - for "uart" it's "no_os_uart_init_param", for devices it's "devicename_init_param"
  const isExtraInit = !deviceId.startsWith('adi,');
  const structType = isExtraInit ? `no_os_${deviceName}_init_param` : `${deviceName}_init_param`;

  lines.push(`/* ${deviceName.toUpperCase()} initialization parameters */`);
  lines.push(`struct ${structType} ${deviceName}_ip = {`);

  for (const [key, field] of Object.entries(deviceConfig)) {
    if (key.startsWith('$')) continue;
    const configField = field as ConfigField;
    const type = configField.$type;

    if (type === 'enum' || type?.startsWith('uint') || type?.startsWith('int') || type === 'bool' || type === 'size_t') {
      const value = resolveValue(configField);
      if (value !== null && value !== undefined) {
        lines.push(`\t.${key} = ${formatValue(value, type)},`);
      }
    } else if (type === 'union') {
      const unionInit = generateUnionInit(configField, deviceConfig, extraDefs, '\t');
      if (unionInit) {
        lines.push(`\t.${key} = {`);
        lines.push(unionInit);
        lines.push(`\t},`);
      }
    } else if (type === 'platform_ops') {
      const resolved = configField.$resolved;
      if (resolved?.symbol) {
        lines.push(`\t.${key} = &${resolved.symbol},`);
      }
    } else if (type === 'platform_extra') {
      // Reference the extra struct by name
      const extraVarName = `${deviceName}_extra_ip`;
      lines.push(`\t.${key} = &${extraVarName},`);
    } else if (type === 'struct') {
      // Handle struct fields (like spi_init, i2c_init for $mutex fields)
      // Only generate if the struct has configured children
      if (hasConfiguredChildren(configField)) {
        if (configField.$pointer) {
          // Pointer field - reference the extra struct generated earlier
          const varName = `${key.replace('_init', '')}_init_ip`;
          lines.push(`\t.${key} = &${varName},`);
        } else {
          // Inline struct
          const structInit = generateInlineStructInit(configField, '\t\t', extraDefs, key.replace('_init', ''));
          if (structInit.trim()) {
            lines.push(`\t.${key} = {`);
            lines.push(structInit);
            lines.push(`\t},`);
          }
        }
      }
    } else if (type === 'array') {
      const arrayInit = generateArrayInit(configField, key, '\t');
      if (arrayInit) {
        lines.push(arrayInit);
      }
    }
  }

  lines.push('};');
  return lines.join('\n');
}

function generateUnionInit(
  field: ConfigField,
  deviceConfig: DeviceConfig,
  extraDefs: ExtraDef[],
  indent: string
): string | null {
  const selector = field.$selector as string;
  const members = field.$members || {};
  const selectorField = deviceConfig[selector] as ConfigField | undefined;
  const selectorValue = selectorField ? resolveValue(selectorField) as string : null;

  if (!selectorValue || !members[selectorValue]) {
    return null;
  }

  const lines: string[] = [];
  const activeMember = members[selectorValue];

  for (const [memberKey, memberField] of Object.entries(activeMember)) {
    const mf = memberField as ConfigField;
    if (mf.$type === 'struct') {
      const structInit = generateInlineStructInit(mf, indent + '\t\t', extraDefs, memberKey.replace('_init', ''));
      lines.push(`${indent}\t.${memberKey} = {`);
      lines.push(structInit);
      lines.push(`${indent}\t},`);
    }
  }

  return lines.join('\n');
}

function generateInlineStructInit(
  field: ConfigField,
  indent: string,
  extraDefs: ExtraDef[],
  contextName: string
): string {
  const lines: string[] = [];

  for (const [key, childField] of getStructFields(field)) {
    const type = childField.$type;

    if (type === 'platform_ops') {
      const resolved = childField.$resolved;
      if (resolved?.symbol) {
        lines.push(`${indent}.${key} = &${resolved.symbol},`);
      }
    } else if (type === 'platform_extra') {
      // Find the matching extra def
      const extraDef = extraDefs.find(d => d.varName === `${contextName}_extra_ip`);
      if (extraDef) {
        lines.push(`${indent}.${key} = &${extraDef.varName},`);
      }
    } else if (type === 'struct') {
      const nestedInit = generateInlineStructInit(childField, indent + '\t', extraDefs, key.replace('_init', ''));
      if (nestedInit.trim()) {
        lines.push(`${indent}.${key} = {`);
        lines.push(nestedInit);
        lines.push(`${indent}},`);
      }
    } else {
      const value = resolveValue(childField);
      if (value !== null && value !== undefined) {
        lines.push(`${indent}.${key} = ${formatValue(value, type)},`);
      }
    }
  }

  return lines.join('\n');
}

// Generate C array initialization with designated initializers
function generateArrayInit(field: ConfigField, fieldName: string, indent: string): string | null {
  const elements = field.$elements as ConfigField[] | undefined;
  if (!elements || elements.length === 0) {
    return null;
  }

  // Check if any elements have configured values
  let hasAnyConfigured = false;
  for (const element of elements) {
    if (hasConfiguredChildren(element)) {
      hasAnyConfigured = true;
      break;
    }
    // For primitive elements, check value directly
    if (element.value !== null && element.value !== undefined) {
      hasAnyConfigured = true;
      break;
    }
  }

  if (!hasAnyConfigured) {
    return null;  // Let C zero-initialize the array
  }

  const lines: string[] = [];
  lines.push(`${indent}.${fieldName} = {`);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    // Check if this element has any configured values
    const elementHasValues = hasConfiguredChildren(element) ||
      (element.value !== null && element.value !== undefined);

    if (!elementHasValues) {
      continue;  // Skip unconfigured elements, C will zero-init
    }

    if (element.$type === 'struct' || element.$struct_type) {
      // Struct element
      const structInit = generateArrayStructElement(element, indent + '\t\t');
      if (structInit.trim()) {
        lines.push(`${indent}\t[${i}] = {`);
        lines.push(structInit);
        lines.push(`${indent}\t},`);
      }
    } else {
      // Primitive or enum element
      const value = resolveValue(element);
      if (value !== null && value !== undefined) {
        lines.push(`${indent}\t[${i}] = ${formatValue(value, element.$type)},`);
      }
    }
  }

  lines.push(`${indent}},`);
  return lines.join('\n');
}

// Generate struct element initialization for arrays
function generateArrayStructElement(field: ConfigField, indent: string): string {
  const lines: string[] = [];

  for (const [key, childField] of getStructFields(field)) {
    const type = childField.$type;

    if (type === 'struct' || childField.$struct_type) {
      // Nested struct
      const nestedInit = generateArrayStructElement(childField, indent + '\t');
      if (nestedInit.trim()) {
        lines.push(`${indent}.${key} = {`);
        lines.push(nestedInit);
        lines.push(`${indent}},`);
      }
    } else if (type === 'enum') {
      const value = resolveValue(childField);
      if (value !== null && value !== undefined) {
        lines.push(`${indent}.${key} = ${value},`);
      }
    } else {
      const value = resolveValue(childField);
      if (value !== null && value !== undefined) {
        lines.push(`${indent}.${key} = ${formatValue(value, type)},`);
      }
    }
  }

  return lines.join('\n');
}

// Collect platform headers needed based on configuration
function collectPlatformHeaders(config: Configuration, platform: string): string[] {
  const platformPrefix = getPlatformPrefix(platform);
  const headers = new Set<string>();

  // insideUnion: when true, skip hasConfiguredChildren check (union selection implies usage)
  function walkForHeaders(obj: unknown, parent?: unknown, insideUnion: boolean = false): void {
    if (!obj || typeof obj !== 'object') return;

    const node = obj as ConfigField;

    // Check for platform_extra - extract peripheral type from struct_type
    if (node.$type === 'platform_extra' && node.$struct_type) {
      // e.g., "max_i2c_init_param" -> "i2c"
      const match = node.$struct_type.match(/^(?:max|stm32|xil)_(\w+)_init_param$/);
      if (match) {
        headers.add(`${platformPrefix}_${match[1]}.h`);
      }
    }

    // Check for platform_ops - extract peripheral type from resolved symbol
    if (node.$type === 'platform_ops' && node.$resolved?.symbol) {
      // e.g., "max_uart_ops" -> "uart"
      const match = node.$resolved.symbol.match(/^(?:max|stm32|xil)_(\w+)_ops$/);
      if (match) {
        headers.add(`${platformPrefix}_${match[1]}.h`);
      }
    }

    // Handle unions - only walk the selected member
    if (node.$type === 'union' && node.$members && node.$selector && parent) {
      const parentNode = parent as ConfigField;
      const selectorNode = parentNode[node.$selector] as ConfigField | undefined;
      if (selectorNode) {
        const selectorValue = (selectorNode.value ?? selectorNode.$default) as string;
        if (selectorValue && node.$members[selectorValue]) {
          // Mark as inside union - selected member should always be walked
          walkForHeaders(node.$members[selectorValue], node, true);
        }
      }
      return; // Don't recurse into all members
    }

    // Recurse into children
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      if (typeof value === 'object' && value !== null) {
        const childNode = value as ConfigField;
        // For struct types at top level (like spi_init/i2c_init $mutex), only walk if configured
        // But if we're inside a union selection, always walk (selection implies usage)
        if (childNode.$type === 'struct' && !insideUnion) {
          if (hasConfiguredChildren(childNode)) {
            walkForHeaders(value, node, false);
          }
        } else {
          walkForHeaders(value, node, insideUnion);
        }
      }
    }
  }

  for (const deviceConfig of Object.values(config.configuration)) {
    walkForHeaders(deviceConfig);
  }

  return Array.from(headers).sort();
}

export function generateCommonDataC(
  config: Configuration,
  device: string,
  platform: string
): string {
  const lines: string[] = [];
  const mainDeviceName = device.replace('adi,', '').replace(/-/g, '_');

  // Collect platform headers needed
  const platformHeaders = collectPlatformHeaders(config, platform);

  // Header
  lines.push(`/***************************************************************************//**
 *   @file   common_data.c
 *   @brief  Common data for ${mainDeviceName.toUpperCase()} + ${platform.toUpperCase()} demo.
 *   @author Generated by config-gui
${ADI_LICENSE}`);
  lines.push('');
  lines.push('#include "common_data.h"');
  for (const header of platformHeaders) {
    lines.push(`#include "${header}"`);
  }
  lines.push('');

  // Process all configuration entries (uart, devices, etc.)
  // Order: extra_init entries first (uart), then devices
  const entries = Object.entries(config.configuration);
  const extraInitEntries = entries.filter(([id]) => !id.startsWith('adi,'));
  const deviceEntries = entries.filter(([id]) => id.startsWith('adi,'));
  const orderedEntries = [...extraInitEntries, ...deviceEntries];

  for (const [entryId, entryConfig] of orderedEntries) {
    const deviceConfig = entryConfig as DeviceConfig;

    // Collect extra definitions for this entry
    const extraDefs = collectExtraDefs(entryId, deviceConfig, platform);

    // Generate extra structs
    for (const def of extraDefs) {
      lines.push(`/* ${def.comment} */`);
      lines.push(`struct ${def.structType} ${def.varName} = {`);
      lines.push(def.init);
      lines.push('};');
      lines.push('');
    }

    // Generate init struct
    const initStruct = generateDeviceInit(entryId, deviceConfig, extraDefs);
    lines.push(initStruct);
    lines.push('');
  }

  return lines.join('\n');
}

export function generateCommonDataH(
  config: Configuration,
  device: string,
  platform: string
): string {
  const lines: string[] = [];
  const mainDeviceName = device.replace('adi,', '').replace(/-/g, '_');
  const guardName = '__COMMON_DATA_H__';

  lines.push(`/***************************************************************************//**
 *   @file   common_data.h
 *   @brief  Common data definitions for ${mainDeviceName.toUpperCase()} + ${platform.toUpperCase()} demo.
 *   @author Generated by config-gui
${ADI_LICENSE}`);
  lines.push(`#ifndef ${guardName}`);
  lines.push(`#define ${guardName}`);
  lines.push('');
  lines.push(`#include "${mainDeviceName}.h"`);

  // Collect all headers from $sources in the configuration
  const collectedHeaders = new Set<string>();
  for (const [, entryConfig] of Object.entries(config.configuration)) {
    collectHeadersFromConfig(entryConfig as ConfigField, collectedHeaders);
  }

  // Add collected no_os_*.h headers (sorted for consistency)
  const noOsHeaders = Array.from(collectedHeaders)
    .filter(h => h.startsWith('no_os_'))
    .sort();
  for (const header of noOsHeaders) {
    lines.push(`#include "${header}"`);
  }
  lines.push('');

  // Process all configuration entries
  const entries = Object.entries(config.configuration);
  const extraInitEntries = entries.filter(([id]) => !id.startsWith('adi,'));
  const deviceEntries = entries.filter(([id]) => id.startsWith('adi,'));
  const orderedEntries = [...extraInitEntries, ...deviceEntries];

  for (const [entryId, entryConfig] of orderedEntries) {
    const deviceConfig = entryConfig as DeviceConfig;
    const entryName = entryId.replace('adi,', '').replace(/-/g, '_');
    const isExtraInit = !entryId.startsWith('adi,');
    const structType = isExtraInit ? `no_os_${entryName}_init_param` : `${entryName}_init_param`;

    // Collect extra definitions
    const extraDefs = collectExtraDefs(entryId, deviceConfig, platform);

    // Extern declarations for extra structs
    for (const def of extraDefs) {
      lines.push(`extern struct ${def.structType} ${def.varName};`);
    }

    // Extern for init struct
    lines.push(`extern struct ${structType} ${entryName}_ip;`);
  }

  lines.push('');
  lines.push(`#endif /* ${guardName} */`);

  return lines.join('\n');
}

export function generateMainC(
  config: Configuration,
  device: string,
  platform: string
): string {
  const deviceConfig = config.configuration[device] as DeviceConfig;
  if (!deviceConfig) {
    throw new Error(`Device ${device} not found in configuration`);
  }

  const deviceName = device.replace('adi,', '').replace(/-/g, '_');
  // Check if init function takes init_param by pointer (from schema $pointer attribute)
  const initParamByPointer = (deviceConfig as ConfigField).$pointer === true;
  const initParamArg = initParamByPointer ? `&${deviceName}_ip` : `${deviceName}_ip`;
  // Get init/remove function names (default to devicename_init/devicename_remove)
  const initFunction = (deviceConfig as ConfigField).$init_function as string || `${deviceName}_init`;
  const removeFunction = (deviceConfig as ConfigField).$remove_function as string || `${deviceName}_remove`;

  return `/***************************************************************************//**
 *   @file   main.c
 *   @brief  Main file for ${deviceName.toUpperCase()} + ${platform.toUpperCase()} demo.
 *   @author Generated by config-gui
 *
 *   WARNING: This file is auto-generated. Do not modify directly.
 *   To add custom application code, edit user_app.c instead.
${ADI_LICENSE}

#include "common_data.h"
#include "${deviceName}.h"
#include "no_os_print_log.h"
#include "user_app.h"

/***************************************************************************//**
 * @brief Main function - initializes UART and ${deviceName.toUpperCase()}.
 *
 * @return 0 on success, negative error code on failure.
*******************************************************************************/
int main(void)
{
	struct no_os_uart_desc *uart_desc;
	struct ${deviceName}_dev *${deviceName}_dev;
	int ret;

	/* Initialize UART for debug output */
	ret = no_os_uart_init(&uart_desc, &uart_ip);
	if (ret) {
		return ret;
	}

	no_os_uart_stdio(uart_desc);

	pr_info("${deviceName.toUpperCase()} + ${platform.toUpperCase()} Demo\\n");
	pr_info("${'='.repeat(deviceName.length + platform.length + 8)}\\n");

	/* Initialize ${deviceName.toUpperCase()} */
	ret = ${initFunction}(&${deviceName}_dev, ${initParamArg});
	if (ret) {
		pr_info("${deviceName.toUpperCase()} init failed: %d\\n", ret);
		goto error_uart;
	}

	pr_info("${deviceName.toUpperCase()} initialized successfully\\n\\n");

	/* Call user application code */
	user_app(${deviceName}_dev);

	${removeFunction}(${deviceName}_dev);

error_uart:
	no_os_uart_remove(uart_desc);
	return ret;
}
`;
}

export function generateUserAppC(device: string): string {
  const deviceName = device.replace('adi,', '').replace(/-/g, '_');

  return `/***************************************************************************//**
 *   @file   user_app.c
 *   @brief  User application code for ${deviceName.toUpperCase()} demo.
 *
 *   This file is generated once and will not be overwritten.
 *   Add your custom application code in the user_app() function below.
${ADI_LICENSE}

#include "user_app.h"
#include "${deviceName}.h"
#include "no_os_print_log.h"

/***************************************************************************//**
 * @brief User application code.
 *
 * This function is called after all peripherals are initialized.
 * Add your custom application logic here.
 *
 * @param ${deviceName}_dev - Pointer to the initialized ${deviceName.toUpperCase()} device.
*******************************************************************************/
void user_app(struct ${deviceName}_dev *${deviceName}_dev)
{
	/* Add your application code here */

}
`;
}

export function generateUserAppH(device: string): string {
  const deviceName = device.replace('adi,', '').replace(/-/g, '_');

  return `/***************************************************************************//**
 *   @file   user_app.h
 *   @brief  User application header for ${deviceName.toUpperCase()} demo.
${ADI_LICENSE}

#ifndef USER_APP_H
#define USER_APP_H

struct ${deviceName}_dev;

/***************************************************************************//**
 * @brief User application code.
 *
 * This function is called after all peripherals are initialized.
 * Add your custom application logic here.
 *
 * @param ${deviceName}_dev - Pointer to the initialized ${deviceName.toUpperCase()} device.
*******************************************************************************/
void user_app(struct ${deviceName}_dev *${deviceName}_dev);

#endif /* USER_APP_H */
`;
}

export function generateMakefile(
  platform: string,
  target: string,
  projectName: string
): string {
  return `# ${projectName} Demo Project
# Generated by config-gui

PLATFORM = ${platform}
TARGET = ${target}

# Override NO-OS path since project is in bindings_poc/ subdirectory
NO-OS = $(realpath ../../..)

include ../../../tools/scripts/generic_variables.mk

include src.mk

include ../../../tools/scripts/generic.mk
`;
}
