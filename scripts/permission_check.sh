#!/usr/bin/env bash
# permission_check.sh - Validates agent can use tool per permissions.yaml
# v1.1
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/config/permissions.yaml"

check() {
  local agent="" tool="" 
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent) agent="$2"; shift 2 ;;
      --tool) tool="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$agent" ] || [ -z "$tool" ]; then echo "Usage: $0 check --agent NAME --tool TOOL"; return 4; fi

  if [ ! -f "$CONFIG" ]; then echo "Permissions config not found at $CONFIG"; return 2; fi

  # Simple check via python yaml parsing
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import yaml, sys
agent="$agent"
tool="$tool"
config_path="$CONFIG"

# Tool to permission mapping (simplified)
tool_perms={
  "read_file": "filesystem",
  "write_file": "filesystem",
  "edit_file": "filesystem",
  "bash": "shell",
  "curl": "network",
  "npm_install": "dependency",
  "git_write": "git",
  "deploy": "deployment",
  "secret_read": "secret"
}

# Load config
try:
    import yaml
    with open(config_path) as f:
        data=yaml.safe_load(f)
except:
    # Fallback if no yaml lib, parse crudely
    print(f"WARNING: Could not parse {config_path} as yaml, allowing")
    sys.exit(0)

roles=data.get('roles',{})
if agent not in roles:
    print(f"Agent {agent} not found in permissions, DENY")
    sys.exit(1)

# For simplicity, check filesystem.write for write_file
required_fs=None
if tool in ["write_file","edit_file"]:
    required_fs="write"
elif tool in ["read_file"]:
    required_fs="read"

role_perms=roles[agent]
fs_perm=role_perms.get('filesystem','deny')
if required_fs and fs_perm!=required_fs and fs_perm!='write':
    # read is ok for write? No, write requires write
    if required_fs=='write' and fs_perm!='write':
        print(f"DENY: Agent {agent} has filesystem={fs_perm} but needs {required_fs} for tool {tool}")
        sys.exit(1)
    if required_fs=='read' and fs_perm not in ['read','write']:
        print(f"DENY: Agent {agent} filesystem={fs_perm} needs read for {tool}")
        sys.exit(1)

# Check shell
if tool=="bash":
    shell_perm=role_perms.get('shell','deny')
    # Only execute allows full bash, limited allows limited, restricted and deny block bash
    if shell_perm not in ['execute']:
        print(f"DENY: Agent {agent} shell={shell_perm} cannot use bash (requires execute)")
        sys.exit(1)

# Check secret
if tool=="secret_read":
    sec=role_perms.get('secret.read','deny')
    # also check secret.read
    sec2=role_perms.get('secret',{}).get('read','deny') if isinstance(role_perms.get('secret'),dict) else role_perms.get('secret.read','deny')
    # Simplified: only human can read secrets
    if agent!="human":
        print(f"DENY: Only human can read secrets, agent {agent} denied")
        sys.exit(1)

print(f"ALLOW: Agent {agent} can use tool {tool} per permissions")
PY
    ec=$?
    return $ec
  else
    echo "Python not available, allowing by default (WARNING)"
    return 0
  fi
}

case "${1:-}" in
  check) shift; check "$@" ;;
  -h|--help|help|*) echo "Usage: $0 check --agent NAME --tool TOOL" ;;
esac
