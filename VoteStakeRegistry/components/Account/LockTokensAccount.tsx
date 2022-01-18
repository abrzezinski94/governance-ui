import Button from '@components/Button'
import { getMintMetadata } from '@components/instructions/programs/splToken'
import useRealm from '@hooks/useRealm'
import { ProposalState, RpcContext } from '@solana/spl-governance'
import { getUnrelinquishedVoteRecords } from '@models/api'
import { getProposal } from '@solana/spl-governance'
import { withFinalizeVote } from '@solana/spl-governance'
import { withRelinquishVote } from '@solana/spl-governance'
import { BN } from '@project-serum/anchor'
import { TransactionInstruction, Transaction } from '@solana/web3.js'
import { fmtMintAmount } from '@tools/sdk/units'
import { chunks } from '@utils/helpers'
import { sendTransaction } from '@utils/send'
import { useEffect, useState } from 'react'
import useWalletStore from 'stores/useWalletStore'
import LockTokensModal from './LockTokensModal'
import { getProgramVersionForRealm } from '@models/registry/api'
import {
  DepositWithMintPk,
  getUsedDeposits,
  oneDaySeconds,
} from 'VoteStakeRegistry/utils/voteRegistryTools'
import { useVoteRegistry } from 'VoteStakeRegistry/hooks/useVoteRegistry'
import { voteRegistryDeposit } from 'VoteStakeRegistry/actions/voteRegistryDeposit'
import { withVoteRegistryWithdraw } from 'VoteStakeRegistry/actions/withVoteRegistryWithdraw'
import { voteRegistryWithdraw } from 'VoteStakeRegistry/actions/voteRegistryWithdraw'

