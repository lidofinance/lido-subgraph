import { subgraphFetch, gql } from './utils'

const query = gql`
  query {
    lidoTransfers(
      first: 100000
      where: { sharesAfterDecrease_lt: 0, balanceAfterDecrease_lt: 0 }
    ) {
      id
    }
  }
`

test('there are no transactions going to minus', async () => {
  const lidoTransfers = (await subgraphFetch(query)).lidoTransfers

  expect(lidoTransfers.length).toEqual(0)
})
