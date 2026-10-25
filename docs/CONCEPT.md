# Runsheet — concept

[English](CONCEPT.md) | [Русский](CONCEPT.ru.md) · [README](../README.md)

> At a real race meeting, a session sheet sits on the pit wall. The team fills it through the day: when the car went out, which car it was, and which session ran — practice, qualifying, or race. Later they open a row and review how the outing went.
>
> Runsheet is the same kind of sheet for Assetto Corsa Competizione. The player drives alone at a PC, while events are written as if the pits were keeping the log automatically: outings stack top to bottom, and each one can be opened and broken down.

## Concept

A session sheet for Assetto Corsa Competizione. The player never starts recording: open the app, drive, and the session appears on the timeline by itself. Each timeline row expands to show the captured telemetry.

## 1. The app watches the game

- The app starts and waits quietly. There is no “start recording” button.
- While the game is off, the sheet is empty and shows that ACC is not running.
- As soon as the player is on track, recording starts on its own.
- When the player returns to the menu, that outing is closed.
- Pause does not split an outing. Sitting in the pits or adjusting setup is still the same outing.

## 2. What counts as one outing

One outing is one continuous run onto the track.

- It starts when the session becomes live: practice, qualifying, race, hotlap, or long run.
- It ends when the player exits to the ACC main menu.
- If the app was opened mid-lap, only what happened after opening is written to the sheet.
- A closed outing stays on the sheet permanently, even after the game is quit.

## 3. How the timeline works

The main page shows an event timeline from top to bottom.

A new event row appears when:

- the car changes;
- the track changes;
- solo driving switches to an online session, or the other way around.

Example timeline:

1. 21:04 — solo, Monza, BMW M4, practice.
2. 21:41 — online, Spa, BMW M4, practice.
3. 22:02 — online, Spa, BMW M4, qualifying.
4. 22:20 — online, Spa, BMW M4, race.

Practice, qualifying, and race from one visit to a server sit next to each other. They are parts of the same outing: same car, same track, same “online” flag. The player did **not** leave to the menu between them.

Leaving the menu and joining again is a different event group — technically a new session — even if the car and track are the same.

## 4. What a closed row shows

Without expanding the row, you can see:

- when the outing started;
- solo or online;
- the track;
- the car;
- what it was: practice, qualifying, race, hotlap, or long run.

The game does not expose the server name. So the row reads “online · Spa · BMW M4”, not the lobby title. Car count in the session can be shown: that value is known.

In-game car and track names are short and technical. On the sheet they should be human-readable: “BMW M4”, “Monza”, “Spa”.

## 5. Each event is an accordion (or a link to a detail page)

An event row is a foldable block. Inside is the already saved picture of the outing, not a live poll of the game at that second.

- The list of laps for that outing.
- For each lap: full time, three sectors, and whether the lap counted.
- For the selected lap: throttle, brake, steering, and how speed changed.
- The driving line on the track map.
- Next to it — the best lap of the same outing, so you can see where the current lap is slower and where the line differs.

While the outing is still running, its row on the sheet stays live: new laps append while the player is on track. After leaving to the menu the row freezes and is only opened for review.

## 6. Data storage

- Close the app and open it the next day — yesterday’s outings are still there.
- You can walk the sheet backwards and open any older outing the same way as today’s.
- Records live on the device in a local database.
