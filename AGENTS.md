# AGENTS.md

Project constraints for Atlas, a one-page static website. These rules exist so
the site stays tiny, portable, and reviewable by hand.

## Constraints

- **Four source files only:** `index.html`, `download.html`, `style.css`,
  `script.js`. Do not add more source files without an explicit request.
- **No dependencies.** No package manager, no build step, no bundler. Do not
  install packages or add a `package.json`.
- **No CDNs or remote assets.** No hosted fonts, CSS, JS, images, or analytics.
  Everything must work offline from the local files. The one exception is the
  outbound **download link** on `download.html`, which points at the app's own
  download page.
- **University only.** Atlas is for university clubs. All copy must stay
  strictly campus-scoped: verified students, staff, and recognised societies at
  participating institutions. Do not describe private, public, or
  non-university communities.
- **Semantic HTML.** Use real elements for real jobs (`header`, `main`,
  `section`, `button`, `ul`/`li`, headings in order). Use ARIA only to add
  meaning that HTML does not already carry.
- **Accessible by default.** The page must be fully usable with a keyboard
  (visible focus, logical tab order, Enter/Space activation), and text and
  controls must meet contrast expectations in both themes.
- **Responsive.** Must work from narrow phone widths (~360px) up to wide
  desktop widths (~1440px+). Prefer fluid layout over many media queries.
- **Readable code.** Comment intent, not syntax. Keep the script small, plain,
  and defensive; no frameworks, no transpiling, no modern syntax that needs a
  build step.
- **Local only.** Serve on `localhost` for development. Do not deploy, host, or
  publish anywhere.
- **Do not commit, push, or install anything** unless the human explicitly asks.
- **Keep all work inside this project directory.**

## Structure

```
index.html      Overview page: heading, intro, About, Features, download link
download.html   Download page: the download button, install steps, eligibility
style.css       Theme tokens, layout, responsive rules
script.js       Theme toggle interaction
README.md       What it is and how to run it locally
LICENSE         Project license
```

## Notes for agents

- The interaction is the light/dark **theme toggle**, a single `<button>` in the
  header of both pages. Logic lives in `script.js`; see that file's header
  comment.
- Theme colors live in CSS custom properties at the top of `style.css`. Change
  colors there, not at the point of use.
- `localStorage` is treated as optional. Never let a blocked or unavailable
  storage API break the page.
- The download URL in `download.html` is a **placeholder** pointing at
  `example.com`. Replace the `href` in the `DOWNLOAD LINK` comment block when
  the real URL is known. Do not invent a real-looking URL.
- Both pages share the same header and footer markup. Keep them in sync.
