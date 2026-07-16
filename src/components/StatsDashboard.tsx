import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LightState, PowerDataPoint } from "../types";
import {
  Zap,
  Activity,
  DollarSign,
  TrendingUp,
  Cpu,
  Clock,
  Gauge,
  Compass,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface StatsDashboardProps {
  state: LightState;
  history: PowerDataPoint[];
}

// Indonesian PLN tariff per kWh (Tarif Rumah Tangga R-1/TR 1300 VA ke atas)
const PLN_TARIFF_PER_KWH = 1444.70;

export default function StatsDashboard({ state, history }: StatsDashboardProps) {
  const [isOpen, setIsOpen] = useState(true);
  // 1. Calculations based on active PZEM power
  const currentPower = state.pzemPower; // Watts
  const accumulatedEnergy = state.pzemEnergy; // kWh

  // Calculate estimated monthly cost: (Watts * 24h * 30 days / 1000) * Rp 1444.70
  const monthlyCostEstimate = (currentPower * 24 * 30 / 1000) * PLN_TARIFF_PER_KWH;

  // Calculate energy saved:
  // A traditional old house setup would draw 60W for the Wall Bulb, 100W for the Ceiling Bulb, 40W for the Desk Lamp, and a constant 1100W for a legacy non-inverter AC
  let conventionalPower = 0;
  if (state.channels[0]?.isOn) conventionalPower += 60;
  if (state.channels[1]?.isOn) conventionalPower += 100;
  if (state.channels[2]?.isOn) conventionalPower += 40;
  if (state.channels[3]?.isOn) conventionalPower += 1100;

  const currentSavingPercent = conventionalPower > 0
    ? Math.max(0, ((conventionalPower - currentPower) / conventionalPower) * 100)
    : 100;

  // Format currency to Indonesian Rupiah (Rp)
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="glass rounded-3xl p-6 flex flex-col gap-5 shadow-xl border border-slate-800/60" id="stats-dashboard">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between cursor-pointer select-none group transition-all duration-300 ${isOpen ? "border-b border-slate-800 pb-4" : ""}`}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-display font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Activity size={18} className="text-blue-400" />
            Metrik Efisiensi & Diagnostik Daya PZEM-004T
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono ml-2">
              Telemetri Sensor
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Analisis konsumsi listrik AC real-time, estimasi biaya PLN bulanan, dan grafik beban harian
          </p>
        </div>
        <div className={`p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition-all duration-300 ${isOpen ? "rotate-180 text-blue-400 border-blue-500/20" : "group-hover:text-slate-200"}`}>
          <ChevronDown size={15} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden flex flex-col gap-8 pt-2"
          >
            {/* 1. PZEM-004T Industrial LCD Meter Interface */}
      <div className="bg-[#090d16] border border-blue-900/30 rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        {/* Banner header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-blue-950 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-950 border border-blue-800/40 rounded-xl flex items-center justify-center text-blue-400">
              <Gauge size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white font-display text-sm tracking-wide">
                  PZEM-004T V3.0 Power Monitor
                </h3>
                <span className="text-[9px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-900 px-1.5 py-0.5 rounded-md leading-none">
                  UART COM ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Modul sensor kelistrikan AC multi-fungsi berpresisi tinggi (Akurasi Kelas 1.0)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/40 border border-slate-800/80 px-3 py-1.5 rounded-xl">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping shrink-0" />
            <span>PZEM TX/RX Pulses...</span>
          </div>
        </div>

        {/* 6-Field Industrial LCD Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Field 1: Tegangan (Voltage) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tegangan (V)</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-blue-400 mt-1 block">
                {state.pzemVoltage.toFixed(1)} <span className="text-xs text-slate-500 font-normal">V</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.pzemVoltage / 250) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                <span>0V</span>
                <span>220V (PLN)</span>
                <span>250V</span>
              </div>
            </div>
          </div>

          {/* Field 2: Arus Listrik (Current) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Arus Beban (A)</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-blue-400 mt-1 block">
                {state.pzemCurrent.toFixed(3)} <span className="text-xs text-slate-500 font-normal">A</span>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-[9px] text-slate-500 font-mono">
                Setara: {(state.pzemCurrent * 1000).toFixed(0)} mA
              </span>
              <p className="text-[8px] text-slate-600 font-semibold leading-none mt-1">Beban Dinamis CT Coil</p>
            </div>
          </div>

          {/* Field 3: Daya Aktif (Active Power) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Daya Aktif (W)</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-blue-400 mt-1 block">
                {state.pzemPower.toFixed(1)} <span className="text-xs text-slate-500 font-normal">W</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (state.pzemPower / 1200) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                <span>Standby</span>
                <span>AC Max (1.2kW)</span>
              </div>
            </div>
          </div>

          {/* Field 4: Energi Terakumulasi (Energy Register) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Energi (kWh)</span>
              <span className="text-lg md:text-xl font-mono font-bold text-emerald-400 mt-1 block tracking-tight">
                {state.pzemEnergy.toFixed(6)}
              </span>
            </div>
            <div className="mt-3 pt-1 border-t border-slate-900/60 flex items-center justify-between text-[8px] text-slate-500">
              <span className="font-mono">PZEM REGISTER 1</span>
              <span className="text-emerald-500/80 font-bold uppercase">Non-Volatile</span>
            </div>
          </div>

          {/* Field 5: Faktor Daya (Power Factor / Cos φ) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Faktor Daya (PF)</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-blue-400 mt-1 block">
                {state.pzemPf.toFixed(2)} <span className="text-xs text-slate-500 font-normal">Cosφ</span>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-[9px] text-slate-500 font-medium leading-none">
                {state.pzemPf > 0.9 ? (
                  <span className="text-emerald-400 font-semibold">Resistif (Murni)</span>
                ) : state.pzemPf > 0.78 ? (
                  <span className="text-blue-400 font-semibold">Induktif Ringan</span>
                ) : (
                  <span className="text-amber-400 font-semibold">Induktif Motor</span>
                )}
              </p>
              <span className="text-[8px] text-slate-600 font-mono block mt-1">Fasa Gelombang Teg-Arus</span>
            </div>
          </div>

          {/* Field 6: Frekuensi Grid (Frequency) */}
          <div className="bg-[#0d1527] border border-blue-950 p-4 rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Frekuensi (Hz)</span>
              <span className="text-xl md:text-2xl font-mono font-bold text-blue-400 mt-1 block">
                {state.pzemFrequency.toFixed(2)} <span className="text-xs text-slate-500 font-normal">Hz</span>
              </span>
            </div>
            <div className="mt-3">
              <p className="text-[9px] text-slate-500 font-semibold leading-none">Grid PLN Jawa-Bali</p>
              <span className="text-[8px] text-emerald-500 font-mono block mt-1">Stabil (Sangat Layak)</span>
            </div>
          </div>

        </div>
      </div>

      {/* 2. Analytical Cost, Savings, & Real-time Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Cost & Savings metrics */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
          
          {/* Card: Monthly Cost Estimate */}
          <div className="glass rounded-3xl p-6 flex flex-col justify-between border-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <DollarSign size={14} className="text-rose-400" />
                  Est. Biaya Operasional (24/7)
                </span>
                <h4 className="text-2xl md:text-3xl font-display font-black text-slate-100 tracking-tight mt-1.5">
                  {formatRupiah(monthlyCostEstimate)}
                  <span className="text-xs text-slate-500 font-normal font-sans"> /bln</span>
                </h4>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 leading-relaxed bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl font-mono">
              Perhitungan: {currentPower.toFixed(0)}W * 24 Jam * 30 Hari = {((currentPower * 24 * 30) / 1000).toFixed(1)} kWh/bulan • Tarif PLN Rp 1.444,70 / kWh
            </p>
          </div>

          {/* Card: Savings Efficiency Percentage */}
          <div className="glass rounded-3xl p-6 flex flex-col justify-between border-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-emerald-400 animate-bounce" />
                  Efisiensi Penghematan Daya
                </span>
                <h4 className="text-2xl md:text-3xl font-display font-black text-emerald-400 tracking-tight mt-1.5">
                  {currentSavingPercent.toFixed(1)}%
                </h4>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
              {state.channels[3]?.isOn ? (
                <span>
                  Menggunakan kompresor **AC Inverter dinamis** hemat energi (~600W rata-rata) dibanding AC konvensional lama (yang boros ditarik stabil di 1100W).
                </span>
              ) : (
                <span>
                  Sistem menghemat energi maksimal dengan mengendalikan beban melalui relai mikro serta memadamkan kompresor AC utama.
                </span>
              )}
            </p>
          </div>

          {/* Card: Total Energy Consumption (PLN Bill projection) */}
          <div className="glass rounded-3xl p-6 flex flex-col justify-between border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock size={14} className="text-blue-400" />
                  Proyeksi Tagihan PLN (Rp)
                </span>
                <h4 className="text-xl font-display font-bold text-slate-200 tracking-tight mt-1.5">
                  {formatRupiah(accumulatedEnergy * PLN_TARIFF_PER_KWH)}
                </h4>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2.5 font-mono">
              Berdasarkan akumulasi energi register PZEM-004T: {accumulatedEnergy.toFixed(6)} kWh.
            </p>
          </div>

        </div>

        {/* Right Column: Dynamic Real-time chart */}
        <div className="lg:col-span-8 glass rounded-3xl p-6 border-slate-800 flex flex-col gap-4 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
                <Activity size={14} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200">
                  Grafik Beban Listrik Total (Watt)
                </h4>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                  Data streaming langsung dari sensor PZEM-004T ke mikro ESP32 (Sliding Window 15 detik)
                </p>
              </div>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Aktif: {currentPower.toFixed(0)} W
            </span>
          </div>

          {/* Real-time Recharts Component */}
          <div className="w-full h-[220px] md:h-[260px] text-[10px] mt-2 select-none">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={false}
                  domain={[0, (dataMin: number) => Math.max(80, Math.ceil(dataMin * 1.3))]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090d16",
                    borderColor: "rgba(59, 130, 246, 0.2)",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "10px",
                    fontFamily: "monospace",
                  }}
                  itemStyle={{ color: "#3b82f6" }}
                />
                <Area
                  type="monotone"
                  dataKey="consumption"
                  name="Konsumsi (W)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#powerGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex justify-between items-center bg-[#090d16] p-3 rounded-xl border border-blue-950 text-[10px]">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
              <Cpu size={12} className="text-blue-400" />
              <span>Sinyal ADC Internasional PZEM</span>
            </div>
            <div className="flex gap-4 font-mono text-slate-500 text-[9px]">
              <span>Sample: 1Hz</span>
              <span>Filter: Kalibrasi Hardware</span>
              <span>Akurasi: ±0.5%</span>
            </div>
          </div>

        </div>

      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
