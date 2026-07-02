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
      pageUrl={pageUrl}
    />
  );
});

export default app;
