// ============================================================
// BTNG SOVEREIGN ENGINE MASTERPIECE v3.0 — ENTERPRISE GRADE
// Master Key | Sandbox | Gateway Security | Merchant Onboarding
// ============================================================
// STORED IN: dev-master/engines/btng-enterprise-v3.js
// AUTHOR: John Kojo Zi — Founder & Lead Architect
// COMPANY: EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
// DATE: June 2026
// NOTE: Reference architecture. Production React Native
//       implementation lives in services/btngSovereignEngineService.ts
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
// MASTER KEY AUTHORITY (Root of Trust - Like Visa/Mastercard)
// ============================================================
class MasterKeyAuthority {
  constructor(masterPath = './master') {
    this.masterPath = masterPath;
    this.ensureDirectory();
    this.masterKey = null;
    this.loadOrCreateMasterKey();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.masterPath)) fs.mkdirSync(this.masterPath, { recursive: true });
  }

  loadOrCreateMasterKey() {
    const masterFile = path.join(this.masterPath, 'master.json');
    if (fs.existsSync(masterFile)) {
      this.masterKey = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
    } else {
      // Generate MASTER KEY (Root of Trust)
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
        privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
        publicKeyEncoding: { format: 'pem', type: 'spki' }
      });

      this.masterKey = {
        id: 'BTNG_MASTER_ROOT',
        createdAt: Date.now(),
        publicKey,
        privateKey,
        version: '3.0',
        children: [], // Track all derived keys
        sandboxLimit: 10000, // Default sandbox limit in BTNG
        gatewayRules: {
          requireMasterSignature: true,
          maxTransactionAmount: 100000,
          minConfirmations: 3,
          fraudDetection: true
        }
      };
      fs.writeFileSync(masterFile, JSON.stringify(this.masterKey, null, 2));
    }
  }

  getMasterPublicKey() { return this.masterKey.publicKey; }
  getMasterPrivateKey() { return this.masterKey.privateKey; }

  signWithMaster(data) {
    const sign = crypto.createSign('SHA256');
    sign.update(typeof data === 'string' ? data : JSON.stringify(data));
    sign.end();
    return sign.sign(this.masterKey.privateKey, 'hex');
  }

  verifyMasterSignature(data, signatureHex) {
    const verify = crypto.createVerify('SHA256');
    verify.update(typeof data === 'string' ? data : JSON.stringify(data));
    verify.end();
    return verify.verify(this.masterKey.publicKey, signatureHex, 'hex');
  }

  issueChildCertificate(entityId, entityType, entityPublicKey) {
    const certificate = {
      entityId,
      entityType, // 'merchant', 'bank', 'client'
      entityPublicKey,
      issuedBy: 'BTNG_MASTER_ROOT',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      masterSignature: null
    };

    certificate.masterSignature = this.signWithMaster(certificate);
    this.masterKey.children.push({ entityId, entityType, issuedAt: certificate.issuedAt });
    this.saveMasterKey();
    return certificate;
  }

  revokeCertificate(entityId) {
    const child = this.masterKey.children.find(c => c.entityId === entityId);
    if (child) {
      child.revokedAt = Date.now();
      this.saveMasterKey();
      return { success: true, entityId, revokedAt: child.revokedAt };
    }
    return { success: false, error: 'Entity not found' };
  }

  saveMasterKey() {
    const masterFile = path.join(this.masterPath, 'master.json');
    const toSave = { ...this.masterKey };
    delete toSave.privateKey;
    fs.writeFileSync(masterFile, JSON.stringify(toSave, null, 2));
  }

  resetMasterKey() {
    const archivePath = path.join(this.masterPath, 'archived', `master_${Date.now()}.json`);
    if (!fs.existsSync(path.dirname(archivePath))) fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.copyFileSync(path.join(this.masterPath, 'master.json'), archivePath);
    this.loadOrCreateMasterKey(); // Regenerate
    return { success: true, newPublicKey: this.masterKey.publicKey, archivedAt: archivePath };
  }
}

