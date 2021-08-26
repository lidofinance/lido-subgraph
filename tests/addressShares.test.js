import { getTestAddresses, getAddressShares, calculateShares } from './utils'

const ADDRESSES_TO_TEST = 100
// Tweak timeout if this is a long test (many addresses)
const timeout = ADDRESSES_TO_TEST * 0.5 * 1000 // 0.5 sec per addr (to ms)

test(
  'shares of 100 random addresses',
  async () => {
    const addresses = await getTestAddresses(ADDRESSES_TO_TEST)

    for (const address of addresses) {
      // Log will only be shown on test failure via a custom reporter
      console.log(address)

      const realShareAmount = (await getAddressShares(address)).toString()
      const subgraphShareAmount = (await calculateShares(address)).toString()

      expect(subgraphShareAmount).toEqual(realShareAmount)
    }
  },
  timeout
)
