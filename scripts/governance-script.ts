import fs from 'fs'
import { BinaryWriter, serialize } from 'borsh'

import { Account, AccountInfo, Connection, PublicKey } from '@solana/web3.js'

import {
  deserializeBorsh,
  getGovernanceAccounts,
  getGovernanceSchemaForAccount,
  getRealm,
  Governance,
  GovernanceAccountClass,
  GovernanceAccountType,
  ProgramMetadata,
  Proposal,
  ProposalTransaction,
  pubkeyFilter,
  Realm,
  RealmConfigAccount,
  SignatoryRecord,
  TokenOwnerRecord,
  VoteRecord,
  VoteThreshold,
  VoteThresholdType,
} from '@solana/spl-governance'
import * as anchor from '@project-serum/anchor'
import { VsrClient } from 'VoteStakeRegistry/sdk/client'

import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getAccountsForGovernances } from './governanceAccounts'
import { ConnectionContext } from '@utils/connection'

const { RPC_URL, GOV_PROGRAM_ID, VSR_PROGRAM_ID, REALM_ID, OUT } = process.env

const conn = new Connection(RPC_URL || 'https://api.mainnet-beta.solana.com/')

const connectionContext: ConnectionContext = {
  cluster: 'mainnet',
  endpoint: conn.rpcEndpoint,
  current: conn,
}

const gov = new PublicKey(
  GOV_PROGRAM_ID || 'GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J'
)
const vsr = new PublicKey(
  VSR_PROGRAM_ID || '4Q6WW2ouZ6V3iaNm56MTd5n2tnTm4C5fiH8miFHnAFHo'
)
const realm = new PublicKey(
  REALM_ID || 'DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE'
)

const outDir = OUT || 'out'

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
)

async function findAssociatedTokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        walletAddress.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenMintAddress.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    )
  )[0]
}

function serializeAccount(acc: {
  pubkey: PublicKey
  account: AccountInfo<Buffer>
}): string {
  acc.account.rentEpoch ||= 0
  return JSON.stringify(
    {
      pubkey: acc.pubkey.toString(),
      account: {
        ...acc.account,
        data: [acc.account.data.toString('base64'), 'base64'],
        owner: acc.account.owner.toString(),
        space: acc.account.data.length,
      },
    },
    undefined,
    0
  )
}

function getGovernanceAccountClass(
  type: GovernanceAccountType
): GovernanceAccountClass | undefined {
  switch (type) {
    case GovernanceAccountType.RealmV1:
    case GovernanceAccountType.RealmV2:
      return Realm
    case GovernanceAccountType.TokenOwnerRecordV1:
    case GovernanceAccountType.TokenOwnerRecordV2:
      return TokenOwnerRecord
    case GovernanceAccountType.GovernanceV1:
    case GovernanceAccountType.GovernanceV2:
    case GovernanceAccountType.MintGovernanceV1:
    case GovernanceAccountType.MintGovernanceV2:
    case GovernanceAccountType.ProgramGovernanceV1:
    case GovernanceAccountType.ProgramGovernanceV2:
    case GovernanceAccountType.TokenGovernanceV1:
    case GovernanceAccountType.TokenGovernanceV2:
      return Governance
    case GovernanceAccountType.ProposalV1:
    case GovernanceAccountType.ProposalV2:
      return Proposal
    case GovernanceAccountType.SignatoryRecordV1:
    case GovernanceAccountType.SignatoryRecordV2:
      return SignatoryRecord
    case GovernanceAccountType.VoteRecordV1:
    case GovernanceAccountType.VoteRecordV2:
      return VoteRecord
    case GovernanceAccountType.ProposalInstructionV1:
    case GovernanceAccountType.ProposalTransactionV2:
      return ProposalTransaction
    case GovernanceAccountType.RealmConfig:
      return RealmConfigAccount
    case GovernanceAccountType.ProgramMetadata:
      return ProgramMetadata
  }
}