// ============================================================
// SANDBOX ENVIRONMENT (Test Mode - Like Visa Developer Sandbox)
// ============================================================
class SandboxEnvironment {
  constructor(sandboxPath = './sandbox') {
    this.sandboxPath = sandboxPath;
    this.ensureDirectory();
    this.sandboxes = new Map();
    this.loadAllSandboxes();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.sandboxPath)) fs.mkdirSync(this.sandboxPath, { recursive: true });
  }

  createSandbox(merchantId, merchantName, config = {}) {
    const sandboxId = crypto.randomUUID();
    const sandbox = {
      id: sandboxId,
      merchantId,
      merchantName,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days default
      mode: 'SANDBOX',
      config: {
        maxTransactionAmount: config.maxTransactionAmount || 1000,
        dailyLimit: config.dailyLimit || 5000,
        monthlyLimit: config.monthlyLimit || 25000,
        requireMasterSignature: config.requireMasterSignature || false,
        ...config
      },
      testFunds: 10000, // Fake BTNG for testing
      transactions: [],
      apiKeys: this.generateApiKeys(),
      webhookUrl: config.webhookUrl || null,
      allowedIps: config.allowedIps || [],
      rateLimit: config.rateLimit || 100 // requests per minute
    };

    const sandboxFile = path.join(this.sandboxPath, `${sandboxId}.json`);
    fs.writeFileSync(sandboxFile, JSON.stringify(sandbox, null, 2));
    this.sandboxes.set(sandboxId, sandbox);

    return sandbox;
  }

  generateApiKeys() {
    return {
      publicKey: crypto.randomBytes(32).toString('hex'),
      secretKey: crypto.randomBytes(64).toString('hex'),
      webhookSecret: crypto.randomBytes(32).toString('hex')
    };
  }

  processSandboxTransaction(merchantId, amount, txData) {
    const sandbox = Array.from(this.sandboxes.values()).find(s => s.merchantId === merchantId);
    if (!sandbox) throw new Error('Sandbox not found');

    if (amount > sandbox.config.maxTransactionAmount) {
      throw new Error(`Amount exceeds sandbox limit: ${sandbox.config.maxTransactionAmount} BTNG`);
    }

    const dailyTotal = sandbox.transactions
      .filter(t => t.timestamp > Date.now() - 24 * 60 * 60 * 1000)
      .reduce((sum, t) => sum + t.amount, 0);

    if (dailyTotal + amount > sandbox.config.dailyLimit) {
      throw new Error(`Daily limit exceeded: ${sandbox.config.dailyLimit} BTNG`);
    }

    const transaction = {
      id: crypto.randomUUID(),
      merchantId,
      amount,
      txData,
      timestamp: Date.now(),
      status: 'SANDBOX_PROCESSED',
      simulated: true
    };

    sandbox.transactions.push(transaction);
    sandbox.testFunds -= amount;
    this.saveSandbox(sandbox.id);

    return { ...transaction, sandboxId: sandbox.id, remainingTestFunds: sandbox.testFunds };
  }

  getSandboxStats(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error('Sandbox not found');

    const dailyTotal = sandbox.transactions
      .filter(t => t.timestamp > Date.now() - 24 * 60 * 60 * 1000)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      sandboxId: sandbox.id,
      merchantName: sandbox.merchantName,
      mode: sandbox.mode,
      testFundsRemaining: sandbox.testFunds,
      totalTransactions: sandbox.transactions.length,
      dailyVolume: dailyTotal,
      dailyLimit: sandbox.config.dailyLimit,
      expiresAt: sandbox.expiresAt,
      daysRemaining: Math.ceil((sandbox.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    };
  }

  saveSandbox(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    const sandboxFile = path.join(this.sandboxPath, `${sandboxId}.json`);
    fs.writeFileSync(sandboxFile, JSON.stringify(sandbox, null, 2));
  }

  loadAllSandboxes() {
    const files = fs.readdirSync(this.sandboxPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const sandbox = JSON.parse(fs.readFileSync(path.join(this.sandboxPath, file), 'utf8'));
      this.sandboxes.set(sandbox.id, sandbox);
    }
  }
}

// ============================================================
// GATEWAY SECURITY LAYER (Merchant Onboarding + Fraud Prevention)
// ============================================================
class GatewaySecurityLayer {
  constructor(masterAuthority, sandboxEnv) {
    this.masterAuthority = masterAuthority;
    this.sandboxEnv = sandboxEnv;
    this.merchants = new Map();
    this.fraudRules = this.initializeFraudRules();
    this.rateLimiters = new Map();
  }

  initializeFraudRules() {
    return {
      maxAmountPerTransaction: 50000,
      maxAmountPerDay: 100000,
      maxAmountPerMonth: 500000,
      suspiciousVelocity: 10, // transactions per minute
      highRiskCountries: ['XX', 'YY'],
      requireKYC: true,
      blacklistedAddresses: new Set(),
      allowlistOnly: false,
      allowlistAddresses: new Set()
    };
  }

