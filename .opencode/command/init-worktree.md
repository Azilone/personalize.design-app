# init-worktree

You are an expert Git + multi-agent workflow assistant.
Goal: create an isolated git worktree + branch for a parallel coding agent, safely and repeatably.

Arguments: $ARGUMENTS
Expected usage examples:
- /init-worktree auth-refresh
- /init-worktree auth-refresh --base main
- /init-worktree bug-123 --base develop --path ../wt-bug-123

Rules:
- NEVER modify the user's "stable dev" worktree if it exists (commonly ../wt-dev or a worktree on main used for running the server).
- Create UNIQUE branch + path to avoid collisions between parallel agents.
- Prefer worktrees (git worktree) over editing the same directory.
- After creating the worktree, print clear "next steps" for the user/agent.

Do the following steps using bash commands:

1) Parse $ARGUMENTS:
- Take the first token as LABEL (slug). If missing, set LABEL="task".
- Optional flags:
  --base <branch>   (default: auto-detect main/master/current)
  --path <path>     (default: ../wt-<LABEL>-<STAMP>)
  --no-fetch        (skip fetch)
  --no-install      (skip dependency install hints)
  --yes             (skip any confirmation prompts)

2) Verify we are in a git repo. If not, explain and stop.

3) Determine BASE branch:
- If --base provided, use it.
- Else prefer "main" if it exists, else "master" if it exists, else use current branch.

4) (Unless --no-fetch) update refs:
- Run: git fetch --all --prune
- If BASE exists on origin, you may optionally: git pull --ff-only on BASE in its own worktree if safe; otherwise do not change the current worktree and just proceed.

5) Build unique names:
- STAMP = current timestamp (YYYYMMDD-HHMMSS)
- BRANCH = "agent/<LABEL>-<STAMP>"
- PATH default = "../wt-<LABEL>-<STAMP>"
- Also compute ROOT = repo root via: git rev-parse --show-toplevel

6) Safety checks:
- Ensure PATH does not already exist. If it does, append another short suffix (e.g., -2 or -<random>).
- Ensure we are not creating the worktree inside the current repo directory (keep it as a sibling folder).
- Never pick PATH that matches an existing stable dev worktree like "../wt-dev" or any worktree currently on BASE used for server.

7) Create the worktree + branch atomically:
- Command: git worktree add -b "$BRANCH" "$PATH" "$BASE"

8) Post-creation quality-of-life:
- Print the new worktree path and branch.
- Print commands to enter it: cd "$PATH"
- Print a reminder: "Run your agent HERE, keep your server running in the stable dev worktree."

9) Optional dependency hinting (unless --no-install):
- Detect common ecosystems and print the best install command WITHOUT guessing too hard.
  - If pnpm-lock.yaml exists -> suggest: pnpm install
  - else if yarn.lock -> yarn install
  - else if package-lock.json -> npm ci
  - If pyproject.toml -> suggest creating venv + pip install -e . (or the project’s standard)
  - If requirements.txt -> suggest: python -m venv .venv && pip install -r requirements.txt
- Only PRINT suggestions; do not run installs unless the user explicitly asked in $ARGUMENTS (e.g., contains --install). If --install is present, run the detected install command inside the new worktree.

10) Final output format (must be concise):
- ✅ Created worktree: <PATH>
- ✅ Branch: <BRANCH> (base: <BASE>)
- Next:
  1) cd <PATH>
  2) run your agent command (OpenCode/Claude/Codex) in this folder
  3) run tests/lint in this folder
  4) merge later (one branch at a time)

Now execute the steps with bash.
