import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function resolveVerifierPath(req: any) {
  const urlPath = String(req.url || "").split("?")[0];
  const fileName = path.basename(urlPath);
  if (!/^zalo_verifier[\w-]+\.html$/i.test(fileName)) {
    return null;
  }
  return path.resolve(process.cwd(), "public", fileName);
}

export default async function handler(req: any, res: any) {
  const verifierPath = resolveVerifierPath(req);
  if (!verifierPath || !existsSync(verifierPath)) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("not_found");
    return;
  }

  const html = readFileSync(verifierPath);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300");
  res.end(html);
}
