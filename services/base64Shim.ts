// Web-safe shim for base64-arraybuffer
// On web, atob is available natively; on native we use the base64-arraybuffer package

export function decode(base64: string): ArrayBuffer {
  // Remove data URI prefix if present
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;

  if (typeof atob !== 'undefined') {
    // Web / modern JS environment
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Fallback: manual Base64 decode
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const str = clean.replace(/[^A-Za-z0-9+/]/g, '');
  const len = str.length;
  const bufferLength = (len * 3) / 4 - (str[len - 1] === '=' ? 1 : 0) - (str[len - 2] === '=' ? 1 : 0);
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[str.charCodeAt(i)];
    const b = lookup[str.charCodeAt(i + 1)];
    const c = lookup[str.charCodeAt(i + 2)];
    const d = lookup[str.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < bufferLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < bufferLength) bytes[p++] = ((c & 3) << 6) | (d & 63);
  }
  return bytes.buffer;
}

export function encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 63] : '=';
  }
  return result;
}
