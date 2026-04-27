#!/usr/bin/env bash
set -euo pipefail

REGISTRY=${REGISTRY:-ghcr.io/achgithub}
TAG=${TAG:-latest}

docker push "${REGISTRY}/cpi-toolkit-v2-portal:${TAG}"
docker push "${REGISTRY}/cpi-toolkit-v2-api:${TAG}"

echo "Pushed:"
echo "  ${REGISTRY}/cpi-toolkit-v2-portal:${TAG}"
echo "  ${REGISTRY}/cpi-toolkit-v2-api:${TAG}"
