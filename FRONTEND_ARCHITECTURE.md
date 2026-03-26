# CaloTrack Frontend Architecture

## Canonical Frontend

- Production frontend canonical là `Vite SPA`.
- Entry routes canonical:
  - `/`
  - `/login`
  - `/dashboard`
  - `/admin`
- Public UI, portal và admin phải đi theo React Router trong `src/App.tsx`.

## Legacy / Drift

- `src/app/*` và các Next-style route cũ chỉ là legacy reference.
- Không thêm product logic mới vào `src/app/*`.
- Nếu cần giữ lại các file đó, coi chúng là historical drift cho tới khi được xóa hoặc tách riêng.

## Product Surface Split

- Chat-first layer:
  - Telegram là operational channel mạnh nhất hiện tại.
  - Zalo là next channel để nối workflow riêng trong n8n.
- Web layer:
  - marketing
  - login
  - pricing
  - billing/account portal
  - admin backoffice

## Frontend Principles

- Pricing đọc từ `src/lib/billing.ts`.
- Channel copy và URLs đọc từ `src/lib/siteConfig.ts`.
- Admin actions đi qua `src/lib/adminApi.ts`.
- Theme dùng teal primary, flame accent, large rounded surfaces như main page.
