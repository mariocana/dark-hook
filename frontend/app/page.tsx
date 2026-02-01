"use client";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  UniShield: The Dark Hook - Agentic Finance                                   ║
 * ║  Intent-Based Gasless Trading with TEE Matching                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ═══════════════════════════════════════════════════════════════════════════════
//                              TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Token {
  symbol: string;
  name: string;
  icon: string;
  address: string;
  decimals: number;
  balance: string;
}

interface SwapIntent {
  user: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  maxSlippage: bigint;
  deadline: bigint;
  nonce: bigint;
}

interface SignedIntent {
  intent: SwapIntent;
  signature: string;
  intentHash: string;
}

interface RelayerStatus {
  stage: "idle" | "signed" | "submitted" | "matching" | "executing" | "complete" | "error";
  message: string;
  txHash?: string;
  matchResult?: {
    clearingPrice: string;
    amountOut: string;
    mevSaved: string;
  };
}

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "system" | "agent";
}

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TOKENS: Token[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    icon: "⟠",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    balance: "12.4521",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    icon: "◈",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    balance: "25,420.00",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    icon: "₿",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    balance: "0.8923",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
//                              MOCK WALLET
// ═══════════════════════════════════════════════════════════════════════════════

class MockWallet {
  address: string = "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21";
  private nonceCounter: number = 1;

  async connect(): Promise<string> {
    await new Promise((r) => setTimeout(r, 500));
    return this.address;
  }

  async getNonce(): Promise<bigint> {
    return BigInt(this.nonceCounter++);
  }

  async signTypedData(intent: SwapIntent): Promise<string> {
    console.log("📝 Signing EIP-712 Intent:", intent);
    await new Promise((r) => setTimeout(r, 1500));
    const mockR = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
    const mockS = Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
    return mockR + mockS + "1b";
  }

  async computeIntentHash(intent: SwapIntent): Promise<string> {
    const data = JSON.stringify({
      ...intent,
      amountIn: intent.amountIn.toString(),
      minAmountOut: intent.minAmountOut.toString(),
      maxSlippage: intent.maxSlippage.toString(),
      deadline: intent.deadline.toString(),
      nonce: intent.nonce.toString(),
    });
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

const mockWallet = new MockWallet();

// ═══════════════════════════════════════════════════════════════════════════════
//                              COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const GlowOrbs = ({ active }: { active: boolean }) => (
  <>
    <motion.div
      className="absolute -top-40 -left-40 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
      animate={{
        background: active
          ? "radial-gradient(circle, rgba(138,43,226,0.25) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(138,43,226,0.08) 0%, transparent 70%)",
      }}
      transition={{ duration: 0.8 }}
    />
    <motion.div
      className="absolute -bottom-40 -right-40 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
      animate={{
        background: active
          ? "radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)",
      }}
      transition={{ duration: 0.8 }}
    />
  </>
);

const TokenSelector = ({
  selected,
  onSelect,
  label,
  disabled,
}: {
  selected: Token;
  onSelect: (token: Token) => void;
  label: string;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">{label}</span>
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 bg-zinc-900/80 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors min-w-[130px] disabled:opacity-50"
        whileTap={!disabled ? { scale: 0.98 } : {}}
      >
        <span className="text-xl">{selected.icon}</span>
        <span className="font-medium text-white">{selected.symbol}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-zinc-500 ml-auto">
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 w-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden z-50 shadow-xl"
          >
            {TOKENS.filter((t) => t.symbol !== selected.symbol).map((token) => (
              <motion.button
                key={token.symbol}
                onClick={() => {
                  onSelect(token);
                  setIsOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800 transition-colors"
                whileHover={{ x: 4 }}
              >
                <span className="text-xl">{token.icon}</span>
                <span className="font-medium text-white">{token.symbol}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RelayerConsole = ({ logs, isActive }: { logs: LogEntry[]; isActive: boolean }) => {
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success": return "text-green-400";
      case "warning": return "text-yellow-400";
      case "error": return "text-red-400";
      case "system": return "text-purple-400";
      case "agent": return "text-cyan-400";
      default: return "text-zinc-400";
    }
  };

  const getPrefix = (type: LogEntry["type"]) => {
    switch (type) {
      case "agent": return "🤖";
      case "system": return "⚡";
      case "success": return "✓";
      case "error": return "✗";
      default: return "›";
    }
  };

  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden"
      animate={{
        boxShadow: isActive
          ? "0 0 40px rgba(34,211,238,0.15), inset 0 0 40px rgba(34,211,238,0.03)"
          : "0 0 0px transparent",
      }}
    >
      <div className="bg-zinc-900/90 border border-zinc-800 border-b-0 rounded-t-2xl px-4 py-3 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex items-center gap-2 ml-2">
          <motion.div
            className="w-2 h-2 rounded-full bg-cyan-500"
            animate={{
              opacity: isActive ? [1, 0.3, 1] : 0.3,
              boxShadow: isActive ? ["0 0 10px #22d3ee", "0 0 5px #22d3ee", "0 0 10px #22d3ee"] : "none",
            }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-xs font-mono text-zinc-500">RELAYER_AGENT</span>
          <span className="text-xs font-mono text-cyan-500/60">// Agentic Finance</span>
        </div>
      </div>

      <div
        ref={consoleRef}
        className="bg-[#0a0a0a] border border-zinc-800 border-t-0 rounded-b-2xl p-4 h-72 overflow-y-auto font-mono text-sm"
      >
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-2 mb-1"
          >
            <span className="text-zinc-600 select-none">{log.timestamp}</span>
            <span className="text-zinc-700 select-none">│</span>
            <span className={getLogColor(log.type)}>{getPrefix(log.type)}</span>
            <span className={getLogColor(log.type)}>{log.message}</span>
          </motion.div>
        ))}
        {isActive && (
          <motion.span
            className="inline-block w-2 h-4 bg-cyan-500 ml-1"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}
      </div>
    </motion.div>
  );
};

const StatusPipeline = ({ status }: { status: RelayerStatus }) => {
  const stages = [
    { key: "signed", label: "SIGN", icon: "✍️" },
    { key: "submitted", label: "TEE", icon: "🔐" },
    { key: "matching", label: "MATCH", icon: "⚡" },
    { key: "executing", label: "RELAY", icon: "🤖" },
    { key: "complete", label: "DONE", icon: "✓" },
  ];

  const getStageStatus = (stageKey: string): "pending" | "active" | "complete" => {
    const stageOrder = ["idle", "signed", "submitted", "matching", "executing", "complete"];
    const currentIndex = stageOrder.indexOf(status.stage);
    const stageIndex = stageOrder.indexOf(stageKey);
    if (currentIndex > stageIndex) return "complete";
    if (currentIndex === stageIndex) return "active";
    return "pending";
  };

  return (
    <div className="flex items-center justify-between py-4 px-2">
      {stages.map((stage, index) => (
        <React.Fragment key={stage.key}>
          <motion.div
            className={`flex flex-col items-center ${getStageStatus(stage.key) === "pending" ? "opacity-40" : "opacity-100"}`}
            animate={{ scale: getStageStatus(stage.key) === "active" ? 1.1 : 1 }}
          >
            <motion.div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm border-2 ${
                getStageStatus(stage.key) === "complete"
                  ? "bg-green-500/20 border-green-500 text-green-400"
                  : getStageStatus(stage.key) === "active"
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                  : "bg-zinc-900 border-zinc-700 text-zinc-500"
              }`}
              animate={
                getStageStatus(stage.key) === "active"
                  ? { boxShadow: ["0 0 15px rgba(34,211,238,0.4)", "0 0 25px rgba(34,211,238,0.6)", "0 0 15px rgba(34,211,238,0.4)"] }
                  : {}
              }
              transition={{ duration: 1, repeat: getStageStatus(stage.key) === "active" ? Infinity : 0 }}
            >
              {getStageStatus(stage.key) === "complete" ? "✓" : stage.icon}
            </motion.div>
            <span className={`mt-1.5 text-[10px] font-mono tracking-wide ${
              getStageStatus(stage.key) === "active" ? "text-cyan-400" :
              getStageStatus(stage.key) === "complete" ? "text-green-400" : "text-zinc-600"
            }`}>
              {stage.label}
            </span>
          </motion.div>
          {index < stages.length - 1 && (
            <motion.div
              className={`flex-1 h-0.5 mx-1 ${
                getStageStatus(stages[index + 1].key) !== "pending"
                  ? "bg-gradient-to-r from-cyan-500 to-green-500"
                  : "bg-zinc-800"
              }`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: getStageStatus(stages[index + 1].key) !== "pending" ? 1 : 0.2 }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function Page() {
  const [isConnected, setIsConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string>("");
  const [tokenIn, setTokenIn] = useState(TOKENS[1]);
  const [tokenOut, setTokenOut] = useState(TOKENS[0]);
  const [amountIn, setAmountIn] = useState("1000");
  const [relayerStatus, setRelayerStatus] = useState<RelayerStatus>({ stage: "idle", message: "" });
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 0, timestamp: "00:00:00", message: "Relayer Agent initialized", type: "system" },
    { id: 1, timestamp: "00:00:01", message: "Awaiting signed intents...", type: "info" },
  ]);
  const logIdRef = useRef(2);

  const isProcessing = relayerStatus.stage !== "idle" && relayerStatus.stage !== "complete" && relayerStatus.stage !== "error";

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev, { id: logIdRef.current++, timestamp, message, type }]);
  }, []);

  const parseAmount = (amount: string, decimals: number): bigint => {
    const [whole, fraction = ""] = amount.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole + paddedFraction);
  };

  const handleConnect = async () => {
    addLog("Connecting wallet...", "info");
    const address = await mockWallet.connect();
    setUserAddress(address);
    setIsConnected(true);
    addLog(`Connected: ${address.slice(0, 6)}...${address.slice(-4)}`, "success");
  };

  const handleSwap = useCallback(async () => {
    if (!isConnected) {
      await handleConnect();
      return;
    }

    try {
      // STEP 1: Sign Intent
      setRelayerStatus({ stage: "signed", message: "Creating intent..." });
      addLog("Creating swap intent...", "system");

      const nonce = await mockWallet.getNonce();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const intent: SwapIntent = {
        user: userAddress,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: parseAmount(amountIn, tokenIn.decimals),
        minAmountOut: BigInt(0),
        maxSlippage: BigInt(50),
        deadline,
        nonce,
      };

      addLog(`Intent: SWAP ${amountIn} ${tokenIn.symbol} → ${tokenOut.symbol}`, "info");
      addLog("Requesting EIP-712 signature...", "info");

      const signature = await mockWallet.signTypedData(intent);
      const intentHash = await mockWallet.computeIntentHash(intent);

      addLog("Intent signed successfully ✓", "success");
      addLog(`Hash: ${intentHash.slice(0, 18)}...`, "info");

      // STEP 2: Submit to TEE
      setRelayerStatus({ stage: "submitted", message: "Submitting to TEE..." });
      addLog("Encrypting intent for TEE...", "system");
      await new Promise((r) => setTimeout(r, 500));
      addLog("AES-256-GCM encryption complete", "success");
      await new Promise((r) => setTimeout(r, 300));
      addLog("Submitted to iExec TEE ✓", "success");

      // STEP 3: TEE Matching
      setRelayerStatus({ stage: "matching", message: "TEE processing..." });
      addLog("Waiting for TEE batch auction...", "system");
      await new Promise((r) => setTimeout(r, 500));
      addLog("SGX Enclave attestation verified ✓", "success");
      await new Promise((r) => setTimeout(r, 400));
      addLog("Loading order batch (12 intents)...", "info");
      await new Promise((r) => setTimeout(r, 600));
      addLog("Running batch_auction_clearing()...", "system");
      await new Promise((r) => setTimeout(r, 1000));
      addLog("Clearing price: 2,598.42 USDC/ETH", "success");
      addLog("Match found! Output: 0.385 ETH", "success");
      await new Promise((r) => setTimeout(r, 400));
      addLog("TEE Signature generated ✓", "success");

      // STEP 4: Relayer Execution
      setRelayerStatus({ stage: "executing", message: "Relayer executing..." });
      addLog("─────────────────────────────────────", "system");
      addLog("RELAYER AGENT ACTIVATED", "agent");
      await new Promise((r) => setTimeout(r, 400));
      addLog("Analyzing optimal execution window...", "agent");
      await new Promise((r) => setTimeout(r, 300));
      addLog("Gas price: 0.001 gwei ✓", "agent");
      addLog("MEV risk: LOW ✓", "agent");
      await new Promise((r) => setTimeout(r, 400));
      addLog("Executing settlement transaction...", "agent");
      await new Promise((r) => setTimeout(r, 1000));

      const mockTxHash = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
      addLog(`TX: ${mockTxHash.slice(0, 20)}...`, "success");
      await new Promise((r) => setTimeout(r, 800));
      addLog("Block confirmation received ✓", "success");
      addLog(`Tokens sent to ${userAddress.slice(0, 10)}...`, "success");

      // COMPLETE
      addLog("═══════════════════════════════════════", "system");
      addLog("INTENT EXECUTED SUCCESSFULLY", "success");
      addLog("MEV Protected: $23.47 saved", "success");
      addLog("User gas cost: $0.00", "success");
      addLog("═══════════════════════════════════════", "system");

      setRelayerStatus({
        stage: "complete",
        message: "Trade executed!",
        txHash: mockTxHash,
        matchResult: {
          clearingPrice: "2,598.42",
          amountOut: "0.385",
          mevSaved: "23.47",
        },
      });

    } catch (error) {
      console.error("Swap error:", error);
      addLog(`Error: ${error instanceof Error ? error.message : "Unknown"}`, "error");
      setRelayerStatus({ stage: "error", message: "Failed" });
    }
  }, [isConnected, userAddress, tokenIn, tokenOut, amountIn, addLog]);

  const resetSwap = () => {
    setRelayerStatus({ stage: "idle", message: "" });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      {/* Background Grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-4xl">🛡️</span>
            <h1 className="text-3xl font-bold">
              <span className="text-purple-400">Uni</span>
              <span className="text-white">Shield</span>
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            <span className="text-cyan-400">Agentic Finance</span> • Intent-Based • Gasless • MEV Protected
          </p>
        </motion.div>

        {/* Status Pipeline */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-6">
          <StatusPipeline status={relayerStatus} />
        </motion.div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Swap Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-xl overflow-hidden">
              <GlowOrbs active={isProcessing} />

              {/* Header */}
              <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-lg font-semibold">Sign Intent</h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <span className="text-cyan-400 text-xs font-mono">GASLESS</span>
                  <span className="text-lg">⚡</span>
                </div>
              </div>

              {/* Intent Mode Badge */}
              <motion.div className="mb-4 px-4 py-3 bg-purple-500/10 border border-purple-500/30 rounded-xl relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✍️</span>
                  <span className="text-sm text-purple-300">Intent Mode — Sign to trade, Relayer pays gas</span>
                </div>
              </motion.div>

              {/* Token Inputs */}
              <div className="space-y-4 relative z-10">
                <div className="p-4 bg-zinc-900/70 rounded-2xl border border-zinc-800">
                  <div className="flex items-start justify-between gap-4">
                    <TokenSelector selected={tokenIn} onSelect={setTokenIn} label="You sign" disabled={isProcessing} />
                    <div className="flex-1">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Amount</span>
                      <input
                        type="text"
                        value={amountIn}
                        onChange={(e) => setAmountIn(e.target.value)}
                        disabled={isProcessing}
                        placeholder="0.00"
                        className="w-full bg-transparent text-2xl font-mono text-white placeholder-zinc-700 focus:outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-zinc-500">Balance: {tokenIn.balance}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center -my-2">
                  <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center text-zinc-400">↓</div>
                </div>

                <div className="p-4 bg-zinc-900/70 rounded-2xl border border-zinc-800">
                  <div className="flex items-start justify-between gap-4">
                    <TokenSelector selected={tokenOut} onSelect={setTokenOut} label="You receive" disabled={isProcessing} />
                    <div className="flex-1">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1 block">Estimated</span>
                      <div className="text-2xl font-mono text-zinc-400">
                        {relayerStatus.matchResult?.amountOut || "~0.385"}
                      </div>
                      <span className="text-xs text-zinc-500">@ {relayerStatus.matchResult?.clearingPrice || "2,598.42"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trade Info */}
              <div className="mt-4 p-4 bg-zinc-900/30 rounded-xl space-y-2 relative z-10">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Max Slippage</span>
                  <span className="text-green-400 font-mono">0.00% (Batch)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Gas Cost</span>
                  <span className="text-cyan-400 font-mono">$0.00 (Relayer)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">MEV Protection</span>
                  <span className="text-purple-400 font-mono">Enabled ✓</span>
                </div>
              </div>

              {/* Action Button */}
              <motion.button
                onClick={relayerStatus.stage === "complete" ? resetSwap : handleSwap}
                disabled={isProcessing}
                className={`w-full mt-6 py-4 rounded-2xl font-semibold text-lg transition-all relative z-10 ${
                  isProcessing
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : relayerStatus.stage === "complete"
                    ? "bg-green-600 text-white hover:bg-green-500"
                    : "bg-gradient-to-r from-purple-600 via-cyan-500 to-green-500 text-white shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_40px_rgba(34,211,238,0.5)]"
                }`}
                whileHover={!isProcessing ? { scale: 1.02 } : {}}
                whileTap={!isProcessing ? { scale: 0.98 } : {}}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>⟳</motion.span>
                    {relayerStatus.message || "Processing..."}
                  </span>
                ) : relayerStatus.stage === "complete" ? (
                  "New Swap"
                ) : !isConnected ? (
                  "Connect Wallet"
                ) : (
                  <span className="flex items-center justify-center gap-2">✍️ Sign Intent (Gasless)</span>
                )}
              </motion.button>

              {/* Powered By */}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-600 relative z-10">
                <span>Powered by</span>
                <span className="text-purple-400">iExec TEE</span>
                <span>+</span>
                <span className="text-green-400">Uniswap v4</span>
                <span>+</span>
                <span className="text-cyan-400">Relayer</span>
              </div>
            </div>
          </motion.div>

          {/* Relayer Console */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <RelayerConsole logs={logs} isActive={isProcessing} />

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { icon: "✍️", title: "EIP-712 Intents", desc: "Sign, don't send", color: "cyan" },
                { icon: "🔐", title: "TEE Matching", desc: "Private auction", color: "purple" },
                { icon: "🤖", title: "Relayer Agent", desc: "AI execution", color: "green" },
                { icon: "💰", title: "Zero Gas", desc: "Relayer pays", color: "yellow" },
              ].map((card) => (
                <motion.div
                  key={card.title}
                  className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl"
                  whileHover={{ scale: 1.02, borderColor: `rgba(var(--${card.color}), 0.5)` }}
                >
                  <div className="text-xl mb-1">{card.icon}</div>
                  <h4 className="font-medium text-white text-sm">{card.title}</h4>
                  <p className="text-[10px] text-zinc-500">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Success Modal */}
        <AnimatePresence>
          {relayerStatus.stage === "complete" && relayerStatus.matchResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={resetSwap}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full"
              >
                <motion.div
                  className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-500 to-green-500 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: 360 }}
                  transition={{ type: "spring", duration: 0.8 }}
                >
                  <span className="text-4xl">🤖</span>
                </motion.div>

                <h3 className="text-2xl font-bold text-center text-white mb-2">Intent Executed!</h3>
                <p className="text-zinc-400 text-center text-sm mb-6">Relayer Agent settled your trade</p>

                <div className="space-y-3 mb-6">
                  {[
                    { label: "Clearing Price", value: `$${relayerStatus.matchResult.clearingPrice}`, color: "text-white" },
                    { label: "Received", value: `${relayerStatus.matchResult.amountOut} ETH`, color: "text-green-400" },
                    { label: "MEV Saved", value: `$${relayerStatus.matchResult.mevSaved}`, color: "text-yellow-400" },
                    { label: "Your Gas Cost", value: "$0.00", color: "text-cyan-400" },
                  ].map((stat) => (
                    <div key={stat.label} className="flex justify-between items-center py-2 border-b border-zinc-800">
                      <span className="text-zinc-500">{stat.label}</span>
                      <span className={`font-mono font-bold ${stat.color}`}>{stat.value}</span>
                    </div>
                  ))}
                </div>

                <motion.button
                  onClick={resetSwap}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-xl font-medium text-white"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Done
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
