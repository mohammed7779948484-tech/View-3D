# Installing View-3D on Windows

The installer is **unsigned** (signing costs money; owner decision 0007). Windows SmartScreen
therefore warns the first time. This is expected.

1. Download `View-3D-Setup-<version>.exe` (from the pull request's CI run: "Package Windows
   installer", artifact `View-3D-installer`, a zip with the installer inside).
2. Double-click the installer.
3. If Windows shows **"Windows protected your PC"**:
   - click **More info**;
   - click **Run anyway**.
4. The app installs for your user only (no administrator password) and starts from the Start menu
   as **View-3D**. It never needs the internet.

To remove it: Windows Settings, Apps, View-3D, Uninstall.
A new version is a new installer, installed the same way (there is no auto-update in V1).
