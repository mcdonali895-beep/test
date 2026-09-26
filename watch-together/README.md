# Watch Together

Eine kleine Web-App, um YouTube-Videos synchron mit Freunden zu schauen —
gemeinsame Räume, Play/Pause/Seek-Sync und ein Live-Chat.

## Installation & Start

```bash
cd watch-together
npm install
npm start
```

Danach im Browser [http://localhost:3000](http://localhost:3000) öffnen.

## Benutzung

1. Namen eingeben und einen neuen Raum erstellen (oder einen Raum-Code
   eingeben, um einem bestehenden Raum beizutreten).
2. Den Link über "🔗 Link kopieren" mit Freunden teilen — er enthält den
   Raum-Code als `?room=...`-Parameter.
3. Einen YouTube-Link oder eine Video-ID oben einfügen und auf "Laden"
   klicken.
4. Play, Pause und Springen im Video werden automatisch mit allen im Raum
   synchronisiert. Im Chat rechts kann parallel geschrieben werden.

## Technik

- **Backend:** Node.js, Express (statische Auslieferung), Socket.IO
  (Echtzeit-Events für Play/Pause/Seek/Chat/Nutzerliste).
- **Frontend:** Vanilla JS + YouTube IFrame Player API.
- Der Server hält pro Raum den zuletzt bekannten Zustand (Video, Zeit,
  Play/Pause), damit später beitretende Nutzer sofort synchron starten.
