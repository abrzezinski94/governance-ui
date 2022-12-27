import { useEffect, useMemo, useState } from 'react'
import { pipe } from 'fp-ts/function'
import { matchW, fromTaskOption } from 'fp-ts/TaskEither'
import {
  Proposal,
  ProgramAccount,
  VoteRecord,
  TokenOwnerRecord,
  RpcContext,
  VoteKind,
} from '@solana/spl-governance'

import useRpcContext from '@hooks/useRpcContext'
import { getVoteRecords, getTokenOwnerRecords } from '@models/proposal'
import useRealm from '@hooks/useRealm'
import { buildTopVoters, VoteType } from '@models/proposal'
import { vsrPluginsPks } from './useVotingPlugins'
import useVotePluginsClientStore from 'stores/useVotePluginsClientStore'
import { getVotingPower } from 'VoteStakeRegistry/tools/deposits'
import { BN } from '@project-serum/anchor'
import { PublicKey } from '@blockworks-foundation/mango-client'
import useWalletStore from 'stores/useWalletStore'
import { tryGetRegistrar } from 'VoteStakeRegistry/sdk/api'
import { getRegistrarPDA } from 'VoteStakeRegistry/sdk/accounts'

export { VoteType }

export default function useVoteRecords(proposal?: ProgramAccount<Proposal>) {
  const { getRpcContext } = useRpcContext()
  const [voteRecords, setVoteRecords] = useState<ProgramAccount<VoteRecord>[]>(
    []
  )
  const [tokenOwnerRecords, setTokenOwnerRecords] = useState<
    ProgramAccount<TokenOwnerRecord>[]
  >([])
  const { mint, realm, currentPluginPk } = useRealm()
  const [
    undecidedDepositByVoteRecord,
    setUndecidedDepositByVoteRecord,
  ] = useState<{ [walletPk: string]: BN }>({})

  const [context, setContext] = useState<RpcContext | null>(null)
  const client = useVotePluginsClientStore((s) => s.state.vsrClient)
  const connection = useWalletStore((s) => s.connection)
  const governingTokenMintPk = proposal?.account.governingTokenMint
  const isVsrPluginDao =
    currentPluginPk && vsrPluginsPks.includes(currentPluginPk.toBase58())

  const getLockTokensVotingPowerPerWallet = async (walletsPks: PublicKey[]) => {
    const { registrar } = await getRegistrarPDA(
      realm!.pubkey,
      realm!.account.communityMint,
      client!.program.programId
    )
    const existingRegistrar = await tryGetRegistrar(registrar, client!)
    const votingPowers = await Promise.all(
      walletsPks.map((x) =>
        getVotingPower({
          client: client!,
          registrarPk: registrar,
          existingRegistrar: existingRegistrar!,
          walletPk: x,
          communityMint: realm!.account.communityMint,
          connection: connection.current,
        })
      )
    )
    const votinPowerObj = Object.assign({}, votingPowers)
    const votingPowerByWallets = Object.fromEntries(
      Object.entries(votinPowerObj).map(([k, v]) => [
        walletsPks[k].toBase58(),
        v,
      ])
    )
    setUndecidedDepositByVoteRecord(votingPowerByWallets)
  }
  useEffect(() => {
    if (context && proposal && realm) {
      // fetch vote records
      pipe(
        () =>
          getVoteRecords({
            connection: context.connection,
            programId: context.programId,
            proposalPk: proposal.pubkey,
          }),
        fromTaskOption(() => new Error('Could not fetch vote records')),
        matchW((reason) => {
          console.log(reason)
          setVoteRecords([])
        }, setVoteRecords)
      )()

      // fetch token records
      pipe(
        () =>
          getTokenOwnerRecords({
            governingTokenMint: governingTokenMintPk,
            connection: context.connection,
            programId: context.programId,
            realm: realm.pubkey,
          }),
        fromTaskOption(() => new Error('Could not fetch token records')),
        matchW((reason) => {
          console.log(reason)
          setTokenOwnerRecords([])
        }, setTokenOwnerRecords)
      )()
    }
  }, [context, governingTokenMintPk, proposal, realm])

  useEffect(() => {
    if (isVsrPluginDao && !Object.keys(undecidedDepositByVoteRecord).length) {
      const undecidedData = tokenOwnerRecords.filter(
        (tokenOwnerRecord) =>
          !voteRecords
            .filter((x) => x.account.vote?.voteType !== VoteKind.Veto)
            .some(
              (voteRecord) =>
                voteRecord.account.governingTokenOwner.toBase58() ===
                tokenOwnerRecord.account.governingTokenOwner.toBase58()
            )
      )
      if (undecidedData.length) {
        getLockTokensVotingPowerPerWallet(
          undecidedData.map((x) => x.account.governingTokenOwner)
        )
      }
    }
  }, [tokenOwnerRecords.length, voteRecords.length, isVsrPluginDao])

  useEffect(() => {
    if (realm) {
      setContext(getRpcContext())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO please fix, it can cause difficult bugs. You might wanna check out https://bobbyhadz.com/blog/react-hooks-exhaustive-deps for info. -@asktree
  }, [realm])

  const topVoters = useMemo(() => {
    if (realm && proposal && mint) {
      return buildTopVoters(
        voteRecords,
        tokenOwnerRecords,
        realm,
        proposal,
        mint,
        undecidedDepositByVoteRecord
      )
    }

    return []
  }, [
    voteRecords,
    tokenOwnerRecords,
    realm,
    proposal,
    mint,
    undecidedDepositByVoteRecord,
  ])
  return topVoters
}
