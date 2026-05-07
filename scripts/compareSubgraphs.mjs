#!/usr/bin/env node

const STATUS_QUERY = `
  query CompareStatus {
    _meta {
      block {
        number
        hash
      }
      hasIndexingErrors
    }
  }
`

const TOTAL_REWARDS_QUERY = `
  query TotalRewardsList($first: Int!, $skip: Int!) {
    totalRewards(
      first: $first
      skip: $skip
      orderBy: id
      orderDirection: asc
      subgraphError: allow
    ) {
      id
      totalRewards
      totalRewardsWithFees
      mevFee
      feeBasis
      treasuryFeeBasisPoints
      insuranceFeeBasisPoints
      operatorsFeeBasisPoints
      totalFee
      insuranceFee
      operatorsFee
      treasuryFee
      dust
      shares2mint
      sharesToTreasury
      sharesToInsuranceFund
      sharesToOperators
      dustSharesToTreasury
      totalPooledEtherBefore
      totalPooledEtherAfter
      totalSharesBefore
      totalSharesAfter
      timeElapsed
      aprRaw
      aprBeforeFees
      apr
      block
      blockTime
      transactionHash
      transactionIndex
      logIndex
    }
  }
`

const FIRST_TRANSFER_INBOUND_QUERY = `
  query CompareFirstInbound($address: Bytes!) {
    lidoTransfers(
      first: 1
      orderBy: blockTime
      orderDirection: asc
      where: { to: $address }
      subgraphError: allow
    ) {
      id
      block
    }
  }
`

const LIDO_TRANSFERS_INBOUND_QUERY = `
  query CompareTransfersInbound($skip: Int!, $limit: Int!, $address: Bytes!, $block_from: BigInt!) {
    lidoTransfers(
      skip: $skip
      first: $limit
      where: { to: $address, block_gt: $block_from }
      orderBy: blockTime
      orderDirection: asc
      subgraphError: allow
    ) {
      id
      from
      to
      value
      shares
      sharesBeforeDecrease
      sharesAfterDecrease
      sharesBeforeIncrease
      sharesAfterIncrease
      totalPooledEther
      totalShares
      balanceAfterDecrease
      balanceAfterIncrease
      block
      blockTime
      transactionHash
      transactionIndex
      logIndex
    }
  }
`

const LIDO_TRANSFERS_OUTBOUND_QUERY = `
  query CompareTransfersOutbound($skip: Int!, $limit: Int!, $address: Bytes!, $block_from: BigInt!) {
    lidoTransfers(
      skip: $skip
      first: $limit
      where: { from: $address, block_gt: $block_from }
      orderBy: blockTime
      orderDirection: asc
      subgraphError: allow
    ) {
      id
      from
      to
      value
      shares
      sharesBeforeDecrease
      sharesAfterDecrease
      sharesBeforeIncrease
      sharesAfterIncrease
      totalPooledEther
      totalShares
      balanceAfterDecrease
      balanceAfterIncrease
      block
      blockTime
      transactionHash
      transactionIndex
      logIndex
    }
  }
`

