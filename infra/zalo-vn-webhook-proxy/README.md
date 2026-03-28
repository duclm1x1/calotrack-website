# CaloTrack Zalo VN Webhook Proxy

This bundle is the minimum production ingress required for Zalo OA V1 when the
primary n8n host resolves outside Vietnam.

## Goal

Expose one HTTPS endpoint on a **Vietnam public IPv4** and forward raw Zalo
payloads to the canonical n8n webhook:

```text
https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2
```

## Requirements

- A Vietnam-hosted VPS or reverse proxy with public IPv4
- Ports `80` and `443` reachable from the public internet
- A DNS name or A record that resolves to that Vietnam public IPv4
- Docker + Docker Compose

## Files

- `Caddyfile`: HTTPS reverse proxy
- `docker-compose.yml`: one-container deployment
- `.env.example`: host configuration

## Deploy

1. Copy this folder to the Vietnam VPS.
2. Create `.env` from `.env.example`.
3. Set:

```text
ZALO_VN_HOST=<your-vietnam-webhook-host>
```

4. Start the proxy:

```bash
docker compose up -d
```

5. Check health:

```text
https://<your-vietnam-webhook-host>/healthz
```

6. Set the Zalo webhook URL to:

```text
https://<your-vietnam-webhook-host>/webhook/calotrack-zalo-oa-v2
```

## Why this is required

The current local network path is blocked by infrastructure constraints:

- IPv6-only ingress did not pass ACME validation
- the detected public IPv4 path is behind CGNAT and cannot accept inbound `80/443`
- Zalo rejects the current Cloudflare/Vercel endpoints because they geolocate outside Vietnam

This proxy solves the last ingress blocker without changing the downstream n8n
workflow contract.
