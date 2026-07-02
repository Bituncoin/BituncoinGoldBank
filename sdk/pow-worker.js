self.onmessage = async (e) => {
  const job = e.data.job;

  const version = job.version;
  const prevHash = job.previousblockhash;
  const merkleRoot = job.merkleroot;
  const time = job.curtime;
  const bits = job.bits;
  const target = BigInt('0x' + job.target);

  let nonce = 0;
  let start = Date.now();

  const hexToBytes = (hex) =>
    new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));

  const le32 = (n) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, n, true);
    return new Uint8Array(buf);
  };

  const headerStatic = new Uint8Array([
    ...le32(version),
    ...hexToBytes(prevHash).reverse(),
    ...hexToBytes(merkleRoot).reverse(),
    ...le32(time),
    ...hexToBytes(bits).reverse()
  ]);

  while (true) {
    const header = new Uint8Array([...headerStatic, ...le32(nonce)]);

    const h1 = await crypto.subtle.digest('SHA-256', header);
    const h2 = await crypto.subtle.digest('SHA-256', new Uint8Array(h1));

    const hashHex = Array.from(new Uint8Array(h2))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const hashNum = BigInt('0x' + hashHex);

    if (hashNum < target) {
      self.postMessage({
        found: true,
        nonce,
        hash: hashHex
      });
      return;
    }

    nonce++;

    if (nonce % 2000 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      const hps = nonce / elapsed;
      self.postMessage({ hashrate: hps });
    }
  }
};
