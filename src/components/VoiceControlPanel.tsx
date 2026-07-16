import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Settings,
  HelpCircle,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LightState } from "../types";

interface VoiceControlPanelProps {
  state: LightState;
  onChange: (updates: Partial<LightState>) => void;
}

interface CustomCommand {
  id: string;
  label: string;
  defaultPhrase: string;
  phrase: string;
  actionType: "toggle_relay" | "all_on" | "all_off";
  relayId?: number; // 1-indexed
  targetState?: boolean; // For explicit ON/OFF
}

const DEFAULT_COMMANDS: CustomCommand[] = [
  {
    id: "wall_on",
    label: "Nyalakan Lampu Dinding",
    defaultPhrase: "nyalakan lampu dinding",
    phrase: "nyalakan lampu dinding",
    actionType: "toggle_relay",
    relayId: 1,
    targetState: true
  },
  {
    id: "wall_off",
    label: "Matikan Lampu Dinding",
    defaultPhrase: "matikan lampu dinding",
    phrase: "matikan lampu dinding",
    actionType: "toggle_relay",
    relayId: 1,
    targetState: false
  },
  {
    id: "strip_on",
    label: "Nyalakan LED Strip Plafon",
    defaultPhrase: "nyalakan strip plafon",
    phrase: "nyalakan strip plafon",
    actionType: "toggle_relay",
    relayId: 2,
    targetState: true
  },
  {
    id: "strip_off",
    label: "Matikan LED Strip Plafon",
    defaultPhrase: "matikan strip plafon",
    phrase: "matikan strip plafon",
    actionType: "toggle_relay",
    relayId: 2,
    targetState: false
  },
  {
    id: "desk_on",
    label: "Nyalakan Lampu Belajar",
    defaultPhrase: "nyalakan lampu belajar",
    phrase: "nyalakan lampu belajar",
    actionType: "toggle_relay",
    relayId: 3,
    targetState: true
  },
  {
    id: "desk_off",
    label: "Matikan Lampu Belajar",
    defaultPhrase: "matikan lampu belajar",
    phrase: "matikan lampu belajar",
    actionType: "toggle_relay",
    relayId: 3,
    targetState: false
  },
  {
    id: "ac_on",
    label: "Nyalakan AC",
    defaultPhrase: "nyalakan ac",
    phrase: "nyalakan ac",
    actionType: "toggle_relay",
    relayId: 4,
    targetState: true
  },
  {
    id: "ac_off",
    label: "Matikan AC",
    defaultPhrase: "matikan ac",
    phrase: "matikan ac",
    actionType: "toggle_relay",
    relayId: 4,
    targetState: false
  },
  {
    id: "all_on",
    label: "Nyalakan Semua Perangkat",
    defaultPhrase: "nyalakan semua",
    phrase: "nyalakan semua",
    actionType: "all_on"
  },
  {
    id: "all_off",
    label: "Matikan Semua Perangkat",
    defaultPhrase: "matikan semua",
    phrase: "matikan semua",
    actionType: "all_off"
  }
];

