import React, { useState, useRef, useCallback } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = 'contracts' | 'deploy' | 'autogen' | 'frontend' | 'guide';

// ── Code block component ──────────────────────────────────────────────────────
function CodeBlock({
  code, lang = 'js', title, onCopy,
}: { code: string; lang?: string; title?: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    ExpoClipboard.setStringAsync(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
    onCopy?.();
  }, [code, onCopy]);
  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: code, title: title ?? 'BTNG Code' });
    } catch { /* ignore */ }
  }, [code, title]);
  return (
    <View style={cb.container}>
      {title ? (
        <View style={cb.header}>
          <View style={cb.langChip}>
            <Text style={cb.langText}>{lang.toUpperCase()}</Text>
          </View>
          <Text style={cb.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity style={cb.shareBtn} onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="share" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[cb.copyBtn, copied && cb.copyBtnDone]} onPress={handleCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name={copied ? 'check-circle' : 'content-copy'} size={13} color={copied ? Colors.success : Colors.primary} />
            <Text style={[cb.copyBtnText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cb.scroll}>
        <Text style={cb.code} selectable>{code}</Text>
      </ScrollView>
      {!title && (
        <TouchableOpacity style={[cb.floatCopy, copied && cb.floatCopyDone]} onPress={handleCopy}>
          <MaterialIcons name={copied ? 'check-circle' : 'content-copy'} size={12} color={copied ? Colors.success : Colors.primary} />
          <Text style={[cb.floatCopyText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const cb = StyleSheet.create({
  container: { backgroundColor: '#060608', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginVertical: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  langChip: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  langText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  title: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  shareBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  copyBtnText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  scroll: { maxHeight: 260 },
  code: { fontSize: 11, color: '#D4A017', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', padding: Spacing.md, lineHeight: 18, includeFontPadding: false },
  floatCopy: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', margin: Spacing.sm, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  floatCopyDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  floatCopyText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, badge, badgeColor }: {
  title: string; icon: string; children: React.ReactNode;
  badge?: string; badgeColor?: string;
}) {
  return (
    <View style={sc.card}>
      <View style={sc.header}>
        <View style={sc.iconWrap}><MaterialIcons name={icon as any} size={16} color={Colors.primary} /></View>
        <Text style={sc.title}>{title}</Text>
        {badge ? (
          <View style={[sc.badge, { backgroundColor: (badgeColor ?? Colors.primary) + '18', borderColor: (badgeColor ?? Colors.primary) + '44' }]}>
            <Text style={[sc.badgeText, { color: badgeColor ?? Colors.primary }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={sc.body}>{children}</View>
    </View>
  );
}

const sc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  body: { padding: Spacing.md, gap: Spacing.sm },
});

// ── Step row ──────────────────────────────────────────────────────────────────
function StepRow({ n, text, color = Colors.primary }: { n: string; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: 6 }}>
      <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: FontWeight.heavy, color, includeFontPadding: false }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false }}>{text}</Text>
    </View>
  );
}

// ── Code blocks ───────────────────────────────────────────────────────────────
const HARDHAT_CONFIG = `require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: ["YOUR_PRIVATE_KEY_HERE"]
    },
    bscMainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: ["YOUR_PRIVATE_KEY_HERE"]
    },
    btngNode: {
      url: "http://72.62.160.237:64799",
      chainId: 2026,
      accounts: ["YOUR_PRIVATE_KEY_HERE"]
    }
  },
  etherscan: {
    apiKey: "YOUR_BSCSCAN_API_KEY"
  }
};`;

const BTNG_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BituncoinGold is ERC20, Ownable {
    constructor() ERC20("Bituncoin Gold", "BTNG") {
        _mint(msg.sender, 21_000_000 * 10 ** decimals());
    }
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}`;

const AFN_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AfricanNote is ERC20, Ownable {
    constructor() ERC20("African Note", "AFN") {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}`;

const ENGINE_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BituncoinGold.sol";
import "./AfricanNote.sol";

contract BTNGNodeEngine is Ownable, ReentrancyGuard {
    BituncoinGold public btng;
    AfricanNote public afn;

    uint256 public constant AFN_PER_BLOCK = 10 * 10**18;
    uint256 public constant NODE_COST = 100 * 10**18;
    uint256 public constant SWAP_RATE = 1000;
    uint256 public constant SWAP_FEE_PERCENT = 2;

    struct Node {
        address owner;
        uint256 registeredAt;
        uint256 lastClaim;
        bool active;
    }
    mapping(uint256 => Node) public nodes;
    uint256 public nextNodeId;

    event NodeCreated(uint256 nodeId, address owner);
    event RewardsClaimed(uint256 nodeId, uint256 afnAmount);
    event Swapped(address user, uint256 afnAmount, uint256 btngOut);

    constructor(address _btng, address _afn) {
        btng = BituncoinGold(_btng);
        afn = AfricanNote(_afn);
    }

    function createNode() external nonReentrant {
        require(btng.balanceOf(msg.sender) >= NODE_COST, "Insufficient BTNG");
        require(btng.transferFrom(msg.sender, address(this), NODE_COST));
        nodes[nextNodeId] = Node({
            owner: msg.sender,
            registeredAt: block.timestamp,
            lastClaim: block.timestamp,
            active: true
        });
        emit NodeCreated(nextNodeId, msg.sender);
        nextNodeId++;
    }

    function pendingRewards(uint256 nodeId) public view returns (uint256) {
        Node memory node = nodes[nodeId];
        if (!node.active) return 0;
        uint256 timePassed = block.timestamp - node.lastClaim;
        uint256 blocksPassed = timePassed / 3;
        return blocksPassed * AFN_PER_BLOCK;
    }

    function claimRewards(uint256 nodeId) external nonReentrant {
        require(nodes[nodeId].owner == msg.sender, "Not your node");
        require(nodes[nodeId].active, "Node inactive");
        uint256 reward = pendingRewards(nodeId);
        require(reward > 0, "No rewards");
        nodes[nodeId].lastClaim = block.timestamp;
        afn.mint(msg.sender, reward);
        emit RewardsClaimed(nodeId, reward);
    }

    function swapAfnToBtng(uint256 afnAmount) external nonReentrant {
        require(afnAmount >= SWAP_RATE * 10**18, "Amount too low");
        uint256 btngOut = (afnAmount / SWAP_RATE) / 10**18;
        uint256 fee = (btngOut * SWAP_FEE_PERCENT) / 100;
        uint256 btngToUser = btngOut - fee;
        require(afn.transferFrom(msg.sender, address(this), afnAmount));
        require(btng.balanceOf(address(this)) >= btngToUser);
        btng.transfer(msg.sender, btngToUser);
        emit Swapped(msg.sender, afnAmount, btngToUser);
    }

    function autoGenerateAndDistribute() external onlyOwner {
        for (uint256 i = 0; i < nextNodeId; i++) {
            if (nodes[i].active) {
                uint256 reward = pendingRewards(i);
                if (reward > 0) {
                    nodes[i].lastClaim = block.timestamp;
                    afn.mint(nodes[i].owner, reward);
                    emit RewardsClaimed(i, reward);
                }
            }
        }
    }

    function deactivateNode(uint256 nodeId) external onlyOwner {
        nodes[nodeId].active = false;
    }
}`;

const DEPLOY_SCRIPT = `const hre = require("hardhat");

async function main() {
  console.log("Deploying BTNG Ecosystem...");

  // 1. Deploy BTNG Token
  const BTNG = await hre.ethers.getContractFactory("BituncoinGold");
  const btng = await BTNG.deploy();
  await btng.waitForDeployment();
  const btngAddress = await btng.getAddress();
  console.log("BTNG deployed to:", btngAddress);

  // 2. Deploy AFN Token
  const AFN = await hre.ethers.getContractFactory("AfricanNote");
  const afn = await AFN.deploy();
  await afn.waitForDeployment();
  const afnAddress = await afn.getAddress();
  console.log("AFN deployed to:", afnAddress);

  // 3. Deploy Node Engine
  const NodeEngine = await hre.ethers.getContractFactory("BTNGNodeEngine");
  const engine = await NodeEngine.deploy(btngAddress, afnAddress);
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("Node Engine deployed to:", engineAddress);

  // 4. Transfer AFN minting rights to engine
  await afn.transferOwnership(engineAddress);
  console.log("AFN ownership transferred to Node Engine");

  // 5. Fund engine with BTNG for swaps
  const initialBTNG = hre.ethers.parseEther("10000");
  await btng.transfer(engineAddress, initialBTNG);
  console.log("Sent 10,000 BTNG to engine for swaps");

  console.log("\\n=== DEPLOYMENT COMPLETE ===");
  console.log("BTNG:", btngAddress);
  console.log("AFN:", afnAddress);
  console.log("Engine:", engineAddress);
  console.log("===========================");
  console.log("Update your app with these addresses!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});`;

const AUTO_GEN_SCRIPT = `const { ethers } = require("ethers");

const CONFIG = {
  engineAddress: "0xYourEngineAddress",
  rpcUrl: "http://72.62.160.237:64799",
  privateKey: "YOUR_PRIVATE_KEY",
  intervalMinutes: 60
};

const ENGINE_ABI = [
  "function autoGenerateAndDistribute() external",
  "function pendingRewards(uint256) view returns (uint256)",
  "function nodes(uint256) view returns (address,uint256,uint256,bool)",
  "function nextNodeId() view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  const engine = new ethers.Contract(
    CONFIG.engineAddress, ENGINE_ABI, wallet
  );

  console.log("BTNG Auto Generator Started");
  console.log("RPC:", CONFIG.rpcUrl);
  console.log("Engine:", CONFIG.engineAddress);

  async function distribute() {
    try {
      const nodeCount = await engine.nextNodeId();
      console.log(\`Running for \${nodeCount} nodes...\`);
      const tx = await engine.autoGenerateAndDistribute();
      await tx.wait();
      console.log("Rewards distributed. TX:", tx.hash);
    } catch (err) {
      console.error("Error:", err.message);
    }
  }

  // Run immediately, then on interval
  await distribute();
  setInterval(distribute, CONFIG.intervalMinutes * 60 * 1000);
}

main();`;

const PACKAGE_JSON = `{
  "name": "btng-node-engine",
  "version": "1.0.0",
  "description": "BTNG Two-Token Sovereign Node Engine",
  "scripts": {
    "compile": "npx hardhat compile",
    "test-deploy": "npx hardhat run scripts/deploy.js --network bscTestnet",
    "deploy": "npx hardhat run scripts/deploy.js --network bscMainnet",
    "btng-deploy": "npx hardhat run scripts/deploy.js --network btngNode",
    "verify": "npx hardhat verify --network bscMainnet",
    "auto-generator": "node scripts/auto-generator.js",
    "auto-generator-pm2": "pm2 start scripts/auto-generator.js --name btng-auto-gen"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "hardhat": "^2.19.0"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^5.0.0",
    "ethers": "^6.8.0"
  }
}`;

const BASH_INSTALL = `# SSH into your VPS first
ssh root@72.62.160.237

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Create project directory
mkdir -p /opt/btng-contracts && cd /opt/btng-contracts

# Initialize project
npm init -y
npm install --save-dev @nomicfoundation/hardhat-toolbox hardhat
npm install @openzeppelin/contracts ethers

# Create folder structure
mkdir contracts scripts frontend

# Copy your .sol files into contracts/
# Copy deploy.js and auto-generator.js into scripts/
# Then run:
npx hardhat compile
npm run test-deploy   # Testnet first!
npm run deploy        # Mainnet when ready`;

const BASH_PM2 = `# Install PM2 globally
npm install -g pm2

# Start auto generator with PM2
pm2 start scripts/auto-generator.js --name btng-auto-gen

# Auto-restart on reboot
pm2 save
pm2 startup

# Monitor logs
pm2 logs btng-auto-gen

# Stop / restart
pm2 stop btng-auto-gen
pm2 restart btng-auto-gen`;

const FRONTEND_JS = `let web3, account, engineContract, btngContract, afnContract;

const CONTRACTS = {
  btng:   "0xYourBTNGAddress",
  afn:    "0xYourAFNAddress",
  engine: "0xYourEngineAddress"
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const ENGINE_ABI = [
  "function createNode() external",
  "function claimRewards(uint256) external",
  "function swapAfnToBtng(uint256) external",
  "function pendingRewards(uint256) view returns (uint256)",
  "function nextNodeId() view returns (uint256)",
  "function nodes(uint256) view returns (address,uint256,uint256,bool)"
];

async function init() {
  if (!window.ethereum) { alert("Install MetaMask"); return; }
  web3 = new Web3(window.ethereum);
  await window.ethereum.request({ method: "eth_requestAccounts" });
  account = (await web3.eth.getAccounts())[0];
  btngContract = new web3.eth.Contract(ERC20_ABI, CONTRACTS.btng);
  afnContract  = new web3.eth.Contract(ERC20_ABI, CONTRACTS.afn);
  engineContract = new web3.eth.Contract(ENGINE_ABI, CONTRACTS.engine);
  document.getElementById("walletAddress").innerText = account;
  await updateBalances();
  await loadNodes();
}

async function updateBalances() {
  const b = await btngContract.methods.balanceOf(account).call();
  const a = await afnContract.methods.balanceOf(account).call();
  document.getElementById("btngBalance").innerText =
    web3.utils.fromWei(b, "ether");
  document.getElementById("afnBalance").innerText =
    web3.utils.fromWei(a, "ether");
}

async function loadNodes() {
  const total = await engineContract.methods.nextNodeId().call();
  let myNodes = [];
  for (let i = 0; i < total; i++) {
    const n = await engineContract.methods.nodes(i).call();
    if (n[0].toLowerCase() === account.toLowerCase()) myNodes.push(i);
  }
  document.getElementById("nodeCount").innerText = myNodes.length;
  const sel = document.getElementById("nodeSelector");
  sel.innerHTML = myNodes
    .map(id => \`<option value="\${id}">Node #\${id}</option>\`)
    .join("");
}

document.getElementById("createNodeBtn")?.addEventListener("click", async () => {
  await btngContract.methods
    .approve(CONTRACTS.engine, web3.utils.toWei("100", "ether"))
    .send({ from: account });
  await engineContract.methods.createNode().send({ from: account });
  alert("Node created!");
  await updateBalances();
  await loadNodes();
});

document.getElementById("claimBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("nodeSelector").value;
  await engineContract.methods.claimRewards(id).send({ from: account });
  alert("Rewards claimed!");
  await updateBalances();
});

document.getElementById("swapBtn")?.addEventListener("click", async () => {
  const amt = web3.utils.toWei(
    document.getElementById("swapAmount").value, "ether"
  );
  await afnContract.methods
    .approve(CONTRACTS.engine, amt)
    .send({ from: account });
  await engineContract.methods.swapAfnToBtng(amt).send({ from: account });
  alert("Swap complete!");
  await updateBalances();
});

document.getElementById("connectWallet")?.addEventListener("click", init);`;

// ── Contracts Tab ─────────────────────────────────────────────────────────────
function ContractsTab() {
  return (
    <View style={{ gap: Spacing.md }}>
      {/* Hero */}
      <View style={t.hero}>
        <View style={t.heroIconWrap}><Text style={t.heroEmoji}>📜</Text></View>
        <Text style={t.heroTitle}>Solidity Smart Contracts</Text>
        <Text style={t.heroSub}>Three production-ready ERC-20 contracts · OpenZeppelin · Solidity ^0.8.19</Text>
        <View style={t.heroBadgeRow}>
          {['BituncoinGold.sol', 'AfricanNote.sol', 'BTNGNodeEngine.sol'].map(c => (
            <View key={c} style={t.heroBadge}><MaterialIcons name="description" size={10} color={Colors.primary} /><Text style={t.heroBadgeText}>{c}</Text></View>
          ))}
        </View>
      </View>

      <SectionCard title="BituncoinGold.sol · BTNG" icon="monetization-on" badge="ERC-20 · 21M CAP" badgeColor={Colors.primary}>
        <Text style={t.desc}>The main gold-backed token. Capped at 21 million BTNG. Only the Node Engine can mint additional tokens via ownership transfer.</Text>
        <CodeBlock code={BTNG_SOL} lang="sol" title="contracts/BituncoinGold.sol" />
      </SectionCard>

      <SectionCard title="AfricanNote.sol · AFN" icon="public" badge="ERC-20 · 1B GENESIS" badgeColor="#22C55E">
        <Text style={t.desc}>The African Note reward token. 1 billion genesis supply. Mintable — ownership is transferred to BTNGNodeEngine on deployment so the engine auto-mints node rewards.</Text>
        <CodeBlock code={AFN_SOL} lang="sol" title="contracts/AfricanNote.sol" />
      </SectionCard>

      <SectionCard title="BTNGNodeEngine.sol" icon="device-hub" badge="CORE ENGINE" badgeColor="#9945FF">
        <Text style={t.desc}>The main engine contract. Handles node creation (100 BTNG), pending reward calculation, claim function, AFN→BTNG swap (1000 AFN = 1 BTNG, 2% fee), and the owner-callable autoGenerateAndDistribute() function.</Text>
        <CodeBlock code={ENGINE_SOL} lang="sol" title="contracts/BTNGNodeEngine.sol" />
      </SectionCard>

      <SectionCard title="hardhat.config.js" icon="settings" badge="CONFIG" badgeColor="#3B82F6">
        <Text style={t.desc}>Hardhat config with BSC Testnet, BSC Mainnet, and your BTNG sovereign node (72.62.160.237:64799) pre-configured as networks.</Text>
        <CodeBlock code={HARDHAT_CONFIG} lang="js" title="hardhat.config.js" />
      </SectionCard>

      <SectionCard title="package.json" icon="inventory" badge="DEPENDENCIES" badgeColor={Colors.warning}>
        <Text style={t.desc}>Project dependencies: Hardhat, OpenZeppelin contracts, ethers.js. Includes npm scripts for testnet deploy, mainnet deploy, and PM2 auto-generator.</Text>
        <CodeBlock code={PACKAGE_JSON} lang="json" title="package.json" />
      </SectionCard>
    </View>
  );
}

// ── Deploy Tab ────────────────────────────────────────────────────────────────
function DeployTab() {
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionCard title="Deploy Script" icon="rocket-launch" badge="scripts/deploy.js" badgeColor={Colors.primary}>
        <Text style={t.desc}>Deploys all three contracts in order, transfers AFN ownership to the engine, and funds the engine with 10,000 BTNG for swap liquidity. Outputs all three contract addresses on completion.</Text>
        <CodeBlock code={DEPLOY_SCRIPT} lang="js" title="scripts/deploy.js" />
      </SectionCard>

      <SectionCard title="VPS Installation Commands" icon="terminal" badge="SSH · Ubuntu 24.04" badgeColor="#22C55E">
        <Text style={t.desc}>Run these commands on your Hostinger VPS (72.62.160.237) to set up Node.js 18, create the project, and deploy contracts.</Text>
        <CodeBlock code={BASH_INSTALL} lang="bash" title="install-and-deploy.sh" />
      </SectionCard>

      <SectionCard title="Deployment Sequence" icon="view-timeline" badge="6 STEPS">
        <StepRow n="1" text="SSH into VPS: ssh root@72.62.160.237" color={Colors.primary} />
        <StepRow n="2" text="Install Node.js 18+ and create /opt/btng-contracts" color="#3B82F6" />
        <StepRow n="3" text="Copy all .sol files to contracts/, scripts to scripts/" color="#22C55E" />
        <StepRow n="4" text="Run npx hardhat compile — verify no errors" color={Colors.warning} />
        <StepRow n="5" text="Deploy testnet first: npm run test-deploy" color="#9945FF" />
        <StepRow n="6" text="Deploy mainnet: npm run deploy — copy output addresses" color={Colors.primary} />
      </SectionCard>

      <SectionCard title="Post-Deploy Checklist" icon="checklist" badge="VERIFY" badgeColor={Colors.success}>
        {[
          { icon: 'check-circle', text: 'BTNG token deployed — note contract address', color: Colors.success },
          { icon: 'check-circle', text: 'AFN token deployed — note contract address', color: Colors.success },
          { icon: 'check-circle', text: 'BTNGNodeEngine deployed with both addresses', color: Colors.success },
          { icon: 'check-circle', text: 'AFN.transferOwnership(engineAddress) confirmed', color: Colors.success },
          { icon: 'check-circle', text: '10,000 BTNG transferred to engine for swaps', color: Colors.success },
          { icon: 'info', text: 'Update btng-node-engine.tsx with real contract addresses', color: Colors.warning },
          { icon: 'info', text: 'Update auto-generator.js with real engine address', color: Colors.warning },
        ].map((item, i) => (
          <View key={i} style={t.checkRow}>
            <MaterialIcons name={item.icon as any} size={13} color={item.color} />
            <Text style={[t.checkText, { color: item.icon === 'info' ? Colors.warning : Colors.textSecondary }]}>{item.text}</Text>
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

// ── Auto Generator Tab ────────────────────────────────────────────────────────
function AutoGenTab() {
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionCard title="Auto Generator Script" icon="auto-mode" badge="Node.js · ethers.js" badgeColor={Colors.warning}>
        <Text style={t.desc}>Off-chain keeper script that calls autoGenerateAndDistribute() on the BTNGNodeEngine contract on a configurable interval. Connects directly to your BTNG VPS node at 72.62.160.237:64799.</Text>
        <CodeBlock code={AUTO_GEN_SCRIPT} lang="js" title="scripts/auto-generator.js" />
      </SectionCard>

      <SectionCard title="PM2 Process Manager" icon="loop" badge="pm2 · Auto-restart" badgeColor="#22C55E">
        <Text style={t.desc}>Use PM2 to keep the auto-generator running 24/7 with automatic restart on crash or VPS reboot. Production-grade process management.</Text>
        <CodeBlock code={BASH_PM2} lang="bash" title="pm2-setup.sh" />
      </SectionCard>

      <SectionCard title="Scheduling Options" icon="schedule" badge="INTERVALS">
        {[
          { label: 'Every 15 minutes', cmd: 'intervalMinutes: 15', note: 'High frequency — more gas cost', color: Colors.error },
          { label: 'Every 1 hour', cmd: 'intervalMinutes: 60', note: 'Default — balanced frequency', color: Colors.primary },
          { label: 'Every 6 hours', cmd: 'intervalMinutes: 360', note: 'Low frequency — minimal gas', color: Colors.success },
          { label: 'Every 24 hours', cmd: 'intervalMinutes: 1440', note: 'Once daily — lowest gas cost', color: '#3B82F6' },
        ].map(opt => (
          <View key={opt.label} style={t.optRow}>
            <View style={[t.optDot, { backgroundColor: opt.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={t.optLabel}>{opt.label}</Text>
              <Text style={t.optNote}>{opt.note}</Text>
            </View>
            <View style={[t.optBadge, { backgroundColor: opt.color + '18', borderColor: opt.color + '44' }]}>
              <Text style={[t.optBadgeText, { color: opt.color }]}>{opt.cmd}</Text>
            </View>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Chainlink Keepers (Optional)" icon="link" badge="ON-CHAIN" badgeColor="#375BD2">
        <Text style={t.desc}>For fully decentralized automation without a VPS, use Chainlink Automation (Keepers). Register BTNGNodeEngine as a custom upkeep contract — Chainlink nodes will call autoGenerateAndDistribute() automatically.</Text>
        {[
          'Go to automation.chain.link',
          'Register new Upkeep → Custom Logic',
          'Enter BTNGNodeEngine contract address',
          'Set trigger: time-based (hourly)',
          'Fund upkeep with LINK tokens',
          'Chainlink nodes run autoGenerateAndDistribute()',
        ].map((step, i) => <StepRow key={i} n={String(i + 1)} text={step} color="#375BD2" />)}
      </SectionCard>
    </View>
  );
}

// ── Frontend Tab ──────────────────────────────────────────────────────────────
function FrontendTab() {
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionCard title="Web Dashboard (app.js)" icon="web" badge="MetaMask · Web3.js" badgeColor="#3B82F6">
        <Text style={t.desc}>Complete browser-based dashboard using Web3.js and MetaMask. Connect wallet, view BTNG/AFN balances, create nodes, claim rewards, and swap AFN→BTNG — all with real contract calls.</Text>
        <CodeBlock code={FRONTEND_JS} lang="js" title="frontend/app.js" />
      </SectionCard>

      <SectionCard title="Dashboard Features" icon="dashboard" badge="5 MODULES">
        {[
          { icon: 'account-balance-wallet', label: 'Wallet Connect', sub: 'MetaMask · Web3.js · auto account detection', color: Colors.primary },
          { icon: 'toll', label: 'Balance Display', sub: 'Live BTNG + AFN balances from contract', color: '#22C55E' },
          { icon: 'device-hub', label: 'Node Management', sub: 'Create nodes · selector for claim targets', color: '#9945FF' },
          { icon: 'savings', label: 'Reward Claiming', sub: 'Per-node claim with pending reward display', color: Colors.warning },
          { icon: 'swap-horiz', label: 'AFN → BTNG Swap', sub: '1000 AFN = 1 BTNG · 2% protocol fee', color: '#3B82F6' },
        ].map(f => (
          <View key={f.label} style={t.featureRow}>
            <View style={[t.featureIconWrap, { backgroundColor: f.color + '18', borderColor: f.color + '44' }]}>
              <MaterialIcons name={f.icon as any} size={14} color={f.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={t.featureLabel}>{f.label}</Text>
              <Text style={t.featureSub}>{f.sub}</Text>
            </View>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Hosting Options" icon="cloud" badge="DEPLOY" badgeColor={Colors.success}>
        <StepRow n="VPS" text="Serve frontend/index.html via nginx on 72.62.160.237 — same server as your node" color={Colors.primary} />
        <StepRow n="GH" text="GitHub Pages — free hosting, push frontend/ folder to gh-pages branch" color="#333" />
        <StepRow n="VR" text="Vercel or Netlify — drag-and-drop frontend/ folder for instant HTTPS hosting" color="#3B82F6" />
        <StepRow n="IPFS" text="Pinata / Fleek — decentralized hosting on IPFS for Web3-native deployment" color="#22C55E" />
      </SectionCard>
    </View>
  );
}

// ── Guide Tab ─────────────────────────────────────────────────────────────────
function GuideTab() {
  return (
    <View style={{ gap: Spacing.md }}>
      {/* File tree */}
      <SectionCard title="Project Structure" icon="folder" badge="FULL TREE" badgeColor={Colors.primary}>
        <CodeBlock code={`btng-node-engine/
├── contracts/
│   ├── BituncoinGold.sol      ← BTNG ERC-20 (capped 21M)
│   ├── AfricanNote.sol        ← AFN ERC-20 (mintable 1B)
│   └── BTNGNodeEngine.sol     ← Core engine + swap + auto
├── scripts/
│   ├── deploy.js              ← Hardhat deploy script
│   └── auto-generator.js      ← Off-chain keeper (Node.js)
├── frontend/
│   ├── index.html             ← Dashboard HTML
│   ├── style.css              ← Styling
│   └── app.js                 ← Web3.js logic
├── hardhat.config.js          ← Network configuration
└── package.json               ← Dependencies + scripts`} lang="txt" title="Project Tree" />
      </SectionCard>

      {/* Architecture */}
      <SectionCard title="Architecture Overview" icon="architecture" badge="FLOW">
        {[
          { from: 'User pays 100 BTNG', arrow: '→', to: 'Node Created', color: Colors.primary },
          { from: 'Node active 3s/block', arrow: '→', to: '10 AFN minted per block', color: '#22C55E' },
          { from: 'User or auto-gen calls claim', arrow: '→', to: 'AFN minted to owner', color: '#9945FF' },
          { from: 'Swap: 1000 AFN', arrow: '→', to: '0.98 BTNG (2% fee)', color: Colors.warning },
          { from: 'Keeper script (hourly)', arrow: '→', to: 'autoGenerateAndDistribute()', color: '#3B82F6' },
        ].map((row, i) => (
          <View key={i} style={t.flowRow}>
            <View style={[t.flowNode, { borderColor: row.color + '44' }]}>
              <Text style={[t.flowNodeText, { color: row.color }]} numberOfLines={1}>{row.from}</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={14} color={row.color} />
            <View style={[t.flowNode, { borderColor: row.color + '44', backgroundColor: row.color + '08' }]}>
              <Text style={[t.flowNodeText, { color: row.color }]} numberOfLines={1}>{row.to}</Text>
            </View>
          </View>
        ))}
      </SectionCard>

      {/* Security */}
      <SectionCard title="Security Notes" icon="security" badge="IMPORTANT" badgeColor={Colors.error}>
        {[
          '⚠️  NEVER commit private keys to Git — use .env files',
          '✅  Contracts use OpenZeppelin ReentrancyGuard on all state-changing functions',
          '✅  Ownable access control on mint, distribute, and deactivate functions',
          '✅  AFN transferOwnership to engine prevents unauthorized minting',
          '⚠️  Test on BSC Testnet with test private keys first',
          '✅  Audit contract logic before moving significant funds to mainnet',
          '⚠️  Keep private key for auto-generator in a secure env variable, never plaintext',
        ].map((note, i) => (
          <View key={i} style={t.noteRow}>
            <Text style={[t.noteText, { color: note.startsWith('⚠️') ? Colors.warning : Colors.success }]}>{note}</Text>
          </View>
        ))}
      </SectionCard>

      {/* Network info */}
      <SectionCard title="Network Configuration" icon="router" badge="BTNG MAINNET" badgeColor={Colors.primary}>
        {[
          { label: 'Primary VPS', value: '72.62.160.237:64799', color: Colors.primary },
          { label: 'Secondary VPS', value: '168.231.79.52:64799', color: '#3B82F6' },
          { label: 'Chain ID', value: '2026 (BTNG)', color: Colors.warning },
          { label: 'BSC Mainnet', value: 'Chain ID 56', color: '#F0B90B' },
          { label: 'BSC Testnet', value: 'Chain ID 97', color: '#22C55E' },
          { label: 'Block Time', value: '~3 seconds', color: Colors.textMuted },
          { label: 'Node Cost', value: '100 BTNG', color: Colors.primary },
          { label: 'AFN per Block', value: '10 AFN', color: '#22C55E' },
          { label: 'Swap Rate', value: '1000 AFN = 1 BTNG', color: Colors.warning },
          { label: 'Swap Fee', value: '2% (stays in engine)', color: Colors.error },
        ].map(r => (
          <View key={r.label} style={t.infoRow}>
            <Text style={t.infoLabel}>{r.label}</Text>
            <Text style={[t.infoValue, { color: r.color }]}>{r.value}</Text>
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

const t = StyleSheet.create({
  hero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 2, borderColor: Colors.primary + '55', alignItems: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  heroIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  heroEmoji: { fontSize: 30 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  heroSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 16, includeFontPadding: false },
  heroBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  desc: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false, marginBottom: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingVertical: 3 },
  checkText: { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  optDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  optLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  optNote: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  optBadge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  optBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 1, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featureIconWrap: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  featureSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  flowNode: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, alignItems: 'center' },
  flowNodeText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false, textAlign: 'center' },
  noteRow: { paddingVertical: 3 },
  noteText: { fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  infoValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BtngContractDeployScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<Tab>('contracts');

  const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
    { id: 'contracts', label: 'Contracts', icon: 'description', color: Colors.primary },
    { id: 'deploy', label: 'Deploy', icon: 'rocket-launch', color: '#22C55E' },
    { id: 'autogen', label: 'Auto Gen', icon: 'auto-mode', color: Colors.warning },
    { id: 'frontend', label: 'Frontend', icon: 'web', color: '#3B82F6' },
    { id: 'guide', label: 'Guide', icon: 'menu-book', color: '#9945FF' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Contract Deploy</Text>
          <Text style={s.topSub}>BTNG + AFN Two-Token Ecosystem</Text>
        </View>
        <TouchableOpacity style={s.nodeEngineBtn} onPress={() => router.push('/btng-node-engine' as any)} activeOpacity={0.8}>
          <MaterialIcons name="device-hub" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBarScroll} contentContainerStyle={s.tabBarContent}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <MaterialIcons name={tab.icon as any} size={14} color={isActive ? tab.color : Colors.textMuted} />
              <Text style={[s.tabLabel, isActive && { color: tab.color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {activeTab === 'contracts' && <ContractsTab />}
        {activeTab === 'deploy' && <DeployTab />}
        {activeTab === 'autogen' && <AutoGenTab />}
        {activeTab === 'frontend' && <FrontendTab />}
        {activeTab === 'guide' && <GuideTab />}
        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  nodeEngineBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  tabBarScroll: { backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: Spacing.md },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  tabLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md },
});
