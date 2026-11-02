# Zathu Software ⚡

Official website and software hub for **Zathu Software** (`cgarst`) — an independent open-source lab building open tools with the features we couldn't find anywhere else.

Deployed seamlessly under **GitHub Pages**.

---

## 🎯 Featured Software & Live Links

- **[MajesticTab](https://majestictab.zathu.net/)**: Focused guitar tab reader and practice studio supporting Guitar Pro, PDF, virtual fretboard, and local network Jam Mode. ([Source Code](https://github.com/cgarst/MajesticTab))
- **[Setlore](https://setlore.zathu.net/)**: Self-hosted live concert, gig history, and setlist analytics platform.
- **[Random Album for YouTube Music](https://github.com/cgarst/random-album-for-youtube-music)**: Browser extension and userscript to break out of algorithmic playlist fatigue and rediscover full album listening.
- **[LAN Party Scripts Suite](https://github.com/cgarst?tab=repositories)**: Zero-friction LAN party deployers for Call of Duty 4, COD: World at War, Quake III Arena, and Halo (Project Reclaimer).
- **[gamestream_launchpad](https://github.com/cgarst/gamestream_launchpad)**: Optimized Moonlight & GameStream launcher environment (390+ stars).
- **[GitHub Profile](https://github.com/cgarst/)**: Full collection of open-source tools and repositories.
- **[LinkedIn Profile](https://www.linkedin.com/in/coreygarst/)**: Professional profile and background.

---

## ⚡ Design System & Features

- **Launcher feel**: dark graphite panels, tactile press-down buttons, one hot orange, per-project accent colours. The synth is the hero, projects are a tile grid, and the LAN scripts are a server browser with copy-the-clone-command buttons. Set in Bricolage Grotesque.
- **Interactive Oscilloscope Canvas**: Real-time waveform visualizer (Sine, Sawtooth, Square, Pulse) reacting to cursor movement and audio clicks.
- **Web Audio Modal Synthesizer**: Chromatic root key selector and scale modes (Natural Minor, Harmonic Minor, Pentatonic, Dorian, Phrygian, Lydian, Mixolydian, Major) with auto-vibrato and hotkeys `[1]` through `[8]`.
- **Standalone Synth App (`/synth/`)**: The same Fidget Box 3000 synth, maximized with none of the site around it. It is an installable PWA (manifest + service worker) that works offline after the first visit.
- **Vanilla Web Stack**: Pure HTML5, CSS3, and JavaScript for fast load times and zero build dependencies.

---

## 🚀 Running Locally or Deploying

### Local Testing
```bash
python3 -m http.server 8080
# Open http://localhost:8080 in your browser
```

### GitHub Pages Deployment
1. Push this repository to GitHub (`cgarst/zathu-soft` or your organization repo).
2. Go to **Settings > Pages**.
3. Under **Build and deployment > Source**, select **Deploy from a branch** -> `main` / `root`.
4. Your site is live!

---

## 🗂 Code Layout

- `index.html`, `css/style.css`, `js/site.js`: the site.
- `js/synth/`: the synth as ES modules (`index.js` exports `mountSynth(target, { standalone })`; `audio`, `voices`, `ribbon`, `scope`, `keys`, `controls`, `music`, `state`, `ui`, `template`). `css/synth.css` styles it and `css/base.css` holds the shared tokens and reset.
- `synth/`: the `/synth/` app page, `manifest.webmanifest`, and `sw.js`. The service worker lives here so its scope is `/synth/`. Icons are in `assets/synth/`.
- ES modules need a web server (`python3 -m http.server`), not `file://`.
