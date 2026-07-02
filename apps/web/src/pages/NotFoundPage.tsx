export function NotFoundPage() {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>見つかりません - ChainClip</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body class="m-0 flex min-h-dvh flex-col items-center justify-center gap-2 bg-white px-6 text-center text-neutral-900 font-sans">
        <p class="text-sm font-medium text-accent">ChainClip</p>
        <p class="text-neutral-500">動画が見つかりませんでした。まだ準備中か、URLが間違っている可能性があります。</p>
      </body>
    </html>
  );
}
