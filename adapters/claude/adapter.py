#!/usr/bin/env python3
"""
Claude Adapter - Example mapping to Claude models
Inherits from generic adapter, overrides model mapping
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../generic"))
from adapter import GenericAdapter

class ClaudeAdapter(GenericAdapter):
    def __init__(self, repo_root):
        super().__init__(repo_root)
        self.model_mapping = {
            "low": "claude-3-haiku-20240307",
            "medium": "claude-3-sonnet-20240229",
            "high": "claude-3-opus-20240229"
        }

    def translate_model_policy(self, tier, agent_name):
        model_class = super().translate_model_policy(tier, agent_name)
        vendor_model = self.model_mapping.get(model_class, "claude-3-sonnet-20240229")
        print(f"[ClaudeAdapter] {tier}/{agent_name} -> {model_class} -> {vendor_model}", file=sys.stderr)
        return vendor_model

if __name__ == "__main__":
    import json
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    adapter = ClaudeAdapter(repo_root)
    if len(sys.argv) >= 4 and sys.argv[1] == "translate-model":
        print(adapter.translate_model_policy(sys.argv[2], sys.argv[3]))
    elif len(sys.argv) >= 3 and sys.argv[1] == "dispatch":
        print(json.dumps(adapter.dispatch_agent(sys.argv[2], {"tier": "T3", "state": "EXECUTION"}), indent=2))