// ── UI helpers ────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY
const c = USE_COLOR
  ? { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' }
  : { reset: '', bold: '', dim: '', green: '', red: '', yellow: '' }

const DLINE = '═'.repeat(60)
const SLINE = '─'.repeat(60)

function logHeader(title) {
  console.log(`\n${c.bold}${DLINE}`)
  console.log(`  ${title}`)
  console.log(`${DLINE}${c.reset}`)
}

function logSection(title) {
  const fill = SLINE.slice(title.length + 4)
  console.log(`\n${c.dim}── ${title} ${fill}${c.reset}`)
}

function logOk(msg)   { console.log(`  ${c.green}✔${c.reset}  ${msg}`) }
function logFail(msg) { console.warn(`  ${c.red}✖${c.reset}  ${msg}`) }
function logWarn(msg) { console.warn(`  ${c.yellow}⚠${c.reset}  ${msg}`) }
function logInfo(msg) { console.log(`     ${msg}`) }

// ── CLI entry ─────────────────────────────────────────────────────────────

const [, , prevEndpoint, newEndpoint, ...cliArgs] = process.argv
if (!prevEndpoint || !newEndpoint) {
  console.error(
    'Usage: node scripts/compareSubgraphs.mjs <prev-endpoint> <new-endpoint> [--page-size=1000] [--max-diffs=20] [--address=0x...] [--addresses=0x...,0x...]'
  )
  process.exit(1)
}

const options = parseCliArgs(cliArgs)
const addresses = resolveAddresses(options, process.env.COMPARE_ADDRESSES || process.env.compare_addresses)

logHeader('Subgraph Compare')
logInfo(`prev  ${prevEndpoint}`)
logInfo(`new   ${newEndpoint}`)

logSection('Status')
const status = await compareStatus(prevEndpoint, newEndpoint)
const errPrev = status.prev.hasIndexingErrors ? `${c.red}YES${c.reset}` : 'none'
const errNew  = status.new.hasIndexingErrors  ? `${c.red}YES${c.reset}` : 'none'
logInfo(`prev  block=${status.prev.number}  ${shortHash(status.prev.hash)}  indexing errors: ${errPrev}`)
logInfo(`new   block=${status.new.number}  ${shortHash(status.new.hash)}  indexing errors: ${errNew}`)

const totalRewardsResult = await compareTotalRewards({
  prevEndpoint,
  newEndpoint,
  pageSize: options.pageSize,
  maxDiffs: options.maxDiffs,
})

let hasDifferences = totalRewardsResult.hasDifferences

if (addresses.length === 0) {
  logSection('Transfers')
  logInfo('no addresses provided, skipping transfer comparisons')
} else {
  for (const address of addresses) {
    const addressResult = await compareAddressQueries({
      address,
      prevEndpoint,
      newEndpoint,
      pageSize: options.pageSize,
      maxDiffs: options.maxDiffs,
      prevIndexedBlockNumber: status.prev.number,
    })
    hasDifferences = hasDifferences || addressResult.hasDifferences
  }
}

console.log(`\n${c.bold}${DLINE}${c.reset}`)
if (hasDifferences) {
  console.warn(`  ${c.red}✖  differences found${c.reset}`)
} else {
  console.log(`  ${c.green}✔  all checks passed${c.reset}`)
}
console.log(`${c.bold}${DLINE}${c.reset}\n`)

if (hasDifferences) {
  process.exitCode = 1
}

// ── Comparison logic ──────────────────────────────────────────────────────

async function compareTotalRewards({ prevEndpoint, newEndpoint, pageSize = 1000, maxDiffs = 20 } = {}) {
  logSection('TotalRewards')
  logInfo('fetching...')

  const [prevRecords, newRecords] = await Promise.all([
    fetchAllTotalRewards(prevEndpoint, pageSize),
    fetchAllTotalRewards(newEndpoint, pageSize),
  ])
  logInfo(`prev: ${prevRecords.length} records  new: ${newRecords.length} records`)

  const prevMaxBlock = getMaxBlock(prevRecords)
  const { diffs, countMismatch, allowedExtraNewCount, comparableNewCount } = diffRecords(prevRecords, newRecords, prevMaxBlock)
  const hasDifferences = countMismatch || diffs.length > 0

  if (allowedExtraNewCount > 0) {
    logInfo(`skipping ${allowedExtraNewCount} new-only records beyond block ${prevMaxBlock}`)
  }

  if (!hasDifferences) {
    logOk(`no differences  (${prevRecords.length} records matched)`)
  } else {
    if (countMismatch) {
      logFail(`count mismatch  prev=${prevRecords.length}  comparableNew=${comparableNewCount}  rawNew=${newRecords.length}`)
    }
    if (diffs.length > 0) {
      logFail(`${diffs.length} difference${diffs.length === 1 ? '' : 's'} found  (showing up to ${maxDiffs})`)
      reportDiffs(diffs, maxDiffs)
    }
  }

  return { hasDifferences }
}

async function compareStatus(prevEndpoint, newEndpoint) {
  const [prevData, newData] = await Promise.all([
    executeSubgraphQuery(prevEndpoint, STATUS_QUERY, {}),
    executeSubgraphQuery(newEndpoint, STATUS_QUERY, {}),
  ])

  const prevBlock = prevData?._meta?.block
  const newBlock = newData?._meta?.block
  if (!prevBlock?.number || !prevBlock?.hash) {
    throw new Error(`Prev endpoint ${prevEndpoint} did not return _meta.block`)
  }
  if (!newBlock?.number || !newBlock?.hash) {
    throw new Error(`New endpoint ${newEndpoint} did not return _meta.block`)
  }

  return {
    prev: { number: BigInt(prevBlock.number), hash: prevBlock.hash, hasIndexingErrors: prevData._meta.hasIndexingErrors },
    new:  { number: BigInt(newBlock.number),  hash: newBlock.hash,  hasIndexingErrors: newData._meta.hasIndexingErrors },
  }
}

async function compareAddressQueries({ address, prevEndpoint, newEndpoint, pageSize, maxDiffs, prevIndexedBlockNumber }) {
  logSection(`Address  ${address}`)

  const [prevFirstInbound, newFirstInbound] = await Promise.all([
    fetchFirstInbound(prevEndpoint, address),
    fetchFirstInbound(newEndpoint, address),
  ])

  if (!prevFirstInbound) {
    if (!newFirstInbound) {
      logOk('no inbound transfers on either endpoint')
      return { hasDifferences: false }
    }

    const newFirstBlock = getBlockNumber(newFirstInbound)
    if (newFirstBlock > prevIndexedBlockNumber) {
      logInfo(`skipping new-only history; first inbound block ${newFirstBlock} is beyond prev indexed block ${prevIndexedBlockNumber}`)
      return { hasDifferences: false }
    }

    logFail(`first inbound exists on new at block ${newFirstBlock} but not on prev`)
    return { hasDifferences: true }
  }

  if (!newFirstInbound) {
    logFail('first inbound exists on prev but not on new')
    return { hasDifferences: true }
  }

  let hasDifferences = false

  if (!deepEqual(prevFirstInbound, newFirstInbound)) {
    logWarn(`first inbound mismatch  prev=${JSON.stringify(prevFirstInbound)}  new=${JSON.stringify(newFirstInbound)}`)
    hasDifferences = true
  }

  const fromBlock = getBlockNumber(prevFirstInbound)
  const blockFrom = fromBlock.toString()
  const [prevInbound, newInbound, prevOutbound, newOutbound] = await Promise.all([
    fetchTransfers(prevEndpoint, LIDO_TRANSFERS_INBOUND_QUERY,  'lidoTransfers', { address, block_from: blockFrom }, pageSize),
    fetchTransfers(newEndpoint,  LIDO_TRANSFERS_INBOUND_QUERY,  'lidoTransfers', { address, block_from: blockFrom }, pageSize),
    fetchTransfers(prevEndpoint, LIDO_TRANSFERS_OUTBOUND_QUERY, 'lidoTransfers', { address, block_from: blockFrom }, pageSize),
    fetchTransfers(newEndpoint,  LIDO_TRANSFERS_OUTBOUND_QUERY, 'lidoTransfers', { address, block_from: blockFrom }, pageSize),
  ])

  const inboundResult  = reportCollectionDiff({ label: 'inbound ', prevRecords: prevInbound,  newRecords: newInbound,  prevIndexedBlockNumber, maxDiffs })
  const outboundResult = reportCollectionDiff({ label: 'outbound', prevRecords: prevOutbound, newRecords: newOutbound, prevIndexedBlockNumber, maxDiffs })

  hasDifferences = hasDifferences || inboundResult.hasDifferences || outboundResult.hasDifferences
  return { hasDifferences }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchAllTotalRewards(endpoint, pageSize) {
  let skip = 0
  const results = []

  while (true) {
    const data = await executeSubgraphQuery(endpoint, TOTAL_REWARDS_QUERY, { first: pageSize, skip })
    const page = data.totalRewards || []
    results.push(...page)
    if (page.length < pageSize) break
    skip += pageSize
  }

  return results
}

async function fetchFirstInbound(endpoint, address) {
  const data = await executeSubgraphQuery(endpoint, FIRST_TRANSFER_INBOUND_QUERY, { address })
  return data?.lidoTransfers?.[0] || null
}

async function fetchTransfers(endpoint, query, fieldName, variables, pageSize) {
  let skip = 0
  const results = []

  while (true) {
    const data = await executeSubgraphQuery(endpoint, query, { ...variables, skip, limit: pageSize })
    const page = data[fieldName] || []
    results.push(...page)
    if (page.length < pageSize) break
    skip += pageSize
  }

  return results
}

// ── Diff logic ────────────────────────────────────────────────────────────

function diffRecords(prevRecords, newRecords, prevBlockCutoff) {
  const blockCutoff = prevBlockCutoff ?? getMaxBlock(prevRecords)
  const prevMap = new Map(prevRecords.map((item) => [item.id, item]))
  const newMap  = new Map(newRecords.map((item)  => [item.id, item]))
  const ids = new Set([...prevMap.keys(), ...newMap.keys()])
  const diffs = []
  let allowedExtraNewCount = 0

  for (const id of ids) {
    if (!prevMap.has(id)) {
      const newRecord = newMap.get(id)
      if (newRecord && blockCutoff !== null && getBlockNumber(newRecord) > blockCutoff) {
        allowedExtraNewCount += 1
        continue
      }
      diffs.push({ type: 'missing-prev', id })
      continue
    }

    if (!newMap.has(id)) {
      diffs.push({ type: 'missing-new', id })
      continue
    }

    const prev = prevMap.get(id)
    const next = newMap.get(id)
    if (!deepEqual(prev, next)) {
      diffs.push({ type: 'value-mismatch', id, fields: collectFieldDiffs(prev, next), prev, new: next })
    }
  }

  const comparableNewCount = newRecords.length - allowedExtraNewCount
  const countMismatch = prevRecords.length !== comparableNewCount

  return { diffs, countMismatch, allowedExtraNewCount, comparableNewCount }
}

function reportCollectionDiff({ label, prevRecords, newRecords, prevIndexedBlockNumber, maxDiffs }) {
  const { diffs, comparableNewCount, allowedExtraNewCount } = diffRecords(prevRecords, newRecords, prevIndexedBlockNumber)
  const hasDifferences = diffs.length > 0 || prevRecords.length !== comparableNewCount

  if (allowedExtraNewCount > 0) {
    logInfo(`${label}  skipping ${allowedExtraNewCount} new-only records beyond block ${prevIndexedBlockNumber}`)
  }

  if (!hasDifferences) {
    logOk(`${label}  ${prevRecords.length} records  no differences`)
  } else {
    if (prevRecords.length !== comparableNewCount) {
      logFail(`${label}  count mismatch  prev=${prevRecords.length}  comparableNew=${comparableNewCount}  rawNew=${newRecords.length}`)
    }
    if (diffs.length > 0) {
      logFail(`${label}  ${diffs.length} difference${diffs.length === 1 ? '' : 's'} found  (showing up to ${maxDiffs})`)
      reportDiffs(diffs, maxDiffs)
    }
  }

  return { hasDifferences }
}

function reportDiffs(diffs, maxDiffs) {
  for (const diff of diffs.slice(0, maxDiffs)) {
    printDiff(diff)
  }
  if (diffs.length > maxDiffs) {
    console.warn(`     ${c.dim}… and ${diffs.length - maxDiffs} more${c.reset}`)
  }
}

function printDiff(diff) {
  if (diff.type === 'missing-prev') {
    console.warn(`     ${c.dim}•${c.reset} ${diff.id}  ${c.dim}missing on prev${c.reset}`)
    return
  }
  if (diff.type === 'missing-new') {
    console.warn(`     ${c.dim}•${c.reset} ${diff.id}  ${c.dim}missing on new${c.reset}`)
    return
  }

  console.warn(`     ${c.dim}•${c.reset} ${diff.id}  field mismatch:`)
  for (const field of diff.fields) {
    const col = field.padEnd(24)
    console.warn(`         ${c.dim}${col}${c.reset}  prev ${c.yellow}${JSON.stringify(diff.prev[field])}${c.reset}  →  new ${c.yellow}${JSON.stringify(diff.new[field])}${c.reset}`)
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────

function collectFieldDiffs(prev, next) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const diffFields = []
  for (const key of keys) {
    if (!deepEqual(prev[key], next[key])) {
      diffFields.push(key)
    }
  }
  return diffFields
}

function deepEqual(left, right) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function normalize(value) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalize(item))
    if (normalized.every((item) => item && typeof item === 'object' && 'id' in item)) {
      normalized.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0))
    }
    return normalized
  }
  if (value && typeof value === 'object') {
    const sorted = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalize(value[key])
    }
    return sorted
  }
  return value
}

