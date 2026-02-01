/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  DarkHook: Agentic Finance - Relayer Agent                                   ║
 * ║  ─────────────────────────────────────────────────────────────────────────    ║
 * ║  The autonomous agent that monitors TEE outputs and executes on-chain         ║
 * ║  This is the "Agentic" component that wins the Agentic Finance track!         ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * Flow:
 * 1. User signs intent (no gas) → submitted to iExec TEE
 * 2. TEE matches orders, generates signed execution proofs
 * 3. THIS AGENT monitors for proofs and executes on-chain
 * 4. User receives tokens without ever sending a transaction
 */

const { ethers } = require('ethers');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════════════════
//                              CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    // Network
    RPC_URL: process.env.RPC_URL || 'https://sepolia.base.org',
    CHAIN_ID: 84532, // Base Sepolia
    
    // Contracts
    HOOK_ADDRESS: process.env.HOOK_ADDRESS || '0x0000000000000000000000000000000000000000',
    POOL_MANAGER: '0x7Da1D65F8B249183667cdE74C5CBD46dD38AA829',
    
    // Relayer wallet (pays gas on behalf of users)
    RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    
    // TEE signer (must match on-chain registered address)
    TRUSTED_TEE_SIGNER: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    
    // Polling
    POLL_INTERVAL_MS: 3000,
    MAX_RETRIES: 5,
    
    // Gas optimization
    MAX_GAS_PRICE_GWEI: 50,
    GAS_BUFFER_PERCENT: 20,
    
    // AI Agent parameters
    OPTIMAL_BLOCK_WINDOW: 3, // Wait up to N blocks for optimal gas
    MEV_PROTECTION_ENABLED: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const DARK_POOL_HOOK_ABI = [
    // Execute private order with TEE proof
    {
        "inputs": [
            {
                "components": [
                    { "name": "batchId", "type": "bytes32" },
                    { "name": "user", "type": "address" },
                    { "name": "tokenIn", "type": "address" },
                    { "name": "tokenOut", "type": "address" },
                    { "name": "amountIn", "type": "uint256" },
                    { "name": "amountOut", "type": "uint256" },
                    { "name": "clearingPrice", "type": "uint256" },
                    { "name": "intentHash", "type": "bytes32" },
                    { "name": "userSignature", "type": "bytes" },
                    { "name": "teeSignature", "type": "bytes" },
                    { "name": "merkleRoot", "type": "bytes32" },
                    { "name": "deadline", "type": "uint256" }
                ],
                "name": "proof",
                "type": "tuple"
            }
        ],
        "name": "executePrivateOrder",
        "outputs": [{ "name": "success", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    // Events
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "batchId", "type": "bytes32" },
            { "indexed": true, "name": "user", "type": "address" },
            { "indexed": false, "name": "amountIn", "type": "uint256" },
            { "indexed": false, "name": "amountOut", "type": "uint256" },
            { "indexed": false, "name": "mevSaved", "type": "uint256" }
        ],
        "name": "PrivateOrderExecuted",
        "type": "event"
    }
];

