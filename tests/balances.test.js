import {
  lidoFuncCall,
  getTestAddresses,
  loadAddressShares,
  getTotals,
} from './utils/index.js'
import { BigNumber } from 'ethers'

const ADDRESSES_TO_TEST = 30
const timePerAddress = 5 // seconds
const timeout = ADDRESSES_TO_TEST * timePerAddress * 1000 // in ms

test(
  'balances',
  async () => {
    const addresses = await getTestAddresses(ADDRESSES_TO_TEST)

    for (const address of addresses) {
      // Log will only be shown on test failure via a custom reporter
      console.log(address)

      const { totalPooledEther, totalShares } = await getTotals(address)

      const shares = await loadAddressShares(address)

      const subgraphBalance = BigNumber.from(shares)
        .mul(totalPooledEther)
        .div(totalShares)
        .toString()
      const realBalance = (await lidoFuncCall('balanceOf', address)).toString()

      expect(subgraphBalance).toEqual(realBalance)
    }
  },
  timeout
)
