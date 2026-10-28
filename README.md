# Project starter

A lightweight starting point for a software project. It contains guidance and planning documents, with no application code or stack-specific dependencies.

## Start a project

Copy this directory to a new project location, then rename the copy for your application. For example, in PowerShell:

```powershell
Copy-Item -Path "C:\Development\Templates\project-starter" -Destination "C:\Development\MyApp" -Recurse
```

In the new directory, fill in the relevant sections of `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `docs/TESTING.md` as decisions are made. Replace this README with a project overview and setup instructions once the application exists. Keep `AGENTS.md` for project-level guidance and add only conventions the project actually adopts.

## Contents

- `AGENTS.md`: project-level agent guidance.
- `docs/REQUIREMENTS.md`: goals, scope, and acceptance criteria.
- `docs/ARCHITECTURE.md`: technical structure and decisions.
- `docs/TESTING.md`: verification approach and commands.
