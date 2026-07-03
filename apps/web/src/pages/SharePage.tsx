import { Link, ViteClient } from "vite-ssr-components/hono";

type SharePageProps = {
  title: string | null;
  description: string | null;
  videoUrl: string;
  downloadUrl: string;
  pageUrl: string;
};

const DEFAULT_TITLE = "ChainClipで作った動画";

export function SharePage({ title, description, videoUrl, downloadUrl, pageUrl }: SharePageProps) {
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

        <ViteClient />
        <Link href="/src/styles.css" rel="stylesheet" />
      </head>
      <body class="m-0 min-h-dvh bg-white text-neutral-900 font-sans">
        <main class="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-6">
          <video
            class="w-full max-w-md max-h-[80dvh] rounded-xl bg-black ring-1 ring-accent/30"
            src={videoUrl}
            controls
            controlsList="nodownload"
            playsinline
            muted
            autoplay
            loop
          />
          <div class="w-full max-w-md text-center">
            <h1 class="text-lg font-semibold">{pageTitle}</h1>
            {description ? (
              <p class="mt-1 mb-3 whitespace-pre-wrap text-sm text-neutral-500">{description}</p>
            ) : null}
            <a
              href={downloadUrl}
              download
              class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white"
            >
              動画をダウンロード
            </a>
            <p class="mt-3 text-xs font-medium text-accent">Created with ChainClip</p>
          </div>
        </main>
      </body>
    </html>
  );
}
