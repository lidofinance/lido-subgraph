const fetcher = require('./helpers/fetcher')
const Web3 = require('web3')
const fs = require('fs')
const Big = require('big.js')

const LIDO_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
const ABI = JSON.parse(fs.readFileSync('./../abis/Lido.json')).abi

// Make sure to use an archive node!
const rpc = process.env.WEB3_PROVIDER_URI
const address = process.env.ADDRESS

const web3 = new Web3(rpc)
const contract = new web3.eth.Contract(ABI, LIDO_ADDRESS)
const contractFunc = contract.methods.balanceOf(address)

const query = `
query {
	  oracleCompleteds (first: 1000, orderBy: block, orderDirection: asc) {
		block
		blockTime
	  }
	}
`

const balanceFinder = async () => {
  const oracleReports = (await fetcher(query)).oracleCompleteds

  for (let report of oracleReports.reverse()) {
    const balance = await contractFunc.call({}, report.block)
    const humanBalance = Big(balance).div(Big(1e18)).toFixed(8)
    const humanTime = new Date(report.blockTime * 1000).toLocaleDateString(
      'ru-RU'
    )
    console.log(humanTime, humanBalance)
  }
}

balanceFinder()
