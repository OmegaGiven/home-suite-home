# Sweet homeserver deployment

This directory is the production-oriented Docker shape for running Sweet on a homeserver with:

- prebuilt `server` and `web` images
- in-app admin-triggered updates
- persistent storage for PostgreSQL and Sweet files

## How the admin update button works

The `Deployment > Update now` button in Sweet calls the server's admin update endpoint. That endpoint runs the command in `APP_UPDATE_COMMAND`.

In this example:

- the server container mounts the host Docker socket
- the deployment directory is mounted at `/opt/sweet-deploy`
- `/usr/local/bin/update-sweet` runs:

```sh
docker-compose -f /opt/sweet-deploy/docker-compose.yml pull server web
docker-compose -f /opt/sweet-deploy/docker-compose.yml up -d server web
```

That means the app can pull the latest published `server` and `web` images and restart only those services.

## Required setup

1. Copy this directory to your homeserver.
2. Create a `.env` file next to `docker-compose.yml`.
3. Set at minimum:

```env
APP_BASE_URL=https://sweet.example.com
WEB_BASE_URL=https://sweet.example.com
PUBLIC_HOSTNAME=sweet.example.com
JWT_SECRET=replace-me
BOOTSTRAP_EMAIL=admin@example.com
BOOTSTRAP_PASSWORD=replace-me
SWEET_SERVER_IMAGE=ghcr.io/your-org/sweet-server:latest
SWEET_WEB_IMAGE=ghcr.io/your-org/sweet-web:latest
SWEET_RELEASE_LABEL=latest
```

4. Make the updater executable:

```sh
chmod +x update-sweet.sh
```

5. Start the stack:

```sh
docker-compose up -d
```

## Publishing images

The update button only works if newer `server` and `web` images have already been pushed to your registry.

Typical manual publish flow:

```sh
docker build -t ghcr.io/your-org/sweet-server:latest ./server
docker push ghcr.io/your-org/sweet-server:latest

docker build -t ghcr.io/your-org/sweet-web:latest ./web
docker push ghcr.io/your-org/sweet-web:latest
```

If you use versioned tags, update `SWEET_SERVER_IMAGE`, `SWEET_WEB_IMAGE`, and `SWEET_RELEASE_LABEL` in `.env` before triggering the in-app update.

## Security note

Mounting `/var/run/docker.sock` gives the server container Docker control on the host. That is convenient for self-updates, but it is a privileged setup and should only be used on a server you control.
