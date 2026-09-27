# Quantum Rim Hackathon Plan

## Core experience

Players create a compact star system, trigger spectacular cosmic events, inspect how individual worlds changed, and save or share the resulting system.

## First playable milestone

1. Load the Mini Solar System scenario.
2. Select a star or planet.
3. Open a planet inspection panel.
4. Trigger stellar collapse or a supernova.
5. Apply physical and visual effects to nearby bodies.
6. Record the event in each affected body's history.
7. Rewind and replay the event.

## Atlas priorities

1. Blur or Tessa Image for transformed planet surfaces.
2. Labyrinth for civilization and infrastructure maps.
3. Coin Toss for important event branches.
4. Telablur for one before-and-after planetary transition.
5. Retrocausal Echo only after the visual experience is stable.

## Technical boundaries

- Keep the existing physics loop intact initially.
- Store event and quantum metadata in the Zustand body model.
- Run Atlas calls asynchronously through a server-side proxy.
- Cache every completed artifact.
- Never make an Atlas request per animation frame.
- Do not commit API tokens.
