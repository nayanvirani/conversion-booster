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

// HTTP Basic Auth for /admin routes
app.use("/admin", (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).send("ADMIN_SECRET is not configured.");
    return;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    const pass = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    if (pass === secret) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Boostify Admin"');
  res.status(401).send("Authentication required.");
});

app.use(
  viteDevServer ? viteDevServer.middlewares : express.static("build/client")
);

const build = viteDevServer
  ? () =>
      viteDevServer.ssrLoadModule(
        "virtual:remix/server-build"
      ) as Promise<ServerBuild>
  : ((await import("./build/server/index.js")) as unknown as ServerBuild);

// Logout endpoint — always returns 401 to clear the browser's cached Basic Auth credentials
app.get("/admin-logout", (_req, res) => {
  res.set("WWW-Authenticate", 'Basic realm="Boostify Admin"');
  res.status(401).send("Logged out.");
});

app.get("/health", (_req, res) => res.sendStatus(200));
app.all("*", createRequestHandler({ build }));

const port = parseInt(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Boostify listening on http://localhost:${port}`);
});
