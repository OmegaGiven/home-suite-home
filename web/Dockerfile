FROM node:25-alpine
WORKDIR /app
ARG VITE_API_BASE_URL=http://server:8080
ARG VITE_DRAWIO_URL=http://drawio:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DRAWIO_URL=$VITE_DRAWIO_URL
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "preview"]
