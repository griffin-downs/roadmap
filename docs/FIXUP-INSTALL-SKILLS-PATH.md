# Fixup: install --skills writes to wrong directory

**Target**: Agent maintaining `roadmap install --skills` in ~/src/roadmap
**Priority**: Blocking — skills are not invokable in their current location

## Bug

`roadmap install --skills` writes skill files to `.claude/commands/`. This is the old convention. Claude Code's Skill tool looks for skills in `.claude/skills/`. The installed skills are invisible to the Skill tool — agents have to manually read the .md files and execute the steps by hand, which defeats the entire purpose of skill-based enforcement.

## Fix

### 1. Change target directory

```
Current:  .claude/commands/roadmap-*.md
Correct:  .claude/skills/roadmap-*/SKILL.md
```

Each skill needs its own subdirectory with a `SKILL.md` file inside it. This is the convention the Skill tool expects:

```
.claude/skills/
  roadmap-start/
    SKILL.md          # was: .claude/commands/roadmap-start.md
  roadmap-work/
    SKILL.md
  roadmap-done/
    SKILL.md
  roadmap-dispatch/
    SKILL.md
  roadmap-review/
    SKILL.md
  roadmap-gallery/
    SKILL.md
  roadmap-progress/
    SKILL.md
  roadmap-constraints/
    SKILL.md
  roadmap-explore-write/
    SKILL.md
  roadmap-explore-run/
    SKILL.md
```

### 2. Update install-skills.ts

The `installAll()` function and `SkillTemplate.write()` need to:
- Create `.claude/skills/<skill-name>/` directory
- Write content as `SKILL.md` inside that directory
- Not write to `.claude/commands/` at all

```typescript
// Current (wrong):
writeFileSync(join(targetDir, `roadmap-${id}.md`), content)

// Correct:
const skillDir = join(targetDir, `roadmap-${id}`)
mkdirSync(skillDir, { recursive: true })
writeFileSync(join(skillDir, 'SKILL.md'), content)
```

### 3. Update target directory default

```typescript
// Current (wrong):
const targetDir = opts.targetDir ?? '.claude/commands'

// Correct:
const targetDir = opts.targetDir ?? '.claude/skills'
```

### 4. Update install output message

```
// Current:
Installed 8 skill(s) to .claude/commands

// Correct:
Installed 8 skill(s) to .claude/skills
```

### 5. Update CLAUDE.md slim protocol block

The pointer table should not need updating — skill names stay the same (`/roadmap-start`, `/roadmap-work`, etc.). The Skill tool resolves them by directory name under `.claude/skills/`.

### 6. Install scope: project directory

`roadmap install --skills` installs to the **current project's** `.claude/skills/`. This is correct — skills are project-scoped. The `--constraints` flag extracts from a global path (`~/.claude/CLAUDE.md`) but writes the result to the project's skill directory.

Do not install to `~/.claude/skills/` (global). Project-scoped skills ensure each project gets the correct roadmap binary path and version-matched skill content.

### 7. Clean up old location

If `.claude/commands/roadmap-*.md` files exist from a previous install, remove them. They're dead files that create confusion.

```typescript
// After installing to .claude/skills/:
const oldCommandsDir = join(projectRoot, '.claude', 'commands')
if (existsSync(oldCommandsDir)) {
  for (const file of readdirSync(oldCommandsDir)) {
    if (file.startsWith('roadmap-') && file.endsWith('.md')) {
      unlinkSync(join(oldCommandsDir, file))
    }
  }
}
```

Only remove `roadmap-*` files — don't touch other commands (e.g., `speckit.*`).

## Verification

After fix, this should work:

```
$ roadmap install --skills
Installed 8 skill(s) to .claude/skills

$ ls .claude/skills/roadmap-start/
SKILL.md

$ # Agent calls:
Skill(skill: "roadmap-start", args: "intent text here")
# → Skill tool finds .claude/skills/roadmap-start/SKILL.md
# → Executes the steps
# → No manual file reading needed
```

## Files to modify

- `src/lib/install-skills.ts` — `SkillTemplate.write()`, `installAll()` target path, cleanup logic
- `bin/roadmap.ts` — `cmdInstall()` output messages
- Tests — update path assertions from `.claude/commands/` to `.claude/skills/<name>/SKILL.md`