export const VoiceControlPanel: React.FC<VoiceControlPanelProps> = ({ state, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isContinuousListening, setIsContinuousListening] = useState(false);
  const isContinuousListeningRef = useRef(false);
  const isListeningRef = useRef(false);

  const [transcript, setTranscript] = useState("");
  const [matchedCommand, setMatchedCommand] = useState<CustomCommand | null>(null);
  const [commands, setCommands] = useState<CustomCommand[]>(() => {
    const saved = localStorage.getItem("iot_voice_commands");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_COMMANDS;
      }
    }
    return DEFAULT_COMMANDS;
  });

  const [showSettings, setShowSettings] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [simText, setSimText] = useState(""); // Support for simulation typing inside iframe
  
  const recognitionRef = useRef<any>(null);
  const lastExecutedRef = useRef<{ id: string; time: number } | null>(null);
  const lastSpokenRef = useRef<{ text: string; time: number } | null>(null);

  // Keep state, commands, and onChange refs updated to prevent stale closures
  const stateRef = useRef(state);
  const onChangeRef = useRef(onChange);
  const commandsRef = useRef(commands);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  // Keep refs in sync to prevent stale closures in the Web Speech API callback listeners
  useEffect(() => {
    isContinuousListeningRef.current = isContinuousListening;
  }, [isContinuousListening]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Save commands to localstorage
  useEffect(() => {
    localStorage.setItem("iot_voice_commands", JSON.stringify(commands));
  }, [commands]);

  // Listen for global shortcut event to trigger listening
  useEffect(() => {
    const handleTrigger = () => {
      setIsOpen(true);
      setTimeout(() => {
        const btn = document.getElementById("mic-trigger-btn");
        if (btn) {
          btn.click();
        }
      }, 300);
    };
    window.addEventListener("trigger-voice-listen", handleTrigger);
    return () => {
      window.removeEventListener("trigger-voice-listen", handleTrigger);
    };
  }, []);

  const lastSpokenTextRef = useRef<string>("");
  const lastSpokenTimeRef = useRef<number>(0);

  const speakStatus = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const now = Date.now();
    // Strict duplicate check: if same text within 4 seconds, or ANY text within 1.5 seconds, ignore
    if (
      (lastSpokenTextRef.current === text && now - lastSpokenTimeRef.current < 4000) ||
      (now - lastSpokenTimeRef.current < 1500)
    ) {
      console.log("Prevented duplicate TTS speech for:", text);
      return;
    }
    
    lastSpokenTextRef.current = text;
    lastSpokenTimeRef.current = now;

    try {
      window.speechSynthesis.cancel();
      
      // Delay speech slightly to allow the speech engine queue to clear fully
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "id-ID";
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find((v) => v.lang.startsWith("id") || v.lang.startsWith("in"));
        if (idVoice) {
          utterance.voice = idVoice;
        }
        window.speechSynthesis.speak(utterance);
      }, 50);
    } catch (e) {
      console.error("TTS failed:", e);
    }
  };

  const executeAction = (cmd: CustomCommand) => {
    const now = Date.now();
    if (lastExecutedRef.current && lastExecutedRef.current.id === cmd.id && now - lastExecutedRef.current.time < 2000) {
      console.log("Prevented duplicate execution of command:", cmd.label);
      return;
    }
    lastExecutedRef.current = { id: cmd.id, time: now };

    if (cmd.actionType === "toggle_relay" && cmd.relayId && cmd.targetState !== undefined) {
      const updatedChannels = stateRef.current.channels.map((ch) => {
        if (ch.id === cmd.relayId) {
          return { ...ch, isOn: cmd.targetState };
        }
        return ch;
      });
      onChangeRef.current({ channels: updatedChannels });
    } else if (cmd.actionType === "all_on") {
      const updatedChannels = stateRef.current.channels.map((ch) => ({ ...ch, isOn: true }));
      onChangeRef.current({ channels: updatedChannels });
    } else if (cmd.actionType === "all_off") {
      const updatedChannels = stateRef.current.channels.map((ch) => ({ ...ch, isOn: false }));
      onChangeRef.current({ channels: updatedChannels });
    }

    // Speak successful action status in Indonesian
    speakStatus(`Berhasil, ${cmd.label}`);
  };

  // Match the transcript with our list of custom commands
  const processCommandText = (text: string) => {
    const normalizedSpeech = text.toLowerCase().trim();
    let bestMatch: CustomCommand | null = null;

    // Direct exact or loose matching using current commands ref
    for (const cmd of commandsRef.current) {
      const phraseNorm = cmd.phrase.toLowerCase().trim();
      if (normalizedSpeech.includes(phraseNorm) || phraseNorm.includes(normalizedSpeech)) {
        bestMatch = cmd;
        break;
      }
    }

    if (bestMatch) {
      setMatchedCommand(bestMatch);
      executeAction(bestMatch);
    } else {
      setMatchedCommand(null);
    }
  };

  const processCommandTextRef = useRef(processCommandText);
  useEffect(() => {
    processCommandTextRef.current = processCommandText;
  });

  // Speech Recognition API setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setUnsupported(true);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "id-ID"; // Default to Indonesian

    let isDestroyed = false;

    rec.onstart = () => {
      if (isDestroyed) return;
      setIsListening(true);
      setTranscript("Mendengarkan... Silakan ucapkan perintah Anda.");
      setMatchedCommand(null);
    };

    rec.onerror = (event: any) => {
      if (isDestroyed) return;
      console.error("Speech recognition error", event.error);
      if (event.error === "not-allowed") {
        setTranscript("Gagal: Izin mikrofon ditolak oleh browser.");
      } else {
        setTranscript(`Kesalahan: ${event.error}`);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      if (isDestroyed) return;
      setIsListening(false);
      // Auto-restart if Mode Listening (Continuous) is active
      if (isContinuousListeningRef.current) {
        setTimeout(() => {
          if (isDestroyed) return;
          if (isContinuousListeningRef.current && !isListeningRef.current) {
            try {
              rec.start();
            } catch (e) {
              console.error("Failed to auto-restart speech recognition:", e);
            }
          }
        }, 450);
      }
    };

    rec.onresult = (event: any) => {
      if (isDestroyed) return;
      const resultIndex = event.resultIndex;
      const result = event.results[resultIndex];
      // Skip intermediate/non-final speech recognition results
      if (result && !result.isFinal) {
        return;
      }
      const speechToText = result[0].transcript;
      setTranscript(`Mendengar: "${speechToText}"`);
      processCommandTextRef.current(speechToText);
    };

    recognitionRef.current = rec;

    return () => {
      isDestroyed = true;
      try {
        rec.abort();
      } catch (e) {
        // ignore
      }
      rec.onstart = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onresult = null;
    };
  }, []);

  const toggleListen = () => {
    if (unsupported) {
      return;
    }

    if (isListening) {
      setIsContinuousListening(false);
      isContinuousListeningRef.current = false;
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleContinuousListening = () => {
    if (unsupported) return;
    const nextVal = !isContinuousListening;
    setIsContinuousListening(nextVal);
    isContinuousListeningRef.current = nextVal;
    
    if (nextVal) {
      setIsOpen(true);
      if (!isListening) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error(e);
          }
        }, 100);
      }
    } else {
      if (isListening) {
        try {
          recognitionRef.current?.stop();
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  // Helper to trigger direct command via button or text input (very important inside sandboxed Iframe where Mic permissions might be blocked)
  const handleSimulateCommand = (phrase: string) => {
    setTranscript(`Simulasi Mendengar: "${phrase}"`);
    processCommandText(phrase);
  };

  const handleSimulateCustomText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim()) return;
    handleSimulateCommand(simText);
    setSimText("");
  };

  const handleUpdatePhrase = (id: string, newPhrase: string) => {
    setCommands((prev) =>
      prev.map((cmd) => (cmd.id === id ? { ...cmd, phrase: newPhrase } : cmd))
    );
  };

  const handleResetPhrases = () => {
    if (window.confirm("Apakah Anda ingin mereset semua perintah suara ke default?")) {
      setCommands(DEFAULT_COMMANDS);
    }
  };

  return (
    <div className="glass rounded-3xl p-6 flex flex-col gap-5 shadow-xl border border-slate-800/60" id="voice-control-panel">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between cursor-pointer select-none group transition-all duration-300 ${isOpen ? "border-b border-slate-800 pb-4" : ""}`}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-display font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Mic className={`${isListening ? "text-red-500 animate-pulse" : "text-red-400"}`} size={18} />
            Voice Control Command (Smart AI Listener)
            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-mono ml-2">
              Asisten Suara
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Kendalikan sirkuit Smart Study Room dengan perintah suara Bahasa Indonesia kustom Anda
          </p>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setIsOpen(true);
              setShowSettings(!showSettings);
            }}
            className={`p-2 rounded-xl border transition-all ${
              showSettings
                ? "bg-[#ff6d5a]/10 border-[#ff6d5a]/20 text-[#ff6d5a]"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
            }`}
            title="Custom Kata Perintah"
          >
            <Settings size={15} />
          </button>
          <div className={`p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition-all duration-300 ${isOpen ? "rotate-180 text-[#ff6d5a] border-[#ff6d5a]/20" : "group-hover:text-slate-200"}`}>
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
            className="overflow-hidden flex flex-col gap-5"
          >
            {/* Main Mic Interface */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Left Column: Big Mic Button & Visualizer */}
        <div className="md:col-span-4 flex flex-col items-center justify-center bg-slate-950/40 border border-slate-900 rounded-2xl p-6">
          <button
            onClick={toggleListen}
            disabled={unsupported}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-4 relative ${
              isListening
                ? "bg-red-500/20 border-red-500 shadow-lg shadow-red-500/40 text-red-400 animate-pulse"
                : unsupported
                ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                : "bg-[#ff6d5a] hover:bg-[#ff897a] border-[#ff6d5a]/20 text-white hover:scale-105"
            }`}
            id="mic-trigger-btn"
          >
            {isListening ? <Mic size={32} /> : <MicOff size={32} />}

            {/* Glowing soundwave ripple rings */}
            {isListening && (
              <>
                <span className="absolute -inset-2 border border-red-500/40 rounded-full animate-ping" style={{ animationDuration: "1.5s" }} />
                <span className="absolute -inset-4 border border-red-500/20 rounded-full animate-ping" style={{ animationDuration: "2s" }} />
              </>
            )}
          </button>

          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mt-4">
            {isListening ? "Listening Now..." : unsupported ? "MIC BLOCKED/UNSUPPORTED" : "TAP TO TALK"}
          </span>

          {unsupported && (
            <p className="text-[9px] text-amber-500 text-center mt-2 leading-relaxed">
              *Microphone API terblokir oleh aturan sandbox/iFrame. Silakan gunakan <strong>Text Simulator</strong> di kanan untuk mencoba!
            </p>
          )}

          {/* Mode Listening (Continuous) Switch */}
          <div className="flex items-center justify-between w-full mt-5 bg-slate-900/60 border border-slate-800/60 px-3.5 py-2.5 rounded-2xl shadow-inner">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-200 tracking-tight flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isContinuousListening ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
                Mode Listening
              </span>
              <span className="text-[9px] text-slate-400 font-medium leading-tight">Hands-free tanpa klik mic</span>
            </div>
            <button
              onClick={toggleContinuousListening}
              disabled={unsupported}
              className={`w-11 h-6.5 flex items-center rounded-full p-0.5 transition-colors duration-300 relative cursor-pointer ${
                isContinuousListening ? "bg-red-500 shadow-md shadow-red-500/20" : "bg-slate-800"
              } ${unsupported ? "opacity-40 cursor-not-allowed" : ""}`}
              title="Aktifkan Asisten Selalu Mendengar (Hands-free)"
            >
              <div
                className={`bg-white w-5.5 h-5.5 rounded-full shadow-md transform transition-transform duration-300 ${
                  isContinuousListening ? "translate-x-4.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Right Column: Console & Text Simulator */}
        <div className="md:col-span-8 flex flex-col gap-4">
          {/* Transcript Screen */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4.5 min-h-[96px] flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">Live Voice Console</span>
              <p className={`text-xs mt-1.5 font-medium leading-relaxed ${
                transcript.startsWith("Mendengar:") ? "text-emerald-400" :
                transcript.startsWith("Simulasi") ? "text-blue-400" :
                transcript.startsWith("Gagal:") || transcript.startsWith("Kesalahan:") ? "text-rose-400" :
                "text-slate-300 animate-pulse"
              }`}>
                {transcript || "Klik tombol mikrofon di samping untuk mulai merekam perintah suara..."}
              </p>
            </div>

            {/* Highlighted Match Action */}
            {matchedCommand && (
              <div className="mt-3.5 pt-3 border-t border-slate-900 flex items-center gap-2 text-[10.5px] text-emerald-400 animate-fadeIn">
                <Check size={13} className="shrink-0" />
                <span>Mendeteksi perintah: <strong>"{matchedCommand.label}"</strong> Berhasil dieksekusi!</span>
              </div>
            )}
            
            {/* Listening Waveform visualizer */}
            {isListening && (
              <div className="absolute bottom-2 right-4 flex items-end gap-1 h-6">
                <div className="w-1 bg-red-500 animate-bounce h-3 rounded" style={{ animationDelay: "0.1s" }} />
                <div className="w-1 bg-red-500 animate-bounce h-5 rounded" style={{ animationDelay: "0.3s" }} />
                <div className="w-1 bg-red-500 animate-bounce h-2 rounded" style={{ animationDelay: "0.5s" }} />
                <div className="w-1 bg-red-500 animate-bounce h-6 rounded" style={{ animationDelay: "0.2s" }} />
                <div className="w-1 bg-red-500 animate-bounce h-4 rounded" style={{ animationDelay: "0.4s" }} />
              </div>
            )}
          </div>

          {/* Text input Command Simulator (Ensures compatibility inside sandboxed preview window!) */}
          <form onSubmit={handleSimulateCustomText} className="flex gap-2">
            <input
              type="text"
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
              placeholder="Ketik perintah suara di sini untuk simulasi (misal: nyalakan ac)..."
              className="grow px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-sans"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl text-xs font-bold border border-blue-500/30 flex items-center gap-1 shrink-0 transition-colors"
            >
              <Play size={12} />
              <span>Simulasikan</span>
            </button>
          </form>
        </div>
      </div>

      {/* Preset click triggers for fast trial */}
      <div className="bg-slate-950/20 rounded-2xl p-3.5 border border-slate-900/60 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-amber-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pemicu Cepat (Klik untuk Mencoba Perintah)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {commands.slice(0, 8).map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => handleSimulateCommand(cmd.phrase)}
              className="px-2.5 py-1.5 bg-slate-950/60 hover:bg-slate-900 text-[10px] text-slate-300 rounded-lg border border-slate-900 transition-colors hover:border-slate-800"
            >
              "{cmd.phrase}"
            </button>
          ))}
        </div>
      </div>

      {/* Settings / Configuration of Custom Phrases */}
      {showSettings && (
        <div className="p-5 bg-slate-950/60 border border-blue-500/10 rounded-2xl flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Settings size={13} className="text-blue-400" />
              Kostumisasi Perintah Suara (Kata Sandi)
            </span>
            <button
              onClick={handleResetPhrases}
              className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
            >
              <RotateCcw size={11} />
              Reset ke Default
            </button>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/40 p-2.5 rounded-xl border border-slate-900">
            Masukkan kata pemicu dalam Bahasa Indonesia yang Anda inginkan untuk masing-masing aksi di bawah. AI akan memproses perintah Anda secara cerdas berdasarkan kecocokan kata kunci.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {commands.map((cmd) => (
              <div key={cmd.id} className="flex flex-col gap-1.5 p-3 bg-slate-950 rounded-xl border border-slate-900">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="font-bold text-slate-300">{cmd.label}</span>
                  <span className="text-[9px] text-slate-500 font-mono">ID: {cmd.id}</span>
                </div>
                <input
                  type="text"
                  value={cmd.phrase}
                  onChange={(e) => handleUpdatePhrase(cmd.id, e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-100 font-sans focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
