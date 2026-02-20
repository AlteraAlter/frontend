# Kaufland Frontend

Static web frontend for Kaufland automation workflows:
- upload products from JSON
- check product existence (single EAN or bulk file)
- delete products in bulk
- track progress in real time through WebSockets

## Tech Stack
- Plain HTML/CSS/JavaScript (ES modules)
- No bundler required
- Backend integration via REST + WebSocket

## Project Structure
- `index.html`: main page and modal markup
- `css/main.css`: all styles
- `js/main.js`: app bootstrap on `DOMContentLoaded`
- `js/core/config.js`: API and WebSocket base URLs + endpoint paths
- `js/modules/modals/*`: modal-specific behavior (auth/upload/check/delete)
- `js/ui/fileSelect.js`: shared upload/check/delete request and socket flow
- `js/ui/taskStatus.js`: normalizes backend status messages into UI state
- `js/services/api.js`: REST calls
- `js/services/socket.js`: WebSocket URL + socket creation helpers
- `js/ui/logsPanel.js`: in-app event log panel

## How It Works
1. User authenticates (`/api/token/`) and JWT is stored in `localStorage`.
2. User starts an operation (upload/check/delete).
3. Frontend sends file/data to backend REST endpoint.
4. Frontend subscribes to operation WebSocket channel.
5. Incoming status events update:
- metric cards
- progress bar
- backend response preview
- logs panel

## Local Run
Because this is a static frontend, run it with any static server.

Example with Python:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

## Backend Configuration
Edit `js/core/config.js`:

```js
export const BASE_URL = "http://YOUR_BACKEND_HOST:8050";
export const WS_BASE_URL = "ws://YOUR_BACKEND_HOST:8050";
```

For HTTPS production:
- `BASE_URL` should be `https://...`
- `WS_BASE_URL` should be `wss://...`

## Deployment (Frontend + Backend together)
Recommended production setup:
1. Run backend on localhost (for example `127.0.0.1:8050`) as a service.
2. Serve frontend files with Nginx.
3. Proxy `/api/` and `/ws/` from Nginx to backend.

Minimal Nginx example:

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/kaufland_frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Notes
- If no domain is available, deploy with server IP (`http://IP`, `ws://IP`).
- For public production use, prefer domain + HTTPS/WSS.
