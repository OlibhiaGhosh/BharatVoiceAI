import { Document } from "@langchain/core/documents";
import { Innertube, Log } from "youtubei.js";

// youtubei.js logs a parser warning for every unrecognised renderer YouTube ships.
// Those are harmless for transcript extraction and drown the Fastify log.
Log.setLevel(Log.Level.NONE);

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 20_000;

export type YoutubeSourceResult = {
  documents: Document[];
  transcriptAvailable: boolean;
  notes?: string;
};

type CaptionTrack = {
  base_url?: string;
  language_code?: string;
  kind?: string;
  name?: { text?: string };
};

/** youtubei.js has no request timeout of its own, so bound every call we make through it. */
function withTimeout<T>(work: Promise<T>, message: string, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function timedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export function parseYoutubeVideoId(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) {
    throw new Error("A YouTube URL is required for YouTube ingestion.");
  }
  if (VIDEO_ID_PATTERN.test(value)) {
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error(`"${rawUrl}" is not a valid URL. Use a link such as https://www.youtube.com/watch?v=VIDEO_ID.`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  let candidate = "";
  if (host === "youtu.be") {
    candidate = segments[0] ?? "";
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (segments[0] === "watch") {
      candidate = parsed.searchParams.get("v") ?? segments[1] ?? "";
    } else if (["shorts", "embed", "live", "v", "e"].includes(segments[0] ?? "")) {
      candidate = segments[1] ?? "";
    } else {
      candidate = parsed.searchParams.get("v") ?? "";
    }
  } else {
    throw new Error("Only youtube.com and youtu.be links can be ingested as a YouTube source.");
  }

  if (!VIDEO_ID_PATTERN.test(candidate)) {
    throw new Error(
      "No video id was found in that YouTube link. Use a single video URL such as https://www.youtube.com/watch?v=VIDEO_ID (playlists and channels are not supported).",
    );
  }
  return candidate;
}

let clientPromise: Promise<Innertube> | null = null;

async function getYoutubeClient() {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      lang: "en",
      location: "IN",
    }).catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function normalizeTranscript(value: string) {
  return value
    .replace(/\[(music|applause|laughter|inaudible|foreign)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function languageDisplayName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Rank caption tracks: exact language first, then the base language, then English, then anything. */
function rankCaptionTracks(tracks: CaptionTrack[], language: string) {
  const requested = language.toLowerCase();
  const base = requested.split("-")[0];

  return [...tracks]
    .filter((track) => Boolean(track.base_url))
    .map((track) => {
      const code = (track.language_code ?? "").toLowerCase();
      const isAutomatic = track.kind === "asr";
      let score = 0;
      if (code === requested) {
        score = 4;
      } else if (code.split("-")[0] === base) {
        score = 3;
      } else if (code.split("-")[0] === "en") {
        score = 2;
      } else {
        score = 1;
      }
      return { track, score: isAutomatic ? score - 0.5 : score };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.track);
}

function parseJson3Captions(payload: string) {
  const parsed = JSON.parse(payload) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
  return (parsed.events ?? [])
    .flatMap((event) => event.segs ?? [])
    .map((segment) => segment.utf8 ?? "")
    .join("");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseXmlCaptions(payload: string) {
  const matches = [...payload.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  return matches
    .map(([, inner]) =>
      // Strip nested markup (<br/>, <i>) before decoding, otherwise decoded
      // entities such as &amp;lt;agent&amp;gt; would be mistaken for tags and dropped.
      // YouTube double-escapes this payload, hence the second decode pass.
      decodeHtmlEntities(decodeHtmlEntities(inner.replace(/<[^>]+>/g, " "))),
    )
    .join(" ");
}

/** Strategy 1: the transcript panel exposed by the watch page. */
async function readTranscriptPanel(info: Awaited<ReturnType<Innertube["getInfo"]>>, language: string) {
  let transcriptInfo = await withTimeout(info.getTranscript(), "The YouTube transcript request timed out.");
  const preferredName = languageDisplayName(language.split("-")[0]).toLowerCase();
  const available = transcriptInfo?.languages ?? [];
  const match = available.find((name) => String(name).toLowerCase().includes(preferredName));

  if (match && typeof transcriptInfo?.selectLanguage === "function") {
    try {
      transcriptInfo = await transcriptInfo.selectLanguage(match);
    } catch {
      // Keep the default track when the alternate language cannot be selected.
    }
  }

  const segments = transcriptInfo?.transcript?.content?.body?.initial_segments ?? [];
  return normalizeTranscript(segments.map((segment) => segment.snippet?.text ?? "").join(" "));
}

/** Strategy 2: the timedtext caption tracks attached to the player response. */
async function readCaptionTracks(tracks: CaptionTrack[], language: string) {
  let throttled = false;

  for (const track of rankCaptionTracks(tracks, language)) {
    for (const format of ["&fmt=json3", ""]) {
      try {
        const response = await timedFetch(`${track.base_url}${format}`);
        if (response.status === 429 || response.status === 403) {
          throttled = true;
          continue;
        }
        if (!response.ok) {
          continue;
        }
        const payload = await response.text();
        if (!payload.trim()) {
          // A 200 with an empty body is how YouTube refuses caption downloads it does not trust.
          throttled = true;
          continue;
        }
        const text = normalizeTranscript(
          format ? parseJson3Captions(payload) : parseXmlCaptions(payload),
        );
        if (text.length > 40) {
          return { text, throttled: false };
        }
      } catch {
        // Try the next format/track.
      }
    }
  }
  return { text: "", throttled };
}

function buildMetadataText(basicInfo: Record<string, unknown>) {
  const description = String(basicInfo.short_description ?? "").trim();
  const keywords = Array.isArray(basicInfo.keywords) ? basicInfo.keywords.map(String) : [];
  const duration = Number(basicInfo.duration ?? 0);

  return [
    `Video title: ${String(basicInfo.title ?? "").trim()}`,
    basicInfo.author ? `Channel: ${String(basicInfo.author).trim()}` : "",
    duration ? `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s` : "",
    description ? `Description: ${description}` : "",
    keywords.length ? `Topics: ${keywords.slice(0, 15).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadYoutubeSource(url: string, language: string): Promise<YoutubeSourceResult> {
  const videoId = parseYoutubeVideoId(url);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const client = await withTimeout(getYoutubeClient(), "Could not start a YouTube session. Check the network and try again.");

  let info: Awaited<ReturnType<Innertube["getInfo"]>>;
  try {
    info = await withTimeout(client.getInfo(videoId), "YouTube did not respond in time. Check the network and try again.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/private|unavailable|not exist|removed|age/i.test(message)) {
      throw new Error("That video is private, age restricted, or unavailable, so it cannot be ingested.");
    }
    throw new Error(`YouTube could not be reached for that video (${message}). Try again, or paste the content manually.`);
  }

  const basicInfo = (info.basic_info ?? {}) as Record<string, unknown>;
  const title = String(basicInfo.title ?? "").trim() || watchUrl;
  const author = String(basicInfo.author ?? "").trim();
  const captionTracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];

  let transcript = "";
  try {
    transcript = await readTranscriptPanel(info, language);
  } catch {
    // The transcript panel is frequently unavailable; caption tracks are the fallback.
  }
  let throttled = false;
  if (!transcript && captionTracks.length) {
    const captions = await readCaptionTracks(captionTracks, language);
    transcript = captions.text;
    throttled = captions.throttled;
  }

  const metadataText = buildMetadataText(basicInfo);
  const metadata = {
    title,
    source: watchUrl,
    videoId,
    author,
    contentType: transcript ? "transcript" : "video-metadata",
  };

  if (transcript) {
    return {
      documents: [
        new Document({
          pageContent: `${metadataText}\n\nTranscript: ${transcript}`,
          metadata,
        }),
      ],
      transcriptAvailable: true,
    };
  }

  if (metadataText.length < 120) {
    throw new Error(
      `No captions are available for "${title}" and it has no usable description. YouTube blocks transcript downloads for some videos and networks. Pick a video with captions, or add the content manually.`,
    );
  }

  return {
    documents: [
      new Document({
        pageContent: metadataText,
        metadata,
      }),
    ],
    transcriptAvailable: false,
    notes: throttled
      ? "YouTube blocked the caption download from this network, so only the title, description, and topics were stored. Retry later or from another network to capture the full transcript."
      : captionTracks.length
        ? "The captions on this video could not be read, so only the title, description, and topics were stored."
        : "This video has no captions, so only the title, description, and topics were stored.",
  };
}