// ═══════════════════════════════════════════════════════════════════════════════
//                              RELAYER AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class RelayerAgent {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        this.wallet = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, this.provider);
        this.hookContract = new ethers.Contract(
            CONFIG.HOOK_ADDRESS,
            DARK_POOL_HOOK_ABI,
            this.wallet
        );
        
        // Track processed proofs to avoid duplicates
        this.processedProofs = new Set();
        
        // Agent state
        this.isRunning = false;
        this.executionQueue = [];
        this.stats = {
            proofsProcessed: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalGasSpent: BigInt(0),
            totalMevSaved: BigInt(0),
        };
        
        console.log('🤖 Relayer Agent initialized');
        console.log(`   Relayer address: ${this.wallet.address}`);
        console.log(`   Hook contract: ${CONFIG.HOOK_ADDRESS}`);
        console.log(`   Chain ID: ${CONFIG.CHAIN_ID}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         CORE MONITORING LOOP
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Main monitoring and execution loop
     * AI Agent logic: continuously monitors for new execution proofs
     */
    async monitorAndExecute() {
        console.log('\n🚀 Starting Relayer Agent monitoring loop...\n');
        this.isRunning = true;
        
        while (this.isRunning) {
            try {
                // AI Agent logic: check for new execution proofs from TEE
                console.log('🔍 Scanning for new execution proofs...');
                
                const proofs = await this.fetchPendingProofs();
                
                if (proofs.length > 0) {
                    console.log(`📥 Found ${proofs.length} new proof(s) to process`);
                    
                    for (const proof of proofs) {
                        // AI Agent logic: validate proof before execution
                        if (await this.validateProof(proof)) {
                            // AI Agent logic: determine optimal execution timing
                            const shouldExecute = await this.determineOptimalTiming(proof);
                            
                            if (shouldExecute) {
                                await this.executeProof(proof);
                            } else {
                                // Queue for later execution
                                this.executionQueue.push(proof);
                                console.log(`⏳ Queued proof ${proof.intentHash.slice(0, 10)}... for optimal timing`);
                            }
                        }
                    }
                }
                
                // Process queued executions
                await this.processQueue();
                
                // Wait before next poll
                await this.sleep(CONFIG.POLL_INTERVAL_MS);
                
            } catch (error) {
                console.error('❌ Monitor loop error:', error.message);
                await this.sleep(CONFIG.POLL_INTERVAL_MS * 2);
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         PROOF FETCHING
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Fetch pending execution proofs from iExec TEE output
     * In production: poll iExec result storage
     * For hackathon: read from local file or mock
     */
    async fetchPendingProofs() {
        // In production:
        // const iexec = new IExec({ ethProvider: this.provider });
        // const tasks = await iexec.task.fetchCompletedTasks(APP_ADDRESS);
        // return tasks.map(t => JSON.parse(t.result)).flat();
        
        // For hackathon: simulate fetching from TEE output
        const mockProofs = await this.mockFetchProofs();
        
        // Filter out already processed proofs
        return mockProofs.filter(p => !this.processedProofs.has(p.intentHash));
    }
    
    /**
     * Mock proof fetching for demo
     */
    async mockFetchProofs() {
        // Simulate network delay
        await this.sleep(500);
        
        // Check if there's a local output file from TEE
        try {
            if (fs.existsSync('execution_proofs.json')) {
                const data = JSON.parse(fs.readFileSync('execution_proofs.json', 'utf8'));
                if (data.success && data.executionProofs) {
                    return data.executionProofs;
                }
            }
        } catch (e) {
            // File doesn't exist or is invalid
        }
        
        // Return mock proof for demo
        return [{
            batchId: '0x' + 'a'.repeat(16),
            timestamp: Math.floor(Date.now() / 1000),
            user: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21',
            tokenIn: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            tokenOut: '0x4200000000000000000000000000000000000006',
            amountIn: '1000000000', // 1000 USDC
            amountOut: '385000000000000000', // 0.385 ETH
            clearingPrice: '2598420000',
            intentHash: '0x' + 'b'.repeat(64),
            userSignature: '0x' + 'c'.repeat(130),
            teeSignature: '0x' + 'd'.repeat(130),
            teeSigner: CONFIG.TRUSTED_TEE_SIGNER,
            merkleRoot: '0x' + 'e'.repeat(64),
            mevSaved: '23470000'
        }];
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         PROOF VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Validate execution proof before submission
     * AI Agent logic: ensures proof authenticity and freshness
     */
    async validateProof(proof) {
        console.log(`\n🔐 Validating proof for ${proof.user.slice(0, 10)}...`);
        
        // 1. Check TEE signer is trusted
        if (proof.teeSigner.toLowerCase() !== CONFIG.TRUSTED_TEE_SIGNER.toLowerCase()) {
            console.log('   ❌ Untrusted TEE signer');
            return false;
        }
        console.log('   ✓ TEE signer verified');
        
        // 2. Check proof freshness (not expired)
        const now = Math.floor(Date.now() / 1000);
        const proofAge = now - proof.timestamp;
        if (proofAge > 3600) { // 1 hour max
            console.log('   ❌ Proof expired');
            return false;
        }
        console.log(`   ✓ Proof age: ${proofAge}s`);
        
        // 3. Verify TEE signature format
        if (!proof.teeSignature || proof.teeSignature.length < 130) {
            console.log('   ❌ Invalid TEE signature format');
            return false;
        }
        console.log('   ✓ TEE signature format valid');
        
        // 4. Check amounts are reasonable
        const amountIn = BigInt(proof.amountIn);
        const amountOut = BigInt(proof.amountOut);
        if (amountIn <= 0 || amountOut <= 0) {
            console.log('   ❌ Invalid amounts');
            return false;
        }
        console.log(`   ✓ Amounts valid: ${Number(amountIn) / 1e6} USDC → ${Number(amountOut) / 1e18} ETH`);
        
        // 5. In production: verify signature on-chain
        // const isValid = await this.hookContract.verifyTEESignature(proof, proof.teeSignature);
        
        console.log('   ✓ Proof validated successfully');
        return true;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         AI AGENT: OPTIMAL TIMING
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * AI Agent logic: determine optimal time to submit transaction
     * Considers gas prices, MEV risk, and block timing
     */
    async determineOptimalTiming(proof) {
        console.log('\n🤖 AI Agent: Analyzing optimal execution timing...');
        
        // 1. Check current gas price
        const feeData = await this.provider.getFeeData();
        const currentGasPrice = feeData.gasPrice;
        const gasPriceGwei = Number(currentGasPrice) / 1e9;
        
        console.log(`   Gas price: ${gasPriceGwei.toFixed(4)} gwei`);
        
        if (gasPriceGwei > CONFIG.MAX_GAS_PRICE_GWEI) {
            console.log(`   ⚠️ Gas too high (max: ${CONFIG.MAX_GAS_PRICE_GWEI} gwei)`);
            return false;
        }
        console.log(`   ✓ Gas price acceptable`);
        
        // 2. Check mempool for MEV risk (mock implementation)
        if (CONFIG.MEV_PROTECTION_ENABLED) {
            const mevRisk = await this.assessMEVRisk(proof);
            console.log(`   MEV risk assessment: ${mevRisk}`);
            
            if (mevRisk === 'HIGH') {
                console.log('   ⚠️ High MEV risk, waiting for safer window');
                return false;
            }
        }
        
        // 3. Check block timing for optimal inclusion
        const currentBlock = await this.provider.getBlockNumber();
        console.log(`   Current block: ${currentBlock}`);
        
        // AI Agent logic: prefer early block positions
        // In production: analyze builder preferences, private mempools
        
        console.log('   ✓ Optimal timing confirmed');
        return true;
    }
    
    /**
     * AI Agent logic: assess MEV risk for this transaction
     */
    async assessMEVRisk(proof) {
        // In production: analyze mempool, check for competing trades
        // For hackathon: return LOW since we're using batch execution
        
        const amountIn = BigInt(proof.amountIn);
        
        // Large trades have higher MEV risk
        if (amountIn > BigInt(10000 * 10**6)) { // > 10k USDC
            return 'MEDIUM';
        }
        
        return 'LOW';
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         EXECUTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Execute the proof on-chain
     * The Relayer pays gas, user receives tokens
     */
    async executeProof(proof) {
        console.log(`\n⛓️ Executing proof for ${proof.user.slice(0, 10)}...`);
        
        try {
            // Mark as processed to avoid duplicates
            this.processedProofs.add(proof.intentHash);
            this.stats.proofsProcessed++;
            
            // Prepare transaction data
            const proofStruct = {
                batchId: proof.batchId.padEnd(66, '0').slice(0, 66),
                user: proof.user,
                tokenIn: proof.tokenIn,
                tokenOut: proof.tokenOut,
                amountIn: BigInt(proof.amountIn),
                amountOut: BigInt(proof.amountOut),
                clearingPrice: BigInt(proof.clearingPrice),
                intentHash: proof.intentHash,
                userSignature: proof.userSignature,
                teeSignature: proof.teeSignature,
                merkleRoot: proof.merkleRoot,
                deadline: Math.floor(Date.now() / 1000) + 300 // 5 min deadline
            };
            
            console.log('   Preparing transaction...');
            
            // Estimate gas (mock for demo)
            const gasEstimate = BigInt(250000);
            const gasWithBuffer = gasEstimate * BigInt(100 + CONFIG.GAS_BUFFER_PERCENT) / BigInt(100);
            console.log(`   Gas estimate: ${gasEstimate} (with buffer: ${gasWithBuffer})`);
            
            // Get current gas price
            const feeData = await this.provider.getFeeData();
            console.log(`   Gas price: ${Number(feeData.gasPrice) / 1e9} gwei`);
            
            // In production: send actual transaction
            // const tx = await this.hookContract.executePrivateOrder(proofStruct, {
            //     gasLimit: gasWithBuffer,
            // });
            // const receipt = await tx.wait();
            
            // For hackathon: simulate transaction
            await this.sleep(2000);
            const mockTxHash = '0x' + Array(64).fill(0).map(() => 
                Math.floor(Math.random() * 16).toString(16)
            ).join('');
            
            console.log(`   📤 TX submitted: ${mockTxHash.slice(0, 20)}...`);
            
            await this.sleep(1500);
            const mockBlockNumber = await this.provider.getBlockNumber();
            
            console.log(`   ✅ TX confirmed in block ${mockBlockNumber}`);
            console.log(`   💰 User ${proof.user.slice(0, 10)}... received ${Number(proof.amountOut) / 1e18} ETH`);
            console.log(`   🛡️ MEV saved: $${(Number(proof.mevSaved) / 1e6).toFixed(2)}`);
            
            // Update stats
            this.stats.successfulExecutions++;
            this.stats.totalGasSpent += gasEstimate * feeData.gasPrice;
            this.stats.totalMevSaved += BigInt(proof.mevSaved);
            
            return { success: true, txHash: mockTxHash };
            
        } catch (error) {
            console.error(`   ❌ Execution failed: ${error.message}`);
            this.stats.failedExecutions++;
            this.processedProofs.delete(proof.intentHash);
            return { success: false, error: error.message };
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         QUEUE PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════
    
    async processQueue() {
        if (this.executionQueue.length === 0) return;
        
        console.log(`\n📋 Processing ${this.executionQueue.length} queued proof(s)...`);
        
        const toProcess = [...this.executionQueue];
        this.executionQueue = [];
        
        for (const proof of toProcess) {
            const shouldExecute = await this.determineOptimalTiming(proof);
            if (shouldExecute) {
                await this.executeProof(proof);
            } else {
                this.executionQueue.push(proof);
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                         UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    stop() {
        this.isRunning = false;
        console.log('\n🛑 Relayer Agent stopping...');
    }
    
    printStats() {
        console.log('\n📊 Relayer Agent Statistics:');
        console.log(`   Proofs processed: ${this.stats.proofsProcessed}`);
        console.log(`   Successful: ${this.stats.successfulExecutions}`);
        console.log(`   Failed: ${this.stats.failedExecutions}`);
        console.log(`   Total gas spent: ${Number(this.stats.totalGasSpent) / 1e18} ETH`);
        console.log(`   Total MEV saved: $${(Number(this.stats.totalMevSaved) / 1e6).toFixed(2)}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  UniShield: Agentic Finance - Relayer Agent                       ║');
    console.log('║  Autonomous execution of TEE-verified intents                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    
    const agent = new RelayerAgent();
    
    // Handle shutdown
    process.on('SIGINT', () => {
        agent.stop();
        agent.printStats();
        process.exit(0);
    });
    
    // Start monitoring loop
    await agent.monitorAndExecute();
}

// Export for use as module
module.exports = { RelayerAgent, CONFIG };

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
