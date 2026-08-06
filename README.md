# Journeyman — the game master's codex

> [Русская версия](README.ru.md)

A place to keep material for tabletop roleplaying game masters. A static site,
no server: everything lives in the user's browser.

## Running it on your own machine

    git clone https://github.com/KennyS44/Journeyman.git

There is no build step — this is plain HTML/CSS/JS. Open `index.html` by
double-clicking it. Verified in Chrome: the application works, data is saved
and survives a browser restart.

If your browser denies storage to local files (this happens with some Firefox
builds), serve the project folder over a simple server and open
`http://localhost:8000`:

    python3 -m http.server 8000

Two caveats:

- `file://…/index.html` and `http://localhost:8000` are **different origins**
  as far as the browser is concerned, and each has its own storage. Pick one
  and stick to it, or it will look as if your material has vanished.
- The Cinzel and Spectral fonts are loaded from Google Fonts. Without an
  internet connection the layout stays intact, but the text falls back to a
  generic serif.

## How it works

- **Menu** — the list of "Spaces" (a campaign, a city, a dungeon). You can
  create, open and delete them.
- **Space** — a free-form canvas. You add *key objects* to it: a card with a
  picture and a name. A card can be dragged freely with the mouse or a finger —
  its position is saved. The canvas itself pans by dragging empty space, zooms
  with the wheel or a pinch, and "Show all" fits everything into view.
- **The "Link" tool** — switched on from the bar at the bottom. Tapping two
  objects draws a thread between them. Tapping the thread itself offers to
  break it.
- **An object's inner directory** — opened by tapping its name. In the middle
  is the object's text (it saves itself): bold, italics, subheadings, lists,
  **tables** and **images inline in the text**. Tapping an image reveals its
  corners — drag any of them to resize; the aspect ratio is kept and the size
  is remembered. On the right are the panels: dice, calculator, images and
  video, music, notes, linked directories.
  Music can be sent to a mini-player that survives moving between screens.
  Volume is shared across the whole application: it is remembered and stays
  the same as you move between objects and after a restart.
- **Dice** — a panel of their own: pick a die (d4…d100) and a count (up to 20),
  press "Roll". The dice spin first and only then land on their values; each
  new roll wipes out the previous one. Every die is shown, along with the total.
- **Calculator** — ordinary arithmetic with brackets and fractions, plus a
  history of recent calculations (tapping an entry puts the expression back in).
- **Plan notes** — a collapsible tab on the left. Opened, it takes up half the
  room and pushes the object's text to the right. It stays put as you move
  between objects of the same plan and closes when you move to another one:
  every plan has its own notes.
- **The whole codex** — two buttons at the bottom of the menu: save everything
  into a single file, and load it back. An individual space is saved with the
  button in its header. More on this below.

## Files

    index.html      the single page, the entry point
    css/app.css     styling: parchment and old gold
    js/db.js        storage on IndexedDB (records + files as Blobs)
    js/ui.js        helpers: dialogs, icons, notifications, file pickers, HTML sanitising
    js/zip.js       reading and writing zip — no third-party libraries
    js/backup.js    saving the codex to a file and loading it back
    js/calc.js      parsing dice expressions, and the calculator itself
    js/app.js       the shell: routes, shared header, mini-player
    js/demo.js      demo scene for the first run on empty storage
    js/screens/menu.js    screen #/ — the list of spaces
    js/screens/space.js   screen #/s/<id> — canvas, cards, links, zoom
    js/screens/node.js    screen #/n/<id> — object text, panels, the plan scroll
    demo/           covers and music for the demo scene
    tests/          checks for the expression parser and the packer

## Tests

Expression parsing and the packer are covered by tests. They have no effect on
the site — they are separate files meant to be run in Node:

    node tests/calc.test.js
    node tests/zip.test.js

The packer is also checked for compatibility with the system `zip` and `unzip`:
the archive we build is run through a real archiver, and one it creates is read
back by our code. If those programs are not installed, both checks are skipped.

The full round trip in a real browser is `tests/roundtrip.browser.js`: it fills
the codex up, saves it to a file, wipes the database, loads it back and compares
letter by letter. It needs Playwright, which is why it is kept separate; how to
run it is written at the top of the file.

## Data storage

Records and files live in the IndexedDB of the browser they were loaded into;
the camera position on the canvas and the sound volume live in localStorage.
The size is limited by the browser's quota (usually hundreds of megabytes or
more). Data is **not** synchronised between devices — that would require a
server with accounts and file storage.

## The whole codex: the `.jm.zip` file

Browser storage is not forever: clearing site data, reinstalling the system or
moving to another computer all mean the material is gone. So the entire codex
can be packed into a single file.

It is an ordinary zip containing `codex.json` with the records and an `assets`
folder with images, video and music exactly as they are. You can open it with
any archiver and pull your pictures out, even if this page is not at hand.
Files are stored without compression: media is already compressed by its own
formats, and the text next to it weighs a negligible amount.

Loading **adds** rather than replaces: spaces from the file appear alongside the
ones you already have, with new identifiers. Loading the same file twice will
produce a duplicate — which is visible and fixable, unlike an erased campaign.

That same file moves your material to the [desktop version](https://github.com/KennyS44/Journeyman-Desktop)
and back: they share the format.

Two caveats:

- The archive is assembled entirely in memory. For a codex with hundreds of
  megabytes of music on a weak machine this may not work out — the program
  warns you in advance.
- The name of the downloaded file is written in Latin letters: some browsers
  lose Cyrillic in a file name along with the extension. In the desktop version
  the name is kept as is — there the system dialog handles saving.
