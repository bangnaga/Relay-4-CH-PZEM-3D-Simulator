import { useState } from "react";
import { LightState, RelayChannel } from "../types";
import {
  Power,
  Sun,
  Thermometer,
  Cpu,
  Sliders,
  Moon,
  CloudSun,
  Zap,
  Tag,
  Palette,
  Lightbulb,
  Fan,
  Wind,
} from "lucide-react";

interface ControlPanelProps {
  state: LightState;
  onChange: (updates: Partial<LightState>) => void;
}

const BULB_TYPES = [
  { type: "LED", defaultPower: 12, label: "LED Hemat Energi" },
  { type: "Incandescent", defaultPower: 60, label: "Lampu Pijar Klasik" },
  { type: "Neon", defaultPower: 18, label: "Neon / CFL" },
  { type: "Halogen", defaultPower: 35, label: "Halogen Sorot" },
] as const;

const QUICK_COLORS = [
  { name: "Warm Cozy", hex: "#FFE6D1" },
  { name: "Daylight", hex: "#FFFFFF" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Ice Blue", hex: "#93C5FD" },
  { name: "Emerald", hex: "#34D399" },
  { name: "Rose", hex: "#F87171" },
];

export default function ControlPanel({ state, onChange }: ControlPanelProps) {
  const [editingLampId, setEditingLampId] = useState<number | null>(null);

  const handleToggleChannel = (id: number) => {
    const updated = state.channels.map((ch) => {
      if (ch.id === id) {
        return { ...ch, isOn: !ch.isOn };
      }
      return ch;
    });
    onChange({ channels: updated });
  };

  const handleUpdateLamp = (id: number, updates: Partial<RelayChannel>) => {
    const updated = state.channels.map((ch) => {
      if (ch.id === id) {
        const merged = { ...ch, ...updates };
        if (updates.type) {
          const typeConfig = BULB_TYPES.find((t) => t.type === updates.type);
          if (typeConfig) {
            merged.power = typeConfig.defaultPower;
          }
        }
        return merged;
      }
      return ch;
    });
    onChange({ channels: updated });
  };

  const handleApplyPreset = (preset: "all_on" | "all_off" | "night" | "eco") => {
    let updated = [...state.channels];
    let ambient = state.ambientLight;
    let acTemp = state.acTempSetting;
    let acFan = state.acFanSpeed;

    if (preset === "all_on") {
      updated = state.channels.map((ch) => ({ ...ch, isOn: true }));
    } else if (preset === "all_off") {
      updated = state.channels.map((ch) => ({ ...ch, isOn: false }));
    } else if (preset === "night") {
      // Warm cosy wall light on, other lights off, AC active on 25°C Low Fan, dark ambient
      updated = state.channels.map((ch) => {
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
      updated = state.channels.map((ch) => {
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

    onChange({
      channels: updated,
      ambientLight: ambient,
      acTempSetting: acTemp,
      acFanSpeed: acFan,
    });
  };

  return (
    <div className="glass rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xl" id="control-panel">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-slate-800 pb-5">
        <h2 className="text-xl font-display font-bold text-slate-100 tracking-tight flex items-center gap-2">
          <Sliders className="text-[#ff6d5a] shrink-0" size={22} />
          Panel Kontrol ESP32 & Relay 4-Ch
        </h2>
        <p className="text-xs text-slate-400">
          Kendalikan 4 channel relay listrik secara terpisah, ubah tipe lampu, set temperatur AC, serta pantau telemetri ESP32
        </p>
      </div>

      {/* Relays Section */}
      <div className="flex flex-col gap-4">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Sirkuit Sakelar Relay ESP32 (GPIO)
        </span>

        {/* Dynamic Light Channels */}
        {state.channels.filter((ch) => ch.type !== "AC").map((ch) => {
          const isEditing = editingLampId === ch.id;
          return (
            <div
              key={ch.id}
              className={`border rounded-2xl p-4 transition-all duration-300 ${
                ch.isOn
                  ? "bg-[#13141a]/60 border-[#ff6d5a]/25 shadow-lg shadow-[#ff6d5a]/[0.02]"
                  : "bg-slate-950/40 border-slate-800/80"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Glowing bulb icon */}
                  <div
                    onClick={() => handleToggleChannel(ch.id)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all shrink-0"
                    style={{
                      backgroundColor: ch.isOn ? `${ch.color}15` : "rgba(15, 23, 42, 0.4)",
                      borderColor: ch.isOn ? ch.color : "rgba(255, 255, 255, 0.08)",
                      boxShadow: ch.isOn ? `0 0 10px ${ch.color}40` : "none",
                    }}
                  >
                    <Lightbulb
                      size={18}
                      style={{ color: ch.isOn ? ch.color : "rgb(100, 116, 139)" }}
                      className={ch.isOn ? "animate-pulse" : ""}
                    />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/60">
                        RELAY {ch.id}
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {ch.id === 1 ? "GPIO 5" : ch.id === 2 ? "GPIO 18" : "GPIO 19"}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-100 mt-1 truncate">
                      {ch.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setEditingLampId(isEditing ? null : ch.id)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
                      isEditing
                        ? "bg-[#ff6d5a]/10 border-[#ff6d5a]/30 text-[#ff6d5a]"
                        : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {isEditing ? "Simpan" : "Ubah"}
                  </button>

                  <button
                    onClick={() => handleToggleChannel(ch.id)}
                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 ${
                      ch.isOn ? "bg-[#ff6d5a] justify-end" : "bg-slate-800 justify-start"
                    }`}
                    id={`relay-toggle-${ch.id}`}
                  >
                    <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                  </button>
                </div>
              </div>

              {/* Quick Lamp Metrics */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/40 text-[10px] text-slate-400">
                <div>
                  <span className="text-slate-500">Daya Listrik:</span>
                  <p className="font-mono font-bold text-slate-200 mt-0.5">
                    {ch.isOn ? ch.power : 0}W <span className="font-normal text-slate-500">({ch.type})</span>
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Cahaya Warna:</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: ch.color }} />
                    <span className="font-mono text-slate-300 font-bold uppercase">{ch.color}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Suhu Lampu:</span>
                  <p
                    className={`font-mono font-bold mt-0.5 ${
                      ch.bulbTemperature > 45 ? "text-rose-400 animate-pulse" : "text-slate-300"
                    }`}
                  >
                    {ch.bulbTemperature.toFixed(1)}°C
                  </p>
                </div>
              </div>

              {/* Editing Drawer */}
              {isEditing && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-3.5 animate-fadeIn">
                  {/* Change name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Tag size={11} /> Nama Beban
                    </label>
                    <input
                      type="text"
                      value={ch.name}
                      onChange={(e) => handleUpdateLamp(ch.id, { name: e.target.value })}
                      className="px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-[#ff6d5a]"
                    />
                  </div>

                  {/* Type selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Zap size={11} /> Tipe & Konsumsi Daya Lampu
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {BULB_TYPES.map((t) => (
                        <button
                          key={t.type}
                          type="button"
                          onClick={() => handleUpdateLamp(ch.id, { type: t.type })}
                          className={`px-3 py-2 rounded-xl border text-[10px] font-medium flex flex-col items-start gap-0.5 transition-all ${
                            ch.type === t.type
                              ? "bg-slate-800 border-[#ff6d5a]/50 text-[#ff6d5a]"
                              : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <span className="font-bold">{t.type}</span>
                          <span className="text-[9px] text-slate-500 leading-none">
                            {t.label} ({t.defaultPower}W)
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color selection */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Palette size={11} /> Warna Cahaya (Simulasi 3D)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={ch.color}
                        onChange={(e) => handleUpdateLamp(ch.id, { color: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 shrink-0"
                      />
                      <div className="flex gap-1.5 overflow-x-auto pb-1 grow">
                        {QUICK_COLORS.map((qc) => (
                          <button
                            key={qc.hex}
                            type="button"
                            onClick={() => handleUpdateLamp(ch.id, { color: qc.hex })}
                            className="w-6 h-6 rounded-full border border-white/10 shrink-0 hover:scale-110 transition-transform"
                            style={{ backgroundColor: qc.hex }}
                            title={qc.name}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* AC Channel (specifically render AC layout for type === AC, id === 4) */}
        {state.channels.filter((ch) => ch.type === "AC").map((acCh) => (
          <div
            key={acCh.id}
            className={`border rounded-2xl p-4 transition-all duration-300 ${
              acCh.isOn
                ? "bg-[#13141a]/60 border-[#ff6d5a]/25 shadow-lg shadow-[#ff6d5a]/[0.02]"
                : "bg-slate-950/40 border-slate-800/80"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Spinning/pulsing fan icon representing AC */}
                <div
                  onClick={() => handleToggleChannel(acCh.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer transition-all shrink-0 ${
                    acCh.isOn ? "bg-[#ff6d5a]/10 border-[#ff6d5a]/40 shadow-lg shadow-[#ff6d5a]/20" : "bg-slate-950/40 border-white/5"
                  }`}
                >
                  <Fan
                    size={18}
                    className={`text-[#ff6d5a] ${acCh.isOn && state.acCompressorState === "Running" ? "animate-spin" : acCh.isOn ? "animate-pulse" : "text-slate-500"}`}
                    style={{ animationDuration: state.acFanSpeed === "High" ? "1s" : state.acFanSpeed === "Medium" ? "1.8s" : "3s" }}
                  />
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/60">
                      RELAY {acCh.id}
                    </span>
                    <span className="text-xs font-mono text-slate-500">GPIO 23</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-100 mt-1 truncate">
                    {acCh.name}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleToggleChannel(acCh.id)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 shrink-0 ${
                  acCh.isOn ? "bg-[#ff6d5a] justify-end" : "bg-slate-800 justify-start"
                }`}
                id={`relay-toggle-${acCh.id}`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </button>
            </div>

            {/* AC Interactive Sub-Controls */}
            {acCh.isOn && (
              <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-col gap-4 animate-fadeIn">
                
                {/* Grid: Room Temp + Compressor State */}
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Room Temperature Thermometer Widget */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center gap-2.5">
                    <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg shrink-0">
                      <Thermometer size={16} className="animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase font-bold leading-none block">Suhu Ruangan</span>
                      <span className="font-mono font-bold text-slate-200 text-sm">{state.roomTemperature.toFixed(1)}°C</span>
                    </div>
                  </div>

                  {/* Compressor Status indicator */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 border ${
                      state.acCompressorState === "Running"
                        ? "bg-[#ff6d5a]/10 border-[#ff6d5a]/20 text-[#ff6d5a]"
                        : state.acCompressorState === "Starting"
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                        : state.acCompressorState === "Idle"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-slate-900 border-slate-800 text-slate-500"
                    }`}>
                      <Wind size={16} />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase font-bold leading-none block">Kompresor</span>
                      <span className={`text-xs font-bold ${
                        state.acCompressorState === "Running" ? "text-[#ff6d5a]" :
                        state.acCompressorState === "Starting" ? "text-amber-400 animate-pulse" :
                        state.acCompressorState === "Idle" ? "text-emerald-400" : "text-slate-500"
                      }`}>
                        {state.acCompressorState}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Temperature Setting Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Set Temperatur AC</span>
                    <span className="text-xs font-mono font-bold text-[#ff6d5a] bg-[#ff6d5a]/10 border border-[#ff6d5a]/20 px-2 py-0.5 rounded">
                      {state.acTempSetting}°C
                    </span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="30"
                    value={state.acTempSetting}
                    onChange={(e) => onChange({ acTempSetting: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer focus:outline-none"
                    id="ac-temp-slider"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                    <span>16°C (Dingin Maksimum)</span>
                    <span>24°C (Normal / Eco)</span>
                    <span>30°C</span>
                  </div>
                </div>

                {/* Fan Speed Buttons */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kecepatan Kipas (Fan Speed)</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Low", "Medium", "High"] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => onChange({ acFanSpeed: speed })}
                        className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                          state.acFanSpeed === speed
                            ? "bg-[#ff6d5a]/10 border-[#ff6d5a]/50 text-[#ff6d5a]"
                            : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-400"
                        }`}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Off-State Placeholder */}
            {!acCh.isOn && (
              <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
                <span>●</span> AC Mati (Relay Terbuka, Tidak mengonsumsi daya)
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hardware Telemetry */}
      <div className="bg-slate-950/60 border border-slate-850/80 p-4 rounded-2xl flex flex-col gap-3.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Cpu size={12} className="text-[#ff6d5a]" />
          Telemetri Perangkat Keras ESP32
        </span>

        <div className="grid grid-cols-2 gap-3.5 text-xs">
          {/* CPU Temp */}
          <div className="flex flex-col gap-1 bg-slate-950 p-3 rounded-xl border border-slate-900">
            <span className="text-[10px] text-slate-500 uppercase">Suhu Inti CPU</span>
            <div className="flex items-center gap-2 mt-0.5">
              <Thermometer size={14} className="text-orange-400 shrink-0" />
              <span className="font-mono font-bold text-slate-200">{state.espTemperature.toFixed(1)}°C</span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full"
                style={{ width: `${Math.min(100, (state.espTemperature / 70) * 100)}%` }}
              />
            </div>
          </div>

          {/* VCC Voltage */}
          <div className="flex flex-col gap-1 bg-slate-950 p-3 rounded-xl border border-slate-900">
            <span className="text-[10px] text-slate-500 uppercase">VCC Rail (5V USB)</span>
            <div className="flex items-center gap-2 mt-0.5">
              <Zap size={14} className="text-emerald-400 shrink-0" />
              <span className="font-mono font-bold text-slate-200">{state.relayVcc.toFixed(2)} V</span>
            </div>
            <span className="text-[9px] text-slate-500 font-mono mt-1 leading-none">Stabil • Micro USB In</span>
          </div>
        </div>
      </div>

      {/* Ambient Day/Night control */}
      <div className="flex flex-col gap-3 border-t border-slate-850 pt-5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            {state.ambientLight < 35 ? (
              <Moon size={15} className="text-indigo-400" />
            ) : state.ambientLight < 70 ? (
              <CloudSun size={15} className="text-sky-400" />
            ) : (
              <Sun size={15} className="text-amber-400" />
            )}
            Ambient Ruangan (Siang/Malam)
          </label>
          <span className="text-xs font-mono font-bold text-[#ff6d5a] bg-[#ff6d5a]/10 px-2 py-0.5 rounded-full border border-[#ff6d5a]/20">
            {state.ambientLight}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={state.ambientLight}
          onChange={(e) => onChange({ ambientLight: Number(e.target.value) })}
          className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer focus:outline-none"
          id="ambient-slider"
        />
        <div className="flex justify-between text-[9px] text-slate-500 font-semibold px-0.5">
          <span>Gelap (Malam)</span>
          <span>Redup (Senja)</span>
          <span>Terang (Siang)</span>
        </div>
      </div>

      {/* Skenario / Presets */}
      <div className="flex flex-col gap-3 border-t border-slate-850 pt-5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Skenario & Makro Terjadwal
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleApplyPreset("all_on")}
            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <Power size={13} className="text-emerald-400" />
            Semua Hidup
          </button>
          <button
            onClick={() => handleApplyPreset("all_off")}
            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <Power size={13} className="text-rose-400" />
            Semua Mati
          </button>
          <button
            onClick={() => handleApplyPreset("night")}
            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <Moon size={13} className="text-indigo-400" />
            Tidur Nyenyak
          </button>
          <button
            onClick={() => handleApplyPreset("eco")}
            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <Wind size={13} className="text-amber-400" />
            Eco Inverter LED
          </button>
        </div>
      </div>
    </div>
  );
}
