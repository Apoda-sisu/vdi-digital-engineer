#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, '.')
from core.geometry_engine import GeometryEngine

with open('/tmp/engine_test.log', 'w') as f:
    f.write("Starting test...\n")
    
    engine = GeometryEngine()
    f.write(f"Symbols loaded: {len(engine.symbols)}\n")
    
    symbols = engine.list_symbols()
    f.write(f"Symbol list: {len(symbols)} symbols\n")
    
    for s in symbols:
        f.write(f"  - {s.get('symbol_id')}: {s.get('name')}\n")
    
    engine.close()
    f.write("Done\n")