  onboardMerchant(merchantData) {
    const validation = this.validateMerchantOnboarding(merchantData);
    if (!validation.valid) throw new Error(validation.error);

    // Generate merchant keys
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' }
    });

    const merchantId = crypto.randomUUID();
    const merchant = {
      id: merchantId,
      name: merchantData.name,
      email: merchantData.email,
      publicKey,
      privateKey,
      status: 'PENDING_VERIFICATION',
      kycStatus: merchantData.kycCompleted ? 'VERIFIED' : 'PENDING',
      createdAt: Date.now(),
      verifiedAt: null,
      limits: {
        daily: merchantData.dailyLimit || 10000,
        monthly: merchantData.monthlyLimit || 100000,
        perTransaction: merchantData.perTransactionLimit || 1000
      },
      settlementAddress: merchantData.settlementAddress,
      webhookUrl: merchantData.webhookUrl,
      ipWhitelist: merchantData.ipWhitelist || [],
      metadata: merchantData.metadata || {}
    };

    // Issue Master Key certificate
    const certificate = this.masterAuthority.issueChildCertificate(merchantId, 'merchant', publicKey);
    merchant.certificate = certificate;

    // Create sandbox environment
    const sandbox = this.sandboxEnv.createSandbox(merchantId, merchant.name, {
      maxTransactionAmount: merchant.limits.perTransaction / 2,
      dailyLimit: merchant.limits.daily / 2
    });
    merchant.sandboxId = sandbox.id;

    this.merchants.set(merchantId, merchant);
    this.saveMerchant(merchantId);

    return {
      merchantId,
      publicKey,
      privateKey: privateKey.substring(0, 100) + '...',
      fullPrivateKey: privateKey,
      sandboxId: sandbox.id,
      sandboxApiKeys: sandbox.apiKeys,
      certificate,
      status: merchant.status
    };
  }

  validateMerchantOnboarding(merchantData) {
    if (!merchantData.name) return { valid: false, error: 'Merchant name required' };
    if (!merchantData.email) return { valid: false, error: 'Email required' };
    if (!merchantData.settlementAddress) return { valid: false, error: 'Settlement address required' };
    if (this.fraudRules.requireKYC && !merchantData.kycCompleted) {
      return { valid: false, error: 'KYC verification required' };
    }
    return { valid: true };
  }

  verifyMerchant(merchantId, verifiedBy = 'master') {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    merchant.status = 'ACTIVE';
    merchant.verifiedAt = Date.now();
    merchant.verifiedBy = verifiedBy;

    const verificationData = {
      merchantId,
      verifiedAt: merchant.verifiedAt,
      status: 'ACTIVE'
    };
    merchant.verificationSignature = this.masterAuthority.signWithMaster(verificationData);

    this.saveMerchant(merchantId);
    return { success: true, merchantId, status: 'ACTIVE', verifiedAt: merchant.verifiedAt };
  }

  checkTransaction(transaction, merchantId) {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');
    if (merchant.status !== 'ACTIVE') throw new Error('Merchant not active');

    if (transaction.amount > merchant.limits.perTransaction) {
      throw new Error(`Transaction amount exceeds per-transaction limit: ${merchant.limits.perTransaction}`);
    }

    const dailyTotal = merchant.dailyVolume || 0;
    if (dailyTotal + transaction.amount > merchant.limits.daily) {
      throw new Error(`Daily limit exceeded: ${merchant.limits.daily}`);
    }

    const recentCount = this.rateLimiters.get(merchantId) || 0;
    if (recentCount > this.fraudRules.suspiciousVelocity) {
      throw new Error('Rate limit exceeded. Too many transactions.');
    }
    this.rateLimiters.set(merchantId, (recentCount + 1));
    setTimeout(() => this.rateLimiters.delete(merchantId), 60000);

    if (merchant.ipWhitelist.length > 0 && !merchant.ipWhitelist.includes(transaction.ipAddress)) {
      throw new Error('IP address not whitelisted');
    }

    if (this.fraudRules.blacklistedAddresses.has(transaction.toAddress)) {
      throw new Error('Transaction blocked: Blacklisted address');
    }

    merchant.dailyVolume = (merchant.dailyVolume || 0) + transaction.amount;
    merchant.monthlyVolume = (merchant.monthlyVolume || 0) + transaction.amount;

    this.saveMerchant(merchantId);
    return { approved: true, checks: ['limit', 'rate', 'whitelist', 'blacklist'] };
  }

  generateGatewaySignature(merchantId, payload) {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(payload));
    sign.end();
    const signature = sign.sign(merchant.privateKey, 'hex');

    let masterSignature = null;
    if (payload.amount > 10000) {
      masterSignature = this.masterAuthority.signWithMaster(payload);
    }

    return { merchantSignature: signature, masterSignature };
  }

  saveMerchant(merchantId) {
    const merchantFile = path.join('./gateway/merchants', `${merchantId}.json`);
    if (!fs.existsSync(path.dirname(merchantFile))) fs.mkdirSync(path.dirname(merchantFile), { recursive: true });
    const toSave = { ...this.merchants.get(merchantId) };
    delete toSave.privateKey;
    fs.writeFileSync(merchantFile, JSON.stringify(toSave, null, 2));
  }

  loadMerchant(merchantId) {
    const merchantFile = path.join('./gateway/merchants', `${merchantId}.json`);
    if (!fs.existsSync(merchantFile)) throw new Error('Merchant not found');
    return JSON.parse(fs.readFileSync(merchantFile, 'utf8'));
  }
}

