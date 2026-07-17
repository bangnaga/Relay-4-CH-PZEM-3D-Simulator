import { useState, useEffect, useCallback } from "react";
import { LightState, PowerDataPoint } from "./types";
import LampuSimulator from "./components/LampuSimulator";
import ControlPanel from "./components/ControlPanel";
import StatsDashboard from "./components/StatsDashboard";
import { MqttPanel } from "./components/MqttPanel";
import { GeneratorPanel } from "./components/GeneratorPanel";
import { VoiceControlPanel } from "./components/VoiceControlPanel";
import { Info, Cpu, Activity, Settings2, Mic, Zap, Power, Moon, Wind, Lightbulb } from "lucide-react";

export default function App() {
  // Initialize light state with 2 channels, PZEM telemetry, and AC parameters
  const [lightState, setLightState] = useState<LightState>(() => {
    // Restore cumulative energy from localStorage if available
    const savedEnergy = localStorage.getItem("pzem_accumulated_energy");
    const initialEnergy = savedEnergy ? parseFloat(savedEnergy) : 0.0824;

    return {
      channels: [
        {
          id: 1,
          name: "Lampu Dinding",
          isOn: true,
          power: 12, // 1 x 12W Premium Wall Sconce
          color: "#FFE6D1", // Warm cozy yellow
          temperature: 3000,
          bulbTemperature: 25.0,
          type: "LED",
        },
        {
          id: 2,
          name: "Lampu Utama & Ledstrip",
          isOn: true,
          power: 40, // 16W hanging lamp + 24W LED strip in parallel
          color: "#FFFFFF", // Cool white daylight
          temperature: 6500,
          bulbTemperature: 25.0,
          type: "LED",
        },
        {
          id: 3,
          name: "Lampu Belajar Meja",
          isOn: false,
          power: 18, // 18W High-Spread Bar LED
          color: "#FFF2E6", // Warm daylight / neutral
          temperature: 4000,
          bulbTemperature: 25.0,
          type: "LED",
        },
        {
          id: 4,
          name: "Air Conditioner (AC)",
          isOn: false,
          power: 0, // dynamic
          color: "#3B82F6", // cooling blue
          temperature: 5000,
          bulbTemperature: 25.0,
          type: "AC",
        },
      ],
      ambientLight: 20, // Night ambience
      espTemperature: 34.2, // Simulated CPU temperature
      relayVcc: 5.04, // USB rail voltage
      uptime: 0,
      pzemMode: "simulation", // Starts in simulation mode on load
      // PZEM-004T Default Metrics
      pzemVoltage: 220.4,
      pzemCurrent: 0.0,
      pzemPower: 1.5, // standby board power
      pzemEnergy: initialEnergy,
      pzemFrequency: 50.0,
      pzemPf: 0.55,
      // AC default settings
      acTempSetting: 22,
      acFanSpeed: "Medium",
      acCompressorState: "Mati",
      roomTemperature: 29.5,
    };
  });

  // Pre-populate power consumption history for immediate chart rendering
  const [history, setHistory] = useState<PowerDataPoint[]>(() => {
    return Array.from({ length: 15 }, (_, i) => {
      const date = new Date(Date.now() - (15 - i) * 1000);
      const timeStr = date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      // Simulating a minor idle standby load history
      return {
        time: timeStr,
        consumption: 1.5 + (Math.random() * 0.1 - 0.05),
        saving: 100,
      };
    });
  });

  // Lifted MQTT publish handler callback state
  const [mqttPublish, setMqttPublish] = useState<((subTopic: string, payload: string, retain?: boolean) => void) | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSetMqttPublish = useCallback((publishFn: ((subTopic: string, payload: string, retain?: boolean) => void) | null) => {
    setMqttPublish(() => publishFn);
    if (publishFn) {
      showToast("Koneksi MQTT Berhasil! Alat kini dikontrol sepenuhnya melalui broker.", "success");
    } else {
      showToast("Koneksi MQTT Terputus atau belum tersambung.", "error");
    }
  }, [showToast]);

  // Main state modifier (strictly uses MQTT-driven flow unless in Simulation Mode)
  const handleStateChange = (updates: Partial<LightState>, isFromMqtt = false) => {
    if (isFromMqtt) {
      // Updates originating from a subscribed MQTT packet: update React state immediately
      setLightState((prev) => {
        const next = {
          ...prev,
          ...updates,
        };
        if (updates.channels) {
          next.channels = updates.channels;
        }
        return next;
      });
    } else if (lightState.pzemMode === "simulation" || updates.pzemMode !== undefined) {
      // In Simulation Mode or when changing PZEM mode, allow local state modification immediately
      setLightState((prev) => {
        const next = {
          ...prev,
          ...updates,
        };
        if (updates.channels) {
          next.channels = updates.channels;
        }
        return next;
      });

      // If connected to MQTT, still publish to keep physical hardware synchronized
      if (mqttPublish) {
        handleMqttUserPublish(updates);
      }
    } else if (mqttPublish) {
      // User interacted and we have active MQTT publisher: publish to MQTT broker
      handleMqttUserPublish(updates);
    } else {
      // User tried to toggle but MQTT is not connected: ignore state change & notify user
      showToast("Kontrol dinonaktifkan: Hubungkan broker MQTT terlebih dahulu!", "error");
    }
  };

  // Helper to publish user interaction events to MQTT
  const handleMqttUserPublish = (updates: Partial<LightState>) => {
    if (!mqttPublish) return;

    // 1. Relays: Check if any relay has toggled
    if (updates.channels) {
      const changedRelays: Array<{ id: number; isOn: boolean }> = [];
      updates.channels.forEach((ch, idx) => {
        const prevCh = lightState.channels[idx];
        if (prevCh && ch.isOn !== prevCh.isOn) {
          changedRelays.push({ id: ch.id, isOn: ch.isOn });
        }
      });

      if (changedRelays.length > 1) {
        // Bulk preset triggered (e.g., all_on, all_off)
        // Publish to esp32/relay4ch/relay/all/set
        const commandString = updates.channels.map(ch => ch.isOn ? "ON" : "OFF").join(",");
        mqttPublish("relay/all/set", commandString);

        // Also publish to individual set topics so subscribers watching them specifically get synchronized
        changedRelays.forEach(item => {
          mqttPublish(`relay${item.id}/set`, item.isOn ? "ON" : "OFF");
        });
      } else if (changedRelays.length === 1) {
        // Single relay toggled
        const relay = changedRelays[0];
        mqttPublish(`relay${relay.id}/set`, relay.isOn ? "ON" : "OFF");
      }

      // Check if user did visual customizations (e.g. edited bulb name, type, color in the drawer)
      const hasLocalCustomizations = updates.channels.some((ch, idx) => {
        const prevCh = lightState.channels[idx];
        return prevCh && (ch.name !== prevCh.name || ch.color !== prevCh.color || ch.type !== prevCh.type);
      });

      if (hasLocalCustomizations) {
        // Apply visual modifications immediately since they aren't real physical hardware states
        setLightState((prev) => {
          const nextChannels = prev.channels.map((ch, idx) => {
            const updateCh = updates.channels?.[idx];
            if (updateCh) {
              return {
                ...ch,
                name: updateCh.name,
                color: updateCh.color,
                type: updateCh.type,
              };
            }
            return ch;
          });
          return { ...prev, channels: nextChannels };
        });
      }
    }

    // 2. AC temperature setting change
    if (updates.acTempSetting !== undefined && updates.acTempSetting !== lightState.acTempSetting) {
      mqttPublish("ac/tempSetting/set", updates.acTempSetting.toString());
    }

    // 3. AC fan speed change
    if (updates.acFanSpeed !== undefined && updates.acFanSpeed !== lightState.acFanSpeed) {
      mqttPublish("ac/fanSpeed/set", updates.acFanSpeed);
    }

    // 4. Ambient light change
    if (updates.ambientLight !== undefined && updates.ambientLight !== lightState.ambientLight) {
      mqttPublish("ambient/set", updates.ambientLight.toString());
    }
  };

  // Toggle single channel (triggered by 3D mesh click or control panel toggle)
  const handleChannelClick = (channelId: number) => {
    const toggledChannels = lightState.channels.map((ch) => {
      if (ch.id === channelId) {
        return { ...ch, isOn: !ch.isOn };
      }
      return ch;
    });
    handleStateChange({ channels: toggledChannels });
  };

  const handleApplyPreset = (preset: "all_on" | "all_off" | "night" | "eco") => {
    let updated = [...lightState.channels];
    let ambient = lightState.ambientLight;
    let acTemp = lightState.acTempSetting;
    let acFan = lightState.acFanSpeed;

    if (preset === "all_on") {
      updated = lightState.channels.map((ch) => ({ ...ch, isOn: true }));
    } else if (preset === "all_off") {
      updated = lightState.channels.map((ch) => ({ ...ch, isOn: false }));
    } else if (preset === "night") {
      // Warm cosy wall light on, other lights off, AC active on 25°C Low Fan, dark ambient
      updated = lightState.channels.map((ch) => {
        if (ch.id === 1) return { ...ch, isOn: true, color: "#FFE6D1" }; // Wall lamp
        if (ch.id === 2) return { ...ch, isOn: false }; // Ceiling off
        if (ch.id === 3) return { ...ch, isOn: false }; // Desk off
        if (ch.id === 4) return { ...ch, isOn: true }; // AC on
        return ch;
      });
      ambient = 8;
      acTemp = 25;
      acFan = "Low";
    } else if (preset === "eco") {
      // Wall light off, Ceiling light on (LED), Desk light off, AC active on 24°C Medium Fan
      updated = lightState.channels.map((ch) => {
        if (ch.id === 1) return { ...ch, isOn: false };
        if (ch.id === 2) return { ...ch, isOn: true, type: "LED", power: 40 };
        if (ch.id === 3) return { ...ch, isOn: false };
        if (ch.id === 4) return { ...ch, isOn: true };
        return ch;
      });
      acTemp = 24;
      acFan = "Medium";
      ambient = 25;
    }

    handleStateChange({
      channels: updated,
      ambientLight: ambient,
      acTempSetting: acTemp,
      acFanSpeed: acFan,
    });
  };

  // Unified Live Interval (1-second clock loop)
  // Runs unconditionally to drive local thermodynamic simulations offline, or MQTT status reporting online.
  useEffect(() => {
    const timer = setInterval(() => {
      setLightState((prev) => {
        const nextUptime = prev.uptime + 1;

        // If in realtime mode, we only update uptime and do not calculate simulated metrics locally
        if (prev.pzemMode === "realtime") {
          return {
            ...prev,
            uptime: nextUptime,
          };
        }

        // --- SIMULATION MODE CALCULATIONS ---

        // 1. Bulb temperatures (simulate thermal thermodynamics of different bulbs)
        const nextChannels = prev.channels.map((ch) => {
          if (ch.type === "AC") return ch;
          let targetTemp = 25.0;
          let rate = 0.05;
          if (ch.isOn) {
            rate = 0.1;
            if (ch.type === "LED") targetTemp = 42.0;
            else if (ch.type === "Incandescent") targetTemp = 85.0;
            else if (ch.type === "Neon") targetTemp = 38.0;
            else if (ch.type === "Halogen") targetTemp = 68.0;
          }
          const nextTemp = ch.bulbTemperature + (targetTemp - ch.bulbTemperature) * rate;
          return { ...ch, bulbTemperature: Number(nextTemp.toFixed(1)) };
        });

        // 2. AC Compressor & Temperature simulation
        const acChannel = prev.channels.find((c) => c.type === "AC");
        let nextCompressorState = prev.acCompressorState;
        let nextRoomTemp = prev.roomTemperature;
        let acPower = 0;

        if (acChannel && acChannel.isOn) {
          if (prev.acCompressorState === "Mati") {
            nextCompressorState = "Starting";
          }

          if (nextCompressorState === "Starting") {
            acPower = 840.0; // Inrush/startup surge current W
            // 20% chance per second to transition to running (average 5 seconds)
            if (Math.random() < 0.2) {
              nextCompressorState = "Running";
            }
          } else if (nextCompressorState === "Running") {
            let basePower = 550;
            let coolRate = 0.08;
            if (prev.acFanSpeed === "Low") {
              basePower = 400;
              coolRate = 0.04;
            } else if (prev.acFanSpeed === "High") {
              basePower = 720;
              coolRate = 0.14;
            }
            // Dynamic inverter load depending on room temperature delta
            acPower = basePower + (prev.roomTemperature - prev.acTempSetting) * 15;
            acPower = Math.max(300, Math.min(840, acPower));

            // Ambient light also contributes to heat load
            const daylightHeat = (prev.ambientLight / 100) * 0.02;
            nextRoomTemp = prev.roomTemperature - coolRate + daylightHeat;

            if (nextRoomTemp < prev.acTempSetting) {
              nextRoomTemp = prev.acTempSetting;
            }

            // If temperature reached the target setting, go into idle energy-saving mode
            if (nextRoomTemp <= prev.acTempSetting + 0.1) {
              nextCompressorState = "Idle";
            }
          } else if (nextCompressorState === "Idle") {
            acPower = 32.0; // Minimal inverter standby draw
            // Warm up slowly
            const daylightHeat = (prev.ambientLight / 100) * 0.015 + 0.005;
            nextRoomTemp = prev.roomTemperature + daylightHeat;
            if (nextRoomTemp > 29.5) {
              nextRoomTemp = 29.5;
            }

            // Trigger compressor restart if temperature drifts
            if (nextRoomTemp >= prev.acTempSetting + 1.0) {
              nextCompressorState = "Starting";
            }
          }
        } else {
          nextCompressorState = "Mati";
          acPower = 0;
          // Room slowly warms back up to ambient temperature
          const daylightHeat = (prev.ambientLight / 100) * 0.025 + 0.01;
          nextRoomTemp = prev.roomTemperature + daylightHeat;
          if (nextRoomTemp > 29.5) {
            nextRoomTemp = 29.5;
          }
        }

        // 3. PZEM metrics calculations
        const standbyPower = 1.5;
        const activeLampsPower = nextChannels
          .filter((ch) => ch.type !== "AC" && ch.isOn)
          .reduce((sum, ch) => sum + ch.power, 0);

        let totalPower = standbyPower + activeLampsPower + acPower;
        // Add realistic electrical fluctuations
        if (totalPower > standbyPower) {
          totalPower += (Math.random() * 0.6 - 0.3);
        }

        const nextVoltage = 220.0 + (Math.random() * 0.6 - 0.3);
        const nextPf = totalPower <= standbyPower ? 0.55 : Math.min(0.98, 0.55 + (totalPower / 1000) * 0.4);
        const nextCurrent = totalPower / (nextVoltage * nextPf);
        const nextFrequency = 50.0 + (Math.random() * 0.04 - 0.02);

        const energyAdded = (totalPower / 1000) / 3600; // Wh to kWh added in 1s
        const nextEnergy = prev.pzemEnergy + energyAdded;

        // Persist to localStorage
        localStorage.setItem("pzem_accumulated_energy", nextEnergy.toString());

        return {
          ...prev,
          uptime: nextUptime,
          channels: nextChannels,
          acCompressorState: nextCompressorState,
          roomTemperature: Number(nextRoomTemp.toFixed(2)),
          pzemVoltage: Number(nextVoltage.toFixed(1)),
          pzemCurrent: Number(nextCurrent.toFixed(3)),
          pzemPower: Number(totalPower.toFixed(1)),
          pzemEnergy: Number(nextEnergy.toFixed(6)),
          pzemFrequency: Number(nextFrequency.toFixed(2)),
          pzemPf: Number(nextPf.toFixed(2)),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Synchronized graph logging (triggered every time uptime increments)
  useEffect(() => {
    if (lightState.uptime === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setHistory((prev) => {
      // Savings comparison: Traditional system (60W Wall + 100W Ceiling + 40W Desk + old non-inverter 1100W AC)
      let conventionalPower = 0;
      if (lightState.channels[0].isOn) conventionalPower += 60;
      if (lightState.channels[1].isOn) conventionalPower += 100;
      if (lightState.channels[2].isOn) conventionalPower += 40;
      if (lightState.channels[3].isOn) conventionalPower += 1100;

      const currentPower = lightState.pzemPower;
      const savingPercent = conventionalPower > 0
        ? Math.max(0, ((conventionalPower - currentPower) / conventionalPower) * 100)
        : 100;

      const next = [
        ...prev,
        {
          time: timeStr,
          consumption: Number(currentPower.toFixed(1)),
          saving: Number(savingPercent.toFixed(1)),
        },
      ];
      if (next.length > 15) {
        next.shift();
      }
      return next;
    });
  }, [lightState.uptime]);

  return (
    <div className="min-h-screen bg-[#0c0d12] text-[#f8fafc] flex flex-col selection:bg-[#ff6d5a]/30 selection:text-[#ff897a]">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 animate-bounce-short">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2 text-xs font-semibold backdrop-blur-md ${
            toast.type === "success" 
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
              : toast.type === "error" 
                ? "bg-rose-500/15 text-rose-400 border-rose-500/25" 
                : "bg-blue-500/15 text-blue-400 border-blue-500/25"
          }`}>
            <span className="h-2 w-2 rounded-full bg-current animate-pulse shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Decorative background glows (n8n-style coral/violet warm atmosphere) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#ff6d5a]/3 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-indigo-500/3 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <header className="h-16 border-b border-white/5 bg-[#0c0d12]/90 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#ff6d5a] rounded-lg flex items-center justify-center shadow-lg shadow-[#ff6d5a]/20">
              <Cpu className="text-white shrink-0" size={18} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
                ESP32 & PZEM-004T <span className="text-slate-500 font-light italic text-sm md:text-base">Sistem Kontrol 4-Ch</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                window.dispatchEvent(new Event("trigger-voice-listen"));
                const panel = document.getElementById("voice-control-panel");
                if (panel) {
                  panel.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#ff6d5a]/10 hover:bg-[#ff6d5a]/20 text-[#ff6d5a] hover:text-[#ff897a] border border-[#ff6d5a]/20 hover:border-[#ff6d5a]/30 rounded-xl text-xs font-semibold shadow-lg shadow-[#ff6d5a]/5 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shrink-0"
              title="Aktifkan Kontrol Suara"
            >
              <Mic size={14} className="animate-pulse text-[#ff6d5a]" />
              <span>Asisten Suara</span>
            </button>

            <div className="hidden sm:flex items-center gap-6">
              <span className="text-xs text-slate-400 font-medium">Prototype Interaktif IoT Relay 4-Channel & Monitoring PZEM-004T</span>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-mono text-slate-400 bg-[#1e202b] border border-white/5 px-2.5 py-1 rounded-lg">
                  Sistem Online
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Core Layout container */}
      <main className="flex-1 px-4 py-6 max-w-[1600px] w-full mx-auto flex flex-col gap-6 z-10">
        
        {/* FULL-WIDTH TOP SECTION: 3D Simulator Workbench */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={12} className="text-[#ff6d5a] animate-pulse" />
              Visualisasi Sirkuit IoT 3D & Status Relay Elektromagnetik
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">Babylon.js 3D Engine v6 • Layar Penuh</span>
          </div>

          {/* 3D Canvas Box - Fullwidth on desktop with high-tech responsive frame */}
          <div className="w-full h-[320px] sm:h-[420px] md:h-[500px] lg:h-[560px] min-h-[250px] shrink-0">
            <LampuSimulator
              state={lightState}
              onChannelClick={handleChannelClick}
            />
          </div>
        </div>

        {/* 2-COLUMN BOTTOM SECTION: Controls & Telemetry */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN (Control Panel & Macro Skenario): 7/12 width */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* 1. MQTT Protocols Gateway */}
            <MqttPanel 
              state={lightState} 
              onChange={(updates) => handleStateChange(updates, true)} 
              onClientReady={handleSetMqttPublish}
            />

            {/* 2. Pusat Kendali Cepat (Switches, AC Hub, macros) */}
            <div className="glass rounded-3xl p-5 flex flex-col gap-4 border border-white/5 bg-[#10121a]/85 shadow-2xl relative overflow-hidden transition-all duration-300">
              {/* Subtle background grid pattern */}
              <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.012)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
              
              {/* Header of Quick Access Panel */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#ff6d5a]/10 border border-[#ff6d5a]/20 text-[#ff6d5a] rounded-xl shrink-0">
                    <Zap size={14} className="animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold font-display text-white tracking-tight flex items-center gap-2">
                      Pusat Kendali Cepat <span className="text-[9px] bg-[#ff6d5a]/10 text-[#ff6d5a] border border-[#ff6d5a]/20 px-1.5 py-0.5 rounded-full font-mono font-semibold">Ready-On-Load</span>
                    </h2>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      Akses sakelar relay, pengaturan AC, dan skenario makro utama langsung di layar utama
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 self-start sm:self-center">
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 bg-slate-900/50 border border-white/5 px-2.5 py-1 rounded-xl">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      {lightState.channels.filter(c => c.isOn).length} Alat Aktif
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-slate-500">Beban:</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/15">
                      {lightState.pzemPower.toFixed(1)} W
                    </span>
                  </div>
                </div>
              </div>

              {/* Redesigned Bento Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                {/* Column 1: Lighting Switch Hub (5/12 column) */}
                <div className="md:col-span-5 flex flex-col gap-3 bg-slate-950/20 border border-white/5 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Sakelar Lampu (Relay 1-3)
                    </span>
                    <span className="text-[8px] font-mono text-slate-500">GPIO 5, 18, 19</span>
                  </div>
                  
                  <div className="flex flex-col gap-2 h-full justify-between">
                    {lightState.channels.filter(ch => ch.type !== "AC").map((ch) => {
                      return (
                        <div
                          key={ch.id}
                          onClick={() => handleChannelClick(ch.id)}
                          className={`group relative flex items-center justify-between p-2 rounded-xl border transition-all duration-300 cursor-pointer select-none ${
                            ch.isOn
                              ? "bg-[#141622]/90 border-[#ff6d5a]/45 shadow-md shadow-[#ff6d5a]/5"
                              : "bg-[#090a0f]/40 border-white/5 hover:border-slate-800 hover:bg-[#0c0d15]/50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Bulb Mini Icon */}
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-300 shrink-0"
                              style={{
                                backgroundColor: ch.isOn ? `${ch.color || "#ff6d5a"}15` : "rgba(15, 23, 42, 0.4)",
                                borderColor: ch.isOn ? (ch.color || "#ff6d5a") : "rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              <Lightbulb
                                size={12}
                                style={{ color: ch.isOn ? (ch.color || "#ff6d5a") : "rgb(100, 116, 139)" }}
                                className={ch.isOn ? "animate-pulse" : ""}
                              />
                            </div>
                            <div className="flex flex-col min-w-0 text-left">
                              <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors truncate">
                                {ch.name}
                              </span>
                              <span className="text-[8px] font-mono text-slate-500">
                                GPIO{ch.id === 1 ? "5" : ch.id === 2 ? "18" : "19"} • {ch.isOn ? `${ch.power}W` : "0W"}
                              </span>
                            </div>
                          </div>

                          {/* Power Status Switch */}
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] font-mono font-bold ${ch.isOn ? "text-emerald-400" : "text-slate-500"}`}>
                              {ch.isOn ? "ON" : "OFF"}
                            </span>
                            <div className={`w-8 h-4.5 flex items-center rounded-full p-0.5 transition-all duration-300 ${
                              ch.isOn ? "bg-[#ff6d5a]" : "bg-slate-800"
                            }`}>
                              <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform duration-300 ${
                                ch.isOn ? "translate-x-3.5" : "translate-x-0"
                              }`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Intelligent Climate AC Hub (4/12 column) */}
                <div className={`md:col-span-4 flex flex-col gap-3 border rounded-2xl p-3.5 transition-all duration-300 ${
                  lightState.channels[3].isOn 
                    ? "border-blue-500/25 bg-blue-500/[0.02]" 
                    : "border-white/5 bg-slate-950/20"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Pengatur AC (Relay 4)
                    </span>
                    <span className="text-[8px] font-mono text-slate-500">GPIO 23</span>
                  </div>

                  <div className="flex flex-col gap-2 h-full justify-between">
                    {/* AC Header Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                          lightState.channels[3].isOn ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-slate-900 border-white/5 text-slate-500"
                        }`}>
                          <Wind size={12} className={lightState.channels[3].isOn ? "animate-spin" : ""} style={{ animationDuration: '6s' }} />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <span className="text-xs font-bold text-slate-200 truncate">AC Inverter</span>
                          <span className="text-[8px] font-mono text-slate-500">
                            {lightState.channels[3].isOn ? `${lightState.roomTemperature.toFixed(1)}°C` : "AC Siaga"}
                          </span>
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      <button
                        onClick={() => handleChannelClick(4)}
                        className={`w-8 h-4.5 flex items-center rounded-full p-0.5 transition-all duration-300 cursor-pointer ${
                          lightState.channels[3].isOn ? "bg-blue-500" : "bg-slate-800"
                        }`}
                      >
                        <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform duration-300 ${
                          lightState.channels[3].isOn ? "translate-x-3.5" : "translate-x-0"
                        }`} />
                      </button>
                    </div>

                    {/* Thermostat Controls */}
                    <div className={`flex items-center justify-between bg-slate-950/40 border border-white/5 p-1 rounded-xl transition-all duration-300 ${
                      lightState.channels[3].isOn ? "opacity-100" : "opacity-40"
                    }`}>
                      <button
                        disabled={!lightState.channels[3].isOn}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextTemp = Math.max(16, lightState.acTempSetting - 1);
                          handleStateChange({ acTempSetting: nextTemp });
                        }}
                        className="w-6 h-6 bg-[#141622] hover:bg-slate-800 text-slate-300 rounded-lg font-bold text-xs flex items-center justify-center transition-all border border-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        -
                      </button>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold text-slate-500 leading-none uppercase">Atur</span>
                        <span className="text-xs font-mono font-bold text-blue-400 leading-none mt-0.5">
                          {lightState.acTempSetting}°C
                        </span>
                      </div>
                      <button
                        disabled={!lightState.channels[3].isOn}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextTemp = Math.min(30, lightState.acTempSetting + 1);
                          handleStateChange({ acTempSetting: nextTemp });
                        }}
                        className="w-6 h-6 bg-[#141622] hover:bg-slate-800 text-slate-300 rounded-lg font-bold text-xs flex items-center justify-center transition-all border border-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>

                    {/* Fan Speed Quick Selector */}
                    <div className={`flex flex-col gap-1 transition-all duration-300 ${
                      lightState.channels[3].isOn ? "opacity-100" : "opacity-40"
                    }`}>
                      <div className="grid grid-cols-3 gap-1 bg-slate-950/50 p-0.5 rounded-lg border border-white/5">
                        {(["Low", "Medium", "High"] as const).map((speed) => (
                          <button
                            key={speed}
                            disabled={!lightState.channels[3].isOn}
                            onClick={() => handleStateChange({ acFanSpeed: speed })}
                            className={`py-1 text-[8px] font-bold rounded transition-all duration-200 cursor-pointer ${
                              lightState.acFanSpeed === speed && lightState.channels[3].isOn
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/25 shadow-md"
                                : "text-slate-400 hover:text-slate-200 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                            }`}
                          >
                            {speed === "Low" ? "Low" : speed === "Medium" ? "Med" : "High"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Automation Macros (3/12 column) */}
                <div className="md:col-span-3 flex flex-col gap-3 bg-slate-950/20 border border-white/5 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Skenario Makro
                    </span>
                    <span className="text-[8px] font-mono text-slate-500">Satu Klik</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 h-full">
                    <button
                      onClick={() => handleApplyPreset("all_on")}
                      className="py-2.5 px-1 bg-[#0c0d12] hover:bg-[#141622] border border-white/5 hover:border-emerald-500/25 text-[9px] font-bold text-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer shadow-md text-center group"
                    >
                      <Power size={11} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span>Semua ON</span>
                    </button>
                    <button
                      onClick={() => handleApplyPreset("all_off")}
                      className="py-2.5 px-1 bg-[#0c0d12] hover:bg-[#141622] border border-white/5 hover:border-rose-500/25 text-[9px] font-bold text-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer shadow-md text-center group"
                    >
                      <Power size={11} className="text-rose-400 group-hover:scale-110 transition-transform" />
                      <span>Semua OFF</span>
                    </button>
                    <button
                      onClick={() => handleApplyPreset("night")}
                      className="py-2.5 px-1 bg-[#0c0d12] hover:bg-[#141622] border border-white/5 hover:border-indigo-500/25 text-[9px] font-bold text-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer shadow-md text-center group"
                    >
                      <Moon size={11} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                      <span>Tidur</span>
                    </button>
                    <button
                      onClick={() => handleApplyPreset("eco")}
                      className="py-2.5 px-1 bg-[#0c0d12] hover:bg-[#141622] border border-white/5 hover:border-amber-500/25 text-[9px] font-bold text-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer shadow-md text-center group"
                    >
                      <Wind size={11} className="text-amber-400 animate-spin group-hover:scale-110 transition-transform" style={{ animationDuration: '6s' }} />
                      <span>Eco</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Detailed Customizer and Physical Board Control */}
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings2 size={12} className="text-[#ff6d5a]" />
                  Kustomisasi Lampu & Switch Fisik
                </h2>
              </div>
              <ControlPanel
                state={lightState}
                onChange={handleStateChange}
              />
            </div>
          </div>

          {/* RIGHT COLUMN (Telemetry & Secondary Tools): 5/12 width */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* 1. Real-time PZEM-004T Industrial Telemetry Dashboard */}
            <div className="flex flex-col gap-3 animate-fade-in">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                <Activity size={12} className="text-[#ff6d5a]" />
                Diagnostik Telemetri PZEM-004T
              </h2>
              <StatsDashboard state={lightState} history={history} onChange={handleStateChange} />
            </div>

            {/* 2. Voice Control Panel Section */}
            <VoiceControlPanel state={lightState} onChange={handleStateChange} />

            {/* 3. Dynamic Code Generator Section */}
            <GeneratorPanel />

            {/* 4. Educational Information Card */}
            <div className="glass rounded-3xl p-6 flex flex-col md:flex-row gap-5 items-start relative overflow-hidden bg-[radial-gradient(#1e202b_1px,transparent_1px)] [background-size:16px_16px] border-l-4 border-l-[#ff6d5a] shrink-0">
              <div className="p-3 bg-[#ff6d5a]/10 border border-[#ff6d5a]/20 text-[#ff6d5a] rounded-2xl shrink-0">
                <Info size={20} />
              </div>
              <div className="flex flex-col gap-2 relative z-10 text-left">
                <h3 className="font-bold font-display text-slate-200 text-xs tracking-tight uppercase">
                  Mengenai Prototype Sistem Kontrol ESP32 & Relay 4 Channel
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Aplikasi ini merepresentasikan visualisasi sistem kendali kelistrikan berbasis Internet of Things (IoT) yang umum digunakan pada otomasi rumah pintar (Smart Home). Di atas meja sirkuit 3D, terdapat model papan <strong>ESP32 Microcontroller</strong> yang terhubung ke model <strong>Relay 4-Channel</strong> (sakelar elektromagnetik pengatur beban AC 220V). 
                  <br className="mt-2" />
                  Sistem menampilkan telemetri dan komponen sensor kelistrikan secara akurat:
                  <span className="block mt-1 font-semibold text-slate-300">• Monitoring Daya Akurat (PZEM-004T):</span> 
                  Sirkuit dilengkapi modul sensor <strong>PZEM-004T</strong> dengan CT (Current Transformer) coil berupa lingkaran hitam yang dilewati kabel beban. Sensor memantau parameter kelistrikan real-time berstandar industri: Tegangan (V), Arus Beban (A), Daya Aktif (W), Frekuensi (Hz), Faktor Daya (Cos φ), dan akumulasi total Energi (kWh). LED merah pada modul PZEM-004T berkedip seiring adanya komunikasi serial data energi ke ESP32.
                  <span className="block mt-1 font-semibold text-slate-300">• Termodinamika & AC Inverter:</span> 
                  Lampu dinding, lampu plafon, dan lampu belajar memiliki emisi panas termal yang dihitung secara dinamis sesuai tipe bola lampu. Sementara itu, beban Air Conditioner (AC) dikalkulasikan menggunakan kurva termodinamika inverter nyata: saat pertama dinyalakan, terjadi lonjakan arus startup (surge current) hingga 840W. Setelah kompresor berjalan, AC mendinginkan ruangan secara perlahan hingga suhu yang disetel tercapai, lalu kompresor beralih ke mode "Idle" hemat energi (~32W) untuk menjaga kestabilan temperatur.
                </p>
              </div>
            </div>

            {/* 5. Main Footer */}
            <footer className="border-t border-white/5 bg-[#08090d]/30 py-6 text-slate-500 text-left mt-2 rounded-2xl p-4">
              <div className="flex flex-col gap-4">
                
                {/* Author attribution info beautifully presented in n8n styled row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ff6d5a] shadow-lg shadow-[#ff6d5a]/50 animate-pulse" />
                    <p className="text-[10px] font-bold tracking-wide uppercase text-slate-300 font-display">
                      Informasi Pengembang
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-2 text-[10px]">
                    <span className="bg-[#1e202b] text-slate-200 border border-white/5 px-2.5 py-1 rounded-xl font-medium">
                      Dibuat Oleh: <strong className="text-white">Ucok, S.Kom., MT</strong>
                    </span>
                    <a 
                      href="mailto:eailsinaga@gmail.com" 
                      className="text-slate-400 hover:text-[#ff6d5a] transition-all duration-300 bg-[#ff6d5a]/5 hover:bg-[#ff6d5a]/10 border border-[#ff6d5a]/10 hover:border-[#ff6d5a]/20 px-2.5 py-1 rounded-xl font-mono flex items-center gap-1"
                    >
                      eailsinaga@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px]">
                  <p>© 2026 Prototype Sistem Kontrol ESP32 & Relay 4-Ch. Dibuat dengan React, Tailwind CSS, & Babylon.js.</p>
                  <div className="flex justify-center gap-3 text-slate-400">
                    <a href="#simulator-container" className="hover:text-[#ff6d5a] transition-colors">Visualisasi 3D</a>
                    <span>•</span>
                    <a href="#control-panel" className="hover:text-[#ff6d5a] transition-colors">Panel Kontrol</a>
                    <span>•</span>
                    <a href="#stats-dashboard" className="hover:text-[#ff6d5a] transition-colors">Diagnostik Daya</a>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-[9px] text-slate-600 font-mono">
                  <p>ESP32 GPIO State: Relay1(GPIO5 - Dinding), Relay2(GPIO18 - Plafon), Relay3(GPIO19 - Belajar), Relay4(GPIO23 - AC) • PZEM-004T COM: UART2(RX=16, TX=17)</p>
                  <p>Device ID: ESP32-MQTT-RELAY4CH</p>
                </div>
              </div>
            </footer>

          </div>

        </div>

      </main>
    </div>
  );
}