const LockTokensAccount = () => {
  const wallet = useWalletStore((s) => s.current)
  const connected = useWalletStore((s) => s.connected)
  const connection = useWalletStore((s) => s.connection.current)
  const endpoint = useWalletStore((s) => s.connection.endpoint)
  const { fetchWalletTokenAccounts, fetchRealm } = useWalletStore(
    (s) => s.actions
  )
  const {
    realm,
    realmInfo,
    realmTokenAccount,
    ownTokenRecord,
    proposals,
    governances,
    toManyCommunityOutstandingProposalsForUser,
    mint,
    tokenRecords,
  } = useRealm()
  const [isLockModalOpen, setIsLockModalOpen] = useState(false)
  const {
    client,
    calcMintMultiplier,
    communityMintRegistrar,
  } = useVoteRegistry()
  // Do not show deposits for mints with zero supply because nobody can deposit anyway
  if (!mint || mint.supply.isZero()) {
    return null
  }
  const [depositRecords, setDeposits] = useState<DepositWithMintPk[] | null>(
    null
  )
  const depositTokenRecord = ownTokenRecord

  const depositTokenAccount = realmTokenAccount

  const depositMint = realm?.account.communityMint

  const depositTokens = async function (amount: BN) {
    if (!realm) {
      throw 'No realm selected'
    }
    const hasTokenOwnerRecord =
      typeof tokenRecords[wallet!.publicKey!.toBase58()] !== 'undefined'
    const rpcContext = new RpcContext(
      realm.owner,
      getProgramVersionForRealm(realmInfo!),
      wallet!,
      connection,
      endpoint
    )
    await voteRegistryDeposit({
      rpcContext,
      fromPk: depositTokenAccount!.publicKey,
      mint: depositMint!,
      realmPk: realm.pubkey,
      programId: realm.owner,
      amount,
      hasTokenOwnerRecord,
      client,
    })

    handleGetUsedDeposits()
    await fetchWalletTokenAccounts()
    await fetchRealm(realmInfo!.programId, realmInfo!.realmId)
  }

  const depositAllTokens = async () =>
    await depositTokens(depositTokenAccount!.account.amount)

  const withdrawAllTokens = async function () {
    const instructions: TransactionInstruction[] = []

    // If there are unrelinquished votes for the voter then let's release them in the same instruction as convenience
    if (depositTokenRecord!.account!.unrelinquishedVotesCount > 0) {
      const voteRecords = await getUnrelinquishedVoteRecords(
        connection,
        realmInfo!.programId,
        depositTokenRecord!.account!.governingTokenOwner
      )

      console.log('Vote Records', voteRecords)

      for (const voteRecord of Object.values(voteRecords)) {
        let proposal = proposals[voteRecord.account.proposal.toBase58()]
        if (!proposal) {
          continue
        }

        if (proposal.account.state === ProposalState.Voting) {
          // If the Proposal is in Voting state refetch it to make sure we have the latest state to avoid false positives
          proposal = await getProposal(connection, proposal.pubkey)
          if (proposal.account.state === ProposalState.Voting) {
            const governance =
              governances[proposal.account.governance.toBase58()]
            if (proposal.account.getTimeToVoteEnd(governance.account) > 0) {
              // Note: It's technically possible to withdraw the vote here but I think it would be confusing and people would end up unconsciously withdrawing their votes
              throw new Error(
                `Can't withdraw tokens while Proposal ${proposal.account.name} is being voted on. Please withdraw your vote first`
              )
            } else {
              // finalize proposal before withdrawing tokens so we don't stop the vote from succeeding
              await withFinalizeVote(
                instructions,
                realmInfo!.programId,
                realm!.pubkey,
                proposal.account.governance,
                proposal.pubkey,
                proposal.account.tokenOwnerRecord,
                proposal.account.governingTokenMint
              )
            }
          }
        }

        // Note: We might hit single transaction limits here (accounts and size) if user has too many unrelinquished votes
        // It's not going to be an issue for now due to the limited number of proposals so I'm leaving it for now
        // As a temp. work around I'm leaving the 'Release Tokens' button on finalized Proposal to make it possible to release the tokens from one Proposal at a time
        withRelinquishVote(
          instructions,
          realmInfo!.programId,
          proposal.account.governance,
          proposal.pubkey,
          depositTokenRecord!.pubkey,
          proposal.account.governingTokenMint,
          voteRecord.pubkey,
          depositTokenRecord!.account.governingTokenOwner,
          wallet!.publicKey!
        )
      }
    }
    const mainDeposit = depositRecords!.find(
      (x) =>
        x.lockup.kind.none &&
        x.mint.publicKey.toBase58() ===
          depositTokenRecord!.account.governingTokenMint.toBase58()
    )
    const amount = mainDeposit!.amountDepositedNative

    await withVoteRegistryWithdraw(
      instructions,
      wallet!.publicKey!,
      depositTokenAccount!.publicKey!,
      depositTokenRecord!.account.governingTokenMint,
      realm!.pubkey!,
      amount,
      tokenRecords[wallet!.publicKey!.toBase58()].pubkey!,
      mainDeposit!.index,
      client
    )

    try {
      // use chunks of 8 here since we added finalize,
      // because previously 9 withdraws used to fit into one tx
      const ixChunks = chunks(instructions, 8)
      for (const [index, chunk] of ixChunks.entries()) {
        const transaction = new Transaction().add(...chunk)
        await sendTransaction({
          connection,
          wallet,
          transaction,
          sendingMessage:
            index == ixChunks.length - 1
              ? 'Withdrawing tokens'
              : `Releasing tokens (${index}/${ixChunks.length - 2})`,
          successMessage:
            index == ixChunks.length - 1
              ? 'Tokens have been withdrawn'
              : `Released tokens (${index}/${ixChunks.length - 2})`,
        })
      }
      await fetchWalletTokenAccounts()
      await fetchRealm(realmInfo!.programId, realmInfo!.realmId)
      if (depositTokenRecord) {
        handleGetUsedDeposits()
      }
    } catch (ex) {
      console.error("Can't withdraw tokens", ex)
    }
  }

  const handleGetUsedDeposits = async () => {
    const deposits = await getUsedDeposits(
      realm!.pubkey,
      wallet!.publicKey!,
      depositTokenRecord!.account.governingTokenMint,
      client!,
      connection
    )
    if (deposits) {
      setDeposits(deposits)
    }
  }

  const handleWithDrawFromDeposit = async (depositEntry: DepositWithMintPk) => {
    const rpcContext = new RpcContext(
      realm!.owner,
      getProgramVersionForRealm(realmInfo!),
      wallet!,
      connection,
      endpoint
    )

    await voteRegistryWithdraw(
      rpcContext,
      depositTokenAccount!.publicKey!,
      depositTokenRecord!.account.governingTokenMint,
      realm!.pubkey!,
      depositEntry.amountDepositedNative,
      tokenRecords[wallet!.publicKey!.toBase58()].pubkey!,
      depositEntry.index,
      client
    )
    handleGetUsedDeposits()
  }

  const mainCommunityDepoist = depositRecords?.find(
    (x) =>
      x.mint.publicKey.toBase58() ===
        depositTokenRecord?.account.governingTokenMint.toBase58() &&
      x.lockup.kind.none
  )
  const hasTokensInWallet =
    depositTokenAccount && depositTokenAccount.account.amount.gt(new BN(0))

  const hasTokensDeposited =
    mainCommunityDepoist &&
    mainCommunityDepoist.amountDepositedNative.gt(new BN(0))

  const depositTooltipContent = !connected
    ? 'Connect your wallet to deposit'
    : !hasTokensInWallet
    ? "You don't have any governance tokens in your wallet to deposit."
    : ''

  const withdrawTooltipContent = !connected
    ? 'Connect your wallet to withdraw'
    : !hasTokensDeposited
    ? "You don't have any tokens deposited to withdraw."
    : toManyCommunityOutstandingProposalsForUser
    ? "You don't have any governance tokens to withdraw."
    : ''

  useEffect(() => {
    if (client && connection && depositTokenRecord) {
      handleGetUsedDeposits()
    }
  }, [connection, client, depositTokenRecord])

  const cardLabel = (label, value) => {
    return (
      <div className="flex flex-col w-1/2 p-2">
        <div className="text-xs text-fgd-3">{label}</div>
        <div>{value}</div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="bg-bkg-2 col-span-12 md:order-first order-last p-4 md:p-6 rounded-lg">
        <h1 className="flex mb-8">
          Account
          <div className="ml-auto">
            <Button
              tooltipMessage={depositTooltipContent}
              disabled={!connected || !hasTokensInWallet}
              onClick={depositAllTokens}
            >
              Deposit
            </Button>
            <Button
              className="ml-4"
              tooltipMessage={withdrawTooltipContent}
              disabled={
                !connected ||
                !hasTokensDeposited ||
                toManyCommunityOutstandingProposalsForUser
              }
              onClick={withdrawAllTokens}
            >
              Withdraw
            </Button>
          </div>
        </h1>
        <div className="flex mb-8">
          {depositRecords?.map((x, idx) => {
            const availableTokens = fmtMintAmount(
              x.mint.account,
              x.amountDepositedNative
            )
            const tokenName =
              getMintMetadata(x.mint.publicKey)?.name ||
              x.mint.publicKey.toBase58() ===
                realm?.account.communityMint.toBase58()
                ? realm?.account.name
                : ''

            const depositTokenName = `${tokenName}`
            return (
              <div
                key={idx}
                className="bg-bkg-1 px-4 py-4 pr-16 rounded-md flex flex-col mr-3"
              >
                <p className="text-fgd-3 text-xs">
                  {depositTokenName}{' '}
                  {typeof x.lockup.kind.none !== 'undefined'
                    ? 'Deposited'
                    : 'Locked'}
                </p>
                <h3 className="mb-0">{availableTokens}</h3>
              </div>
            )
          })}
        </div>
        <h1 className="mb-8">Locked Tokens</h1>
        <div className="flex mb-8 flex-wrap">
          {depositRecords
            ?.filter((x) => typeof x.lockup.kind.none === 'undefined')
            ?.map((x, idx) => {
              const availableTokens = fmtMintAmount(
                x.mint.account,
                x.amountDepositedNative
              )
              return (
                <div
                  key={idx}
                  className="border border-bkg-4 w-80 mr-3 rounded-lg mb-3"
                >
                  <div className="bg-bkg-4 px-4 py-4 pr-16 rounded-md flex flex-col">
                    <h3 className="mb-0">{availableTokens}</h3>
                  </div>
                  <div className="p-4 bg-bkg-1 rounded-lg">
                    <div className="flex flex-row flex-wrap">
                      {cardLabel('Type', Object.keys(x.lockup.kind)[0])}
                      {cardLabel(
                        'Initial amount',
                        fmtMintAmount(
                          x.mint.account,
                          x.amountInitiallyLockedNative
                        )
                      )}
                      {cardLabel('Schedule', 'xxx p/m')}
                      {cardLabel(
                        'Vote multiplier',
                        calcMintMultiplier(
                          x.lockup.endTs.sub(x.lockup.startTs).toNumber(),
                          communityMintRegistrar
                        )
                      )}
                      {cardLabel(
                        'Time left',
                        `${
                          x.lockup.endTs.sub(x.lockup.startTs).toNumber() /
                          oneDaySeconds
                        } days`
                      )}
                      {cardLabel(
                        'Available',
                        fmtMintAmount(x.mint.account, x.amountDepositedNative)
                      )}
                    </div>
                    <Button
                      className="w-full mt-4"
                      onClick={() => handleWithDrawFromDeposit(x)}
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              )
            })}
        </div>
        <div className="flex">
          <div className="flex flex-col items-center p-8 rounded-lg bg-bkg-4">
            <div className="flex text-center mb-6">
              Increase your voting power by<br></br> locking your tokens.
            </div>
            <Button onClick={() => setIsLockModalOpen(true)}>
              Lock Tokens
            </Button>
          </div>
        </div>
      </div>
      {isLockModalOpen && (
        <LockTokensModal
          isOpen={isLockModalOpen}
          onClose={() => setIsLockModalOpen(false)}
        ></LockTokensModal>
      )}
    </div>
  )
}

export default LockTokensAccount
