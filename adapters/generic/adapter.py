#!/usr/bin/env python3
"""
Generic Adapter - Provider-independent execution
Translates agent contracts, tool contracts, model policy, permission policy, workflow state
into local bash/python execution
"""
import json
import os
import sys
import subprocess
import yaml

class GenericAdapter:
    def __init__(self, repo_root):
        self.repo_root = repo_root
        self.config_path = os.path.join(repo_root, "config")

    def load_agent_contract(self, agent_name):
        path = os.path.join(self.repo_root, "agents", f"{agent_name}.yaml")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Agent contract not found: {path}")
        with open(path) as f:
            return yaml.safe_load(f)

    def check_permission(self, agent_name, tool):
        # Delegate to permission_check.sh
        script = os.path.join(self.repo_root, "scripts", "permission_check.sh")
        result = subprocess.run(
            [script, "check", "--agent", agent_name, "--tool", tool],
            capture_output=True, text=True
        )
        return result.returncode == 0, result.stdout

    def translate_model_policy(self, tier, agent_name):
        policy_path = os.path.join(self.config_path, "model_policy.yaml")
        with open(policy_path) as f:
            policy = yaml.safe_load(f)
        tier_policy = policy.get("tiers", {}).get(tier, {})
        routing = tier_policy.get("model_routing", {})
        model_class = routing.get(agent_name, "medium")
        return model_class

    def translate_workflow_state(self, from_state, to_state):
        script = os.path.join(self.repo_root, "scripts", "state_machine.sh")
        result = subprocess.run(
            [script, "validate", "--from", from_state, "--to", to_state],
            capture_output=True, text=True
        )
        return result.returncode == 0, result.stdout

    def execute_tool(self, agent_name, tool, args=None, run_id=None):
        # Check permission first
        allowed, msg = self.check_permission(agent_name, tool)
        if not allowed:
            # Log violation
            if run_id:
                event_script = os.path.join(self.repo_root, "scripts", "event_log.sh")
                subprocess.run([
                    event_script, "append",
                    "--run", run_id,
                    "--type", "PERMISSION_VIOLATION",
                    "--actor", agent_name,
                    "--state", "EXECUTION",
                    "--payload", json.dumps({"tool": tool, "reason": msg})
                ])
            raise PermissionError(f"Permission denied for {agent_name} to use {tool}: {msg}")

        # Execute based on tool
        if tool == "read_file":
            # Simulate read
            return {"status": "success", "tool": tool, "agent": agent_name}
        elif tool == "write_file":
            return {"status": "success", "tool": tool, "agent": agent_name}
        elif tool == "bash":
            # Execute bash with restriction check already done
            if args:
                result = subprocess.run(args, shell=True, capture_output=True, text=True)
                return {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
            return {"status": "no args"}
        else:
            # Generic tool execution via scripts/
            script_path = os.path.join(self.repo_root, "scripts", f"{tool}.sh")
            if os.path.exists(script_path):
                result = subprocess.run([script_path] + (args or []), capture_output=True, text=True)
                return {"exit_code": result.returncode, "stdout": result.stdout}
            return {"status": "tool not found, simulated", "tool": tool}

    def dispatch_agent(self, agent_name, task, run_id=None):
        contract = self.load_agent_contract(agent_name)
        model_class = self.translate_model_policy(task.get("tier", "T1"), agent_name)

        # Log agent start
        if run_id:
            event_script = os.path.join(self.repo_root, "scripts", "event_log.sh")
            subprocess.run([
                event_script, "append",
                "--run", run_id,
                "--type", "AGENT_STARTED",
                "--actor", agent_name,
                "--state", task.get("state", "EXECUTION"),
                "--payload", json.dumps({"task": task, "model_class": model_class})
            ])

        # Simulate execution (in real implementation, would call provider API)
        print(f"[{agent_name}] Starting with model_class={model_class}, purpose: {contract.get('purpose','')[:100]}")

        # Check evidence required
        evidence_required = contract.get("evidence_required", [])

        result = {
            "agent": agent_name,
            "role": contract.get("role"),
            "model_class": model_class,
            "status": "completed",
            "evidence": evidence_required,
            "cost": {"tokens_est": 1000, "model_class": model_class}
        }

        # Log completion
        if run_id:
            event_script = os.path.join(self.repo_root, "scripts", "event_log.sh")
            subprocess.run([
                event_script, "append",
                "--run", run_id,
                "--type", "AGENT_COMPLETED",
                "--actor", agent_name,
                "--state", task.get("state", "EXECUTION"),
                "--payload", json.dumps(result)
            ])

        return result

if __name__ == "__main__":
    # CLI for testing
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    adapter = GenericAdapter(repo_root)

    if len(sys.argv) < 2:
        print("Usage: adapter.py {check-permission|translate-model|dispatch|validate-state} ...")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "check-permission":
        agent = sys.argv[2]
        tool = sys.argv[3]
        allowed, msg = adapter.check_permission(agent, tool)
        print(msg)
        sys.exit(0 if allowed else 1)
    elif cmd == "translate-model":
        tier = sys.argv[2]
        agent = sys.argv[3]
        print(adapter.translate_model_policy(tier, agent))
    elif cmd == "validate-state":
        from_s = sys.argv[2]
        to_s = sys.argv[3]
        ok, msg = adapter.translate_workflow_state(from_s, to_s)
        print(msg)
        sys.exit(0 if ok else 1)
    elif cmd == "dispatch":
        agent = sys.argv[2]
        task = {"tier": "T2", "state": "EXECUTION"}
        print(json.dumps(adapter.dispatch_agent(agent, task), indent=2))
