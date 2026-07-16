import React, { useState, useEffect, useRef } from "react";
import mqtt, { MqttClient } from "mqtt";
import {
  Wifi,
  WifiOff,
  Terminal,
  Send,
  RefreshCw,
  Settings,
  Clipboard,
  Check,
  Trash2,
  Play,
  ArrowDown,
  ArrowUp,
  Info,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LightState, MqttConfig, MqttLog } from "../types";

interface MqttPanelProps {
  state: LightState;
  onChange: (update: Partial<LightState>) => void;
}

const DEFAULT_CONFIG: MqttConfig = {
  brokerUrl: "wss://broker.emqx.io:8084/mqtt",
  clientId: `esp32_relay_${Math.random().toString(16).substring(2, 8)}`,
  username: "",
  password: "",
  topicPrefix: "esp32/relay4ch",
  publishStatus: true
};

export const MqttPanel: React.FC<MqttPanelProps> = ({ state, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<MqttConfig>(() => {
    const saved = localStorage.getItem("esp32_relay_mqtt_config");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const [client, setClient] = useState<MqttClient | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [logs, setLogs] = useState<MqttLog[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showAdvance, setShowAdvance] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Sandbox test values (updated dynamically for 4 channels)
  const [testTopic, setTestTopic] = useState("relay1/set");
  const [testPayload, setTestPayload] = useState("ON");

  const clientRef = useRef<MqttClient | null>(null);
  const lastStateRef = useRef<string>("");

  // Keep state and onChange refs updated to prevent stale closures in MQTT listeners
  const stateRef = useRef(state);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Interactive control tracking to avoid feedback loops
  interface InteractiveState {
    relay1: boolean;
    relay2: boolean;
    relay3: boolean;
    relay4: boolean;
    acTempSetting: number;
    acFanSpeed: string;
    ambientLight: number;
  }

  const getInteractiveState = (s: LightState): InteractiveState => {
    return {
      relay1: s.channels[0]?.isOn || false,
      relay2: s.channels[1]?.isOn || false,
      relay3: s.channels[2]?.isOn || false,
      relay4: s.channels[3]?.isOn || false,
      acTempSetting: s.acTempSetting,
      acFanSpeed: s.acFanSpeed,
      ambientLight: s.ambientLight
    };
  };

  const prevInteractiveStateRef = useRef<InteractiveState | null>(null);
  const lastReceivedInteractiveStateRef = useRef<InteractiveState | null>(null);

  // Initialize previous state ref on mount or when connected
  useEffect(() => {
    if (!prevInteractiveStateRef.current) {
      prevInteractiveStateRef.current = getInteractiveState(state);
    }
  }, [state]);

  // Helper to update state from an incoming MQTT message
  const updateStateFromMqtt = (updater: (prev: LightState) => Partial<LightState>) => {
    const partialUpdate = updater(stateRef.current);
    const nextState = { ...stateRef.current, ...partialUpdate };
    if (partialUpdate.channels) {
      nextState.channels = partialUpdate.channels;
    }

    const nextInteractive = getInteractiveState(nextState);

    // Update both refs immediately to prevent the publish useEffect from considering this a local user change
    lastReceivedInteractiveStateRef.current = nextInteractive;
    prevInteractiveStateRef.current = nextInteractive;

    onChangeRef.current(partialUpdate);
  };

  // Persist config
  useEffect(() => {
    localStorage.setItem("esp32_relay_mqtt_config", JSON.stringify(config));
  }, [config]);

  // Helper to update specific relay state
  const updateRelayState = (id: number, isOn: boolean) => {
    const currentChannel = stateRef.current.channels.find(ch => ch.id === id);
    if (currentChannel && currentChannel.isOn === isOn) {
      return; // No change, do not trigger onChange to prevent loop
    }
    const updated = stateRef.current.channels.map((ch) => {
      if (ch.id === id) {
        return { ...ch, isOn };
      }
      return ch;
    });
    onChangeRef.current({ channels: updated });
  };

  // Add a log entry
  const addLog = (direction: "in" | "out" | "status", topic: string, payload: string) => {
    const newLog: MqttLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      direction,
      topic,
      payload
    };
    setLogs((prev) => [...prev.slice(-99), newLog]); // Keep last 100 logs
  };

  // Connect to MQTT Broker
  const handleConnect = () => {
    if (client) {
      client.end();
      setClient(null);
      setStatus("disconnected");
      addLog("status", "system", "Koneksi diputuskan oleh pengguna");
      return;
    }

    setStatus("connecting");
    addLog("status", "system", `Menghubungkan ke ${config.brokerUrl}...`);

    try {
      // Generate a unique client ID per tab to prevent brokers from disconnecting other tabs
      const tabUniqueSuffix = Math.random().toString(36).substring(2, 6);
      const uniqueClientId = `${config.clientId}_tab_${tabUniqueSuffix}`;

      const options = {
        clientId: uniqueClientId,
        username: config.username || undefined,
        password: config.password || undefined,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000,
      };

      const mqttClient = mqtt.connect(config.brokerUrl, options);
      clientRef.current = mqttClient;

      mqttClient.on("connect", () => {
        setStatus("connected");
        setClient(mqttClient);
        addLog("status", "system", `Berhasil terhubung ke broker! Client ID: ${uniqueClientId}`);

        // Subscriptions for 4 individual relays + AC controls + ambient + bulk control + state statuses
        const subTopics = [
          `${config.topicPrefix}/relay1/set`,
          `${config.topicPrefix}/relay2/set`,
          `${config.topicPrefix}/relay3/set`,
          `${config.topicPrefix}/relay4/set`,
          `${config.topicPrefix}/relay1/status`,
          `${config.topicPrefix}/relay2/status`,
          `${config.topicPrefix}/relay3/status`,
          `${config.topicPrefix}/relay4/status`,
          `${config.topicPrefix}/ac/tempSetting/set`,
          `${config.topicPrefix}/ac/tempSetting/status`,
          `${config.topicPrefix}/ac/fanSpeed/set`,
          `${config.topicPrefix}/ac/fanSpeed/status`,
          `${config.topicPrefix}/ambient/set`,
          `${config.topicPrefix}/ambient/status`,
          `${config.topicPrefix}/relay/all/set`,
          `${config.topicPrefix}/status`
        ];

        mqttClient.subscribe(subTopics, (err) => {
          if (!err) {
            addLog("status", "system", `Berhasil subscribe ke topik kontrol & status: ${config.topicPrefix}/#`);
          } else {
            addLog("status", "system", `Gagal subscribe: ${err.message}`);
          }
        });

        // Publish initial full status with PZEM & AC parameters
        if (config.publishStatus) {
          const statusTopic = `${config.topicPrefix}/status`;
          const statusPayload = JSON.stringify({
            uptime: stateRef.current.uptime,
            espTemp: stateRef.current.espTemperature,
            vcc: stateRef.current.relayVcc,
            pzem: {
              voltage: stateRef.current.pzemVoltage,
              current: stateRef.current.pzemCurrent,
              power: stateRef.current.pzemPower,
              energy: stateRef.current.pzemEnergy,
              frequency: stateRef.current.pzemFrequency,
              pf: stateRef.current.pzemPf,
            },
            ac: {
              tempSetting: stateRef.current.acTempSetting,
              fanSpeed: stateRef.current.acFanSpeed,
              compressorState: stateRef.current.acCompressorState,
              roomTemp: stateRef.current.roomTemperature,
            },
            relays: stateRef.current.channels.map(c => ({ id: c.id, name: c.name, isOn: c.isOn }))
          });
          mqttClient.publish(statusTopic, statusPayload, { retain: true });
          addLog("out", statusTopic, statusPayload);
        }
      });

      mqttClient.on("message", (topic, message) => {
        const payload = message.toString();
        addLog("in", topic, payload);

        try {
          const cleanTopic = topic.trim();

          // 1. Check individual relay set / status
          const relayMatch = cleanTopic.match(/relay(\d)\/(set|status)$/);
          if (relayMatch) {
            const id = parseInt(relayMatch[1], 10);
            const isOn = payload.toUpperCase() === "ON" || payload === "1" || payload.toUpperCase() === "TRUE" || payload.toUpperCase() === "HIGH";

            updateStateFromMqtt((prev) => {
              const updated = prev.channels.map((ch) => {
                if (ch.id === id) {
                  return { ...ch, isOn };
                }
                return ch;
              });
              return { channels: updated };
            });
            return;
          }

          // 2. Check AC temperature setting
          if (cleanTopic.endsWith("/ac/tempSetting/set") || cleanTopic.endsWith("/ac/tempSetting/status")) {
            const temp = parseInt(payload, 10);
            if (!isNaN(temp)) {
              updateStateFromMqtt(() => ({ acTempSetting: temp }));
            }
            return;
          }

          // 3. Check AC fan speed
          if (cleanTopic.endsWith("/ac/fanSpeed/set") || cleanTopic.endsWith("/ac/fanSpeed/status")) {
            const speed = payload.trim();
            if (speed === "Low" || speed === "Medium" || speed === "High") {
              updateStateFromMqtt(() => ({ acFanSpeed: speed as "Low" | "Medium" | "High" }));
            }
            return;
          }

          // 4. Check Ambient Light setting
          if (cleanTopic.endsWith("/ambient/set") || cleanTopic.endsWith("/ambient/status")) {
            const ambient = parseInt(payload, 10);
            if (!isNaN(ambient)) {
              updateStateFromMqtt(() => ({ ambientLight: ambient }));
            }
            return;
          }

          // 5. Check bulk control: relay/all/set
          if (cleanTopic.endsWith("/relay/all/set")) {
            if (payload.includes(",")) {
              const parts = payload.split(",");
              updateStateFromMqtt((prev) => {
                const updated = prev.channels.map((ch, i) => {
                  const part = parts[i]?.trim().toUpperCase();
                  if (part) {
                    return { ...ch, isOn: part === "ON" || part === "1" || part === "TRUE" || part === "HIGH" };
                  }
                  return ch;
                });
                return { channels: updated };
              });
            } else {
              try {
                const bools = JSON.parse(payload);
                if (Array.isArray(bools)) {
                  updateStateFromMqtt((prev) => {
                    const updated = prev.channels.map((ch, i) => {
                      if (typeof bools[i] === "boolean") {
                        return { ...ch, isOn: bools[i] };
                      }
                      return ch;
                    });
                    return { channels: updated };
                  });
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
            return;
          }

          // 6. Check full /status topic
          if (cleanTopic.endsWith("/status")) {
            try {
              const telemetry = JSON.parse(payload);
              if (telemetry && typeof telemetry === "object") {
                updateStateFromMqtt((prev) => {
                  const nextChannels = prev.channels.map((ch) => {
                    const matched = telemetry.relays?.find((r: any) => r.id === ch.id);
                    if (matched) {
                      return {
                        ...ch,
                        isOn: matched.isOn,
                        power: matched.power !== undefined ? matched.power : ch.power,
                        bulbTemperature: matched.temp !== undefined ? matched.temp : ch.bulbTemperature
                      };
                    }
                    return ch;
                  });

                  return {
                    uptime: typeof telemetry.uptime === "number" ? telemetry.uptime : prev.uptime,
                    espTemperature: typeof telemetry.espTemp === "number" ? telemetry.espTemperature : prev.espTemperature,
                    relayVcc: typeof telemetry.vcc === "number" ? telemetry.relayVcc : prev.relayVcc,
                    pzemVoltage: telemetry.pzem?.voltage !== undefined ? telemetry.pzem.voltage : prev.pzemVoltage,
                    pzemCurrent: telemetry.pzem?.current !== undefined ? telemetry.pzem.current : prev.pzemCurrent,
                    pzemPower: telemetry.pzem?.power !== undefined ? telemetry.pzem.power : prev.pzemPower,
                    pzemEnergy: telemetry.pzem?.energy !== undefined ? telemetry.pzem.energy : prev.pzemEnergy,
                    pzemFrequency: telemetry.pzem?.frequency !== undefined ? telemetry.pzem.frequency : prev.pzemFrequency,
                    pzemPf: telemetry.pzem?.pf !== undefined ? telemetry.pzem.pf : prev.pzemPf,
                    acTempSetting: telemetry.ac?.tempSetting !== undefined ? telemetry.ac.tempSetting : prev.acTempSetting,
                    acFanSpeed: telemetry.ac?.fanSpeed !== undefined ? telemetry.ac.fanSpeed : prev.acFanSpeed,
                    acCompressorState: telemetry.ac?.compressorState !== undefined ? telemetry.ac.compressorState : prev.acCompressorState,
                    roomTemperature: telemetry.ac?.roomTemp !== undefined ? telemetry.ac.roomTemp : prev.roomTemperature,
                    channels: nextChannels
                  };
                });
              }
            } catch (e) {
              // Ignore parsing errors
            }
            return;
          }

        } catch (e: any) {
          addLog("status", "error", `Gagal parsing payload MQTT: ${e.message}`);
        }
      });

      mqttClient.on("error", (err) => {
        setStatus("error");
        addLog("status", "error", `Kesalahan koneksi MQTT: ${err.message}`);
      });

      mqttClient.on("close", () => {
        setStatus("disconnected");
        addLog("status", "system", "Koneksi terputus");
      });

    } catch (err: any) {
      setStatus("error");
      addLog("status", "error", `Gagal menginisiasi koneksi: ${err.message}`);
    }
  };

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end();
      }
    };
  }, []);

  // Auto-connect to MQTT on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!clientRef.current && status === "disconnected") {
        handleConnect();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Publish state updates ONLY when triggered locally by the user (filters out MQTT-received updates)
  useEffect(() => {
    if (client && status === "connected") {
      const currentInteractive = getInteractiveState(state);
      const prev = prevInteractiveStateRef.current;

      if (!prev) {
        prevInteractiveStateRef.current = currentInteractive;
        return;
      }

      const hasChanged = JSON.stringify(currentInteractive) !== JSON.stringify(prev);

      if (hasChanged) {
        // Determine if this change was triggered from an incoming MQTT message
        const isFromMqtt = lastReceivedInteractiveStateRef.current && 
                           JSON.stringify(currentInteractive) === JSON.stringify(lastReceivedInteractiveStateRef.current);

        // Always update the prev ref to match current state
        prevInteractiveStateRef.current = currentInteractive;

        if (isFromMqtt) {
          // Suppress publishing because this change was triggered by MQTT
          return;
        }

        // Trigger user control publishing (local user change!)
        setIsPublishing(true);

        // 1. Publish individual relay updates
        if (currentInteractive.relay1 !== prev.relay1) {
          client.publish(`${config.topicPrefix}/relay1/set`, currentInteractive.relay1 ? "ON" : "OFF", { qos: 0 });
          client.publish(`${config.topicPrefix}/relay1/status`, currentInteractive.relay1 ? "ON" : "OFF", { qos: 0, retain: true });
        }
        if (currentInteractive.relay2 !== prev.relay2) {
          client.publish(`${config.topicPrefix}/relay2/set`, currentInteractive.relay2 ? "ON" : "OFF", { qos: 0 });
          client.publish(`${config.topicPrefix}/relay2/status`, currentInteractive.relay2 ? "ON" : "OFF", { qos: 0, retain: true });
        }
        if (currentInteractive.relay3 !== prev.relay3) {
          client.publish(`${config.topicPrefix}/relay3/set`, currentInteractive.relay3 ? "ON" : "OFF", { qos: 0 });
          client.publish(`${config.topicPrefix}/relay3/status`, currentInteractive.relay3 ? "ON" : "OFF", { qos: 0, retain: true });
        }
        if (currentInteractive.relay4 !== prev.relay4) {
          client.publish(`${config.topicPrefix}/relay4/set`, currentInteractive.relay4 ? "ON" : "OFF", { qos: 0 });
          client.publish(`${config.topicPrefix}/relay4/status`, currentInteractive.relay4 ? "ON" : "OFF", { qos: 0, retain: true });
        }

        // 2. Publish AC setting updates
        if (currentInteractive.acTempSetting !== prev.acTempSetting) {
          client.publish(`${config.topicPrefix}/ac/tempSetting/set`, currentInteractive.acTempSetting.toString(), { qos: 0 });
          client.publish(`${config.topicPrefix}/ac/tempSetting/status`, currentInteractive.acTempSetting.toString(), { qos: 0, retain: true });
        }
        if (currentInteractive.acFanSpeed !== prev.acFanSpeed) {
          client.publish(`${config.topicPrefix}/ac/fanSpeed/set`, currentInteractive.acFanSpeed, { qos: 0 });
          client.publish(`${config.topicPrefix}/ac/fanSpeed/status`, currentInteractive.acFanSpeed, { qos: 0, retain: true });
        }

        // 3. Publish Ambient Light setting updates
        if (currentInteractive.ambientLight !== prev.ambientLight) {
          client.publish(`${config.topicPrefix}/ambient/set`, currentInteractive.ambientLight.toString(), { qos: 0 });
          client.publish(`${config.topicPrefix}/ambient/status`, currentInteractive.ambientLight.toString(), { qos: 0, retain: true });
        }

        // 4. Optionally publish the full status telemetry payload to the broker
        if (config.publishStatus) {
          const statusTopic = `${config.topicPrefix}/status`;
          const telemetryObj = {
            uptime: state.uptime,
            espTemp: state.espTemperature,
            vcc: state.relayVcc,
            pzem: {
              voltage: state.pzemVoltage,
              current: state.pzemCurrent,
              power: state.pzemPower,
              energy: state.pzemEnergy,
              frequency: state.pzemFrequency,
              pf: state.pzemPf,
            },
            ac: {
              tempSetting: state.acTempSetting,
              fanSpeed: state.acFanSpeed,
              compressorState: state.acCompressorState,
              roomTemp: state.roomTemperature,
            },
            relays: state.channels.map(c => ({ id: c.id, name: c.name, isOn: c.isOn, temp: c.bulbTemperature, power: c.power }))
          };
          const serialized = JSON.stringify(telemetryObj);
          client.publish(statusTopic, serialized, { qos: 0 });
          addLog("out", statusTopic, serialized);
        }

        const timer = setTimeout(() => setIsPublishing(false), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [state, client, status, config.publishStatus, config.topicPrefix]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Pre-configured brokers
  const selectBrokerTemplate = (url: string) => {
    setConfig(prev => ({ ...prev, brokerUrl: url }));
    addLog("status", "system", `Memilih broker template: ${url}`);
  };

  // Sandbox Test Publisher
  const handlePublishTest = () => {
    const fullTopic = `${config.topicPrefix}/${testTopic}`;
    
    // Log outbound message simulation
    addLog("out", fullTopic, testPayload);

    // If connected to broker, send it
    if (client && status === "connected") {
      client.publish(fullTopic, testPayload);
    } else {
      // Offline local injection
      addLog("status", "system", "(Simulasi Sandbox Lokal - MQTT belum tersambung)");
      setTimeout(() => {
        addLog("in", fullTopic, testPayload);
        try {
          const powerVal = testPayload.trim().toUpperCase();
          const isOn = powerVal === "ON" || powerVal === "1" || powerVal === "TRUE" || powerVal === "HIGH";

          if (testTopic.startsWith("relay") && testTopic.endsWith("/set")) {
            const match = testTopic.match(/relay(\d)\/set/);
            if (match) {
              const id = parseInt(match[1], 10);
              updateRelayState(id, isOn);
            }
          } else if (testTopic === "relay/all/set") {
            if (testPayload.includes(",")) {
              const parts = testPayload.split(",");
              const nextChannels = stateRef.current.channels.map((ch, i) => {
                const part = parts[i]?.trim().toUpperCase();
                if (part) {
                  return { ...ch, isOn: part === "ON" || part === "1" || part === "TRUE" || part === "HIGH" };
                }
                return ch;
              });
              onChangeRef.current({ channels: nextChannels });
            } else {
              const bools = JSON.parse(testPayload);
              if (Array.isArray(bools)) {
                const nextChannels = stateRef.current.channels.map((ch, i) => {
                  if (typeof bools[i] === "boolean") {
                    return { ...ch, isOn: bools[i] };
                  }
                  return ch;
                });
                onChangeRef.current({ channels: nextChannels });
              }
            }
          }
        } catch (err: any) {
          addLog("status", "error", `Gagal injeksi simulasi lokal: ${err.message}`);
        }
      }, 300);
    }
  };

  return (
    <div className="glass rounded-3xl p-6 flex flex-col gap-6 shadow-xl" id="mqtt-panel">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between cursor-pointer select-none group transition-all duration-300 ${isOpen ? "border-b border-slate-800 pb-4" : ""}`}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-display font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Integrasi Protokol MQTT (ESP32 Gateway)
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono ml-2">
              Protokol IoT
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Kendalikan relay Lampu & AC, serta kirim telemetri PZEM-004T ke broker MQTT / Home Automation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {status === "connected" && (
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            )}
            {status === "connecting" && (
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
            {status === "disconnected" && (
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600"></span>
            )}
            {status === "error" && (
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-bounce"></span>
            )}
            <span className="text-xs font-mono font-bold uppercase text-slate-300">
              {status === "connected" ? "Terhubung" : status === "connecting" ? "Menghubungkan" : status === "error" ? "Error" : "Terputus"}
            </span>
          </div>
          <div className={`p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition-all duration-300 ${isOpen ? "rotate-180 text-blue-400 border-blue-500/20" : "group-hover:text-slate-200"}`}>
            <ChevronDown size={15} />
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden flex flex-col gap-6"
          >
            {/* Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">Broker WebSocket URL</label>
            <input
              type="text"
              value={config.brokerUrl}
              onChange={(e) => setConfig({ ...config, brokerUrl: e.target.value })}
              placeholder="wss://broker.hivemq.com:8000/mqtt"
              disabled={status !== "disconnected"}
              className="px-3.5 py-2 bg-slate-950/80 border border-slate-800/85 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">Topik Prefiks (Prefix Topic)</label>
            <input
              type="text"
              value={config.topicPrefix}
              onChange={(e) => setConfig({ ...config, topicPrefix: e.target.value })}
              placeholder="esp32/relay4ch"
              disabled={status !== "disconnected"}
              className="px-3.5 py-2 bg-slate-950/80 border border-slate-800/85 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-300">Client ID unik</label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
              placeholder="esp32_relay_board"
              disabled={status !== "disconnected"}
              className="px-3.5 py-2 bg-slate-950/80 border border-slate-800/85 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
            />
          </div>

          {/* Toggle publish status */}
          <div className="flex items-center justify-between h-[52px] bg-slate-950/40 px-4 rounded-xl border border-slate-800/80">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-300">Publikasi Telemetri Otomatis</span>
              <span className="text-[10px] text-slate-500">Kirim status kelistrikan & suhu real-time ke MQTT</span>
            </div>
            <button
              onClick={() => setConfig({ ...config, publishStatus: !config.publishStatus })}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-all ${config.publishStatus ? "bg-blue-600 justify-end" : "bg-slate-800 justify-start"}`}
            >
              <span className="bg-white w-4 h-4 rounded-full shadow-md" />
            </button>
          </div>
        </div>
      </div>

      {/* Broker Presets */}
      {status === "disconnected" && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/30 p-2.5 rounded-xl border border-slate-800/40">
          <span className="text-[10px] text-slate-400 font-mono mr-1">Broker Publik:</span>
          <button
            onClick={() => selectBrokerTemplate("wss://broker.emqx.io:8084/mqtt")}
            className="px-2.5 py-1 text-[10px] bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-300 rounded-md transition-all font-mono"
          >
            EMQX (Secured SSL)
          </button>
          <button
            onClick={() => selectBrokerTemplate("wss://broker.hivemq.com:8884/mqtt")}
            className="px-2.5 py-1 text-[10px] bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-300 rounded-md transition-all font-mono"
          >
            HiveMQ (Secured)
          </button>
        </div>
      )}

      {/* Connection & Advanced buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          onClick={() => setShowAdvance(!showAdvance)}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 self-start"
        >
          <Settings size={14} />
          {showAdvance ? "Sembunyikan Kredensial" : "Tampilkan Kredensial (Opsional)"}
        </button>

        <button
          onClick={handleConnect}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-display font-medium text-xs transition-all duration-300 shadow-md ${
            status === "connected"
              ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10"
              : status === "connecting"
              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse"
              : "bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-600/20"
          }`}
        >
          {status === "connected" ? (
            <>
              <WifiOff size={15} />
              <span>Putuskan MQTT</span>
            </>
          ) : status === "connecting" ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Menghubungkan...</span>
            </>
          ) : (
            <>
              <Wifi size={15} />
              <span>Hubungkan MQTT</span>
            </>
          )}
        </button>
      </div>

      {/* Advanced Credentials */}
      {showAdvance && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 animate-fadeIn">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-400">Username (Opsional)</label>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="Username"
              disabled={status !== "disconnected"}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-400">Password (Opsional)</label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="••••••••"
              disabled={status !== "disconnected"}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
            />
          </div>
        </div>
      )}

      {/* Live Console Logs & Interactive Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-2">
        {/* Sandbox Console */}
        <div className="lg:col-span-5 flex flex-col gap-3.5 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/60">
          <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
            <div className="flex items-center gap-1.5">
              <Play size={14} className="text-blue-400" />
              <h4 className="text-xs font-semibold text-slate-200">Sandbox / Test Publisher</h4>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            Gunakan area ini untuk mensimulasikan pengiriman sinyal kontrol MQTT dari server IoT (Home Assistant) ke relay Lampu / AC.
          </p>

          <div className="flex flex-col gap-3.5 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-400">Topik Pengujian</label>
              <div className="flex gap-2">
                <select
                  value={testTopic}
                  onChange={(e) => {
                    setTestTopic(e.target.value);
                    if (e.target.value === "relay/all/set") {
                      setTestPayload("ON,ON,OFF,OFF");
                    } else {
                      setTestPayload("ON");
                    }
                  }}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-mono shrink-0"
                >
                  {state.channels.map((ch) => (
                    <option key={ch.id} value={`relay${ch.id}/set`}>
                      relay{ch.id}/set ({ch.name})
                    </option>
                  ))}
                  <option value="relay/all/set">relay/all/set (Bulk 4-Ch)</option>
                </select>
                <div className="px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[10px] text-slate-500 font-mono grow truncate flex items-center">
                  {config.topicPrefix}/
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-400">Payload</label>
              {testTopic === "relay/all/set" ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    placeholder="ON,ON,OFF,OFF"
                    className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setTestPayload("ON,ON,ON,ON")}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-[9px] font-mono font-semibold"
                      >
                        All ON (ON,ON,ON,ON)
                      </button>
                      <button
                        onClick={() => setTestPayload("OFF,OFF,OFF,OFF")}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-[9px] font-mono font-semibold"
                      >
                        All OFF (OFF,OFF,OFF,OFF)
                      </button>
                    </div>
                    <button
                      onClick={() => setTestPayload("ON,ON,OFF,OFF")}
                      className="w-full px-2 py-1 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-[9px] font-mono font-semibold"
                    >
                      Dinding/Plafon=ON, Belajar/AC=OFF (ON,ON,OFF,OFF)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {["ON", "OFF"].map((val) => (
                    <button
                      key={val}
                      onClick={() => setTestPayload(val)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                        testPayload === val
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handlePublishTest}
              className="mt-1.5 py-2 px-4 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 font-medium text-xs border border-blue-500/20 flex items-center justify-center gap-2 transition-all"
            >
              <Send size={13} />
              <span>Publish Command Uji Coba</span>
            </button>
          </div>
        </div>

        {/* Console Logs */}
        <div className="lg:col-span-7 flex flex-col gap-2.5 bg-slate-950/80 p-4 rounded-2xl border border-slate-850/80 shadow-inner overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-blue-400" />
              <h4 className="text-xs font-semibold text-slate-200">Konsol Terminal MQTT ESP32</h4>
            </div>
            <div className="flex items-center gap-2">
              {isPublishing && (
                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded font-mono animate-pulse">
                  PUBLISH
                </span>
              )}
              <button
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="p-1 hover:bg-slate-900 border border-transparent hover:border-slate-800 rounded text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-all"
                title="Bersihkan log"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-400 flex flex-col gap-1.5 scrollbar">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 text-[10px] text-center px-4">
                Terminal siap. Hubungkan ke broker untuk memantau data telemetri keluar masuk secara live.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2 border-b border-slate-900/40 pb-1 items-start">
                  <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                  {log.direction === "in" && (
                    <span className="text-indigo-400 font-bold flex items-center gap-0.5 shrink-0">
                      <ArrowDown size={10} />
                      [IN]
                    </span>
                  )}
                  {log.direction === "out" && (
                    <span className="text-emerald-400 font-bold flex items-center gap-0.5 shrink-0">
                      <ArrowUp size={10} />
                      [OUT]
                    </span>
                  )}
                  {log.direction === "status" && (
                    <span className="text-amber-500 font-bold shrink-0">[SYS]</span>
                  )}
                  <div className="flex-1 min-w-0">
                    {log.topic !== "system" && (
                      <span className="text-slate-500 font-semibold break-all">{log.topic}: </span>
                    )}
                    <span className={`break-all ${log.direction === "status" ? "text-slate-300 italic" : "text-slate-200"}`}>
                      {log.payload}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Integration Docs */}
      <div className="bg-slate-950/30 rounded-2xl p-4 border border-slate-800/40 mt-1 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-slate-200">Panduan Sinkronisasi Home Automation (4-Channel)</h4>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Topik status mempublikasikan objek JSON lengkap secara real-time yang memuat pembacaan sensor <strong>PZEM-004T</strong> (V, A, W, kWh) serta status individual dari ke-4 relay aktif.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-[11px]">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Topik & Format Kontrol (Subscribe):</span>
            <div className="flex flex-col gap-1.5 font-mono text-[9px]">
              <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded border border-slate-900">
                <span className="text-slate-400 truncate">{config.topicPrefix}/relay1/set</span>
                <span className="text-blue-400 text-[8px] shrink-0">"ON"/"OFF" (Dinding)</span>
              </div>
              <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded border border-slate-900">
                <span className="text-slate-400 truncate">{config.topicPrefix}/relay2/set</span>
                <span className="text-blue-400 text-[8px] shrink-0">"ON"/"OFF" (Plafon)</span>
              </div>
              <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded border border-slate-900">
                <span className="text-slate-400 truncate">{config.topicPrefix}/relay3/set</span>
                <span className="text-blue-400 text-[8px] shrink-0">"ON"/"OFF" (Belajar)</span>
              </div>
              <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded border border-slate-900">
                <span className="text-slate-400 truncate">{config.topicPrefix}/relay4/set</span>
                <span className="text-blue-400 text-[8px] shrink-0">"ON"/"OFF" (AC)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Metode Kontrol Terminal Mosquitto CLI:</span>
            <div className="flex flex-col gap-1.5 font-mono text-[9px] text-slate-400">
              <div className="bg-slate-950 p-2 rounded border border-slate-900 flex justify-between items-center">
                <span className="truncate select-all text-[8.5px]">mosquitto_pub -h broker.emqx.io -t "{config.topicPrefix}/relay1/set" -m "ON"</span>
                <button
                  onClick={() => handleCopy(`mosquitto_pub -h broker.emqx.io -t "${config.topicPrefix}/relay1/set" -m "ON"`, "cli-r1")}
                  className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-slate-300 ml-1 shrink-0"
                >
                  {copiedText === "cli-r1" ? <Check size={11} className="text-emerald-400" /> : <Clipboard size={11} />}
                </button>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-900 flex justify-between items-center">
                <span className="truncate select-all text-[8.5px]">mosquitto_pub -h broker.emqx.io -t "{config.topicPrefix}/relay/all/set" -m "ON,ON,OFF,OFF"</span>
                <button
                  onClick={() => handleCopy(`mosquitto_pub -h broker.emqx.io -t "${config.topicPrefix}/relay/all/set" -m "ON,ON,OFF,OFF"`, "cli-rall")}
                  className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-slate-300 ml-1 shrink-0"
                >
                  {copiedText === "cli-rall" ? <Check size={11} className="text-emerald-400" /> : <Clipboard size={11} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
