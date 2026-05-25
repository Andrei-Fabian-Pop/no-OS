export interface ConfigField {
  $type?: string;
  $description?: string;
  $required?: boolean;
  $default?: unknown;
  $values?: string[];
  $enum_type?: string;
  $struct_type?: string;
  $selector?: string;
  $members?: Record<string, Record<string, ConfigField>>;
  $resolved?: {
    symbol: string;
  };
  $sources?: {
    headers?: string[];
    sources?: string[];
  };
  // Array support
  $size?: number;
  $element_type?: string;
  $elements?: ConfigField[];
  value?: unknown;
  [key: string]: unknown;
}

export interface DeviceConfig {
  $sources?: {
    headers?: string[];
    sources?: string[];
  };
  [key: string]: ConfigField | unknown;
}

export interface Configuration {
  configuration: Record<string, DeviceConfig>;
  makefile: {
    $platform: string;
    $prefix_map: Record<string, string | null>;
    srcs: Record<string, string[]>;
    incs: Record<string, string[]>;
  };
}

export interface DeviceInfo {
  id: string;
  name: string;
  description: string;
}

export interface PlatformInfo {
  id: string;
  name: string;
  target: string;
}

export const DEVICES: DeviceInfo[] = [
  { id: 'adi,adxl355', name: 'ADXL355', description: '3-axis Accelerometer' },
  { id: 'adi,ad5592r', name: 'AD5592R', description: '8-channel ADC/DAC' },
  { id: 'adi,adt7420', name: 'ADT7420', description: 'Temperature Sensor' },
  { id: 'adi,ad7124', name: 'AD7124', description: '24-bit ADC' },
];

export const PLATFORMS: PlatformInfo[] = [
  { id: 'maxim', name: 'Maxim', target: 'max32690' },
  { id: 'stm32', name: 'STM32', target: 'stm32' },
];
