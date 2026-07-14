// Web Crypto API based AES-256-GCM Decryption for Edge Functions

const ALGORITHM = "AES-GCM";
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "12345678901234567890123456789012";

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return array;
}

export async function decryptSecret(encryptedData: string | null | undefined): Promise<string> {
  if (!encryptedData || !encryptedData.includes(":")) return encryptedData || "";
  
  try {
    const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY).slice(0, 32);
    
    const parts = encryptedData.split(":");
    if (parts.length !== 3) return encryptedData;
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = hexToUint8Array(ivHex);
    const authTag = hexToUint8Array(authTagHex);
    const encryptedBytes = hexToUint8Array(encryptedHex);
    
    // Combine encrypted bytes and auth tag for Web Crypto API
    const cipherText = new Uint8Array(encryptedBytes.length + authTag.length);
    cipherText.set(encryptedBytes, 0);
    cipherText.set(authTag, encryptedBytes.length);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: ALGORITHM },
      false,
      ["decrypt"]
    );
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      cryptoKey,
      cipherText
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "";
  }
}
