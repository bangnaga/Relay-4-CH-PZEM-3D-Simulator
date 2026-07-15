export interface RelayChannel {
  id: number;
  name: string;
  isOn: boolean;
  power: number; // Wattage rating
  color: string; // Hex color string for custom colored bulbs
  temperature: number; // Kelvin temperature
  bulbTemperature: number; // Simulated heat in Celsius
  type: "LED" | "Incandescent" | "Neon" | "Halogen" | "AC";
}

export interface LightState {
  channels: RelayChannel[];
  ambientLight: number; // 0 to 100 (Day/Night ambient slider)
  espTemperature: number; // Simulated ESP32 CPU Temperature
  relayVcc: number; // Simulated VCC voltage (e.g., 5.0V)
  uptime: number; // Simulated device uptime in seconds
  // PZEM-004T sensor real-time measurements
  pzemVoltage: number;    // V
  pzemCurrent: number;    // A
  pzemPower: number;      // W
  pzemEnergy: number;     // kWh
  pzemFrequency: number;  // Hz
  pzemPf: number;         // Power Factor (Cos Phi)
  // AC Specific metrics
  acTempSetting: number;  // °C
  acFanSpeed: "Low" | "Medium" | "High";
  acCompressorState: "Mati" | "Starting" | "Running" | "Idle";
  roomTemperature: number; // °C
}

export interface Preset {
  id: string;
  name: string;
  channelStates: boolean[]; // [ch1, ch2, ch3, ch4]
  description: string;
}

export interface PowerDataPoint {
  time: string;
  consumption: number; // in Watts
  saving: number; // in %
}

export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  username: string;
  password?: string;
  topicPrefix: string;
  publishStatus: boolean;
}

export interface MqttLog {
  id: string;
  timestamp: string;
  direction: "in" | "out" | "status";
  topic: string;
  payload: string;
}
