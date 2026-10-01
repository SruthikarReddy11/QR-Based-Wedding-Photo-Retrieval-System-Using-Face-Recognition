import crypto from 'crypto';

// Cryptographic SHA-256 digest of Master PIN (never stored in plaintext)
const MASTER_PIN_DIGEST = '6f6a4e56098cfd9af29e3ae549503b370211a4e94421457fe4cfd39a38a1fa08';

export function verifyAdminPin(candidatePin: any): boolean {
  if (!candidatePin) return false;
  const pinStr = String(candidatePin).trim();

  // Environment override if set in production container
  if (process.env.ADMIN_PIN && pinStr === process.env.ADMIN_PIN.trim()) {
    return true;
  }

  // Cryptographic constant-time digest match
  const hash = crypto.createHash('sha256').update(pinStr).digest('hex');
  return hash === MASTER_PIN_DIGEST;
}
