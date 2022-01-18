import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { RpcContext } from '@solana/spl-governance'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN } from '@project-serum/anchor'
import { LockupKinds } from 'VoteStakeRegistry/utils/voteRegistryTools'
import { VsrClient } from '@blockworks-foundation/voter-stake-registry-client'
import { createNewDepositInstructions } from './createNewDepositInstructions'

export const withVoteRegistryDepositInstructions = async ({
  rpcContext,
  //from where we deposit our founds
  fromPk,
  mintPk,
  realmPk,
  programId,
  amount,
  tokenOwnerRecordPk,
  lockUpPeriodInDays,
  lockupKind,
  //force create new means that new deposit will be created regardless of other conditions
  forceCreateNew = false,
  client,
}: {
  rpcContext: RpcContext
  //from where we deposit our founds
  fromPk: PublicKey
  mintPk: PublicKey
  realmPk: PublicKey
  programId: PublicKey
  amount: BN
  tokenOwnerRecordPk: PublicKey | null
  lockUpPeriodInDays: number
  lockupKind: LockupKinds
  forceCreateNew?: boolean
  client?: VsrClient
}) => {
  const { wallet } = rpcContext
  const instructions: TransactionInstruction[] = []
  if (!client) {
    throw 'no vote registry plugin'
  }
  if (!wallet.publicKey) {
    throw 'no wallet connected'
  }
  const {
    instructions: prepareDepositInstructions,
    depositIdx,
    voter,
    registrar,
    voterATAPk,
  } = await createNewDepositInstructions({
    rpcContext,
    mintPk,
    realmPk,
    programId,
    tokenOwnerRecordPk,
    lockUpPeriodInDays,
    lockupKind,
    forceCreateNew,
    client,
  })
  const depositInstruction = client?.program.instruction.deposit(
    depositIdx,
    amount,
    {
      accounts: {
        registrar: registrar,
        voter: voter,
        vault: voterATAPk,
        depositToken: fromPk,
        depositAuthority: wallet!.publicKey!,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    }
  )

  instructions.push(...prepareDepositInstructions, depositInstruction)

  return instructions
}
