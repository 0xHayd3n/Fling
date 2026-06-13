# Fling — manual test playbook

Manual smoke tests for things that automated tests can't cover (live phone, UI behavior).

## Wireless QR pairing (v0.6.0+)

**Prereqs:** A phone with Developer options + Wireless debugging enabled, on the same WiFi as the desktop. No USB cable.

1. Disconnect all USB devices. Launch Fling.
2. Hero card shows **"Pair wirelessly →"**. Click it.
3. Within ~500 ms the modal appears with a QR code and the 3-step instructions.
4. On the phone: Settings → System → Developer options → Wireless debugging → "Pair device with QR code". Point the camera at the desktop QR.
5. The status pill transitions: `Waiting for phone…` → `Pairing…` → `Connecting…` → `Connected`. Modal auto-closes after ~1 s.
6. A success toast appears: **"Phone paired and connected · <model>"**.
7. Quit Fling. Relaunch. Within ~4 s of launch, a `Reconnected · <model>` toast appears and the device is ready (no re-pairing).

**Pin fallback path:**

1. Open the pairing modal. Click **"Use pairing code instead →"**.
2. On the phone, tap "Pair device with pairing code" instead of QR. The phone displays IP, port, and 6-digit code.
3. Type all three into the dialog. Click **Pair**.
4. Same status transitions as QR path.

**Failure paths to spot-check:**

- Cancel the modal mid-`Waiting`. Confirm the in-flight `adb mdns services` poll stops (no lingering subprocess in Task Manager / `ps`).
- Put the phone on a different WiFi. Confirm the status hits `Couldn't find your phone…` after 60 s and a Retry button appears.
- On a network where mDNS is unavailable (`adb mdns check` shows it disabled), confirm the error message points to the pin-code path.
