const fs = require('fs')
const path = require('path')
const { Interface } = require('ethers')
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const argv = yargs(hideBin(process.argv))
  .default('abis', './abis')
  .default('generated', './generated').argv
const abisDir = path.join(__dirname, argv.abis)
const generatedDir = path.join(__dirname, argv.generated)
const abiDirs = fs
  .readdirSync(generatedDir)
  .filter(f => fs.statSync(path.join(generatedDir, f)).isDirectory())
const outFile = path.join(generatedDir, `parserData.ts`)
const processedEvents = []

let imports = 'import { Bytes, TypedMap } from "@graphprotocol/graph-ts"'
let maps = `export const parserMap = new TypedMap<Bytes, string[]>()\n`

for (const abiName of abiDirs) {
  const inFile = path.join(generatedDir, abiName, `${abiName}.ts`)
  const abiFile = path.join(abisDir, `${abiName}.json`)

  if (!fs.existsSync(inFile) || !fs.existsSync(abiFile)) {
    throw new Error(`ABI or generated file for "${abiName} not found!`)
  }

  const genEventRegexp = /export class (\w+) extends ethereum\.Event/gi
  const generatedEvents = Array.from(
    fs.readFileSync(inFile, 'utf8').matchAll(genEventRegexp),
    m => m[1]
  )
  const abiInt = new Interface(JSON.parse(fs.readFileSync(abiFile, 'utf8')))

  abiInt.forEachEvent(event => {
    if (generatedEvents.includes(event.name)) {
      // skip repeated
      if (processedEvents.findIndex(e => e.topic === event.topicHash) === -1) {
        let sameNameIdx = processedEvents.findIndex(e => e.name === event.name)
        let rename = false
        if (sameNameIdx !== -1) {
          processedEvents[sameNameIdx].cast = true
          rename = true
        }
        processedEvents.push({
          topic: event.topicHash,
          name: event.name,
          file: abiName,
          rename: rename,
          types: event.inputs.map(i => i.format()).join(',')
        })
      }
    }
  })
}

// imports += '\nimport { ParsedEvent } from "../src/parser"\n'
// for (const abiName of abiDirs) {
//   imports += `import { ${processedEvents
//     .filter(e => e.file === abiName)
//     .map(e => (e.rename ? `${e.name} as ${e.file + e.name}` : e.name))
//     .join(', ')} } from "./${abiName}/${abiName}"\n`
// }

// let casts = ''
processedEvents.forEach(e => {
  let name = e.rename ? e.file + e.name : e.name
  maps += `parserMap.set(Bytes.fromHexString("${e.topic}"), ["${name}","(${e.types})"])\n`
  //   casts +=
  //     `export function cast${name}(parsed: ParsedEvent): ${name} {\n` +
  //     `    return changetype<${name}>(parsed.event)\n` +
  //     `}\n\n`
})

fs.appendFileSync(outFile, imports + '\n', { flag: 'w' })
fs.appendFileSync(outFile, maps + '\n')
// fs.appendFileSync(outFile, casts + '\n')
