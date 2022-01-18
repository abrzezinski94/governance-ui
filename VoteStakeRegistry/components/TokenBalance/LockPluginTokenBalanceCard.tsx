import { MintInfo } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import useRealm from '@hooks/useRealm'
import { Proposal } from '@solana/spl-governance'
import useWalletStore from '../../../stores/useWalletStore'
import { Option } from '@tools/core/option'
import { GoverningTokenType } from '@solana/spl-governance'
import { fmtMintAmount } from '@tools/sdk/units'
import { getMintMetadata } from '@components/instructions/programs/splToken'
import {
  ArrowsExpandIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/outline'
import Link from 'next/link'
import useQueryContext from '@hooks/useQueryContext'
import Tooltip from '@components/Tooltip'
import { useVoteRegistry } from 'VoteStakeRegistry/hooks/useVoteRegistry'
import {
  DepositWithIdx,
  getUsedDeposit,
} from 'VoteStakeRegistry/utils/voteRegistryTools'
import { useEffect, useState } from 'react'
import DepositCommunityTokensBtn from './DepositCommunityTokensBtn'
import WithDrawCommunityTokens from './WithdrawCommunityTokensBtn'

const LockPluginTokenBalanceCard = ({
  proposal,
}: {
  proposal?: Option<Proposal>
}) => {
  const { fmtUrlWithCluster } = useQueryContext()
  const { councilMint, mint, realm, symbol } = useRealm()
  const isDepositVisible = (
    depositMint: MintInfo | undefined,
    realmMint: PublicKey | undefined
  ) =>
    depositMint &&
    (!proposal ||
      (proposal.isSome() &&
        proposal.value.governingTokenMint.toBase58() === realmMint?.toBase58()))

  const communityDepositVisible =
    // If there is no council then community deposit is the only option to show
    !realm?.account.config.councilMint ||
    isDepositVisible(mint, realm?.account.communityMint)

  const councilDepositVisible = isDepositVisible(
    councilMint,
    realm?.account.config.councilMint
  )

  const hasLoaded = mint || councilMint
  const backLink = fmtUrlWithCluster(`/dao/${symbol}/account`)
    ? fmtUrlWithCluster(`/dao/${symbol}/account`)
    : ''
  return (
    <div className="bg-bkg-2 p-4 md:p-6 rounded-lg">
      <h3 className="mb-4 flex">
        Account
        <Link href={backLink}>
          <a className="text-fgd-3 flex-shrink-0 h-5 w-5 ml-auto cursor-pointer">
            <ArrowsExpandIcon></ArrowsExpandIcon>
          </a>
        </Link>
      </h3>
      {hasLoaded ? (
        <>
          {communityDepositVisible && (
            <TokenDeposit
              mint={mint}
              tokenType={GoverningTokenType.Community}
              councilVote={false}
            />
          )}
          {councilDepositVisible && (
            <div className="mt-4">
              <TokenDeposit
                mint={councilMint}
                tokenType={GoverningTokenType.Council}
                councilVote={true}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="animate-pulse bg-bkg-3 h-12 mb-4 rounded-lg" />
          <div className="animate-pulse bg-bkg-3 h-10 rounded-lg" />
        </>
      )}
    </div>
  )
}

const TokenDeposit = ({
  mint,
  tokenType,
}: {
  mint: MintInfo | undefined
  tokenType: GoverningTokenType
  councilVote?: boolean
}) => {
  const wallet = useWalletStore((s) => s.current)
  const connected = useWalletStore((s) => s.connected)
  const {
    realm,
    realmTokenAccount,
    ownTokenRecord,
    ownCouncilTokenRecord,
    councilTokenAccount,
  } = useRealm()
  const { client } = useVoteRegistry()
  // Do not show deposits for mints with zero supply because nobody can deposit anyway
  if (!mint || mint.supply.isZero()) {
    return null
  }
  const [depositRecord, setDeposit] = useState<DepositWithIdx | null>(null)

  const depositTokenRecord =
    tokenType === GoverningTokenType.Community
      ? ownTokenRecord
      : ownCouncilTokenRecord

  const depositTokenAccount =
    tokenType === GoverningTokenType.Community
      ? realmTokenAccount
      : councilTokenAccount

  const depositMint =
    tokenType === GoverningTokenType.Community
      ? realm?.account.communityMint
      : realm?.account.config.councilMint

  const tokenName = getMintMetadata(depositMint)?.name ?? realm?.account.name

  const depositTokenName = `${tokenName} ${
    tokenType === GoverningTokenType.Community ? '' : 'Council'
  }`

  const handleGetUsedDeposit = async () => {
    const deposit = await getUsedDeposit(
      realm!.pubkey,
      depositTokenRecord!.account.governingTokenMint,
      wallet!.publicKey!,
      client!,
      'none'
    )
    if (deposit) {
      setDeposit(deposit)
    }
  }

  const hasTokensInWallet =
    depositTokenAccount && depositTokenAccount.account.amount.gt(new BN(0))

  const hasTokensDeposited =
    depositRecord && depositRecord.amountDepositedNative.gt(new BN(0))

  const availableTokens =
    depositRecord && mint
      ? fmtMintAmount(mint, depositRecord.amountDepositedNative)
      : '0'

  const canShowAvailableTokensMessage =
    !hasTokensDeposited && hasTokensInWallet && connected
  const canExecuteAction = !hasTokensDeposited ? 'deposit' : 'withdraw'
  const canDepositToken = !hasTokensDeposited && hasTokensInWallet
  const tokensToShow =
    canDepositToken && depositTokenAccount
      ? fmtMintAmount(mint, depositTokenAccount.account.amount)
      : canDepositToken
      ? availableTokens
      : 0

  useEffect(() => {
    if (client && wallet?.connected && depositTokenRecord) {
      handleGetUsedDeposit()
    }
  }, [wallet?.connected, client, depositTokenRecord])

  return (
    <>
      <div className="flex space-x-4 items-center mt-8">
        <div className="bg-bkg-1 px-4 py-2 rounded-md w-full">
          <p className="text-fgd-3 text-xs">{depositTokenName} Votes</p>
          <h3 className="mb-0 py-2 flex items-center">
            {availableTokens}{' '}
            {tokenType === GoverningTokenType.Community && (
              <Tooltip content="Lorem ipsum">
                <div className="rounded-full px-2 py-1 ml-3 border text-xs border-fgd-3 flex">
                  1x
                  <QuestionMarkCircleIcon className="w-4 h-4 ml-1"></QuestionMarkCircleIcon>
                </div>
              </Tooltip>
            )}
          </h3>
        </div>
      </div>

      <p
        className={`mt-2 opacity-70 mb-4 ml-1 text-xs ${
          canShowAvailableTokensMessage ? 'block' : 'hidden'
        }`}
      >
        You have {tokensToShow} tokens available to {canExecuteAction}.
      </p>

      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0 mt-4">
        <DepositCommunityTokensBtn
          afterDepositFcn={() => {
            if (depositTokenRecord) {
              handleGetUsedDeposit()
            }
          }}
        ></DepositCommunityTokensBtn>

        <WithDrawCommunityTokens
          afterWithdrawFcn={handleGetUsedDeposit}
        ></WithDrawCommunityTokens>
      </div>
    </>
  )
}

export default LockPluginTokenBalanceCard
