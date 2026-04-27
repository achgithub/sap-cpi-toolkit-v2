#!/usr/bin/env bash
set -euo pipefail

REGISTRY=${REGISTRY:-ghcr.io/achgithub}
TAG=${TAG:-latest}

docker build -f Dockerfile.portal -t "${REGISTRY}/cpi-toolkit-v2-portal:${TAG}" .
docker build -f Dockerfile.api    -t "${REGISTRY}/cpi-toolkit-v2-api:${TAG}"    .

echo "Built:"
echo "  ${REGISTRY}/cpi-toolkit-v2-portal:${TAG}"
echo "  ${REGISTRY}/cpi-toolkit-v2-api:${TAG}"
