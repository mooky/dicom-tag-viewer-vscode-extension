---
name: commit
description: Branch, stage, and commit pending changes with clean per-fix commits and no Claude attribution. Use when the user asks to commit work.
---

Commit the current changes following this repo's git conventions.

**Steps**

1. **Check branch**

   Run `git status` and `git branch --show-current`. If the current branch is
   `main` (or the repo's default branch), create and switch to a new feature
   branch before committing anything. Pick a short kebab-case name from the
   nature of the change (e.g. `fix/upload-artifact-node20`). Never commit
   directly to `main`.

2. **Review what's changed**

   Run `git status` and `git diff` (staged and unstaged). If there are
   unrelated changes mixed in with the requested work, ask the user before
   folding them into the same commit — don't silently include or silently
   drop them.

3. **Split into per-fix commits**

   If the changes cover multiple distinct fixes/features, stage and commit
   each one separately rather than bundling everything into one commit.
   Stage specific files by name — never `git add -A` or `git add .` — so
   unrelated or sensitive files can't slip in.

4. **Write the commit message**

   - 1-2 sentences, focused on *why*, following this repo's existing commit
     message style (check `git log` for tone/format).
   - **Never** include Claude/AI attribution — no "Co-Authored-By: Claude",
     no "Generated with Claude Code", nothing referencing AI authorship, in
     any commit this skill creates.

5. **Commit and verify**

   Create the commit(s), then run `git status` (and `git log --oneline -n
   <N>` for multiple commits) to confirm they landed as expected.

**Guardrails**
- Never use `--no-verify`, `--no-gpg-sign`, or skip hooks.
- Never amend an existing commit unless the user explicitly asks.
- Never push — this skill only commits locally unless the user separately
  asks to push.
- If a pre-commit hook fails, fix the underlying issue and create a new
  commit — don't bypass the hook.
