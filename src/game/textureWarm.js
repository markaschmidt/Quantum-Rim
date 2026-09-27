import { localPlanetTexture } from './planetTextures.js';
import { putTextureBlob, rememberTextureUrl, resolveCachedTexture } from './textureCache.js';

export async function warmBodyTexture(client, body, apply) {
  if (!body?.texture) return;
  const local = localPlanetTexture(body.texture.source);
  if (local && !body.textureUrl) {
    apply(body.id, { textureUrl: local, textureMode: body.textureMode || 'classical-fallback' });
  }
  const cached = await resolveCachedTexture(body.texture.seed);
  if (cached) {
    apply(body.id, {
      textureUrl: cached,
      textureMode: body.textureMode === 'pending' ? 'classical-fallback' : (body.textureMode || 'classical-fallback'),
      textureKey: body.texture.seed,
    });
  }
  if (!client?.forgeTexture) {
    apply(body.id, { textureMode: 'classical-fallback' });
    return;
  }
  try {
    const response = await client.forgeTexture({
      family: body.texture.family,
      seed: body.texture.seed,
      archetype: body.texture.archetype,
      source: body.texture.source,
      secondary: body.texture.secondary || null,
    });
    if (!response?.url) {
      apply(body.id, { textureMode: 'classical-fallback' });
      return;
    }
    const absolute = /^https?:/i.test(response.url) ? response.url : `${client.baseUrl}${response.url}`;
    let display = absolute;
    try {
      const blob = await fetch(absolute).then((result) => {
        if (!result.ok) throw new Error('texture fetch failed');
        return result.blob();
      });
      await putTextureBlob(body.texture.seed, blob);
      display = URL.createObjectURL(blob);
      rememberTextureUrl(body.texture.seed, display);
    } catch {
      display = absolute;
    }
    apply(body.id, {
      textureUrl: display,
      textureMode: response.mode || 'classical-fallback',
      textureKey: body.texture.seed,
    });
  } catch {
    apply(body.id, { textureMode: 'classical-fallback' });
  }
}

export async function warmForgeTextures(client, bodies, apply) {
  await Promise.all((bodies || []).map((body) => warmBodyTexture(client, body, apply)));
}
