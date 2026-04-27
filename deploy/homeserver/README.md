# Home Suite Home homeserver deployment

This directory is the production-oriented Docker shape for running Home Suite Home on a homeserver with:

- prebuilt `server` and `web` images
- in-app admin-triggered updates
- persistent storage for PostgreSQL and Home Suite Home files

## How the admin update button works

The `Deployment > Update now` button in Home Suite Home calls the server's admin update endpoint. That endpoint runs the command in `APP_UPDATE_COMMAND`.

In this example:

- the server container mounts the host Docker socket
- the deployment directory is mounted at `/opt/home-suite-home-deploy`
- `/usr/local/bin/update-home-suite-home` runs:

```sh
docker compose -f /opt/home-suite-home-deploy/docker-compose.yml pull server web
docker compose -f /opt/home-suite-home-deploy/docker-compose.yml up -d server web
```

That means the app can pull the latest published `server` and `web` images and restart only those services.

## Required setup

1. Copy this directory to your homeserver.
2. Create a `.env` file next to `docker-compose.yml`.
3. Set at minimum:

```env
APP_BASE_URL=https://home-suite-home.example.com
WEB_BASE_URL=https://home-suite-home.example.com
DRAWIO_PUBLIC_URL=https://home-suite-home.example.com:4175
PUBLIC_HOSTNAME=home-suite-home.example.com
JWT_SECRET=replace-me
BOOTSTRAP_EMAIL=admin@example.com
BOOTSTRAP_PASSWORD=replace-me
HSH_SERVER_IMAGE=ghcr.io/your-org/home-suite-home-server:latest
HSH_WEB_IMAGE=ghcr.io/your-org/home-suite-home-web:latest
HSH_RELEASE_LABEL=latest
HSH_SERVER_HOST_PORT=18093
HSH_WEB_HOST_PORT=14173
HSH_DRAWIO_HOST_PORT=18083
```

4. Make the updater executable:

```sh
chmod +x update-home-suite-home.sh
```

5. Start the stack:

```sh
docker compose up -d
```

## Recommended reverse proxy shape

Use one public origin for the browser app and proxy the private host ports from this stack:

- `/` -> `127.0.0.1:${HSH_WEB_HOST_PORT:-14173}`
- `/api/*` -> `127.0.0.1:${HSH_SERVER_HOST_PORT:-18093}`
- `/ws/*` -> `127.0.0.1:${HSH_SERVER_HOST_PORT:-18093}`

Expose draw.io on its own public URL instead of trying to proxy it under `/drawio`. The official `jgraph/drawio` image does not behave reliably under a simple subpath reverse proxy.

With this shape, the published web image does not need a machine-specific API base URL. It uses the same public origin by default and talks to the backend through `/api` and `/ws`, while draw.io is discovered at runtime from `DRAWIO_PUBLIC_URL`.

Example Caddy shape:

```caddy
home-suite-home.example.com:4174 {
    tls {
        get_certificate tailscale
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:18093
    }

    handle /ws/* {
        reverse_proxy 127.0.0.1:18093
    }

    handle {
        reverse_proxy 127.0.0.1:14173
    }
}

home-suite-home.example.com:4175 {
    tls {
        get_certificate tailscale
    }

    reverse_proxy 127.0.0.1:18083
}
```

If you are not using Tailscale TLS and instead terminate TLS on the standard HTTPS port, the same split still applies:

```caddy
home-suite-home.example.com {
    handle /api/* {
        reverse_proxy 127.0.0.1:18093
    }

    handle /ws/* {
        reverse_proxy 127.0.0.1:18093
    }

    handle {
        reverse_proxy 127.0.0.1:14173
    }
}

drawio.home-suite-home.example.com {
    reverse_proxy 127.0.0.1:18083
}
```

## Publishing images

The update button only works if newer `server` and `web` images have already been pushed to your registry.

Typical manual publish flow:

```sh
docker build -t ghcr.io/your-org/home-suite-home-server:latest ./server
docker push ghcr.io/your-org/home-suite-home-server:latest

docker build -t ghcr.io/your-org/home-suite-home-web:latest ./web
docker push ghcr.io/your-org/home-suite-home-web:latest
```

If you use versioned tags, update `HSH_SERVER_IMAGE`, `HSH_WEB_IMAGE`, and `HSH_RELEASE_LABEL` in `.env` before triggering the in-app update.

## Security note

Mounting `/var/run/docker.sock` gives the server container Docker control on the host. That is convenient for self-updates, but it is a privileged setup and should only be used on a server you control.
