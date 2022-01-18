import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { RpcContext } from '@solana/spl-governance'
import { sendTransaction } from 'utils/send'

import { BN } from '@project-serum/anchor'
import { VsrClient } from '@blockworks-foundation/voter-stake-registry-client'
import { withVoteRegistryDepositInstructions } from './withVoteRegistryDepositInstructions'

export const voteRegistryDepositWithoutLockup = async ({
  rpcContext,
  //from where we deposit our founds
  fromPk,
  mintPk,
  realmPk,
  programId,
  amount,
  tokenOwnerRecordPk,
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
  client?: VsrClient
}) => {
  const lockUpPeriodInDays = 0
  const lockupKind = 'none'
  const signers: Keypair[] = []
  const { wallet, connection } = rpcContext
  const instructions: TransactionInstruction[] = []
  await withVoteRegistryDepositInstructions({
    instructions,
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
    client,
  })

  const transaction = new Transaction()
  transaction.add(...instructions)

  await sendTransaction({
    transaction,
    wallet,
    connection,
    signers,
    sendingMessage: `Depositing`,
    successMessage: `Deposit successful`,
  })
}
