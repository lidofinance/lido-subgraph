const fs = require('fs')
const path = require('path')
// const { utils: { Interface } } = require('ethers')
const { Interface, EventFragment } = require('@ethersproject/abi')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const argv = yargs(hideBin(process.argv))
  .default('abis', './abis')
  .default('generated', './generated').argv
const abisDir = path.join(__dirname, argv.abis)
const generatedDir = path.join(__dirname, argv.generated)
const abiDirs = fs
  .readdirSync(generatedDir)
  .filter((f) => fs.statSync(path.join(generatedDir, f)).isDirectory())
const outFile = path.join(generatedDir, `parserData.ts`)
const processedEvents = []

console.log('Generating data for parser...')
console.log('Saving to', outFile)

fs.appendFileSync(
  outFile,
  `import { Bytes, TypedMap } from "@graphprotocol/graph-ts"\n` +
    `export const parserMap = new TypedMap<Bytes, string[]>()\n`,
  { flag: 'w' }
)
let maps = ''

for (const abiName of abiDirs) {
  const inFile = path.join(generatedDir, abiName, `${abiName}.ts`)
  const abiFile = path.join(abisDir, `${abiName}.json`)

  if (!fs.existsSync(inFile) || !fs.existsSync(abiFile)) {
    throw new Error(`ABI or generated file for "${abiName} not found!`)
  }

  const genEventRegexp = /export class (\w+) extends ethereum\.Event/gi
  const generatedEvents = Array.from(
    fs.readFileSync(inFile, 'utf8').matchAll(genEventRegexp),
    (m) => m[1]
  )
  // const abiInt = new Interface(JSON.parse(fs.readFileSync(abiFile, 'utf8')))
  const abi = JSON.parse(fs.readFileSync(abiFile, 'utf8'))
  const abiInt = new Interface(abi)

  abiInt.fragments
    .filter((f) => EventFragment.isEventFragment(f))
    .forEach((event) => {
      if (generatedEvents.includes(event.name)) {
        const topicHash = abiInt.getEventTopic(event)
        // skip repeated
        if (processedEvents.findIndex((e) => e.topic === topicHash) === -1) {
          let sameNameIdx = processedEvents.findIndex(
            (e) => e.name === event.name
          )
          let rename = false
          if (sameNameIdx !== -1) {
            processedEvents[sameNameIdx].cast = true
            rename = true
          }
          processedEvents.push({
            topic: topicHash,
            name: event.name,
            file: abiName,
            rename: rename,
            types: event.inputs.map((i) => i.format('minimal')),
          })
        }
      }
    })
}

processedEvents.forEach((e) => {
  let name = e.rename ? e.file + e.name : e.name
  maps += `parserMap.set(Bytes.fromHexString("${e.topic}"), ["${name}",${e.types
    .map((t) => `"${t}"`)
    .join(',')}])\n`
})

fs.appendFileSync(outFile, maps)
console.log('Parser data generated successfully')
console.log()
