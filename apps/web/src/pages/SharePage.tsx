type SharePageProps = {
  title: string | null;
  description: string | null;
  videoUrl: string;
  pageUrl: string;
};

const DEFAULT_TITLE = "ChainClipで作った動画";

export function SharePage({ title, description, videoUrl, pageUrl }: SharePageProps) {
  const pageTitle = title ?? DEFAULT_TITLE;
  const pageDescription = description ?? "ChainClipで作成した動画です。";

  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle} - ChainClip</title>
        <meta name="description" content={pageDescription} />

        <meta property="og:type" content="video.other" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:video" content={videoUrl} />
        <meta property="og:video:type" content="video/mp4" />
        <meta name="twitter:card" content="player" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />

        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="m-0 min-h-dvh bg-neutral-950 text-neutral-100 font-sans [color-scheme:dark]">
        <main class="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-6">
          <video
            class="w-full max-w-md max-h-[80dvh] rounded-xl bg-black"
            src={videoUrl}
            controls
            playsinline
            muted
            autoplay
            loop
          />
          <div class="w-full max-w-md text-center">
            <h1 class="text-lg font-semibold">{pageTitle}</h1>
            {description ? (
              <p class="mt-1 mb-3 whitespace-pre-wrap text-sm text-neutral-400">{description}</p>
            ) : null}
            <p class="text-xs text-neutral-500">Created with ChainClip</p>
          </div>
        </main>
      </body>
    </html>
  );
}
