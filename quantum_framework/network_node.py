"""
Quantum Network Node Abstraction
==================================
Models classical and quantum network nodes for the hybrid framework.
Supports dynamic network topology with both node types.
"""

import hashlib
import time
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from .bb84_qkd import BB84Protocol
from .post_quantum import LatticeKEM
from .hybrid_crypto import HybridCryptoEngine


@dataclass
class NodeInfo:
    """Information about a network node."""
    node_id: str
    node_type: str  # "quantum" or "classical"
    address: str
    capabilities: List[str]
    security_level: int
    active: bool = True


class QuantumNode:
    """
    A node in the quantum-classical hybrid network.
    
    Quantum nodes can perform QKD + PQC.
    Classical nodes fall back to PQC only.
    """

    def __init__(self, node_id: str, node_type: str = "quantum", security_level: int = 3):
        self.node_id = node_id
        self.node_type = node_type
        self.security_level = security_level
        self.kem = LatticeKEM(security_level)
        self.crypto = HybridCryptoEngine()
        self.keypair = self.kem.keygen()
        self.connections: Dict[str, dict] = {}
        self._event_log: List[Dict] = []

        caps = ["Lattice-KEM", "AES-256-GCM", "HKDF-SHA256", "Lattice-DSA"]
        if node_type == "quantum":
            caps.extend(["BB84-QKD", "Quantum-Channel", "QBER-Detection"])

        self.info = NodeInfo(
            node_id=node_id, node_type=node_type,
            address=f"qnet://{node_id}.quantum.local",
            capabilities=caps, security_level=security_level,
        )

    def _log_event(self, event: str, details: dict = None):
        self._event_log.append({
            "node": self.node_id, "event": event,
            "details": details or {}, "timestamp": time.time()
        })

    def establish_connection(self, peer: 'QuantumNode', num_qubits: int = 256, eavesdropper: bool = False) -> Dict:
        """Establish a secure connection with a peer node."""
        t0 = time.time()
        result = {"peer": peer.node_id, "initiator": self.node_id, "layers": []}

        # Layer 1: QKD (if both nodes support it)
        qkd_key = None
        qkd_result = None
        if self.node_type == "quantum" and peer.node_type == "quantum":
            bb84 = BB84Protocol(num_qubits=num_qubits)
            qkd_result = bb84.run(eavesdropper=eavesdropper)
            qkd_key = qkd_result.final_key
            result["layers"].append({
                "name": "BB84-QKD",
                "status": "secure" if not qkd_result.eavesdropper_detected else "compromised",
                "qber": qkd_result.qber,
                "key_generated": qkd_key is not None,
            })
            result["qkd"] = qkd_result.to_dict()

        # Layer 2: Post-Quantum KEM
        kem_ct = self.kem.encapsulate(peer.keypair.public_key)
        pqc_secret = kem_ct.shared_secret
        result["layers"].append({
            "name": "Lattice-KEM",
            "status": "active",
            "algorithm": f"Lattice-KEM-{self.kem.K * 256}",
            "shared_secret_length": len(pqc_secret) * 8,
        })

        # Layer 3: Hybrid key derivation
        session_key, key_info = self.crypto.derive_hybrid_key(qkd_key, pqc_secret)
        result["layers"].append({
            "name": "HKDF-SHA256",
            "status": "derived",
            "hybrid": key_info["hybrid"],
            "components": key_info["components_used"],
        })
        result["key_derivation"] = key_info

        # Store connection
        conn_id = hashlib.sha256(f"{self.node_id}-{peer.node_id}".encode()).hexdigest()[:12]
        self.connections[peer.node_id] = {
            "conn_id": conn_id, "session_key": session_key,
            "peer": peer.node_id, "established": time.time(),
        }
        peer.connections[self.node_id] = {
            "conn_id": conn_id, "session_key": session_key,
            "peer": self.node_id, "established": time.time(),
        }

        result["connection_id"] = conn_id
        result["total_time_ms"] = round((time.time() - t0) * 1000, 2)
        result["security_summary"] = {
            "quantum_layer": "active" if qkd_key else "unavailable",
            "pqc_layer": "active",
            "hybrid_key": key_info["hybrid"],
            "encryption": "AES-256-GCM",
            "overall": "quantum-resilient" if qkd_key else "post-quantum",
        }

        self._log_event("connection_established", result)
        return result

    def send_message(self, peer_id: str, message: str) -> Dict:
        """Send an encrypted message to a connected peer."""
        if peer_id not in self.connections:
            return {"error": f"No connection to {peer_id}"}

        conn = self.connections[peer_id]
        session_key = conn["session_key"]
        encrypted = self.crypto.encrypt(message.encode(), session_key)

        return {
            "from": self.node_id, "to": peer_id,
            "connection_id": conn["conn_id"],
            "encrypted": encrypted.to_dict(),
            "message_length": len(message),
        }

    def get_status(self) -> Dict:
        return {
            "node_id": self.node_id,
            "type": self.node_type,
            "security_level": self.security_level,
            "capabilities": self.info.capabilities,
            "active_connections": len(self.connections),
            "connected_peers": list(self.connections.keys()),
            "address": self.info.address,
            "active": self.info.active,
        }


class QuantumNetwork:
    """A network of quantum and classical nodes."""

    def __init__(self, name: str = "QuantumNet"):
        self.name = name
        self.nodes: Dict[str, QuantumNode] = {}

    def add_node(self, node_id: str, node_type: str = "quantum", security_level: int = 3) -> Dict:
        node = QuantumNode(node_id, node_type, security_level)
        self.nodes[node_id] = node
        return node.get_status()

    def connect_nodes(self, node_a_id: str, node_b_id: str, num_qubits: int = 256, eavesdropper: bool = False) -> Dict:
        if node_a_id not in self.nodes or node_b_id not in self.nodes:
            return {"error": "Node not found"}
        return self.nodes[node_a_id].establish_connection(
            self.nodes[node_b_id], num_qubits, eavesdropper
        )

    def send_message(self, from_id: str, to_id: str, message: str) -> Dict:
        if from_id not in self.nodes:
            return {"error": "Sender node not found"}
        return self.nodes[from_id].send_message(to_id, message)

    def get_topology(self) -> Dict:
        nodes_info = []
        edges = []
        for nid, node in self.nodes.items():
            nodes_info.append(node.get_status())
            for peer_id in node.connections:
                edge = tuple(sorted([nid, peer_id]))
                edge_dict = {"source": edge[0], "target": edge[1]}
                if edge_dict not in edges:
                    edges.append(edge_dict)
        return {"name": self.name, "nodes": nodes_info, "edges": edges, "node_count": len(self.nodes), "edge_count": len(edges)}
