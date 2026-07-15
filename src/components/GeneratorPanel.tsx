import React, { useState, useEffect } from "react";
import {
  Cpu,
  Key,
  Network,
  Download,
  Clipboard,
  Check,
  Zap,
  Code,
  FileCode,
  Layers,
  HelpCircle,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Info,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GeneratorConfig {
  wifiSsid: string;
  wifiPass: string;
  mqttBroker: string;
  mqttPort: string;
  topicPrefix: string;
  gpioRelay1: number;
  gpioRelay2: number;
  gpioRelay3: number;
  gpioRelay4: number;
  pzemRx: number;
  pzemTx: number;
}

const DEFAULT_GEN_CONFIG: GeneratorConfig = {
  wifiSsid: "MyHomeWiFi",
  wifiPass: "password123",
  mqttBroker: "broker.emqx.io",
  mqttPort: "1883",
  topicPrefix: "esp32/relay4ch",
  gpioRelay1: 5,
  gpioRelay2: 18,
  gpioRelay3: 19,
  gpioRelay4: 23,
  pzemRx: 16,
  pzemTx: 17
};

export const GeneratorPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  // Load Gemini API Key from localStorage
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("esp32_relay_gemini_key") || "";
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Load custom generator config
  const [config, setConfig] = useState<GeneratorConfig>(() => {
    const saved = localStorage.getItem("esp32_relay_gen_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sync topicPrefix from active MQTT config if possible
        const mqttSaved = localStorage.getItem("esp32_relay_mqtt_config");
        if (mqttSaved) {
          const mq = JSON.parse(mqttSaved);
          if (mq.topicPrefix) {
            parsed.topicPrefix = mq.topicPrefix;
          }
          if (mq.brokerUrl) {
            // Try extracting domain from wss://broker.emqx.io:8084/mqtt
            const match = mq.brokerUrl.match(/wss?:\/\/([^:/]+)/);
            if (match) {
              parsed.mqttBroker = match[1];
            }
          }
        }
        return { ...DEFAULT_GEN_CONFIG, ...parsed };
      } catch (e) {
        return DEFAULT_GEN_CONFIG;
      }
    }
    return DEFAULT_GEN_CONFIG;
  });

  // Active tab
  const [activeTab, setActiveTab] = useState<"arduino" | "nodered" | "wokwi">("arduino");
  
  // Generation state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Generated outputs
  const [arduinoCode, setArduinoCode] = useState<string>("");
  const [nodeRedFlow, setNodeRedFlow] = useState<string>("");
  const [wokwiJson, setWokwiJson] = useState<string>("");

  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  // Custom instruction prompt
  const [customPrompt, setCustomPrompt] = useState<string>(() => {
    const saved = localStorage.getItem("esp32_relay_custom_prompt");
    if (saved) return saved;
    return `Anda adalah ahli sistem tertanam (embedded systems), Internet of Things (IoT), dan arsitektur otomasi industri.
Tugas Anda adalah memformulasikan kode program dan skema integrasi lengkap berdasarkan parameter hardware dan jaringan yang diberikan pengguna.

Anda HARUS mengembalikan tiga bagian terpisah yang sangat terperinci dalam format teks murni. Gunakan pemisah khusus [START_ARDUINO], [END_ARDUINO], [START_NODERED], [END_NODERED], [START_WOKWI], [END_WOKWI] agar program frontend dapat menguraikannya dengan mudah.

Berikut adalah spesifikasi parameter yang diberikan pengguna:
- Wi-Fi SSID: "{wifiSsid}"
- Wi-Fi Password: "{wifiPass}"
- MQTT Broker: "{mqttBroker}"
- MQTT Port: "{mqttPort}"
- MQTT Topic Prefix: "{topicPrefix}"
- Relay 1 (Lampu Dinding) GPIO Pin: {gpioRelay1}
- Relay 2 (Lampu Plafon) GPIO Pin: {gpioRelay2}
- Relay 3 (Lampu Belajar Meja) GPIO Pin: {gpioRelay3}
- Relay 4 (Air Conditioner / AC) GPIO Pin: {gpioRelay4}
- PZEM-004T RX Pin: {pzemRx} (UART2 TX pada PZEM)
- PZEM-004T TX Pin: {pzemTx} (UART2 RX pada PZEM)

ATURAN GENERASI MASING-MASING BAGIAN:

1. ARDUINO ESP32 SKETCH:
   - Harus berupa kode ESP32 Arduino IDE murni, siap dicompile.
   - Menggunakan library: <WiFi.h>, <PubSubClient.h>, dan <PZEM004Tv30.h> (menggunakan hardware serial Serial2 untuk ESP32).
   - Pastikan mendefinisikan pin Relay sebagai OUTPUT, aktifkan state awal (misal LOW).
   - Inisialisasi PZEM-004T menggunakan HardwareSerial Serial2: PZEM004Tv30 pzem(Serial2, {pzemRx}, {pzemTx});
   - Hubungkan ke Wi-Fi dan MQTT secara non-blocking (auto-reconnect di dalam loop utama).
   - Subscribe ke:
     - "{topicPrefix}/relay1/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay2/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay3/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay4/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay/all/set" (payload comma-separated "ON,ON,OFF,OFF" atau JSON array)
   - Publish berkala (misal setiap 5 detik) ke topic "{topicPrefix}/status" berupa format JSON string yang valid berisi telemetri PZEM-004T:
     {
       "uptime": <detik_sejak_aktif>,
       "vcc": 5.0,
       "pzem": {
         "voltage": <volt>,
         "current": <ampere>,
         "power": <watt>,
         "energy": <kwh>,
         "frequency": <hz>,
         "pf": <power_factor>
       },
       "relays": [
         {"id": 1, "isOn": <true/false>},
         {"id": 2, "isOn": <true/false>},
         {"id": 3, "isOn": <true/false>},
         {"id": 4, "isOn": <true/false>}
       ]
     }
   - Berikan komentar penjelasan komprehensif dalam Bahasa Indonesia.

2. NODE-RED DASHBOARD FLOW:
   - Harus berupa payload JSON flow Node-RED yang valid.
   - Buat minimal 4 tombol switch kontrol relay (mengirim ON/OFF ke topik yang sesuai), serta pengukur (gauge) dan teks untuk menampilkan Voltage, Current, Power, Energy, dan Power Factor dari parsing JSON "{topicPrefix}/status".
   - Tulis JSON flow Node-RED murni di antara penanda [START_NODERED] dan [END_NODERED]. Pastikan formatnya valid JSON (berupa array of nodes).

3. WOKWI DIAGRAM JSON:
   - Harus berupa konfigurasi "diagram.json" Wokwi yang valid di antara penanda [START_WOKWI] dan [END_WOKWI].
   - Berisi part esp32, 4 buah module relay (atau LED indikator sebagai representasi relay), pzem-004t (jika didukung, atau virtual UART simulator), serta koneksi pin yang sesuai dengan GPIO di atas.

Keluarkan respon Anda dengan mematuhi format pemisah berikut agar mudah di-parse:

[START_ARDUINO]
// Tulis kode .ino lengkap di sini
[END_ARDUINO]

[START_NODERED]
// Tulis JSON array Node-RED murni di sini
[END_NODERED]

[START_WOKWI]
// Tulis diagram.json murni di sini
[END_WOKWI]`;
  });

  // Save config
  useEffect(() => {
    localStorage.setItem("esp32_relay_gen_config", JSON.stringify(config));
  }, [config]);

  // Save API key
  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem("esp32_relay_gemini_key", val);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setError("Harap masukkan API Key Gemini Anda terlebih dahulu.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingStep("Menghubungkan ke Gemini AI...");

    try {
      // Step 1: Draft the instruction prompt
      setLoadingStep("Merumuskan spesifikasi hardware & protokol MQTT...");
      
      // Substitusi parameter di customPrompt
      let systemPrompt = customPrompt;
      systemPrompt = systemPrompt.replace(/{wifiSsid}/g, config.wifiSsid);
      systemPrompt = systemPrompt.replace(/{wifiPass}/g, config.wifiPass);
      systemPrompt = systemPrompt.replace(/{mqttBroker}/g, config.mqttBroker);
      systemPrompt = systemPrompt.replace(/{mqttPort}/g, config.mqttPort);
      systemPrompt = systemPrompt.replace(/{topicPrefix}/g, config.topicPrefix);
      systemPrompt = systemPrompt.replace(/{gpioRelay1}/g, String(config.gpioRelay1));
      systemPrompt = systemPrompt.replace(/{gpioRelay2}/g, String(config.gpioRelay2));
      systemPrompt = systemPrompt.replace(/{gpioRelay3}/g, String(config.gpioRelay3));
      systemPrompt = systemPrompt.replace(/{gpioRelay4}/g, String(config.gpioRelay4));
      systemPrompt = systemPrompt.replace(/{pzemRx}/g, String(config.pzemRx));
      systemPrompt = systemPrompt.replace(/{pzemTx}/g, String(config.pzemTx));

      setLoadingStep("Menghubungi server Gemini API...");
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: systemPrompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
            },
          }),
        }
      );

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson?.error?.message || `HTTP error ${response.status}`);
      }

      setLoadingStep("Memproses respon AI...");
      const result = await response.json();
      const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!generatedText) {
        throw new Error("Respon kosong diterima dari Gemini AI.");
      }

      // Parse outputs using regex or indexOf
      const parseSection = (startTag: string, endTag: string, fallbackPrompt: string): string => {
        const startIdx = generatedText.indexOf(startTag);
        const endIdx = generatedText.indexOf(endTag);
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          return generatedText.substring(startIdx + startTag.length, endIdx).trim();
        }
        // Fallback search with regex
        const regex = new RegExp(`${escapeRegExp(startTag)}([\\s\\S]*?)${escapeRegExp(endTag)}`);
        const match = generatedText.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
        return `// Gagal mem-parse bagian ini dari respon AI.\n// Silakan coba generate ulang.\n\n${fallbackPrompt}`;
      };

      const extractedArduino = parseSection("[START_ARDUINO]", "[END_ARDUINO]", "Sketsa Arduino tidak ditemukan.");
      const extractedNodeRed = parseSection("[START_NODERED]", "[END_NODERED]", "[\n  // Node-RED JSON Flow tidak ditemukan\n]");
      const extractedWokwi = parseSection("[START_WOKWI]", "[END_WOKWI]", "{\n  \"version\": 1,\n  \"author\": \"AI Studio\",\n  \"editor\": \"wokwi\",\n  \"parts\": []\n}");

      setArduinoCode(extractedArduino);
      setNodeRedFlow(extractedNodeRed);
      setWokwiJson(extractedWokwi);

      setLoadingStep("Sukses memformulasikan deliverable!");
      setTimeout(() => setIsLoading(false), 800);

    } catch (err: any) {
      console.error(err);
      setError(`Gagal generate code: ${err.message || "Kesalahan jaringan tidak dikenal."}`);
      setIsLoading(false);
    }
  };

  // Helper helper
  function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Pre-load mock template if empty just to show initial state, so the UI is not blank
  useEffect(() => {
    // Basic standard templates before dynamic LLM generation
    setArduinoCode(`/*
 * ESP32 + PZEM-004T v3.0 + 4-Channel Relay MQTT Client
 * ==================================================
 * Gunakan tombol "Generate Smart Code" di atas untuk menghasilkan program 
 * yang terkonfigurasi secara dinamis sesuai detail Wi-Fi & MQTT Anda!
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <PZEM004Tv30.h>
#include <ArduinoJson.h>

// Konfigurasi Pin Relay
#define RELAY_1 ${config.gpioRelay1} // Lampu Dinding
#define RELAY_2 ${config.gpioRelay2} // Lampu Plafon
#define RELAY_3 ${config.gpioRelay3} // Lampu Belajar
#define RELAY_4 ${config.gpioRelay4} // AC

// Pin serial PZEM-004T v3.0 (UART2)
#define PZEM_RX ${config.pzemRx}
#define PZEM_TX ${config.pzemTx}

PZEM004Tv30 pzem(Serial2, PZEM_RX, PZEM_TX);

// Harap masukkan API Key Gemini Anda dan tekan "Generate Smart Code" untuk kode fungsional penuh!
`);

    setNodeRedFlow(`[
  {
    "id": "esp32-flow-group",
    "type": "tab",
    "label": "ESP32 Gateway Relay & PZEM-004T",
    "disabled": false,
    "info": "Gunakan tombol Generate Smart Code untuk flow JSON yang sepenuhnya terkonfigurasi!"
  }
]`);

    setWokwiJson(`{
  "version": 1,
  "author": "Google AI Studio",
  "editor": "wokwi",
  "parts": [
    { "type": "board-esp32-devkit-c-v4", "id": "esp", "top": 0, "left": 0, "attrs": {} }
  ],
  "connections": []
}`);
  }, []);

  return (
    <div className="glass rounded-3xl p-6 flex flex-col gap-6 shadow-xl" id="generator-panel">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between cursor-pointer select-none group transition-all duration-300 ${isOpen ? "border-b border-slate-800 pb-4" : ""}`}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-display font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400 animate-pulse" />
            IoT Code & Integration Flow Generator (Gemini AI)
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono ml-2">
              Generator AI
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Generate otomatis Firmware ESP32 (.ino), Dashboard Node-RED Flow, dan Diagram Sirkuit Wokwi berbasis AI
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-xl">
            <Zap size={12} />
            <span className="text-[10px] font-mono font-bold uppercase">Gemini Inside</span>
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
            {/* API Key Configuration & Wi-Fi */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
        {/* API Key Column */}
        <div className="md:col-span-1 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Key size={13} className="text-amber-400" />
                Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:underline"
              >
                Dapatkan Key
              </a>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full pl-3 pr-10 py-2 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed mt-1">
              API Key Anda disimpan secara lokal dan aman di browser Anda (Local Storage) untuk memproses prompt.
            </p>
          </div>
        </div>

        {/* WiFi & MQTT Column */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Wi-Fi SSID</label>
              <input
                type="text"
                value={config.wifiSsid}
                onChange={(e) => setConfig({ ...config, wifiSsid: e.target.value })}
                placeholder="MyHomeWiFi"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">Wi-Fi Password</label>
              <input
                type="password"
                value={config.wifiPass}
                onChange={(e) => setConfig({ ...config, wifiPass: e.target.value })}
                placeholder="••••••••"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">MQTT Broker Domain</label>
              <input
                type="text"
                value={config.mqttBroker}
                onChange={(e) => setConfig({ ...config, mqttBroker: e.target.value })}
                placeholder="broker.emqx.io"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-300">MQTT Port</label>
              <input
                type="text"
                value={config.mqttPort}
                onChange={(e) => setConfig({ ...config, mqttPort: e.target.value })}
                placeholder="1883"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Custom Pins Accordion (Mini) */}
      <div className="bg-slate-950/20 border border-slate-800/40 p-4 rounded-2xl">
        <span className="text-xs font-semibold text-slate-400 block mb-3">Pemetaan Pin GPIO ESP32 (Konfigurasi Simulator)</span>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-[10px]">
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Relay 1 (Dinding)</span>
            <input
              type="number"
              value={config.gpioRelay1}
              onChange={(e) => setConfig({ ...config, gpioRelay1: parseInt(e.target.value, 10) || 5 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Relay 2 (Plafon)</span>
            <input
              type="number"
              value={config.gpioRelay2}
              onChange={(e) => setConfig({ ...config, gpioRelay2: parseInt(e.target.value, 10) || 18 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Relay 3 (Belajar)</span>
            <input
              type="number"
              value={config.gpioRelay3}
              onChange={(e) => setConfig({ ...config, gpioRelay3: parseInt(e.target.value, 10) || 19 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Relay 4 (AC)</span>
            <input
              type="number"
              value={config.gpioRelay4}
              onChange={(e) => setConfig({ ...config, gpioRelay4: parseInt(e.target.value, 10) || 23 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">PZEM RX (GPIO)</span>
            <input
              type="number"
              value={config.pzemRx}
              onChange={(e) => setConfig({ ...config, pzemRx: parseInt(e.target.value, 10) || 16 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">PZEM TX (GPIO)</span>
            <input
              type="number"
              value={config.pzemTx}
              onChange={(e) => setConfig({ ...config, pzemTx: parseInt(e.target.value, 10) || 17 })}
              className="px-2 py-1 bg-slate-950 border border-slate-900 rounded font-mono text-slate-300 text-center"
            />
          </div>
        </div>
      </div>

      {/* Custom Prompt Textarea */}
      <div className="flex flex-col gap-2.5 bg-slate-950/30 border border-slate-850 p-5 rounded-2xl">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles size={13} className="text-blue-400" />
            Custom AI System Prompt / Instruksi Tambahan
          </label>
          <button
            onClick={() => {
              if (window.confirm("Apakah Anda yakin ingin mereset prompt ke default?")) {
                const defaultPrompt = `Anda adalah ahli sistem tertanam (embedded systems), Internet of Things (IoT), dan arsitektur otomasi industri.
Tugas Anda adalah memformulasikan kode program dan skema integrasi lengkap berdasarkan parameter hardware dan jaringan yang diberikan pengguna.

Anda HARUS mengembalikan tiga bagian terpisah yang sangat terperinci dalam format teks murni. Gunakan pemisah khusus [START_ARDUINO], [END_ARDUINO], [START_NODERED], [END_NODERED], [START_WOKWI], [END_WOKWI] agar program frontend dapat menguraikannya dengan mudah.

Berikut adalah spesifikasi parameter yang diberikan pengguna:
- Wi-Fi SSID: "{wifiSsid}"
- Wi-Fi Password: "{wifiPass}"
- MQTT Broker: "{mqttBroker}"
- MQTT Port: "{mqttPort}"
- MQTT Topic Prefix: "{topicPrefix}"
- Relay 1 (Lampu Dinding) GPIO Pin: {gpioRelay1}
- Relay 2 (Lampu Plafon) GPIO Pin: {gpioRelay2}
- Relay 3 (Lampu Belajar Meja) GPIO Pin: {gpioRelay3}
- Relay 4 (Air Conditioner / AC) GPIO Pin: {gpioRelay4}
- PZEM-004T RX Pin: {pzemRx} (UART2 TX pada PZEM)
- PZEM-004T TX Pin: {pzemTx} (UART2 RX pada PZEM)

ATURAN GENERASI MASING-MASING BAGIAN:

1. ARDUINO ESP32 SKETCH:
   - Harus berupa kode ESP32 Arduino IDE murni, siap dicompile.
   - Menggunakan library: <WiFi.h>, <PubSubClient.h>, dan <PZEM004Tv30.h> (menggunakan hardware serial Serial2 untuk ESP32).
   - Pastikan mendefinisikan pin Relay sebagai OUTPUT, aktifkan state awal (misal LOW).
   - Inisialisasi PZEM-004T menggunakan HardwareSerial Serial2: PZEM004Tv30 pzem(Serial2, {pzemRx}, {pzemTx});
   - Hubungkan ke Wi-Fi dan MQTT secara non-blocking (auto-reconnect di dalam loop utama).
   - Subscribe ke:
     - "{topicPrefix}/relay1/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay2/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay3/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay4/set" (payload "ON" atau "OFF")
     - "{topicPrefix}/relay/all/set" (payload comma-separated "ON,ON,OFF,OFF" atau JSON array)
   - Publish berkala (misal setiap 5 detik) ke topic "{topicPrefix}/status" berupa format JSON string yang valid berisi telemetri PZEM-004T:
     {
       "uptime": <detik_sejak_aktif>,
       "vcc": 5.0,
       "pzem": {
         "voltage": <volt>,
         "current": <ampere>,
         "power": <watt>,
         "energy": <kwh>,
         "frequency": <hz>,
         "pf": <power_factor>
       },
       "relays": [
         {"id": 1, "isOn": <true/false>},
         {"id": 2, "isOn": <true/false>},
         {"id": 3, "isOn": <true/false>},
         {"id": 4, "isOn": <true/false>}
       ]
     }
   - Berikan komentar penjelasan komprehensif dalam Bahasa Indonesia.

2. NODE-RED DASHBOARD FLOW:
   - Harus berupa payload JSON flow Node-RED yang valid.
   - Buat minimal 4 tombol switch kontrol relay (mengirim ON/OFF ke topik yang sesuai), serta pengukur (gauge) dan teks untuk menampilkan Voltage, Current, Power, Energy, dan Power Factor dari parsing JSON "{topicPrefix}/status".
   - Tulis JSON flow Node-RED murni di antara penanda [START_NODERED] dan [END_NODERED]. Pastikan formatnya valid JSON (berupa array of nodes).

3. WOKWI DIAGRAM JSON:
   - Harus berupa konfigurasi "diagram.json" Wokwi yang valid di antara penanda [START_WOKWI] dan [END_WOKWI].
   - Berisi part esp32, 4 buah module relay (atau LED indikator sebagai representasi relay), pzem-004t (jika didukung, atau virtual UART simulator), serta koneksi pin yang sesuai dengan GPIO di atas.

Keluarkan respon Anda dengan mematuhi format pemisah berikut agar mudah di-parse:

[START_ARDUINO]
// Tulis kode .ino lengkap di sini
[END_ARDUINO]

[START_NODERED]
// Tulis JSON array Node-RED murni di sini
[END_NODERED]

[START_WOKWI]
// Tulis diagram.json murni di sini
[END_WOKWI]`;
                setCustomPrompt(defaultPrompt);
                localStorage.setItem("esp32_relay_custom_prompt", defaultPrompt);
              }
            }}
            className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            Reset Prompt
          </button>
        </div>
        <textarea
          value={customPrompt}
          onChange={(e) => {
            setCustomPrompt(e.target.value);
            localStorage.setItem("esp32_relay_custom_prompt", e.target.value);
          }}
          rows={8}
          className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800/90 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
          placeholder="Modifikasi prompt AI di sini..."
        />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          *Anda dapat menyesuaikan instruksi di atas sesuai kebutuhan Anda (misalnya menambahkan fitur kontrol fuzzy logic, filter noise PZEM, atau enkripsi MQTT). Gunakan penulisan variabel <code className="text-slate-400 font-bold">{`{wifiSsid}`}</code>, <code className="text-slate-400 font-bold">{`{wifiPass}`}</code>, <code className="text-slate-400 font-bold">{`{topicPrefix}`}</code>, dll. agar nilai dinamis otomatis tersisip.
        </p>
      </div>

      {/* Generate trigger button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Info size={14} className="text-blue-400 shrink-0" />
          <span>Generasi kode mendukung multi-file yang siap digunakan secara real-world.</span>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={`w-full sm:w-auto px-8 py-3 rounded-2xl font-display font-medium text-xs flex items-center justify-center gap-2 shadow-lg transition-all duration-300 ${
            isLoading
              ? "bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-amber-600/10 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-600/35 hover:-translate-y-0.5 active:translate-y-0"
          }`}
        >
          {isLoading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>{loadingStep}</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>Generate Smart Code & Integration Flow</span>
            </>
          )}
        </button>
      </div>

      {/* Error Output */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-xs text-rose-300 animate-fadeIn">
          {error}
        </div>
      )}

      {/* Deliverable Outputs (Tabbed Panel) */}
      <div className="flex flex-col gap-4">
        {/* Tabs switcher */}
        <div className="flex border-b border-slate-800/60 pb-px">
          <button
            onClick={() => setActiveTab("arduino")}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium font-display transition-all border-b-2 -mb-px ${
              activeTab === "arduino"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode size={14} />
            <span>Firmware Arduino ESP32</span>
          </button>
          <button
            onClick={() => setActiveTab("nodered")}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium font-display transition-all border-b-2 -mb-px ${
              activeTab === "nodered"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers size={14} />
            <span>Flow Node-RED (Dashboard JSON)</span>
          </button>
          <button
            onClick={() => setActiveTab("wokwi")}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium font-display transition-all border-b-2 -mb-px ${
              activeTab === "wokwi"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu size={14} />
            <span>Sirkuit Wokwi diagram.json</span>
          </button>
        </div>

        {/* Content container */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-850/80 overflow-hidden relative shadow-inner">
          {/* Quick Actions Panel */}
          <div className="flex items-center justify-between px-5 py-3 bg-slate-900/50 border-b border-slate-900/60 text-xs">
            <span className="font-mono text-[10px] text-slate-500 uppercase">
              {activeTab === "arduino"
                ? "esp32_mqtt_pzem.ino"
                : activeTab === "nodered"
                ? "node_red_flow.json"
                : "diagram.json"}
            </span>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const content =
                    activeTab === "arduino"
                      ? arduinoCode
                      : activeTab === "nodered"
                      ? nodeRedFlow
                      : wokwiJson;
                  handleCopy(content, activeTab);
                }}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                title="Copy ke clipboard"
              >
                {copiedLabel === activeTab ? (
                  <>
                    <Check size={13} className="text-emerald-400" />
                    <span className="text-emerald-400 text-[10px] font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Clipboard size={13} />
                    <span className="text-[10px]">Copy</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (activeTab === "arduino") {
                    handleDownload("esp32_mqtt_pzem.ino", arduinoCode);
                  } else if (activeTab === "nodered") {
                    handleDownload("node_red_flow.json", nodeRedFlow);
                  } else {
                    handleDownload("diagram.json", wokwiJson);
                  }
                }}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                title="Download file"
              >
                <Download size={13} />
                <span className="text-[10px]">Download</span>
              </button>
            </div>
          </div>

          {/* Source Code Renderer */}
          <pre className="p-5 h-72 md:h-96 overflow-auto font-mono text-[11px] leading-relaxed text-slate-300 scrollbar bg-slate-950">
            {activeTab === "arduino" && arduinoCode}
            {activeTab === "nodered" && nodeRedFlow}
            {activeTab === "wokwi" && wokwiJson}
          </pre>
        </div>
      </div>

      {/* Usage Guide */}
      <div className="bg-slate-950/30 rounded-2xl p-4.5 border border-slate-850/60 flex flex-col gap-3.5">
        <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <HelpCircle size={15} className="text-blue-400" />
          Petunjuk Integrasi Perangkat Keras Nyata (Real Hardware Setup)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5 text-[11px] leading-relaxed text-slate-400">
          <div className="flex flex-col gap-1.5 p-3 bg-slate-950/40 rounded-xl border border-slate-900/80">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 bg-blue-500/10 text-blue-400 rounded-md flex items-center justify-center text-[9px] font-mono">1</span>
              Langkah Arduino IDE
            </span>
            <p className="text-[10.5px]">
              Install library <strong>PubSubClient</strong>, <strong>ArduinoJson</strong>, dan <strong>PZEM004Tv30</strong> di Library Manager. Salin kode Arduino, sesuaikan password WiFi, dan upload ke ESP32 NodeMCU.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 p-3 bg-slate-950/40 rounded-xl border border-slate-900/80">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 bg-blue-500/10 text-blue-400 rounded-md flex items-center justify-center text-[9px] font-mono">2</span>
              Langkah Node-RED Import
            </span>
            <p className="text-[10.5px]">
              Buka Editor Node-RED, klik Menu (kanan atas) &rarr; <strong>Import</strong>. Tempel salinan JSON flow dari tab kedua. Deploy flow tersebut untuk mengaktifkan UI Dashboard MQTT.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 p-3 bg-slate-950/40 rounded-xl border border-slate-900/80">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <span className="w-4 h-4 bg-blue-500/10 text-blue-400 rounded-md flex items-center justify-center text-[9px] font-mono">3</span>
              Langkah Wokwi Simulation
            </span>
            <p className="text-[10.5px]">
              Buka <a href="https://wokwi.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">wokwi.com</a>, buat project baru ESP32. Buka tab <strong>diagram.json</strong>, timpa isinya dengan JSON hasil generate untuk merakit kabel secara instan.
            </p>
          </div>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
