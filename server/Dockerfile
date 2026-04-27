FROM rust:1.91-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    curl \
    git \
 && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release

FROM builder AS whisper-builder
WORKDIR /tmp/whisper.cpp
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git . \
 && cmake -S . -B build -DWHISPER_BUILD_TESTS=OFF -DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8-a \
 && cmake --build build --config Release -j"$(nproc)" --target whisper-cli \
 && ./models/download-ggml-model.sh tiny.en

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    docker-compose \
    docker.io \
    ffmpeg \
    libgomp1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server /usr/local/bin/server
COPY --from=whisper-builder /tmp/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper-builder /tmp/whisper.cpp/models /opt/whisper/models
EXPOSE 8080
CMD ["server"]
