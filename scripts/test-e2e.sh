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

# It should fail if the npm run fails
if [ $? -ne 0 ]; then
    echo "E2E tests failed"
    exit 1
fi

echo "Stopping Sidecar"
docker stop durabletask-sidecar