import { gql } from 'graphql-request'
import { getBlock } from './config'
import {
  getAragonEvents,
  getEasyTrackEvents,
  getLidoEvents,
  getLidoOracleEvents,
  getNopRegistryEvents,
  subgraphFetch,
} from './utils'

const SECS_PER_BLOCK = 12
const BLOCKS_RANGE_3HOURS = Math.floor((3 * 60 * 60) / SECS_PER_BLOCK)
const BLOCKS_RANGE_3MONTHS = Math.floor(
  (30 * 24 * 60 * 60 * 3) / SECS_PER_BLOCK
)

const TIMEOUT = 30_000

test(
  'LidoTransfer',
  async () => {
    const query = gql`
      {
        lidoTransfers(first: 1, orderBy: block, orderDirection: desc) {
          id
          transactionHash
          block
        }
      }
    `
    const response = await subgraphFetch(query)
    const transfer = response?.lidoTransfers?.pop()
    expect(transfer).toBeDefined()

    const block = parseInt(transfer.block)
    expect(block >= getBlock() - BLOCKS_RANGE_3HOURS).toBe(true)
    const events = await getLidoEvents('Transfer', block, block)
    const event = events?.find(
      (e) => e.transactionHash == transfer.transactionHash
    )
    expect(event).toBeDefined()
  },
  TIMEOUT
)

test(
  'OracleMember',
  async () => {
    const query = gql`
      {
        oracleMembers(first: 1, orderBy: block, orderDirection: desc) {
          id
          member
          block
        }
      }
    `
    const response = await subgraphFetch(query)
    const member = response?.oracleMembers?.pop()
    expect(member).toBeDefined()

    const block = parseInt(member.block)
    const events = await getLidoOracleEvents('MemberAdded', block, block)
    const event = events?.find(
      (e) => e.args.member.toLowerCase() == member.member.toLowerCase()
    )
    expect(event).toBeDefined()
  },
  TIMEOUT
)

test(
  'NodeOperator',
  async () => {
    const query = gql`
      {
        nodeOperators(first: 1, orderBy: id, orderDirection: desc) {
          id
          name
          block
        }
      }
    `
    const response = await subgraphFetch(query)
    const operator = response?.nodeOperators?.pop()
    expect(operator).toBeDefined()

    const block = parseInt(operator.block)
    const events = await getNopRegistryEvents('NodeOperatorAdded', block, block)
    const event = events?.find((e) => e.args.name == operator.name)

    expect(event).toBeDefined()
  },
  TIMEOUT
)

test(
  'AragonVoting',
  async () => {
    const query = gql`
      {
        votings(first: 1, orderBy: block, orderDirection: desc) {
          id
          creator
          block
        }
      }
    `
    const response = await subgraphFetch(query)
    const voting = response?.votings?.pop()
    expect(voting).toBeDefined()

    const block = parseInt(voting.block)
    expect(block >= getBlock() - BLOCKS_RANGE_3MONTHS).toBe(true)
    const events = await getAragonEvents('StartVote', block, block)
    const event = events?.find(
      (e) => e.args.creator.toLowerCase() == voting.creator.toLowerCase()
    )
    expect(event).toBeDefined()
  },
  TIMEOUT
)

test(
  'EasyTrack',
  async () => {
    const query = gql`
      {
        motions(first: 1, orderBy: block, orderDirection: desc) {
          id
          creator
          block
        }
      }
    `
    const response = await subgraphFetch(query)
    const motion = response?.motions?.pop()
    expect(motion).toBeDefined()

    const block = parseInt(motion.block)
    expect(block >= getBlock() - BLOCKS_RANGE_3MONTHS).toBe(true)
    const events = await getEasyTrackEvents('MotionCreated', block, block)
    const event = events?.find(
      (e) => e.args._creator.toLowerCase() == motion.creator.toLowerCase()
    )

    expect(event).toBeDefined()
  },
  TIMEOUT
)