function getBlockNumber(record) {
  if (!record?.block) {
    throw new Error(`Record ${record?.id || '<unknown>'} is missing block`)
  }
  return BigInt(record.block)
}

function getMaxBlock(records) {
  let maxBlock = null
  for (const record of records) {
    const block = getBlockNumber(record)
    if (maxBlock === null || block > maxBlock) {
      maxBlock = block
    }
  }
  return maxBlock
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

async function executeSubgraphQuery(endpoint, query, variables) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  const responseText = await response.text()
  let payload
  try {
    payload = JSON.parse(responseText)
  } catch {
    throw new Error(
      `Subgraph ${endpoint} returned non-JSON response (${response.status}): ${responseText.slice(0, 500)}`
    )
  }

  if (!response.ok) {
    throw new Error(
      `Subgraph ${endpoint} returned HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 1000)}`
    )
  }

  if (payload.errors?.length && !payload.data) {
    throw new Error(
      `Subgraph ${endpoint} returned GraphQL errors without data: ${formatGraphQLErrors(payload.errors)}`
    )
  }

  if (!payload.data) {
    throw new Error(
      `Subgraph ${endpoint} did not return data. Response: ${JSON.stringify(payload).slice(0, 1000)}`
    )
  }

  return payload.data
}

function formatGraphQLErrors(errors) {
  return errors.map((error) => error.message || JSON.stringify(error)).join(' | ')
}

function parseCliArgs(args) {
  const opts = { pageSize: 1000, maxDiffs: 20, addresses: [] }
  for (const arg of args) {
    if (arg.startsWith('--page-size=')) {
      opts.pageSize = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--max-diffs=')) {
      opts.maxDiffs = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--address=')) {
      opts.addresses.push(arg.split('=')[1])
    } else if (arg.startsWith('--addresses=')) {
      opts.addresses.push(...splitAddresses(arg.split('=')[1]))
    }
  }
  return opts
}

function resolveAddresses(options, envAddresses) {
  const addresses = [...options.addresses, ...splitAddresses(envAddresses)]
  return [...new Set(addresses.map((address) => address.trim().toLowerCase()).filter(Boolean))]
}

function splitAddresses(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
