import { gql } from 'graphql-request'
import { subgraphFetch } from './utils/index.js'

const dustNullQuery = gql`
  query ($first: Int, $skip: Int, $block: Block_height) {
    totalRewards(
      first: $first
      skip: $skip
      block: $block
      where: { dust: null }
    ) {
      id
      block
    }
  }
`

test('there is no rewards with null dust', async () => {
  const totalRewards = (await subgraphFetch(dustNullQuery)).totalRewards

  expect(totalRewards).toEqual([])
})

// If we chose a wrong dust boundary, dust can be mistaken as treasury fee
const dustBoundaryQuery = gql`
  query ($first: Int, $skip: Int, $block: Block_height) {
    totalRewards(
      first: $first
      skip: $skip
      block: $block
      where: { dust: 0, treasuryFee_not: null }
    ) {
      id
      block
    }
  }
`

test('there is no mismatched dust transactions', async () => {
  const totalRewards = (await subgraphFetch(dustBoundaryQuery)).totalRewards

  expect(totalRewards).toEqual([])
})
