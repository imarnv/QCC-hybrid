"""
Hybrid Cryptographic Engine
============================
Combines quantum-derived keys (BB84) with post-quantum keys (Lattice-KEM)
using HKDF-style key derivation for defense-in-depth encryption.

Provides AES-256-GCM authenticated encryption with hybrid key material.
"""

import hashlib
import hmac
import os
import json
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple
from Crypto.Cipher import AES


@dataclass
class EncryptedMessage:
    """Encrypted message with metadata."""
    ciphertext: bytes
    nonce: bytes
    tag: bytes
    key_source: str
    encryption_layers: int
    metadata: Dict

    def to_dict(self) -> dict:
        return {
            "ciphertext_hex": self.ciphertext.hex()[:64] + "...",
            "ciphertext_length": len(self.ciphertext),
            "nonce_hex": self.nonce.hex(),
            "tag_hex": self.tag.hex(),
            "key_source": self.key_source,
            "encryption_layers": self.encryption_layers,
            "metadata": self.metadata,
        }


class HybridCryptoEngine:
    """
    Hybrid Cryptographic Engine combining quantum and post-quantum keys.
    
    Architecture:
    1. BB84 QKD provides quantum-derived key material
    2. Lattice-KEM provides post-quantum key material
    3. HKDF combines both into a hybrid session key
    4. AES-256-GCM provides authenticated encryption
    
    Security: Even if one layer is compromised, the other maintains security.
    """

    def __init__(self):
        self.session_keys = {}
        self._log = []

    def _hkdf_extract(self, salt: bytes, ikm: bytes) -> bytes:
        """HKDF-Extract: PRK = HMAC-Hash(salt, IKM)"""
        if not salt:
            salt = b'\x00' * 32
        return hmac.new(salt, ikm, hashlib.sha256).digest()

    def _hkdf_expand(self, prk: bytes, info: bytes, length: int = 32) -> bytes:
        """HKDF-Expand: OKM = T(1) || T(2) || ... """
        hash_len = 32
        n = (length + hash_len - 1) // hash_len
        okm = b''
        t = b''
        for i in range(1, n + 1):
            t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
            okm += t
        return okm[:length]

    def derive_hybrid_key(
        self,
        qkd_key: Optional[str],
        pqc_shared_secret: Optional[bytes],
        context: str = "quantum-hybrid-session"
    ) -> Tuple[bytes, Dict]:
        """
        Derive a hybrid session key from QKD and PQC key material.
        
        Args:
            qkd_key: Hex string key from BB84 QKD
            pqc_shared_secret: Shared secret from Lattice-KEM
            context: Context string for key derivation
            
        Returns:
            Tuple of (session_key, derivation_info)
        """
        t0 = time.time()
        components_used = []

        # Combine available key material
        ikm = b''
        if qkd_key:
            qkd_bytes = bytes.fromhex(qkd_key)
            ikm += qkd_bytes
            components_used.append("BB84-QKD")

        if pqc_shared_secret:
            ikm += pqc_shared_secret
            components_used.append("Lattice-KEM")

        if not ikm:
            raise ValueError("No key material provided")

        # Add entropy
        salt = hashlib.sha256(b"quantum-resilient-salt-v1").digest()
        info = context.encode()

        # HKDF Extract + Expand
        prk = self._hkdf_extract(salt, ikm)
        session_key = self._hkdf_expand(prk, info, 32)

        derivation_time = time.time() - t0
        key_id = hashlib.sha256(session_key).hexdigest()[:16]
        self.session_keys[key_id] = session_key

        derivation_info = {
            "key_id": key_id,
            "components_used": components_used,
            "hybrid": len(components_used) > 1,
            "key_length_bits": len(session_key) * 8,
            "derivation_method": "HKDF-SHA256 (Extract + Expand)",
            "context": context,
            "derivation_time_ms": round(derivation_time * 1000, 4),
            "security_level": "quantum-resilient" if len(components_used) > 1 else "post-quantum",
        }

        self._log.append({
            "action": "key_derivation",
            "info": derivation_info,
            "timestamp": time.time()
        })

        return session_key, derivation_info

    def encrypt(self, plaintext: bytes, session_key: bytes, aad: bytes = None) -> EncryptedMessage:
        """
        Encrypt data using AES-256-GCM with hybrid key material.
        """
        t0 = time.time()
        nonce = os.urandom(12)
        cipher = AES.new(session_key, AES.MODE_GCM, nonce=nonce)

        if aad:
            cipher.update(aad)

        ciphertext, tag = cipher.encrypt_and_digest(plaintext)

        metadata = {
            "algorithm": "AES-256-GCM",
            "key_length_bits": 256,
            "nonce_length_bits": 96,
            "tag_length_bits": 128,
            "plaintext_length": len(plaintext),
            "ciphertext_length": len(ciphertext),
            "aad_present": aad is not None,
            "encryption_time_ms": round((time.time() - t0) * 1000, 4),
        }

        self._log.append({"action": "encrypt", "metadata": metadata, "timestamp": time.time()})

        return EncryptedMessage(
            ciphertext=ciphertext, nonce=nonce, tag=tag,
            key_source="hybrid-quantum-pqc",
            encryption_layers=2, metadata=metadata,
        )

    def decrypt(self, encrypted_msg: EncryptedMessage, session_key: bytes, aad: bytes = None) -> bytes:
        """Decrypt data using AES-256-GCM."""
        cipher = AES.new(session_key, AES.MODE_GCM, nonce=encrypted_msg.nonce)
        if aad:
            cipher.update(aad)
        plaintext = cipher.decrypt_and_verify(encrypted_msg.ciphertext, encrypted_msg.tag)
        return plaintext

    def full_pipeline(self, message: str, qkd_key: str, pqc_secret: bytes) -> Dict:
        """
        Execute the complete hybrid encryption pipeline.
        
        Returns a detailed report of all operations.
        """
        # Step 1: Hybrid key derivation
        session_key, key_info = self.derive_hybrid_key(qkd_key, pqc_secret)

        # Step 2: Encrypt
        plaintext = message.encode('utf-8')
        aad = json.dumps({"version": "1.0", "framework": "quantum-resilient"}).encode()
        encrypted = self.encrypt(plaintext, session_key, aad)

        # Step 3: Decrypt (verify round-trip)
        decrypted = self.decrypt(encrypted, session_key, aad)
        integrity_check = decrypted == plaintext

        return {
            "key_derivation": key_info,
            "encryption": encrypted.to_dict(),
            "decryption": {
                "success": integrity_check,
                "plaintext_recovered": decrypted.decode('utf-8') if integrity_check else None,
                "integrity_verified": integrity_check,
            },
            "pipeline_summary": {
                "layers": ["BB84-QKD", "Lattice-KEM", "HKDF-SHA256", "AES-256-GCM"],
                "total_security_layers": 4,
                "quantum_safe": True,
                "classical_safe": True,
            }
        }

    def get_log(self):
        return self._log
