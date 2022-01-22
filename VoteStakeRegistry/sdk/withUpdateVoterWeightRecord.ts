import { VsrClient } from '@blockworks-foundation/voter-stake-registry-client'
import {
  ProgramAccount,
  Realm,
  SYSTEM_PROGRAM_ID,
} from '@solana/spl-governance'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import {
  getRegistrarPDA,
  getVoterPDA,
  getVoterWeightPDA,
} from 'VoteStakeRegistry/utils/voteRegistryTools'

export const withUpdateVoterWeightRecord = async (
  instructions: TransactionInstruction[],
  walletPk: PublicKey,
  realm: ProgramAccount<Realm>,
  vsrClient?: VsrClient
) => {
  //if no plugin then we dont do anything
  if (!realm.account.config.useCommunityVoterWeightAddin) {
    return
  }
  if (!vsrClient) {
    throw 'no vote registry plugin'
  }
  const clientProgramId = vsrClient!.program.programId

  //TODO support both mints for now only community is supported
  const { registrar } = await getRegistrarPDA(
    realm.pubkey,
    realm.account.communityMint,
    vsrClient!.program.programId
  )
  const { voter } = await getVoterPDA(registrar, walletPk, clientProgramId)
  const { voterWeightPk } = await getVoterWeightPDA(
    registrar,
    walletPk,
    clientProgramId
  )

  instructions.push(
    vsrClient.program.instruction.updateVoterWeightRecord({
      accounts: {
        registrar,
        voter,
        voterWeightRecord: voterWeightPk,
        systemProgram: SYSTEM_PROGRAM_ID,
      },
    })
  )
  return voterWeightPk
}
