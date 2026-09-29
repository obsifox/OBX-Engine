#!/usr/bin/env python3
"""
Codex/GPT Adapter
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../generic"))
from adapter import GenericAdapter

class CodexAdapter(GenericAdapter):
    def __init__(self, repo_root):
        super().__init__(repo_root)
        self.model_mapping = {
            "low": "gpt-4o-mini",
            "medium": "gpt-4o",
            "high": "o1"
        }

    def translate_model_policy(self, tier, agent_name):
        model_class = super().translate_model_policy(tier, agent_name)
        vendor_model = self.model_mapping.get(model_class, "gpt-4o")
        print(f"[CodexAdapter] {tier}/{agent_name} -> {model_class} -> {vendor_model}", file=sys.stderr)
        return vendor_model

if __name__ == "__main__":
    import json
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    adapter = CodexAdapter(repo_root)
    if len(sys.argv) >= 4 and sys.argv[1] == "translate-model":
        print(adapter.translate_model_policy(sys.argv[2], sys.argv[3]))
