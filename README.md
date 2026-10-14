# Atlas

A two-page static website for Atlas, the app universities use to host their
clubs. Strictly university based: verified students, staff, and recognised
societies at participating institutions.

- **`index.html`** — overview: heading, short introduction, **About**, and
  **Features**, with a link through to the download page.
- **`download.html`** — the **download link**, how to get started, and who can
  use Atlas.
- Both pages share a light/dark **theme toggle**.

Built with plain HTML, CSS, and JavaScript. No dependencies, no build step, no
CDN, no accounts.

## Files

| File            | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `index.html`    | Overview page: About and Features                |
| `download.html` | Download page with the download link             |
| `style.css`     | Theme colors, layout, responsive rules           |
| `script.js`     | Theme toggle interaction                         |
| `AGENTS.md`     | Project constraints for agents and contributors  |
| `LICENSE`       | Project license                                  |

## The download link

The download button on `download.html` currently points at a **placeholder**:

```
https://example.com/atlas/download
```

When the real download URL is known, change the `href` on the
`<a class="download-button">` element in `download.html`. It is marked with a
`DOWNLOAD LINK` comment in the file.

## Run locally

Everything here is static, so all you need is a local web server. Pick one of
the options below and run it from the project directory.

### Option 1: Python 3 (usually already installed)

```sh
cd /Users/rickycui/github/openclaw
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in your browser.

Stop the server with `Ctrl+C`.

### Option 2: Any static file server

Any equivalent tool works, as long as it serves this directory on localhost.
For example, with `npx` (only if Node.js is already installed — this downloads
nothing into the project):

```sh
npx --yes serve . -l 8000
```

Then open <http://localhost:8000/>.

### Option 3: Open the file directly

Double-click `index.html`, or open it from your browser, to view it as a
`file://` URL. This works, but a real server (Option 1 or 2) is recommended so
the page behaves the same as it would when hosted.

> Note: this project is intended for `localhost` only. Do not deploy it.

## The interaction: theme toggle

The header has a single **theme toggle** button.

- On first visit, the page uses your operating system's color preference.
- Pressing the button switches between the light and dark themes. It works with
  a mouse and with the keyboard: focus it with `Tab`, then press `Enter` or
  `Space`.
- The button's label and `aria-pressed` state update to match, so screen
  readers announce the current theme.
- Your choice is saved in `localStorage`, so it is remembered on your next
  visit. If storage is blocked, the page still works; only the memory of your
  choice is lost.
- If you have not made an explicit choice, the page follows later changes to
  your OS theme.

Theme colors are defined once as CSS custom properties at the top of
`style.css` and switched by a `data-theme` attribute on the `<html>` element.

## Accessibility and responsiveness notes

- Semantic elements throughout, headings in order, and a "Skip to content" link.
- Visible keyboard focus outlines; motion is reduced when the OS asks for it.
- Layout uses a fluid, readable column and a self-reflowing feature grid, so it
  works at narrow (~360px) and wide (~1440px+) widths.
