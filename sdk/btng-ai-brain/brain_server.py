#!/usr/bin/env python3
"""
BTNG Brain Server — entry-point alias for brain_gate.py
Run with:
    cd sdk/btng-ai-brain
    python brain_server.py
"""
from brain_gate import app
import os

if __name__ == '__main__':
    port = int(os.environ.get("BTNG_BRAIN_PORT", 8087))
    host = os.environ.get("BTNG_BRAIN_HOST", "127.0.0.1")
    print(f"🧠 BTNG Brain Server starting on http://{host}:{port}")
    print(f"   Node     : {os.environ.get('BTNG_NODE_ID', 'btng-node-local')}")
    print(f"   Endpoints: POST /govern  |  GET /health")
    print(f"   CORS     : localhost:8086, localhost:8081")
    print()
    app.run(host=host, port=port, debug=False)
