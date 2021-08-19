# Lido Subgraph

Subgraph to index Lido contracts.

## Contracts

- Lido
- Lido Oracle
- Node Operator Registry
- Voting
- Easytrack

## Developing

Install dependencies with `yarn` and run `yarn codegen`. Repeat `yarn codegen` after any schema changes or changes affecting generated files.

## Deploying

### Locally

Make sure Graph node is running on localhost.

Run `create-local` if Subgraph does not exist yet.
Run `deploy-local` to deploy the Subgraph.

### Production

Build the Docker image and push to Docker using `build_and_push.sh`.

### The Graph

Pushes to master branch will automatically get the Subgraph deployed to The Graph.
