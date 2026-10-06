/** Ask the texture forge for one faction banner. A miss leaves the seeded palette. */

export async function forgeFactionBanner(client, event, attach) {
  if (!event || event.eventType !== 'faction-incursion' || !attach) return;
  const faction = event.eventMetadata?.faction || {};
  try {
    const forged = await client.forgeTexture({
      family: 'faction',
      seed: String(faction.bannerSeed || event.id).slice(0, 160),
      archetype: String(faction.doctrine || 'raid').slice(0, 32),
      source: 'Volcanic.png',
      mode: 'emu',
    });
    if (forged?.url) attach(event.id, forged.url, forged.provenance || []);
  } catch {
    // The event already carries a deterministic palette and unverified provenance.
  }
}
