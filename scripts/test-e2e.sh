#!/bin/bash
echo "Starting Sidecar"
docker run \
    --name durabletask-sidecar -d --rm \
    -p 4001:4001 \
    --env 'DURABLETASK_SIDECAR_LOGLEVEL=Debug' \
    cgillum/durabletask-sidecar:latest start \
    --backend Emulator

echo "Running E2E tests"
npm run test test/e2e

echo "Stopping Sidecar"
docker stop durabletask-sidecar