import { Hono } from "hono";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SharePage } from "./pages/SharePage";

type Bindings = {
  API_BASE_URL: string;
};

type ShareApiResponse = {
  projectId: string;
  title: string | null;
  description: string | null;
  videoUrl: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("ChainClip"));

app.get("/s/:shareSlug", async (c) => {
  const shareSlug = c.req.param("shareSlug");
  const apiRes = await fetch(`${c.env.API_BASE_URL}/share/${shareSlug}`);

  if (!apiRes.ok) {
    return c.html(<NotFoundPage />, 404);
  }

  const data = (await apiRes.json()) as ShareApiResponse;
  const pageUrl = new URL(c.req.url).toString();

  return c.html(
    <SharePage
      title={data.title}
      description={data.description}
      videoUrl={data.videoUrl}
      downloadUrl={`/s/${shareSlug}/download`}
      pageUrl={pageUrl}
    />
  );
});

app.get("/s/:shareSlug/download", async (c) => {
  const shareSlug = c.req.param("shareSlug");
  const apiRes = await fetch(`${c.env.API_BASE_URL}/share/${shareSlug}`);

  if (!apiRes.ok) {
    return c.notFound();
  }

  const data = (await apiRes.json()) as ShareApiResponse;
  const videoRes = await fetch(data.videoUrl);

  if (!videoRes.ok || !videoRes.body) {
    return c.notFound();
  }

  const filename = `${data.title ?? "chainclip"}.mp4`;
  const headers = new Headers();
  headers.set("Content-Type", videoRes.headers.get("Content-Type") ?? "video/mp4");
  const contentLength = videoRes.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set(
    "Content-Disposition",
    `attachment; filename="chainclip.mp4"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  return new Response(videoRes.body, { headers });
});

export default app;
