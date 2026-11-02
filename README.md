# LAN Classroom
Control and monitor devices on one LAN from the browser: messages, alerts, freeze, screen sharing, file sharing, invite by QR code. No internet needed after setup.

## Run (Windows)
**Option A – .exe:** download `LAN-Classroom.exe` from the *Releases* page and double-click it.
**Option B – source:** install Node.js 18+, then double-click `start.bat` (or run `npm install` then `npm start`).

Open one of the printed `https://...:3000` addresses (accept the certificate warning once).
Admin PIN defaults to `1234` (change with `set ADMIN_PIN=yourpin` before starting).
Students scan the QR code in the admin panel's **Invite** card and press *Join class*.

## Notes
Freeze only covers the browser tab. Android browsers cannot share their screen but can receive everything and send files.
