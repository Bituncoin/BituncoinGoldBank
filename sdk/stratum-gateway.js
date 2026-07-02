const net = require('net');
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RPC_URL = 'http://72.62.160.237:7051';
const RPC_AUTH = { username: 'btngrpc', password: 'your_rpc_password' };

let currentJob = null;
let lastJobTime = 0;

async function rpcCall(method, params) {
  const res = await axios.post(
    RPC_URL,
    { jsonrpc: '2.0', id: Date.now(), method, params },
    { auth: RPC_AUTH }
  );
  if (res.data.error) throw new Error(res.data.error.message);
  return res.data.result;
}

async function getMiningJob() {
  const now = Date.now();
  if (!currentJob || now - lastJobTime > 5000) {
    const tpl = await rpcCall('getblocktemplate', [{ rules: ['segwit'] }]);
    currentJob = tpl;
    lastJobTime = now;
  }
  return currentJob;
}

async function verifyShare(job, nonce, hashHex) {
  const target = BigInt('0x' + job.target);
  const hashNum = BigInt('0x' + hashHex);
  return hashNum < target;
}

async function recordShare(minerAddress, nonce, height) {
  await pool.query(
    `INSERT INTO mining_shares (miner_address, nonce, block_height, timestamp)
     VALUES ($1, $2, $3, NOW())`,
    [minerAddress, nonce, height]
  );
}

const server = net.createServer(async (socket) => {
  let minerAddress = null;

  socket.on('data', async (data) => {
    const msg = data.toString().trim();
    if (!msg.startsWith('{')) return;

    const req = JSON.parse(msg);

    if (req.method === 'mining.authorize') {
      minerAddress = req.params[0];
      socket.write(JSON.stringify({ id: req.id, result: true }) + '\n');

      const job = await getMiningJob();
      socket.write(JSON.stringify({
        id: null,
        method: 'mining.notify',
        params: [job]
      }) + '\n');
    } else if (req.method === 'mining.submit') {
      const [nonce, hashHex] = req.params;
      const job = await getMiningJob();
      const valid = await verifyShare(job, nonce, hashHex);

      if (valid) {
        await recordShare(minerAddress, nonce, job.height);
        socket.write(JSON.stringify({ id: req.id, result: true }) + '\n');
      } else {
        socket.write(JSON.stringify({ id: req.id, result: false, error: 'invalid share' }) + '\n');
      }
    }
  });
});

server.listen(38984, () =>
  console.log('BTNG Stratum V2 Gateway running on port 38984')
);
