import { createRequestHandler } from "@remix-run/express";
import { installGlobals, type ServerBuild } from "@remix-run/node";
import express from "express";

installGlobals({ nativeFetch: true });

const viteDevServer =
  process.env.NODE_ENV === "production"
    ? undefined
    : await import("vite").then((vite) =>
        vite.createServer({ server: { middlewareMode: true } })
      );

const app = express();
app.use(
  viteDevServer ? viteDevServer.middlewares : express.static("build/client")
);

const build = viteDevServer
  ? () =>
      viteDevServer.ssrLoadModule(
        "virtual:remix/server-build"
      ) as Promise<ServerBuild>
  : ((await import("./build/server/index.js")) as unknown as ServerBuild);

app.get("/health", (_req, res) => res.sendStatus(200));
app.all("*", createRequestHandler({ build }));

const port = parseInt(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Conversion Booster listening on http://localhost:${port}`);
});
