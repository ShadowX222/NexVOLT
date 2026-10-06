# NexVOLT — GitHub Windows Build

This repository is configured so GitHub Actions builds NexVOLT on a hosted Windows machine. Your own PC does **not** need Node.js, npm, Electron, or administrator access to perform the build.

## Build from GitHub

1. Create a new GitHub repository.
2. Upload all files/folders in this project to the repository root.
3. Open the **Actions** tab.
4. Select **Build NexVOLT for Windows**.
5. Click **Run workflow**.
6. Wait for the Windows runner to finish.
7. Open the completed workflow run.
8. Under **Artifacts**, download **NexVOLT-Windows**.
9. Extract it. The package contains the Windows installer and portable EXE.

## Outputs

- `NexVOLT-1.0.0-x64.exe` — NSIS installer
- `NexVOLT-1.0.0-portable.exe` — portable build

## Important

NexVOLT requests administrator elevation using the normal Windows UAC mechanism because some supported optimizer actions modify protected Windows settings. It does not bypass UAC.

The native Windows layer supplies real CPU/RAM/GPU/storage/Windows information and implements only the explicitly supported optimization operations. Review items do not make system changes.

The Windows build is intentionally unsigned in this starter package. For public distribution, sign the installer/executable with a legitimate Windows code-signing certificate.
