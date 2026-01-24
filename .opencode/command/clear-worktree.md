# clear-worktree

You are an expert Git + multi-agent workflow assistant.
Goal: safely remove one (or many) agent worktrees created for parallel work, without deleting valuable work.

Arguments: $ARGUMENTS
Usage examples:
- /clear-worktree ../wt-auth-refresh-20260124-101500
- /clear-worktree agent/auth-refresh-20260124-101500
- /clear-worktree auth-refresh --all
- /clear-worktree --all
- /clear-worktree auth-refresh --force --yes --prune-branches

Rules:
- NEVER remove the current worktree.
- NEVER remove a stable dev worktree (commonly ../wt-dev) or anything on main/master used for running the server.
- Default behavior is SAFE: refuse if uncommitted/unmerged/unpushed work exists, unless --force is provided.
- Always show what you plan to delete and ask confirmation unless --yes is provided.

Do the following steps using bash commands:

1) Parse $ARGUMENTS:
- Target can be:
  - a worktree PATH
  - a BRANCH name
  - a LABEL (partial match)
- Flags:
  --all             (remove all worktrees whose branch starts with "agent/")
  --force           (allow removing even if dirty/unmerged; still warn)
  --yes             (skip confirmation prompt)
  --prune-branches  (also delete the local branches after removing worktrees)
  --dry-run         (show plan only, remove nothing)

2) Verify we are in a git repo. If not, explain and stop.

3) List worktrees (machine-readable):
- git worktree list --porcelain
Parse entries into (path, branch, head).

4) Select candidates:
- If --all: select entries where branch matches refs/heads/agent/* OR local branch name starts with "agent/".
- Else if a PATH matches: select that.
- Else if a BRANCH matches: select that worktree.
- Else treat first token as LABEL and select worktrees whose branch contains LABEL OR whose path contains LABEL.
If selection is empty, print the worktree list and stop.

5) Hard safety exclusions (always apply):
- Exclude the current worktree path.
- Exclude paths that look like stable dev worktrees: "../wt-dev", "./wt-dev", or any worktree on main/master that the user likely uses as stable.
- Exclude the main repo directory itself (never remove the primary checkout).

6) Risk checks for each selected worktree:
For each PATH:
- Dirty check: git -C "$PATH" status --porcelain
  - If non-empty and no --force: refuse and print instructions.
- Branch safety:
  - Determine BRANCH (if detached, warn).
  - If branch exists:
    - Check if branch is merged into BASE (auto-detect BASE as main/master/current default):
      git branch --merged "$BASE" | grep the branch
    - If not merged and no --force: refuse and print:
      - suggested commands to inspect: git log --oneline --decorate --graph --max-count=30
      - suggested commands to merge or open PR
- If upstream is set, check for unpushed commits:
  - git -C "$PATH" rev-parse --abbrev-ref --symbolic-full-name @{u}
  - if exists: git -C "$PATH" rev-list --count @{u}..HEAD
  - if >0 and no --force: refuse

7) Plan output:
Print a bullet list of what will be removed:
- PATH
- BRANCH (if any)
- whether branch delete is planned (--prune-branches)
If --dry-run: stop here.

8) Confirmation:
- If not --yes: ask the user to confirm ("Type YES to proceed") and only proceed if confirmed.

9) Removal:
For each PATH:
- git worktree remove "$PATH" (or with --force if --force)
If --prune-branches:
- delete the corresponding local branch:
  - safe delete: git branch -d "<branch>"
  - if --force: git branch -D "<branch>"

10) Cleanup:
- git worktree prune

11) Final output:
- ✅ Removed N worktree(s)
- If anything was skipped, explain why and how to resolve.

Now execute the steps with bash.
