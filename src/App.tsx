import { useState, useEffect } from "react";
import { LightState, PowerDataPoint } from "./types";
import LampuSimulator from "./components/LampuSimulator";
import ControlPanel from "./components/ControlPanel";
import StatsDashboard from "./components/StatsDashboard";
import { MqttPanel } from "./components/MqttPanel";
import { GeneratorPanel } from "./components/GeneratorPanel";
import { VoiceControlPanel } from "./components/VoiceControlPanel";
import { Info, Cpu, Activity, Settings2, Mic } from "lucide-react";

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

  // Main state modifier
  const handleStateChange = (updates: Partial<LightState>) => {
    setLightState((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  // Toggle single channel (triggered by 3D mesh click or control panel toggle)
  const handleChannelClick = (channelId: number) => {
    setLightState((prev) => {
      const updatedChannels = prev.channels.map((ch) => {
        if (ch.id === channelId) {
          return { ...ch, isOn: !ch.isOn };
        }
        return ch;
      });
      return {
        ...prev,
        channels: updatedChannels,
      };
    });
  };

  // Unified Live Interval (1-second clock loop)
  useEffect(() => {
    const timer = setInterval(() => {
      setLightState((prev) => {
        const nextUptime = prev.uptime + 1;
        const nextVcc = Number((5.04 + (Math.random() * 0.04 - 0.02)).toFixed(2));

        // Get status indicators
        const isWallLampOn = prev.channels[0].isOn;
        const isCeilingLampOn = prev.channels[1].isOn;
        const isDeskLampOn = prev.channels[2].isOn;
        const isAnyLampOn = isWallLampOn || isCeilingLampOn || isDeskLampOn;
        const isAcOn = prev.channels[3].isOn;

        // --- 1. DYNAMIC AC COMPRESSOR THERMODYNAMICS ---
        let nextAcState = prev.acCompressorState;
        let acActivePower = 0;

        if (!isAcOn) {
          nextAcState = "Mati";
          acActivePower = 0;
        } else {
          // AC is turned ON
          if (prev.acCompressorState === "Mati") {
            nextAcState = "Starting";
          }

          if (prev.acCompressorState === "Starting") {
            // Settle from Startup into Running after a few seconds (25% chance per second)
            if (Math.random() < 0.25) {
              nextAcState = "Running";
            }
            acActivePower = 840.0 + Number((Math.random() * 40 - 20).toFixed(1)); // Startup surge current draw!
          } else if (prev.acCompressorState === "Running") {
            // Settle to Idle when target room temp is reached
            if (prev.roomTemperature <= prev.acTempSetting) {
              nextAcState = "Idle";
            }
            // Steady-state power depends on fan speed
            const basePower = prev.acFanSpeed === "High" ? 750 : prev.acFanSpeed === "Medium" ? 600 : 450;
            acActivePower = basePower + Number((Math.random() * 16 - 8).toFixed(1));
          } else if (prev.acCompressorState === "Idle") {
            // Turn compressor back ON if room temperature leaks back up
            if (prev.roomTemperature >= prev.acTempSetting + 1.2) {
              nextAcState = "Running";
            }
            acActivePower = 32.0 + Number((Math.random() * 4 - 2).toFixed(1)); // Only indoor unit blower fan draws power
          }
        }

        // Outdoor ambient thermal leak (warm outdoors floats room temperature to 31°C if day, 27°C if night)
        const outdoorTemp = prev.ambientLight > 50 ? 32.0 : 27.5;
        const thermalLeakRate = (outdoorTemp - prev.roomTemperature) * 0.008; // gradual warm-up
        let nextRoomTemp = prev.roomTemperature + thermalLeakRate;

        if (isAcOn) {
          let coolingRate = 0;
          if (nextAcState === "Running") {
            coolingRate = prev.acFanSpeed === "High" ? 0.07 : prev.acFanSpeed === "Medium" ? 0.04 : 0.025;
          } else if (nextAcState === "Idle") {
            coolingRate = 0.003; // residual cooling
          }
          nextRoomTemp -= coolingRate;
        }
        nextRoomTemp = Number(Math.max(16.0, Math.min(36.0, nextRoomTemp)).toFixed(2));

        // --- 2. PZEM-004T POWER CALCULATIONS ---
        const nextVoltage = Number((220.0 + (Math.random() * 2.2 - 1.1)).toFixed(1)); // 220V standard with minor grid ripples
        const wallLampPower = isWallLampOn ? prev.channels[0].power : 0;
        const ceilingLampPower = isCeilingLampOn ? prev.channels[1].power : 0;
        const deskLampPower = isDeskLampOn ? prev.channels[2].power : 0;
        const totalLampPower = wallLampPower + ceilingLampPower + deskLampPower;
        const boardStandbyPower = 1.5; // ESP32 core standby
        const totalActivePower = Number((boardStandbyPower + totalLampPower + acActivePower).toFixed(1));

        // Calculate power factor (Cos Phi)
        let nextPf = 0.95; // LED default
        if (isAcOn) {
          if (nextAcState === "Running") {
            nextPf = isAnyLampOn ? 0.83 : 0.81; // inductive load
          } else if (nextAcState === "Starting") {
            nextPf = 0.72; // inductive motor startup lock-rotor PF
          } else if (nextAcState === "Idle") {
            nextPf = isAnyLampOn ? 0.90 : 0.85; // blower fan
          }
        } else if (!isAnyLampOn) {
          nextPf = 0.55; // standby capacitor PF
        }
        nextPf = Number((nextPf + (Math.random() * 0.02 - 0.01)).toFixed(2));
        nextPf = Math.max(0.1, Math.min(1.0, nextPf));

        // Calculate Current (Arus): I = P / (V * Cos Phi)
        const nextCurrent = Number((totalActivePower / (nextVoltage * nextPf)).toFixed(3));

        // Accumulate energy: kWh = W * (1s / 3600s) / 1000
        const energyIncrement = totalActivePower / 3600000;
        const nextEnergy = Number((prev.pzemEnergy + energyIncrement).toFixed(6));
        localStorage.setItem("pzem_accumulated_energy", nextEnergy.toString());

        const nextFrequency = Number((50.0 + (Math.random() * 0.06 - 0.03)).toFixed(2));

        // --- 3. HARDWARE TEMPERATURES (THERMODYNAMICS) ---
        // ESP32 CPU warms up based on active relay coils
        const activeRelayCoils = prev.channels.filter((c) => c.isOn).length;
        const targetEspTemp = 34.0 + activeRelayCoils * 1.5;
        let nextEspTemp = prev.espTemperature;
        const espDiff = targetEspTemp - prev.espTemperature;
        if (Math.abs(espDiff) > 0.05) {
          nextEspTemp += espDiff > 0 ? 0.35 : -0.2;
        } else {
          nextEspTemp = targetEspTemp;
        }

        // Appliance Temperatures
        const nextChannels = prev.channels.map((ch) => {
          if (ch.type !== "AC") {
            // Lights (LED has cool emittance, incandescent gets very hot)
            let targetBulbTemp = 25.0;
            if (ch.isOn) {
              switch (ch.type) {
                case "LED": targetBulbTemp = 37.5; break;
                case "Neon": targetBulbTemp = 47.0; break;
                case "Incandescent": targetBulbTemp = 75.0; break;
                case "Halogen": targetBulbTemp = 85.0; break;
              }
            }
            let nextTemp = ch.bulbTemperature;
            const diff = targetBulbTemp - ch.bulbTemperature;
            if (Math.abs(diff) > 0.05) {
              const rate = ch.isOn ? 0.8 : 0.55;
              nextTemp += diff > 0 ? rate : -rate;
            } else {
              nextTemp = targetBulbTemp;
            }
            return {
              ...ch,
              bulbTemperature: Number(nextTemp.toFixed(1)),
            };
          } else {
            // AC Unit: cooling grill surfaces get cold when compressor is running!
            let targetAcTemp = 25.0;
            if (isAcOn) {
              if (nextAcState === "Running") {
                targetAcTemp = prev.acTempSetting - 6.0;
              } else if (nextAcState === "Idle") {
                targetAcTemp = prev.acTempSetting + 1.5;
              }
            }
            let nextTemp = ch.bulbTemperature;
            const diff = targetAcTemp - ch.bulbTemperature;
            if (Math.abs(diff) > 0.05) {
              const rate = isAcOn ? 0.55 : 0.35;
              nextTemp += diff > 0 ? rate : -rate;
            } else {
              nextTemp = targetAcTemp;
            }
            return {
              ...ch,
              power: Number(acActivePower.toFixed(1)),
              bulbTemperature: Number(nextTemp.toFixed(1)),
            };
          }
        });

        return {
          ...prev,
          uptime: nextUptime,
          relayVcc: Number(nextVcc.toFixed(2)),
          espTemperature: Number(nextEspTemp.toFixed(1)),
          channels: nextChannels,
          pzemVoltage: nextVoltage,
          pzemCurrent: nextCurrent,
          pzemPower: totalActivePower,
          pzemEnergy: nextEnergy,
          pzemFrequency: nextFrequency,
          pzemPf: nextPf,
          acCompressorState: nextAcState as any,
          roomTemperature: nextRoomTemp,
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
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex flex-col selection:bg-blue-500/30 selection:text-blue-200">
      {/* Decorative background glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <header className="h-16 border-b border-white/5 bg-[#0f172a]/85 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cpu className="text-white shrink-0" size={18} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
                ESP32 & PZEM-004T <span className="text-slate-500 font-light italic text-sm md:text-base">Simulator 4-Ch</span>
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
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-semibold shadow-lg shadow-red-500/5 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shrink-0"
              title="Aktifkan Kontrol Suara"
            >
              <Mic size={14} className="animate-pulse text-red-400" />
              <span>Asisten Suara</span>
            </button>

            <div className="hidden sm:flex items-center gap-6">
              <span className="text-xs text-slate-400 font-medium">Prototype Interaktif IoT Relay 4-Channel & Monitoring PZEM-004T</span>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-mono text-slate-400 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                  Sistem Online
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Core Layout container */}
      <main className="flex-1 px-4 py-6 md:p-8 max-w-7xl w-full mx-auto flex flex-col gap-8 z-10">
        
        {/* Bento Grid: 3D Scene + Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* BabylonJS Left Column */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Activity size={13} className="text-blue-400" />
                Simulasi Workbench 3D Elektronik
              </h2>
              <span className="text-xs text-slate-500">
                Didukung oleh Babylon.js Engine
              </span>
            </div>

            <LampuSimulator
              state={lightState}
              onChannelClick={handleChannelClick}
            />
          </div>

          {/* Control Panel Right Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Settings2 size={13} className="text-blue-400" />
              Antarmuka Kontrol & Switch Fisik
            </h2>
            <ControlPanel
              state={lightState}
              onChange={handleStateChange}
            />
          </div>
        </div>

        {/* Voice Control Panel Section */}
        <div className="flex flex-col gap-4 mt-2">
          <VoiceControlPanel state={lightState} onChange={handleStateChange} />
        </div>

        {/* MQTT Integration Section */}
        <div className="flex flex-col gap-4 mt-2">
          <MqttPanel state={lightState} onChange={handleStateChange} />
        </div>

        {/* Dynamic Code Generator Section */}
        <div className="flex flex-col gap-4 mt-2">
          <GeneratorPanel />
        </div>

        {/* Dashboard Section */}
        <div className="flex flex-col gap-4 mt-2">
          <StatsDashboard state={lightState} history={history} />
        </div>

        {/* Educational Information Footer Card */}
        <div className="glass rounded-3xl p-6 flex flex-col md:flex-row gap-5 items-start">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl shrink-0">
            <Info size={24} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-bold font-display text-slate-200 text-sm tracking-tight">
              Mengenai Prototype Simulasi ESP32 & Relay 4 Channel ini
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Aplikasi ini merepresentasikan visualisasi sistem kendali kelistrikan berbasis Internet of Things (IoT) yang umum digunakan pada otomasi rumah pintar (Smart Home). Di atas meja sirkuit 3D, terdapat model papan <strong>ESP32 Microcontroller</strong> yang terhubung ke modul <strong>Relay 4-Channel</strong> (sakelar elektromagnetik pengatur beban AC 220V). 
              <br className="mt-2" />
              Sistem menyimulasikan telemetri dan komponen sensor kelistrikan secara akurat:
              <span className="block mt-1 font-semibold text-slate-300">• Monitoring Daya Akurat (PZEM-004T):</span> 
              Sirkuit dilengkapi modul sensor <strong>PZEM-004T</strong> dengan CT (Current Transformer) coil berupa lingkaran hitam yang dilewati kabel beban. Sensor memantau parameter kelistrikan real-time berstandar industri: Tegangan (V), Arus Beban (A), Daya Aktif (W), Frekuensi (Hz), Faktor Daya (Cos φ), dan akumulasi total Energi (kWh). LED merah pada modul PZEM-004T berkedip seiring adanya komunikasi serial data energi ke ESP32.
              <span className="block mt-1 font-semibold text-slate-300">• Simulasi Termodinamika & AC Inverter:</span> 
              Lampu dinding, lampu plafon, dan lampu belajar memiliki emisi panas termal yang dihitung secara dinamis sesuai tipe bola lampu. Sementara itu, beban Air Conditioner (AC) disimulasikan menggunakan kurva termodinamika inverter nyata: saat pertama dinyalakan, terjadi lonjakan arus startup (surge current) hingga 840W. Setelah kompresor berjalan, AC mendinginkan ruangan secara perlahan hingga suhu yang disetel tercapai, lalu kompresor beralih ke mode "Idle" hemat energi (~32W) untuk menjaga kestabilan temperatur.
            </p>
          </div>
        </div>
      </main>

      {/* Main Footer */}
      <footer className="border-t border-white/5 bg-[#0f172a] py-6 text-slate-500 px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <p>© 2026 Prototype Simulasi ESP32 & Relay 4-Ch. Dibuat dengan React, Tailwind CSS, & Babylon.js.</p>
            <div className="flex justify-center gap-4 text-slate-400">
              <a href="#simulator-container" className="hover:text-blue-400 transition-colors">Visualisasi 3D</a>
              <span>•</span>
              <a href="#control-panel" className="hover:text-blue-400 transition-colors">Panel Kontrol</a>
              <span>•</span>
              <a href="#stats-dashboard" className="hover:text-blue-400 transition-colors">Diagnostik Daya</a>
            </div>
          </div>
          <div className="border-t border-white/5 pt-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[10px] text-slate-600 font-mono">
            <p>ESP32 GPIO State: Relay1(GPIO5 - Dinding), Relay2(GPIO18 - Plafon), Relay3(GPIO19 - Belajar), Relay4(GPIO23 - AC) • PZEM-004T COM: UART2(RX=16, TX=17)</p>
            <p>Simulation Node: JKT-02-BBYL-RELAY4CH</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