// ============================================================
// ENTERPRISE MERCHANT GATEWAY (Complete)
// ============================================================
class EnterpriseMerchantGateway {
  constructor(masterAuthority, sandboxEnv, securityLayer) {
    this.masterAuthority = masterAuthority;
    this.sandboxEnv = sandboxEnv;
    this.securityLayer = securityLayer;
    this.merchants = securityLayer.merchants;
  }

  async processPayment(merchantId, paymentRequest, clientSignature, clientPublicKey) {
    // 1. Security check
    const securityCheck = this.securityLayer.checkTransaction(paymentRequest, merchantId);
    if (!securityCheck.approved) throw new Error('Security check failed');

    // 2. Verify client signature
    const verify = crypto.createVerify('SHA256');
    verify.update(JSON.stringify(paymentRequest));
    verify.end();
    const isValid = verify.verify(clientPublicKey, clientSignature, 'hex');
    if (!isValid) throw new Error('Invalid client signature');

    // 3. Master signature verification for large amounts
    let masterVerified = true;
    if (paymentRequest.amount > 10000) {
      masterVerified = this.masterAuthority.verifyMasterSignature(
        paymentRequest,
        paymentRequest.masterSignature
      );
      if (!masterVerified) throw new Error('Master signature verification failed');
    }

    // 4. Process in sandbox or production
    const merchant = this.merchants.get(merchantId);
    let result;

    if (merchant.mode === 'SANDBOX') {
      result = this.sandboxEnv.processSandboxTransaction(merchantId, paymentRequest.amount, paymentRequest);
    } else {
      // Production settlement logic
      result = {
        id: crypto.randomUUID(),
        merchantId,
        amount: paymentRequest.amount,
        status: 'PRODUCTION_PROCESSED',
        timestamp: Date.now(),
        settlementPending: true
      };
    }

    // 5. Generate gateway receipt
    const receipt = {
      transactionId: result.id,
      merchantId,
      amount: paymentRequest.amount,
      timestamp: Date.now(),
      gatewaySignature: this.securityLayer.generateGatewaySignature(merchantId, result),
      masterAuthoritySignature: this.masterAuthority.signWithMaster(result),
      sandboxMode: merchant.mode === 'SANDBOX'
    };

    return receipt;
  }

  getMerchantDashboard(merchantId) {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const sandboxStats = this.sandboxEnv.getSandboxStats(merchant.sandboxId);

    return {
      merchant: {
        id: merchant.id,
        name: merchant.name,
        status: merchant.status,
        kycStatus: merchant.kycStatus,
        verifiedAt: merchant.verifiedAt
      },
      limits: merchant.limits,
      sandbox: sandboxStats,
      certificate: merchant.certificate,
      volumes: {
        daily: merchant.dailyVolume || 0,
        monthly: merchant.monthlyVolume || 0
      },
      gatewayRules: this.masterAuthority.masterKey.gatewayRules
    };
  }
}

// ============================================================
// BTNG ENTERPRISE SYSTEM (Final Unified)
// ============================================================
class BTNGEnterpriseSystem {
  constructor() {
    this.masterAuthority = new MasterKeyAuthority();
    this.sandboxEnv = new SandboxEnvironment();
    this.securityLayer = new GatewaySecurityLayer(this.masterAuthority, this.sandboxEnv);
    this.merchantGateway = new EnterpriseMerchantGateway(this.masterAuthority, this.sandboxEnv, this.securityLayer);
    this.initialized = true;
  }

  onboardMerchant(merchantData) {
    return this.securityLayer.onboardMerchant(merchantData);
  }