;(BinaryWriter.prototype as any).writePubkey = function (value: PublicKey) {
  const writer = (this as unknown) as BinaryWriter
  writer.writeFixedArray(value.toBuffer())
}
;(BinaryWriter.prototype as any).writeVoteThreshold = function (
  value: VoteThreshold
) {
  const writer = (this as unknown) as BinaryWriter
  writer.maybeResize()
  writer.buf.writeUInt8(value.type, writer.length)
  writer.length += 1

  // Write value for VoteThresholds with u8 value
  if (
    value.type === VoteThresholdType.YesVotePercentage ||
    value.type === VoteThresholdType.QuorumPercentage
  ) {
    writer.buf.writeUInt8(value.value!, writer.length)
    writer.length += 1
  }
}

async function main() {
  const govProgramAccounts = await conn.getProgramAccounts(gov)
  const vsrProgramAccounts = await conn.getProgramAccounts(vsr)
  console.log(
    'govProgramAccounts',
    govProgramAccounts.length,
    'vsrProgramAccounts',
    vsrProgramAccounts.length
  )

  ensureDir(`${outDir}/${gov.toString()}/accounts`)
  for (const acc of govProgramAccounts) {
    const path = `${outDir}/${gov.toString()}/accounts/${acc.pubkey.toString()}.json`
    const accountType = acc.account.data[0]
    const schema = getGovernanceSchemaForAccount(accountType)
    const accountClass = getGovernanceAccountClass(accountType)
    if (accountClass) {
      const buffer = Buffer.from(acc.account.data)
      const data = deserializeBorsh(schema, accountClass, buffer)
      switch (accountClass) {
        case Governance: {
          const governance = data as Governance
          governance.config.maxVotingTime = 333
          acc.account.data = Buffer.from(serialize(schema, governance))
          // overwrite governance accounts with lower voting time
          fs.writeFileSync(path, serializeAccount(acc))
        }
      }
    } else {
      console.error('could not deduce class for', path, acc.account.data[0])
    }
  }

  const client = await VsrClient.connect(
    anchor.AnchorProvider.local(RPC_URL!),
    vsr
  )

  const registrars = await client.program.account.registrar.all()
  const voters = await client.program.account.voter.all()

  console.log(
    'VSR registrars',
    registrars.length,
    'voters',
    voters.length,
    'realms',
    registrars.map((r) => r.account.realm.toString())
  )

  const tokenAccounts: PublicKey[] = []
  for (const voter of voters) {
    const path = `${outDir}/${vsr.toString()}/accounts/${voter.publicKey.toString()}.json`
    const registrar = registrars.find((r) =>
      r.publicKey.equals(voter.account.registrar)
    )
    const votingMints = (registrar!.account.votingMints as {
      mint: PublicKey
    }[])
      .map((vm) => vm.mint)
      .filter((m) => !PublicKey.default.equals(m))

    for (const mint of votingMints) {
      const voterAta = await findAssociatedTokenAddress(voter.publicKey, mint)
      const walletAta = await findAssociatedTokenAddress(
        voter.account.voterAuthority,
        mint
      )
      tokenAccounts.push(voterAta, walletAta)
    }
  }

  console.log(
    'associated token accounts',
    tokenAccounts.length,
    'unique',
    Array.from(new Set(tokenAccounts)).length
  )

  const realmAcc = await getRealm(conn, realm)
  const governances = await getGovernanceAccounts(
    conn,
    realmAcc.owner,
    Governance,
    [pubkeyFilter(1, realmAcc.pubkey)!]
  )
  const accounts = await getAccountsForGovernances(
    connectionContext,
    realmAcc,
    governances
  )
  const assetAccountsPks = accounts.map((x) => ({
    pubkey: x.pubkey,
    governance: x.governance.pubkey,
  }))
  const bufferAssetAccounts = await conn.getMultipleAccountsInfo(
    assetAccountsPks.map((x) => x.pubkey)
  )
  for (const idx in bufferAssetAccounts) {
    const bufferAccount = bufferAssetAccounts[idx]
    const assetAccountPkWithGov = assetAccountsPks[idx]
    const path = `${outDir}/${assetAccountPkWithGov.governance.toBase58()}/accounts/${assetAccountPkWithGov.pubkey.toBase58()}.json`
    fs.writeFileSync(path, bufferAccount!.data)
  }
  console.log(bufferAssetAccounts)
}

main()
