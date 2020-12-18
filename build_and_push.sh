#!/bin/bash
source ./.env
set -e +u
set -o pipefail

TAG=${TAG:-"latest"}
IMG="lidofinance/lido-subgraph"
export DOCKER_CONFIG=$HOME/.lidofinance

echo "Building $IMG:$TAG Docker image..."
docker build -t $IMG:$TAG .

echo "Pushing $IMG:$TAG to the Docker Hub"
docker push $IMG:$TAG