  verifyMerchant(merchantId) {
    return this.securityLayer.verifyMerchant(merchantId);
  }

  processPayment(merchantId, paymentRequest, clientSignature, clientPublicKey) {
    return this.merchantGateway.processPayment(merchantId, paymentRequest, clientSignature, clientPublicKey);
  }

  getMerchantDashboard(merchantId) {
    return this.merchantGateway.getMerchantDashboard(merchantId);
  }

  getMasterStatus() {
    return {
      masterPublicKey: this.masterAuthority.getMasterPublicKey(),
      totalChildren: this.masterAuthority.masterKey.children.length,
      gatewayRules: this.masterAuthority.masterKey.gatewayRules,
      sandboxLimit: this.masterAuthority.masterKey.sandboxLimit
    };
  }

  revokeMerchant(merchantId) {
    return this.masterAuthority.revokeCertificate(merchantId);
  }
}

// ============================================================
// DEMO & TESTING
// Run: node btng-enterprise-v3.js
// ============================================================
async function demoEnterpriseSystem() {
  console.log('\n' + '='.repeat(60));
  console.log('BTNG ENTERPRISE SYSTEM v3.0');
  console.log('Master Key | Sandbox | Gateway Security | Merchant Onboarding');
  console.log('='.repeat(60) + '\n');

  const system = new BTNGEnterpriseSystem();

  console.log('MASTER KEY STATUS:');
  console.log(`   Public Key: ${system.getMasterStatus().masterPublicKey.substring(0, 60)}...`);
  console.log(`   Gateway Rules:`, system.getMasterStatus().gatewayRules);

  console.log('\nONBOARDING NEW MERCHANT:');
  const merchant = system.onboardMerchant({
    name: 'Crypto Coffee Shop',
    email: 'merchant@cryptocoffee.com',
    settlementAddress: 'BTNG_merchant_wallet_address_123',
    kycCompleted: true,
    dailyLimit: 5000,
    perTransactionLimit: 500,
    webhookUrl: 'https://api.cryptocoffee.com/webhook'
  });

  console.log(`   Merchant ID: ${merchant.merchantId}`);
  console.log(`   Public Key: ${merchant.publicKey.substring(0, 60)}...`);
  console.log(`   Sandbox ID: ${merchant.sandboxId}`);
  console.log(`   Status: ${merchant.status}`);

  console.log('\nVERIFYING MERCHANT:');
  const verified = system.verifyMerchant(merchant.merchantId);
  console.log(`   Verified: ${verified.success}, Status: ${verified.status}`);

  console.log('\nPROCESSING PAYMENT:');
  const paymentRequest = {
    amount: 25,
    currency: 'BTNG',
    toAddress: merchant.publicKey,
    description: 'Latte + Croissant'
  };

  const clientKeys = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' }
  });

  const sign = crypto.createSign('SHA256');
  sign.update(JSON.stringify(paymentRequest));
  sign.end();
  const clientSignature = sign.sign(clientKeys.privateKey, 'hex');

  const receipt = await system.processPayment(
    merchant.merchantId,
    paymentRequest,
    clientSignature,
    clientKeys.publicKey
  );

  console.log(`   Transaction ID: ${receipt.transactionId}`);
  console.log(`   Amount: ${receipt.amount} BTNG`);
  console.log(`   Sandbox Mode: ${receipt.sandboxMode}`);
  console.log(`   Gateway Signature: ${receipt.gatewaySignature.merchantSignature.substring(0, 40)}...`);

  console.log('\nMERCHANT DASHBOARD:');
  const dashboard = system.getMerchantDashboard(merchant.merchantId);
  console.log(`   Status: ${dashboard.merchant.status}`);
  console.log(`   KYC: ${dashboard.merchant.kycStatus}`);
  console.log(`   Daily Volume: ${dashboard.volumes.daily} BTNG`);
  console.log(`   Sandbox Funds: ${dashboard.sandbox.testFundsRemaining} BTNG`);
  console.log(`   Certificate Issued: ${dashboard.certificate ? 'Yes' : 'No'}`);

  console.log('\n' + '='.repeat(60));
  console.log('BTNG ENTERPRISE SYSTEM READY');
  console.log('Master Key Authority | Sandbox Environment | Gateway Security');
  console.log('='.repeat(60) + '\n');
}

// Run demo
if (require.main === module) {
  demoEnterpriseSystem().catch(console.error);
}

module.exports = {
  MasterKeyAuthority,
  SandboxEnvironment,
  GatewaySecurityLayer,
  EnterpriseMerchantGateway,
  BTNGEnterpriseSystem
};
