const fs = require('fs')
const Web3 = require('web3')

const rpc = process.env.WEB3_PROVIDER_URI
const web3 = new Web3(rpc)

const nonContractsFinder = async () => {
  const withoutContracts = new Set()
  const withContracts = await fs.promises.readFile('withContracts.json')

  for (adr of JSON.parse(withContracts)) {
    if ((await web3.eth.getCode(adr)) === '0x') {
      withoutContracts.add(adr)
    }
  }

  console.log(withoutContracts.size, ' non-contract addresses of stETH holders')

  await fs.promises.writeFile(
    'nonContracts.json',
    JSON.stringify(Array.from(withoutContracts))
  )
}

nonContractsFinder()
