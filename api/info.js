'use strict';

const { json, requirePost } = require('./_http');
const { AUDIO_BITRATES } = require('../backend/formats');
const { validatePublicUrl } = require('../backend/security');

const VIDEO_HEIGHTS = [144, 240, 360, 480, 720, 1080];

function platformName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YouTube';
  if (host.endsWith('instagram.com')) return 'Instagram';
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'X';
  if (host.endsWith('tiktok.com')) return 'TikTok';
  if (host.endsWith('facebook.com') || host === 'fb.watch') return 'Facebook';
  return host;
}

function provisionalOptions() {
  return {
    video_options: VIDEO_HEIGHTS.map((height) => ({
      quality: String(height),
      height,
      width: null,
      label: `${height}p`,
      estimated_size: null,
    })),
    best_video_estimated_size: null,
    audio_options: AUDIO_BITRATES.map((bitrate) => ({
      quality: String(bitrate),
      bitrate,
      label: `${bitrate} kbps`,
      estimated_size: null,
    })),
  };
}

async function youtubeMetadata(url) {
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('format', 'json');
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const data = await response.json();
  return {
    title: data.title || 'Video de YouTube',
    uploader: data.author_name || null,
    thumbnail: data.thumbnail_url || null,
  };
}

module.exports = async (req, res) => {
  if (!requirePost(req, res)) return;
  try {
    const url = await validatePublicUrl(req.body?.url);
    const platform = platformName(url);
    const metadata = platform === 'YouTube' ? await youtubeMetadata(url).catch(() => null) : null;
    return json(res, 200, {
      id: null,
      title: metadata?.title || `Contenido de ${platform}`,
      uploader: metadata?.uploader || null,
      duration: null,
      thumbnail: metadata?.thumbnail || null,
      platform,
      webpage_url: url,
      ...provisionalOptions(),
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'No se pudo consultar el enlace' });
  }
};
