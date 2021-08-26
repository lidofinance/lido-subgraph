# Lido Subgraph

Subgraph to index Lido contracts.

## Contracts

- Lido
- Lido Oracle
- Node Operator Registry
- Voting

## Developing

Install dependencies with `yarn` and run `yarn codegen`. Repeat `yarn codegen` after any schema changes or changes affecting generated files.

## Testing

You can test any synced Lido deployment, simply fill an `.env` file and run:

```
yarn test
```

## Deploying

### Locally

Make sure Graph node is running on localhost.

Run `create-local` if Subgraph does not exist yet.
Run `deploy-local` to deploy the Subgraph.

### Production

Build the Docker image and push to Docker using `build_and_push.sh`.

### The Graph

Pushes to master branch will automatically get the Subgraph deployed to The Graph.

## Notes

Please note that it's now advised not to rely on this Subgraph's node operator keys for duplicate key checks. We've hit a technical limitation on withdrawal credentials changes when unused keys are cropped. We can't guarantee cropped keys will be deleted from this Subgraph correctly in the future.
