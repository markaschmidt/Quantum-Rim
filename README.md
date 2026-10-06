<div align="center">

# ✦ Quantum Rim

### Govern the rim. The stars keep the receipts.

A browser galaxy you can actually command: persistent worlds, a legible economy, forecastable crises, short emergency actions, ruin expeditions, and a cinematic N-body system view when you want to watch the physics happen.

[**Enter the live system view →**](https://gravitas-kappa.vercel.app/simulation) · [Landing](https://gravitas-kappa.vercel.app) · [Services](https://github.com/markaschmidt/Quantum-Rim-Services)

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-r169-000?logo=three.js&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-443c22)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

The public host is the celestial theater: RK4 gravity, inclined orbits, accretion disks, Roche rings, and a starfield you can orbit with the mouse. Galactic command — the strategic layer in this repository — runs beside it, and stays playable when the network is down.

<p align="center">
  <img src="docs/screenshots/celestial-orders.png" alt="Celestial Orders over a star system, with velocity trails and the galactic command HUD" width="100%" />
</p>

<p align="center">
  <img src="docs/screenshots/black-hole.png" alt="Sagittarius-A and its accretion ring in the system view" width="32%" />
  <img src="docs/screenshots/solar-system.png" alt="Sol and a ringed world trailing through the simulator" width="32%" />
  <img src="docs/screenshots/figure8-simulation.png" alt="Proxima, Centauri, and Solaris in the figure-8 choreography" width="32%" />
</p>

<p align="center"><sub>Celestial Orders in galactic command. The smaller frames are from the system view.</sub></p>

---

## The command loop

1. Select a system and inspect one of its persistent planets.
2. Read settlement output, suitability, warnings, history, and Atlas transformation plans.
3. Meet a crisis whose cause is visible before the timer starts.
4. Finish a 20–90 second response before the deadline.
5. Commit the response immediately. The service resolves the bounded Atlas aftermath in the background and attaches artifacts plus provenance to the planet.
6. Launch a ruins expedition, spend supplies, reveal connected nodes, and write the findings into planetary history.
7. Ask an Imperial advisor. The conversation goes through the server-side OpenRouter gateway, never through a key in the browser.

An event director advances one strategic cycle every five seconds. It keeps a 4–8 cycle cooldown, caps the galaxy at three unresolved crises, and prefers high-pressure systems. It keeps running in both the galaxy map and the 3D system view.

## Two theaters

| Theater | What you do there |
| --- | --- |
| **Galaxy command** | Core Worlds, Inner Rim, and Outer Rim. Settlements, routes, defense fleets, graded deposits, credits, and the sky chart. |
| **System view** | The inherited Three.js sandbox. Merge or elastic collisions, tidal heating, Lagrange points, black-hole photon rings, velocity trails, cinema camera. |

Small-body collisions ask Coin Toss for a bounded encounter branch and Labyrinth for the debris topology. Those paths show up as hazard lanes on the galaxy map.

## Sky chart and incursions

The galaxy map can show three extra layers, each toggled the same way as the deposit heat map: comets, asteroid belts, and cosmic dust. Dust is a seeded haze. Belts are fields of individual asteroids that drift in the same direction around the core. Comets and meteors are bodies, not lines.

A comet's trajectory still uses Labyrinth's node-and-edge topology, and Coin Toss picks the heading (outer, inner, or core). The chart draws the body and its tail, and the body moves along that trajectory. Hovering it shows its name. It fades out when it reaches a system's proximity or leaves the map, then a replacement is charted. If Atlas is down, the same shape is filled by the classical fallback and the provenance says so. A chart that returns after the body has already travelled keeps the trajectory already on screen.

Deposit heat is a semi-transparent amoeba around each system that holds the selected grade, wider than the system marker. The outline is seeded, so two systems do not share a blob.

Raiders are a separate layer from the crisis console. One enemy fleet is allowed when the republic has one or two commissioned defense fleets. From three fleets upward the cap is one enemy for every three of yours. A republic with no defense fleet draws no map raiders. A raider flies in from the rim over several cycles. On arrival it presses the system: the map shows `KNOCKOUT` and a countdown. If that timer expires, the targeted mine, port, lab, medical station, or fleet goes offline for six cycles and the system shows `OFFLINE`. While the timer is still running, drag a defense fleet onto the raider. The fleet leaves its station and flies toward the raider's current position. When the two meet, both markers pulse `ENGAGED` for three cycles and the raid withdraws. The fleet then flies home. A fleet in the field, and a site that is offline, do not provide their usual defense, tax, or yield until they recover.

## The quantum boundary

Classical state stays authoritative. Moth Atlas supplies bounded variation, connected topology, visual plans, and atmosphere. Every service call has a deterministic fallback, so the game remains playable without credentials.

| Engine | Role in play |
| --- | --- |
| **Coin Toss** | Crisis branches, raid doctrine, and comet headings |
| **Labyrinth** | Routes, debris lanes, ruin topology, and comet polylines |
| **Tessa Image** | Long-term planetary surfaces, atmosphere, and incursion banners |
| **Blur** | Impact, storm, radiation, and lensing aftermath |
| **Telablur** | Paired worlds and linked anomaly states |
| **Retrocausal Echo** | Premonitions, clues, history, and event audio |

Provenance badges distinguish a completed Atlas result, an emulation, planned work, and a classical fallback.

## Architecture

```text
Quantum Rim
  ├── strategic Zustand store (authoritative local game state)
  ├── galaxy, economy, activity, and expedition models
  ├── command modals and the imperial status bar
  └── Quantum Rim Services client
           ↓
Quantum Rim Services (sibling FastAPI repository)
  ├── bounded controllers
  ├── event and expedition models
  ├── engine adapters
  ├── shared Moth client with polling, caching, and fallbacks
  └── server-side OpenRouter advisor gateway
```

## Develop

Node.js 18+ and npm 9+. For live Atlas and advisor calls, run the sibling [Quantum Rim Services](https://github.com/markaschmidt/Quantum-Rim-Services) repository.

```bash
npm install
npm run dev
```

Open `http://localhost:5173/simulation.html`.

```bash
npm test
npm run lint
npm run build
```

## Configure

Copy `.env.example` to `.env.local` when the FastAPI service is not on `http://localhost:8000`.

```bash
VITE_QUANTUM_SERVICE_URL=http://localhost:8000
```

Moth and OpenRouter credentials belong in the service repository. They must never be `VITE_` variables.

## Deploy

This is a Vite app. Publish `dist` and point `VITE_QUANTUM_SERVICE_URL` at the deployed FastAPI service. `simulation.html` is the playable entry. The current public build is [gravitas-kappa.vercel.app](https://gravitas-kappa.vercel.app/simulation).

## License

MIT. See [LICENSE](LICENSE).
