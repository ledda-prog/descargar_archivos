'use strict';

const AUDIO_BITRATES = [128, 192, 320];
const MIN_VIDEO_HEIGHT = 144;
const MAX_VIDEO_HEIGHT = 4320;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function estimateFormatBytes(format, duration) {
  const direct = positiveNumber(format.filesize) || positiveNumber(format.filesize_approx);
  if (direct) return Math.round(direct);
  const seconds = positiveNumber(duration);
  const bitrate = positiveNumber(format.tbr)
    || ((positiveNumber(format.vbr) || 0) + (positiveNumber(format.abr) || 0));
  return seconds && bitrate ? Math.round(seconds * bitrate * 1000 / 8) : null;
}

function estimateAudioBytes(duration, bitrate) {
  const seconds = positiveNumber(duration);
  const kbps = positiveNumber(bitrate);
  return seconds && kbps ? Math.round(seconds * kbps * 1000 / 8) : null;
}

function maxKnown(values) {
  const known = values.filter((value) => Number.isFinite(value) && value > 0);
  return known.length ? Math.max(...known) : null;
}

function buildMediaOptions(formats = [], duration) {
  const usable = Array.isArray(formats) ? formats : [];
  const audioSizes = usable
    .filter((format) => format.vcodec === 'none' && format.acodec && format.acodec !== 'none')
    .map((format) => estimateFormatBytes(format, duration));
  const bestAudioSize = maxKnown(audioSizes);
  const byHeight = new Map();

  for (const format of usable) {
    const height = Number(format.height);
    if (!Number.isInteger(height) || height < MIN_VIDEO_HEIGHT || height > MAX_VIDEO_HEIGHT) continue;
    if (!format.vcodec || format.vcodec === 'none' || format.vcodec === 'images') continue;
    if (format.ext === 'mhtml' || format.has_drm) continue;
    const entry = byHeight.get(height) || { height, width: null, estimates: [] };
    const width = positiveNumber(format.width);
    if (width) entry.width = Math.max(entry.width || 0, Math.round(width));
    const ownSize = estimateFormatBytes(format, duration);
    if (ownSize) entry.estimates.push(ownSize + (format.acodec === 'none' ? (bestAudioSize || 0) : 0));
    byHeight.set(height, entry);
  }

  const videoOptions = [...byHeight.values()]
    .sort((a, b) => a.height - b.height)
    .map((entry) => ({
      quality: String(entry.height),
      height: entry.height,
      width: entry.width,
      label: entry.width ? `${entry.width}×${entry.height}` : `${entry.height}p`,
      estimated_size: maxKnown(entry.estimates),
    }));
  const bestOption = videoOptions.at(-1) || null;
  const audioOptions = AUDIO_BITRATES.map((bitrate) => ({
    quality: String(bitrate),
    bitrate,
    label: `${bitrate} kbps`,
    estimated_size: estimateAudioBytes(duration, bitrate),
  }));

  return {
    video_options: videoOptions,
    best_video_estimated_size: bestOption?.estimated_size || null,
    audio_options: audioOptions,
  };
}

function buildVideoFormatSelector(quality) {
  if (quality === 'best') return 'bestvideo+bestaudio/best';
  const height = Number(quality);
  if (!Number.isInteger(height) || height < MIN_VIDEO_HEIGHT || height > MAX_VIDEO_HEIGHT) return null;
  return [
    `bestvideo[height=${height}][ext=mp4]+bestaudio[ext=m4a]`,
    `best[height=${height}][ext=mp4]`,
    `bestvideo[height=${height}]+bestaudio`,
    `best[height=${height}]`,
  ].join('/');
}

function isAllowedQuality(format, quality) {
  if (format === 'audio') return AUDIO_BITRATES.includes(Number(quality));
  return quality === 'best' || buildVideoFormatSelector(quality) !== null;
}

module.exports = {
  AUDIO_BITRATES,
  buildMediaOptions,
  buildVideoFormatSelector,
  estimateAudioBytes,
  estimateFormatBytes,
  isAllowedQuality,
};
